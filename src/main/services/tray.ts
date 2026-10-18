import { Menu, Tray, app, type MenuItemConstructorOptions } from 'electron';
import { MODEL_CATALOG, type ModelStatus } from '@shared/domain/models';
import type { Settings } from '@shared/domain/settings';
import type { AudioDevice, DictationPhase } from '@shared/domain/system';
import { trayImage, trayRecordingImage } from '../app/assets';

const PHASE_LABEL: Record<DictationPhase, string> = {
  idle: 'Ready',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  inserting: 'Inserting…',
  error: 'Needs attention',
};

/** Menu items only display their accelerator; "" means the shortcut is turned off. */
function hint(accelerator: string): string | undefined {
  return accelerator || undefined;
}

interface TrayActions {
  show(): void;
  startDictation(): void;
  stopDictation(): void;
  cancelDictation(): void;
  readSelection(): void;
  pauseReading(): void;
  resumeReading(): void;
  stopReading(): void;
  toggleLive(): void;
  toggleLiveWindow(): void;
  openSettings(): void;
  selectMicrophone(id: string): void;
  toggleOverlay(): void;
  showCompanion(): void;
  hideCompanion(): void;
  toggleCompanionClickThrough(): void;
  quit(): void;
}

/** Elapsed time is only shown where a tray title exists, so no menu is rebuilt for it. */
const TITLE_TICK_MS = 1_000;

export class TrayService {
  private tray: Tray | null = null;
  private phase: DictationPhase = 'idle';
  private startedAt = 0;
  private models: ModelStatus[] = [];
  private devices: AudioDevice[] = [];
  private reading: 'idle' | 'playing' | 'paused' = 'idle';
  private live = false;
  private liveWindow = false;
  private titleTimer: NodeJS.Timeout | null = null;
  /** What was last drawn, so identical redraws skip rebuilding the native menu. */
  private drawn = '';

  constructor(
    private readonly actions: TrayActions,
    private settings: Settings,
  ) {}

  /** Creates or removes the tray to match the settings, then redraws it. */
  apply(settings: Settings): void {
    this.settings = settings;
    if (!settings.tray.enabled) {
      this.destroy();
      return;
    }
    if (!this.tray) {
      this.tray = new Tray(trayImage());
      this.tray.on('click', () => this.onClick());
      this.drawn = '';
    }
    this.render();
  }

  setPhase(phase: DictationPhase, startedAt = 0): void {
    this.phase = phase;
    this.startedAt = startedAt;
    this.render();
  }

  setModels(models: ModelStatus[]): void {
    this.models = models;
    this.render();
  }

  setDevices(devices: AudioDevice[]): void {
    this.devices = devices;
    this.render();
  }

  setReading(reading: 'idle' | 'playing' | 'paused'): void {
    if (this.reading === reading) return;
    this.reading = reading;
    this.render();
  }

  /** The floating live window is showing. */
  setLiveWindow(open: boolean): void {
    if (this.liveWindow === open) return;
    this.liveWindow = open;
    this.render();
  }

  /** A live transcript is recording system audio. */
  setLive(live: boolean): void {
    if (this.live === live) return;
    this.live = live;
    this.render();
  }

  visible(): boolean {
    return !!this.tray && !this.tray.isDestroyed();
  }

  destroy(): void {
    if (this.titleTimer) clearInterval(this.titleTimer);
    this.titleTimer = null;
    this.tray?.destroy();
    this.tray = null;
    this.drawn = '';
  }

  private onClick(): void {
    if (this.settings.tray.leftClick === 'dictate') {
      if (this.phase === 'listening') this.actions.stopDictation();
      else this.actions.startDictation();
      return;
    }
    this.actions.show();
  }

  private microphoneLabel(): string {
    const id = this.settings.audio.inputDeviceId;
    if (id === 'default') return 'System default';
    return this.devices.find((device) => device.id === id)?.label ?? 'Unavailable';
  }

  private modelLabel(): string {
    const id = this.settings.stt.modelId;
    const status = this.models.find((model) => model.id === id);
    const state = !status?.installed ? 'not installed' : status.loaded ? 'loaded' : 'ready';
    return `${MODEL_CATALOG[id].name} · ${state}`;
  }

  private microphoneMenu(): MenuItemConstructorOptions[] {
    if (!this.settings.tray.showMicrophones) return [];
    const selected = this.settings.audio.inputDeviceId;
    const items: MenuItemConstructorOptions[] = [
      {
        label: 'System default',
        type: 'radio',
        checked: selected === 'default',
        click: () => this.actions.selectMicrophone('default'),
      },
      ...this.devices
        .filter((device) => device.id !== 'default')
        .map<MenuItemConstructorOptions>((device) => ({
          label: device.label,
          type: 'radio',
          checked: selected === device.id,
          click: () => this.actions.selectMicrophone(device.id),
        })),
    ];
    return [
      {
        label: 'Change microphone',
        enabled: this.phase !== 'listening' && items.length > 1,
        submenu: items,
      },
    ];
  }

  private template(): MenuItemConstructorOptions[] {
    const { dictation, tts, overlay, companion, live, liveWindow } = this.settings;
    const idle = this.phase === 'idle';
    const listening = this.phase === 'listening';
    const busy = this.phase === 'transcribing' || this.phase === 'inserting';
    return [
      { label: this.headline(), enabled: false },
      { type: 'separator' },
      {
        label: 'Start dictation',
        accelerator: hint(dictation.shortcut),
        registerAccelerator: false,
        enabled: idle || this.phase === 'error',
        click: this.actions.startDictation,
      },
      {
        label: 'Stop dictation',
        accelerator: hint(dictation.shortcut),
        registerAccelerator: false,
        enabled: listening,
        click: this.actions.stopDictation,
      },
      {
        label: 'Cancel recording',
        accelerator: hint(dictation.cancelShortcut),
        registerAccelerator: false,
        visible: !idle,
        enabled: listening,
        click: this.actions.cancelDictation,
      },
      {
        label: this.live ? 'Stop live transcript' : 'Start live transcript',
        accelerator: hint(live.shortcut),
        registerAccelerator: false,
        click: this.actions.toggleLive,
      },
      {
        label: 'Show live window',
        type: 'checkbox',
        checked: this.liveWindow,
        accelerator: hint(liveWindow.shortcut),
        registerAccelerator: false,
        click: this.actions.toggleLiveWindow,
      },
      {
        label: 'Read selection aloud',
        accelerator: hint(tts.shortcut),
        registerAccelerator: false,
        enabled: !listening && !busy,
        click: this.actions.readSelection,
      },
      {
        label: this.reading === 'paused' ? 'Resume reading' : 'Pause reading',
        accelerator: hint(tts.pauseShortcut),
        registerAccelerator: false,
        visible: this.reading !== 'idle',
        click: this.reading === 'paused' ? this.actions.resumeReading : this.actions.pauseReading,
      },
      {
        label: 'Stop reading',
        accelerator: hint(tts.stopShortcut),
        registerAccelerator: false,
        visible: this.reading !== 'idle',
        click: this.actions.stopReading,
      },
      { type: 'separator' },
      ...this.microphoneMenu(),
      {
        label: 'Show overlay',
        type: 'checkbox',
        checked: overlay.enabled,
        accelerator: hint(overlay.toggleShortcut),
        registerAccelerator: false,
        click: this.actions.toggleOverlay,
      },
      {
        label: 'Show companion',
        type: 'checkbox',
        checked: companion.visible,
        click: () => (companion.visible ? this.actions.hideCompanion() : this.actions.showCompanion()),
      },
      {
        label: 'Companion click-through',
        type: 'checkbox',
        checked: companion.clickThrough,
        click: this.actions.toggleCompanionClickThrough,
      },
      { type: 'separator' },
      { label: 'Status', enabled: false },
      { label: `Microphone: ${this.microphoneLabel()}`, enabled: false },
      { label: `Model: ${this.modelLabel()}`, enabled: false },
      { type: 'separator' },
      { label: 'Open Inaudio', click: this.actions.show },
      { label: 'Settings', click: this.actions.openSettings },
      { type: 'separator' },
      { label: 'Quit', click: this.actions.quit },
    ];
  }

  /** Dictation names the state while it runs; otherwise a live session does. */
  private headline(): string {
    return this.live && this.phase === 'idle' ? 'Recording system audio…' : PHASE_LABEL[this.phase];
  }

  private render(): void {
    const tray = this.tray;
    if (!tray || tray.isDestroyed()) return;
    // A live session always shows the recording icon: system capture is never silent.
    const recording = (this.settings.tray.reflectState && this.phase === 'listening') || this.live;
    const template = this.template();
    // JSON drops the click handlers; device ids stand in for what the microphone items select.
    const drawn = JSON.stringify([recording, this.phase, this.devices, template]);
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      tray.setImage(recording ? trayRecordingImage() : trayImage());
      tray.setToolTip(`${app.getName()}: ${this.headline()}`);
      tray.setContextMenu(Menu.buildFromTemplate(template));
    }
    this.applyTitle();
  }

  /** macOS is the only platform with a tray title, so elapsed time is shown only there. */
  private applyTitle(): void {
    const tray = this.tray;
    if (!tray || tray.isDestroyed() || process.platform !== 'darwin') return;
    const show = this.settings.tray.reflectState && this.phase === 'listening' && this.startedAt > 0;
    if (!show) {
      if (this.titleTimer) clearInterval(this.titleTimer);
      this.titleTimer = null;
      tray.setTitle('');
      return;
    }
    const paint = () => {
      if (!this.tray || this.tray.isDestroyed()) return;
      const total = Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
      this.tray.setTitle(`${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`);
    };
    paint();
    if (!this.titleTimer) this.titleTimer = setInterval(paint, TITLE_TICK_MS);
  }
}
