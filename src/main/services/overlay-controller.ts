import { screen, type BrowserWindow, type Display } from 'electron';
import { MODEL_CATALOG, type ModelId } from '@shared/domain/models';
import type { Settings } from '@shared/domain/settings';
import type { AudioDevice, DictationState, OverlayLive, OverlayReading, OverlayState } from '@shared/domain/system';
import { EVENTS } from '@shared/ipc/channels';
import { isWayland, overlaySupport } from '../app/platform';
import { registerSurface } from '../security/surfaces';
import { createOverlayWindow } from '../windows/overlay-window';
import { OVERLAY_MARGIN, overlayAlign, overlaySize, type OverlayContent } from '../windows/overlay-size';

interface OverlayOptions {
  settings(): Settings;
  /** The window dictation runs in: picks a display and stands in for the cursor. */
  window(): BrowserWindow | null;
  /** The devices the capturing window last enumerated, which is also the allowed set. */
  devices(): AudioDevice[];
  /** Installed recognition models, in catalog order. */
  models(): { id: ModelId; label: string }[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Owns the floating overlay window: when it exists, where it sits, whether it takes mouse
 * events, and what it shows. The renderer inside it never chooses its own geometry.
 */
export class OverlayController {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private hover = false;
  private menu = false;
  private disposed = false;
  private dictation: DictationState = { phase: 'idle', startedAt: 0, level: 0, message: '' };
  private reading: OverlayReading | null = null;
  private live: OverlayLive | null = null;
  private readonly onDisplayChange = () => this.place();

  constructor(private readonly options: OverlayOptions) {
    screen.on('display-added', this.onDisplayChange);
    screen.on('display-removed', this.onDisplayChange);
    screen.on('display-metrics-changed', this.onDisplayChange);
  }

  /** Reconciles the window with the current settings. Safe to call as often as needed. */
  sync(): void {
    if (this.disposed) return;
    const { overlay } = this.options.settings();
    if (!overlay.enabled) {
      this.teardown();
      return;
    }
    const win = this.ensure();
    this.place();
    if (overlaySupport().opacity) win.setOpacity(overlay.opacity);
    this.applyMouse();
    this.applyVisibility();
    this.push();
  }

  /** Replaces the dictation state reported by the capturing window. */
  setDictation(state: DictationState): void {
    this.dictation = state;
    if (this.disposed) return;
    if (state.phase === 'idle') {
      this.hover = false;
      this.menu = false;
    }
    this.sync();
  }

  /** Only the meter moved: no geometry, visibility or mouse handling can have changed. */
  setLevel(level: number): void {
    if (this.dictation.level === level) return;
    this.dictation = { ...this.dictation, level };
    if (!this.disposed) this.push();
  }

  /** A read-aloud session to show while dictation is idle, or null once it is over. */
  setReading(reading: OverlayReading | null): void {
    if (JSON.stringify(reading) === JSON.stringify(this.reading)) return;
    this.reading = reading;
    if (this.disposed) return;
    if (!reading && this.dictation.phase === 'idle') {
      this.hover = false;
      this.menu = false;
    }
    this.sync();
  }

  /** A live transcript being recorded, or null once it stops. */
  setLive(live: OverlayLive | null): void {
    const same =
      !!live === !!this.live &&
      live?.startedAt === this.live?.startedAt &&
      live?.source === this.live?.source &&
      live?.windowOpen === this.live?.windowOpen;
    this.live = live;
    if (same || this.disposed) return;
    if (!live && this.dictation.phase === 'idle' && !this.reading) {
      this.hover = false;
      this.menu = false;
    }
    this.sync();
  }

  /** Only the live meter moved. */
  setLiveLevel(level: number): void {
    if (!this.live || this.live.level === level) return;
    this.live = { ...this.live, level };
    if (!this.disposed && this.dictation.phase === 'idle') this.push();
  }

  phase(): DictationState['phase'] {
    return this.dictation.phase;
  }

  /** The pointer entered or left the pill. Only meaningful where mouse moves forward. */
  setHover(hovering: boolean): void {
    if (this.hover === hovering) return;
    this.hover = hovering;
    // Arming swaps the readout for controls, which need more width than they replace.
    this.place();
    this.applyMouse();
    this.push();
  }

  /** A dropdown or popover opened or closed, so the window needs room for it. */
  setMenu(open: boolean): void {
    if (this.menu === open) return;
    this.menu = open;
    this.place();
    this.applyMouse();
    this.push();
  }

  visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  destroy(): void {
    this.disposed = true;
    screen.removeListener('display-added', this.onDisplayChange);
    screen.removeListener('display-removed', this.onDisplayChange);
    screen.removeListener('display-metrics-changed', this.onDisplayChange);
    this.teardown();
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const { overlay } = this.options.settings();
    const win = createOverlayWindow(overlay);
    this.win = win;
    this.loaded = false;
    registerSurface(win.webContents, 'overlay');
    win.webContents.once('did-finish-load', () => {
      this.loaded = true;
      this.push();
    });
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null;
        this.loaded = false;
      }
    });
    return win;
  }

  private teardown(): void {
    const win = this.win;
    this.win = null;
    this.loaded = false;
    this.hover = false;
    this.menu = false;
    if (win && !win.isDestroyed()) win.destroy();
  }

  private applyVisibility(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const { overlay } = this.options.settings();
    const wanted =
      overlay.visibility === 'always' || this.dictation.phase !== 'idle' || this.reading !== null || this.live !== null;
    if (wanted === win.isVisible()) {
      if (wanted) win.moveTop();
      return;
    }
    if (!wanted) {
      win.hide();
      return;
    }
    // showInactive keeps focus with the application receiving the dictated text.
    if (isWayland()) win.show();
    else win.showInactive();
    win.moveTop();
  }

  private applyMouse(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const support = overlaySupport();
    if (this.interactive()) win.setIgnoreMouseEvents(false);
    else win.setIgnoreMouseEvents(true, { forward: support.hover });
  }

  private interactive(): boolean {
    const { overlay } = this.options.settings();
    if (this.menu) return true;
    if (!overlay.clickThrough) return true;
    return this.hover && overlaySupport().hover;
  }

  /**
   * Whether the pill is showing its controls. Click-through being off makes the pill
   * permanently interactive, but it does not make it permanently open: that takes the
   * pointer, or a menu the pointer opened.
   */
  private armed(): boolean {
    return this.menu || this.hover;
  }

  private place(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const { overlay } = this.options.settings();
    const { width, height } = overlaySize(overlay, this.content());
    const area = this.display().workArea;
    const anchorTop = overlay.position.startsWith('top');

    let x: number;
    if (overlay.position.endsWith('left')) x = area.x + OVERLAY_MARGIN;
    else if (overlay.position.endsWith('right')) x = area.x + area.width - width - OVERLAY_MARGIN;
    else x = area.x + Math.round((area.width - width) / 2);

    // Growing for a menu must not move the pill: a bottom anchor grows upward because
    // its lower edge stays pinned, a top anchor grows downward.
    const y = anchorTop
      ? area.y + OVERLAY_MARGIN
      : area.y + area.height - height - OVERLAY_MARGIN;

    win.setBounds({
      x: clamp(Math.round(x), area.x, area.x + Math.max(0, area.width - width)),
      y: clamp(Math.round(y), area.y, area.y + Math.max(0, area.height - height)),
      width,
      height,
    });
  }

  /** What the pill draws right now. The window is sized from this, not from the settings alone. */
  private content(): OverlayContent {
    const settings = this.options.settings();
    return {
      phase: this.dictation.phase,
      armed: this.armed(),
      message: this.dictation.phase === 'error' && this.dictation.message !== '',
      menuOpen: this.menu,
      devices: this.options.devices().length,
      language: MODEL_CATALOG[settings.stt.modelId].languages.length > 1,
      live: this.dictation.phase === 'idle' && this.live !== null,
      reading:
        this.dictation.phase === 'idle' && !this.live && this.reading
          ? { message: this.reading.status === 'error' && this.reading.message !== '' }
          : null,
    };
  }

  private display(): Display {
    const mode = this.options.settings().overlay.display;
    if (mode === 'primary') return screen.getPrimaryDisplay();
    if (mode === 'cursor' && overlaySupport().cursor) {
      try {
        return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      } catch {
        // Falls through to the window, then the primary display.
      }
    }
    const main = this.options.window();
    if (main && !main.isDestroyed()) return screen.getDisplayMatching(main.getBounds());
    return screen.getPrimaryDisplay();
  }

  private push(): void {
    const win = this.win;
    if (!this.loaded || !win || win.isDestroyed()) return;
    win.webContents.send(EVENTS.overlayState, this.state());
  }

  private state(): OverlayState {
    const settings = this.options.settings();
    const descriptor = MODEL_CATALOG[settings.stt.modelId];
    const { overlay, appearance } = settings;
    return {
      ...this.dictation,
      model: descriptor.name,
      language: descriptor.languages.length > 1 ? 'Auto' : '',
      interactive: this.interactive(),
      armed: this.armed(),
      // `place()` pins this edge and grows the window on the free side, so the renderer
      // aligns the pill here and opens its panels into the room it was given.
      anchor: overlay.position.startsWith('top') ? 'top' : 'bottom',
      align: overlayAlign(overlay.position),
      accentTone: appearance.accentTone,
      // The window was sized from these same four flags, so the renderer draws a section
      // exactly when the box has room for it. It never decides its own extent.
      showTimer: overlay.showTimer,
      showLevel: overlay.showLevel,
      showModel: overlay.showModel,
      showLanguage: overlay.showLanguage,
      devices: this.options.devices(),
      models: this.options.models(),
      // The pickers mark the active entry, and these are the only ids they may send back.
      deviceId: settings.audio.inputDeviceId,
      modelId: settings.stt.modelId,
      animate: appearance.animations === 'full',
      reading: this.reading,
      live: this.live,
    };
  }
}
