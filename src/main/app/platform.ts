import os from 'node:os';
import type { SystemAudioSupport } from '@shared/domain/capture';
import type { OverlaySupport } from '@shared/domain/system';

const WINDOWS = process.platform === 'win32';
const MACOS = process.platform === 'darwin';
const LINUX = process.platform === 'linux';

/** True for a Wayland session, where several window-manager hints are not honoured. */
export function isWayland(): boolean {
  if (!LINUX) return false;
  return process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
}

/**
 * What the running platform allows the overlay to do. Each flag mirrors a documented
 * Electron limitation, so the UI can say what is unavailable instead of failing quietly.
 */
export function overlaySupport(): OverlaySupport {
  const wayland = isWayland();
  return {
    // setAlwaysOnTop is ignored on Wayland; an unfocusable window stays on top instead.
    alwaysOnTop: !wayland,
    // setOpacity does nothing on Linux.
    opacity: WINDOWS || MACOS,
    // IgnoreMouseEventsOptions.forward is macOS and Windows only, so hovering to arm
    // the controls cannot work anywhere else.
    hover: WINDOWS || MACOS,
    // screen.getCursorScreenPoint is not supported on Wayland.
    cursor: !wayland,
  };
}

/** The Chromium feature that turns on PulseAudio loopback for screen share; off by default in M152. */
export const LINUX_LOOPBACK_FEATURE = 'PulseaudioLoopbackForScreenShare';

/**
 * What Chromium 152 can do with system audio here. Mirrors `IsSystemLoopbackCaptureSupported`
 * and `IsRestrictOwnAudioSupported` in media/base/media_switches.cc, so the UI says what is
 * missing before a capture comes back with a dead track.
 */
export function systemAudioSupport(): SystemAudioSupport {
  if (WINDOWS) {
    // Process loopback, which filters our own playback, starts with Windows 11 (build 22000).
    const build = Number(os.release().split('.')[2] ?? 0);
    return { available: true, mode: 'loopback', ownAudioFiltered: build >= 22_000, reason: '' };
  }
  if (MACOS) {
    // A custom picker never starts the CoreAudio tap (electron/electron#52738); the system
    // picker that works around it needs macOS 15.
    const major = Number(process.getSystemVersion().split('.')[0] ?? 0);
    return major >= 15
      ? { available: true, mode: 'system-picker', ownAudioFiltered: true, reason: '' }
      : { available: false, mode: 'none', ownAudioFiltered: false, reason: 'System audio needs macOS 15 or later.' };
  }
  if (LINUX) return { available: true, mode: 'loopback', ownAudioFiltered: false, reason: '' };
  return { available: false, mode: 'none', ownAudioFiltered: false, reason: 'System audio is not supported on this platform.' };
}
