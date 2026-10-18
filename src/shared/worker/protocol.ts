import type { SttVariant, TtsVariant } from '../domain/models';

/**
 * Speech cleanup to run before recognition. Each field is a model path the main process
 * built and hash-checked; an absent field skips that step.
 */
export interface SttCleanup {
  /** Silero VAD: keep only the stretches with speech. */
  vad?: string;
  /** GTCRN: suppress background noise. */
  denoiser?: string;
}

/** Messages the main process sends to the inference utility process. */
export type WorkerRequest =
  | { id: number; type: 'stt:load'; modelId: string; dir: string; layout: SttVariant; threads: number }
  | { id: number; type: 'stt:transcribe'; samples: Float32Array; sampleRate: number; cleanup?: SttCleanup }
  | { id: number; type: 'tts:load'; modelId: string; dir: string; layout: TtsVariant; threads: number }
  | { id: number; type: 'tts:speak'; text: string; sid: number; speed: number }
  | { id: number; type: 'text:punct'; text: string; model: string; vocab: string }
  | { id: number; type: 'unload'; kind: 'stt' | 'tts' | 'all' }
  | { id: number; type: 'ping' };

export interface SttResult {
  text: string;
  language: string;
  inferenceMs: number;
}

export interface TtsResult {
  samples: Float32Array;
  sampleRate: number;
  inferenceMs: number;
}

export interface PingResult {
  loadedStt?: string;
  loadedTts?: string;
  memoryRss: number;
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type WorkerEvent = { type: 'ready' } | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export type WorkerMessage = WorkerResponse | WorkerEvent;
