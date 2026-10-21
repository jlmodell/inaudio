import type { VoiceId } from '@shared/domain/models';
import { api } from './api';

type SpeakHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
};

/**
 * Fetches sentence-sized WAVs as they are synthesized, decodes them without
 * blocking the stream, and schedules them on an AudioContext so the next
 * sentence starts as the current one ends.
 */
export class SpeakQueue {
  private ctx: AudioContext | null = null;
  private abort: AbortController | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private stopped = false;

  async start(input: { text: string; voiceId: VoiceId; speed: number }, hooks: SpeakHooks): Promise<void> {
    this.stop();
    this.stopped = false;
    this.abort = new AbortController();
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('This browser cannot play speech.');
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    let nextAt = ctx.currentTime;
    let started = false;
    let lastEnded = Promise.resolve();
    const ready: Array<AudioBuffer | undefined> = [];
    let pumpDone = false;
    let pumpError: Error | undefined;
    let wake = () => {};
    const wait = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });

    const pump = (async () => {
      const pending: Promise<void>[] = [];
      for await (const chunk of api.speakStream(input, this.abort?.signal)) {
        if (this.stopped) return;
        pending.push(
          ctx.decodeAudioData(wavBuffer(chunk.wav)).then((buffer) => {
            ready[chunk.index] = buffer;
            wake();
          }),
        );
      }
      await Promise.all(pending);
    })();

    void pump
      .catch((error) => {
        if (this.stopped) return;
        pumpError = error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        pumpDone = true;
        wake();
      });

    try {
      let index = 0;
      while (!this.stopped) {
        if (pumpError) throw pumpError;
        const buffer = ready[index];
        if (buffer) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime, nextAt);
          source.start(startAt);
          nextAt = startAt + buffer.duration;
          this.sources.push(source);
          lastEnded = new Promise((resolve) => {
            source.onended = () => resolve();
          });
          if (!started) {
            started = true;
            hooks.onPlaying();
          }
          index += 1;
          continue;
        }
        if (pumpDone) {
          if (index === 0) throw new Error('Could not read that aloud');
          break;
        }
        await wait();
      }
      if (this.stopped) return;
      await lastEnded;
      if (!this.stopped) hooks.onEnded();
    } catch (error) {
      if (this.stopped) return;
      hooks.onError(error instanceof Error ? error : new Error('Could not read that aloud'));
    }
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  stop(): void {
    this.stopped = true;
    this.abort?.abort();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    }
    this.sources = [];
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close();
  }
}

function wavBuffer(wav: string): ArrayBuffer {
  const binary = atob(wav);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
