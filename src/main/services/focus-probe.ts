import { screen } from 'electron';
import { PowerShellHelper, windowsPowerShell } from './powershell-helper';

/** Where the user is typing, in DIP screen coordinates. */
export interface FocusTarget {
  /** A text caret, the focused text control, or only the foreground window. */
  kind: 'caret' | 'element' | 'window';
  x: number;
  y: number;
  width: number;
  height: number;
}

const PROBE_TIMEOUT_MS = 1_500;
/** After a timeout or crash, the probe rests this long before it starts PowerShell again. */
const COOLDOWN_MS = 10_000;

/**
 * Win32 caret first (GetGUIThreadInfo), then the UI Automation focused element when it is a
 * text control, then the foreground window. Coordinates are physical pixels: the thread is
 * made per-monitor DPI aware so they are not virtualised, and main converts them to DIPs.
 */
const PROBE_SCRIPT = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InaudioFocus {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public int cbSize; public int flags; public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret;
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  public static void Aware() { try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { } }
  public static string Caret() {
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return "";
    uint pid;
    uint tid = GetWindowThreadProcessId(fg, out pid);
    GUITHREADINFO info = new GUITHREADINFO();
    info.cbSize = Marshal.SizeOf(info);
    if (!GetGUIThreadInfo(tid, ref info) || info.hwndCaret == IntPtr.Zero) return "";
    POINT p = new POINT();
    p.X = info.rcCaret.Left;
    p.Y = info.rcCaret.Top;
    int h = info.rcCaret.Bottom - info.rcCaret.Top;
    if (h <= 0 || !ClientToScreen(info.hwndCaret, ref p)) return "";
    return "caret " + p.X + " " + p.Y + " " + Math.Max(1, info.rcCaret.Right - info.rcCaret.Left) + " " + h;
  }
  public static string Window() {
    IntPtr fg = GetForegroundWindow();
    RECT r;
    if (fg == IntPtr.Zero || !GetWindowRect(fg, out r)) return "none";
    return "window " + r.Left + " " + r.Top + " " + (r.Right - r.Left) + " " + (r.Bottom - r.Top);
  }
}
'@
function Get-FocusedField {
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -eq $e) { return '' }
    $t = $e.Current.ControlType
    if ($t -ne [System.Windows.Automation.ControlType]::Edit -and $t -ne [System.Windows.Automation.ControlType]::Document) { return '' }
    $r = $e.Current.BoundingRectangle
    if ($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0) { return '' }
    return "element $([int]$r.X) $([int]$r.Y) $([int]$r.Width) $([int]$r.Height)"
  } catch { return '' }
}
[InaudioFocus]::Aware()
[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line -eq 'probe') {
    [InaudioFocus]::Aware()
    $answer = [InaudioFocus]::Caret()
    if (-not $answer) { $answer = Get-FocusedField }
    if (-not $answer) { $answer = [InaudioFocus]::Window() }
    [Console]::Out.WriteLine($answer)
  }
}
`;

function parse(line: string): FocusTarget | null {
  const [kind, ...rest] = line.split(' ');
  if (kind !== 'caret' && kind !== 'element' && kind !== 'window') return null;
  const [x, y, width, height] = rest.map(Number);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  const rect = screen.screenToDipRect(null, { x: x!, y: y!, width: width!, height: height! });
  return { kind, ...rect };
}

/**
 * Reads where the user is typing in other apps. Windows only, through its own PowerShell so
 * a slow probe never sits in front of a dictation paste.
 */
export class FocusProbe {
  private readonly helper =
    process.platform === 'win32'
      ? new PowerShellHelper(windowsPowerShell(), PROBE_SCRIPT, PROBE_TIMEOUT_MS, 'Focus probe')
      : null;
  private cooldownUntil = 0;

  get supported(): boolean {
    return this.helper !== null;
  }

  /**
   * The focused field, `null` when nothing is focused, or `undefined` when there is no answer
   * yet (still starting, already probing, or resting after a failure).
   */
  async probe(): Promise<FocusTarget | null | undefined> {
    const helper = this.helper;
    if (!helper || helper.busy) return undefined;
    if (!helper.running) {
      // At most one (re)start per cooldown, so a PowerShell that keeps dying is not respawned
      // on every poll.
      if (Date.now() < this.cooldownUntil) return undefined;
      this.cooldownUntil = Date.now() + COOLDOWN_MS;
      helper.warm();
      return undefined;
    }
    if (!helper.warm()) return undefined;
    try {
      return parse(await helper.request('probe'));
    } catch {
      return undefined;
    }
  }

  /** Stops PowerShell. The next probe starts it again. */
  stop(): void {
    this.helper?.dispose();
  }
}
