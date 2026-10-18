import type { LiveSource, LiveState, SystemAudioSupport } from './capture';
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

export type ShortcutId =
  | 'dictation'
  | 'readAloud'
  | 'readAloudPause'
  | 'readAloudStop'
  | 'cancel'
  | 'overlay'
  | 'live'
  | 'liveWindow';

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

/** Whether each bundled speech-cleanup model passed its hash check. */
export interface CleanupModelsStatus {
  vad: 'verified' | 'missing' | 'unchecked';
  denoiser: 'verified' | 'missing' | 'unchecked';
  punct: 'verified' | 'missing' | 'unchecked';
}

export interface SystemStatus {
  platform: NodeJS.Platform;
  arch: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  cleanupModels: CleanupModelsStatus;
  microphonePermission: PermissionState;
  systemAudio: SystemAudioSupport;
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
  /** Live sessions show their latest words at rest. */
  showCaption: boolean;
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
  /** A read-aloud session the pill shows while dictation is idle, or null. */
  reading: OverlayReading | null;
  /** A live transcript being recorded; shown while dictation is idle, ahead of reading. */
  live: OverlayLive | null;
}

/** The part of a live session the overlay draws. */
export interface OverlayLive {
  source: LiveSource;
  startedAt: number;
  level: number;
  /** The floating live window is showing, so its button is drawn pressed. */
  windowOpen: boolean;
  /** The latest words heard, or empty. Shown at rest when the caption is on. */
  caption: string;
  /** The caption is the provisional guess, drawn grey. */
  provisional: boolean;
}

/**
 * Everything the floating live window draws, pushed as one message. It never reads settings
 * or the transcript on its own, and its text is only the end of the session.
 */
export interface LiveWindowState {
  /** The session, with `text` cut to its last LIVE_WINDOW_TAIL_CHARS characters. */
  live: LiveState;
  /** The text was cut, so the start of the session is only on the Live page. */
  truncated: boolean;
  level: number;
  /** Shown in the header: the device label for the `device` source. */
  sourceLabel: string;
  /** The source the next start would use. */
  nextSource: LiveSource;
  /** Why a session cannot start right now, or empty. */
  blocked: string;
  /** macOS asks for a screen each time, so starting shows the picker. */
  picker: boolean;
  model: string;
  /** The start/stop accelerator, or empty when it is off. */
  shortcut: string;
  platform: NodeJS.Platform;
  alwaysOnTop: boolean;
  /** Shrunk to a single caption line. Main sizes the window; the page only draws it. */
  collapsed: boolean;
  /** Pinning is honoured on this platform (not on Wayland). */
  canPin: boolean;
  textSize: 'sm' | 'md' | 'lg';
  accentTone: AccentTone;
  animate: boolean;
}

/** The fixed set of things the floating live window may ask for. It never sends text. */
export type LiveWindowAction =
  | 'start'
  | 'stop'
  | 'cancel'
  | 'copy'
  | 'open-app'
  | 'open-audio'
  | 'hide'
  | 'pin'
  | 'collapse'
  | 'expand'
  | 'source-system'
  | 'source-system+mic'
  | 'source-device';

/** The part of a read-aloud session the overlay draws. */
export interface OverlayReading {
  status: 'capturing' | 'preparing' | 'playing' | 'paused' | 'error';
  /** Zero-based segment being read. */
  index: number;
  count: number;
  /** Synthesis for the current segment has not finished yet. */
  waiting: boolean;
  /** Why a capture or session failed; shown in place of the readout. */
  message: string;
}

/**
 * The fixed set of things the overlay may ask for. Selecting carries an id, and the main
 * process only accepts one it is already offering in the state above.
 */
export type OverlayAction =
  | {
      type:
        | 'start'
        | 'stop'
        | 'cancel'
        | 'hide'
        | 'open-app'
        | 'open-audio'
        | 'read-pause'
        | 'read-resume'
        | 'read-stop'
        | 'live-stop'
        | 'live-cancel'
        | 'live-window'
        | 'open-latest'
        | 'open-history'
        | 'reset-position';
    }
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
  | 'view.live'
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
  | 'navigate:dictation'
  | 'navigate:live'
  | 'navigate:history'
  | 'navigate:read-aloud'
  | 'navigate:models'
  | 'navigate:audio'
  | 'navigate:settings'
  /** Opens History with the newest transcript in the drawer. */
  | 'history:open-latest';
