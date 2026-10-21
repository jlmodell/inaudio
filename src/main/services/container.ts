import type { BrowserWindow } from 'electron';
import {
  MODEL_CATALOG,
  MODEL_IDS,
  ttsModelIdSchema,
  type ModelId,
  type ModelStatus,
} from '@shared/domain/models';
import type { AppCommand, SystemStatus, WorkerHealth } from '@shared/domain/system';
import type { Settings, SettingsPatch } from '@shared/domain/settings';
import type { AppPaths } from '../app/paths';
import { InferenceHost } from './inference-host';
import { ModelManager } from './model-manager';
import { ReadAloudController } from './read-aloud/read-aloud-controller';
import { SettingsStore } from './settings-store';
import type { ShortcutService } from './shortcuts';
import { collectSystemStatus } from './system-status';
import type { TrayService } from './tray';
import { CompanionService } from './companion-service';
import { UpdaterService } from './updater';

export interface Services {
  paths: AppPaths;
  settings: SettingsStore;
  models: ModelManager;
  tts: InferenceHost;
  shortcuts: ShortcutService;
  tray: TrayService;
  companion: CompanionService;
  updater: UpdaterService;
  readAloud: ReadAloudController;
  /** Validates a settings patch before persisting it. */
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
  /** Brings the app window back. */
  showWindow(): void;
  /** Tells the app window its status snapshot is stale. Called at most once per batch. */
  statusChanged(): void;
  /** Pushes an event to the app window, if it exists. */
  send(channel: string, payload: unknown): void;
  /** Opens the app window if it is gone, hidden and without waiting for it to load. */
  ensureWindow(): void;
}): Services {
  const { paths } = options;
  const settings = new SettingsStore(paths.settings);
  const companion = new CompanionService(settings);
  const updater = new UpdaterService(paths.data, settings.get().updates);
  const tts = new InferenceHost('Speech Synthesis');
  const isLoaded = (id: ModelId): boolean => tts.isLoaded(id);
  const models = new ModelManager(paths.models, paths.downloads, isLoaded);

  function applySettings(patch: SettingsPatch): Settings {
    return settings.update(patch);
  }

  type Lifecycle = Pick<ModelStatus, 'loadState' | 'health' | 'lastUsedAt' | 'error'>;
  const lifecycle = new Map<ModelId, Lifecycle>();
  let closing = false;
  const queue = createQueue(() => closing);
  let idleTimer: NodeJS.Timeout | undefined;

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
      return {
        ...model,
        ...value,
        error: value.error ?? model.error,
        installed,
        loaded,
        active: current.tts.modelId === model.id,
        loadState: loaded && value.loadState !== 'unloading' ? 'loaded' : value.loadState === 'loaded' ? 'unloaded' : value.loadState,
        health: installed ? value.health : 'unavailable',
      };
    });
  }
  function workerHealth(): WorkerHealth {
    return tts.getHealth();
  }
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
  function scheduleIdle(): void {
    clearTimeout(idleTimer);
    if (closing || !settings.get().system.autoUnload) return;
    const loaded = MODEL_IDS.filter((id) => tts.isLoaded(id));
    if (!loaded.length) return;
    const latestUse = Math.max(...loaded.map((id) => state(id).lastUsedAt ?? Date.now()));
    const delay = Math.max(1, latestUse + settings.get().system.idleMinutes * 60_000 - Date.now());
    const timer = setTimeout(() => {
      void queue.serial(async () => {
        const current = settings.get().system;
        const resident = MODEL_IDS.filter((id) => tts.isLoaded(id));
        if (current.autoUnload && resident.length && resident.every((id) => Date.now() - (state(id).lastUsedAt ?? Date.now()) >= current.idleMinutes * 60_000)) {
          const next = resident[0];
          if (next) await unload(next);
        }
      }).catch(console.error).finally(() => scheduleIdle());
    }, delay);
    timer.unref();
    idleTimer = timer;
  }
  async function unload(id: ModelId): Promise<void> {
    if (!isLoaded(id)) { state(id).loadState = 'unloaded'; notify(); return; }
    state(id).loadState = 'unloading';
    notify();
    try { await tts.unload(); }
    finally {
      state(id).loadState = 'unloaded';
      notify();
    }
  }
  async function load(id: ModelId): Promise<void> {
    if (isLoaded(id)) return;
    if (!(await models.revalidate(id))) throw new Error(`${MODEL_CATALOG[id].name} is not installed`);
    const model = MODEL_CATALOG[id];
    const previous = MODEL_IDS.find((candidate) => isLoaded(candidate));
    if (previous) await unload(previous);
    const value = state(id);
    value.loadState = 'loading';
    value.error = undefined;
    notify();
    try {
      const dir = models.directory(id);
      const threads = Math.min(settings.get().tts.threads, 4);
      await tts.loadTts({ type: 'tts:load', modelId: id, dir, layout: model.layout, threads });
      value.loadState = 'loaded';
      value.health = 'healthy';
      value.lastUsedAt = Date.now();
    } catch (error) {
      value.loadState = 'error';
      value.health = 'error';
      value.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally { notify(); scheduleIdle(); }
  }
  tts.on('health', (health) => {
    if (health.state === 'crashed') {
      for (const value of lifecycle.values()) {
        if (value.loadState === 'loaded' || value.loadState === 'loading') {
          value.loadState = 'error'; value.health = 'error'; value.error = health.lastError;
        }
      }
    }
    notify();
  });
  models.on('progress', (event) => {
    const id = event.id as ModelId;
    if (event.state === 'installed' || event.state === 'missing') {
      const value = state(id);
      value.error = undefined;
      value.health = isLoaded(id) ? 'healthy' : 'unchecked';
      if (!isLoaded(id)) value.loadState = 'unloaded';
    }
    notify(event.state !== 'downloading');
  });
  settings.on('change', (next, previous) => {
    scheduleIdle();
    if (next.tts.modelId !== previous.tts.modelId || next.tts.threads !== previous.tts.threads) {
      void queue.serial(async () => {
        const oldId = previous.tts.modelId;
        if (settings.get().tts.modelId !== oldId || next.tts.threads !== previous.tts.threads) await unload(oldId);
      }).catch(console.error);
    }
    notify();
  });
  function runModel<T>(id: ModelId, operation: () => Promise<T>, priority = 0): Promise<T> {
    return queue.serial(async () => {
      clearTimeout(idleTimer);
      await load(id);
      try { return await operation(); }
      finally { state(id).lastUsedAt = Date.now(); notify(); scheduleIdle(); }
    }, priority);
  }
  const readAloud = new ReadAloudController({
    settings: () => settings.get(),
    isInstalled: (id) => models.isInstalled(id),
    speak: (id, text, sid, speed) => runModel(id, () => tts.speak(text, sid, speed)),
    send: options.send,
    ensureWindow: options.ensureWindow,
    tray: options.tray,
    companion,
  });
  settings.on('change', (next, previous) => readAloud.onSettings(next, previous));

  return {
    paths, settings, models, tts, companion, updater,
    shortcuts: options.shortcuts, tray: options.tray, window: options.window, showWindow: options.showWindow, send: options.send,
    readAloud, updateSettings: applySettings,
    status: () => {
      const base = collectSystemStatus({
        paths, worker: workerHealth(),
        shortcuts: options.shortcuts,
        tray: options.tray,
      });
      const win = options.window();
      return { ...base, models: modelStatuses(), update: updater.get(), window: {
        maximized: !!win && !win.isDestroyed() && win.isMaximized(),
        minimizable: !!win && !win.isDestroyed() && win.isMinimizable(),
        maximizable: !!win && !win.isDestroyed() && win.isMaximizable(),
        closable: !!win && !win.isDestroyed() && win.isClosable(),
        focused: !!win && !win.isDestroyed() && win.isFocused(),
        fullscreen: !!win && !win.isDestroyed() && win.isFullScreen(),
      } };
    },
    modelStatuses,
    ensureLoaded: (id) => queue.serial(() => load(id), 100),
    runModel,
    unloadModel: (id) => queue.serial(async () => { await unload(id); scheduleIdle(); }),
    activateModel: (id) => queue.serial(async () => {
      const model = MODEL_CATALOG[id];
      const ttsId = ttsModelIdSchema.safeParse(id);
      if (!ttsId.success) throw new Error(`${model.name} cannot be used for speech`);
      await load(id);
      settings.update({ tts: { modelId: ttsId.data } });
      notify();
    }),
    verifyModel: (id) => queue.serial(async () => {
      models.cancel(id);
      await unload(id);
      try { await models.verify(id); await load(id); }
      catch (error) {
        const value = state(id); value.health = 'error'; value.error = error instanceof Error ? error.message : String(error);
        notify(); throw error;
      }
    }),
    removeModel: (id) => queue.serial(async () => {
      models.cancel(id);
      await unload(id);
      await models.remove(id);
      lifecycle.delete(id); notify(); scheduleIdle();
    }),
    dispose: async () => {
      closing = true;
      clearTimeout(idleTimer);
      readAloud.dispose();
      companion.dispose();
      models.cancelAll();
      await tts.stop();
      await queue.idle();
      await tts.stop();
    },
  };
}
