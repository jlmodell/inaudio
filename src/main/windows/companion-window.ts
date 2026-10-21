import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { CompanionPosition, CompanionSettings } from '@shared/domain/companion';
import { APP_ORIGIN } from '../security/app-protocol';

export const COMPANION_SIZE = 240;
export const COMPANION_HEIGHT = 180;

export function createCompanionWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: COMPANION_SIZE,
    height: COMPANION_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    roundedCorners: true,
    title: 'Inaudio companion',
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
      backgroundThrottling: false,
      devTools: !!MAIN_WINDOW_VITE_DEV_SERVER_URL,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform !== 'win32') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(new URL('companion.html', MAIN_WINDOW_VITE_DEV_SERVER_URL).href);
  } else {
    void win.loadURL(`${APP_ORIGIN}/companion.html`);
  }
  return win;
}

export function placeCompanion(
  win: BrowserWindow,
  position: CompanionPosition,
  scale: number,
  options: Pick<CompanionSettings, 'edgeMargin'> = { edgeMargin: 56 },
): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const size = Math.round(128 * scale);
  const windowWidth = Math.max(size + 48, COMPANION_SIZE);
  const windowHeight = Math.max(size + 52, COMPANION_HEIGHT);
  const margin = Math.min(options.edgeMargin, Math.floor(Math.min(width, height) / 3));
  const left = position.endsWith('left') ? x + margin : x + width - windowWidth - margin;
  const top = position.startsWith('top') ? y + margin : y + height - windowHeight - margin;
  const current = win.getBounds();
  if (current.x === left && current.y === top && current.width === windowWidth && current.height === windowHeight) return;
  win.setBounds({ x: left, y: top, width: windowWidth, height: windowHeight }, false);
}
