/** True for a Wayland session, where several window-manager hints are not honoured. */
export function isWayland(): boolean {
  if (process.platform !== 'linux') return false;
  return process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
}
