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

/**
 * q8 on WebGPU produces noise on the multilingual v1.0 ONNX. This Inaudio only
 * ships q8, so start on WASM. WebGPU is fp32 and only used when that file is on
 * the host and the loader asks for it.
 */
export function preferredKokoroDevice(): 'wasm' | 'webgpu' {
  return 'wasm';
}
