import type { VoiceId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { clampAhead, DEFAULT_READ_ALOUD_BUFFER, pullAhead } from '@shared/read-aloud/ahead';
import { BROWSER_SEGMENT_LIMITS, normalizeText, segmentText, textFromSegmentIndex } from '@shared/read-aloud/segment';
import {
  browserVoiceName,
  clampReadSpeed,
  effectiveReadAloudEngine,
  type ReadAloudEngine,
  type SentenceTiming,
} from '@shared/web/read-aloud-engine';
import { logVoiceError } from '@shared/web/voice-error';
import { SpeakQueue } from '../speak-queue';
import { AudioQueue } from './audio-queue';
import { canUseBrowserTts, hasWebSpeech } from './detect';
import { readDeviceFallback, writeDeviceFallback } from './device-fallback';
import { readAloudDiag, writeAloudDiag } from './diag';
import { kokoroHost, resetKokoroHost } from './kokoro-host';
import { SpeechApiPlayer } from './speech-api';

export type ReadAloudProgress = { file: string; loaded: number; total: number };

export type ReadAloudStart = {
  text: string;
  voiceId: VoiceId;
  speed: number;
  engine: ReadAloudEngine;
  buffer?: number;
  retryOnDevice?: boolean;
};

type PlayerHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
  onProgress?(progress: ReadAloudProgress): void;
  onFallback?(engine: ReadAloudEngine, reason: string): void;
  onWord?(word: string): void;
};

export class ReadAloudPlayer {
  private audio: AudioQueue | null = null;
  private server: SpeakQueue | null = null;
  private speech: SpeechApiPlayer | null = null;
  private stopped = false;
  private paused = false;
  private session: {
    input: ReadAloudStart;
    hooks: PlayerHooks;
    normalized: string;
    segments: ReturnType<typeof segmentText>;
  } | null = null;

  async start(input: ReadAloudStart, hooks: PlayerHooks): Promise<void> {
    this.stop();
    this.stopped = false;
    this.paused = false;
    const text = input.text.trim().slice(0, MAX_READ_ALOUD_CHARS);
    if (!text) return;
    const speed = clampReadSpeed(input.speed);
    const buffer = clampAhead(input.buffer ?? DEFAULT_READ_ALOUD_BUFFER);
    const normalized = normalizeText(text);
    const limits = input.engine === 'browser' ? BROWSER_SEGMENT_LIMITS : undefined;
    this.session = {
      input: { ...input, text, speed, buffer },
      hooks,
      normalized,
      segments: segmentText(normalized, limits),
    };
    if (input.retryOnDevice) {
      writeDeviceFallback(null);
      resetKokoroHost();
    }
    const engine = effectiveReadAloudEngine(input.engine, input.retryOnDevice ? null : readDeviceFallback());
    try {
      if (engine === 'server') return this.startServer({ ...input, text, speed, buffer }, hooks);
      if (engine === 'speech') return this.startSpeech(text, speed, hooks);
      await this.startBrowser(text, input.voiceId, speed, buffer, hooks);
    } catch (error) {
      if (this.stopped) return;
      const detail = logVoiceError('on-device voice failed', error);
      if (engine === 'browser' && hasWebSpeech()) {
        writeDeviceFallback('speech');
        hooks.onFallback?.('speech', detail);
        if (this.stopped) return;
        return this.startSpeech(text, speed, hooks);
      }
      hooks.onError(error instanceof Error ? error : new Error(detail));
    }
  }

  /**
   * Drops buffered sentences and reads again from the one playing, with the new voice or speed.
   * The current sentence is kept as the place; already-played ones are not replayed.
   */
  async updateSpeech(next: { voiceId: VoiceId; speed: number }): Promise<void> {
    const session = this.session;
    if (!session || this.stopped) return;
    const speed = clampReadSpeed(next.speed);
    if (session.input.voiceId === next.voiceId && session.input.speed === speed) return;
    const remaining = this.speech
      ? this.speech.remainingText()
      : textFromSegmentIndex(session.normalized, session.segments, this.playingIndex());
    if (!remaining.trim()) return;
    const keepPaused = this.paused;
    const hooks = session.hooks;
    await this.start(
      { ...session.input, text: remaining, voiceId: next.voiceId, speed, retryOnDevice: false },
      hooks,
    );
    if (keepPaused) this.pause();
  }

  private playingIndex(): number {
    return this.audio?.playingIndex() ?? this.server?.playingIndex() ?? 0;
  }

  pause(): void {
    this.paused = true;
    this.audio?.pause();
    this.server?.pause();
    this.speech?.pause();
  }

  resume(): void {
    this.paused = false;
    this.audio?.resume();
    this.server?.resume();
    this.speech?.resume();
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    this.session = null;
    this.audio?.stop();
    this.server?.stop();
    this.speech?.stop();
    this.audio = null;
    this.server = null;
    this.speech = null;
  }

  private async startServer(
    input: { text: string; voiceId: VoiceId; speed: number; buffer: number },
    hooks: PlayerHooks,
  ): Promise<void> {
    writeAloudDiag({ runtime: 'server', threads: 0, buffer: input.buffer, timings: [] });
    const queue = new SpeakQueue();
    this.server = queue;
    await queue.start(input, this.audioHooks(hooks), { buffer: input.buffer });
  }

  private async startSpeech(text: string, speed: number, hooks: PlayerHooks): Promise<void> {
    writeAloudDiag({ runtime: 'speech', threads: 0, buffer: 1, timings: [] });
    const player = new SpeechApiPlayer();
    this.speech = player;
    await player.start(text, speed, {
      onPlaying: hooks.onPlaying,
      onEnded: hooks.onEnded,
      onError: hooks.onError,
      onWord: hooks.onWord,
    });
  }

  private async startBrowser(
    text: string,
    voiceId: VoiceId,
    speed: number,
    buffer: number,
    hooks: PlayerHooks,
  ): Promise<void> {
    if (!canUseBrowserTts()) throw new Error('This browser cannot run the on-device voice.');
    const host = kokoroHost();
    let info;
    try {
      info = await host.load(hooks.onProgress);
    } catch (error) {
      resetKokoroHost();
      throw error;
    }
    if (this.stopped) return;
    writeAloudDiag({
      runtime: info.runtime,
      threads: info.threads,
      isolated: info.isolated,
      buffer,
      timings: [],
      voice: null,
      phonemes: null,
    });
    const segments = segmentText(normalizeText(text), BROWSER_SEGMENT_LIMITS);
    if (!segments.length) throw new Error('Paste some text to read aloud.');
    const voice = browserVoiceName(voiceId);
    const queue = new AudioQueue();
    this.audio = queue;
    await queue.start(this.pipeline(segments, voice, speed, buffer, host), this.audioHooks(hooks), {
      buffer,
      expected: segments.length,
    });
  }

  private audioHooks(hooks: PlayerHooks) {
    return {
      onPlaying: hooks.onPlaying,
      onEnded: hooks.onEnded,
      onError: hooks.onError,
      onWord: hooks.onWord,
      onTiming: (timing: SentenceTiming) => {
        writeAloudDiag({
          timings: [...readAloudDiag().timings, timing],
          voice: timing.voice ?? readAloudDiag().voice,
          phonemes: timing.phonemes ?? readAloudDiag().phonemes,
        });
      },
    };
  }

  private pipeline(
    segments: { text: string }[],
    voice: string,
    speed: number,
    buffer: number,
    host: ReturnType<typeof kokoroHost>,
  ) {
    return pullAhead(segments, buffer, async (segment, index) => {
      if (this.stopped) throw new Error('Stopped');
      const audio = await host.speak(segment.text, voice, speed);
      writeAloudDiag({ voice: audio.voice, phonemes: audio.phonemes });
      return {
        index,
        samples: audio.samples,
        sampleRate: audio.sampleRate,
        text: segment.text,
        generateMs: audio.generateMs,
        phonemes: audio.phonemes,
        voice: audio.voice,
      };
    });
  }
}
