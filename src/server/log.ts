/** stdout/stderr lines operators can see in `docker compose logs`. */
export const log = {
  info(message: string): void {
    console.log(message);
  },
  error(message: string, cause?: unknown): void {
    if (cause instanceof Error) console.error(`${message}: ${cause.message}`);
    else if (cause !== undefined) console.error(`${message}: ${String(cause)}`);
    else console.error(message);
  },
};

export function formatModelProgress(
  name: string,
  progress: { state: string; bytesDone: number; bytesTotal: number; error?: string },
): string | null {
  if (progress.state === 'downloading') {
    const pct = progress.bytesTotal
      ? Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100))
      : 0;
    return `Downloading ${name}: ${pct}% (${progress.bytesDone} / ${progress.bytesTotal} bytes)`;
  }
  if (progress.state === 'verifying') return `Verifying ${name}`;
  if (progress.state === 'installed') return `Installed ${name}`;
  if (progress.state === 'error') return `Failed ${name}: ${progress.error ?? 'unknown error'}`;
  return null;
}

export function downloadProgressBucket(progress: { bytesDone: number; bytesTotal: number }): number {
  if (!progress.bytesTotal) return 0;
  return Math.min(10, Math.floor((progress.bytesDone / progress.bytesTotal) * 10));
}
