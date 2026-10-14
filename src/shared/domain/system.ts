import type { ModelStatus } from './models';
import type { AccentTone } from './settings';
import type { UpdateStatus } from './update';

export type PermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

export type WorkerState = 'starting' | 'ready' | 'busy' | 'crashed' | 'stopped';

export interface WorkerHealth {
  state: WorkerState;
  pid?: number;
  restarts: number;
  lastError?: string;
  loadedStt?: string;
  loadedTts?: string;
}

export type InsertionSupport =
  | { available: true; method: string }
  | { available: false; reason: string };

/** Whether a configured accelerator is held by this app, taken, or turned off. */
export type ShortcutStatus = 'registered' | 'unavailable' | 'off';

export type ShortcutId = 'dictation' | 'readAloud' | 'cancel' | 'overlay';

export type ShortcutState = Record<ShortcutId, ShortcutStatus>;

/** What the running platform and session actually allow the overlay to do. */
export interface OverlaySupport {
  alwaysOnTop: boolean;
  opacity: boolean;
  /** Mouse moves are forwarded while click-through is on, so hovering can arm controls. */
  hover: boolean;
  /** The cursor position can be read, so "follow the pointer" placement works. */
  cursor: boolean;
}

export interface SystemStatus {
  platform: NodeJS.Platform;
  arch: string;
  appVersion: string;
  electronVersion: string;
  microphonePermission: PermissionState;
  accessibilityTrusted: boolean | null;
  insertion: InsertionSupport;
  shortcuts: ShortcutState;
  overlay: OverlaySupport;
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

export type DictationPhase = 'idle' | 'listening' | 'transcribing' | 'inserting' | 'error';

/** Volatile dictation state. Owned by the main process, reported by the capturing window. */
export interface DictationState {
  phase: DictationPhase;
  /** Epoch ms the current recording started; 0 when nothing is being recorded. */
  startedAt: number;
  /** Input level in 0..1, meaningful only while listening. */
  level: number;
  /** One short line, set in the error phase. */
  message: string;
}

/** An audio device as the capturing window currently enumerates it. */
export interface AudioDevice {
  id: string;
  label: string;
}

/** A recognition model the overlay may offer, drawn from what is installed. */
export interface OverlayModel {
  id: string;
  label: string;
}

/**
 * Everything the overlay window renders, pushed as one message. The window is sized by the
 * main process from the same settings these flags come from, so the renderer draws exactly
 * the sections the box has room for and never decides its own extent.
 */
export interface OverlayState extends DictationState {
  /** Display name of the active recognition model. */
  model: string;
  /** Language label, empty for a single-language model. */
  language: string;
  /** True while the window accepts mouse events, so controls are usable. */
  interactive: boolean;
  /**
   * True once the pointer or an open menu has armed the pill. The window was widened for
   * the controls, so the renderer shows them exactly when it has been given the room.
   */
  armed: boolean;
  /**
   * The edge the window is pinned to. Room for a menu is added on the free side, so the
   * pill sits against this edge and panels open away from it.
   */
  anchor: 'top' | 'bottom';
  /**
   * The horizontal edge the pill holds. The pill is as wide as what it shows, and the main
   * process sizes the window from the same rule, so leftover room is transparent margin.
   */
  align: 'left' | 'center' | 'right';
  /** The app's accent tone, so the overlay matches it without reading settings itself. */
  accentTone: AccentTone;
  showTimer: boolean;
  showLevel: boolean;
  showModel: boolean;
  showLanguage: boolean;
  /** The devices the capturing window last enumerated; the overlay picks from these only. */
  devices: AudioDevice[];
  /** Installed recognition models. Selecting one is validated against this same list. */
  models: OverlayModel[];
  /** The active input device id, so the picker can mark it. */
  deviceId: string;
  /** The active recognition model id, so the picker can mark it. */
  modelId: string;
  /** False when the user has turned animations down, so the pill holds still. */
  animate: boolean;
}

/**
 * The fixed set of things the overlay may ask for. Selecting carries an id, and the main
 * process only accepts one it is already offering in the state above.
 */
export type OverlayAction =
  | { type: 'start' | 'stop' | 'cancel' | 'hide' | 'open-app' | 'open-audio' }
  | { type: 'select-microphone'; id: string }
  | { type: 'select-model'; id: string };

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
  | 'view.dictation'
  | 'view.history'
  | 'view.read-aloud'
  | 'view.models'
  | 'view.audio'
  | 'view.settings'
  | 'view.companion';

export type AppCommand =
  | 'dictation:toggle'
  | 'dictation:start'
  | 'dictation:stop'
  | 'dictation:cancel'
  | 'read-aloud:clipboard'
  | 'navigate:dictation'
  | 'navigate:history'
  | 'navigate:read-aloud'
  | 'navigate:models'
  | 'navigate:audio'
  | 'navigate:settings';
