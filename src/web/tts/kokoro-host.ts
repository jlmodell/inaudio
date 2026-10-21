import { preferredKokoroDevice } from './detect';
import type { KokoroDevice, KokoroWorkerIn, KokoroWorkerOut } from './protocol';

type ProgressHook = (progress: { file: string; loaded: number; total: number }) => void;

/**
 * One Web Worker holds the Kokoro session. The next sentence is generated
 * while the current one plays.
 */
export class KokoroHost {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (audio: { samples: Float32Array; sampleRate: number }) => void; reject: (error: Error) => void }
  >();
  private loadReject: ((error: Error) => void) | null = null;
  private onProgress: ProgressHook | null = null;

  async load(onProgress?: ProgressHook): Promise<void> {
    this.onProgress = onProgress ?? null;
    if (this.ready) return this.ready;
    this.ready = this.tryLoad();
    try {
      await this.ready;
    } catch (error) {
      this.ready = null;
      throw error;
    }
  }

  private async tryLoad(): Promise<void> {
    const device = preferredKokoroDevice();
    try {
      await this.open(device);
    } catch (error) {
      if (device !== 'webgpu') throw error;
      this.disposeWorkerOnly();
      await this.open('wasm');
    }
  }

  async speak(text: string, voice: string, speed: number): Promise<{ samples: Float32Array; sampleRate: number }> {
    await this.load();
    const worker = this.worker;
    if (!worker) throw new Error('The on-device voice is not loaded.');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'speak', id, text, voice, speed });
    });
  }

  dispose(): void {
    for (const { reject } of this.pending.values()) reject(new Error('Stopped'));
    this.pending.clear();
    this.loadReject?.(new Error('Stopped'));
    this.loadReject = null;
    this.ready = null;
    const worker = this.worker;
    this.worker = null;
    try {
      worker?.postMessage({ type: 'dispose' } satisfies KokoroWorkerIn);
    } catch {
      /* already gone */
    }
    worker?.terminate();
  }

  private async open(device: KokoroDevice): Promise<void> {
    this.disposeWorkerOnly();
    const worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => settle(new Error('The on-device voice took too long to load.')), 180_000);
      const settle = (error?: Error) => {
        window.clearTimeout(timer);
        worker.onmessage = (event: MessageEvent<KokoroWorkerOut>) => this.onMessage(event.data);
        worker.onerror = (event) => this.fail(new Error(event.message || 'The on-device voice stopped.'));
        worker.onmessageerror = () => this.fail(new Error('The on-device voice could not start.'));
        this.loadReject = null;
        if (error) reject(error);
        else resolve();
      };
      this.loadReject = (error) => settle(error);
      worker.onerror = (event) => settle(new Error(event.message || 'The on-device voice could not start.'));
      worker.onmessageerror = () => settle(new Error('The on-device voice could not start.'));
      worker.onmessage = (event: MessageEvent<KokoroWorkerOut>) => {
        if (event.data.type === 'progress') {
          this.onProgress?.(event.data);
          return;
        }
        if (event.data.type === 'ready') {
          settle();
          return;
        }
        if (event.data.type === 'error') {
          settle(new Error(event.data.message));
        }
      };
      this.send({ type: 'load', device });
    });
  }

  private onMessage(message: KokoroWorkerOut): void {
    if (message.type === 'progress') {
      this.onProgress?.(message);
      return;
    }
    if (message.type === 'audio') {
      this.pending.get(message.id)?.resolve({ samples: message.samples, sampleRate: message.sampleRate });
      this.pending.delete(message.id);
      return;
    }
    if (message.type === 'error') {
      const error = new Error(message.message);
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

let shared: KokoroHost | null = null;

export function kokoroHost(): KokoroHost {
  shared ??= new KokoroHost();
  return shared;
}

export function resetKokoroHost(): void {
  shared?.dispose();
  shared = null;
}
