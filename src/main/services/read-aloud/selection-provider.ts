import type { Settings } from '@shared/domain/settings';
import { resolveKeyCommand, runKeyCommand } from '../keystrokes';
import { captureByCopy } from './clipboard-capture';
import { LinuxSelection } from './linux-selection';
import { MacSelection } from './macos-selection';
import { WindowsSelection } from './windows-selection';

/** What an OS accessibility API said about the focused control's selection. */
export type NativeSelection =
  | { kind: 'text'; text: string }
  | { kind: 'empty' | 'protected' | 'none' | 'permission' };

/** One OS's way of reading the selection, and of sending Copy to the focused app. */
export interface SelectionAdapter {
  readonly method: 'accessibility' | 'primary';
  read(): Promise<NativeSelection>;
  /** Sends Copy to the focused app after the user has let go of the modifier keys. */
  copy(): Promise<void>;
  /** False when copying would fail anyway, for example without Accessibility access on macOS. */
  canCopy(): boolean;
  warm(): void;
  dispose(): void;
}

export type SelectionResult =
  | { ok: true; text: string; method: 'accessibility' | 'primary' | 'copy' }
  | { ok: false; reason: 'empty' | 'protected' | 'permission' | 'unsupported' };

class CopyOnly implements SelectionAdapter {
  readonly method = 'accessibility';
  private readonly command = resolveKeyCommand();
  async read(): Promise<NativeSelection> {
    return { kind: 'none' };
  }
  async copy(): Promise<void> {
    if (!this.command) throw new Error('No copy helper');
    await runKeyCommand(this.command);
  }
  canCopy(): boolean {
    return this.command !== null;
  }
  warm(): void {}
  dispose(): void {}
}

function createAdapter(): SelectionAdapter {
  if (process.platform === 'win32') return new WindowsSelection();
  if (process.platform === 'darwin') return new MacSelection();
  if (process.platform === 'linux') return new LinuxSelection();
  return new CopyOnly();
}

/**
 * Reads the selected text of whichever app has focus, without focusing Inaudio. The OS
 * accessibility API is asked first; a copy through the clipboard is the fallback. Text is
 * returned to the caller only and never logged.
 */
export class SelectionProvider {
  private readonly adapter = createAdapter();

  constructor(private readonly settings: () => Settings['tts']) {}

  warm(): void {
    if (this.settings().useAccessibility) this.adapter.warm();
  }

  async capture(): Promise<SelectionResult> {
    const { useAccessibility, copyFallback, restoreClipboard } = this.settings();
    let permission = false;
    if (useAccessibility) {
      const native = await this.adapter.read().catch((): NativeSelection => ({ kind: 'none' }));
      if (native.kind === 'text' && native.text.trim()) {
        return { ok: true, text: native.text, method: this.adapter.method };
      }
      // A password field is refused outright, not worked around with a copy.
      if (native.kind === 'protected') return { ok: false, reason: 'protected' };
      permission = native.kind === 'permission';
    }
    if (!copyFallback) return { ok: false, reason: permission ? 'permission' : useAccessibility ? 'empty' : 'unsupported' };
    if (!this.adapter.canCopy()) {
      // On macOS the copy helper needs the same Accessibility permission the direct read did.
      const denied = permission || process.platform === 'darwin';
      return { ok: false, reason: denied ? 'permission' : 'unsupported' };
    }
    const copied = await captureByCopy(() => this.adapter.copy(), restoreClipboard);
    return 'text' in copied ? { ok: true, text: copied.text, method: 'copy' } : { ok: false, reason: copied.error };
  }

  dispose(): void {
    this.adapter.dispose();
  }
}
