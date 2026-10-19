import type { BrowserWindow } from 'electron';
import {
  MODEL_CATALOG,
  MODEL_IDS,
  sttModelIdSchema,
  ttsModelIdSchema,
  type ModelId,
  type ModelKind,
  type ModelStatus,
} from '@shared/domain/models';
import type { AudioDevice, AppCommand, SystemStatus, WorkerHealth } from '@shared/domain/system';
import { RESERVED_DEVICE_IDS, type Settings, type SettingsPatch } from '@shared/domain/settings';
import { EVENTS } from '@shared/ipc/channels';
import type { SttCleanup } from '@shared/worker/protocol';
import type { AppPaths } from '../app/paths';
import { CleanupModels } from '../app/cleanup-models';
import { DictationController } from './dictation-controller';
import { HistoryRepository } from './history-repository';
import { InferenceHost } from './inference-host';
import { LiveCaptureController } from './live-capture-controller';
import { LiveWindowController } from './live-window-controller';
import { systemAudioSupport } from '../app/platform';
import { ModelManager } from './model-manager';
import { OverlayController } from './overlay-controller';
import { ReadAloudController } from './read-aloud/read-aloud-controller';
import { SettingsStore } from './settings-store';
import type { ShortcutService } from './shortcuts';
import { collectSystemStatus } from './system-status';
import { TextInserter } from './text-insertion';
import type { TrayService } from './tray';
import { CompanionService } from './companion-service';
import { UpdaterService } from './updater';

export interface Services {
  paths: AppPaths;
  settings: SettingsStore;
  history: HistoryRepository;
  models: ModelManager;
  /** Speech recognition and synthesis run in separate workers so neither waits on the other. */
  stt: InferenceHost;
  tts: InferenceHost;
  inserter: TextInserter;
  shortcuts: ShortcutService;
  tray: TrayService;
  companion: CompanionService;
  updater: UpdaterService;
  overlay: OverlayController;
  dictation: DictationController;
  readAloud: ReadAloudController;
  live: LiveCaptureController;
  liveWindow: LiveWindowController;
  /** Speech cleanup for a transcription, from the settings and the verified bundled models. */
  sttCleanup(kind: 'dictation' | 'live'): SttCleanup | undefined;
  /** Records the devices the capturing window can see, for the tray and the id allow-list. */
  reportDevices(devices: AudioDevice[]): void;
  /** The devices last reported, so the overlay can offer the same set the tray does. */
  listDevices(): AudioDevice[];
  /** Installed recognition models, in catalog order. */
  installedSttModels(): { id: ModelId; label: string }[];
  /** Validates a settings patch against the known devices before persisting it. */
  updateSettings(patch: SettingsPatch): Settings;
  window(): BrowserWindow | null;
  /** Opens or brings back the app window and focuses it. */
  showWindow(): void;
  /** Pushes an event to the app window, if it exists. */
  send(channel: string, payload: unknown): void;
  status(): SystemStatus;
  runModel<T>(id: ModelId, operation: () => Promise<T>, priority?: number): Promise<T>;
  ensureLoaded(id: ModelId): Promise<void>;
  unloadModel(id: ModelId): Promise<void>;
  activateModel(id: ModelId): Promise<void>;
  verifyModel(id: ModelId): Promise<void>;
  removeModel(id: ModelId): Promise<void>;
  modelStatuses(): ModelStatus[];
  dispose(): Promise<void>;
}

interface Job<T> {
  operation: () => Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  priority: number;
  order: number;
}

/** One model operation at a time, highest priority first. */
function createQueue(closing: () => boolean) {
  const jobs: Job<unknown>[] = [];
  let running = false;
  let order = 0;
  let resolveIdle: () => void = () => undefined;
  let idle: Promise<void> = Promise.resolve();
  async function drain(): Promise<void> {
    try {
      while (jobs.length) {
        const job = jobs.shift();
        if (!job) continue;
        try {
          job.resolve(await job.operation());
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      running = false;
      resolveIdle();
      resolveIdle = () => undefined;
    }
  }
  return {
    serial<T>(operation: () => Promise<T>, priority = 0): Promise<T> {
      if (closing()) return Promise.reject(new Error('Application is shutting down'));
      const job = new Promise<T>((resolve, reject) => {
        jobs.push({ operation, resolve, reject, priority, order: order++ } as Job<unknown>);
      });
      jobs.sort((left, right) => right.priority - left.priority || left.order - right.order);
      if (!running) {
        running = true;
        idle = new Promise<void>((resolve) => { resolveIdle = resolve; });
        void drain();
      }
      return job;
    },
    idle: () => idle,
  };
}

export function createServices(options: {
  paths: AppPaths;
  tray: TrayService;
  shortcuts: ShortcutService;
  window(): BrowserWindow | null;
  /** Delivers a command to the capturing window. Returns false when it cannot receive one. */
  command(command: AppCommand): boolean;
  /** Brings the capturing window back, because capture needs a live renderer. */
  showWindow(): void;
  /** Tells the app window its status snapshot is stale. Called at most once per batch. */
  statusChanged(): void;
  /** Pushes an event to the app window, if it exists. */
  send(channel: string, payload: unknown): void;
  /**
   * Opens the app window if it is gone, hidden and without waiting for it to load: capture
   * runs in it, but a start from the tray or the floating window should not pop it up.
   */
  ensureWindow(): void;
}): Services {
  const { paths } = options;
  const settings = new SettingsStore(paths.settings);
  const companion = new CompanionService(settings);
  const updater = new UpdaterService(paths.data, settings.get().updates);
  const hosts: Record<ModelKind, InferenceHost> = {
    stt: new InferenceHost('Speech Recognition'),
    tts: new InferenceHost('Speech Synthesis'),
  };
  const kindOf = (id: ModelId): ModelKind => MODEL_CATALOG[id].kind;
  const isLoaded = (id: ModelId): boolean => hosts[kindOf(id)].isLoaded(id);
  const models = new ModelManager(paths.models, paths.downloads, isLoaded);
  const history = new HistoryRepository(paths.database);
  const inserter = new TextInserter();
  // The capturing window is the only source of device ids, so its last report doubles as
  // the allow-list. Nothing else may name an input device.
  const reportedDevices: AudioDevice[] = [];
  function reportDevices(devices: AudioDevice[]): void {
    reportedDevices.length = 0;
    reportedDevices.push(...devices);
    options.tray.setDevices(reportedDevices);
    liveWindow.refresh();
  }
  /**
   * Rejects an input id the capturing window never enumerated. Reserved ids always pass,
   * and an empty report means the window has not enumerated yet, so nothing is rejected.
   */
  function knownInputDevice(id: string): boolean {
    if (RESERVED_DEVICE_IDS.some((reserved) => reserved === id)) return true;
    if (!reportedDevices.length) return true;
    return reportedDevices.some((device) => device.id === id);
  }
  function applySettings(patch: SettingsPatch): Settings {
    for (const deviceId of [patch.audio?.inputDeviceId, patch.live?.deviceId]) {
      if (deviceId !== undefined && !knownInputDevice(deviceId)) throw new Error('Unknown input device');
    }
    return settings.update(patch);
  }
  // Bundled speech-cleanup models are hashed once, off every status path.
  const cleanupModels = new CleanupModels();
  void cleanupModels.verify();
  function sttCleanup(kind: 'dictation' | 'live'): SttCleanup | undefined {
    const current = settings.get();
    const cleanup: SttCleanup = {};
    if (kind === 'live' && current.live.skipNonSpeech) cleanup.vad = cleanupModels.path('vad');
    if (current.audio.speechCleanup) cleanup.denoiser = cleanupModels.path('denoiser');
    return cleanup.vad || cleanup.denoiser ? cleanup : undefined;
  }
  const installedSttModels = () =>
    MODEL_IDS.filter((id) => kindOf(id) === 'stt' && models.isInstalled(id)).map(
      (id) => ({ id, label: MODEL_CATALOG[id].name }),
    );
  const overlay = new OverlayController({
    settings: () => settings.get(),
    window: options.window,
    // The overlay offers exactly what the tray offers: the last enumeration this process
    // received, and the recognition models actually on disk.
    devices: () => reportedDevices,
    models: installedSttModels,
    updateSettings: (patch) => settings.update(patch),
  });
  const dictation = new DictationController({
    settings: () => settings.get(),
    command: options.command,
    showWindow: options.showWindow,
    overlay,
    onState: (state) => {
      readAloud.onDictation(state.phase);
      options.tray.setPhase(state.phase, state.startedAt);
      companion.setDictating(state.phase === 'listening' || state.phase === 'transcribing' || state.phase === 'inserting');
      if (state.phase === 'listening') companion.react('dictation.started', 'listening');
      else if (state.phase === 'transcribing') companion.react('dictation.stopped', 'transcribing');
      else if (state.phase === 'idle') companion.react('app.idle', 'idle');
      else if (state.phase === 'error') companion.react('app.error', 'error');
    },
  });
  type Lifecycle = Pick<ModelStatus, 'loadState' | 'health' | 'lastUsedAt' | 'error'>;
  const lifecycle = new Map<ModelId, Lifecycle>();
  let closing = false;
  const queues: Record<ModelKind, ReturnType<typeof createQueue>> = {
    stt: createQueue(() => closing),
    tts: createQueue(() => closing),
  };
  const idleTimers: Partial<Record<ModelKind, NodeJS.Timeout>> = {};
  function state(id: ModelId): Lifecycle {
    let value = lifecycle.get(id);
    if (!value) {
      value = { loadState: 'unloaded', health: 'unchecked' };
      lifecycle.set(id, value);
    }
    return value;
  }
  function modelStatuses(): ModelStatus[] {
    const current = settings.get();
    return models.list().map((model) => {
      const value = state(model.id);
      const { installed } = model;
      const loaded = isLoaded(model.id);
      return { ...model, ...value, error: value.error ?? model.error, installed, loaded,
        active: current[model.kind].modelId === model.id,
        loadState: loaded && value.loadState !== 'unloading' ? 'loaded' : value.loadState === 'loaded' ? 'unloaded' : value.loadState,
        health: installed ? value.health : 'unavailable',
      };
    });
  }
  function workerHealth(): WorkerHealth {
    // The status bar reports the dictation engine; synthesis contributes its loaded model.
    return { ...hosts.stt.getHealth(), loadedTts: hosts.tts.getHealth().loadedTts };
  }
  /**
   * Health and progress events arrive in bursts (starting, ready, busy, ready...). Each one
   * used to rebuild the tray menu and make the window refetch its status, so they are
   * batched into a single flush after the current turn.
   */
  let flushPending = false;
  let announce = false;
  function notify(announceStatus = true): void {
    announce ||= announceStatus;
    if (flushPending) return;
    flushPending = true;
    setImmediate(() => {
      flushPending = false;
      const shouldAnnounce = announce;
      announce = false;
      options.tray.setModels(modelStatuses());
      if (shouldAnnounce) options.statusChanged();
    });
  }
  function scheduleIdle(kind: ModelKind): void {
    clearTimeout(idleTimers[kind]);
    if (closing || !settings.get().system.autoUnload) return;
    const host = hosts[kind];
    const loaded = MODEL_IDS.filter((id) => kindOf(id) === kind && host.isLoaded(id));
    if (!loaded.length) return;
    const latestUse = Math.max(...loaded.map((id) => state(id).lastUsedAt ?? Date.now()));
    const delay = Math.max(1, latestUse + settings.get().system.idleMinutes * 60_000 - Date.now());
    const timer = setTimeout(() => {
      void queues[kind].serial(async () => {
        const current = settings.get().system;
        const resident = MODEL_IDS.filter((id) => kindOf(id) === kind && host.isLoaded(id));
        if (current.autoUnload && resident.length && resident.every((id) => Date.now() - (state(id).lastUsedAt ?? Date.now()) >= current.idleMinutes * 60_000)) {
          const next = resident[0];
          if (next) await unload(next);
        }
      }).catch(console.error).finally(() => scheduleIdle(kind));
    }, delay);
    timer.unref();
    idleTimers[kind] = timer;
  }
  async function unload(id: ModelId): Promise<void> {
    const kind = kindOf(id);
    if (!isLoaded(id)) { state(id).loadState = 'unloaded'; notify(); return; }
    state(id).loadState = 'unloading';
    notify();
    // Worker termination releases the native handles; the other kind's worker is untouched.
    try { await hosts[kind].unload(kind); }
    finally {
      state(id).loadState = 'unloaded';
      notify();
    }
  }
  async function load(id: ModelId): Promise<void> {
    if (isLoaded(id)) return;
    if (!(await models.revalidate(id))) throw new Error(`${MODEL_CATALOG[id].name} is not installed`);
    const model = MODEL_CATALOG[id];
    const previous = MODEL_IDS.find((candidate) => kindOf(candidate) === model.kind && isLoaded(candidate));
    if (previous) await unload(previous);
    const value = state(id);
    value.loadState = 'loading';
    value.error = undefined;
    notify();
    try {
      const dir = models.directory(id);
      const threads = settings.get().stt.threads;
      if (model.layout.kind === 'stt') await hosts.stt.loadStt({ type: 'stt:load', modelId: id, dir, layout: model.layout, threads });
      else await hosts.tts.loadTts({ type: 'tts:load', modelId: id, dir, layout: model.layout, threads: Math.min(threads, 4) });
      value.loadState = 'loaded';
      value.health = 'healthy';
      value.lastUsedAt = Date.now();
    } catch (error) {
      value.loadState = 'error';
      value.health = 'error';
      value.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally { notify(); scheduleIdle(model.kind); }
  }
  for (const kind of ['stt', 'tts'] as const) {
    hosts[kind].on('health', (health) => {
      if (health.state === 'crashed') {
        for (const [id, value] of lifecycle) {
          if (kindOf(id) === kind && (value.loadState === 'loaded' || value.loadState === 'loading')) {
            value.loadState = 'error'; value.health = 'error'; value.error = health.lastError;
          }
        }
      }
      notify();
    });
  }
  models.on('progress', (event) => {
    const id = event.id as ModelId;
    if (event.state === 'installed' || event.state === 'missing') {
      const value = state(id);
      value.error = undefined;
      value.health = isLoaded(id) ? 'healthy' : 'unchecked';
      if (!isLoaded(id)) value.loadState = 'unloaded';
    }
    // Download ticks only refresh the tray; the window follows them through model progress.
    notify(event.state !== 'downloading');
  });
  settings.on('change', (next, previous) => {
    for (const kind of ['stt', 'tts'] as const) {
      scheduleIdle(kind);
      if (next[kind].modelId !== previous[kind].modelId || (kind === 'stt' && next.stt.threads !== previous.stt.threads)) {
        void queues[kind].serial(async () => {
          const oldId = previous[kind].modelId;
          if (settings.get()[kind].modelId !== oldId || next.stt.threads !== previous.stt.threads) await unload(oldId);
        }).catch(console.error);
      }
    }
    notify();
  });
  function runModel<T>(id: ModelId, operation: () => Promise<T>, priority = 0): Promise<T> {
    const kind = kindOf(id);
    return queues[kind].serial(async () => {
      clearTimeout(idleTimers[kind]);
      await load(id);
      try { return await operation(); }
      finally { state(id).lastUsedAt = Date.now(); notify(); scheduleIdle(kind); }
    }, priority);
  }
  const readAloud = new ReadAloudController({
    settings: () => settings.get(),
    isInstalled: (id) => models.isInstalled(id),
    speak: (id, text, sid, speed) => runModel(id, () => hosts.tts.speak(text, sid, speed)),
    send: options.send,
    ensureWindow: options.ensureWindow,
    overlay,
    tray: options.tray,
    companion,
  });
  settings.on('change', (next, previous) => readAloud.onSettings(next, previous));
  // Live chunks share the speech queue with dictation but sit below it: a dictation take
  // started mid-meeting is transcribed first, and the live backlog catches up after.
  // Previews sit below both, and the controller drops them whenever anything is waiting.
  const LIVE_PRIORITY = 50;
  const PREVIEW_PRIORITY = 10;
  const liveWindow = new LiveWindowController({
    settings: () => settings.get(),
    updateSettings: (patch) => settings.update(patch),
    devices: () => reportedDevices,
    support: systemAudioSupport,
    model: () => {
      const id = settings.get().stt.modelId;
      return { name: MODEL_CATALOG[id].name, installed: models.isInstalled(id) };
    },
    onVisibility: (open) => {
      options.tray.setLiveWindow(open);
      live.windowChanged();
    },
  });
  const live = new LiveCaptureController({
    settings: () => settings.get(),
    support: systemAudioSupport,
    isInstalled: (id) => models.isInstalled(id),
    preload: (id) => void queues[kindOf(id)].serial(() => load(id), LIVE_PRIORITY).catch(() => undefined),
    transcribe: (id, samples, kind) =>
      kind === 'final'
        ? runModel(id, () => hosts.stt.transcribe(samples, 16_000, sttCleanup('live')), LIVE_PRIORITY)
        : runModel(id, () => hosts.stt.transcribe(samples, 16_000), PREVIEW_PRIORITY),
    dictating: () => overlay.phase() !== 'idle' && overlay.phase() !== 'error',
    punctuate: async (text) => {
      const model = cleanupModels.path('punct');
      const vocab = cleanupModels.path('punctVocab');
      if (!model || !vocab || !text) return null;
      return hosts.stt.punctuate(text, model, vocab);
    },
    save: (transcript) => {
      history.add(transcript);
      options.send(EVENTS.historyChanged, null);
    },
    window: options.window,
    ensureWindow: options.ensureWindow,
    showWindow: options.showWindow,
    send: options.send,
    overlay,
    tray: options.tray,
    companion,
    readAloud,
    floating: liveWindow,
  });
  // The window draws the model name and whether it is installed, so model changes reach it.
  settings.on('change', () => liveWindow.sync());
  models.on('progress', () => liveWindow.refresh());

  return {
    paths, settings, history, models, stt: hosts.stt, tts: hosts.tts, inserter, companion, updater,
    shortcuts: options.shortcuts, tray: options.tray, window: options.window, showWindow: options.showWindow, send: options.send,
    overlay, dictation, readAloud, live, liveWindow, sttCleanup, reportDevices, updateSettings: applySettings,
    listDevices: () => reportedDevices,
    installedSttModels,
    status: () => {
      const base = collectSystemStatus({
        paths, worker: workerHealth(), inserter,
        shortcuts: options.shortcuts,
        overlay,
        tray: options.tray,
      });
      const win = options.window();
      return { ...base, cleanupModels: cleanupModels.status(), models: modelStatuses(), update: updater.get(), window: {
        maximized: !!win && !win.isDestroyed() && win.isMaximized(),
        minimizable: !!win && !win.isDestroyed() && win.isMinimizable(),
        maximizable: !!win && !win.isDestroyed() && win.isMaximizable(),
        closable: !!win && !win.isDestroyed() && win.isClosable(),
        focused: !!win && !win.isDestroyed() && win.isFocused(),
        fullscreen: !!win && !win.isDestroyed() && win.isFullScreen(),
      } };
    },
    modelStatuses,
    ensureLoaded: (id) => queues[kindOf(id)].serial(() => load(id), 100),
    runModel,
    unloadModel: (id) => queues[kindOf(id)].serial(async () => { await unload(id); scheduleIdle(kindOf(id)); }),
    activateModel: (id) => queues[kindOf(id)].serial(async () => {
      // A model only ever becomes active in the kind it belongs to, so the id is narrowed
      // by the catalog rather than asserted: what is persisted is always schema-valid.
      const model = MODEL_CATALOG[id];
      if (model.kind === 'stt') {
        const sttId = sttModelIdSchema.safeParse(id);
        if (!sttId.success) throw new Error(`${model.name} cannot be used for dictation`);
        await load(id);
        settings.update({ stt: { modelId: sttId.data } });
      } else {
        const ttsId = ttsModelIdSchema.safeParse(id);
        if (!ttsId.success) throw new Error(`${model.name} cannot be used for speech`);
        await load(id);
        settings.update({ tts: { modelId: ttsId.data } });
      }
      notify();
    }),
    verifyModel: (id) => queues[kindOf(id)].serial(async () => {
      models.cancel(id);
      await unload(id);
      try { await models.verify(id); await load(id); }
      catch (error) {
        const value = state(id); value.health = 'error'; value.error = error instanceof Error ? error.message : String(error);
        notify(); throw error;
      }
    }),
    removeModel: (id) => queues[kindOf(id)].serial(async () => {
      models.cancel(id);
      await unload(id);
      await models.remove(id);
      lifecycle.delete(id); notify(); scheduleIdle(kindOf(id));
    }),
    dispose: async () => {
      closing = true;
      clearTimeout(idleTimers.stt);
      clearTimeout(idleTimers.tts);
      dictation.dispose();
      live.dispose();
      liveWindow.destroy();
      readAloud.dispose();
      companion.dispose();
      overlay.destroy();
      inserter.dispose();
      models.cancelAll();
      await Promise.all([hosts.stt.stop(), hosts.tts.stop()]);
      await Promise.all([queues.stt.idle(), queues.tts.idle()]);
      await Promise.all([hosts.stt.stop(), hosts.tts.stop()]);
      history.close();
    },
  };
}
