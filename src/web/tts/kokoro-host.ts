import { kokoroRuntime, wasmThreadCount, type KokoroDtype, type ReadAloudRuntime } from '@shared/web/read-aloud-engine';
import { isWebGpuFailure, logVoiceError, workerFailureText } from '@shared/web/voice-error';
import { preferredKokoroDevice } from './detect';
import type { KokoroDevice, KokoroWorkerIn, KokoroWorkerOut } from './protocol';

type ProgressHook = (progress: { file: string; loaded: number; total: number }) => void;

export type KokoroLoadInfo = {
  runtime: ReadAloudRuntime;
  threads: number;
  isolated: boolean;
  device: KokoroDevice;
  dtype: KokoroDtype;
};

/**
 * One Web Worker holds the Kokoro session. Speaks are queued in the worker so
 * the host can keep several sentences in flight.
 */
export class KokoroHost {
  private worker: Worker | null = null;
  private ready: Promise<KokoroLoadInfo> | null = null;
  private info: KokoroLoadInfo | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (audio: {
        samples: Float32Array;
        sampleRate: number;
        generateMs: number;
        phonemes: string;
        voice: string;
      }) => void;
      reject: (error: Error) => void;
    }
  >();
  private loadReject: ((error: Error) => void) | null = null;
  private onProgress: ProgressHook | null = null;

  async load(onProgress?: ProgressHook, device?: KokoroDevice): Promise<KokoroLoadInfo> {
    this.onProgress = onProgress ?? this.onProgress;
    if (this.ready && this.info && matchesDevice(this.info.device, device)) return this.ready;
    if (this.ready && this.info && device && this.info.device !== device) this.dispose();
    this.ready = this.tryLoad(device);
    try {
      return await this.ready;
    } catch (error) {
      this.ready = null;
      throw error;
    }
  }

  loaded(): KokoroLoadInfo | null {
    return this.info;
  }

  private async tryLoad(device?: KokoroDevice): Promise<KokoroLoadInfo> {
    const first = device ?? preferredKokoroDevice();
    try {
      return await this.open(first);
    } catch (error) {
      logVoiceError(`on-device load failed (${first})`, error);
      if (first !== 'webgpu') throw error;
      this.disposeWorkerOnly();
      return this.open('wasm');
    }
  }

  async speak(
    text: string,
    voice: string,
    speed: number,
  ): Promise<{ samples: Float32Array; sampleRate: number; generateMs: number; phonemes: string; voice: string }> {
    await this.load();
    try {
      return await this.speakOnce(text, voice, speed);
    } catch (error) {
      if (this.info?.device !== 'webgpu' && !isWebGpuFailure(error)) throw error;
      logVoiceError('WebGPU generate failed; trying WASM', error);
      this.dispose();
      await this.load(this.onProgress ?? undefined, 'wasm');
      return this.speakOnce(text, voice, speed);
    }
  }

  dispose(): void {
    for (const { reject } of this.pending.values()) reject(new Error('Stopped'));
    this.pending.clear();
    this.loadReject?.(new Error('Stopped'));
    this.loadReject = null;
    this.ready = null;
    this.info = null;
    const worker = this.worker;
    this.worker = null;
    try {
      worker?.postMessage({ type: 'dispose' } satisfies KokoroWorkerIn);
    } catch {
      /* already gone */
    }
    worker?.terminate();
  }

  private speakOnce(
    text: string,
    voice: string,
    speed: number,
  ): Promise<{ samples: Float32Array; sampleRate: number; generateMs: number; phonemes: string; voice: string }> {
    const worker = this.worker;
    if (!worker) throw new Error('The on-device voice is not loaded.');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'speak', id, text, voice, speed });
    });
  }

  private async open(device: KokoroDevice): Promise<KokoroLoadInfo> {
    this.disposeWorkerOnly();
    const threads = wasmThreadCount(globalThis.crossOriginIsolated === true, navigator.hardwareConcurrency ?? 4);
    const worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => settle(new Error('The on-device voice took too long to load.')), 180_000);
      let settled = false;
      const settle = (error?: Error, info?: KokoroLoadInfo) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        worker.onmessage = (event: MessageEvent<KokoroWorkerOut>) => this.onMessage(event.data);
        worker.onerror = (event) => this.fail(workerError(event));
        worker.onmessageerror = () => this.fail(new Error('The on-device voice could not start (worker messageerror).'));
        this.loadReject = null;
        if (error || !info) reject(error ?? new Error('The on-device voice could not start.'));
        else resolve(info);
      };
      this.loadReject = (error) => settle(error);
      worker.onerror = (event) => settle(workerError(event));
      worker.onmessageerror = () => settle(new Error('The on-device voice could not start (worker messageerror).'));
      worker.onmessage = (event: MessageEvent<KokoroWorkerOut>) => {
        if (event.data.type === 'progress') {
          this.onProgress?.(event.data);
          return;
        }
        if (event.data.type === 'ready') {
          const info = {
            runtime: kokoroRuntime(event.data.device, event.data.threads),
            threads: event.data.threads,
            isolated: event.data.isolated,
            device: event.data.device,
            dtype: event.data.dtype,
          };
          this.info = info;
          settle(undefined, info);
          return;
        }
        if (event.data.type === 'error') settle(fromWorkerError(event.data));
      };
      this.send({ type: 'load', device, threads });
    });
  }

  private onMessage(message: KokoroWorkerOut): void {
    if (message.type === 'progress') {
      this.onProgress?.(message);
      return;
    }
    if (message.type === 'audio') {
      this.pending.get(message.id)?.resolve({
        samples: message.samples,
        sampleRate: message.sampleRate,
        generateMs: message.generateMs,
        phonemes: message.phonemes,
        voice: message.voice,
      });
      this.pending.delete(message.id);
      return;
    }
    if (message.type === 'error') {
      const error = fromWorkerError(message);
      if (message.id !== undefined) {
        this.pending.get(message.id)?.reject(error);
        this.pending.delete(message.id);
        return;
      }
      this.fail(error);
    }
  }

  private fail(error: Error): void {
    this.loadReject?.(error);
    this.loadReject = null;
    this.ready = null;
    this.info = null;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.disposeWorkerOnly();
  }

  private disposeWorkerOnly(): void {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }

  private send(message: KokoroWorkerIn): void {
    this.worker?.postMessage(message);
  }
}

function matchesDevice(current: KokoroDevice, wanted?: KokoroDevice): boolean {
  return !wanted || current === wanted;
}

function fromWorkerError(message: {
  message: string;
  name?: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  url?: string;
}): Error {
  const error = new Error(
    workerFailureText({
      message: message.message,
      filename: message.filename,
      lineno: message.lineno,
      colno: message.colno,
      url: message.url,
    }),
  );
  if (message.name) error.name = message.name;
  if (message.stack) error.stack = message.stack;
  return error;
}

function workerError(event: ErrorEvent): Error {
  const error = new Error(
    workerFailureText({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    }),
  );
  if (event.error instanceof Error && event.error.stack) error.stack = event.error.stack;
  return error;
}

let shared: KokoroHost | null = null;

export function kokoroHost(): KokoroHost {
  shared ??= new KokoroHost();
  return shared;
}

export function resetKokoroHost(): void {
  shared?.dispose();
  shared = null;
}
