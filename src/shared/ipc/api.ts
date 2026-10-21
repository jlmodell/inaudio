import type { ModelId, ModelStatus, VoiceId } from '../domain/models';
import type { Settings, SettingsPatch } from '../domain/settings';
import type { AppMenuCommand, AppCommand, ModelProgressEvent, SystemStatus, WindowAction } from '../domain/system';
import type { ExternalLinkId } from './schemas';
import type { CompanionId, CompanionSnapshot } from '../domain/companion';
import type { ReleaseNotesResult, UpdateStatus } from '../domain/update';
import type {
  ReadAloudChunk,
  ReadAloudControl,
  ReadAloudReport,
  ReadAloudSession,
  ReadAloudStart,
  ReadAloudState,
} from '../domain/read-aloud';

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
    /** Opens the OS page where an app's audio output can be changed (Volume mixer). */
    openSoundSettings(): Promise<void>;
  };
  updates: {
    status(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    download(): Promise<UpdateStatus>;
    install(): Promise<void>;
    /**
     * Published release notes from GitHub. Fetched only while automatic updates are on, or
     * when `force` says the user asked; otherwise the last list is returned, marked paused.
     */
    releaseNotes(force: boolean): Promise<ReleaseNotesResult>;
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
  text: {
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
    onCompanionState(listener: (snapshot: CompanionSnapshot) => void): Unsubscribe;
    onUpdateState(listener: (status: UpdateStatus) => void): Unsubscribe;
    onReadAloudSession(listener: (session: ReadAloudSession) => void): Unsubscribe;
    onReadAloudState(listener: (state: ReadAloudState) => void): Unsubscribe;
    onReadAloudChunk(listener: (chunk: ReadAloudChunk) => void): Unsubscribe;
  };
}
