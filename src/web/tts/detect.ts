export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function hasWebSpeech(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

export function canUseBrowserTts(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** Safari on iPhone keeps a tight tab budget; skip WebGPU so WASM and the model can share memory. */
export function preferredKokoroDevice(): 'wasm' | 'webgpu' {
  if (isAppleMobile()) return 'wasm';
  return hasWebGpu() ? 'webgpu' : 'wasm';
}
