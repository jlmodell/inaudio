const HF_PREFIX = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/';
const LOCAL_PREFIX = '/browser-tts/onnx-community/Kokoro-82M-v1.0-ONNX/';
const ORT_FILE = /^ort-wasm[\w.-]*\.(wasm|mjs)$/;

export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function rewriteFetchInput(input: RequestInfo | URL, origin: string): RequestInfo | URL {
  const url = requestUrl(input);
  const local = rewriteModelUrl(url, origin);
  if (local === url) return input;
  if (typeof input === 'string' || input instanceof URL) return local;
  return new Request(local, input);
}

/** `fetch` callers assume a Promise. `rewriteModelUrl` throws on unexpected hosts. */
export function fetchRewritten(
  nativeFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  origin: string,
): Promise<Response> {
  try {
    return nativeFetch(rewriteFetchInput(input, origin), init);
  } catch (error) {
    return Promise.reject(error);
  }
}

export function rewriteModelUrl(url: string, origin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return url;
  }
  // eSpeak-NG (phonemizer) instantiates its inlined WASM via data:/blob: fetches.
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return url;
  if (parsed.origin === origin) return parsed.href;
  if (url.startsWith(HF_PREFIX) || isKokoroHuggingFace(parsed)) {
    const rest = parsed.pathname.replace(/^\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\//, '').split('?')[0];
    if (rest && rest !== parsed.pathname) return `${origin}${LOCAL_PREFIX}${rest}`;
  }
  const name = parsed.pathname.split('/').pop() ?? '';
  if (ORT_FILE.test(name) && isOrtCdn(parsed.hostname)) return `${origin}/ort/${name}`;
  throw new Error(`The on-device voice tried to leave this Inaudio (${parsed.origin}${parsed.pathname}).`);
}

function isKokoroHuggingFace(parsed: URL): boolean {
  return parsed.hostname === 'huggingface.co' && parsed.pathname.includes('/onnx-community/Kokoro-82M-v1.0-ONNX/');
}

function isOrtCdn(host: string): boolean {
  return host === 'cdn.jsdelivr.net' || host === 'unpkg.com' || host.endsWith('.jsdelivr.net');
}
