import { app, desktopCapturer, session, shell, webContents, type Streams, type WebContents } from 'electron';
import { consumeCapture, isCaptureArmed } from './capture-grant';
import { surfaceOfContents } from './surfaces';
import { isTrustedFrame, isTrustedUrl } from './trusted-origin';

const ALLOWED_PERMISSIONS = new Set(['media', 'speaker-selection', 'clipboard-sanitized-write']);

/** Rejects a getDisplayMedia() call with an AbortError, as documented for the handler. */
const DENY = null as unknown as Streams;

/** Screen capture is only ever for the app window, and only while a live session armed it. */
function captureAllowed(contents: WebContents | null): boolean {
  return (
    !!contents &&
    isTrustedUrl(contents.getURL()) &&
    surfaceOfContents(contents) === 'main' &&
    isCaptureArmed(contents.id)
  );
}

/** Session-wide permission, navigation and window-creation policy. */
export function applySessionPolicy(): void {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (!isTrustedUrl(webContents.getURL())) {
      callback(false);
      return;
    }
    if (permission === 'media' || permission === 'display-capture') {
      const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
      // Microphone requests name their media type. Camera is never granted.
      if (permission === 'media' && types.length > 0) {
        callback(types.every((t) => t === 'audio'));
        return;
      }
      // Electron 44 reports getDisplayMedia as `media` with no types; 45 renames it
      // `display-capture` (electron/electron#52824). Either way it is screen capture.
      callback(details.isMainFrame && captureAllowed(webContents));
      return;
    }
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (!webContents || !isTrustedUrl(requestingOrigin)) return false;
    if (permission === 'display-capture') return captureAllowed(webContents);
    return ALLOWED_PERMISSIONS.has(permission);
  });

  ses.setDevicePermissionHandler(() => false);

  // getDisplayMedia lands here. The only grant is system audio for an armed live session in
  // the app window's top frame; the screen source exists because Chromium requires video,
  // and the renderer stops that track immediately. macOS uses its own picker instead, since
  // a custom grant never starts the CoreAudio tap there (electron/electron#52738).
  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      const frame = request.frame;
      const contents = frame ? webContents.fromFrame(frame) : undefined;
      if (
        !frame ||
        !isTrustedFrame(frame) ||
        !contents ||
        !request.audioRequested ||
        !captureAllowed(contents) ||
        !consumeCapture(contents.id)
      ) {
        callback(DENY);
        return;
      }
      desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then(
        (sources) => {
          const screen = sources[0];
          callback(screen ? { video: screen, audio: 'loopback' } : DENY);
        },
        () => callback(DENY),
      );
    },
    { useSystemPicker: process.platform === 'darwin' },
  );

  // No remote content is ever loaded by the renderer.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      isTrustedUrl(url) ||
      url.startsWith('devtools://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('chrome-extension://') ||
      (!!MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith('ws://localhost'));
    callback({ cancel: !allowed });
  });

  app.on('web-contents-created', (_event, contents) => lockDownContents(contents));
}

function lockDownContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** The only path to the system browser. Callers pass allow-listed constants. */
export async function openTrustedExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only https links can be opened');
  await shell.openExternal(parsed.toString());
}
