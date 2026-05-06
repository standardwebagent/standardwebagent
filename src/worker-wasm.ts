import { pipeline } from '@huggingface/transformers'

let generator: any = null
let currentSystemPrompt: string = ''

const MODEL_MAP: Record<string, string> = {
  'functiongemma-270m-it': 'google/functiongemma-270m-it',
  // future: add more WASM‑compatible models here
}

async function initModel(modelId: string) {
  const hfId = MODEL_MAP[modelId] || 'google/functiongemma-270m-it'
  generator = await pipeline('text-generation', hfId, {
    device: 'wasm',        // Transformers.js auto‑selects WASM backend
    dtype: 'q8',           // 8‑bit quantisation for low memory
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
        postMessage({ type: 'DONE', data: responseText })
      } catch (err) {
        postMessage({ type: 'ERROR', data: `Inference failed: ${err}` })
      }
      break
    }

    default:
      // Ignore unknown messages
  }
}
