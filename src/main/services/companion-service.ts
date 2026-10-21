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
import type { SettingsStore } from './settings-store';

export type { CompanionSnapshot };

const REPEATABLE_EVENTS: readonly CompanionEvent[] = ['companion.clicked'];
const QUIET_IGNORED: readonly CompanionEvent[] = ['companion.clicked', 'model.loaded', 'tts.completed'];

export class CompanionService extends EventEmitter<{
  changed: [CompanionSnapshot];
  event: [CompanionEvent];
}> {
  private window: BrowserWindow | null = null;
  private state: CompanionState = 'idle';
  private lastEvent: CompanionEvent | undefined;
  private revision = 0;
  private reading = false;
  private sleepingTimer: NodeJS.Timeout | null = null;
  private hoverTimer: NodeJS.Timeout | null = null;

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
    };
  }

  setReading(active: boolean): void {
    if (this.reading === active) return;
    this.reading = active;
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
    });
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

  react(event: CompanionEvent, state: CompanionState): void {
    const companion = this.settings.get().companion;
    if (companion.personality === 'quiet' && QUIET_IGNORED.includes(event)) return;
    if (!companion.reactions[event]) return;
    if (state === this.state && event === this.lastEvent && !REPEATABLE_EVENTS.includes(event)) return;
    this.state = state;
    this.lastEvent = event;
    this.revision += 1;
    this.resetSleepTimer();
    this.emit('event', event);
    this.emitChanged();
  }

  dispose(): void {
    if (this.sleepingTimer) clearTimeout(this.sleepingTimer);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.sleepingTimer = null;
    this.hoverTimer = null;
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
    if (!win || win.isDestroyed()) return;
    const companion = settings.companion;
    placeCompanion(win, companion.position, companion.scale, companion);
    win.setIgnoreMouseEvents(companion.clickThrough, { forward: true });
    if (companion.visible) win.showInactive();
    else win.hide();
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
