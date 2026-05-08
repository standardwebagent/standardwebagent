import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { PGlite } from "@electric-sql/pglite";
import { pipeline } from "@xenova/transformers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { get, set } from "idb-keyval";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerURL from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerURL;

let engine: any;
let isGeminiEngine = false;
let ai: GoogleGenAI | null = null;
let db: PGlite;
let embed: (text: string) => Promise<number[]>;
let mcpClients: Map<string, Client> = new Map();

let dbReady = false;

async function initPGlite(): Promise<PGlite> {
  return new Promise<PGlite>((resolve, reject) => {
    navigator.locks.request('swap-core-db-lock', async (lock) => {
      try {
        const database = new PGlite('opfs://swap-core');
        await database.exec(`
          CREATE EXTENSION IF NOT EXISTS vector;
          CREATE TABLE IF NOT EXISTS memory (
            id SERIAL PRIMARY KEY,
            role TEXT,
            content TEXT,
            embedding vector(384),
            ts TIMESTAMPTZ DEFAULT NOW(),
            metadata JSONB
          );
        `);
        resolve(database);
      } catch (err) {
        reject(err);
      }
      
      // Keep the lock active until the worker is terminated
      return new Promise<void>(() => {});
    });
  });
}

async function init(modelId: string, engineType?: string, apiKey?: string) {
  self.postMessage({ type: 'PROGRESS', data: 'Loading system...' });
  
  // Don't block on PGlite; init later
  initPGlite().then(database => {
    dbReady = true;
    db = database;  // store for later use
  }).catch(err => {
    console.warn('PGlite init failed, memory search disabled', err);
  });

  try {
    self.postMessage({ type: 'PROGRESS', data: 'Loading embedder...' });
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    embed = async (text: string) => {
      const out = await pipe(text, { pooling: 'mean', normalize: true });
      return Array.from(out.data);
    };

    if (engineType === 'gemini') {
      self.postMessage({ type: 'PROGRESS', data: `Loading Cloud AI (Gemini Flash)` });
      // We don't instantiate MLC engine
      isGeminiEngine = true;
      try {
        ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
      } catch (e) {
        console.error("Gemini API missing key in env!");
      }
      self.postMessage({ type: 'READY' });
      return;
    }

    isGeminiEngine = false;
    self.postMessage({ type: 'PROGRESS', data: `Loading LLM (${modelId})` });
    engine = await CreateMLCEngine(modelId, { 
      initProgressCallback: (p: any) => self.postMessage({ type: 'DOWNLOAD_PROGRESS', data: p }) 
    });
    
    self.postMessage({ type: 'READY' });
  } catch (err) {
    self.postMessage({ type: 'ERROR', data: String(err) });
  }
}

async function syncMcp(urls: string[]) {
  // Disconnect old clients that are no longer in the list
  for (const [url, client] of mcpClients.entries()) {
    if (!urls.includes(url)) {
      try { await client.close(); } catch(e) {}
      mcpClients.delete(url);
    }
  }

  // Add new clients
  for (const url of urls) {
    if (!mcpClients.has(url)) {
      try {
        const transport = new SSEClientTransport(new URL(url));
        const client = new Client({ name: "Stan-Browser-Agent", version: "1.0.0" }, { capabilities: {} });
        await client.connect(transport);
        mcpClients.set(url, client);
        self.postMessage({ type: 'PROGRESS', data: `Connected MCP: ${url}` });
      } catch (err: any) {
        self.postMessage({ type: 'ERROR', data: `Failed to connect to MCP ${url}: ${err.message}` });
      }
    }
  }
}

async function save(role: string, content: string, meta: any = {}) {
  const vec = await embed(content);
  await db.query(
    'INSERT INTO memory (role, content, embedding, metadata) VALUES ($1, $2, $3::vector, $4)', 
    [role, content, JSON.stringify(vec), JSON.stringify(meta)]
  );
}

async function search(q: string, limit: number = 3) {
  const vec = await embed(q);
  const res = await db.query(
    'SELECT content FROM memory ORDER BY embedding <-> $1::vector LIMIT $2', 
    [JSON.stringify(vec), limit]
  );
  return res.rows.map((r: any) => r.content);
}

async function fetchWeb(url: string) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const text = await res.text();
    return text.slice(0, 2000);
  } catch(e: any) { 
    return `Error fetching: ${e.message}`; 
  }
}

async function calculate(expr: string) {
  try {
    const safe = expr.replace(/[^0-9+\-*/().%]/g, '');
    // eslint-disable-next-line no-eval
    const result = eval(safe);
    return `${expr} = ${result}`;
  } catch(e: any) { 
    return `Calculation error: ${expr}`; 
  }
}

function callMainThreadAPI(action: string, payload: any): Promise<any> {
    return new Promise((resolve) => {
        const id = crypto.randomUUID();
        const handler = (e: MessageEvent) => {
            if (e.data.type === 'API_RESULT' && e.data.id === id) {
               self.removeEventListener('message', handler);
               resolve(e.data.result);
            }
        };
        self.addEventListener('message', handler);
        self.postMessage({ type: 'CALL_API', id, action, payload });
    });
}

async function handleTask(userText: string, systemPrompt?: string) {
  await save('user', userText);

  // Collect all MCP tools
  let dynamicTools: any[] = [];
  for (const client of mcpClients.values()) {
    try {
      const { tools } = await client.listTools();
      dynamicTools.push(...tools);
    } catch(e) {}
  }

  const toolDescriptions = dynamicTools.map(t => `${t.name}: ${t.description} (Args: ${JSON.stringify(t.inputSchema.properties)})`).join('\n');
  
  const promptToUse = `${systemPrompt || 'You are Stan, an autonomous personal assistant.'}

You have native tools: search_memory (query), fetch_web (url), calculate (expression), save_note (text).
You also have browser tools: clipboardRead (), clipboardWrite (text), getGeolocation (), showNotification (title, body), wakeLock (), shareContent (text, url), vibrate (ms).
You also have these MCP dynamic tools:
${toolDescriptions}

Always use the "complete" tool to provide the final answer.
Format your output as a single JSON object: {"action":"tool_name", "payload":{...args} or "string_payload"}.
Only output JSON.`;

  let messages = [
    { role: 'system', content: promptToUse },
    { role: 'user', content: userText }
  ];

  for (let i = 0; i < 15; i++) {
    let raw = '';
    try {
      if (isGeminiEngine && ai) {
        let contentStr = '';
        for (const msg of messages) {
            contentStr += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
        }
        const resp = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: contentStr,
            config: {
               temperature: 0.2
            }
        });
        raw = resp.text || '';
      } else {
        const resp = await engine.chat.completions.create({ messages, temperature: 0.2 });
        raw = resp.choices[0].message.content;
      }
    } catch (e: any) {
      self.postMessage({ type: 'ERROR', data: 'Model inference failed: ' + String(e.message || e) });
      return;
    }

    let act;
    try { 
      act = JSON.parse(raw); 
    } catch(e) { 
      // Try to extract JSON if model blabbed
      const match = raw.match(/\{.*\}/s);
      if (match) {
        try { act = JSON.parse(match[0]); } catch(e2) {
          self.postMessage({ type: 'ERROR', data: 'Invalid JSON from model: ' + raw }); 
          return;
        }
      } else {
        self.postMessage({ type: 'ERROR', data: 'Invalid JSON from model: ' + raw }); 
        return; 
      }
    }

    let observation = '';
    if (act.action === 'search_memory') {
      observation = await searchMemory(typeof act.payload === 'string' ? act.payload : act.payload.query);
    } else if (act.action === 'fetch_web') {
      observation = await fetchWeb(typeof act.payload === 'string' ? act.payload : act.payload.url);
    } else if (act.action === 'calculate') {
      observation = await calculate(typeof act.payload === 'string' ? act.payload : act.payload.expression);
    } else if (act.action === 'save_note') {
      await save('note', typeof act.payload === 'string' ? act.payload : act.payload.text);
      observation = 'Note saved.';
    } else if (act.action === 'complete') {
      const finalResult = typeof act.payload === 'string' ? act.payload : (act.payload.answer || JSON.stringify(act.payload));
      self.postMessage({ type: 'DONE', data: JSON.stringify(act) });
      await save('assistant', finalResult);
      return;
    } else if (['clipboardRead', 'clipboardWrite', 'getGeolocation', 'showNotification', 'wakeLock', 'shareContent', 'vibrate'].includes(act.action)) {
      self.postMessage({ type: 'THINKING', data: JSON.stringify(act) });
      try {
        const result = await callMainThreadAPI(act.action, act.payload);
        observation = typeof result === 'object' ? JSON.stringify(result) : String(result);
      } catch (err: any) {
        observation = `API Error: ${err.message || String(err)}`;
      }
    } else {
      // Check for MCP dynamic tools
      let foundMcp = false;
      for (const client of mcpClients.values()) {
        try {
          const { tools } = await client.listTools();
          if (tools.some(t => t.name === act.action)) {
            self.postMessage({ type: 'THINKING', data: JSON.stringify(act) });
            const result = await client.callTool({ name: act.action, arguments: act.payload });
            observation = JSON.stringify(result);
            foundMcp = true;
            break;
          }
        } catch(e) {}
      }

      if (!foundMcp) {
        self.postMessage({ type: 'ERROR', data: 'Unknown action: ' + act.action });
        return;
      }
    }
    messages.push({ role: 'assistant', content: JSON.stringify(act) });
    messages.push({ role: 'user', content: 'Tool observation: ' + observation });
  }
  self.postMessage({ type: 'ERROR', data: 'Max loops exceeded' });
}

function dotProduct(a: number[], b: number[]) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

async function searchMemory(query: string): Promise<string> {
  const qVec = await embed(query);
  
  // Search IndexedDB (files/documents)
  const chunks = await get('stan_chunks');
  let topFileChunks: string[] = [];
  if (chunks && chunks.length > 0) {
    const scored = chunks.map((c: any) => ({
      ...c,
      score: dotProduct(qVec, c.embedding)
    }));
    scored.sort((a: any, b: any) => b.score - a.score);
    topFileChunks = scored.slice(0, 3).map((t: any) => `[From ${t.fileName}]: ${t.text}`);
  }

  // Search PGlite (conversation memory notes)
  let topMemories: string[] = [];
  if (dbReady && db) {
    try {
      const res = await db.query(
        'SELECT content FROM memory WHERE role IN (\'user\', \'note\') ORDER BY embedding <-> $1::vector LIMIT 3', 
        [JSON.stringify(qVec)]
      );
      topMemories = res.rows.map((r: any) => `[Conversation/Note]: ${r.content}`);
    } catch (e) {
      console.warn("PGlite search failed", e);
    }
  }

  if (topFileChunks.length === 0 && topMemories.length === 0) {
    return "I haven't been given any documents or saved any notes yet.";
  }

  return [...topFileChunks, ...topMemories].join('\n---\n');
}

async function ingestFile(name: string, content: ArrayBuffer) {
  self.postMessage({ type: 'PROGRESS', data: `Extracting text from ${name}...` });
  let fullText = '';
  
  try {
    if (name.endsWith('.pdf')) {
      const pdf = await pdfjsLib.getDocument({ data: content }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((s: any) => s.str).join(' ') + '\n';
      }
    } else if (name.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ arrayBuffer: content });
      fullText = result.value;
    } else {
      fullText = new TextDecoder().decode(content);
    }
  } catch(e) {
    self.postMessage({ type: 'ERROR', data: `Failed to extract text from ${name}: ${e}` });
    return;
  }

  self.postMessage({ type: 'PROGRESS', data: `Chunking and indexing ${name}...` });

  const paragraphs = fullText.split(/\n\s*\n/);
  const chunks: string[] = [];
  for (const p of paragraphs) {
    const pTrim = p.trim();
    if (pTrim.length < 50) continue;
    if (pTrim.length > 500) {
      const sentences = pTrim.match(/[^.!?]+[.!?]+/g) || [pTrim];
      let currentChunk = '';
      for (const s of sentences) {
        if (currentChunk.length + s.length > 500) {
           if (currentChunk.length >= 50) chunks.push(currentChunk.trim());
           currentChunk = s;
        } else {
           currentChunk += ' ' + s;
        }
      }
      if (currentChunk.length >= 50) chunks.push(currentChunk.trim());
    } else {
      chunks.push(pTrim);
    }
  }

  const dbChunks = await get('stan_chunks') || [];
  const fileId = crypto.randomUUID();
  let indexed = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const vector = await embed(text);
    dbChunks.push({
      id: crypto.randomUUID(),
      fileId,
      fileName: name,
      index: i,
      text,
      embedding: vector
    });
    indexed++;
    if (indexed % 10 === 0) {
      self.postMessage({ type: 'PROGRESS', data: `Indexing... ${indexed}/${chunks.length} chunks` });
    }
  }
  
  await set('stan_chunks', dbChunks);
  self.postMessage({ type: 'DONE', data: `Indexed ${chunks.length} chunks from ${name}` });
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'INIT') {
    await init(e.data.modelId, e.data.engineType, e.data.apiKey);
  } else if (e.data.type === 'SYNC_MCP') {
    await syncMcp(e.data.payload);
  } else if (e.data.type === 'TASK') {
    await handleTask(e.data.payload.text, e.data.payload.systemPrompt);
  } else if (e.data.type === 'INGEST_FILE') {
    await ingestFile(e.data.payload.name, e.data.payload.content);
  } else if (e.data.type === 'EXPORT_MEMORY') {
    const res = await db.query('SELECT role, content, metadata FROM memory');
    self.postMessage({ type: 'EXPORT_DATA', data: res.rows });
  } else if (e.data.type === 'IMPORT_MEMORY') {
    self.postMessage({ type: 'PROGRESS', data: 'Restoring memory...' });
    let count = 0;
    for (const row of e.data.payload) {
      if (row.role && row.content) {
        await save(row.role, row.content, row.metadata);
        count++;
      }
    }
    self.postMessage({ type: 'DONE', data: `Restored ${count} memory records successfully.` });
  }
};
