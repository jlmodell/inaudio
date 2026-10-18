import { app, Notification, powerMonitor, systemPreferences } from 'electron';
import type { PermissionState, SystemStatus, WorkerHealth } from '@shared/domain/system';
import type { AppPaths } from '../app/paths';
import { overlaySupport, systemAudioSupport } from '../app/platform';
import type { OverlayController } from './overlay-controller';
import type { ShortcutService } from './shortcuts';
import type { TextInserter } from './text-insertion';
import type { TrayService } from './tray';

function microphonePermission(): PermissionState {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'unknown';
  try {
    return systemPreferences.getMediaAccessStatus('microphone') as PermissionState;
  } catch {
    return 'unknown';
  }
}

export function collectSystemStatus(deps: {
  paths: AppPaths;
  worker: WorkerHealth;
  shortcuts: ShortcutService;
  inserter: TextInserter;
  overlay: OverlayController;
  tray: TrayService;
}): Omit<SystemStatus, 'window' | 'update' | 'models'> {
  return {
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    microphonePermission: microphonePermission(),
    systemAudio: systemAudioSupport(),
    accessibilityTrusted:
      process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : null,
    insertion: deps.inserter.support(),
    shortcuts: deps.shortcuts.current(),
    overlay: overlaySupport(),
    trayVisible: deps.tray.visible(),
    notificationsSupported: Notification.isSupported(),
    dataDir: deps.paths.data,
    modelsDir: deps.paths.models,
    worker: deps.worker,
    onBattery: powerMonitor.isOnBatteryPower(),
  };
}
