import { app, BrowserWindow, Menu, nativeTheme, powerMonitor } from 'electron';
import path from 'node:path';
import type { AppCommand } from '@shared/domain/system';
import { DEFAULT_SETTINGS } from '@shared/domain/settings';
import { EVENTS } from '@shared/ipc/channels';
import { appPaths } from './app/paths';
import { registerIpc } from './ipc/register';
import { handleAppScheme, registerAppScheme } from './security/app-protocol';
import { applySessionPolicy } from './security/hardening';
import { registerSurface } from './security/surfaces';
import { createServices, type Services } from './services/container';
import { ShortcutService } from './services/shortcuts';
import { TrayService } from './services/tray';
import { createMainWindow } from './windows/main-window';
import { createCompanionWindow } from './windows/companion-window';

app.setName('Inaudio');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerAppScheme();
  app.enableSandbox();
  bootstrap();
}

function bootstrap(): void {
  let mainWindow: BrowserWindow | null = null;
  let companionWindow: BrowserWindow | null = null;
  let services: Services | null = null;
  let ipcReady = false;
  let quitting = false;
  let installingUpdate = false;
  let shutdownStarted = false;

  const requestQuit = async (): Promise<void> => {
    if (quitting) return;
    quitting = true;
    app.quit();
  };

  const send = (channel: string, payload?: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  const sendCommand = (value: AppCommand): boolean => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return false;
    }
    mainWindow.webContents.send(EVENTS.command, value);
    return true;
  };
  const command = (value: AppCommand) => {
    sendCommand(value);
  };

  const showWindow = () => {
    if (!services || !ipcReady) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = openWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  function openWindow(show = true): BrowserWindow {
    const win = createMainWindow({ show });
    registerSurface(win.webContents, 'main');
    win.webContents.on('did-finish-load', () => {
      services?.readAloud.rendererReset();
    });
    win.on('close', (event) => {
      if (!quitting && services?.settings.get().system.closeToTray) {
        event.preventDefault();
        win.hide();
      }
    });
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null;
    });
    const emitWindowStatus = () => send(EVENTS.statusChanged);
    win.on('maximize', emitWindowStatus);
    win.on('unmaximize', emitWindowStatus);
    win.on('minimize', emitWindowStatus);
    win.on('restore', emitWindowStatus);
    win.on('focus', emitWindowStatus);
    win.on('blur', emitWindowStatus);
    win.on('enter-full-screen', emitWindowStatus);
    win.on('leave-full-screen', emitWindowStatus);
    return win;
  }

  function openCompanion(): void {
    if (!services || !ipcReady) return;
    if (!companionWindow || companionWindow.isDestroyed()) {
      const win = createCompanionWindow();
      companionWindow = win;
      registerSurface(win.webContents, 'companion');
      services.companion.setWindow(win);
      win.on('closed', () => {
        if (companionWindow === win) companionWindow = null;
      });
    }
  }

  const tray = new TrayService(
    {
      show: showWindow,
      readSelection: () => services?.readAloud.toggleSelection(),
      pauseReading: () => services?.readAloud.pause(),
      resumeReading: () => services?.readAloud.resume(),
      stopReading: () => services?.readAloud.stop(),
      openSettings: () => {
        showWindow();
        command('navigate:settings');
      },
      showCompanion: () => services?.companion.show(),
      hideCompanion: () => services?.companion.hide(),
      toggleCompanionClickThrough: () => services?.companion.toggleClickThrough(),
      quit: () => {
        void requestQuit().catch((error: unknown) => console.error('Could not quit Inaudio', error));
      },
    },
    DEFAULT_SETTINGS,
  );

  const shortcuts = new ShortcutService({
    readAloud: () => services?.readAloud.toggleSelection(),
    readAloudPause: () => services?.readAloud.togglePause(),
    readAloudStop: () => services?.readAloud.stop(),
  });

  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
  });

  app.whenReady().then(async () => {
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      handleAppScheme(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`));
    }
    applySessionPolicy();
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

    const paths = appPaths();
    services = createServices({
      paths,
      tray,
      shortcuts,
      window: () => mainWindow,
      command: sendCommand,
      showWindow,
      statusChanged: () => send(EVENTS.statusChanged),
      send,
      ensureWindow: () => {
        if (!mainWindow || mainWindow.isDestroyed()) mainWindow = openWindow(false);
      },
    });
    const s = services;
    s.updater.setBeforeInstall(() => {
      installingUpdate = true;
      quitting = true;
    });
    registerIpc(s, requestQuit);
    ipcReady = true;
    s.updater.on('change', (status) => send(EVENTS.updateState, status));
    openCompanion();
    const activeTtsId = s.settings.get().tts.modelId;
    void s.models.check(activeTtsId)
      .catch(() => undefined)
      .then(() => s.models.discover())
      .then(() => {
        const active = s.modelStatuses().filter((model) => model.active);
        if (active.some((model) => !model.installed || model.health === 'unavailable' || model.health === 'error')) {
          s.companion.react('model.missing', 'model-unavailable');
        }
      })
      .catch((error: unknown) => console.error('Model discovery failed', error));

    const applyTheme = () => {
      nativeTheme.themeSource = s.settings.get().appearance.theme;
    };
    applyTheme();
    nativeTheme.on('updated', applyTheme);

    const applySystem = () => {
      const { launchAtLogin, launchMinimized } = s.settings.get().system;
      if (process.platform !== 'linux') {
        app.setLoginItemSettings({
          openAtLogin: launchAtLogin,
          ...(process.platform === 'win32' ? { args: launchMinimized ? ['--start-hidden'] : [] } : {}),
        });
      }
    };
    applySystem();
    shortcuts.apply(s.settings.get());
    tray.apply(s.settings.get());

    s.settings.on('change', (next, previous) => {
      if (next.appearance.theme !== previous.appearance.theme) applyTheme();
      if (
        next.tts.shortcut !== previous.tts.shortcut ||
        next.tts.pauseShortcut !== previous.tts.pauseShortcut ||
        next.tts.stopShortcut !== previous.tts.stopShortcut
      ) {
        shortcuts.apply(next);
      }
      if (
        next.system.launchAtLogin !== previous.system.launchAtLogin ||
        next.system.launchMinimized !== previous.system.launchMinimized
      ) applySystem();
      if (JSON.stringify(next.updates) !== JSON.stringify(previous.updates)) s.updater.applySettings(next.updates);
      if (
        JSON.stringify(next.tray) !== JSON.stringify(previous.tray) ||
        JSON.stringify(next.companion) !== JSON.stringify(previous.companion)
      ) tray.apply(next);
      send(EVENTS.settingsChanged, next);
    });
    s.models.on('progress', (event) => {
      send(EVENTS.modelProgress, event);
      if (event.state === 'downloading' || event.state === 'verifying') s.companion.react('model.loading', 'thinking');
      if (event.state === 'installed') s.companion.react('model.loaded', 'ready');
      if (event.state === 'missing' || event.state === 'error') s.companion.react('model.missing', 'model-unavailable');
    });

    powerMonitor.on('resume', () => s.companion.react('system.resume', 'ready'));
    powerMonitor.on('on-battery', () => send(EVENTS.statusChanged));
    powerMonitor.on('on-ac', () => send(EVENTS.statusChanged));

    const startHidden =
      s.settings.get().system.launchMinimized &&
      ((process.platform === 'win32' && process.argv.includes('--start-hidden')) ||
        (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin));
    mainWindow = openWindow(!startHidden);
    setTimeout(() => s.readAloud.warm(), 3_000).unref();
    s.updater.start();
  });

  app.on('activate', () => {
    if (!services || !ipcReady) return;
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = openWindow();
    else showWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !services?.settings.get().system.closeToTray) app.quit();
  });

  app.on('will-quit', (event) => {
    shortcuts.clear();
    if (installingUpdate) {
      tray.destroy();
      return;
    }
    if (!services) {
      companionWindow?.close();
      tray.destroy();
      return;
    }
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(shutdownTimer);
      companionWindow = null;
      tray.destroy();
      app.exit(0);
    };
    const shutdownTimer = setTimeout(() => {
      console.error('Service shutdown timed out; exiting Inaudio');
      finish();
    }, 10_000);
    void services.dispose()
      .catch((error: unknown) => console.error('Service shutdown failed', error))
      .finally(finish);
  });
}
