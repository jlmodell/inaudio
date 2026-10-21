import type { ReadAloudEngine } from '@shared/web/read-aloud-engine';

const KEY = 'inaudio.web.readAloudFallback';

let session: ReadAloudEngine | null = null;
const listeners = new Set<(value: ReadAloudEngine | null) => void>();

clearPersistedFallback();

/** A leftover localStorage pin from an older build; this visit retries on-device. */
function clearPersistedFallback(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode / node */
  }
}

export function readDeviceFallback(): ReadAloudEngine | null {
  return session;
}

export function writeDeviceFallback(engine: ReadAloudEngine | null): void {
  session = engine === 'speech' ? 'speech' : null;
  clearPersistedFallback();
  for (const listener of listeners) listener(session);
}

export function subscribeDeviceFallback(listener: (value: ReadAloudEngine | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
