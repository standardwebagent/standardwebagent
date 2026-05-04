declare global {
  interface Navigator {
    gpu?: any;
  }
}

export async function detectEngine(): Promise<'webgpu' | 'wasm'> {
  // If navigator.gpu is completely undefined, we definitely need wasm
  if (!navigator.gpu) return 'wasm';
  try {
    // requestAdapter will resolve to null if the browser supports the API
    // but no suitable WebGPU adapter is available.
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'wasm';
    
    // Additional checks could be added here (e.g. checking features or limits)
    return 'webgpu';
  } catch (e) {
    // If requestAdapter throws an error, fallback to wasm
    return 'wasm';
  }
}
