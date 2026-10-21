import { app, Notification, powerMonitor, systemPreferences } from 'electron';
import type { SystemStatus, WorkerHealth } from '@shared/domain/system';
import type { AppPaths } from '../app/paths';
import type { ShortcutService } from './shortcuts';
import type { TrayService } from './tray';

export function collectSystemStatus(deps: {
  paths: AppPaths;
  worker: WorkerHealth;
  shortcuts: ShortcutService;
  tray: TrayService;
}): Omit<SystemStatus, 'window' | 'update' | 'models'> {
  return {
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    accessibilityTrusted:
      process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : null,
    shortcuts: deps.shortcuts.current(),
    trayVisible: deps.tray.visible(),
    notificationsSupported: Notification.isSupported(),
    dataDir: deps.paths.data,
    modelsDir: deps.paths.models,
    worker: deps.worker,
    onBattery: powerMonitor.isOnBatteryPower(),
  };
}
