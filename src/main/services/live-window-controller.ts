import { screen, type BrowserWindow, type Rectangle } from 'electron';
import {
  IDLE_LIVE,
  LIVE_WINDOW_TAIL_CHARS,
  needsDisplayCapture,
  type LiveState,
  type SystemAudioSupport,
} from '@shared/domain/capture';
import { LIVE_WINDOW_SIZE, type Settings, type SettingsPatch } from '@shared/domain/settings';
import type { AudioDevice, LiveWindowState } from '@shared/domain/system';
import { EVENTS } from '@shared/ipc/channels';
import { isWayland, overlaySupport } from '../app/platform';
import { registerSurface } from '../security/surfaces';
import { createLiveWindow } from '../windows/live-window';
import {
  LIVE_WINDOW_COLLAPSED_HEIGHT,
  keepInside,
  liveWindowBounds,
  resizedBounds,
  type ResizeEdge,
} from '../windows/live-window-size';

interface LiveWindowOptions {
  settings(): Settings;
  updateSettings(patch: SettingsPatch): void;
  /** The devices the app window last enumerated, for the `device` source's label. */
  devices(): AudioDevice[];
  support(): SystemAudioSupport;
  /** Display name of the active recognition model, and whether it is on disk. */
  model(): { name: string; installed: boolean };
  /** The window was shown or hidden, so the tray and the overlay can say so. */
  onVisibility(open: boolean): void;
}

/** A resize settles before its size is saved, so a drag does not write settings every frame. */
const SAVE_SIZE_MS = 400;

/** The end of a long transcript, cut at a paragraph so the window never opens mid-sentence. */
function tail(text: string): { text: string; truncated: boolean } {
  if (text.length <= LIVE_WINDOW_TAIL_CHARS) return { text, truncated: false };
  const cut = text.slice(-LIVE_WINDOW_TAIL_CHARS);
  const paragraph = cut.indexOf('\n\n');
  return { text: paragraph >= 0 && paragraph < cut.length - 2 ? cut.slice(paragraph + 2) : cut, truncated: true };
}

/**
 * Owns the floating live window: when it exists, where it sits, how it floats, and what it
 * shows. It only mirrors the session; starting, stopping and copying go through the live
 * controller and the main process, never through the page inside it.
 */
export class LiveWindowController {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private live: LiveState = { ...IDLE_LIVE };
  private level = 0;
  private collapsed = false;
  /** Where the user dragged it. Kept only while the window exists. */
  private dragged: Rectangle | null = null;
  /** setBounds is running, so the move and resize it causes are not the user's. */
  private placing = false;
  private sizeTimer: NodeJS.Timeout | null = null;
  /** An edge is being dragged: the bounds and pointer it started from. */
  private resizing: { bounds: Rectangle; x: number; y: number; edge: ResizeEdge } | null = null;
  private disposed = false;
  private readonly onDisplayChange = () => this.place();

  constructor(private readonly options: LiveWindowOptions) {
    screen.on('display-added', this.onDisplayChange);
    screen.on('display-removed', this.onDisplayChange);
    screen.on('display-metrics-changed', this.onDisplayChange);
  }

  visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  show(): void {
    if (this.disposed) return;
    const win = this.ensure();
    this.apply();
    this.place();
    this.push();
    if (!win.isVisible()) {
      // Never take focus from the meeting or the video being transcribed.
      if (isWayland()) win.show();
      else win.showInactive();
      this.options.onVisibility(true);
    }
    win.moveTop();
  }

  /** Closing drops the window and any dragged position; it reopens in its corner. */
  hide(): void {
    const win = this.win;
    this.win = null;
    this.loaded = false;
    this.dragged = null;
    this.collapsed = false;
    if (this.sizeTimer) clearTimeout(this.sizeTimer);
    this.sizeTimer = null;
    if (win && !win.isDestroyed()) {
      win.destroy();
      this.options.onVisibility(false);
    }
  }

  toggle(): void {
    if (this.visible()) this.hide();
    else this.show();
  }

  /** A session reached capture: the window opens if the user asked for that. */
  sessionStarted(): void {
    if (this.options.settings().liveWindow.openOnStart) this.show();
  }

  setLive(state: LiveState): void {
    this.live = state;
    if (state.phase !== 'capturing') this.level = 0;
    this.push();
  }

  /** Only the meter moved; it has its own small message so the text is not resent. */
  setLevel(level: number): void {
    if (this.level === level) return;
    this.level = level;
    const win = this.win;
    if (this.loaded && win && !win.isDestroyed()) win.webContents.send(EVENTS.liveWindowLevel, level);
  }

  /**
   * An edge or corner of the transparent window is being dragged. The page reports pointer
   * positions; the size limits and the work area are enforced here.
   */
  resizeTo(phase: 'start' | 'move' | 'end', edge: ResizeEdge, x: number, y: number): void {
    const win = this.win;
    if (!win || win.isDestroyed() || this.collapsed) return;
    if (phase === 'start') {
      this.resizing = { bounds: win.getBounds(), x, y, edge };
      return;
    }
    const resizing = this.resizing;
    if (!resizing) return;
    const area = screen.getDisplayMatching(resizing.bounds).workArea;
    const next = resizedBounds(resizing.bounds, resizing.edge, x - resizing.x, y - resizing.y, LIVE_WINDOW_SIZE, area);
    this.placing = true;
    try {
      win.setBounds(next);
    } finally {
      this.placing = false;
    }
    // A resized window keeps where it now is until it is closed, like a dragged one.
    this.dragged = next;
    if (phase === 'end') {
      this.resizing = null;
      this.sizeChanged(win);
    }
  }

  setCollapsed(collapsed: boolean): void {
    if (this.collapsed === collapsed || !this.visible()) return;
    this.collapsed = collapsed;
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const { liveWindow } = this.options.settings();
    win.setMinimumSize(LIVE_WINDOW_SIZE.minWidth, collapsed ? LIVE_WINDOW_COLLAPSED_HEIGHT : LIVE_WINDOW_SIZE.minHeight);
    if (this.dragged) {
      // A dragged window keeps its top edge and changes height in place.
      const height = collapsed ? LIVE_WINDOW_COLLAPSED_HEIGHT : liveWindow.height;
      this.dragged = { ...this.dragged, height };
    }
    this.place();
    this.push();
  }

  /** Settings changed: float, protection, opacity and size follow at once. */
  sync(): void {
    if (!this.visible()) return;
    this.apply();
    if (!this.dragged) this.place();
    this.push();
  }

  /** The window's draw state changed for reasons other than the session: devices, models. */
  refresh(): void {
    this.push();
  }

  destroy(): void {
    this.disposed = true;
    screen.removeListener('display-added', this.onDisplayChange);
    screen.removeListener('display-removed', this.onDisplayChange);
    screen.removeListener('display-metrics-changed', this.onDisplayChange);
    this.hide();
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = createLiveWindow(this.options.settings().liveWindow);
    this.win = win;
    this.loaded = false;
    registerSurface(win.webContents, 'live');
    win.webContents.once('did-finish-load', () => {
      this.loaded = true;
      this.push();
    });
    win.on('moved', () => {
      if (!this.placing && win === this.win) this.dragged = win.getBounds();
    });

    win.on('closed', () => {
      if (this.win !== win) return;
      this.win = null;
      this.loaded = false;
      this.dragged = null;
      this.options.onVisibility(false);
    });
    return win;
  }

  private sizeChanged(win: BrowserWindow): void {
    if (this.collapsed || win !== this.win) return;
    if (this.dragged) this.dragged = win.getBounds();
    if (this.sizeTimer) clearTimeout(this.sizeTimer);
    this.sizeTimer = setTimeout(() => {
      this.sizeTimer = null;
      if (win.isDestroyed() || win !== this.win || this.collapsed) return;
      const [width = 0, height = 0] = win.getSize();
      const current = this.options.settings().liveWindow;
      const next = {
        width: Math.round(Math.min(LIVE_WINDOW_SIZE.maxWidth, Math.max(LIVE_WINDOW_SIZE.minWidth, width))),
        height: Math.round(Math.min(LIVE_WINDOW_SIZE.maxHeight, Math.max(LIVE_WINDOW_SIZE.minHeight, height))),
      };
      if (next.width !== current.width || next.height !== current.height) {
        this.options.updateSettings({ liveWindow: next });
      }
    }, SAVE_SIZE_MS);
    this.sizeTimer.unref();
  }

  private apply(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const { liveWindow } = this.options.settings();
    const support = overlaySupport();
    if (support.alwaysOnTop) {
      if (liveWindow.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
      else win.setAlwaysOnTop(false);
    }
    // Windows 10 2004+ removes the window from capture entirely; macOS only from older
    // capture APIs. Linux has no equivalent.
    if (process.platform === 'win32' || process.platform === 'darwin') win.setContentProtection(liveWindow.hideFromCapture);
    if (support.opacity) win.setOpacity(liveWindow.opacity);
  }

  private place(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const { liveWindow } = this.options.settings();
    let bounds: Rectangle;
    if (this.dragged) {
      bounds = keepInside(this.dragged, screen.getDisplayMatching(this.dragged).workArea);
      this.dragged = bounds;
    } else {
      bounds = liveWindowBounds(screen.getPrimaryDisplay().workArea, liveWindow.position, liveWindow, this.collapsed);
    }
    const current = win.getBounds();
    if (current.x === bounds.x && current.y === bounds.y && current.width === bounds.width && current.height === bounds.height) return;
    this.placing = true;
    try {
      win.setBounds(bounds);
    } finally {
      this.placing = false;
    }
  }

  private push(): void {
    const win = this.win;
    if (!this.loaded || !win || win.isDestroyed()) return;
    win.webContents.send(EVENTS.liveWindowState, this.state());
  }

  private state(): LiveWindowState {
    const settings = this.options.settings();
    const { live, liveWindow, appearance } = settings;
    const shown = tail(this.live.text);
    const source = this.live.phase === 'idle' || this.live.phase === 'error' ? live.source : this.live.source;
    const device = this.options.devices().find((candidate) => candidate.id === live.deviceId);
    const sourceLabel =
      source === 'device' ? device?.label || 'Audio device' : source === 'system+mic' ? 'System + microphone' : 'System audio';
    const support = this.options.support();
    const model = this.options.model();
    const display = needsDisplayCapture(live.source);
    const blocked =
      display && !support.available
        ? support.reason
        : !model.installed
          ? `${model.name} is not downloaded yet. Open Models to download it.`
          : '';
    return {
      live: { ...this.live, text: shown.text },
      truncated: shown.truncated,
      level: this.level,
      sourceLabel,
      nextSource: live.source,
      blocked,
      picker: display && support.mode === 'system-picker',
      model: model.name,
      shortcut: live.shortcut,
      platform: process.platform,
      alwaysOnTop: liveWindow.alwaysOnTop,
      collapsed: this.collapsed,
      canPin: overlaySupport().alwaysOnTop,
      textSize: liveWindow.textSize,
      accentTone: appearance.accentTone,
      animate: appearance.animations === 'full',
    };
  }
}
