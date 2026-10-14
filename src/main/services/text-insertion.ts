import { clipboard, systemPreferences } from 'electron';
import type { InsertionSupport } from '@shared/domain/system';
import { resolveKeyCommand, runKeyCommand, type KeyCommand } from './keystrokes';
import { PowerShellHelper } from './powershell-helper';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HELPER_TIMEOUT_MS = 5_000;
/** Loads Forms once, then sends Ctrl+V for each fixed `paste` line read from stdin. */
const HELPER_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  "[Console]::Out.WriteLine('ready')",
  'while ($null -ne ($line = [Console]::In.ReadLine())) {',
  "  if ($line -eq 'paste') { [System.Windows.Forms.SendKeys]::SendWait('^v'); [Console]::Out.WriteLine('ok') }",
  '}',
].join('\n');

/**
 * A long-lived PowerShell on Windows. Starting PowerShell and loading Forms costs ~600 ms,
 * which every dictation used to pay before its text appeared. Only the fixed token `paste`
 * is ever written to it; the transcript still travels through the clipboard alone.
 */
class PasteHelper {
  private readonly helper: PowerShellHelper;

  constructor(file: string) {
    this.helper = new PowerShellHelper(file, HELPER_SCRIPT, HELPER_TIMEOUT_MS, 'Paste helper');
  }

  /** Starts the helper in the background; true once it can take a paste. */
  warm(): boolean {
    return this.helper.warm();
  }

  async paste(): Promise<void> {
    if ((await this.helper.request('paste')) !== 'ok') throw new Error('Paste helper failed');
  }

  dispose(): void {
    this.helper.dispose();
  }
}

export class TextInserter {
  private readonly command = resolveKeyCommand('paste');
  private readonly helper =
    process.platform === 'win32' && this.command ? new PasteHelper(this.command.file) : null;
  /** Pastes run one at a time so the helper never has two replies outstanding. */
  private pasting: Promise<void> = Promise.resolve();

  support(): InsertionSupport {
    if (!this.command) {
      return {
        available: false,
        reason:
          process.platform === 'linux'
            ? 'Install xdotool (X11) or wtype (Wayland) to paste into other apps.'
            : 'No paste helper found.',
      };
    }
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      return { available: false, reason: 'Grant Accessibility access in System Settings.' };
    }
    return { available: true, method: this.command.method };
  }

  copy(text: string): Promise<void> {
    return clipboard.writeText(text);
  }

  /** Puts text on the clipboard, sends the paste keystroke to the focused app, then restores the clipboard. */
  async insert(text: string, { restoreClipboard }: { restoreClipboard: boolean }): Promise<void> {
    const support = this.support();
    if (!support.available || !this.command) throw new Error(support.available ? 'Paste failed' : support.reason);
    const command = this.command;
    const job = this.pasting.then(async () => {
      const previous = restoreClipboard ? await clipboard.readText() : null;
      await clipboard.writeText(text);
      await delay(60);
      await this.sendPaste(command);
      if (previous !== null) {
        await delay(400);
        if ((await clipboard.readText()) === text) await clipboard.writeText(previous);
      }
    });
    this.pasting = job.catch(() => undefined);
    return job;
  }

  dispose(): void {
    this.helper?.dispose();
  }

  private async sendPaste(command: KeyCommand): Promise<void> {
    // The helper's first start is slower than one one-shot paste, so that paste uses the
    // one-shot path while the helper starts behind it. Once the helper has the request it
    // may already have pasted, so its failure is reported instead of retried: the caller
    // falls back to leaving the text on the clipboard, and the next paste respawns it.
    if (this.helper?.warm()) return this.helper.paste();
    await runKeyCommand(command);
  }
}
