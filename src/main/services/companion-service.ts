import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import {
  COMPANIONS,
  type CompanionEvent,
  type CompanionId,
  type CompanionSnapshot,
  type CompanionState,
} from '@shared/domain/companion';
import type { Settings } from '@shared/domain/settings';
import { EVENTS } from '@shared/ipc/channels';
import { createCompanionWindow, placeCompanion } from '../windows/companion-window';
import { CompanionGazeTracker } from './companion-gaze';
import { FocusProbe } from './focus-probe';
import type { SettingsStore } from './settings-store';

export type { CompanionSnapshot };

/** Events that may repeat back to back and should replay each time. */
const REPEATABLE_EVENTS: readonly CompanionEvent[] = ['companion.clicked', 'transcription.completed'];
/** Events a quiet companion lets pass without reacting. */
const QUIET_IGNORED: readonly CompanionEvent[] = ['companion.clicked', 'transcription.completed', 'model.loaded', 'tts.completed'];

export class CompanionService extends EventEmitter<{
  changed: [CompanionSnapshot];
  event: [CompanionEvent];
}> {
  private window: BrowserWindow | null = null;
  private state: CompanionState = 'idle';
  private lastEvent: CompanionEvent | undefined;
  private revision = 0;
  private dictating = false;
  private reading = false;
  private sleepingTimer: NodeJS.Timeout | null = null;
  private focusTimer: NodeJS.Timeout | null = null;
  private hoverTimer: NodeJS.Timeout | null = null;
  private readonly gaze = new CompanionGazeTracker(new FocusProbe(), () => this.window);

  constructor(private readonly settings: SettingsStore) {
    super();
    this.settings.on('change', (next, previous) => this.onSettings(next, previous));
  }

  snapshot(): CompanionSnapshot {
    const settings = this.settings.get().companion;
    const companion = COMPANIONS.find((item) => item.id === settings.activeId) ?? COMPANIONS[0];
    if (!companion) throw new Error('No companion is installed');
    return {
      companion,
      settings,
      state: this.state,
      event: this.lastEvent,
      revision: this.revision,
      dictating: this.dictating || this.reading,
    };
  }

  /** Read Aloud is speaking, so the companion holds its own lines the same way it does for dictation. */
  setReading(active: boolean): void {
    if (this.reading === active) return;
    this.reading = active;
    this.emitChanged();
  }

  /** Mirrors whether dictation is in flight, so the companion holds spoken lines until it ends. */
  setDictating(active: boolean): void {
    if (this.dictating === active) return;
    this.dictating = active;
    this.syncGaze();
    this.emitChanged();
  }

  select(id: CompanionId): CompanionSnapshot {
    this.settings.update({ companion: { activeId: id } });
    return this.snapshot();
  }

  setWindow(win: BrowserWindow): void {
    this.window = win;
    win.on('closed', () => {
      if (this.window === win) this.window = null;
      this.syncGaze();
    });
    // A reloaded window has forgotten where it was looking.
    win.webContents.on('did-finish-load', () => this.gaze.reset());
    this.applyWindow();
    this.emitChanged();
  }

  show(): void {
    const win = this.ensureWindow();
    this.settings.update({ companion: { visible: true } });
    win.showInactive();
  }

  hide(): void {
    this.settings.update({ companion: { visible: false } });
    this.window?.hide();
  }

  toggleClickThrough(): void {
    const next = !this.settings.get().companion.clickThrough;
    this.settings.update({ companion: { clickThrough: next } });
    this.window?.setIgnoreMouseEvents(next, { forward: true });
  }

  hover(hovering: boolean): void {
    const win = this.window;
    if (!win || win.isDestroyed() || !this.settings.get().companion.clickThrough) return;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (hovering) {
      win.setIgnoreMouseEvents(false);
      this.hoverTimer = setTimeout(() => this.restoreClickThrough(), 1500);
      this.hoverTimer.unref();
    } else {
      this.restoreClickThrough();
    }
  }

  click(): CompanionSnapshot {
    this.react('companion.clicked', 'attention');
    this.restoreClickThrough();
    return this.snapshot();
  }

  /** Moves the companion to `state` for `event`, if the user lets it react to that event. */
  react(event: CompanionEvent, state: CompanionState): void {
    const companion = this.settings.get().companion;
    if (companion.personality === 'quiet' && QUIET_IGNORED.includes(event)) return;
    if (!companion.reactions[event]) return;
    // A repeated report of the same thing changes nothing on screen, so nothing is sent.
    if (state === this.state && event === this.lastEvent && !REPEATABLE_EVENTS.includes(event)) return;
    const wasAsleep = this.state === 'sleeping';
    this.state = state;
    this.lastEvent = event;
    this.revision += 1;
    this.resetSleepTimer();
    if (wasAsleep) this.syncGaze();
    if (event === 'transcription.completed') this.gaze.attend();
    this.emit('event', event);
    this.emitChanged();
  }

  dispose(): void {
    if (this.sleepingTimer) clearTimeout(this.sleepingTimer);
    if (this.focusTimer) clearInterval(this.focusTimer);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.sleepingTimer = null;
    this.focusTimer = null;
    this.hoverTimer = null;
    this.gaze.dispose();
    this.window?.close();
    this.window = null;
  }

  private ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      this.setWindow(createCompanionWindow());
    }
    if (!this.window) throw new Error('Could not create companion window');
    return this.window;
  }

  private onSettings(next: Settings, previous: Settings): void {
    if (next.companion.idleSleepMinutes !== previous.companion.idleSleepMinutes) {
      this.resetSleepTimer();
    }
    this.applyWindow(next);
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(EVENTS.settingsChanged, next);
    }
    this.emitChanged();
  }

  private applyWindow(settings = this.settings.get()): void {
    const win = this.window;
    if (win && !win.isDestroyed()) {
      const companion = settings.companion;
      placeCompanion(win, companion.position, companion.scale, companion, this.gaze.focusTarget());
      win.setIgnoreMouseEvents(companion.clickThrough, { forward: true });
      if (companion.visible) win.showInactive();
      else win.hide();
    }
    this.syncFocusTracking(settings);
    this.syncGaze(settings);
  }

  /** Starts or stops the eye and field tracking to match what is on screen right now. */
  private syncGaze(settings = this.settings.get()): void {
    const companion = settings.companion;
    const shown = !!this.window && !this.window.isDestroyed() && companion.visible;
    const eyes = shown && companion.eyesFollow && companion.motion === 'full';
    this.gaze.configure({
      eyes,
      focus: shown && (eyes || companion.position === 'focus-area'),
      asleep: this.state === 'sleeping',
      dictating: this.dictating,
    });
  }

  private syncFocusTracking(settings = this.settings.get()): void {
    if (this.focusTimer) clearInterval(this.focusTimer);
    this.focusTimer = null;
    if (settings.companion.position !== 'focus-area' || !settings.companion.visible) return;
    this.focusTimer = setInterval(() => {
      if (this.window && !this.window.isDestroyed()) {
        const companion = this.settings.get().companion;
        placeCompanion(this.window, 'focus-area', companion.scale, companion, this.gaze.focusTarget());
      }
    }, 250);
    this.focusTimer.unref();
  }

  private emitChanged(): void {
    const snapshot = this.snapshot();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(EVENTS.companionState, snapshot);
    }
    this.emit('changed', snapshot);
  }

  private resetSleepTimer(): void {
    if (this.sleepingTimer) clearTimeout(this.sleepingTimer);
    this.sleepingTimer = setTimeout(() => {
      this.state = 'sleeping';
      this.syncGaze();
      this.emitChanged();
    }, this.settings.get().companion.idleSleepMinutes * 60_000);
    this.sleepingTimer.unref();
  }

  private restoreClickThrough(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    const win = this.window;
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(this.settings.get().companion.clickThrough, { forward: true });
    }
  }
}
