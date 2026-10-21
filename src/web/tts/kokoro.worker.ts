import { env as hfEnv } from '@huggingface/transformers';
import { env as kokoroEnv, KokoroTTS } from 'kokoro-js';
import { BROWSER_TTS_MODEL_ID, BROWSER_TTS_URL_PREFIX } from '@shared/web/browser-tts';
import { rewriteModelUrl } from '@shared/web/model-url';
import { voiceErrorText } from '@shared/web/voice-error';
import type { KokoroWorkerIn, KokoroWorkerOut } from './protocol';

const CACHE = 'inaudio-browser-tts';
const WASM_PATHS = '/ort/';

hfEnv.allowRemoteModels = false;
hfEnv.allowLocalModels = true;
hfEnv.localModelPath = `${BROWSER_TTS_URL_PREFIX}/`;
hfEnv.useBrowserCache = true;
hfEnv.useFS = false;
hfEnv.useFSCache = false;
kokoroEnv.wasmPaths = WASM_PATHS;
if (hfEnv.backends.onnx.wasm) {
  hfEnv.backends.onnx.wasm.wasmPaths = WASM_PATHS;
}

const nativeFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => cachedFetch(rewrite(input), init);

let tts: KokoroTTS | null = null;
let chain = Promise.resolve();

self.onmessage = (event: MessageEvent<KokoroWorkerIn>) => {
  chain = chain.then(() => handle(event.data)).catch((error) => {
    console.error('[inaudio] on-device worker failed', error, voiceErrorText(error));
    postError(error);
  });
};

async function handle(message: KokoroWorkerIn): Promise<void> {
  if (message.type === 'dispose') {
    tts = null;
    return;
  }
  if (message.type === 'load') {
    const isolated = self.crossOriginIsolated === true;
    const threads = isolated ? Math.max(1, message.threads) : 1;
    if (hfEnv.backends.onnx.wasm) {
      hfEnv.backends.onnx.wasm.numThreads = threads;
      hfEnv.backends.onnx.wasm.wasmPaths = WASM_PATHS;
    }
    if (message.device === 'webgpu') await ensureWebGpu();
    tts = await KokoroTTS.from_pretrained(BROWSER_TTS_MODEL_ID, {
      dtype: 'q8',
      device: message.device,
      progress_callback: (report) => {
        if (!report || typeof report !== 'object') return;
        const file = 'file' in report && typeof report.file === 'string' ? report.file : '';
        const loaded = 'loaded' in report && typeof report.loaded === 'number' ? report.loaded : 0;
        const total = 'total' in report && typeof report.total === 'number' ? report.total : 0;
        if (total > 0) post({ type: 'progress', file, loaded, total });
      },
    });
    post({ type: 'ready', device: message.device, threads, isolated });
    return;
  }
  if (message.type === 'speak') {
    if (!tts) throw new Error('The on-device voice is not loaded.');
    const started = Date.now();
    try {
      const audio = await tts.generate(message.text, {
        voice: message.voice as 'af_heart',
        speed: message.speed,
      });
      const samples = floatSamples(audio);
      const sampleRate = audio.sampling_rate || 24_000;
      post({ type: 'audio', id: message.id, samples, sampleRate, generateMs: Date.now() - started }, [samples.buffer]);
    } catch (error) {
      postError(error, message.id);
    }
  }
}

async function ensureWebGpu(): Promise<void> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) throw new Error('WebGPU is not available in this worker.');
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU has no adapter in this worker.');
}

function floatSamples(audio: { audio?: Float32Array; data?: Float32Array | number[] }): Float32Array {
  const raw = audio.audio ?? audio.data;
  if (raw instanceof Float32Array) return raw;
  if (Array.isArray(raw)) return Float32Array.from(raw);
  throw new Error('The on-device voice returned no audio.');
}

function rewrite(input: RequestInfo | URL): RequestInfo | URL {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const local = rewriteModelUrl(url, self.location.origin);
  if (local === url) return input;
  if (typeof input === 'string' || input instanceof URL) return local;
  return new Request(local, input);
}

async function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url, self.location.origin).pathname.startsWith(BROWSER_TTS_URL_PREFIX)) {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return hit;
      const response = await nativeFetch(input, init);
      if (!response.ok) throw fetchFailed(url, response.status);
      if (response.ok) await cache.put(url, response.clone()).catch(() => undefined);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Could not fetch')) throw error;
      console.error('[inaudio] voice cache miss', url, error);
    }
  }
  const response = await nativeFetch(input, init);
  if (!response.ok) throw fetchFailed(url, response.status);
  return response;
}

function fetchFailed(url: string, status: number): Error {
  return new Error(`Could not fetch ${url} (${status})`);
}

function postError(error: unknown, id?: number): void {
  const err = error instanceof Error ? error : new Error(String(error));
  post({ type: 'error', id, message: err.message || 'The on-device voice failed.', name: err.name, stack: err.stack });
}

function post(message: KokoroWorkerOut, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}
