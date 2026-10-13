import { create } from 'zustand';
import type { Transcript } from '@shared/domain/history';
import { MODEL_CATALOG, type ModelId, type ModelStatus } from '@shared/domain/models';
import type {
  DictationPhase,
  DictationState as ReportedState,
  SystemStatus,
} from '@shared/domain/system';
import { api, errorMessage } from '@renderer/lib/api';
import { queryClient, keys } from '@renderer/lib/queries';
import type { Settings } from '@shared/domain/settings';
import { playCue } from '@renderer/features/dictation/audio/cues';
import { Recorder, TARGET_RATE, trimSilence } from '@renderer/features/dictation/audio/recorder';

const MIN_SPEECH_MS = 250;
const MAX_RECORDING_MS = 10 * 60 * 1000;
/** The overlay draws a level meter, but it does not need one update per animation frame. */
const LEVEL_REPORT_MS = 100;

interface DictationState {
  phase: DictationPhase;
  level: number;
  startedAt: number | null;
  last: Transcript | null;
  lastText: string;
  message: string | null;
  start(): Promise<void>;
  stop(options?: { insert?: boolean }): Promise<void>;
  cancel(): Promise<void>;
  toggle(): Promise<void>;
}

const recorder = new Recorder();
let limitTimer: ReturnType<typeof setTimeout> | undefined;
let starting = false;
/** A stop or cancel that arrived while the microphone was still opening. */
let afterStart: 'stop' | 'cancel' | null = null;

function settings(): Settings | undefined {
  return queryClient.getQueryData<Settings>(keys.settings);
}

/** The cached install state of a model, or undefined before the first status arrives. */
function installed(id: ModelId): boolean | undefined {
  const models =
    queryClient.getQueryData<ModelStatus[]>(keys.models) ??
    queryClient.getQueryData<SystemStatus>(keys.status)?.models;
  return models?.find((model) => model.id === id)?.installed;
}

export const useDictation = create<DictationState>((set, get) => {
  /**
   * The main process owns the authoritative phase and drives the tray and the overlay from
   * it, so every local change is reported. Nothing renders the reported state back, which
   * keeps this one-directional and impossible to loop.
   */
  const report = (): void => {
    const { phase, startedAt, level, message } = get();
    const payload: ReportedState = {
      phase,
      startedAt: startedAt ?? 0,
      level: phase === 'listening' ? level : 0,
      message: message ?? '',
    };
    api.dictation.report(payload);
  };

  const setPhase = (phase: DictationPhase, patch: Partial<DictationState> = {}): void => {
    set({ phase, ...patch });
    report();
  };

  let levelTimer: ReturnType<typeof setInterval> | undefined;
  const stopLevelReports = (): void => {
    if (levelTimer) clearInterval(levelTimer);
    levelTimer = undefined;
  };
  const startLevelReports = (): void => {
    stopLevelReports();
    levelTimer = setInterval(() => {
      if (get().phase !== 'listening') {
        stopLevelReports();
        return;
      }
      report();
    }, LEVEL_REPORT_MS);
  };

  return {
    phase: 'idle',
    level: 0,
    startedAt: null,
    last: null,
    lastText: '',
    message: null,

    async start() {
      if (starting || get().phase === 'listening' || get().phase === 'transcribing') return;
      starting = true;
      afterStart = null;
      try {
        const current = settings() ?? (await api.settings.get());
        const modelId = current.stt.modelId;
        if (installed(modelId) === false) throw new Error(`${MODEL_CATALOG[modelId].name} is not downloaded yet.`);
        // The model is only needed at stop, so a cold engine loads while the user speaks.
        // Transcription awaits the same load, and reports its error if it fails.
        void api.models.load(modelId).catch(() => undefined);
        await recorder.start({
          deviceId: current.audio.inputDeviceId,
          gain: current.audio.inputGain,
          onLevel: (level) => set({ level }),
        });
        if (current.dictation.playCues) void playCue('start', { volume: current.dictation.cueVolume, outputDeviceId: current.audio.outputDeviceId });
        setPhase('listening', { startedAt: Date.now(), message: null, level: 0 });
        startLevelReports();
        limitTimer = setTimeout(() => void get().stop(), MAX_RECORDING_MS);
        starting = false;
        const queued = afterStart;
        afterStart = null;
        if (queued === 'stop') void get().stop();
        else if (queued === 'cancel') void get().cancel();
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        const message =
          name === 'NotAllowedError'
            ? 'Microphone access was denied. Allow it in your system privacy settings.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'The selected microphone is not available.'
              : errorMessage(error);
        setPhase('error', { message });
      } finally {
        starting = false;
      }
    },

    async stop({ insert = true } = {}) {
      if (starting) {
        afterStart = 'stop';
        return;
      }
      if (get().phase !== 'listening') return;
      clearTimeout(limitTimer);
      stopLevelReports();
      const current = settings();
      const raw = await recorder.stop();
      if (current?.dictation.playCues) void playCue('stop', { volume: current.dictation.cueVolume, outputDeviceId: current.audio.outputDeviceId });
      const samples = trimSilence(raw);
      if ((samples.length / TARGET_RATE) * 1000 < MIN_SPEECH_MS) {
        setPhase('idle', { level: 0, startedAt: null, message: 'No speech detected.' });
        return;
      }
      setPhase('transcribing', { level: 0, startedAt: null });
      try {
        const result = await api.dictation.transcribe(samples, { insert });
        void queryClient.invalidateQueries({ queryKey: keys.historyAll });
        const message = !result.text
          ? 'No speech detected.'
          : result.insertError
            ? `Copied to clipboard. Insertion failed: ${result.insertError}`
            : null;
        setPhase('idle', { last: result.transcript, lastText: result.text, message });
      } catch (error) {
        if (current?.dictation.playCues) void playCue('error', { volume: current.dictation.cueVolume, outputDeviceId: current.audio.outputDeviceId });
        setPhase('error', { message: errorMessage(error) });
      }
    },

    async cancel() {
      if (starting) {
        afterStart = 'cancel';
        return;
      }
      clearTimeout(limitTimer);
      stopLevelReports();
      await recorder.dispose();
      setPhase('idle', { level: 0, startedAt: null, message: null });
    },

    async toggle() {
      const { phase } = get();
      if (phase === 'listening' || starting) await get().stop();
      else if (phase !== 'transcribing' && phase !== 'inserting') await get().start();
    },
  };
});
