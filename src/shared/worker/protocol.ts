import type { TtsVariant } from '../domain/models';

/** Messages the main process sends to the inference utility process. */
export type WorkerRequest =
  | { id: number; type: 'tts:load'; modelId: string; dir: string; layout: TtsVariant; threads: number }
  | { id: number; type: 'tts:speak'; text: string; sid: number; speed: number }
  | { id: number; type: 'unload'; kind: 'tts' | 'all' }
  | { id: number; type: 'ping' };

export interface TtsResult {
  samples: Float32Array;
  sampleRate: number;
  inferenceMs: number;
}

export interface PingResult {
  loadedTts?: string;
  memoryRss: number;
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type WorkerEvent = { type: 'ready' } | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export type WorkerMessage = WorkerResponse | WorkerEvent;
