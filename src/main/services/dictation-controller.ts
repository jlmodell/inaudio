import { Notification } from 'electron';
import type { Settings } from '@shared/domain/settings';
import type { AppCommand, DictationState } from '@shared/domain/system';
import { appIcon } from '../app/assets';
import type { OverlayController } from './overlay-controller';

interface DictationOptions {
  settings(): Settings;
  /** Delivers a command to the window that owns audio capture. */
  command(command: AppCommand): boolean;
  /** Brings the main window back, because capture needs a live renderer. */
  showWindow(): void;
  overlay: OverlayController;
  /** Mirrors the phase into the tray. */
  onState(state: DictationState): void;
}

const IDLE: DictationState = { phase: 'idle', startedAt: 0, level: 0, message: '' };

/** How long a requested transition may stay unacknowledged before it is dropped. */
const PENDING_MS = 5_000;

/**
 * The single authority over recording. Shortcuts, the tray and the overlay all ask this
 * controller, which guards the transition and then asks the capturing window to act.
 * Nothing else is allowed to touch the microphone.
 */
export class DictationController {
  private state: DictationState = IDLE;
  private pending: 'start' | 'stop' | 'cancel' | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: DictationOptions) {}

  current(): DictationState {
    return this.state;
  }

  toggle(): void {
    if (this.state.phase === 'listening') this.stop();
    else this.start();
  }

  start(): void {
    if (this.pending) return;
    // A second start while a recording or its transcription is in flight is ignored.
    if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;
    this.request('start', 'dictation:start');
  }

  stop(): void {
    if (this.state.phase !== 'listening' || this.pending) return;
    this.request('stop', 'dictation:stop');
  }

  cancel(): void {
    if (this.state.phase === 'idle') return;
    this.request('cancel', 'dictation:cancel');
  }

  /** Called when the machine suspends: audio devices do not survive a sleep. */
  interrupt(): void {
    this.clearPending();
    if (this.state.phase === 'idle') return;
    this.options.command('dictation:cancel');
    this.report({ ...IDLE, phase: 'idle' });
  }

  /** The capturing window reporting what it is actually doing. */
  report(state: DictationState): void {
    const previous = this.state;
    this.state = state;
    const changed = state.phase !== previous.phase;
    if (changed) this.clearPending();
    // While listening the window reports ten times a second, and usually only the level
    // moved. That only concerns the overlay's meter, not the tray or the companion.
    if (!changed && state.startedAt === previous.startedAt && state.message === previous.message) {
      this.options.overlay.setLevel(state.level);
      return;
    }
    this.options.overlay.setDictation(state);
    this.options.onState(state);
  }

  /** A finished transcript, announced natively only when the overlay cannot show it. */
  notifyTranscript(text: string): void {
    const { tray, overlay } = this.options.settings();
    if (!tray.notifications || overlay.enabled) return;
    if (!Notification.isSupported()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    new Notification({
      title: 'Transcript ready',
      // Plain text only: the body is never parsed as markup.
      body: trimmed.length > 160 ? `${trimmed.slice(0, 159)}…` : trimmed,
      silent: true,
      icon: appIcon(),
    }).show();
  }

  dispose(): void {
    this.clearPending();
  }

  private request(intent: 'start' | 'stop' | 'cancel', command: AppCommand): void {
    // Capture lives in the renderer, so the window has to exist to serve the request.
    if (!this.options.command(command)) {
      this.options.showWindow();
      if (!this.options.command(command)) return;
    }
    this.pending = intent;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pending = null;
      this.pendingTimer = null;
    }, PENDING_MS);
  }

  private clearPending(): void {
    this.pending = null;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }
}
