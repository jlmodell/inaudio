import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { windowsPowerShell } from './powershell-helper';

export interface KeyCommand {
  file: string;
  args: string[];
  method: string;
}

export function findOnPath(binary: string): string | null {
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

/** Waits up to 800 ms for Shift, Ctrl, Alt and Win to be released, so Ctrl+C is not read as Ctrl+Shift+C. */
export const WINDOWS_WAIT_FOR_MODIFIERS = [
  "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class InaudioKeys { [DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int key); }'",
  'function Wait-Modifiers {',
  '  $until = [DateTime]::UtcNow.AddMilliseconds(800)',
  '  while ([DateTime]::UtcNow -lt $until -and (@(0x10, 0x11, 0x12, 0x5B, 0x5C) | Where-Object { [InaudioKeys]::GetAsyncKeyState($_) -band 0x8000 })) { Start-Sleep -Milliseconds 15 }',
  '}',
].join('\n');

/** The same wait on macOS, through the modifier flags of the current event state. */
const MACOS_COPY = [
  "ObjC.import('AppKit');",
  'var until = Date.now() + 800;',
  'while (($.NSEvent.modifierFlags & 0x1E0000) !== 0 && Date.now() < until) delay(0.015);',
  "Application('System Events').keystroke('c', { using: 'command down' });",
].join('\n');

/**
 * Fixed executables with fixed arguments for a paste or a copy in the focused app. Text never
 * reaches a command line; it only travels through the clipboard.
 */
export function resolveKeyCommand(key: 'paste' | 'copy'): KeyCommand | null {
  const letter = key === 'paste' ? 'v' : 'c';
  switch (process.platform) {
    case 'darwin':
      return key === 'paste'
        ? {
            file: '/usr/bin/osascript',
            args: ['-e', 'tell application "System Events" to keystroke "v" using command down'],
            method: 'System Events (osascript)',
          }
        : { file: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e', MACOS_COPY], method: 'System Events (osascript)' };
    case 'win32':
      return {
        file: windowsPowerShell(),
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          key === 'paste'
            ? "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
            : `${WINDOWS_WAIT_FOR_MODIFIERS}\nAdd-Type -AssemblyName System.Windows.Forms; Wait-Modifiers; [System.Windows.Forms.SendKeys]::SendWait('^c')`,
        ],
        method: 'SendKeys (PowerShell)',
      };
    default: {
      if (process.env.WAYLAND_DISPLAY) {
        const wtype = findOnPath('wtype');
        if (wtype) return { file: wtype, args: ['-M', 'ctrl', letter, '-m', 'ctrl'], method: 'wtype' };
        const ydotool = findOnPath('ydotool');
        // Linux input event codes: 29 is left Ctrl, 47 is V and 46 is C.
        const code = key === 'paste' ? '47' : '46';
        if (ydotool) return { file: ydotool, args: ['key', '29:1', `${code}:1`, `${code}:0`, '29:0'], method: 'ydotool' };
      }
      const xdotool = findOnPath('xdotool');
      if (xdotool) {
        return { file: xdotool, args: ['key', '--clearmodifiers', `ctrl+${letter}`], method: 'xdotool' };
      }
      return null;
    }
  }
}

export function runKeyCommand(command: KeyCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command.file, command.args, { timeout: 5000, windowsHide: true, shell: false }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}
