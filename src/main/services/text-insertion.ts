import { clipboard, systemPreferences } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { InsertionSupport } from '@shared/domain/system';

interface PasteCommand {
  file: string;
  args: string[];
  method: string;
}

function findOnPath(binary: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Fixed executables with fixed arguments. Transcript text never reaches a
 * command line; it only travels through the clipboard.
 */
function resolvePasteCommand(): PasteCommand | null {
  switch (process.platform) {
    case 'darwin':
      return {
        file: '/usr/bin/osascript',
        args: ['-e', 'tell application "System Events" to keystroke "v" using command down'],
        method: 'System Events (osascript)',
      };
    case 'win32': {
      const root = process.env.SystemRoot ?? 'C:\\Windows';
      return {
        file: path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ],
        method: 'SendKeys (PowerShell)',
      };
    }
    default: {
      if (process.env.WAYLAND_DISPLAY) {
        const wtype = findOnPath('wtype');
        if (wtype) return { file: wtype, args: ['-M', 'ctrl', 'v', '-m', 'ctrl'], method: 'wtype' };
        const ydotool = findOnPath('ydotool');
        if (ydotool) return { file: ydotool, args: ['key', '29:1', '47:1', '47:0', '29:0'], method: 'ydotool' };
      }
      const xdotool = findOnPath('xdotool');
      if (xdotool) {
        return { file: xdotool, args: ['key', '--clearmodifiers', 'ctrl+v'], method: 'xdotool' };
      }
      return null;
    }
  }
}

function run(command: PasteCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command.file, command.args, { timeout: 5000, windowsHide: true, shell: false }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

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
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private buffer = '';
  private waiter: { resolve(line: string): void; reject(error: Error): void } | null = null;

  constructor(private readonly file: string) {}

  /** Starts the helper in the background; true once it can take a paste. */
  warm(): boolean {
    if (!this.child) this.start();
    return this.ready;
  }

  async paste(): Promise<void> {
    if (!this.child || !this.ready) throw new Error('Paste helper is not ready');
    const reply = this.next();
    this.child.stdin.write('paste\n');
    if ((await reply) !== 'ok') throw new Error('Paste helper failed');
  }

  dispose(): void {
    const child = this.child;
    this.reset(new Error('Paste helper stopped'));
    child?.kill();
  }

  private start(): void {
    const child = spawn(this.file, ['-NoProfile', '-NonInteractive', '-Command', HELPER_SCRIPT], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      this.buffer += data;
      let index: number;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!this.ready && line === 'ready') this.ready = true;
        else this.settle(line);
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', (error) => { if (this.child === child) this.reset(error); });
    child.once('exit', () => { if (this.child === child) this.reset(new Error('Paste helper exited')); });
  }

  private next(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A wedged helper is replaced on the next paste.
        this.dispose();
        reject(new Error('Paste helper timed out'));
      }, HELPER_TIMEOUT_MS);
      this.waiter = {
        resolve: (line) => { clearTimeout(timer); resolve(line); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
    });
  }

  private settle(line: string): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.resolve(line);
  }

  private reset(error: Error): void {
    this.child = null;
    this.ready = false;
    this.buffer = '';
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }
}

export class TextInserter {
  private readonly command = resolvePasteCommand();
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

  private async sendPaste(command: PasteCommand): Promise<void> {
    // The helper's first start is slower than one one-shot paste, so that paste uses the
    // one-shot path while the helper starts behind it. Once the helper has the request it
    // may already have pasted, so its failure is reported instead of retried: the caller
    // falls back to leaving the text on the clipboard, and the next paste respawns it.
    if (this.helper?.warm()) return this.helper.paste();
    await run(command);
  }
}
