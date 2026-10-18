/**
 * Splits a live 16 kHz mono stream into chunks the offline recognizer can take one at a time.
 *
 * Parakeet decodes a whole buffer at once, so cutting mid-word costs accuracy. A chunk ends
 * at the first stretch of quiet once it is long enough to carry context. If speech runs on
 * (a lecture, a song) it is cut at the quietest moment shortly before the hard limit rather
 * than at the limit itself. Stretches with nothing above the quiet threshold are dropped, so
 * a silent meeting costs no inference.
 *
 * No path aliases or DOM types: the script tests import this file directly.
 */
export interface ChunkerOptions {
  sampleRate: number;
  /** A quiet stretch only ends a chunk once it is at least this long. */
  minMs: number;
  /** No chunk is longer than this. */
  maxMs: number;
  /** How much quiet ends a chunk. */
  silenceMs: number;
  /** Before a hard cut, the quietest point is searched for in this much trailing audio. */
  searchMs: number;
  /** Window used to measure quiet when searching for that point. */
  windowMs: number;
  /** RMS below this counts as quiet. */
  quietRms: number;
}

export const DEFAULT_CHUNKER: ChunkerOptions = {
  sampleRate: 16_000,
  minMs: 6_000,
  maxMs: 25_000,
  silenceMs: 700,
  searchMs: 3_000,
  windowMs: 100,
  quietRms: 0.01,
};

export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / (end - start));
}

export class Chunker {
  private readonly options: ChunkerOptions;
  private buffer: Float32Array;
  private length = 0;
  /** Trailing quiet, in samples. */
  private quiet = 0;
  /** Anything in the buffer rose above the quiet threshold. */
  private voiced = false;

  constructor(options: Partial<ChunkerOptions> = {}) {
    this.options = { ...DEFAULT_CHUNKER, ...options };
    this.buffer = new Float32Array(this.samples(this.options.maxMs));
  }

  /** Adds one block of audio; returns every chunk it completed, usually none. */
  push(block: Float32Array): Float32Array[] {
    const out: Float32Array[] = [];
    let offset = 0;
    while (offset < block.length) {
      const take = Math.min(block.length - offset, this.buffer.length - this.length);
      const part = block.subarray(offset, offset + take);
      this.buffer.set(part, this.length);
      this.length += take;
      offset += take;
      const loud = rms(part) >= this.options.quietRms;
      if (loud) {
        this.voiced = true;
        this.quiet = 0;
      } else {
        this.quiet += take;
      }
      const chunk = this.cut();
      if (chunk) out.push(chunk);
    }
    return out;
  }

  /** Returns whatever is left, or null when it holds nothing worth transcribing. */
  flush(): Float32Array | null {
    const chunk = this.voiced && this.length > 0 ? this.buffer.slice(0, this.length) : null;
    this.clear();
    return chunk;
  }

  /**
   * A copy of the speech held so far, for the provisional line, or null while it is shorter
   * than `minMs` or holds only quiet. The buffer itself is left untouched.
   */
  peek(minMs = 1_000): Float32Array | null {
    if (!this.voiced || this.length < this.samples(minMs)) return null;
    return this.buffer.slice(0, this.length);
  }

  /** Audio held but not yet emitted, in ms. */
  bufferedMs(): number {
    return (this.length / this.options.sampleRate) * 1000;
  }

  private cut(): Float32Array | null {
    const { silenceMs, minMs } = this.options;
    const quietEnough = this.quiet >= this.samples(silenceMs);
    if (!this.voiced) {
      // Pure silence is never kept, so a quiet hour holds no memory and costs no inference.
      if (quietEnough) this.clear();
      return null;
    }
    if (quietEnough && this.length >= this.samples(minMs)) {
      const chunk = this.buffer.slice(0, this.length);
      this.clear();
      return chunk;
    }
    if (this.length >= this.buffer.length) {
      const at = this.quietestPoint();
      const chunk = this.buffer.slice(0, at);
      this.reset(at);
      return chunk;
    }
    return null;
  }

  /** Middle of the quietest window in the trailing search range. */
  private quietestPoint(): number {
    const { searchMs, windowMs } = this.options;
    const win = Math.max(1, this.samples(windowMs));
    const from = Math.max(0, this.length - this.samples(searchMs));
    let best = this.length;
    let bestRms = Infinity;
    for (let start = from; start + win <= this.length; start += Math.max(1, win >> 1)) {
      const value = rms(this.buffer, start, start + win);
      if (value < bestRms) {
        bestRms = value;
        best = start + (win >> 1);
      }
    }
    return Math.max(1, best);
  }

  private clear(): void {
    this.length = 0;
    this.quiet = 0;
    this.voiced = false;
  }

  /** Keeps the audio after `from` as the start of the next chunk. */
  private reset(from: number): void {
    const rest = this.buffer.slice(from, this.length);
    this.buffer.set(rest, 0);
    this.length = rest.length;
    this.voiced = rms(rest) >= this.options.quietRms;
    this.quiet = this.voiced ? 0 : rest.length;
  }

  private samples(ms: number): number {
    return Math.round((this.options.sampleRate * ms) / 1000);
  }
}
