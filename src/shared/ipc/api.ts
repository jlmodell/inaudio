import type { LiveChunk, LiveCommand, LiveReport, LiveStartInput, LiveState } from '../domain/capture';
import type { HistoryPage, HistoryQuery, Transcript } from '../domain/history';
import type { ModelId, ModelStatus, VoiceId } from '../domain/models';
import type { Settings, SettingsPatch } from '../domain/settings';
import type {
  AppMenuCommand,
  AppCommand,
  AudioDevice,
  DictationState,
  ModelProgressEvent,
  OverlayAction,
  OverlayState,
  SystemStatus,
  WindowAction,
} from '../domain/system';
import type { ExternalLinkId } from './schemas';
import type { CompanionGaze, CompanionId, CompanionSnapshot } from '../domain/companion';
import type { UpdateStatus } from '../domain/update';
import type {
  ReadAloudChunk,
  ReadAloudControl,
  ReadAloudReport,
  ReadAloudSession,
  ReadAloudStart,
  ReadAloudState,
} from '../domain/read-aloud';

export interface TranscribeResult {
  transcript: Transcript | null;
  text: string;
  inserted: boolean;
  insertError?: string;
}

export interface SpeakResult {
  samples: Float32Array;
  sampleRate: number;
  inferenceMs: number;
}

type Unsubscribe = () => void;

/** The complete surface exposed to the renderer as `window.inaudio`. */
export interface InaudioApi {
  system: {
    status(): Promise<SystemStatus>;
    openLink(id: ExternalLinkId): Promise<void>;
    revealModels(): Promise<void>;
    window(action: WindowAction): Promise<void>;
    menu(command: AppMenuCommand): Promise<void>;
  };
  updates: {
    status(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    download(): Promise<UpdateStatus>;
    install(): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: SettingsPatch): Promise<Settings>;
  };
  models: {
    list(): Promise<ModelStatus[]>;
    download(id: ModelId): Promise<void>;
    cancel(id: ModelId): Promise<void>;
    remove(id: ModelId): Promise<void>;
    load(id: ModelId): Promise<void>;
    unload(id: ModelId): Promise<void>;
    activate(id: ModelId): Promise<void>;
    verify(id: ModelId): Promise<void>;
    reveal(id: ModelId): Promise<void>;
  };
  dictation: {
    transcribe(samples: Float32Array, options: { insert: boolean }): Promise<TranscribeResult>;
    /** Reports capture state to the main process, which owns the authoritative phase. */
    report(state: DictationState): void;
  };
  audio: {
    /**
     * Reports the devices this window can currently see. Only the main process can show
     * them in a native menu, and it treats the list as the allowed set of input ids.
     */
    report(devices: AudioDevice[]): void;
  };
  live: {
    /** The current session, for a window that opens after it started. */
    get(): Promise<LiveState>;
    /** Asks the main process to start a session; it arms the capture grant and commands this window. */
    start(input: LiveStartInput): Promise<void>;
    stop(): Promise<void>;
    /** Ends the session without saving anything. */
    cancel(): Promise<void>;
    /** One chunk of 16 kHz mono audio; resolves once it is transcribed. */
    chunk(chunk: LiveChunk): Promise<void>;
    /** The capturing window reporting what it is actually doing. */
    report(report: LiveReport): void;
  };
  overlay: {
    /** Asks the main process to run one of a fixed set of overlay commands. */
    act(action: OverlayAction): Promise<void>;
    /** Tells the main process the pointer entered or left the overlay. */
    hover(hovering: boolean): void;
    /**
     * Tells the main process a popover or dropdown opened or closed, so it can grant the
     * window the room the menu needs. The overlay does not resize itself.
     */
    menu(open: boolean): void;
  };
  text: {
    insert(text: string): Promise<void>;
    copy(text: string): Promise<void>;
  };
  tts: {
    speak(input: { text: string; voiceId?: VoiceId; speed?: number }): Promise<SpeakResult>;
  };
  readAloud: {
    /** The current session and its state, for a window that opens after it started. */
    get(): Promise<{ session: ReadAloudSession | null; state: ReadAloudState }>;
    /** Starts a session from the selection, the clipboard or typed text; replaces any running one. */
    start(input: ReadAloudStart): Promise<{ sessionId: string | null }>;
    control(input: ReadAloudControl): Promise<void>;
    /** The player reporting a finished segment or a playback failure. */
    report(report: ReadAloudReport): void;
  };
  history: {
    list(query: HistoryQuery): Promise<HistoryPage>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  companions: {
    get(): Promise<CompanionSnapshot>;
    select(id: CompanionId): Promise<CompanionSnapshot>;
    setVisibility(visible: boolean): Promise<CompanionSnapshot>;
    hover(hovering: boolean): void;
    click(): Promise<CompanionSnapshot>;
  };
  events: {
    onCommand(listener: (command: AppCommand) => void): Unsubscribe;
    onModelProgress(listener: (event: ModelProgressEvent) => void): Unsubscribe;
    onStatusChanged(listener: () => void): Unsubscribe;
    onSettingsChanged(listener: (settings: Settings) => void): Unsubscribe;
    onOverlayState(listener: (state: OverlayState) => void): Unsubscribe;
    onCompanionState(listener: (snapshot: CompanionSnapshot) => void): Unsubscribe;
    /** Companion window only: where its eyes should look. */
    onCompanionGaze(listener: (gaze: CompanionGaze) => void): Unsubscribe;
    onUpdateState(listener: (status: UpdateStatus) => void): Unsubscribe;
    onReadAloudSession(listener: (session: ReadAloudSession) => void): Unsubscribe;
    onReadAloudState(listener: (state: ReadAloudState) => void): Unsubscribe;
    onReadAloudChunk(listener: (chunk: ReadAloudChunk) => void): Unsubscribe;
    onLiveState(listener: (state: LiveState) => void): Unsubscribe;
    onLiveCommand(listener: (command: LiveCommand) => void): Unsubscribe;
  };
}
