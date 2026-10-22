import type { TextSegment } from '../read-aloud/segment';
import type { VoiceId } from './models';

export type { TextSegment };

/** Longest text one session reads; a longer selection is cut here and says so. */
export const MAX_READ_ALOUD_CHARS = 50_000;
/**
 * Played segments the renderer keeps for replay and seeking back. Both sides drop anything
 * further behind the current segment, so the main process knows what must be synthesized again.
 */
export const READ_ALOUD_KEEP_BEHIND = 30;

export type ReadAloudStatus =
  | 'idle'
  | 'capturing'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error';

export type ReadAloudSource = 'selection' | 'clipboard' | 'manual';

/** The text of a session. Sent once when the session starts, never logged. */
export interface ReadAloudSession {
  sessionId: string;
  source: ReadAloudSource;
  text: string;
  segments: TextSegment[];
  /** The input was longer than MAX_READ_ALOUD_CHARS and only its start is read. */
  truncated: boolean;
}

/** Playback state, owned by the main process and mirrored by every surface. */
export interface ReadAloudState {
  sessionId: string | null;
  status: ReadAloudStatus;
  /** The segment playing, or the one waited for. */
  index: number;
  count: number;
  /** Bumped by seek and replay, so the player restarts even on the same index. */
  seek: number;
  /** Bumped when voice or speed change; the current sentence and those ahead are synthesized again. */
  take: number;
  /** Duration of each delivered segment in ms, or 0 while it is not synthesized yet. */
  durations: number[];
  /** True while the current segment is still being synthesized. */
  waiting: boolean;
  voiceId: VoiceId;
  speed: number;
  /** A short reason shown with the error status or a failed capture. */
  message: string;
}

export const IDLE_READ_ALOUD: ReadAloudState = {
  sessionId: null,
  status: 'idle',
  index: 0,
  count: 0,
  seek: 0,
  take: 0,
  durations: [],
  waiting: false,
  voiceId: '00',
  speed: 1,
  message: '',
};

/** One synthesized segment on its way to the player. */
export interface ReadAloudChunk {
  sessionId: string;
  index: number;
  take: number;
  samples: Float32Array;
  sampleRate: number;
}

/** What the player tells the main process about a segment. */
export type ReadAloudReport =
  | { sessionId: string; type: 'ended'; index: number; seek: number }
  | { sessionId: string; type: 'error'; message: string };

export type ReadAloudControl =
  | { sessionId: string; action: 'pause' | 'resume' | 'stop' | 'replay' }
  | { sessionId: string; action: 'seek'; index: number };

export type ReadAloudStart = { source: 'selection' | 'clipboard' } | { source: 'manual'; text: string };

/** True while a session is producing or holding audio. */
export function readAloudActive(status: ReadAloudStatus): boolean {
  return status === 'capturing' || status === 'preparing' || status === 'playing' || status === 'paused';
}
