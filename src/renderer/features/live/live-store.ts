import { create } from 'zustand';
import { IDLE_LIVE, type LiveCommand, type LiveSource, type LiveState } from '@shared/domain/capture';
import { MAX_STATE_MESSAGE_CHARS } from '@shared/ipc/schemas';
import { toast } from '@renderer/components/ui/toast';
import { api, errorMessage } from '@renderer/lib/api';
import { SystemAudioUnavailableError, SystemRecorder } from './system-recorder';

/** The overlay meter does not need more than ten updates a second. */
const LEVEL_REPORT_MS = 100;
/** How often the unfinished stretch is offered for the provisional line. */
const PREVIEW_EVERY_MS = 1_500;

interface LiveStore {
  /** The session as the main process owns it. */
  live: LiveState;
  /** Input level, local to this window. */
  level: number;
  /** A start from a shortcut or the tray is waiting for the recording notice. */
  consent: LiveSource | null;
  /** A request the main process refused before a session existed. */
  error: string | null;
  start(source: LiveSource, acknowledged: boolean): Promise<void>;
  stop(): void;
  cancel(): void;
  dismissConsent(): void;
}

const recorder = new SystemRecorder();
let current: string | null = null;
/** The session being stopped, so a stop and a track ending cannot both flush it. */
let ending: string | null = null;
let seq = 0;
let levelTimer: ReturnType<typeof setInterval> | undefined;
let previewTimer: ReturnType<typeof setInterval> | undefined;
/** A preview request is on its way; the next waits for it, so they never pile up. */
let previewing = false;

function stopPreviews(): void {
  if (previewTimer) clearInterval(previewTimer);
  previewTimer = undefined;
  previewing = false;
}

/**
 * Offers the stretch still being spoken every PREVIEW_EVERY_MS, one request at a time. The
 * main process decides whether the engine has room for it, so this never slows a chunk.
 */
function startPreviews(sessionId: string): void {
  stopPreviews();
  previewTimer = setInterval(() => {
    if (current !== sessionId) return stopPreviews();
    if (previewing) return;
    const samples = recorder.peek();
    if (!samples) return;
    previewing = true;
    void api.live
      .preview({ sessionId, seq, samples })
      .catch(() => undefined)
      .finally(() => {
        previewing = false;
      });
  }, PREVIEW_EVERY_MS);
}

function stopLevels(): void {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = undefined;
}

function startLevels(sessionId: string): void {
  stopLevels();
  let last = -1;
  levelTimer = setInterval(() => {
    const { level } = useLive.getState();
    if (current !== sessionId) return stopLevels();
    if (level === last) return;
    last = level;
    api.live.report({ type: 'level', sessionId, level });
  }, LEVEL_REPORT_MS);
}

/** Turns a capture failure into one line a person can act on. */
function describe(error: unknown): string {
  if (error instanceof SystemAudioUnavailableError) return error.message;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'System audio capture was blocked or cancelled. Start again to retry.';
  if (name === 'InvalidStateError') return 'Start the live transcript from Inaudio, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'The selected microphone or audio device is not available.';
  if (name === 'NotReadableError') return 'The audio device is busy or was disconnected.';
  return errorMessage(error);
}

async function begin(command: Extract<LiveCommand, { type: 'start' }>): Promise<void> {
  const { sessionId } = command;
  if (current) await recorder.dispose();
  current = sessionId;
  seq = 0;
  try {
    await recorder.start({
      source: command.source,
      micDeviceId: command.micDeviceId,
      deviceId: command.deviceId,
      micGain: command.micGain,
      systemGain: command.systemGain,
      mic: command.mic,
      onLevel: (level) => useLive.setState({ level }),
      onChunk: ({ samples, cut, pauseBeforeMs, overlapMs }) => {
        if (current !== sessionId) return;
        // Failures are reported by the main process on the session itself.
        void api.live.chunk({ sessionId, seq: seq++, samples, cut, pauseBeforeMs, overlapMs }).catch(() => undefined);
      },
      onTrackEnded: () => void finish(sessionId, 'track-ended'),
    });
    if (current !== sessionId) {
      await recorder.dispose();
      return;
    }
    api.live.report({ type: 'capturing', sessionId, ownAudioFiltered: recorder.ownAudioFiltered });
    startLevels(sessionId);
    if (command.preview) startPreviews(sessionId);
  } catch (error) {
    if (current !== sessionId) return;
    current = null;
    api.live.report({ type: 'error', sessionId, message: describe(error).slice(0, MAX_STATE_MESSAGE_CHARS) });
  }
}

async function finish(sessionId: string, reason: 'stopped' | 'track-ended'): Promise<void> {
  if (current !== sessionId || ending === sessionId) return;
  ending = sessionId;
  stopLevels();
  stopPreviews();
  useLive.setState({ level: 0 });
  // stop() hands out the last chunk while the session is still current, so that chunk's
  // request leaves before the report and the main process waits for it.
  await recorder.stop();
  if (current === sessionId) current = null;
  ending = null;
  api.live.report({ type: 'ended', sessionId, reason });
}

async function abort(sessionId: string): Promise<void> {
  if (current !== sessionId) return;
  current = null;
  ending = null;
  stopLevels();
  stopPreviews();
  useLive.setState({ level: 0 });
  await recorder.dispose();
}

function onCommand(command: LiveCommand): void {
  if (command.type === 'start') void begin(command);
  else if (command.type === 'stop') void finish(command.sessionId, 'stopped');
  else if (command.type === 'cancel') void abort(command.sessionId);
  else useLive.setState({ consent: command.source });
}

function onState(live: LiveState): void {
  const previous = useLive.getState().live;
  useLive.setState({ live, error: null });
  const visible = document.visibilityState === 'visible';
  if (live.phase === 'error' && previous.phase !== 'error' && live.message && visible) {
    toast(live.message, { tone: 'danger' });
  }
}

export const useLive = create<LiveStore>((set) => ({
  live: { ...IDLE_LIVE },
  level: 0,
  consent: null,
  error: null,

  async start(source, acknowledged) {
    set({ error: null, consent: null });
    try {
      await api.live.start({ source, acknowledged });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  stop() {
    void api.live.stop().catch(() => undefined);
  },

  cancel() {
    void api.live.cancel().catch(() => undefined);
  },

  dismissConsent() {
    set({ consent: null });
  },
}));

/** Connects the capture to the main process for the life of the app window, like Read Aloud. */
export function connectLive(): () => void {
  const offs = [api.events.onLiveState(onState), api.events.onLiveCommand(onCommand)];
  void api.live.get().then((live) => useLive.setState({ live }));
  return () => {
    offs.forEach((off) => off());
    stopLevels();
    stopPreviews();
    if (current) void recorder.dispose();
    current = null;
  };
}
