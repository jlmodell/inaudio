import type { VoiceId } from '@shared/domain/models';
import type { WebSettings, WebSettingsPatch, WebSpeakChunk, WebStatus } from '@shared/web/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof Uint8Array) && !(init.body instanceof Blob) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 401 && path !== '/api/login') {
    throw new AuthError();
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the status text */
    }
    throw new Error(message);
  }
  if (response.headers.get('content-type')?.includes('application/json')) {
    return (await response.json()) as T;
  }
  return undefined as T;
}

export class AuthError extends Error {
  constructor() {
    super('Sign in to use Inaudio.');
    this.name = 'AuthError';
  }
}

export const api = {
  health(): Promise<{ ok: boolean; ready: boolean }> {
    return request('/api/health');
  },
  status(): Promise<WebStatus> {
    return request('/api/status');
  },
  login(password: string): Promise<{ ok: boolean }> {
    return request('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
  },
  logout(): Promise<{ ok: boolean }> {
    return request('/api/logout', { method: 'POST' });
  },
  settings(): Promise<WebSettings> {
    return request('/api/settings');
  },
  updateSettings(patch: WebSettingsPatch): Promise<WebSettings> {
    return request('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  speak(input: { text: string; voiceId?: VoiceId; speed?: number }): Promise<Blob> {
    return fetch('/api/speak', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(async (response) => {
      if (response.status === 401) throw new AuthError();
      if (!response.ok) {
        try {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? 'Could not read that aloud');
        } catch (error) {
          if (error instanceof Error) throw error;
          throw new Error('Could not read that aloud');
        }
      }
      return response.blob();
    });
  },
  async *speakStream(
    input: { text: string; voiceId?: VoiceId; speed?: number },
    signal?: AbortSignal,
  ): AsyncGenerator<WebSpeakChunk & { wav: string }> {
    const response = await fetch('/api/speak/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    if (response.status === 401) throw new AuthError();
    if (!response.ok) {
      try {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? 'Could not read that aloud');
      } catch (error) {
        if (error instanceof Error) throw error;
        throw new Error('Could not read that aloud');
      }
    }
    if (!response.body) throw new Error('Could not read that aloud');
    for await (const chunk of readNdjson<WebSpeakChunk>(response.body)) {
      if (chunk.wav) yield { ...chunk, wav: chunk.wav };
    }
  },
};

async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
      newline = buffer.indexOf('\n');
    }
    if (done) {
      const tail = buffer.trim();
      if (tail) yield JSON.parse(tail) as T;
      return;
    }
  }
}
