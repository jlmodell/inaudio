import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { resolveKeyCommand, runKeyCommand, WINDOWS_WAIT_FOR_MODIFIERS } from '../keystrokes';
import { PowerShellHelper, windowsPowerShell } from '../powershell-helper';
import type { NativeSelection, SelectionAdapter } from './selection-provider';

const READY_MS = 4_000;
const REQUEST_MS = 3_000;

/**
 * UI Automation: the focused element, or the nearest ancestor that implements TextPattern,
 * answers with its selected ranges. Password fields answer `protected`. The text is sent back
 * base64-encoded so a newline in it cannot break the one-line protocol.
 */
const SCRIPT = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
${WINDOWS_WAIT_FOR_MODIFIERS}
$Max = ${MAX_READ_ALOUD_CHARS}
function Get-Selection {
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $e) { return 'none' }
    if ($e.Current.IsPassword) { return 'protected' }
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    for ($i = 0; $i -lt 7 -and $null -ne $e; $i++) {
      $pattern = $null
      if ($e.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
        $ranges = $pattern.GetSelection()
        if ($null -eq $ranges -or $ranges.Length -eq 0) { return 'empty' }
        $text = (($ranges | ForEach-Object { $_.GetText($Max) }) -join [Environment]::NewLine).Trim()
        if (-not $text) { return 'empty' }
        if ($text.Length -gt $Max) { $text = $text.Substring(0, $Max) }
        return 'text ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))
      }
      $e = $walker.GetParent($e)
    }
    return 'none'
  } catch { return 'none' }
}
[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line -eq 'select') { [Console]::Out.WriteLine((Get-Selection)) }
  elseif ($line -eq 'copy') { Wait-Modifiers; [System.Windows.Forms.SendKeys]::SendWait('^c'); [Console]::Out.WriteLine('ok') }
}
`;

/** Windows selection through a long-lived PowerShell that only ever receives `select` or `copy`. */
export class WindowsSelection implements SelectionAdapter {
  readonly method = 'accessibility';
  private readonly helper = new PowerShellHelper(windowsPowerShell(), SCRIPT, REQUEST_MS, 'Selection helper');
  private readonly fallback = resolveKeyCommand('copy');

  async read(): Promise<NativeSelection> {
    if (!(await this.helper.whenReady(READY_MS)) || this.helper.busy) return { kind: 'none' };
    const line = await this.helper.request('select').catch(() => 'none');
    if (line.startsWith('text ')) {
      return { kind: 'text', text: Buffer.from(line.slice(5), 'base64').toString('utf8') };
    }
    return line === 'empty' || line === 'protected' ? { kind: line } : { kind: 'none' };
  }

  async copy(): Promise<void> {
    if (this.helper.warm() && !this.helper.busy) {
      if ((await this.helper.request('copy')) !== 'ok') throw new Error('Copy failed');
      return;
    }
    if (!this.fallback) throw new Error('No copy helper');
    await runKeyCommand(this.fallback);
  }

  canCopy(): boolean {
    return true;
  }

  warm(): void {
    this.helper.warm();
  }

  dispose(): void {
    this.helper.dispose();
  }
}
