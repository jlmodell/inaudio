import type { ModelStatus } from './models';
import type { UpdateStatus } from './update';

export type PermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

export type WorkerState = 'starting' | 'ready' | 'busy' | 'crashed' | 'stopped';

export interface WorkerHealth {
  state: WorkerState;
  pid?: number;
  restarts: number;
  lastError?: string;
  loadedTts?: string;
}

export type InsertionSupport =
  | { available: true; method: string }
  | { available: false; reason: string };

/** Whether a configured accelerator is held by this app, taken, or turned off. */
export type ShortcutStatus = 'registered' | 'unavailable' | 'off';

export type ShortcutId = 'readAloud' | 'readAloudPause' | 'readAloudStop';

export type ShortcutState = Record<ShortcutId, ShortcutStatus>;

export interface SystemStatus {
  platform: NodeJS.Platform;
  arch: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  accessibilityTrusted: boolean | null;
  shortcuts: ShortcutState;
  trayVisible: boolean;
  notificationsSupported: boolean;
  dataDir: string;
  modelsDir: string;
  models: ModelStatus[];
  worker: WorkerHealth;
  onBattery: boolean;
  update: UpdateStatus;
  window: {
    maximized: boolean;
    minimizable: boolean;
    maximizable: boolean;
    closable: boolean;
    focused: boolean;
    fullscreen: boolean;
  };
}

export interface ModelProgressEvent {
  id: string;
  state: ModelStatus['state'];
  bytesDone: number;
  bytesTotal: number;
  error?: string;
}

export type WindowAction = 'minimize' | 'maximize-toggle' | 'close';

export type AppMenuCommand =
  | 'file.open-models-folder'
  | 'file.run-setup'
  | 'file.quit'
  | 'view.read-aloud'
  | 'view.models'
  | 'view.settings'
  | 'view.companion';

export type AppCommand = 'navigate:read-aloud' | 'navigate:models' | 'navigate:settings';
