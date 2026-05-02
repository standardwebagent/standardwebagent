import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { PGlite } from "@electric-sql/pglite";
import { pipeline } from "@xenova/transformers";

let engine: any;
let db: PGlite;
let embed: (text: string) => Promise<number[]>;

async function init(modelId: string) {
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

  self.postMessage({ type: 'PROGRESS', data: `Loading LLM (${modelId})` });
  engine = await CreateMLCEngine(modelId, { 
    initProgressCallback: (p: any) => self.postMessage({ type: 'DOWNLOAD_PROGRESS', data: p.text }) 
  });
  
  self.postMessage({ type: 'READY' });
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
    const res = await fetch(url);
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

async function handleTask(userText: string, systemPrompt?: string) {
  await save('user', userText);
  
  const promptToUse = systemPrompt || `You are an autonomous agent. You have tools: search_memory (query), fetch_web (url), calculate (expression), save_note (text), complete (final answer). Output JSON: {"action":"tool_name", "payload":"..."}. Only output JSON.`;

  let messages = [
    { role: 'system', content: promptToUse },
    { role: 'user', content: userText }
  ];

  for (let i = 0; i < 10; i++) {
    const resp = await engine.chat.completions.create({ messages, temperature: 0.2 });
    const raw = resp.choices[0].message.content;
    let act;
    try { 
      act = JSON.parse(raw); 
    } catch(e) { 
      self.postMessage({ type: 'ERROR', data: 'Invalid JSON from model: ' + raw }); 
      return; 
    }

    let observation = '';
    if (act.action === 'search_memory') {
      const results = await search(act.payload);
      observation = results.join('\\n') || 'No memories found.';
    } else if (act.action === 'fetch_web') {
      observation = await fetchWeb(act.payload);
    } else if (act.action === 'calculate') {
      observation = await calculate(act.payload);
    } else if (act.action === 'save_note') {
      await save('note', act.payload);
      observation = 'Note saved.';
    } else if (act.action === 'complete') {
      self.postMessage({ type: 'DONE', data: act.payload });
      await save('assistant', act.payload);
      return;
    } else {
      self.postMessage({ type: 'ERROR', data: 'Unknown action: ' + act.action });
      return;
    }
    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: 'Tool result: ' + observation });
  }
  self.postMessage({ type: 'ERROR', data: 'Max loops exceeded' });
}

async function ingestFile(name: string, content: string) {
  const chunks = content.match(/.{1,512}/gs) || [];
  for (let chunk of chunks) {
    await save('document', `[FILE:${name}] ${chunk}`);
  }
  self.postMessage({ type: 'DONE', data: `Ingested ${chunks.length} chunks from ${name}` });
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'INIT') {
    await init(e.data.modelId);
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
