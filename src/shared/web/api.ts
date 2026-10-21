import type { Transcript } from '../domain/history';
import type { ModelId, ModelInstallState, VoiceId } from '../domain/models';
import type { BrowserTtsProgress } from './browser-tts';
import type { ReadAloudEngine } from './read-aloud-engine';

export interface WebModelProgress {
  id: ModelId;
  name: string;
  kind: 'stt' | 'tts';
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
  stt: WebModelProgress;
  tts: WebModelProgress;
  browserTts: BrowserTtsProgress;
  message?: string;
}

export interface WebSettings {
  sttModelId: ModelId;
  ttsModelId: ModelId;
  voiceId: VoiceId;
  speed: number;
  saveHistory: boolean;
  speechCleanup: boolean;
  readAloudEngine: ReadAloudEngine;
}

export type WebSettingsPatch = Partial<WebSettings>;

export interface WebHistoryPage {
  items: Transcript[];
  total: number;
}

export interface WebTranscribeResult {
  transcript: Transcript | null;
  text: string;
}

export interface WebLiveResult {
  text: string;
  provisional: string;
}

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
}

export interface WebErrorBody {
  error: string;
}
