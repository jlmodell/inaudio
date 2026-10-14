import { create } from 'zustand';
import {
  IDLE_READ_ALOUD,
  READ_ALOUD_KEEP_BEHIND,
  type ReadAloudChunk,
  type ReadAloudControl,
  type ReadAloudSession,
  type ReadAloudState,
} from '@shared/domain/read-aloud';
import type { Settings } from '@shared/domain/settings';
import { toast } from '@renderer/components/ui/toast';
import { api, errorMessage } from '@renderer/lib/api';
import { encodeWav, SegmentPlayer } from '@renderer/lib/audio-player';
import { keys, queryClient } from '@renderer/lib/queries';

interface ReadAloudStore {
  session: ReadAloudSession | null;
  state: ReadAloudState;
  /** Segments held for replay and export, so the page can tell whether Save WAV has everything. */
  cached: number;
  /** A start that failed before the main process took it, such as an invalid request. */
  error: string | null;
  readText(text: string): Promise<void>;
  readClipboard(): Promise<void>;
  control(action: Exclude<ReadAloudControl['action'], 'seek'>): void;
  seek(index: number): void;
  /** Milliseconds played since the start of the session. */
  elapsed(): number;
  exportWav(): string | null;
}

const player = new SegmentPlayer();
const buffers = new Map<number, Float32Array>();
let sampleRate = 24_000;
let bufferSession: string | null = null;
let bufferTake = 0;
/** The segment last started, so a repeated state push does not restart it. */
let started: { sessionId: string; index: number; seek: number } | null = null;

function settings(): Settings | undefined {
  return queryClient.getQueryData<Settings>(keys.settings);
}

function stopPlayback(): void {
  started = null;
  player.stop();
}

function startSegment(state: ReadAloudState): void {
  const samples = buffers.get(state.index);
  if (!samples || !state.sessionId) return;
  const marker = { sessionId: state.sessionId, index: state.index, seek: state.seek };
  started = marker;
  const current = settings();
  void player
    .play(
      samples,
      sampleRate,
      { deviceId: current?.audio.outputDeviceId ?? 'default', volume: current?.tts.volume ?? 1 },
      () => {
        if (started === marker) api.readAloud.report({ ...marker, type: 'ended' });
      },
    )
    .catch((error: unknown) => {
      if (started === marker) api.readAloud.report({ sessionId: marker.sessionId, type: 'error', message: errorMessage(error).slice(0, 200) });
    });
}

/** Brings the player in line with what the main process says should be happening. */
function reconcile(): void {
  const { state } = useReadAloud.getState();
  if (state.sessionId !== bufferSession) {
    stopPlayback();
    buffers.clear();
    bufferSession = state.sessionId;
    bufferTake = state.take;
  }
  if (state.take !== bufferTake) {
    for (const index of buffers.keys()) if (index > state.index) buffers.delete(index);
    bufferTake = state.take;
  }
  for (const index of buffers.keys()) if (index < state.index - READ_ALOUD_KEEP_BEHIND) buffers.delete(index);
  if (useReadAloud.getState().cached !== buffers.size) useReadAloud.setState({ cached: buffers.size });

  if (state.status === 'paused') {
    player.pause();
    return;
  }
  if (state.status !== 'playing' && state.status !== 'preparing') {
    stopPlayback();
    return;
  }
  player.resume();
  const fresh = !started || started.sessionId !== state.sessionId || started.index !== state.index || started.seek !== state.seek;
  if (fresh && buffers.has(state.index)) startSegment(state);
}

function onChunk(chunk: ReadAloudChunk): void {
  const { state } = useReadAloud.getState();
  if (chunk.sessionId !== state.sessionId || chunk.take !== state.take) return;
  sampleRate = chunk.sampleRate;
  buffers.set(chunk.index, chunk.samples);
  reconcile();
}

function onState(state: ReadAloudState): void {
  const previous = useReadAloud.getState().state;
  useReadAloud.setState({ state, error: null });
  reconcile();
  const visible = document.visibilityState === 'visible';
  if (state.status === 'error' && previous.status !== 'error' && state.message && visible) {
    toast(state.message, { tone: 'danger' });
  }
}

export const useReadAloud = create<ReadAloudStore>((set, get) => ({
  session: null,
  state: { ...IDLE_READ_ALOUD },
  cached: 0,
  error: null,

  async readText(text) {
    set({ error: null });
    try {
      await api.readAloud.start({ source: 'manual', text });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async readClipboard() {
    set({ error: null });
    try {
      await api.readAloud.start({ source: 'clipboard' });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  control(action) {
    const { sessionId } = get().state;
    if (sessionId) void api.readAloud.control({ sessionId, action }).catch(() => undefined);
  },

  seek(index) {
    const { sessionId } = get().state;
    if (sessionId) void api.readAloud.control({ sessionId, action: 'seek', index }).catch(() => undefined);
  },

  elapsed() {
    const { state } = get();
    const before = state.durations.slice(0, state.index).reduce((sum, ms) => sum + ms, 0);
    return before + (started?.index === state.index ? player.position() : 0);
  },

  exportWav() {
    const { count } = get().state;
    if (!count || buffers.size < count) return null;
    const parts = Array.from({ length: count }, (_, i) => buffers.get(i));
    if (parts.some((part) => !part)) return null;
    const total = parts.reduce((sum, part) => sum + (part?.length ?? 0), 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      if (!part) continue;
      samples.set(part, offset);
      offset += part.length;
    }
    return URL.createObjectURL(encodeWav(samples, sampleRate));
  },
}));

/**
 * Connects the player to the main process for the life of the app window. Playback has to
 * keep going while the window is hidden or on another page, so it lives here, not in the page.
 */
export function connectReadAloud(): () => void {
  const offs = [
    api.events.onReadAloudSession((session) => useReadAloud.setState({ session })),
    api.events.onReadAloudState(onState),
    api.events.onReadAloudChunk(onChunk),
    api.events.onSettingsChanged((next) => player.setVolume(next.tts.volume)),
  ];
  void api.readAloud.get().then(({ session, state }) => {
    useReadAloud.setState({ session, state });
    reconcile();
  });
  return () => {
    offs.forEach((off) => off());
    stopPlayback();
  };
}
