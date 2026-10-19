import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { Settings } from '@shared/domain/settings';
import { APP_ORIGIN } from '../security/app-protocol';
import { overlaySupport } from '../app/platform';
import { overlaySize } from './overlay-size';

/**
 * The floating recording surface: frameless, transparent, never focusable so it cannot
 * take focus away from the application receiving dictated text.
 */
export function createOverlayWindow(overlay: Settings['overlay']): BrowserWindow {
  const support = overlaySupport();
  const { width, height } = overlaySize(overlay, {
    phase: 'idle',
    armed: false,
    message: false,
    menuOpen: false,
    live: false,
    caption: false,
    devices: 0,
    language: false,
    reading: null,
  });

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    // Never steal focus: the window being dictated into has to keep it.
    focusable: false,
    alwaysOnTop: support.alwaysOnTop,
    acceptFirstMouse: true,
    roundedCorners: false,
    title: 'Inaudio overlay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      // The overlay keeps animating while the main window is hidden.
      backgroundThrottling: false,
      devTools: !!MAIN_WINDOW_VITE_DEV_SERVER_URL,
    },
  });

  if (support.alwaysOnTop) {
    // Float above full-screen windows as well as ordinary ones.
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  if (process.platform !== 'win32') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(new URL('overlay.html', MAIN_WINDOW_VITE_DEV_SERVER_URL).href);
  } else {
    void win.loadURL(`${APP_ORIGIN}/overlay.html`);
  }
  return win;
}
