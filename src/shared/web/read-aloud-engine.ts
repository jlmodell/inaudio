import type { VoiceId } from '../domain/models';

export const READ_ALOUD_ENGINES = ['browser', 'speech', 'server'] as const;
export type ReadAloudEngine = (typeof READ_ALOUD_ENGINES)[number];

export const DEFAULT_READ_ALOUD_ENGINE: ReadAloudEngine = 'browser';

/** Kokoro v1.0 voice names that match the desktop v0.19 speaker list. */
export const BROWSER_VOICE_BY_ID: Record<VoiceId, string> = {
  '00': 'af_heart',
  '01': 'af_bella',
  '02': 'af_nicole',
  '03': 'af_sarah',
  '04': 'af_sky',
  '05': 'am_adam',
  '06': 'am_michael',
  '07': 'bf_emma',
  '08': 'bf_isabella',
  '09': 'bm_george',
  '10': 'bm_lewis',
};

export function browserVoiceName(voiceId: string): string {
  return BROWSER_VOICE_BY_ID[voiceId as VoiceId] ?? 'af_heart';
}

/** A failed on-device load uses the built-in voice on that device only. */
export function effectiveReadAloudEngine(
  preferred: ReadAloudEngine,
  deviceFallback: ReadAloudEngine | null,
): ReadAloudEngine {
  if (preferred === 'browser' && deviceFallback === 'speech') return 'speech';
  return preferred;
}

export function readAloudProgressPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

export const MIN_READ_SPEED = 0.5;
export const MAX_READ_SPEED = 3;
export const READ_SPEED_PRESETS = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export function clampReadSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_READ_SPEED, Math.max(MIN_READ_SPEED, Math.round(speed * 20) / 20));
}

export const READ_ALOUD_RUNTIMES = ['webgpu', 'wasm-multi', 'wasm-single', 'speech', 'server'] as const;
export type ReadAloudRuntime = (typeof READ_ALOUD_RUNTIMES)[number];

export function wasmThreadCount(isolated: boolean, cores: number): number {
  if (!isolated) return 1;
  return Math.min(8, Math.max(1, Math.floor(cores) || 1));
}

export function kokoroRuntime(device: 'wasm' | 'webgpu', threads: number): ReadAloudRuntime {
  if (device === 'webgpu') return 'webgpu';
  return threads > 1 ? 'wasm-multi' : 'wasm-single';
}

export function readAloudRuntimeLabel(runtime: ReadAloudRuntime): string {
  switch (runtime) {
    case 'webgpu':
      return 'WebGPU';
    case 'wasm-multi':
      return 'WASM, several threads';
    case 'wasm-single':
      return 'WASM, 1 thread';
    case 'speech':
      return "This browser's voice";
    case 'server':
      return 'This server';
  }
}

export interface SentenceTiming {
  index: number;
  count: number;
  chars: number;
  generateMs: number;
  durationMs: number;
}

export function sentenceRealtimeFactor(timing: SentenceTiming): number {
  if (timing.durationMs <= 0) return 0;
  return timing.generateMs / timing.durationMs;
}
