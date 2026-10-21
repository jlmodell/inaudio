import { globalShortcut } from 'electron';
import type { Settings } from '@shared/domain/settings';
import type { ShortcutState, ShortcutStatus } from '@shared/domain/system';

const OFF: ShortcutStatus = 'off';
const REGISTERED: ShortcutStatus = 'registered';
const UNAVAILABLE: ShortcutStatus = 'unavailable';

const EMPTY: ShortcutState = {
  readAloud: OFF,
  readAloudPause: OFF,
  readAloudStop: OFF,
};

/**
 * System-wide shortcuts for Read Aloud. Electron reports key-down only.
 */
export class ShortcutService {
  private state: ShortcutState = { ...EMPTY };
  private registered: string[] = [];

  constructor(
    private readonly handlers: {
      readAloud(): void;
      readAloudPause(): void;
      readAloudStop(): void;
    },
  ) {}

  apply(settings: Settings): ShortcutState {
    this.clear();
    this.state = {
      readAloud: this.register(settings.tts.shortcut, this.handlers.readAloud),
      readAloudPause: this.register(settings.tts.pauseShortcut, this.handlers.readAloudPause),
      readAloudStop: this.register(settings.tts.stopShortcut, this.handlers.readAloudStop),
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
