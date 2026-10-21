import type { VoiceId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { normalizeText, segmentText } from '@shared/read-aloud/segment';
import {
  browserVoiceName,
  effectiveReadAloudEngine,
  type ReadAloudEngine,
} from '@shared/web/read-aloud-engine';
import { SpeakQueue } from '../speak-queue';
import { AudioQueue } from './audio-queue';
import { canUseBrowserTts, hasWebSpeech } from './detect';
import { readDeviceFallback, writeDeviceFallback } from './device-fallback';
import { kokoroHost, resetKokoroHost } from './kokoro-host';
import { SpeechApiPlayer } from './speech-api';

export type ReadAloudProgress = { file: string; loaded: number; total: number };

type PlayerHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
  onProgress?(progress: ReadAloudProgress): void;
  onFallback?(engine: ReadAloudEngine, reason: string): void;
};

export class ReadAloudPlayer {
  private audio: AudioQueue | null = null;
  private server: SpeakQueue | null = null;
  private speech: SpeechApiPlayer | null = null;
  private stopped = false;

  async start(
    input: { text: string; voiceId: VoiceId; speed: number; engine: ReadAloudEngine },
    hooks: PlayerHooks,
  ): Promise<void> {
    this.stop();
    this.stopped = false;
    const text = input.text.trim().slice(0, MAX_READ_ALOUD_CHARS);
    if (!text) return;
    const engine = effectiveReadAloudEngine(input.engine, readDeviceFallback());
    try {
      if (engine === 'server') return this.startServer(input, hooks);
      if (engine === 'speech') return this.startSpeech(text, input.speed, hooks);
      await this.startBrowser(text, input.voiceId, input.speed, hooks);
    } catch (error) {
      if (this.stopped) return;
      const reason = error instanceof Error ? error.message : String(error);
      if (engine === 'browser' && hasWebSpeech()) {
        writeDeviceFallback('speech');
        hooks.onFallback?.('speech', reason);
        if (this.stopped) return;
        return this.startSpeech(text, input.speed, hooks);
      }
      hooks.onError(error instanceof Error ? error : new Error('Could not read that aloud'));
    }
  }

  pause(): void {
    this.audio?.pause();
    this.server?.pause();
    this.speech?.pause();
  }

  resume(): void {
    this.audio?.resume();
    this.server?.resume();
    this.speech?.resume();
  }

  stop(): void {
    this.stopped = true;
    this.audio?.stop();
    this.server?.stop();
    this.speech?.stop();
    this.audio = null;
    this.server = null;
    this.speech = null;
  }

  private async startServer(
    input: { text: string; voiceId: VoiceId; speed: number },
    hooks: PlayerHooks,
  ): Promise<void> {
    const queue = new SpeakQueue();
    this.server = queue;
    await queue.start(input, hooks);
  }

  private async startSpeech(text: string, speed: number, hooks: PlayerHooks): Promise<void> {
    const player = new SpeechApiPlayer();
    this.speech = player;
    await player.start(text, speed, hooks);
  }

  private async startBrowser(text: string, voiceId: VoiceId, speed: number, hooks: PlayerHooks): Promise<void> {
    if (!canUseBrowserTts()) throw new Error('This browser cannot run the on-device voice.');
    const host = kokoroHost();
    try {
      await host.load(hooks.onProgress);
    } catch (error) {
      resetKokoroHost();
      throw error;
    }
    if (this.stopped) return;
    const segments = segmentText(normalizeText(text));
    if (!segments.length) throw new Error('Paste some text to read aloud.');
    const voice = browserVoiceName(voiceId);
    const queue = new AudioQueue();
    this.audio = queue;
    await queue.start(this.pipeline(segments, voice, speed, host), hooks);
  }

  private async *pipeline(
    segments: { text: string }[],
    voice: string,
    speed: number,
    host: ReturnType<typeof kokoroHost>,
  ) {
    let next = host.speak(segments[0]!.text, voice, speed);
    for (let index = 0; index < segments.length; index += 1) {
      if (this.stopped) return;
      const audio = await next;
      if (index + 1 < segments.length) {
        next = host.speak(segments[index + 1]!.text, voice, speed);
      }
      yield { index, samples: audio.samples, sampleRate: audio.sampleRate };
    }
  }
}
