const BLANK_WORKER_MESSAGE = /^(?:|script error\.?|undefined|null)$/i;

export type WorkerFailureInfo = {
  message?: string | null;
  filename?: string | null;
  lineno?: number | null;
  colno?: number | null;
  url?: string | null;
  error?: unknown;
};

export function failingUrlFromText(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)'"`]+|\/(?:browser-tts|ort|assets)\/[^\s)'"`]+/);
  return match?.[0]?.replace(/[.,;:]+$/, '');
}

/** Host `Worker.onerror` often arrives as an empty / "Script error." event. */
export function workerFailureText(info: WorkerFailureInfo): string {
  const thrown =
    info.error instanceof Error ? info.error.message : info.error != null ? String(info.error) : '';
  const message = info.message && !BLANK_WORKER_MESSAGE.test(info.message.trim()) ? info.message.trim() : '';
  const where = info.filename ? `${info.filename}:${Number(info.lineno ?? 0)}:${Number(info.colno ?? 0)}` : '';
  const url = info.url?.trim() || failingUrlFromText(message) || failingUrlFromText(thrown) || '';
  const parts = [message || thrown];
  if (message && thrown && thrown !== message) parts.push(thrown);
  if (where) parts.push(where);
  if (url && !parts.join(' ').includes(url)) parts.push(`url: ${url}`);
  return parts.filter(Boolean).join(' ') || 'The on-device voice could not start.';
}

export function voiceErrorText(error: unknown): string {
  if (error instanceof Error) {
    const title = error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
    const parts = [title];
    if (error.stack) parts.push(error.stack);
    const cause = 'cause' in error ? error.cause : undefined;
    if (cause !== undefined) parts.push(`cause: ${voiceErrorText(cause)}`);
    return parts.filter(Boolean).join('\n');
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function isWebGpuFailure(error: unknown): boolean {
  const text = voiceErrorText(error).toLowerCase();
  return (
    text.includes('webgpu') ||
    text.includes('wgpu') ||
    text.includes('jsep') ||
    text.includes('gpu device') ||
    text.includes('gpu adapter') ||
    text.includes('no available adapter') ||
    text.includes('requestadapter') ||
    text.includes('device lost')
  );
}

export function logVoiceError(label: string, error: unknown): string {
  const detail = voiceErrorText(error);
  console.error(`[inaudio] ${label}`, error, detail);
  return detail;
}
