import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import {
  BUILT_IN_COMPANIONS,
  companionSettingsSchema,
  type CompanionEvent,
  type CompanionPackage,
  type CompanionSnapshot,
  type CompanionState,
} from '@shared/domain/companion';
import type { Settings, SettingsPatch } from '@shared/domain/settings';
import { EVENTS } from '@shared/ipc/channels';
import type { AppPaths } from '../app/paths';
import { readCompanionManifest } from './companion-package';
import { createCompanionWindow, placeCompanion } from '../windows/companion-window';
import type { SettingsStore } from './settings-store';

export type { CompanionSnapshot };

/** Events that may repeat back to back and should replay each time. */
const REPEATABLE_EVENTS: readonly CompanionEvent[] = ['companion.clicked', 'transcription.completed'];

export class CompanionService extends EventEmitter<{
  changed: [CompanionSnapshot];
  event: [CompanionEvent];
}> {
  private window: BrowserWindow | null = null;
  private state: CompanionState = 'idle';
  private lastEvent: CompanionEvent | undefined;
  private revision = 0;
  private dictating = false;
  private packages: CompanionPackage[] = [...BUILT_IN_COMPANIONS];
  private sleepingTimer: NodeJS.Timeout | null = null;
  private focusTimer: NodeJS.Timeout | null = null;
  private hoverTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly paths: AppPaths,
    private readonly settings: SettingsStore,
  ) {
    super();
    this.discover();
    this.settings.on('change', (next, previous) => this.onSettings(next, previous));
  }

  list(): CompanionPackage[] {
    return this.packages;
  }

  snapshot(): CompanionSnapshot {
    const settings = this.settings.get().companion;
    const companion = this.packages.find((item) => item.id === settings.activeId) ?? this.packages[0];
    if (!companion) throw new Error('No companion is installed');
    return {
      companion,
      settings,
      state: this.state,
      event: this.lastEvent,
      revision: this.revision,
      dictating: this.dictating,
    };
  }

  /** Mirrors whether dictation is in flight, so the companion holds spoken lines until it ends. */
  setDictating(active: boolean): void {
    if (this.dictating === active) return;
    this.dictating = active;
    this.emitChanged();
  }

  select(id: string): CompanionSnapshot {
    if (!this.packages.some((item) => item.id === id)) throw new Error('Unknown companion');
    this.settings.update({ companion: { activeId: id } });
    return this.snapshot();
  }

  update(patch: NonNullable<SettingsPatch['companion']>): CompanionSnapshot {
    const current = this.settings.get().companion;
    const next = companionSettingsSchema.parse({
      ...current,
      ...patch,
      reactions: { ...current.reactions, ...patch.reactions },
    });
    if (!this.packages.some((item) => item.id === next.activeId)) throw new Error('Unknown companion');
    this.settings.update({ companion: patch });
    return this.snapshot();
  }

  setWindow(win: BrowserWindow): void {
    this.window = win;
    win.on('closed', () => {
      if (this.window === win) this.window = null;
    });
    this.applyWindow();
    this.syncFocusTracking();
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
    this.update({ clickThrough: next });
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
    if (
      companion.personality === 'quiet' &&
      ['companion.clicked', 'transcription.completed', 'model.loaded', 'tts.completed'].includes(event)
    ) {
      return;
    }
    const reaction = companion.reactions[event];
    if (!reaction?.enabled) return;
    let nextState = reaction.state === 'ready' ? state : reaction.state;
    if (reaction.state === 'ready') {
      if (companion.personality === 'playful' && ['transcription.completed', 'companion.clicked'].includes(event)) {
        nextState = 'attention';
      } else if (companion.personality === 'curious' && event === 'transcription.completed') {
        nextState = 'thinking';
      } else if (companion.personality === 'energetic' && event === 'transcription.completed') {
        nextState = 'attention';
      }
    }
    // A repeated report of the same thing changes nothing on screen, so nothing is sent.
    if (nextState === this.state && event === this.lastEvent && !REPEATABLE_EVENTS.includes(event)) return;
    this.state = nextState;
    this.lastEvent = event;
    this.revision += 1;
    this.resetSleepTimer();
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
    this.syncFocusTracking(settings);
  }

  private syncFocusTracking(settings = this.settings.get()): void {
    if (this.focusTimer) clearInterval(this.focusTimer);
    this.focusTimer = null;
    if (settings.companion.position !== 'focus-area') return;
    this.focusTimer = setInterval(() => {
      if (this.window && !this.window.isDestroyed()) {
        const companion = this.settings.get().companion;
        placeCompanion(this.window, 'focus-area', companion.scale, companion);
      }
    }, 250);
    this.focusTimer.unref();
  }

  private emitChanged(): void {
    const snapshot = this.snapshot();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('event:companion-state', snapshot);
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

  private discover(): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.paths.companions, { withFileTypes: true });
    } catch (error) {
      console.error('Could not discover companions', error);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const directory = path.join(this.paths.companions, entry.name);
        const { manifest } = readCompanionManifest(directory);
        if (!this.packages.some((item) => item.id === manifest.id)) this.packages.push(manifest);
      } catch (error) {
        console.warn(`Skipping invalid companion ${entry.name}`, error);
      }
    }
  }
}
