import { BrowserWindow, nativeTheme, screen } from 'electron';
import path from 'node:path';
import { appIcon } from '../app/assets';
import { APP_ORIGIN } from '../security/app-protocol';

// Matches --color-canvas in src/renderer/styles/index.css.
const CANVAS = { light: '#EEF0F3', dark: '#111317' };
const INK = { light: '#14161A', dark: '#ECEEF2' };

export function titleBarColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? CANVAS.dark : CANVAS.light, symbolColor: dark ? INK.dark : INK.light, height: 44 };
}

/** `show: false` builds the window hidden, for capture started from outside it. */
export function createMainWindow({ show = true }: { show?: boolean } = {}): BrowserWindow {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: Math.min(1180, workAreaSize.width),
    height: Math.min(780, workAreaSize.height),
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Inaudio',
    icon: appIcon(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? CANVAS.dark : CANVAS.light,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
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
      // Dictation keeps capturing while the window is hidden in the tray.
      backgroundThrottling: false,
      // Keep diagnostics available in packaged builds. The application menu is
      // removed on Windows/Linux, so the explicit shortcut below is required.
      devTools: true,
    },
  });

  win.webContents.on('before-input-event', (event, input) => {
    const isDevToolsShortcut =
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        (input.key.toLowerCase() === 'i' && input.control && input.shift));
    if (!isDevToolsShortcut) return;
    event.preventDefault();
    win.webContents.toggleDevTools();
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Main window failed to load (${errorCode}): ${errorDescription} - ${validatedURL}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Main window renderer exited (${details.reason}): ${details.exitCode}`);
  });
  if (show) win.once('ready-to-show', () => win.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`);
  }
  return win;
}
