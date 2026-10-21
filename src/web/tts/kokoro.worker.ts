import { env as hfEnv, Tensor } from '@huggingface/transformers';
import { env as kokoroEnv, KokoroTTS } from 'kokoro-js';
import { phonemize as espeakPhonemize } from 'phonemizer';
import {
  BROWSER_TTS_MODEL_ID,
  BROWSER_TTS_URL_PREFIX,
  BROWSER_TTS_VOICE_BYTES,
  browserTtsVoiceUrl,
  isEnglishKokoroVoice,
} from '@shared/web/browser-tts';
import {
  encodeKokoroPhonemes,
  isEnglishIpa,
  kokoroEspeakLang,
  kokoroStyleOffset,
  phonemizeForKokoro,
  textNeedsEnglishIpa,
} from '@shared/web/kokoro-phonemes';
import { requestUrl, rewriteFetchInput } from '@shared/web/model-url';
import { ORT_URL_PREFIX } from '@shared/web/ort-runtime';
import { voiceErrorText, workerFailureText } from '@shared/web/voice-error';
import type { KokoroWorkerIn, KokoroWorkerOut } from './protocol';

const CACHE = 'inaudio-browser-tts';
const WASM_PATHS = `${ORT_URL_PREFIX}/`;

let lastFetchUrl = '';

self.addEventListener('error', (event) => {
  postCrash(event);
  event.preventDefault();
});
self.addEventListener('unhandledrejection', (event) => {
  postCrash(event.reason);
  event.preventDefault();
});

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
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  lastFetchUrl = requestUrl(input);
  try {
    return cachedFetch(rewriteFetchInput(input, self.location.origin), init);
  } catch (error) {
    return Promise.reject(error);
  }
};

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
      const spoken = await speakEnglish(tts, message.text, message.voice, message.speed);
      post(
        {
          type: 'audio',
          id: message.id,
          samples: spoken.samples,
          sampleRate: spoken.sampleRate,
          generateMs: Date.now() - started,
          phonemes: spoken.phonemes,
          voice: spoken.voice,
        },
        [spoken.samples.buffer],
      );
    } catch (error) {
      postError(error, message.id);
    }
  }
}

const voicePacks = new Map<string, Float32Array>();

async function speakEnglish(
  session: KokoroTTS,
  text: string,
  voice: string,
  speed: number,
): Promise<{ samples: Float32Array; sampleRate: number; phonemes: string; voice: string }> {
  if (!isEnglishKokoroVoice(voice)) {
    throw new Error(`The on-device voice "${voice}" is not an English Kokoro voice.`);
  }
  const language = kokoroEspeakLang(voice);
  const phonemes = await phonemizeForKokoro(text, language, espeakPhonemize);
  if (textNeedsEnglishIpa(text) && !isEnglishIpa(phonemes)) {
    throw new Error('The on-device voice did not turn this English into phonemes (eSpeak-NG).');
  }
  const ids = encodeKokoroPhonemes(phonemes);
  const inputIds = new Tensor(
    'int64',
    BigInt64Array.from(ids, (id) => BigInt(id)),
    [1, ids.length],
  );
  const pack = await loadEnglishVoice(voice);
  const offset = kokoroStyleOffset(ids.length);
  const style = pack.subarray(offset, offset + 256);
  if (style.length !== 256) throw new Error(`The on-device voice "${voice}" has no style for this sentence.`);
  const { waveform } = await session.model({
    input_ids: inputIds,
    style: new Tensor('float32', style, [1, 256]),
    speed: new Tensor('float32', [speed], [1]),
  });
  return { samples: floatSamples(waveform), sampleRate: 24_000, phonemes, voice };
}

async function loadEnglishVoice(name: string): Promise<Float32Array> {
  const hit = voicePacks.get(name);
  if (hit) return hit;
  const url = new URL(browserTtsVoiceUrl(name), self.location.origin).href;
  const response = await fetch(url);
  if (!response.ok) throw fetchFailed(url, response.status);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== BROWSER_TTS_VOICE_BYTES) {
    throw new Error(`The on-device voice "${name}" is ${buffer.byteLength} bytes, not an English style pack.`);
  }
  const pack = new Float32Array(buffer);
  voicePacks.set(name, pack);
  return pack;
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

async function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  lastFetchUrl = url;
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

function postCrash(reason: unknown): void {
  if (reason && typeof reason === 'object' && 'filename' in reason && 'message' in reason) {
    const event = reason as ErrorEvent;
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'The on-device voice failed.');
    postError(error, undefined, { filename: event.filename, lineno: event.lineno, colno: event.colno });
    return;
  }
  postError(reason);
}

function postError(
  error: unknown,
  id?: number,
  extra?: { filename?: string; lineno?: number; colno?: number },
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  post({
    type: 'error',
    id,
    message: workerFailureText({
      message: err.message || 'The on-device voice failed.',
      filename: extra?.filename,
      lineno: extra?.lineno,
      colno: extra?.colno,
      url: lastFetchUrl,
      error: err,
    }),
    name: err.name,
    stack: err.stack,
    filename: extra?.filename,
    lineno: extra?.lineno,
    colno: extra?.colno,
    url: lastFetchUrl || undefined,
  });
}

function post(message: KokoroWorkerOut, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}
