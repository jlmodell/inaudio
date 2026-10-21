export const DEFAULT_READ_ALOUD_BUFFER = 3;
export const MIN_READ_ALOUD_BUFFER = 1;
export const MAX_READ_ALOUD_BUFFER = 8;

/** Keep `ahead` pulls in flight so playback can stay that many items ahead. */
export async function* pullAhead<T, R>(
  items: T[],
  ahead: number,
  pull: (item: T, index: number) => Promise<R>,
): AsyncGenerator<R> {
  const window = Math.max(1, Math.floor(ahead) || 1);
  const pending: Promise<R>[] = [];
  let next = 0;
  const fill = () => {
    while (pending.length < window && next < items.length) {
      const index = next;
      next += 1;
      pending.push(pull(items[index] as T, index));
    }
  };
  fill();
  while (pending.length) {
    const result = await pending.shift();
    if (result === undefined) return;
    fill();
    yield result;
  }
}

export function clampAhead(value: number, fallback = DEFAULT_READ_ALOUD_BUFFER): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_READ_ALOUD_BUFFER, Math.max(MIN_READ_ALOUD_BUFFER, Math.round(value)));
}
