import { Menu, Tray, app, type MenuItemConstructorOptions } from 'electron';
import { MODEL_CATALOG, type ModelStatus } from '@shared/domain/models';
import type { Settings } from '@shared/domain/settings';
import { trayImage, trayRecordingImage } from '../app/assets';

/** Menu items only display their accelerator; "" means the shortcut is turned off. */
function hint(accelerator: string): string | undefined {
  return accelerator || undefined;
}

interface TrayActions {
  show(): void;
  readSelection(): void;
  pauseReading(): void;
  resumeReading(): void;
  stopReading(): void;
  openSettings(): void;
  showCompanion(): void;
  hideCompanion(): void;
  toggleCompanionClickThrough(): void;
  quit(): void;
}

export class TrayService {
  private tray: Tray | null = null;
  private models: ModelStatus[] = [];
  private reading: 'idle' | 'playing' | 'paused' = 'idle';
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
      this.tray.on('click', () => this.actions.show());
      this.drawn = '';
    }
    this.render();
  }

  setModels(models: ModelStatus[]): void {
    this.models = models;
    this.render();
  }

  setReading(reading: 'idle' | 'playing' | 'paused'): void {
    if (this.reading === reading) return;
    this.reading = reading;
    this.render();
  }

  visible(): boolean {
    return !!this.tray && !this.tray.isDestroyed();
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
    this.drawn = '';
  }

  private modelLabel(): string {
    const id = this.settings.tts.modelId;
    const status = this.models.find((model) => model.id === id);
    const state = !status?.installed ? 'not installed' : status.loaded ? 'loaded' : 'ready';
    return `${MODEL_CATALOG[id].name} · ${state}`;
  }

  private headline(): string {
    if (this.reading === 'playing') return 'Reading aloud…';
    if (this.reading === 'paused') return 'Reading paused';
    return 'Ready';
  }

  private template(): MenuItemConstructorOptions[] {
    const { tts, companion } = this.settings;
    return [
      { label: this.headline(), enabled: false },
      { type: 'separator' },
      {
        label: 'Read selection aloud',
        accelerator: hint(tts.shortcut),
        registerAccelerator: false,
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
      { label: `Voice: ${this.modelLabel()}`, enabled: false },
      { type: 'separator' },
      { label: 'Open Inaudio', click: this.actions.show },
      { label: 'Settings', click: this.actions.openSettings },
      { type: 'separator' },
      { label: 'Quit', click: this.actions.quit },
    ];
  }

  private render(): void {
    const tray = this.tray;
    if (!tray || tray.isDestroyed()) return;
    const reading = this.settings.tray.reflectState && this.reading === 'playing';
    const template = this.template();
    const drawn = JSON.stringify([reading, this.reading, template]);
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    tray.setImage(reading ? trayRecordingImage() : trayImage());
    tray.setToolTip(`${app.getName()}: ${this.headline()}`);
    tray.setContextMenu(Menu.buildFromTemplate(template));
  }
}
