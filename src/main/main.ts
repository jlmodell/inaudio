import { app, BrowserWindow, Menu, nativeTheme, powerMonitor, systemPreferences } from 'electron';
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
    // Activation and second-instance events can arrive while app.whenReady is
    // still initializing services. Do not load a renderer before its IPC
    // handlers have been installed.
    if (!services || !ipcReady) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = openWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  function openWindow(): BrowserWindow {
    const win = createMainWindow();
    registerSurface(win.webContents, 'main');
    win.webContents.on('did-finish-load', () => services?.readAloud.rendererReset());
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
      startDictation: () => command('dictation:start'),
      stopDictation: () => command('dictation:stop'),
      cancelDictation: () => command('dictation:cancel'),
      readClipboard: () => void services?.readAloud.start({ source: 'clipboard' }),
      pauseReading: () => services?.readAloud.pause(),
      resumeReading: () => services?.readAloud.resume(),
      stopReading: () => services?.readAloud.stop(),
      openSettings: () => {
        showWindow();
        command('navigate:settings');
      },
      selectMicrophone: (id) => {
        if (!services) return;
        try {
          services.updateSettings({ audio: { inputDeviceId: id } });
        } catch (error) {
          console.error('Could not switch microphone', error);
        }
      },
      toggleOverlay: () => {
        const current = services?.settings.get();
        if (!current) return;
        const enabled = !current.overlay.enabled;
        services?.updateSettings({ overlay: { enabled } });
      },
      showCompanion: () => services?.companion.show(),
      hideCompanion: () => services?.companion.hide(),
      toggleCompanionClickThrough: () => services?.companion.toggleClickThrough(),
      quit: () => {
        quitting = true;
        app.quit();
      },
    },
    DEFAULT_SETTINGS,
  );

  const shortcuts = new ShortcutService({
    dictation: () => command('dictation:toggle'),
    readAloud: () => services?.readAloud.toggleSelection(),
    readAloudPause: () => services?.readAloud.togglePause(),
    readAloudStop: () => services?.readAloud.stop(),
    cancel: () => command('dictation:cancel'),
    overlay: () => {
      const current = services?.settings.get();
      if (current) services?.updateSettings({ overlay: { enabled: !current.overlay.enabled } });
    },
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
        if (!mainWindow || mainWindow.isDestroyed()) mainWindow = openWindow();
      },
    });
    const s = services;
    s.updater.setBeforeInstall(() => {
      installingUpdate = true;
      quitting = true;
    });
    registerIpc(s);
    ipcReady = true;
    s.updater.on('change', (status) => send(EVENTS.updateState, status));
    openCompanion();
    // The active recognizer is checked first and preloaded at once, so the first recording
    // never waits for the other models' checks.
    const activeSttId = s.settings.get().stt.modelId;
    void s.models.check(activeSttId)
      .catch(() => undefined)
      .then(() => {
        if (!s.models.isInstalled(activeSttId)) return;
        // Loading a 0.6B model during stop makes the UI appear stuck in "Transcribing".
        void s.ensureLoaded(activeSttId).catch((error: unknown) => {
          console.error('Active speech model preload failed', error);
        });
      })
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
      const { launchAtLogin } = s.settings.get().system;
      if (process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: launchAtLogin });
    };
    applySystem();
    shortcuts.apply(s.settings.get());
    tray.apply(s.settings.get());
    s.overlay.sync();

    s.settings.on('change', (next, previous) => {
      if (next.appearance.theme !== previous.appearance.theme) applyTheme();
      if (
        next.dictation.shortcut !== previous.dictation.shortcut ||
        next.dictation.cancelShortcut !== previous.dictation.cancelShortcut ||
        next.tts.shortcut !== previous.tts.shortcut ||
        next.tts.pauseShortcut !== previous.tts.pauseShortcut ||
        next.tts.stopShortcut !== previous.tts.stopShortcut ||
        next.overlay.toggleShortcut !== previous.overlay.toggleShortcut
      ) {
        shortcuts.apply(next);
      }
      if (next.system.launchAtLogin !== previous.system.launchAtLogin) applySystem();
      if (JSON.stringify(next.updates) !== JSON.stringify(previous.updates)) s.updater.applySettings(next.updates);
      // Model switches are unloaded by the services' own queue; status follows in its batch.
      if (JSON.stringify(next.overlay) !== JSON.stringify(previous.overlay)) s.overlay.sync();
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

    // Audio devices do not survive a sleep, so a recording in flight is abandoned.
    powerMonitor.on('suspend', () => s.dictation.interrupt());
    powerMonitor.on('resume', () => s.companion.react('system.resume', 'ready'));
    powerMonitor.on('on-battery', () => send(EVENTS.statusChanged));
    powerMonitor.on('on-ac', () => send(EVENTS.statusChanged));

    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone');
    }

    mainWindow = openWindow();
    // Only the dictation engine is started eagerly; synthesis starts on first use.
    void s.stt.start().catch((error: unknown) => console.error(error));
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
    const disposing = services.dispose();
    void disposing.finally(() => {
      companionWindow = null;
      tray.destroy();
      app.exit(0);
    });
  });
}
