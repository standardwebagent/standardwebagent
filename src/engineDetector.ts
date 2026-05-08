declare global {
  interface Navigator {
    gpu?: any;
    ml?: any;
  }
}

export type EngineType = 'webnn' | 'webgpu' | 'wasm' | 'gemini' | 'window.ai'

export async function detectEngine(): Promise<EngineType> {
  // 0. Try window.ai (Built-in Chrome AI)
  if ('ai' in window && (window as any).ai?.languageModel) {
    try {
      const capabilities = await (window as any).ai.languageModel.capabilities();
      if (capabilities.available !== 'no') {
        return 'window.ai';
      }
    } catch {
      // not available
    }
  }

  // 1. Try WebNN (most efficient – NPU)
  if ('ml' in navigator && (navigator.ml as any)?.createContext) {
    try {
      const ctx = await (navigator.ml as any).createContext()
      if (ctx) return 'webnn'
    } catch {
      // not available or blocked
    }
  }

  // 2. Try WebGPU (fast, wide support)
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) return 'webgpu'
    } catch {
      // not available
    }
  }

  // 3. Fallback – CPU via WASM (always works)
  return 'wasm'
}
