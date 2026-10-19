import { wordCount, type Transcript } from '@shared/domain/history';

const DAY_MS = 86_400_000;

export interface Week {
  words: number;
  takes: number;
  /** Milliseconds of audio across the week's items. */
  ms: number;
  /** Words a minute across the week's items, 0 when there is nothing to measure. */
  pace: number;
  /** Words per day, oldest first, today last. */
  days: number[];
}

/** The last seven days of saved transcripts, counted on this computer. */
export function weekOf(items: Transcript[], now = Date.now()): Week {
  const today = new Date(new Date(now).toDateString()).getTime();
  const start = today - 6 * DAY_MS;
  const days = Array<number>(7).fill(0);
  let words = 0;
  let takes = 0;
  let ms = 0;
  for (const item of items) {
    if (item.createdAt < start) continue;
    const count = wordCount(item.text);
    const day = Math.min(6, Math.floor((item.createdAt - start) / DAY_MS));
    days[day] = (days[day] ?? 0) + count;
    words += count;
    takes += 1;
    ms += item.durationMs;
  }
  return { words, takes, ms, pace: ms > 5_000 ? Math.round(words / (ms / 60_000)) : 0, days };
}
