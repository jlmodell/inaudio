/** onnxruntime-web files the Kokoro worker loads from this host. */
export const ORT_URL_PREFIX = '/ort';

export const ORT_RUNTIME_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.mjs',
] as const;

export type OrtRuntimeFile = (typeof ORT_RUNTIME_FILES)[number];

export function ortFileContentType(name: string): string {
  if (name.endsWith('.wasm')) return 'application/wasm';
  if (name.endsWith('.mjs') || name.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

export function ortFileUrl(name: OrtRuntimeFile): string {
  return `${ORT_URL_PREFIX}/${name}`;
}
