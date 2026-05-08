import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github-dark.min.css';
import hljs from 'highlight.js';
import { Paperclip, Send, Cpu, Loader2, Mic, Volume2, VolumeX, Download, Upload, Settings, X, Plus, Trash2, FileText, BookOpen } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { detectEngine, type EngineType } from './engineDetector';

import { get, set } from 'idb-keyval';
import { Virtuoso } from 'react-virtuoso';
import WorkerWebGPU from './worker?worker';
import WorkerWASM from './worker-wasm?worker';

declare global {
  interface Window {
    showSaveFilePicker?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

DOMPurify.addHook('afterSanitizeAttributes', function(node) {
  if ('target' in node) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

interface Message {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  isMarkdown: boolean;
  timestamp: string;
  action?: string; // Optional property for UI actions like retail worker
}

interface Skill {
  id: string;
  name: string;
  prompt: string;
}

const MarkdownMessage = React.memo(({ text }: { text: string }) => {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const parse = async () => {
      try {
        setLoading(true);
        const parsed = await marked.parse(text, { async: true });
        const cleanHover = DOMPurify.sanitize(parsed);
        if (isMounted) {
          setHtml(cleanHover);
          setLoading(false);
        }
      } catch (e) {
        if (isMounted) {
          setHtml(text);
          setLoading(false);
        }
      }
    };
    parse();
    return () => { isMounted = false; };
  }, [text]);

  useEffect(() => {
    if (html && !loading && contentRef.current) {
      contentRef.current.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [html, loading]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 w-full animate-pulse mt-1">
        <div className="h-4 bg-white/10 rounded-md w-full"></div>
        <div className="h-4 bg-white/10 rounded-md w-5/6"></div>
        <div className="h-4 bg-white/10 rounded-md w-4/6"></div>
      </div>
    );
  }

  return <div ref={contentRef} className="markdown-body text-[0.95rem] leading-[1.4]" dangerouslySetInnerHTML={{ __html: html }} />;
});

interface LLMModel {
  id: string;
  name: string;
  description?: string;
}

const DEFAULT_PROMPT = `You are Stan, a personal AI assistant who runs entirely on the user's device. Your job is to help the user complete tasks accurately, privately, and conversationally.

## Rules (your employee handbook)
- Always be warm, professional, and concise. Use natural language; never sound robotic.
- Never invent facts. If you don't know something, say so honestly.
- Protect privacy: never ask for or store sensitive personal identifiers unless the user explicitly asks you to save them.
- Before using any tool that changes state (e.g., save_note), ask the user to confirm.
- If a tool fails, explain what happened in plain language and suggest an alternative.
- If the user's request is unclear, ask one clarifying question at a time.`;

const DEFAULT_SKILLS: Skill[] = [
  { id: '1', name: 'General Assistant', prompt: DEFAULT_PROMPT },
  { id: '2', name: 'Lead Qualifier', prompt: "You are Stan, a lead qualifying assistant. Your goal is to gather the user's name, company size, and primary use case before continuing the conversation." },
  { id: '3', name: 'Intake Assistant', prompt: "You are Stan, a client intake assistant. Collect the user's project requirements, timeline, and budget, then save them into your notes." }
];

const STAN_MODEL_ID = 'functiongemma-270m-it'
const STAN_MODEL_NAME = 'FunctionGemma 270M'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState('Waiting for model selection...');
  const [isSpinning, setIsSpinning] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadText, setDownloadText] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [modelLoadStarted, setModelLoadStarted] = useState(false);
  const [engine, setEngine] = useState<EngineType | null>(null);

  const [deviceTooWeak, setDeviceTooWeak] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const detected = await detectEngine();
      setEngine(detected);
      
      const mem = (navigator as any).deviceMemory;
      const cores = navigator.hardwareConcurrency;
      if ((mem && mem < 2) || (cores && cores < 4)) {
        setDeviceTooWeak(`Your device has ${mem || '?'}GB RAM and ${cores || '?'} cores. Stan requires at least 2GB RAM and 4 cores to run locally.`);
        setStatus('Device not supported');
        return;
      }
      
      if (!modelLoadStarted) {
        setModelLoadStarted(true);
        initWorker(STAN_MODEL_ID, detected);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState(() => {
    const stored = localStorage.getItem('swap_prompt');
    if (stored && stored.includes('## How to use your tools')) {
      return DEFAULT_PROMPT;
    }
    return stored || DEFAULT_PROMPT;
  });

  const [skills, setSkills] = useState<Skill[]>(() => {
    const stored = localStorage.getItem('swap_skills');
    if (stored) return JSON.parse(stored);
    return DEFAULT_SKILLS;
  });

  useEffect(() => {
    localStorage.setItem('swap_skills', JSON.stringify(skills));
  }, [skills]);

  const [mcpServers, setMcpServers] = useState<string[]>(() => {
    const stored = localStorage.getItem('swap_mcp_servers');
    return stored ? JSON.parse(stored) : [];
  });
  const [newMcpUrl, setNewMcpUrl] = useState('');
  
  const [persistConversation, setPersistConversation] = useState(() => localStorage.getItem('swap_persist') === 'true');

  // Load from DB
  useEffect(() => {
    if (persistConversation) {
      get('swap_messages').then((saved) => {
        if (saved && isMountedRef.current) {
          setMessages(saved);
        }
      }).catch(console.error);
    }
  }, []);

  // Save to DB
  useEffect(() => {
    if (persistConversation) {
      set('swap_messages', messages).catch(console.error);
    } else {
      set('swap_messages', []).catch(console.error);
    }
  }, [messages, persistConversation]);

  // Refs for closures
  const isVoiceEnabledRef = useRef(isVoiceEnabled);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          localStorage.setItem('swap_prompt', systemPrompt);
        }
        if (isSkillsModalOpen) {
          setIsSkillsModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, isSkillsModalOpen, systemPrompt]);

  useEffect(() => {
    // Request persistent storage
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) {
          console.log("Storage will not be cleared except by explicit user action");
        }
      });
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [voiceFirst, setVoiceFirst] = useState(() => {
    const stored = localStorage.getItem('swap_voice_first');
    return stored ? stored === 'true' : true;
  });
  const [autoListen, setAutoListen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem('swap_voice_first', String(voiceFirst));
  }, [voiceFirst]);

  useEffect(() => {
    if (!isReady || !voiceFirst || !autoListen || isProcessing || isListening) return;
    
    // Auto start microphone when voiceFirst mode is enabled, model is ready, not processing, and not currently listening
    const timer = setTimeout(() => handleMic(), 500);
    return () => clearTimeout(timer);
  }, [isReady, voiceFirst, autoListen, isProcessing, isListening, messages]);

  const workerRef = useRef<Worker | null>(null);
  const workerTimeoutRef = useRef<number | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing]);

  const mcpServersRef = useRef(mcpServers);
  useEffect(() => {
    mcpServersRef.current = mcpServers;
    if (isReady && workerRef.current) {
      workerRef.current.postMessage({ type: 'SYNC_MCP', payload: mcpServers });
    }
  }, [mcpServers, isReady]);

  const initWorker = useCallback((modelId: string, engineType?: EngineType | null) => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    setStatus(`Loading ${modelId}...`);
    setIsSpinning(true);
    setIsReady(false);

    // Choose the right worker based on detected engine
    const activeEngine = engineType ?? engine;
    const WorkerConstructor = activeEngine === 'webgpu' ? WorkerWebGPU : WorkerWASM;
    const worker = new WorkerConstructor();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (!isMountedRef.current) return;
      const { type, data } = e.data;
      switch (type) {
        case 'PROGRESS':
          setStatus(data);
          setIsSpinning(true);
          break;
        case 'THINKING':
          try {
            const rawAct = JSON.parse(data);
            if (rawAct.action === 'search_memory') setStatus(`🔍 Searching memory...`);
            else if (rawAct.action === 'fetch_web') setStatus(`🌐 Fetching...`);
            else if (rawAct.action === 'calculate') setStatus(`🧮 Calculating...`);
            else setStatus(`⚙️ Using tool ${rawAct.action}...`);
          } catch(e) {
            setStatus(data);
          }
          setIsSpinning(true);
          break;
        case 'DOWNLOAD_PROGRESS':
          setStatus('Loading Model');
          setIsSpinning(true);
          setIsDownloading(true);
          setDownloadText(data.text);
          setDownloadProgress(data.progress || 0);

          // Try to extract speed/ETA from text or calculate it
          // Example text: "Fetching... [1/6]: 12.3MB/s" or "Fetching... 120MB/230MB (12MB/s)"
          const speedMatch = data.text.match(/(\d+\.?\d*\s*[kMG]B\/s)/i);
          if (speedMatch) {
            setDownloadSpeed(speedMatch[1]);
            
            // If we have progress and speed, we can sometimes estimate, but WebLLM text is better
            // Some versions of WebLLM include the time remaining in the text.
          }

          // Very basic ETA calculation if not in text
          if (data.progress > 0 && data.progress < 1) {
            // If we don't have a built-in ETA in text, we could calculate it here if we tracked startTime
            // But let's look for common patterns like "ETA: 10s"
            const etaMatch = data.text.match(/ETA:\s*(\d+s|\d+m\s*\d*s)/i);
            if (etaMatch) {
              setEta(etaMatch[1]);
            }
          }
          break;
        case 'READY':
          setStatus('Ready');
          setIsSpinning(false);
          setIsDownloading(false);
          setIsReady(true);
          // Resync MCP servers after worker restart
          worker.postMessage({ type: 'SYNC_MCP', payload: mcpServersRef.current });
          break;
        case 'DONE':
          if (workerTimeoutRef.current) {
             clearTimeout(workerTimeoutRef.current);
             workerTimeoutRef.current = null;
          }
          let agentOutput = data;
          try {
             const act = typeof data === 'string' ? JSON.parse(data) : data;
             if (act.action === 'complete') {
                agentOutput = typeof act.payload === 'string' ? act.payload : (act.payload.answer || act.payload);
             } else if (act.action === 'search_memory') {
                agentOutput = `🔍 Searching your local memory for '${act.payload}'...`;
             } else if (act.action === 'fetch_web') {
                agentOutput = `🌐 Fetching the page: ${act.payload}...`;
             } else if (act.action === 'calculate') {
                agentOutput = `🧮 Calculating ${act.payload}...`;
             } else if (act.action === 'save_note') {
                agentOutput = `📝 Saving a note: '${act.payload}'...`;
             } else if (act.action && act.payload) {
                // If it's another action that somehow ended up here
                agentOutput = `⚙️ Running tool: ${act.action}`;
             } else {
                agentOutput = typeof data === 'string' ? data : JSON.stringify(data);
             }
          } catch (e) {
             // Fallback to raw string
          }

          setTyping(false);
          setMessages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'agent',
              text: agentOutput,
              isMarkdown: true,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsProcessing(false);
          setStatus('Idle');
          setIsSpinning(false);
          if (isVoiceEnabledRef.current && 'speechSynthesis' in window) {
            // Strip markdown formatting for cleaner speech synthesis
            const textToSpeak = typeof agentOutput === 'string' ? agentOutput.replace(/[*#_`]/g, '').replace(/\[.*\]\(.*\)/g, '') : '';
            if (textToSpeak) {
               const utterance = new SpeechSynthesisUtterance(textToSpeak);
               // Pause listening while speaking to avoid echoing self
               const wasAutoListen = autoListen;
               if (voiceFirst) setAutoListen(false);
               utterance.onend = () => {
                 if (voiceFirst) setAutoListen(true);
               };
               window.speechSynthesis.speak(utterance);
            }
          }
          break;
        case 'EXPORT_DATA':
          // The click might be handled by the direct file picker listener above,
          // so only fallback if payload didn't explicitly say we have a file picker
          if (!window.showSaveFilePicker) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `swap_agent_memory_${new Date().getTime()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setStatus('Export Complete');
            setIsSpinning(false);
          }
          break;
        case 'CALL_API': {
          const { id, action, payload } = e.data;
          const respond = (result: any) => worker.postMessage({ type: 'API_RESULT', id, result });
          
          try {
            if (action === 'clipboardRead') {
              navigator.clipboard.readText().then(respond).catch(err => respond('Clipboard Read Error: ' + err));
            } else if (action === 'clipboardWrite') {
              const text = typeof payload === 'string' ? payload : payload.text;
              navigator.clipboard.writeText(text).then(() => respond('Copied to clipboard')).catch(err => respond('Clipboard Write Error: ' + err));
            } else if (action === 'getGeolocation') {
              navigator.geolocation.getCurrentPosition(
                (pos) => respond({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                (err) => respond('Geolocation Error: ' + err.message)
              );
            } else if (action === 'showNotification') {
              const title = payload.title || 'Stan';
              const body = payload.body || '';
              if (Notification.permission === 'granted') {
                new Notification(title, { body });
                respond('Notification shown');
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                  if (permission === 'granted') {
                    new Notification(title, { body });
                    respond('Notification shown');
                  } else {
                    respond('Notification permission denied');
                  }
                });
              } else {
                respond('Notification permission denied');
              }
            } else if (action === 'wakeLock') {
              if ('wakeLock' in navigator) {
                (navigator as any).wakeLock.request('screen')
                  .then(() => respond('Wake lock acquired'))
                  .catch((err: any) => respond('Wake lock failed: ' + err));
              } else {
                respond('Wake lock not supported');
              }
            } else if (action === 'shareContent') {
              if (navigator.share) {
                navigator.share({ title: typeof payload === 'string' ? 'Shared from Stan' : payload.title, text: typeof payload === 'string' ? payload : payload.text, url: payload.url })
                  .then(() => respond('Content shared'))
                  .catch(err => respond('Share failed: ' + err));
              } else {
                respond('Web Share not supported');
              }
            } else if (action === 'vibrate') {
              if (navigator.vibrate) {
                const ms = typeof payload === 'number' ? payload : (payload.ms || 200);
                navigator.vibrate(ms);
                respond('Vibrated for ' + ms + 'ms');
              } else {
                respond('Vibration not supported');
              }
            } else {
              respond('Unknown browser tool: ' + action);
            }
          } catch (err: any) {
            respond('Error executing tool: ' + err.message);
          }
          break;
        }
        case 'ERROR':
          if (workerTimeoutRef.current) {
             clearTimeout(workerTimeoutRef.current);
             workerTimeoutRef.current = null;
          }
          setTyping(false);
          setStatus('Error: ' + data);
          setIsSpinning(false);
          setIsDownloading(false);
          setMessages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'system',
              text: 'â\u009A\u00A0 ' + data,
              isMarkdown: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsProcessing(false);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error(err);
      if (!isMountedRef.current) return;
      setStatus('Worker crashed');
      setIsSpinning(false);
      setIsDownloading(false);
      setIsProcessing(false);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'system',
          text: '⚠️ Local LLM worker crashed. Please reload the page or try a different model.',
          isMarkdown: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: 'worker-crash'
        }
      ]);
    };

    worker.postMessage({ type: 'INIT', modelId, engineType: engineType || engine });
  }, [engine]);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
      if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    };
  }, []);

  const startModel = () => {
    setModelLoadStarted(true);
    initWorker(STAN_MODEL_ID);
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isProcessing || !isReady) return;

    setIsProcessing(true);
    setInputValue('');
    
    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sender: 'user',
        text,
        isMarkdown: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    
    setTyping(true);
    workerRef.current?.postMessage({ type: 'TASK', payload: { text, systemPrompt } });
    
    if (workerTimeoutRef.current) clearTimeout(workerTimeoutRef.current);
    workerTimeoutRef.current = window.setTimeout(() => {
      setIsProcessing(false);
      setTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'system',
          text: '⏰ The agent took too long. Please try again.',
          isMarkdown: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }, 60000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;

    setStatus(`Reading ${file.name}...`);
    setIsSpinning(true);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      workerRef.current?.postMessage({ 
        type: 'INGEST_FILE', 
        payload: { name: file.name, content: event.target?.result } 
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;
    setStatus(`Restoring DB...`);
    setIsSpinning(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        workerRef.current?.postMessage({ type: 'IMPORT_MEMORY', payload: data });
      } catch (err) {
        setStatus('Invalid backup file');
        setIsSpinning(false);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    if (!workerRef.current) return;
    try {
      let fileHandle: any = null;
      if (window.showSaveFilePicker) {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `swap_agent_memory_${new Date().getTime()}.json`,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        // Setup one-time listener for the export data to write to the handle
        const handleMsg = async (e: MessageEvent) => {
          if (e.data.type === 'EXPORT_DATA') {
            workerRef.current?.removeEventListener('message', handleMsg);
            try {
              const writable = await fileHandle.createWritable();
              await writable.write(JSON.stringify(e.data.data, null, 2));
              await writable.close();
              setStatus('Export Complete');
              setIsSpinning(false);
            } catch (err) {
              setStatus('Export failed');
              setIsSpinning(false);
            }
          }
        };
        workerRef.current.addEventListener('message', handleMsg);
        setStatus('Exporting DB...');
        setIsSpinning(true);
        workerRef.current.postMessage({ type: 'EXPORT_MEMORY', payload: { noAutoDownload: true } });
      } else {
        // Fallback to traditional download
        setStatus('Exporting DB...');
        setIsSpinning(true);
        workerRef.current.postMessage({ type: 'EXPORT_MEMORY' });
      }
    } catch (err) {
      if ((err as any).name !== 'AbortError') {
        setStatus('Export Cancelled or Failed');
      }
      setIsSpinning(false);
    }
  };

  const handleMic = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      setInputValue(text);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.sender === 'agent' && msg.isMarkdown) {
      return <MarkdownMessage text={msg.text} />;
    }
    if (msg.action === 'worker-crash') {
      return (
        <div className="flex flex-col gap-3">
          <span className="text-[0.95rem] leading-[1.4] whitespace-pre-wrap">{msg.text}</span>
          <button 
            onClick={() => startModel()} 
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors w-fit border border-emerald-400/20"
          >
            Retry / Restart Engine
          </button>
        </div>
      );
    }
    return <span className="text-[0.95rem] leading-[1.4] whitespace-pre-wrap">{msg.text}</span>;
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0b14] text-white font-sans overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none"></div>

      {isDownloading && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-[#0a0b14]/90 backdrop-blur-xl border-b border-emerald-500/30 w-full animate-[fadeIn_0.3s_ease] shadow-2xl shadow-emerald-500/10">
          <div className="h-1.5 w-full bg-black/40 overflow-hidden relative">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500 ease-out relative shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
              style={{ width: `${downloadProgress * 100}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
          <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Installing AI Model</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                    {Math.round(downloadProgress * 100)}%
                  </span>
                </div>
                <span className="text-xs text-white/50 truncate font-mono mt-0.5">{downloadText}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-6 shrink-0">
              {downloadSpeed && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-white/30 uppercase font-mono tracking-tighter">Speed</span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">{downloadSpeed}</span>
                </div>
              )}
              {eta && (
                <div className="flex flex-col items-end border-l border-white/10 pl-6">
                  <span className="text-[10px] text-white/30 uppercase font-mono tracking-tighter">Est. Time</span>
                  <span className="text-xs font-mono text-white/90 font-bold">{eta}</span>
                </div>
              )}
              {!eta && downloadProgress > 0 && (
                 <div className="flex flex-col items-end border-l border-white/10 pl-6">
                  <span className="text-[10px] text-white/30 uppercase font-mono tracking-tighter">Status</span>
                  <span className="text-xs font-mono text-white/90 font-bold animate-pulse text-emerald-400">Downloading...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`relative z-10 w-full h-full p-4 md:p-6 flex flex-col gap-4 md:gap-6 ${isDownloading ? 'pt-12 md:pt-14' : ''}`}>        {/* Header */}
        <header className="flex items-center justify-between bg-transparent px-2 py-2">
        <div className="flex items-center gap-3 font-semibold select-none cursor-default">
          <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center">
            <Cpu size={16} className="text-white/80" />
          </div>
          <span className="text-base tracking-tight font-semibold text-white/90">Stan</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSkillsModalOpen(true)} className="text-white/40 hover:text-white p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors flex items-center justify-center shrink-0 w-8 h-8" aria-label="Open Skills">
            <BookOpen size={14} />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="text-white/40 hover:text-white p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors flex items-center justify-center shrink-0 w-8 h-8" aria-label="Open Settings">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Chat Container */}
      <main 
        className="flex-1 flex flex-col gap-4 bg-white/[0.03] border border-white-[0.08] backdrop-blur-3xl rounded-3xl p-4 md:p-6 overflow-hidden relative shadow-2xl"
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const dt = new DataTransfer();
            dt.items.add(e.dataTransfer.files[0]);
            if (fileInputRef.current) {
              fileInputRef.current.files = dt.files;
              handleFileUpload({ target: fileInputRef.current } as any);
            }
          }
        }}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[#0a0b14]/80 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-emerald-500/50 rounded-3xl animate-[fadeIn_0.2s_ease]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center animate-bounce">
                <FileText size={32} className="text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">Drop files to give me knowledge</h3>
              <p className="text-sm text-white/50">Supports PDF, DOCX, TXT, MD, JSON</p>
            </div>
          </div>
        )}
        <ErrorBoundary>
        <div ref={chatContainerRef} className="flex-1 overflow-hidden flex flex-col pr-2">
        
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto animate-[fadeIn_0.5s_ease]">
            {!isReady ? (
              deviceTooWeak ? (
                <>
                  <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-6 border border-red-500/20">
                    <Cpu size={32} className="text-red-400" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-red-100">Device Not Supported</h2>
                  <p className="text-sm text-red-200/60 mb-4">{deviceTooWeak}</p>
                </>
              ) : (
              /* Phase 2: Model is loading (download/init) */
              <>
                <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6 border border-emerald-500/20">
                  <Loader2 size={32} className="text-emerald-400 animate-spin" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Setting up your private AI…</h2>
                <p className="text-sm text-white/50 mb-4">{status}</p>
                {/* mini progress bar */}
                <div className="w-full max-w-[200px] h-1.5 bg-white/10 rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" 
                       style={{ width: `${downloadProgress * 100}%` }} />
                </div>
                <p className="text-xs text-white/30">This may take a minute the first time. After that, launches are instant.</p>
              </>
              )
            ) : (
              /* Phase 3: Ready — show example prompts */
              <>
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10">
                  <svg className="w-10 h-10" viewBox="0 0 100 100" fill="none">
                    <rect x="20" y="30" width="60" height="40" rx="6" fill="white" fillOpacity="0.05" stroke="white" strokeOpacity="0.3" strokeWidth="2.5" />
                    <circle cx="42" cy="50" r="5" fill="var(--accent)" />
                    <circle cx="58" cy="50" r="5" fill="#00a3ff" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Stan is ready</h2>
                <p className="text-sm text-white/50 mb-8 leading-relaxed">
                  Your private AI assistant runs entirely on this device. Ask anything — your data never leaves this browser.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button onClick={() => setInputValue("Search my local notes for 'project deadline'")} 
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs transition-colors">
                    🔍 Search my notes
                  </button>
                  <button onClick={() => setInputValue("Summarize this document")} 
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs transition-colors">
                    📄 Summarize a file
                  </button>
                  <button onClick={() => setInputValue("What's 15% of 280 plus 50?")} 
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs transition-colors">
                    🧮 Quick math
                  </button>
                  <button onClick={() => setInputValue("Search the web for 'current bitcoin price'")} 
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs transition-colors">
                    🌐 Web search
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {messages.length > 0 && (
          <Virtuoso
            style={{ height: '100%' }}
            data={messages}
            initialTopMostItemIndex={messages.length - 1}
            followOutput="auto"
            itemContent={(index, msg) => (
              <div 
                className={`flex flex-col max-w-[85%] pb-6 animate-[fadeIn_0.2s_ease] ${msg.sender === 'user' ? 'ml-auto' : 'mr-auto'}`}
              >
                <div className={`px-4 py-3 border backdrop-blur-lg break-words ${msg.sender === 'user' ? 'bg-white/5 border-white/5 rounded-2xl rounded-tr-none' : 'bg-white/10 border-white/20 rounded-2xl rounded-tl-none'} shadow-lg`}>
                  {renderMessageContent(msg)}
                </div>
                <div className={`text-[10px] text-white/40 mt-1 select-none font-mono ${msg.sender === 'user' ? 'text-right mr-2' : 'ml-2'}`}>
                  {msg.sender === 'user' ? 'USR' : 'AGT'} • {msg.timestamp}
                </div>
              </div>
            )}
            components={{
              Footer: () => typing ? (
                <div className="flex flex-col max-w-[85%] self-start animate-[fadeIn_0.2s_ease] pb-6">
                  <div className="px-4 py-3 bg-white/10 border border-white/20 rounded-2xl rounded-tl-none backdrop-blur-lg w-max shadow-lg shadow-black/20">
                    <div className="flex items-center gap-2 h-5">
                      <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden relative">
                        <div className="absolute top-0 h-full bg-white/60 w-1/2 rounded-full animate-progress"></div>
                      </div>
                      <span className="text-[11px] text-white/60 uppercase tracking-widest">Processing...</span>
                    </div>
                  </div>
                </div>
              ) : null
            }}
          />
        )}
        </div>
        </ErrorBoundary>

        {/* Input Area */}
        <div className="mt-auto relative shrink-0 pt-2">
          {voiceFirst && autoListen && isReady ? (
            <div className="flex flex-col items-center justify-center p-6 min-h-[140px] animate-[fadeIn_0.3s_ease]">
               <button
                 onClick={() => setAutoListen(false)}
                 className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-emerald-500' : 'bg-emerald-500/20 hover:bg-emerald-500/30'} shadow-[0_0_30px_rgba(16,185,129,0.3)]`}
               >
                 {isListening && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-emerald-500 opacity-75"></span>
                 )}
                 <Mic size={32} className="text-white relative z-10" />
               </button>
               <span className="mt-4 text-sm text-emerald-400/80 font-medium">Listening... Tap to type</span>
            </div>
          ) : (
          <div className="bg-[#1a1b26]/80 backdrop-blur-xl border border-white/10 rounded-2xl focus-within:border-white/30 transition-all shadow-lg overflow-hidden flex flex-col">
            <textarea 
              rows={1}
              disabled={!isReady || isProcessing}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isReady ? "Ask the agent anything..." : "System initializing..."}
              className="w-full bg-transparent border-none py-3 px-4 focus:outline-none focus:ring-0 text-[0.95rem] placeholder:text-white/30 resize-none max-h-[150px] overflow-y-auto leading-relaxed text-white/90"
            />
            
            <div className="flex items-center justify-between px-2 pb-2 mt-1">
               <div className="flex items-center gap-1">
                 <label className="p-1.5 text-white/40 cursor-pointer hover:text-white hover:bg-white/10 transition-colors rounded-lg flex items-center gap-1.5" title="Upload Document" aria-label="Upload Document">
                   <Paperclip size={16} />
                   <input 
                     type="file" 
                     ref={fileInputRef}
                     className="hidden" 
                     accept=".pdf,.docx,.txt,.md,.json" 
                     onChange={handleFileUpload}
                   />
                 </label>
                 
                 {voiceFirst && !autoListen ? (
                   <button
                     onClick={() => { setAutoListen(true); setIsListening(true); }}
                     className="p-1.5 text-emerald-400 transition-colors hover:bg-white/10 rounded-lg flex items-center gap-1.5"
                     title="Switch to Voice Mode"
                   >
                     <Mic size={16} />
                   </button>
                 ) : (
                   <button 
                     onClick={handleMic}
                     disabled={!isReady || isProcessing}
                     className={`p-1.5 cursor-pointer transition-colors rounded-lg flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'text-red-400 bg-red-400/10 animate-pulse' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                     title="Voice Input"
                     aria-label="Start voice input"
                   >
                     <Mic size={16} />
                   </button>
                 )}
                 <div className="w-px h-3 bg-white/10 mx-1"></div>
                 <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`p-1.5 cursor-pointer transition-colors rounded-lg ${isVoiceEnabled ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/40 hover:text-white hover:bg-white/10'}`} title="Toggle Voice Response" aria-label="Toggle Voice Response">
                   {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                 </button>
                 <div className="w-px h-3 bg-white/10 mx-1"></div>
                 <button onClick={handleExport} className="p-1.5 text-white/40 cursor-pointer transition-colors hover:text-white hover:bg-white/10 rounded-lg" title="Backup Base Data" aria-label="Backup Base Data">
                   <Download size={16} />
                 </button>
                 <label className="p-1.5 text-white/40 cursor-pointer transition-colors hover:text-white hover:bg-white/10 rounded-lg flex items-center" title="Restore Data" aria-label="Restore Data">
                   <Upload size={16} />
                   <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                 </label>
               </div>
               
              <button 
                onClick={handleSend}
                disabled={!isReady || isProcessing || !inputValue.trim()}
                className="w-8 h-8 bg-white hover:bg-gray-200 text-black rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:bg-white/10 disabled:text-white transition-all ml-2"
                aria-label="Send message"
              >
                <div className={`${isProcessing ? 'animate-pulse' : ''}`}>
                  <Send size={14} className="" />
                </div>
              </button>
            </div>
          </div>
          )}
        </div>
      </main>

      {/* Skills Modal */}
      {isSkillsModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsSkillsModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]"
        >
          <div className="bg-[#0f111a] border border-white/10 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <BookOpen size={16} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Skills Library</h2>
                  <p className="text-xs text-white/40 mt-0.5">Quickly change Stan's persona and instructions.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsSkillsModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {skills.map(skill => (
                <div key={skill.id} className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl flex flex-col gap-3 group relative overflow-hidden transition-all hover:bg-white/[0.05] hover:border-white/10">
                  {/* Selected Indicator */}
                  {systemPrompt === skill.prompt && (
                    <div className="absolute top-0 right-0 p-4">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                        Active
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between pr-24">
                    <div>
                      <h3 className="font-semibold text-white/90 text-sm">{skill.name}</h3>
                      <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">{skill.prompt}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1">
                    <div className="flex items-center gap-2">
                       {/* Prevent deleting default skills (1, 2, 3) */}
                       {!['1','2','3'].includes(skill.id) && (
                         <button 
                           onClick={() => setSkills(skills.filter(s => s.id !== skill.id))}
                           className="text-red-400/50 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-[11px] font-medium"
                         >
                           <Trash2 size={13} />
                           Delete
                         </button>
                       )}
                    </div>
                    <button 
                      onClick={() => {
                        setSystemPrompt(skill.prompt);
                        localStorage.setItem('swap_prompt', skill.prompt);
                        setIsSkillsModalOpen(false);
                      }}
                      disabled={systemPrompt === skill.prompt}
                      className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/20 disabled:text-emerald-400/50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all"
                    >
                      {systemPrompt === skill.prompt ? 'Activated' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New */}
            <div className="mt-4 pt-4 border-t border-white/10 shrink-0">
               <button 
                 onClick={() => {
                   const name = prompt("Enter a name for the new skill:");
                   if (!name) return;
                   const pr = prompt("Enter the system prompt instructions:");
                   if (!pr) return;
                   setSkills([...skills, { id: crypto.randomUUID(), name, prompt: pr }]);
                 }}
                 className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-xl transition-colors border border-emerald-400/20"
               >
                 <Plus size={16} />
                 Create Custom Skill
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsSettingsOpen(false);
              localStorage.setItem('swap_prompt', systemPrompt);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]"
        >
          <div className="bg-[#0f111a] border border-white/10 w-full max-w-xl rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                {deferredPrompt && (
                  <button
                    onClick={async () => {
                      deferredPrompt.prompt();
                      const { outcome } = await deferredPrompt.userChoice;
                      if (outcome === 'accepted') setDeferredPrompt(null);
                    }}
                    className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-medium rounded-lg transition-colors text-xs border border-emerald-500/20"
                  >
                    Install App
                  </button>
                )}
              </div>
              <p className="text-[10px] text-white/30">Auto-saves on close</p>
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  localStorage.setItem('swap_prompt', systemPrompt);
                }} 
                className="p-2 text-white/40 hover:text-white transition-colors rounded-xl hover:bg-white/5"
                aria-label="Close Settings"
              >
                <X size={18} />
              </button>
            </div>

                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-white/90">Voice-first mode</span>
                <span className="text-xs text-white/40">Automatically listen after responses</span>
              </div>
              <button
                role="switch"
                aria-checked={voiceFirst}
                onClick={() => {
                  const next = !voiceFirst;
                  setVoiceFirst(next);
                  localStorage.setItem('swap_voice_first', String(next));
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  voiceFirst ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  voiceFirst ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Conversation Persistence */}
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-white/90">Remember conversations</span>
                <span className="text-xs text-white/40">Restore your chat history when you come back</span>
              </div>
              <button
                role="switch"
                aria-checked={persistConversation}
                onClick={() => {
                  const next = !persistConversation;
                  setPersistConversation(next);
                  localStorage.setItem('swap_persist', String(next));
                  if (!next) setMessages([]);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  persistConversation ? 'bg-emerald-500' : 'bg-white/20'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  persistConversation ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* System Prompt */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">System Prompt</label>
                <button 
                  onClick={() => setSystemPrompt(DEFAULT_PROMPT)} 
                  className="text-xs text-white/40 hover:text-emerald-400 transition-colors"
                >
                  Reset to default
                </button>
              </div>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white/80 focus:outline-none focus:border-emerald-500/50 resize-y leading-relaxed font-mono text-xs"
                spellCheck={false}
              />
              <p className="text-[10px] text-white/30 leading-relaxed">
                Stan reads this at the start of every conversation. You can customize the personality or add instructions for how tools are handled.
              </p>
            </div>

            {/* Divider */}
            <div className="h-px w-full bg-white/5" />

            {/* Advanced: MCP Servers */}
            <button 
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="flex items-center justify-between w-full p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl transition-colors text-left"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-white/80">MCP Servers</span>
                <span className="text-xs text-white/40">Connect Stan to your local tools and data sources</span>
              </div>
              <span className="text-white/30 text-sm">{showAdvancedSettings ? '▼' : '▶'}</span>
            </button>

            {showAdvancedSettings && (
              <div className="flex flex-col gap-3 animate-[fadeIn_0.2s_ease]">
                {mcpServers.length === 0 ? (
                  <p className="text-xs text-white/40 italic px-1">No MCP servers connected yet. Add one below.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {mcpServers.map((url) => (
                      <div key={url} className="flex items-center justify-between gap-3 bg-white/[0.04] border border-white/5 rounded-xl p-3">
                        <span className="text-xs text-white/70 font-mono truncate">{url}</span>
                        <button 
                          onClick={() => {
                            const updated = mcpServers.filter(u => u !== url);
                            setMcpServers(updated);
                            localStorage.setItem('swap_mcp_servers', JSON.stringify(updated));
                          }}
                          className="text-white/30 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5"
                          aria-label="Remove server"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="http://localhost:3001/sse"
                    value={newMcpUrl}
                    onChange={(e) => setNewMcpUrl(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                  <button 
                    onClick={() => {
                      if (newMcpUrl.trim() && !mcpServers.includes(newMcpUrl.trim())) {
                        const updated = [...mcpServers, newMcpUrl.trim()];
                        setMcpServers(updated);
                        localStorage.setItem('swap_mcp_servers', JSON.stringify(updated));
                        setNewMcpUrl('');
                      }
                    }}
                    disabled={!newMcpUrl.trim()}
                    className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="h-px w-full bg-white/5" />

            {/* Danger Zone */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-red-400/70 uppercase tracking-wider">Danger Zone</label>
              <p className="text-xs text-white/30 leading-relaxed">
                This removes the downloaded AI model, all conversation history, and any cached data. You'll start fresh next time.
              </p>
              <button 
                onClick={async () => {
                  if (confirm("Permanently delete all data? Stan will need to re-download on your next visit.")) {
                    localStorage.clear();
                    const dbs = await window.indexedDB.databases();
                    dbs.forEach(db => { if (db.name) window.indexedDB.deleteDatabase(db.name); });
                    if ('caches' in window) {
                      const keys = await caches.keys();
                      for (const key of keys) await caches.delete(key);
                    }
                    window.location.reload();
                  }
                }}
                className="flex items-center justify-center gap-2 w-full p-3 bg-red-500/5 hover:bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                Clear All Data & Reset App
              </button>
            </div>

            {/* Footer note */}
            <p className="text-[10px] text-white/20 text-center">
              Settings are saved to this device only. Nothing is ever sent to a server.
            </p>

          </div>
        </div>
      )}
      </div>
    </div>
  );
}
