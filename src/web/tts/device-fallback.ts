import type { ReadAloudEngine } from '@shared/web/read-aloud-engine';

const KEY = 'inaudio.web.readAloudFallback';

export function readDeviceFallback(): ReadAloudEngine | null {
  try {
    return localStorage.getItem(KEY) === 'speech' ? 'speech' : null;
  } catch {
    return null;
  }
}

export function writeDeviceFallback(engine: ReadAloudEngine | null): void {
  try {
    if (engine) localStorage.setItem(KEY, engine);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
