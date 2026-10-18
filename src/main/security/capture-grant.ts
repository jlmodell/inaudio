/**
 * One-shot permission for a single system-audio capture. The live-capture controller arms it
 * for the app window right before it asks that window to call getDisplayMedia; the session
 * handlers grant screen/audio capture only while it is armed, and the display-media handler
 * consumes it. A renderer can never capture the screen or system audio on its own initiative.
 */
const TTL_MS = 10_000;

let armed: { contentsId: number; expires: number } | null = null;

export function armCapture(contentsId: number): void {
  armed = { contentsId, expires: Date.now() + TTL_MS };
}

export function isCaptureArmed(contentsId: number): boolean {
  return !!armed && armed.contentsId === contentsId && armed.expires > Date.now();
}

/** True once, for the armed window, within the time limit. */
export function consumeCapture(contentsId: number): boolean {
  const ok = isCaptureArmed(contentsId);
  armed = null;
  return ok;
}

export function disarmCapture(): void {
  armed = null;
}
