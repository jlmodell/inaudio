import { clipboard, ClipboardItem } from 'electron';

type Payload = Blob | Electron.ClipboardBookmark;

const POLL_MS = 30;
const COPY_WAIT_MS = 600;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every format the clipboard offers, read into memory. A type that cannot be read is skipped. */
async function snapshot(): Promise<Record<string, Payload>[]> {
  const items = await clipboard.read().catch(() => []);
  const out: Record<string, Payload>[] = [];
  for (const item of items) {
    const record: Record<string, Payload> = {};
    for (const type of item.types) {
      try {
        record[type] = await item.getType(type);
      } catch {
        // A delayed-render or private format; restoring is best-effort.
      }
    }
    if (Object.keys(record).length) out.push(record);
  }
  return out;
}

async function restore(saved: Record<string, Payload>[]): Promise<void> {
  try {
    if (saved.length) await clipboard.write(saved.map((record) => new ClipboardItem(record)));
    else clipboard.clear();
  } catch {
    // Some formats refuse to be written back; the text the user had is still the main loss case.
    const text = saved.find((record) => record['text/plain'] instanceof Blob)?.['text/plain'];
    if (text instanceof Blob) await clipboard.writeText(await text.text()).catch(() => undefined);
  }
}

/**
 * Copies the selection through the clipboard without losing what was on it. The clipboard is
 * cleared first so an empty selection reads as empty instead of as the previous contents, and
 * the snapshot is put back only while the clipboard still holds what this copy produced, so
 * anything copied in the meantime wins.
 */
export async function captureByCopy(
  sendCopy: () => Promise<void>,
  restoreAfter: boolean,
): Promise<{ text: string } | { error: 'empty' | 'unsupported' }> {
  const saved = await snapshot();
  clipboard.clear();
  try {
    await sendCopy();
  } catch {
    await restore(saved);
    return { error: 'unsupported' };
  }
  let text = '';
  for (let waited = 0; waited <= COPY_WAIT_MS && !text; waited += POLL_MS) {
    await delay(POLL_MS);
    text = await clipboard.readText().catch(() => '');
  }
  const current = await clipboard.readText().catch(() => '');
  if (current === text && (restoreAfter || !text.trim())) await restore(saved);
  return text.trim() ? { text } : { error: 'empty' };
}
