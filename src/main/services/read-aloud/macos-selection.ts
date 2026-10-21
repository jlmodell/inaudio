import { systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { resolveKeyCommand, runKeyCommand } from '../keystrokes';
import type { NativeSelection, SelectionAdapter } from './selection-provider';

/**
 * The focused element of the frontmost app answers with AXSelectedText. Secure text fields
 * answer `protected`. The text comes back base64-encoded, capped at the session limit.
 */
const SCRIPT = `
ObjC.import('AppKit');
ObjC.import('ApplicationServices');
function attribute(element, name) {
  var value = Ref();
  return $.AXUIElementCopyAttributeValue(element, name, value) === 0 ? value[0] : null;
}
function run() {
  try {
    var front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    if (!front) return 'none';
    var focused = attribute($.AXUIElementCreateApplication(front.processIdentifier), 'AXFocusedUIElement');
    if (!focused) return 'none';
    var subrole = attribute(focused, 'AXSubrole');
    if (subrole && ObjC.unwrap(subrole) === 'AXSecureTextField') return 'protected';
    var selected = attribute(focused, 'AXSelectedText');
    if (!selected) return 'none';
    var text = ObjC.unwrap(selected);
    if (typeof text !== 'string' || !text.trim()) return 'empty';
    text = text.slice(0, ${MAX_READ_ALOUD_CHARS});
    return 'text ' + $(text).dataUsingEncoding($.NSUTF8StringEncoding).base64EncodedStringWithOptions(0).js;
  } catch (error) {
    return 'none';
  }
}
`;

function osascript(): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', SCRIPT],
      { timeout: 3_000, shell: false, maxBuffer: MAX_READ_ALOUD_CHARS * 8 },
      (error, stdout) => resolve(error ? 'none' : stdout.trim()),
    );
  });
}

/** macOS selection through the Accessibility API, which needs the user's permission. */
export class MacSelection implements SelectionAdapter {
  readonly method = 'accessibility';
  private readonly command = resolveKeyCommand();

  async read(): Promise<NativeSelection> {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) return { kind: 'permission' };
    const line = await osascript();
    if (line.startsWith('text ')) {
      return { kind: 'text', text: Buffer.from(line.slice(5), 'base64').toString('utf8') };
    }
    return line === 'empty' || line === 'protected' ? { kind: line } : { kind: 'none' };
  }

  async copy(): Promise<void> {
    if (!this.command) throw new Error('No copy helper');
    await runKeyCommand(this.command);
  }

  canCopy(): boolean {
    return systemPreferences.isTrustedAccessibilityClient(false);
  }

  warm(): void {}

  dispose(): void {}
}
