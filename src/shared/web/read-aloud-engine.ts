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
