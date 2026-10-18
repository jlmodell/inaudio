import { globalShortcut } from 'electron';
import type { Settings } from '@shared/domain/settings';
import type { ShortcutState, ShortcutStatus } from '@shared/domain/system';

const OFF: ShortcutStatus = 'off';
const REGISTERED: ShortcutStatus = 'registered';
const UNAVAILABLE: ShortcutStatus = 'unavailable';

const EMPTY: ShortcutState = {
  dictation: OFF,
  readAloud: OFF,
  readAloudPause: OFF,
  readAloudStop: OFF,
  cancel: OFF,
  overlay: OFF,
  live: OFF,
};

/**
 * System-wide shortcuts. Electron reports key-down only, so the global dictation shortcut
 * always toggles; hold-to-talk is handled inside the window.
 */
export class ShortcutService {
  private state: ShortcutState = { ...EMPTY };
  private registered: string[] = [];

  constructor(
    private readonly handlers: {
      dictation(): void;
      readAloud(): void;
      readAloudPause(): void;
      readAloudStop(): void;
      cancel(): void;
      overlay(): void;
      live(): void;
    },
  ) {}

  apply(settings: Settings): ShortcutState {
    this.clear();
    this.state = {
      dictation: this.register(settings.dictation.shortcut, this.handlers.dictation),
      readAloud: this.register(settings.tts.shortcut, this.handlers.readAloud),
      readAloudPause: this.register(settings.tts.pauseShortcut, this.handlers.readAloudPause),
      readAloudStop: this.register(settings.tts.stopShortcut, this.handlers.readAloudStop),
      cancel: this.register(settings.dictation.cancelShortcut, this.handlers.cancel),
      overlay: this.register(settings.overlay.toggleShortcut, this.handlers.overlay),
      live: this.register(settings.live.shortcut, this.handlers.live),
    };
    return this.state;
  }

  current(): ShortcutState {
    return this.state;
  }

  clear(): void {
    for (const accelerator of this.registered) globalShortcut.unregister(accelerator);
    this.registered = [];
    this.state = { ...EMPTY };
  }

  private register(accelerator: string, handler: () => void): ShortcutStatus {
    if (!accelerator) return OFF;
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (ok) {
        this.registered.push(accelerator);
        return REGISTERED;
      }
      return UNAVAILABLE;
    } catch {
      return UNAVAILABLE;
    }
  }
}
