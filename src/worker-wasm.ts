import { PGlite } from "@electric-sql/pglite";
import { pipeline, env } from "@xenova/transformers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Disable local models to fetch from HF
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // Basic safety for some browsers

let engine: any;
let db: PGlite;
let embed: (text: string) => Promise<number[]>;
let mcpClients: Map<string, Client> = new Map();

async function init(modelId: string) {
  self.postMessage({ type: 'PROGRESS', data: 'Waiting for DB lock...' });
  return new Promise<void>((resolveInit, rejectInit) => {
    navigator.locks.request('swap-core-db-lock', async (lock) => {
      try {
        self.postMessage({ type: 'PROGRESS', data: 'Starting DB...' });
        db = new PGlite('opfs://swap-core');
        await db.exec(`
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

        self.postMessage({ type: 'PROGRESS', data: 'Loading embedder...' });
        const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
        embed = async (text: string) => {
          const out = await pipe(text, { pooling: 'mean', normalize: true });
          return Array.from(out.data);
        };

        self.postMessage({ type: 'PROGRESS', data: `Loading WASM LLM (${modelId})` });
        
        // We handle progress events from Xenova
        engine = await pipeline('text-generation', modelId, {
          quantized: true,
          progress_callback: (x: any) => {
            if (x.status === 'init') return;
            if (x.status === 'progress') {
              self.postMessage({ 
                type: 'DOWNLOAD_PROGRESS', 
                data: {
                  text: `Downloading ${x.file} : ${Math.round(x.progress)}%`,
                  progress: x.progress / 100
                } 
              });
            }
          }
        });
        
        self.postMessage({ type: 'READY' });
        resolveInit();
      } catch (err) {
        rejectInit(err);
      }
      
      // Keep the lock active until the worker is terminated
      return new Promise<void>(() => {});
    });
  });
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

function convertMessagesToPrompt(messages: any[], promptToUse: string): string {
    // Basic chat template for Xenova models. Many use ChatML or similar.
    let fullPrompt = `<|system|>\n${promptToUse}<|end|>\n`;
    for (const msg of messages) {
       fullPrompt += `<|${msg.role}|>\n${msg.content}<|end|>\n`;
    }
    fullPrompt += `<|assistant|>\n`;
    return fullPrompt;
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
  
  const promptToUse = systemPrompt || `You are Stan, an autonomous personal assistant.
You have native tools: search_memory (query), fetch_web (url), calculate (expression), save_note (text).
You also have browser tools: clipboardRead (), clipboardWrite (text), getGeolocation (), showNotification (title, body), wakeLock (), shareContent (text, url), vibrate (ms).
You also have these MCP dynamic tools:
${toolDescriptions}

Always use the "complete" tool to provide the final answer.
Format your output as JSON: {"action":"tool_name", "payload":{...args} or "string_payload"}.
Only output JSON.`;

  let messages = [
    { role: 'user', content: userText }
  ];

  for (let i = 0; i < 15; i++) {
    const formattedPrompt = convertMessagesToPrompt(messages, promptToUse);
    const resp = await engine(formattedPrompt, { max_new_tokens: 512, temperature: 0.1, do_sample: false });
    
    // Xenova transformers returns an array of generation objects
    let raw = resp[0].generated_text;
    
    // Strip the input prompt from the response
    if (raw.startsWith(formattedPrompt)) {
        raw = raw.slice(formattedPrompt.length);
    }
    
    // Parse JSON
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
      const results = await search(typeof act.payload === 'string' ? act.payload : act.payload.query);
      observation = results.join('\n') || 'No memories found.';
    } else if (act.action === 'fetch_web') {
      observation = await fetchWeb(typeof act.payload === 'string' ? act.payload : act.payload.url);
    } else if (act.action === 'calculate') {
      observation = await calculate(typeof act.payload === 'string' ? act.payload : act.payload.expression);
    } else if (act.action === 'save_note') {
      await save('note', typeof act.payload === 'string' ? act.payload : act.payload.text);
      observation = 'Note saved.';
    } else if (act.action === 'complete') {
      const finalResult = typeof act.payload === 'string' ? act.payload : (act.payload.answer || JSON.stringify(act.payload));
      
      // In Phase 1, we want natural language directly. Since 'complete' payloads are sent as DONE,
      // the App.tsx agent output translator will handle it, or we can just send it raw. The 
      // user wants the user to see natural language. The agent translation spec:
      // "complete" -> Use payload directly as final answer.
      self.postMessage({ type: 'DONE', data: JSON.stringify(act) });
      await save('assistant', finalResult);
      return;
    } else if (['clipboardRead', 'clipboardWrite', 'getGeolocation', 'showNotification', 'wakeLock', 'shareContent', 'vibrate'].includes(act.action)) {
      self.postMessage({ 
        type: 'THINKING', 
        data: JSON.stringify(act) 
      });
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

async function ingestFile(name: string, content: string) {
  const chunks = content.match(/.{1,512}/gs) || [];
  for (let chunk of chunks) {
    await save('document', `[FILE:${name}] ${chunk}`);
  }
  self.postMessage({ type: 'DONE', data: `{"action":"complete","payload":"Ingested ${chunks.length} chunks from ${name}"}` });
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'INIT') {
    await init(e.data.modelId);
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
    self.postMessage({ type: 'DONE', data: `{"action":"complete","payload":"Restored ${count} memory records successfully."}` });
  }
};
