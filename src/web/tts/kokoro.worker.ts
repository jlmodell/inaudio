import { env as hfEnv } from '@huggingface/transformers';
import { env as kokoroEnv, KokoroTTS } from 'kokoro-js';
import { BROWSER_TTS_MODEL_ID, BROWSER_TTS_URL_PREFIX } from '@shared/web/browser-tts';
import type { KokoroWorkerIn, KokoroWorkerOut } from './protocol';

const HF_HOST = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX';
const CACHE = 'inaudio-browser-tts';

hfEnv.allowRemoteModels = false;
hfEnv.allowLocalModels = true;
hfEnv.localModelPath = `${BROWSER_TTS_URL_PREFIX}/`;
hfEnv.useBrowserCache = true;
hfEnv.useFS = false;
hfEnv.useFSCache = false;
kokoroEnv.wasmPaths = '/ort/';

const nativeFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => cachedFetch(rewrite(input), init);

let tts: KokoroTTS | null = null;

self.onmessage = (event: MessageEvent<KokoroWorkerIn>) => {
  void handle(event.data).catch((error) => {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
};

async function handle(message: KokoroWorkerIn): Promise<void> {
  if (message.type === 'dispose') {
    tts = null;
    return;
  }
  if (message.type === 'load') {
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
    post({ type: 'ready', device: message.device });
    return;
  }
  if (message.type === 'speak') {
    if (!tts) throw new Error('The on-device voice is not loaded.');
    const audio = await tts.generate(message.text, {
      voice: message.voice as 'af_heart',
      speed: message.speed,
    });
    const samples = floatSamples(audio);
    const sampleRate = audio.sampling_rate || 24_000;
    post({ type: 'audio', id: message.id, samples, sampleRate }, [samples.buffer]);
  }
}

function floatSamples(audio: { audio?: Float32Array; data?: Float32Array | number[] }): Float32Array {
  const raw = audio.audio ?? audio.data;
  if (raw instanceof Float32Array) return raw;
  if (Array.isArray(raw)) return Float32Array.from(raw);
  throw new Error('The on-device voice returned no audio.');
}

function rewrite(input: RequestInfo | URL): RequestInfo | URL {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const local = rewriteUrl(url);
  if (local === url) return input;
  if (typeof input === 'string' || input instanceof URL) return local;
  return new Request(local, input);
}

function rewriteUrl(url: string): string {
  const [withoutQuery] = url.split('?');
  if (!withoutQuery) return url;
  if (withoutQuery.startsWith(`${HF_HOST}/resolve/`)) {
    const path = withoutQuery.replace(/^https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\//, '');
    return `${BROWSER_TTS_URL_PREFIX}/${BROWSER_TTS_MODEL_ID}/${path}`;
  }
  if (withoutQuery.includes('cdn.jsdelivr.net') || withoutQuery.includes('huggingface.co')) {
    throw new Error('The on-device voice tried to leave this Inaudio.');
  }
  return url;
}

async function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(BROWSER_TTS_URL_PREFIX)) {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return hit;
      const response = await nativeFetch(input, init);
      if (response.ok) await cache.put(url, response.clone()).catch(() => undefined);
      return response;
    } catch {
      /* private mode / quota — fetch without a cache */
    }
  }
  return nativeFetch(input, init);
}

function post(message: KokoroWorkerOut, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}
