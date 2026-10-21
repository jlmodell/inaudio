import os from 'node:os';

/** sherpa-onnx thread count. Unset means the host CPU count, capped at 16. */
export function parseThreads(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    const cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    return Math.min(16, Math.max(1, cpus));
  }
  return Number.parseInt(value, 10);
}
