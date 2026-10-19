import { BrowserWindow } from 'electron';
import path from 'node:path';
import { LIVE_WINDOW_SIZE, type Settings } from '@shared/domain/settings';
import { overlaySupport } from '../app/platform';
import { APP_ORIGIN } from '../security/app-protocol';

/**
 * The floating live window: a small panel with 6px corners that shows a live transcript over
 * other apps. The window is transparent so the corners are the same on every platform; a
 * transparent window cannot be resized natively, so its edges resize it through the main
 * process instead. It is focusable so it can be dragged, scrolled and used from the
 * keyboard, but it is always shown inactive so it never takes focus.
 */
export function createLiveWindow(settings: Settings['liveWindow']): BrowserWindow {
  const support = overlaySupport();
  const win = new BrowserWindow({
    width: settings.width,
    height: settings.height,
    minWidth: LIVE_WINDOW_SIZE.minWidth,
    minHeight: LIVE_WINDOW_SIZE.minHeight,
    maxWidth: LIVE_WINDOW_SIZE.maxWidth,
    maxHeight: LIVE_WINDOW_SIZE.maxHeight,
    show: false,
    frame: false,
    // On macOS a panel floats over other apps without activating Inaudio.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Native resizing breaks transparent windows; the page's edges resize it instead.
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: support.alwaysOnTop && settings.alwaysOnTop,
    // The page draws the 6px corners; a native rounding would clip its shadow.
    roundedCorners: false,
    title: 'Inaudio live transcript',
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
      // Text keeps arriving while another app has focus.
      backgroundThrottling: false,
      devTools: !!MAIN_WINDOW_VITE_DEV_SERVER_URL,
    },
  });
  if (process.platform !== 'win32') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(new URL('live.html', MAIN_WINDOW_VITE_DEV_SERVER_URL).href);
  } else {
    void win.loadURL(`${APP_ORIGIN}/live.html`);
  }
  return win;
}
