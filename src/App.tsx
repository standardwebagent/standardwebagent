import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import 'highlight.js/styles/github-dark.min.css';
import hljs from 'highlight.js';
import { Paperclip, Send, Cpu, Loader2, Mic, Volume2, VolumeX, Download, Upload, Settings, X, Plus, Trash2 } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  isMarkdown: boolean;
  timestamp: string;
}

interface LLMModel {
  id: string;
  name: string;
}

const DEFAULT_PROMPT = `You are an autonomous agent. You have tools: search_memory (query), fetch_web (url), calculate (expression), save_note (text), complete (final answer). Output JSON: {"action":"tool_name", "payload":"..."}. Only output JSON.`;

const DEFAULT_MODELS: LLMModel[] = [
  { id: 'gemma-2b-it-q4f16_1-MLC', name: 'Gemma 2B' },
  { id: 'SmolLM-1.7B-Instruct-v0.2-q4f16_1-MLC', name: 'SmolLM 1.7B' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B' }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState('Initialising...');
  const [isSpinning, setIsSpinning] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentModel, setCurrentModel] = useState('gemma-2b-it-q4f16_1-MLC');
  const [typing, setTyping] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadText, setDownloadText] = useState('');

  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('swap_prompt') || DEFAULT_PROMPT);
  const [customModels, setCustomModels] = useState<LLMModel[]>(() => {
    const stored = localStorage.getItem('swap_models');
    return stored ? JSON.parse(stored) : DEFAULT_MODELS;
  });
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // Refs for closures
  const isVoiceEnabledRef = useRef(isVoiceEnabled);
  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  const workerRef = useRef<Worker | null>(null);
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

  const initWorker = useCallback((modelId: string) => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    setStatus(`Loading ${modelId}...`);
    setIsSpinning(true);
    setIsReady(false);

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, data } = e.data;
      switch (type) {
        case 'PROGRESS':
        case 'THINKING':
          setStatus(data);
          setIsSpinning(true);
          break;
        case 'DOWNLOAD_PROGRESS':
          setStatus('Loading Model');
          setIsSpinning(true);
          setIsDownloading(true);
          setDownloadText(data);
          break;
        case 'READY':
          setStatus('Ready');
          setIsSpinning(false);
          setIsDownloading(false);
          setIsReady(true);
          break;
        case 'DONE':
          setTyping(false);
          setMessages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: 'agent',
              text: data,
              isMarkdown: true,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsProcessing(false);
          setStatus('Idle');
          setIsSpinning(false);
          if (isVoiceEnabledRef.current && 'speechSynthesis' in window) {
            // Strip markdown formatting for cleaner speech synthesis
            const textToSpeak = data.replace(/[*#_`]/g, '').replace(/\[.*\]\(.*\)/g, '');
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            window.speechSynthesis.speak(utterance);
          }
          break;
        case 'EXPORT_DATA':
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `swap_agent_memory_${new Date().getTime()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setStatus('Export Complete');
          setIsSpinning(false);
          break;
        case 'ERROR':
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
      setStatus('Worker crashed');
      setIsSpinning(false);
      setIsDownloading(false);
    };

    worker.postMessage({ type: 'INIT', modelId });
  }, []);

  useEffect(() => {
    initWorker(currentModel);
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [currentModel, initWorker]);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    if (newModel === currentModel) return;
    setCurrentModel(newModel);
    setMessages([{
      id: crypto.randomUUID(),
      sender: 'agent',
      text: `Switching to ${e.target.options[e.target.selectedIndex].text}...`,
      isMarkdown: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
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
    reader.readAsText(file);
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

  const handleExport = () => {
    if (!workerRef.current) return;
    setStatus('Exporting DB...');
    setIsSpinning(true);
    workerRef.current.postMessage({ type: 'EXPORT_MEMORY' });
  };

  const handleMic = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInputValue(text);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.sender === 'agent' && msg.isMarkdown) {
      const htmlContent = marked.parse(msg.text);
      // We parse safely by injecting the HTML
      // Post processing for highlight.js can be done in a useEffect, but standard marked outputs simple pre/codes.
      return <div className="markdown-body text-[0.95rem] leading-[1.4]" dangerouslySetInnerHTML={{ __html: htmlContent as string }} />;
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
        <div className="absolute top-0 left-0 right-0 z-50 bg-emerald-500/20 backdrop-blur-md border-b border-emerald-500/30 px-4 py-2 flex flex-col md:flex-row items-start md:items-center justify-between text-xs text-emerald-100 animate-[fadeIn_0.3s_ease] gap-2 md:gap-0">
          <div className="flex items-center gap-3">
            <Loader2 size={14} className="animate-spin text-emerald-400 shrink-0" />
            <span className="font-medium shrink-0">Model Installation</span>
            <span className="opacity-80 border-l border-emerald-500/30 pl-3">Loading LLM parameters into browser memory. Do not close this tab.</span>
          </div>
          <span className="font-mono text-[10px] opacity-90 truncate max-w-[200px] md:max-w-xs">{downloadText}</span>
        </div>
      )}

      <div className={`relative z-10 w-full h-full p-4 md:p-6 flex flex-col gap-4 md:gap-6 ${isDownloading ? 'pt-12 md:pt-14' : ''}`}>        {/* Header */}
        <header className="flex items-center justify-between bg-transparent px-2 py-2">
        <div className="flex items-center gap-3 font-semibold select-none cursor-default">
          <svg viewBox="0 0 100 100" width="24" height="24">
            <path d="M20 50 L40 30 L60 30 L80 50 L60 70 L40 70 Z" fill="none" stroke="var(--accent)" strokeWidth="3" />
            <path d="M20 50 L40 70 L60 70 L80 50 L60 30 L40 30 Z" fill="none" stroke="#00a3ff" strokeWidth="2" opacity="0.8" />
            <circle cx="42" cy="50" r="4" fill="var(--accent)" />
            <circle cx="58" cy="50" r="4" fill="#00a3ff" />
          </svg>
          <span className="text-base tracking-tight font-medium text-white/90">SWAP Core</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 hover:bg-white/10 border border-white/10 rounded-full py-1 px-3 items-center gap-2 transition-colors">
            <Cpu size={12} className="text-emerald-400" />
            <select 
              className="bg-transparent border-none text-[11px] font-medium outline-none cursor-pointer text-white/70 hover:text-white appearance-none truncate max-w-[120px]"
              value={currentModel}
              onChange={handleModelChange}
            >
              {customModels.map(m => (
                <option key={m.id} value={m.id} className="bg-[#0a0b14]">{m.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full py-1 px-3">
            {isSpinning ? <Loader2 size={12} className="animate-spin text-emerald-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>}
            <span className="text-[11px] font-medium text-white/70 truncate max-w-[100px]">{status}</span>
          </div>

          <button onClick={() => setIsSettingsOpen(true)} className="text-white/40 hover:text-white p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors ml-1">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Chat Container */}
      <main className="flex-1 flex flex-col gap-4 bg-white/[0.03] border border-white-[0.08] backdrop-blur-3xl rounded-3xl p-4 md:p-6 overflow-hidden relative shadow-2xl">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 webkit-overflow-scrolling-touch">
        
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto animate-[fadeIn_0.5s_ease]">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-lg">
              <Cpu size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-sm text-white/50 mb-8 leading-relaxed">
              I am an autonomous agent running entirely in your browser. I have tools for memory search, web fetches, calculations, and notes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => setInputValue("What is the weather like?")} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs transition-colors">What is the weather like?</button>
              <button onClick={() => setInputValue("Calculate 15% of 85.5")} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs transition-colors">Calculate 15% of 85.5</button>
              <button onClick={() => setInputValue("Remember that my favorite color is blue")} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs transition-colors">Save a note</button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col max-w-[85%] animate-[fadeIn_0.2s_ease] ${msg.sender === 'user' ? 'self-end' : 'self-start'}`}
          >
            <div className={`px-4 py-3 border backdrop-blur-lg break-words ${msg.sender === 'user' ? 'bg-white/5 border-white/5 rounded-2xl rounded-tr-none' : 'bg-white/10 border-white/20 rounded-2xl rounded-tl-none'} shadow-lg`}>
              {renderMessageContent(msg)}
            </div>
            <div className={`text-[10px] text-white/40 mt-1 select-none font-mono ${msg.sender === 'user' ? 'mr-2' : 'ml-2'}`}>
              {msg.sender === 'user' ? 'USR' : 'AGT'} • {msg.timestamp}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex flex-col max-w-[85%] self-start animate-[fadeIn_0.2s_ease]">
            <div className="px-4 py-3 bg-white/10 border border-white/20 rounded-2xl rounded-tl-none backdrop-blur-lg w-max shadow-lg shadow-black/20">
              <div className="flex items-center gap-2 h-5">
                <Loader2 size={14} className="animate-spin text-white/60" />
                <span className="text-[11px] text-white/60 uppercase tracking-widest">Processing...</span>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Input Area */}
        <div className="mt-auto relative shrink-0 pt-2">
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
                 <label className="p-1.5 text-white/40 cursor-pointer hover:text-white hover:bg-white/10 transition-colors rounded-lg flex items-center gap-1.5" title="Upload Document">
                   <Paperclip size={16} />
                   <input 
                     type="file" 
                     ref={fileInputRef}
                     className="hidden" 
                     accept=".txt,.md,.json" 
                     onChange={handleFileUpload}
                   />
                 </label>
                 <button 
                   onClick={handleMic}
                   className={`p-1.5 cursor-pointer transition-colors rounded-lg flex items-center gap-1.5 ${isListening ? 'text-red-400 bg-red-400/10 animate-pulse' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                   title="Voice Input"
                 >
                   <Mic size={16} />
                 </button>
                 <div className="w-px h-3 bg-white/10 mx-1"></div>
                 <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`p-1.5 cursor-pointer transition-colors rounded-lg ${isVoiceEnabled ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/40 hover:text-white hover:bg-white/10'}`} title="Toggle Voice Response">
                   {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                 </button>
                 <div className="w-px h-3 bg-white/10 mx-1"></div>
                 <button onClick={handleExport} className="p-1.5 text-white/40 cursor-pointer transition-colors hover:text-white hover:bg-white/10 rounded-lg" title="Backup Base Data">
                   <Download size={16} />
                 </button>
                 <label className="p-1.5 text-white/40 cursor-pointer transition-colors hover:text-white hover:bg-white/10 rounded-lg flex items-center" title="Restore Data">
                   <Upload size={16} />
                   <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                 </label>
               </div>
               
              <button 
                onClick={handleSend}
                disabled={!isReady || isProcessing || !inputValue.trim()}
                className="w-8 h-8 bg-white hover:bg-gray-200 text-black rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:bg-white/10 disabled:text-white transition-all ml-2"
              >
                <div className={`${isProcessing ? 'animate-pulse' : ''}`}>
                  <Send size={14} className="" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-[#0a0b14] border border-white/10 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Agent Settings</h2>
              <button onClick={() => {
                setIsSettingsOpen(false);
                localStorage.setItem('swap_prompt', systemPrompt);
                localStorage.setItem('swap_models', JSON.stringify(customModels));
              }} className="p-2 text-white/40 hover:text-white transition-colors rounded-xl hover:bg-white/5">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs text-white/50 uppercase tracking-wider font-mono">System Prompt</label>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-emerald-500/50 resize-y leading-relaxed"
                placeholder="You are an autonomous agent..."
              />
              <div className="flex justify-end">
                <button 
                  onClick={() => setSystemPrompt(DEFAULT_PROMPT)} 
                  className="text-xs text-white/40 hover:text-white transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-white/10 my-2"></div>

            <div className="flex flex-col gap-4">
              <label className="text-xs text-white/50 uppercase tracking-wider font-mono">LLM Models (WebLLM Identifiers)</label>
              
              <div className="flex flex-col gap-2">
                {customModels.map((m) => (
                  <div key={m.id} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-white/5 border border-white/5 rounded-xl p-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{m.name}</span>
                      <span className="text-xs text-white/40 font-mono break-all">{m.id}</span>
                    </div>
                    <button 
                      onClick={() => setCustomModels(prev => prev.filter(mod => mod.id !== m.id))}
                      className="text-white/40 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-white/5"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col md:flex-row gap-2 mt-2">
                <input 
                  type="text"
                  placeholder="Model Name (e.g., Llama 3 8B)"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                />
                <input 
                  type="text"
                  placeholder="WebLLM ID (e.g., Llama-3-8B-Instruct-q4f16_1-MLC)"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <button 
                  onClick={() => {
                    if (newModelId.trim() && newModelName.trim()) {
                      if (!customModels.find(m => m.id === newModelId.trim())) {
                         setCustomModels(prev => [...prev, { id: newModelId.trim(), name: newModelName.trim() }]);
                      }
                      setNewModelId('');
                      setNewModelName('');
                    }
                  }}
                  disabled={!newModelId.trim() || !newModelName.trim()}
                  className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
