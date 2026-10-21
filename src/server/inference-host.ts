import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { log } from './log';
import type {
  PingResult,
  SttCleanup,
  SttResult,
  TtsResult,
  WorkerMessage,
  WorkerRequest,
} from '@shared/worker/protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestInput = DistributiveOmit<WorkerRequest, 'id'>;
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

const TIMEOUTS: Record<RequestInput['type'], number> = {
  'stt:load': 120_000,
  'stt:transcribe': 180_000,
  'tts:load': 120_000,
  'tts:speak': 180_000,
  'text:punct': 30_000,
  unload: 10_000,
  ping: 5_000,
};

function workerFile(): string {
  const self = fileURLToPath(import.meta.url);
  return self.endsWith('.ts')
    ? fileURLToPath(new URL('./inference-worker.ts', import.meta.url))
    : fileURLToPath(new URL('./inference-worker.mjs', import.meta.url));
}

/** Supervises the sherpa-onnx worker thread. Same request surface as the Electron host. */
export class NodeInferenceHost extends EventEmitter<{
  health: [{ state: string; lastError?: string }];
}> {
  private child: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;
  private loaded: { stt?: string; tts?: string } = {};

  isLoaded(modelId: string): boolean {
    return this.loaded.stt === modelId || this.loaded.tts === modelId;
  }

  start(): Promise<void> {
    if (this.ready) return this.ready;
    const child = new Worker(workerFile());
    this.child = child;
    this.ready = new Promise<void>((resolve, reject) => {
      const bootTimer = setTimeout(() => reject(new Error('Inference worker did not start')), 20_000);
      child.on('message', (message: WorkerMessage) => {
        if ('type' in message) {
          if (message.type === 'ready') {
            clearTimeout(bootTimer);
            log.info('Inference worker is ready');
            resolve();
          } else if (message.type === 'log') {
            const line = `[web-inference] ${message.message}`;
            if (message.level === 'error') log.error(line);
            else log.info(line);
          }
          return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error(message.error));
      });
      child.once('error', (error) => {
        clearTimeout(bootTimer);
        log.error('Inference worker failed to start', error);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(bootTimer);
        if (code) log.error(`Inference worker exited (${code})`);
        this.fail(new Error(`Inference worker exited (${code})`));
      });
    });
    this.ready.catch(() => undefined);
    return this.ready;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.ready = null;
    this.loaded = {};
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Inference worker stopped'));
    }
    this.pending.clear();
    if (!child) return;
    await child.terminate();
  }

  async loadStt(input: Extract<RequestInput, { type: 'stt:load' }>): Promise<void> {
    if (this.loaded.stt === input.modelId) return;
    delete this.loaded.stt;
    await this.request(input);
    this.loaded.stt = input.modelId;
  }

  async loadTts(input: Extract<RequestInput, { type: 'tts:load' }>): Promise<void> {
    if (this.loaded.tts === input.modelId) return;
    delete this.loaded.tts;
    await this.request(input);
    this.loaded.tts = input.modelId;
  }

  transcribe(samples: Float32Array, sampleRate: number, cleanup?: SttCleanup): Promise<SttResult> {
    return this.request({ type: 'stt:transcribe', samples, sampleRate, cleanup }) as Promise<SttResult>;
  }

  punctuate(text: string, model: string, vocab: string): Promise<string> {
    return this.request({ type: 'text:punct', text, model, vocab }) as Promise<string>;
  }

  speak(text: string, sid: number, speed: number): Promise<TtsResult> {
    return this.request({ type: 'tts:speak', text, sid, speed }) as Promise<TtsResult>;
  }

  ping(): Promise<PingResult> {
    return this.request({ type: 'ping' }) as Promise<PingResult>;
  }

  private async request(input: RequestInput): Promise<unknown> {
    await this.start();
    const child = this.child;
    if (!child) throw new Error('Inference worker is not running');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Inference request timed out (${input.type})`));
      }, TIMEOUTS[input.type]);
      this.pending.set(id, { resolve, reject, timer });
      child.postMessage({ ...input, id } as WorkerRequest);
    });
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.child = null;
    this.ready = null;
    this.loaded = {};
  }
}
