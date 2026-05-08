import { pipeline } from '@huggingface/transformers'
import { get, set } from 'idb-keyval'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerURL from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerURL;

let generator: any = null
let embedder: any = null
let currentSystemPrompt: string = ''

const MODEL_MAP: Record<string, string> = {
  'functiongemma-270m-it': 'google/functiongemma-270m-it',
}

async function initModel(modelId: string) {
  const hfId = MODEL_MAP[modelId] || 'google/functiongemma-270m-it'
  generator = await pipeline('text-generation', hfId, {
    device: 'wasm',
    dtype: 'q8',
    max_length: 512,
    progress_callback: (p: any) => {
      if (p.status === 'progress' && p.total) {
        const percent = Math.round((p.loaded / p.total) * 100);
        self.postMessage({
          type: 'DOWNLOAD_PROGRESS',
          data: {
            text: p.name ? `Loading ${p.name} …` : 'Downloading model …',
            progress: percent / 100
          }
        });
      }
    }
  } as any)

  postMessage({ type: 'PROGRESS', data: 'Loading embedder...' })
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
}

function dotProduct(a: number[], b: number[]) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

async function searchMemory(query: string): Promise<string> {
  const qVecRes = await embedder(query, { pooling: 'mean', normalize: true });
  const qVec = Array.from(qVecRes.data) as number[];
  const chunks = await get('stan_chunks');
  if (!chunks || chunks.length === 0) return "I haven't been given any documents yet. Drop some files on me.";
  
  const scored = chunks.map((c: any) => ({
    ...c,
    score: dotProduct(qVec, c.embedding)
  }));
  scored.sort((a: any, b: any) => b.score - a.score);
  const top = scored.slice(0, 3);
  return top.map((t: any) => `[From ${t.fileName}]: ${t.text}`).join('\n---\n');
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
    const vectorRes = await embedder(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(vectorRes.data);
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
  const { type, payload, modelId } = e.data

  switch (type) {
    case 'INIT': {
      const id = modelId || 'functiongemma-270m-it'
      postMessage({ type: 'PROGRESS', data: `Loading ${id}...` })
      try {
        await initModel(id)
        postMessage({ type: 'READY' })
      } catch (err) {
        postMessage({ type: 'ERROR', data: `Failed to load model: ${err}` })
      }
      break
    }

    case 'SYNC_MCP': {
      // MCP list sync – not needed by current runner but can be stored
      break
    }

    case 'TASK': {
      const { text, systemPrompt } = payload
      if (!generator) {
        postMessage({ type: 'ERROR', data: 'Model not loaded yet' })
        break
      }
      const basePrompt = systemPrompt || 'You are Stan, an autonomous personal assistant.'
      currentSystemPrompt = `${basePrompt}
      
Format your output as a single JSON object: {"action":"tool_name", "payload":{...args} or "string_payload"}.
Only output JSON.`
      const messages = [
        { role: 'system', content: currentSystemPrompt },
        { role: 'user', content: text }
      ]
      try {
        const result = await generator(messages, {
          max_new_tokens: 512,
          temperature: 0.1,
          do_sample: false,
        })
        const responseText = result[0]?.generated_text || ''
        
        let act;
        try {
           act = JSON.parse(responseText);
        } catch(e) {
           const match = responseText.match(/\{.*\}/s);
           if (match) act = JSON.parse(match[0]);
        }
        
        if (act && act.action === 'search_memory') {
          const observation = await searchMemory(typeof act.payload === 'string' ? act.payload : act.payload.query);
          // Very crude tool-loop: we just pass it back to the generator once
          messages.push({ role: 'assistant', content: JSON.stringify(act) });
          messages.push({ role: 'user', content: 'Tool observation: ' + observation });
          const result2 = await generator(messages, {
            max_new_tokens: 512,
            temperature: 0.1,
            do_sample: false,
          });
          postMessage({ type: 'DONE', data: result2[0]?.generated_text || '' });
        } else {
          postMessage({ type: 'DONE', data: responseText })
        }
      } catch (err) {
        postMessage({ type: 'ERROR', data: `Inference failed: ${err}` })
      }
      break
    }

    case 'INGEST_FILE': {
       await ingestFile(payload.name, payload.content);
       break;
    }

    default:
      // Ignore unknown messages
  }
}

