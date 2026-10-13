import { EventEmitter } from 'node:events';
import path from 'node:path';
import { utilityProcess, type UtilityProcess } from 'electron';
import type { WorkerHealth } from '@shared/domain/system';
import type { PingResult, SttResult, TtsResult, WorkerMessage, WorkerRequest } from '@shared/worker/protocol';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestInput = DistributiveOmit<WorkerRequest, 'id'>;
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}
const TIMEOUTS: Record<RequestInput['type'], number> = {
  'stt:load': 120_000, 'stt:transcribe': 180_000,
  'tts:load': 120_000, 'tts:speak': 180_000, unload: 10_000, ping: 5_000,
};
const MAX_RESTARTS = 5;

/** Supervises one worker generation; stale messages never affect its replacement. */
export class InferenceHost extends EventEmitter<{ health: [WorkerHealth] }> {
  private child: UtilityProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;
  private health: WorkerHealth = { state: 'stopped', restarts: 0 };
  private loaded: { stt?: string; tts?: string } = {};
  private restartTimer: NodeJS.Timeout | undefined;
  private termination: Promise<void> | null = null;
  private rejectBoot: ((error: Error) => void) | null = null;

  constructor(
    private readonly name: string,
    private readonly entry: string = path.join(__dirname, 'inference-worker.js'),
  ) { super(); }
  getHealth(): WorkerHealth {
    return { ...this.health, loadedStt: this.loaded.stt, loadedTts: this.loaded.tts };
  }
  isLoaded(modelId: string): boolean { return this.loaded.stt === modelId || this.loaded.tts === modelId; }

  start(): Promise<void> {
    if (this.termination) return this.termination.then(() => this.start());
    if (this.ready) return this.ready;
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    if (this.health.restarts > MAX_RESTARTS) return Promise.reject(new Error('Inference worker restart limit reached; restart the application'));
    this.setHealth({ state: 'starting' });
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(this.entry, [], { serviceName: `Inaudio ${this.name}`, stdio: 'pipe' });
    } catch (error) {
      this.setHealth({ state: 'crashed', lastError: String(error) });
      return Promise.reject(error);
    }
    this.child = child;
    const tag = `[${this.name}]`;
    child.stdout?.on('data', (d: Buffer) => process.stdout.write(`${tag} ${d}`));
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(`${tag} ${d}`));
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectBoot = reject;
      const bootTimer = setTimeout(() => this.fail(new Error('Inference worker did not start')), 15_000);
      child.on('message', (message: WorkerMessage) => {
        if (this.child !== child) return;
        if ('type' in message) {
          if (message.type === 'ready') {
            clearTimeout(bootTimer);
            this.rejectBoot = null;
            this.setHealth({ state: 'ready', pid: child.pid, lastError: undefined });
            resolve();
          } else if (message.type === 'log') console[message.level](`${tag} ${message.message}`);
          return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        // The caller gets its result before health listeners run.
        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error(message.error));
        if (!this.pending.size) this.setHealth({ state: 'ready' });
      });
      child.once('exit', (code) => {
        clearTimeout(bootTimer);
        if (this.child !== child) return;
        this.fail(new Error(`Inference worker exited (${code})`));
      });
    });
    this.ready.catch(() => undefined);
    return this.ready;
  }

  async stop(): Promise<void> {
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    await this.terminate(new Error('Inference worker stopped'));
    this.setHealth({ state: 'stopped', pid: undefined });
  }

  async loadStt(input: Extract<RequestInput, { type: 'stt:load' }>): Promise<void> {
    if (this.loaded.stt === input.modelId) return;
    delete this.loaded.stt;
    await this.request(input);
    this.loaded.stt = input.modelId;
    this.emit('health', this.getHealth());
  }
  async loadTts(input: Extract<RequestInput, { type: 'tts:load' }>): Promise<void> {
    if (this.loaded.tts === input.modelId) return;
    delete this.loaded.tts;
    await this.request(input);
    this.loaded.tts = input.modelId;
    this.emit('health', this.getHealth());
  }
  transcribe(samples: Float32Array, sampleRate: number): Promise<SttResult> {
    return this.request({ type: 'stt:transcribe', samples, sampleRate }) as Promise<SttResult>;
  }
  speak(text: string, sid: number, speed: number): Promise<TtsResult> {
    return this.request({ type: 'tts:speak', text, sid, speed }) as Promise<TtsResult>;
  }
  async unload(kind: 'stt' | 'tts' | 'all'): Promise<void> {
    if (kind !== 'all' && !this.loaded[kind]) return;
    // The addon exposes finalizer-owned handles. Process exit guarantees native memory release.
    await this.stop();
  }
  ping(): Promise<PingResult> { return this.request({ type: 'ping' }) as Promise<PingResult>; }

  private async request(input: RequestInput): Promise<unknown> {
    await this.start();
    const child = this.child;
    if (!child) throw new Error('Inference worker is not running');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Inference request timed out (${input.type})`)), TIMEOUTS[input.type]);
      this.pending.set(id, { resolve, reject, timer });
      try { child.postMessage({ ...input, id } as WorkerRequest); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); return; }
      // Health listeners run only after the work is already on its way to the worker.
      if (input.type !== 'ping') this.setHealth({ state: 'busy' });
    });
  }

  private terminate(error: Error): Promise<void> {
    if (this.termination) return this.termination;
    const child = this.child;
    this.child = null;
    this.ready = null;
    this.loaded = {};
    this.rejectBoot?.(error);
    this.rejectBoot = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!child) return Promise.resolve();
    this.termination = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      // An exit callback may already be executing.
      if (!child.kill()) resolve();
    }).finally(() => { this.termination = null; });
    return this.termination;
  }
  private fail(error: Error): void {
    const restarts = this.health.restarts + 1;
    void this.terminate(error);
    this.setHealth({ state: 'crashed', restarts, lastError: error.message, pid: undefined });
    if (restarts <= MAX_RESTARTS) {
      this.restartTimer = setTimeout(() => void this.start().catch(() => undefined), Math.min(30_000, 500 * 2 ** restarts));
    }
  }
  private setHealth(patch: Partial<WorkerHealth>): void {
    this.health = { ...this.health, ...patch };
    this.emit('health', this.getHealth());
  }
}
