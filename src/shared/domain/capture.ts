import { z } from 'zod';

/**
 * What a live transcript records: the system mix alone, mixed with the microphone, or one
 * input device the user picked (a virtual cable, a mixer), captured without screen capture.
 */
export const LIVE_SOURCES = ['system', 'system+mic', 'device'] as const;
export const liveSourceSchema = z.enum(LIVE_SOURCES);
export type LiveSource = z.infer<typeof liveSourceSchema>;

/** Where a saved transcript's audio came from. Rows saved before live capture are `microphone`. */
export const TRANSCRIPT_SOURCES = ['microphone', ...LIVE_SOURCES] as const;
export const transcriptSourceSchema = z.enum(TRANSCRIPT_SOURCES);
export type TranscriptSource = z.infer<typeof transcriptSourceSchema>;

export const LIVE_SAMPLE_RATE = 16_000;
/** No chunk is longer than the chunker's hard cut; 30 s leaves room for the search window. */
export const LIVE_MAX_CHUNK_SAMPLES = LIVE_SAMPLE_RATE * 30;
/** The session limits a user can choose, in minutes. A session stops on its own after one. */
export const LIVE_SESSION_MINUTES = [30, 60, 120, 180] as const;
export const liveSessionMinutesSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(120),
  z.literal(180),
]);
export type LiveSessionMinutes = z.infer<typeof liveSessionMinutesSchema>;
/** The provisional line is one stretch of speech, so it never needs more than this. */
export const LIVE_MAX_PREVIEW_CHARS = 2_000;
/** The floating window shows the end of the transcript; the page has the rest. */
export const LIVE_WINDOW_TAIL_CHARS = 8_000;
/** Sources that go through getDisplayMedia and so need the one-shot capture grant. */
export function needsDisplayCapture(source: LiveSource): boolean {
  return source !== 'device';
}
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
  /**
   * What the engine makes of the stretch still being spoken. Grey, provisional, and replaced
   * when the finished chunk with `previewSeq` or later is transcribed.
   */
  preview: string;
  previewSeq: number;
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
  preview: '',
  previewSeq: -1,
  savedId: null,
  durationMs: 0,
};

export function liveActive(phase: LivePhase): boolean {
  return phase === 'starting' || phase === 'capturing' || phase === 'finishing';
}

/** Chromium's WebRTC processing for a microphone track, from the audio settings. */
export interface MicProcessing {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceIsolation: boolean;
}

/** Main → app window: what the capturing renderer must do next. */
export type LiveCommand =
  | {
      type: 'start';
      sessionId: string;
      source: LiveSource;
      micDeviceId: string;
      /** The input recorded by the `device` source. */
      deviceId: string;
      micGain: number;
      systemGain: number;
      mic: MicProcessing;
      /** Send provisional audio for the line that updates while someone speaks. */
      preview: boolean;
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

/** How a chunk's audio ended, which decides how its text joins the next. */
export const CHUNK_CUTS = ['pause', 'limit', 'end'] as const;
export type ChunkCutKind = (typeof CHUNK_CUTS)[number];

export interface LiveChunk {
  sessionId: string;
  /** Increments by one per chunk; the main process refuses repeats. */
  seq: number;
  samples: Float32Array;
  cut: ChunkCutKind;
  /** Quiet before this chunk's speech, in ms. */
  pauseBeforeMs: number;
  /** Audio at its start repeated from the previous chunk, in ms. */
  overlapMs: number;
}

/** The unfinished stretch, sent for the provisional line. Never stored or saved. */
export type LivePreview = Pick<LiveChunk, 'sessionId' | 'seq' | 'samples'>;

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
