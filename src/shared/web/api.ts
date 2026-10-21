import type { ModelId, ModelInstallState, VoiceId } from '../domain/models';
import type { BrowserTtsProgress } from './browser-tts';
import type { ReadAloudEngine } from './read-aloud-engine';

export interface WebModelProgress {
  id: ModelId;
  name: string;
  kind: 'tts';
  state: ModelInstallState;
  bytesDone: number;
  bytesTotal: number;
  installed: boolean;
  loaded: boolean;
  error?: string;
}

export interface WebStatus {
  ready: boolean;
  authRequired: boolean;
  authenticated: boolean;
  tts: WebModelProgress;
  browserTts: BrowserTtsProgress;
  message?: string;
}

export interface WebSettings {
  ttsModelId: ModelId;
  voiceId: VoiceId;
  speed: number;
  readAloudEngine: ReadAloudEngine;
  speedReading: boolean;
  readAloudBuffer: number;
}

export type WebSettingsPatch = Partial<WebSettings>;

export interface WebSpeakRequest {
  text: string;
  voiceId?: VoiceId;
  speed?: number;
}

/** One synthesized sentence (or short span) from `/api/speak/stream`. */
export interface WebSpeakChunk {
  index: number;
  count: number;
  sampleRate: number;
  wav?: string;
  type?: 'start';
  text?: string;
  generateMs?: number;
}

export interface WebErrorBody {
  error: string;
}
