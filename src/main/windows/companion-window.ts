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
  options: Pick<CompanionSettings, 'edgeMargin' | 'keepAwayFromText'> = {
    edgeMargin: 56,
    keepAwayFromText: true,
  },
): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const size = Math.round(128 * scale);
  const windowWidth = Math.max(size + 48, COMPANION_SIZE);
  const windowHeight = Math.max(size + 52, COMPANION_HEIGHT);
  const margin = Math.min(options.edgeMargin, Math.floor(Math.min(width, height) / 3));
  const left = position.endsWith('left') ? x + margin : x + width - windowWidth - margin;
  const top = position.startsWith('top') ? y + margin : y + height - windowHeight - margin;
  const nearMicrophone = position === 'near-microphone';
  const focusArea = position === 'focus-area';
  const cursor = screen.getCursorScreenPoint();
  const focusGap = options.keepAwayFromText ? 72 : 36;
  const unclampedX = focusArea
    ? cursor.x - Math.round(windowWidth / 2)
    : nearMicrophone
      ? x + Math.round(width / 2) - Math.round(windowWidth / 2)
      : left;
  const focusY = cursor.y - windowHeight - focusGap >= y + margin
    ? cursor.y - windowHeight - focusGap
    : cursor.y + focusGap;
  const unclampedY = focusArea
    ? focusY
    : nearMicrophone
      ? y + margin
      : top;
  const nextX = Math.max(x + margin, Math.min(unclampedX, x + width - windowWidth - margin));
  const nextY = Math.max(y + margin, Math.min(unclampedY, y + height - windowHeight - margin));
  // Focus tracking calls this four times a second; an unmoved window is left alone.
  const current = win.getBounds();
  if (current.x === nextX && current.y === nextY && current.width === windowWidth && current.height === windowHeight) return;
  win.setBounds({ x: nextX, y: nextY, width: windowWidth, height: windowHeight }, false);
}
