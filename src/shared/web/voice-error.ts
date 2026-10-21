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
