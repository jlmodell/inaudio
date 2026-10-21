import { clipboard } from 'electron';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { resolveKeyCommand, runKeyCommand } from '../keystrokes';
import type { NativeSelection, SelectionAdapter } from './selection-provider';

/**
 * Linux selection through the PRIMARY selection, which X11 and most Wayland compositors fill
 * with whatever text is highlighted. It can still hold an older selection after a deselect.
 */
export class LinuxSelection implements SelectionAdapter {
  readonly method = 'primary';
  private readonly command = resolveKeyCommand();

  async read(): Promise<NativeSelection> {
    const primary = clipboard.selection as Electron.Clipboard | undefined;
    if (!primary) return { kind: 'none' };
    const text = (await primary.readText().catch(() => '')).slice(0, MAX_READ_ALOUD_CHARS);
    return text.trim() ? { kind: 'text', text } : { kind: 'empty' };
  }

  async copy(): Promise<void> {
    if (!this.command) throw new Error('Install xdotool (X11) or wtype (Wayland) to copy from other apps.');
    await runKeyCommand(this.command);
  }

  canCopy(): boolean {
    return this.command !== null;
  }

  warm(): void {}

  dispose(): void {}
}
