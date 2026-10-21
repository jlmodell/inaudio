export type PcmChunk = { index: number; samples: Float32Array; sampleRate: number };

type QueueHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
};

/**
 * Schedules PCM chunks on an AudioContext so the next sentence starts as
 * the current one ends. Generate the next chunk while this one plays.
 */
export class AudioQueue {
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private stopped = false;

  async start(source: AsyncIterable<PcmChunk>, hooks: QueueHooks): Promise<void> {
    this.stop();
    this.stopped = false;
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
      for await (const chunk of source) {
        if (this.stopped) return;
        ready[chunk.index] = pcmBuffer(ctx, chunk.samples, chunk.sampleRate);
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

    try {
      let index = 0;
      while (!this.stopped) {
        if (pumpError) throw pumpError;
        const buffer = ready[index];
        if (buffer) {
          const node = ctx.createBufferSource();
          node.buffer = buffer;
          node.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime, nextAt);
          node.start(startAt);
          nextAt = startAt + buffer.duration;
          this.sources.push(node);
          lastEnded = new Promise((resolve) => {
            node.onended = () => resolve();
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
