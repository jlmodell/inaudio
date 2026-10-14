import { screen, type BrowserWindow } from 'electron';
import type { CompanionGaze } from '@shared/domain/companion';
import { EVENTS } from '@shared/ipc/channels';
import type { FocusProbe, FocusTarget } from './focus-probe';

/** Cursor reads per second is 1000 / this. A read is cheap; IPC only follows movement. */
const CURSOR_INTERVAL_MS = 66;
/** How often the focused field is probed (Windows). */
const FOCUS_INTERVAL_MS = 500;
/** How long the eyes stay on the field after the caret moves or text lands. */
const FIELD_HOLD_MS = 2_000;
/** Smaller moves are not sent; the eyes would not visibly change. */
const MIN_MOVE_PX = 2;

export interface GazeMode {
  /** The companion is shown, animated, and set to follow with its eyes. */
  eyes: boolean;
  /** Something needs the focused field: the eyes, or "Above active area" placement. */
  focus: boolean;
  asleep: boolean;
  dictating: boolean;
}

const IDLE: GazeMode = { eyes: false, focus: false, asleep: false, dictating: false };

function center(target: FocusTarget): { x: number; y: number } {
  return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
}

/**
 * Decides where the companion looks and tells its window. During dictation, or for a moment
 * after the caret moves or text is inserted, that is the focused field; otherwise the cursor.
 * Every timer stops while the companion is hidden, asleep, or not tracking.
 */
export class CompanionGazeTracker {
  private mode: GazeMode = IDLE;
  private cursorTimer: NodeJS.Timeout | null = null;
  private focusTimer: NodeJS.Timeout | null = null;
  private target: FocusTarget | null = null;
  private fieldUntil = 0;
  private sent: CompanionGaze | undefined;

  constructor(
    private readonly probe: FocusProbe,
    private readonly window: () => BrowserWindow | null,
  ) {}

  /** The field last found, for placement. Never probes. */
  focusTarget(): FocusTarget | null {
    return this.target;
  }

  configure(mode: GazeMode): void {
    const startedDictating = mode.dictating && !this.mode.dictating;
    this.mode = mode;
    const eyes = mode.eyes && !mode.asleep;
    const focus = mode.focus && !mode.asleep && this.probe.supported;
    if (eyes && !this.cursorTimer) {
      this.cursorTimer = setInterval(() => this.tick(), CURSOR_INTERVAL_MS);
      this.cursorTimer.unref();
    } else if (!eyes && this.cursorTimer) {
      clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
    if (focus && !this.focusTimer) {
      this.focusTimer = setInterval(() => void this.refresh(), FOCUS_INTERVAL_MS);
      this.focusTimer.unref();
      void this.refresh();
    } else if (!focus && this.focusTimer) {
      clearInterval(this.focusTimer);
      this.focusTimer = null;
      this.target = null;
      this.probe.stop();
    }
    if (mode.asleep && mode.eyes) this.send('rest');
    else if (!eyes) this.send(null);
    if (startedDictating) this.attend();
  }

  /** Look at the field now: dictation started, or text just landed in it. */
  attend(): void {
    this.fieldUntil = Date.now() + FIELD_HOLD_MS;
    if (this.focusTimer) void this.refresh();
  }

  /** Forgets what the window was last told, e.g. after it reloads. */
  reset(): void {
    this.sent = undefined;
  }

  dispose(): void {
    this.configure(IDLE);
    this.probe.stop();
  }

  private async refresh(): Promise<void> {
    const next = await this.probe.probe();
    if (next === undefined) return;
    const previous = this.target;
    // A caret that moved inside the same kind of target means the user is typing.
    if (
      next?.kind === 'caret' &&
      previous?.kind === 'caret' &&
      (Math.abs(next.x - previous.x) > 1 || Math.abs(next.y - previous.y) > 1)
    ) {
      this.fieldUntil = Date.now() + FIELD_HOLD_MS;
    }
    this.target = next;
  }

  private tick(): void {
    const win = this.window();
    if (!win || win.isDestroyed()) return;
    const field = this.target && this.target.kind !== 'window' ? this.target : null;
    const point = field && (this.mode.dictating || Date.now() < this.fieldUntil) ? center(field) : screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    this.send({ x: Math.round(point.x - bounds.x), y: Math.round(point.y - bounds.y) });
  }

  private send(gaze: CompanionGaze): void {
    const last = this.sent;
    if (last !== undefined) {
      if (gaze === last) return;
      if (
        gaze && typeof gaze === 'object' && last && typeof last === 'object' &&
        Math.abs(gaze.x - last.x) < MIN_MOVE_PX && Math.abs(gaze.y - last.y) < MIN_MOVE_PX
      ) {
        return;
      }
    }
    const win = this.window();
    if (!win || win.isDestroyed()) return;
    this.sent = gaze;
    win.webContents.send(EVENTS.companionGaze, gaze);
  }
}
