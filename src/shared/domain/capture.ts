import { z } from 'zod';

/** What a live transcript records: the system mix alone, or mixed with the microphone. */
export const LIVE_SOURCES = ['system', 'system+mic'] as const;
export const liveSourceSchema = z.enum(LIVE_SOURCES);
export type LiveSource = z.infer<typeof liveSourceSchema>;

/** Where a saved transcript's audio came from. Rows saved before live capture are `microphone`. */
export const TRANSCRIPT_SOURCES = ['microphone', ...LIVE_SOURCES] as const;
export const transcriptSourceSchema = z.enum(TRANSCRIPT_SOURCES);
export type TranscriptSource = z.infer<typeof transcriptSourceSchema>;

export const LIVE_SAMPLE_RATE = 16_000;
/** No chunk is longer than the chunker's hard cut; 30 s leaves room for the search window. */
export const LIVE_MAX_CHUNK_SAMPLES = LIVE_SAMPLE_RATE * 30;
/** A session stops on its own after three hours. */
export const LIVE_MAX_SESSION_MS = 3 * 60 * 60 * 1000;
/** Audio waiting for the engine beyond this is reported, never silently dropped. */
export const LIVE_BACKLOG_WARN_MS = 2 * 60 * 1000;

export type LivePhase = 'idle' | 'starting' | 'capturing' | 'finishing' | 'error';

/** The live session as the main process owns it. Pushed to the app window on every change. */
export interface LiveState {
  phase: LivePhase;
  sessionId: string | null;
  source: LiveSource;
  /** Epoch ms capture began; 0 until the stream is live. */
  startedAt: number;
  /** Finished chunks, in order, one paragraph each. */
  text: string;
  parts: number;
  /** Audio waiting for the engine, in ms. */
  pendingMs: number;
  /** The engine has fallen more than LIVE_BACKLOG_WARN_MS behind. */
  behind: boolean;
  /** Inaudio's own audio is filtered out of the capture. */
  ownAudioFiltered: boolean;
  /** One short line: why the session failed or how it ended. */
  message: string;
  /** History id of the last saved session, so the page can say it was kept. */
  savedId: string | null;
  /** Audio transcribed so far, in ms. */
  durationMs: number;
}

export const IDLE_LIVE: LiveState = {
  phase: 'idle',
  sessionId: null,
  source: 'system',
  startedAt: 0,
  text: '',
  parts: 0,
  pendingMs: 0,
  behind: false,
  ownAudioFiltered: false,
  message: '',
  savedId: null,
  durationMs: 0,
};

export function liveActive(phase: LivePhase): boolean {
  return phase === 'starting' || phase === 'capturing' || phase === 'finishing';
}

/** Main → app window: what the capturing renderer must do next. */
export type LiveCommand =
  | {
      type: 'start';
      sessionId: string;
      source: LiveSource;
      micDeviceId: string;
      micGain: number;
      systemGain: number;
    }
  | { type: 'stop'; sessionId: string }
  | { type: 'cancel'; sessionId: string }
  /** A start from a shortcut or the tray before the user has seen the recording notice. */
  | { type: 'consent'; source: LiveSource };

/** App window → main: what the capturing renderer is actually doing. */
export type LiveReport =
  | { type: 'capturing'; sessionId: string; ownAudioFiltered: boolean }
  | { type: 'level'; sessionId: string; level: number }
  | { type: 'ended'; sessionId: string; reason: 'stopped' | 'track-ended' }
  | { type: 'error'; sessionId: string; message: string };

export interface LiveChunk {
  sessionId: string;
  /** Increments by one per chunk; the main process refuses repeats. */
  seq: number;
  samples: Float32Array;
}

export interface LiveStartInput {
  source: LiveSource;
  /** The user confirmed the recording notice for this start. */
  acknowledged: boolean;
}

/** What this platform lets the app do with system audio. */
export interface SystemAudioSupport {
  available: boolean;
  /** `loopback`: granted without a picker. `system-picker`: macOS asks for a screen each time. */
  mode: 'loopback' | 'system-picker' | 'none';
  /** Inaudio's own playback can be filtered out of the capture. */
  ownAudioFiltered: boolean;
  /** Why it is unavailable, empty otherwise. */
  reason: string;
}
