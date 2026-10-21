import type { TtsResult } from '@shared/worker/protocol';

export interface TextToSpeechEngine {
  readonly modelId: string;
  speak(text: string, sid: number, speed: number): Promise<TtsResult>;
  dispose(): void;
}
