import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { assertTrustedSender } from './trusted-origin';

/**
 * Which window a webContents belongs to. Channels that only make sense for one surface
 * check this on top of the origin check, so the overlay cannot drive audio capture and
 * the main window cannot speak for the overlay.
 */
export type Surface = 'main' | 'overlay' | 'companion';

const surfaces = new Map<number, Surface>();

export function registerSurface(contents: WebContents, surface: Surface): void {
  surfaces.set(contents.id, surface);
  contents.once('destroyed', () => surfaces.delete(contents.id));
}

export function surfaceOf(event: IpcMainInvokeEvent | IpcMainEvent): Surface | null {
  return surfaces.get(event.sender.id) ?? null;
}

export function surfaceOfContents(contents: WebContents): Surface | null {
  return surfaces.get(contents.id) ?? null;
}

/** Throws unless the sender is a trusted top-level frame in the expected window. */
export function assertSurface(
  event: IpcMainInvokeEvent | IpcMainEvent,
  expected: Surface,
): void {
  assertTrustedSender(event);
  if (surfaceOf(event) !== expected) {
    throw new Error(`Rejected IPC from a window other than the ${expected} window`);
  }
}
