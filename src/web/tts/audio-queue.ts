import { wordCues } from '@shared/read-aloud/words';
import type { SentenceTiming } from '@shared/web/read-aloud-engine';

export type PcmChunk = {
  index: number;
  samples: Float32Array;
  sampleRate: number;
  text?: string;
  generateMs?: number;
  phonemes?: string;
  voice?: string;
};

type QueueHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
  onWord?(word: string): void;
  onTiming?(timing: SentenceTiming): void;
};

/**
 * Schedules PCM on an AudioContext so the next sentence starts at the previous
 * end time. Playback waits until `buffer` sentences are decoded (or the stream
 * ends), then keeps scheduling as more arrive.
 */
export class AudioQueue {
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private stopped = false;
  private raf = 0;
  private cues: { at: number; word: string }[] = [];
  private cueIndex = 0;
  private lastWord = '';

  async start(source: AsyncIterable<PcmChunk>, hooks: QueueHooks, options: { buffer: number; expected?: number }): Promise<void> {
    this.stop();
    this.stopped = false;
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('This browser cannot play speech.');
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    const hold = Math.max(1, options.buffer);
    let nextAt = ctx.currentTime + 0.02;
    let started = false;
    let lastEnded = Promise.resolve();
    const ready: Array<
      (AudioBuffer & { text?: string; generateMs?: number; phonemes?: string; voice?: string }) | undefined
    > = [];
    let pumpDone = false;
    let pumpError: Error | undefined;
    let wake = () => {};
    const wait = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });

    const pump = (async () => {
      for await (const chunk of source) {
        if (this.stopped) return;
        const buffer = pcmBuffer(ctx, chunk.samples, chunk.sampleRate) as AudioBuffer & {
          text?: string;
          generateMs?: number;
          phonemes?: string;
          voice?: string;
        };
        buffer.text = chunk.text;
        buffer.generateMs = chunk.generateMs;
        buffer.phonemes = chunk.phonemes;
        buffer.voice = chunk.voice;
        ready[chunk.index] = buffer;
        wake();
      }
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

    const tick = () => {
      if (this.stopped || !this.ctx) return;
      const now = this.ctx.currentTime;
      while (this.cueIndex < this.cues.length) {
        const cue = this.cues[this.cueIndex];
        if (!cue || now < cue.at) break;
        this.cueIndex += 1;
        if (cue.word !== this.lastWord) {
          this.lastWord = cue.word;
          hooks.onWord?.(cue.word);
        }
      }
      this.raf = window.requestAnimationFrame(tick);
    };

    try {
      let index = 0;
      while (!this.stopped) {
        if (pumpError) throw pumpError;
        if (!started) {
          const have = ready.filter(Boolean).length;
          const need = Math.min(hold, options.expected ?? hold);
          if (have < need && !pumpDone) {
            await wait();
            continue;
          }
        }
        const buffer = ready[index];
        if (buffer) {
          const node = ctx.createBufferSource();
          node.buffer = buffer;
          node.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime + 0.01, nextAt);
          node.start(startAt);
          nextAt = startAt + buffer.duration;
          this.sources.push(node);
          lastEnded = new Promise((resolve) => {
            node.onended = () => resolve();
          });
          if (buffer.text) {
            for (const cue of wordCues(buffer.text, buffer.duration * 1000)) {
              this.cues.push({ at: startAt + cue.atMs / 1000, word: cue.word });
            }
          }
          hooks.onTiming?.({
            index,
            count: options.expected ?? ready.length,
            chars: buffer.text?.length ?? 0,
            generateMs: buffer.generateMs ?? 0,
            durationMs: Math.round(buffer.duration * 1000),
            phonemes: buffer.phonemes,
            voice: buffer.voice,
          });
          if (!started) {
            started = true;
            this.raf = window.requestAnimationFrame(tick);
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
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cues = [];
    this.cueIndex = 0;
    this.lastWord = '';
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

function pcmBuffer(ctx: AudioContext, samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  return buffer;
}
