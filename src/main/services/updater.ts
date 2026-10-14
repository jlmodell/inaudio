import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { Settings } from '@shared/domain/settings';
import type { UpdateStatus } from '@shared/domain/update';

type UpdateEvents = {
  change: [UpdateStatus];
};

/** Main-process owner for signed, HTTPS desktop updates. */
export class UpdaterService extends EventEmitter<UpdateEvents> {
  private status: UpdateStatus = {
    state: app.isPackaged ? 'idle' : 'unavailable',
    currentVersion: app.getVersion(),
    canInstall: false,
  };
  private settings: Settings['updates'];
  private checking = false;
  private beforeInstall: () => void = () => undefined;

  constructor(
    private readonly dataDirectory: string,
    settings: Settings['updates'],
  ) {
    super();
    this.settings = settings;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoDownload = settings.downloadAutomatically;
    autoUpdater.allowPrerelease = false;
    // The feed and the download cache both come from resources/app-update.yml, which
    // Forge copies in (forge.config.ts extraResource).
    autoUpdater.logger = {
      info: (...args: unknown[]) => console.info('[updater]', ...args),
      warn: (...args: unknown[]) => console.warn('[updater]', ...args),
      error: (...args: unknown[]) => console.error('[updater]', ...args),
      debug: (...args: unknown[]) => console.debug('[updater]', ...args),
    };
    this.installationId();
    this.bindEvents();
  }

  get(): UpdateStatus {
    return this.status;
  }

  applySettings(settings: Settings['updates']): void {
    this.settings = settings;
    autoUpdater.autoDownload = settings.downloadAutomatically;
  }

  setBeforeInstall(callback: () => void): void {
    this.beforeInstall = callback;
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.update({ state: 'unavailable', canInstall: false });
    if (this.checking) return this.status;
    if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
      return this.update({
        state: 'error',
        canInstall: false,
        error: 'This build has no update configuration. Install the latest version from GitHub Releases.',
      });
    }
    this.checking = true;
    this.update({ state: 'checking', error: undefined });
    try {
      await autoUpdater.checkForUpdates();
      return this.status;
    } catch (error) {
      return this.update({ state: 'error', canInstall: false, error: errorMessage(error) });
    } finally {
      this.checking = false;
    }
  }

  async download(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.update({ state: 'unavailable', canInstall: false });
    try {
      await autoUpdater.downloadUpdate();
      return this.status;
    } catch (error) {
      return this.update({ state: 'error', canInstall: false, error: errorMessage(error) });
    }
  }

  async install(prepare: () => Promise<void>): Promise<void> {
    if (this.status.state !== 'downloaded') throw new Error('No downloaded update is ready to install');
    this.beforeInstall();
    await prepare();
    autoUpdater.quitAndInstall(false, true);
  }

  start(): void {
    if (app.isPackaged && this.settings.checkAutomatically) {
      setTimeout(() => void this.check(), 10_000).unref();
    }
  }

  private bindEvents(): void {
    autoUpdater.on('checking-for-update', () => this.update({ state: 'checking', error: undefined }));
    autoUpdater.on('update-available', (info) => {
      if (!this.inRollout(info)) {
        this.update({ state: 'up-to-date', canInstall: false, checkedAt: Date.now() });
        return;
      }
      this.update({
        state: this.settings.downloadAutomatically ? 'downloading' : 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        progress: this.settings.downloadAutomatically ? 0 : undefined,
        canInstall: false,
        checkedAt: Date.now(),
      });
    });
    autoUpdater.on('update-not-available', (info) =>
      this.update({ state: 'up-to-date', availableVersion: info.version, canInstall: false, checkedAt: Date.now() }),
    );
    autoUpdater.on('download-progress', (progress) =>
      this.update({ state: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)), canInstall: false }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.update({
        state: 'downloaded',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        progress: 100,
        canInstall: true,
        checkedAt: Date.now(),
      }),
    );
    autoUpdater.on('error', (error) =>
      this.update({ state: 'error', canInstall: false, error: errorMessage(error), checkedAt: Date.now() }),
    );
  }

  private inRollout(info: { version: string; stagingPercentage?: number }): boolean {
    const percentage = info.stagingPercentage;
    if (percentage === undefined || percentage >= 100) return true;
    if (percentage <= 0) return false;
    const bucket = Number.parseInt(this.installationId().slice(0, 8), 16) % 100;
    return bucket < percentage;
  }

  private installationId(): string {
    const file = path.join(this.dataDirectory, 'update-installation-id');
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (/^[a-f0-9]{64}$/.test(value)) return value;
    } catch {
      // A first launch has no identifier yet.
    }
    const value = createHash('sha256').update(randomUUID()).digest('hex');
    fs.writeFileSync(file, `${value}\n`, { mode: 0o600 });
    return value;
  }

  private update(patch: Partial<UpdateStatus>): UpdateStatus {
    this.status = { ...this.status, ...patch, currentVersion: app.getVersion() };
    this.emit('change', this.status);
    return this.status;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
