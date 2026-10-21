import type { HistoryKind, HistoryUpdate, Transcript } from '@shared/domain/history';
import type { VoiceId } from '@shared/domain/models';
import type {
  WebHistoryPage,
  WebLiveResult,
  WebSettings,
  WebSettingsPatch,
  WebStatus,
  WebTranscribeResult,
} from '@shared/web/api';

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

function pcmBody(samples: Float32Array): ArrayBuffer {
  return samples.slice().buffer;
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
  history(query: { search?: string; kind?: HistoryKind; pinned?: boolean }): Promise<WebHistoryPage> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.kind) params.set('kind', query.kind);
    if (query.pinned) params.set('pinned', '1');
    params.set('limit', '200');
    return request(`/api/history?${params}`);
  },
  updateTranscript(id: string, patch: HistoryUpdate): Promise<Transcript> {
    return request(`/api/history/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  removeTranscript(id: string): Promise<void> {
    return request(`/api/history/${id}`, { method: 'DELETE' });
  },
  clearHistory(): Promise<void> {
    return request('/api/history', { method: 'DELETE' });
  },
  transcribe(samples: Float32Array, sampleRate: number): Promise<WebTranscribeResult> {
    return request('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(sampleRate) },
      body: pcmBody(samples),
    });
  },
  startLive(): Promise<{ id: string }> {
    return request('/api/live/start', { method: 'POST' });
  },
  liveChunk(id: string, samples: Float32Array, sampleRate: number): Promise<WebLiveResult> {
    return request(`/api/live/${id}/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(sampleRate) },
      body: pcmBody(samples),
    });
  },
  stopLive(id: string): Promise<WebTranscribeResult> {
    return request(`/api/live/${id}/stop`, { method: 'POST' });
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
};
