import type { SttCleanup } from '@shared/worker/protocol';
import { loadSherpa } from './sherpa';

/** Silero VAD reads 512-sample windows at 16 kHz. */
const VAD_WINDOW = 512;
/** Kept on both sides of each speech segment so word edges are not clipped. */
const PAD_MS = 200;

interface SpeechSegment {
  start: number;
  samples: Float32Array;
}

interface SherpaVad {
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  front(enableExternalBuffer?: boolean): SpeechSegment;
  pop(): void;
  flush(): void;
  reset(): void;
}

interface SherpaDenoiser {
  run(input: { samples: Float32Array; sampleRate: number; enableExternalBuffer?: boolean }): {
    samples: Float32Array;
    sampleRate: number;
  };
}

interface CleanupModule {
  Vad: new (config: unknown, bufferSizeInSeconds: number) => SherpaVad;
  OfflineSpeechDenoiser: new (config: unknown) => SherpaDenoiser;
}

let vad: { path: string; engine: SherpaVad } | null = null;
let denoiser: { path: string; engine: SherpaDenoiser } | null = null;

function sherpa(): CleanupModule {
  return loadSherpa() as unknown as CleanupModule;
}

function vadFor(model: string): SherpaVad {
  if (vad?.path !== model) {
    const engine = new (sherpa().Vad)(
      {
        sileroVad: {
          model,
          threshold: 0.5,
          minSilenceDuration: 0.3,
          minSpeechDuration: 0.25,
          windowSize: VAD_WINDOW,
          maxSpeechDuration: 30,
        },
        sampleRate: 16_000,
        numThreads: 1,
        provider: 'cpu',
        debug: 0,
      },
      // A live chunk is at most 30 s; the buffer holds one with room to spare.
      40,
    );
    vad = { path: model, engine };
  }
  return vad.engine;
}

function denoiserFor(model: string): SherpaDenoiser {
  if (denoiser?.path !== model) {
    const engine = new (sherpa().OfflineSpeechDenoiser)({
      model: { gtcrn: { model }, numThreads: 1, provider: 'cpu', debug: 0 },
    });
    denoiser = { path: model, engine };
  }
  return denoiser.engine;
}

/**
 * Keeps only the stretches the voice detector hears speech in, each padded a little, joined
 * in order. Returns an empty array when there is no speech at all, so nothing is decoded.
 */
export function speechOnly(samples: Float32Array, sampleRate: number, model: string): Float32Array {
  const detector = vadFor(model);
  detector.reset();
  for (let offset = 0; offset + VAD_WINDOW <= samples.length; offset += VAD_WINDOW) {
    detector.acceptWaveform(samples.subarray(offset, offset + VAD_WINDOW));
  }
  detector.flush();
  const pad = Math.round((PAD_MS / 1000) * sampleRate);
  const spans: [number, number][] = [];
  while (!detector.isEmpty()) {
    const segment = detector.front(false);
    const start = Math.max(0, segment.start - pad);
    const end = Math.min(samples.length, segment.start + segment.samples.length + pad);
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
    detector.pop();
  }
  detector.reset();
  const total = spans.reduce((sum, [start, end]) => sum + (end - start), 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const [start, end] of spans) {
    out.set(samples.subarray(start, end), at);
    at += end - start;
  }
  return out;
}

export function denoise(samples: Float32Array, sampleRate: number, model: string): Float32Array {
  const result = denoiserFor(model).run({ samples, sampleRate, enableExternalBuffer: false });
  // GTCRN works at 16 kHz, the same rate every capture path already delivers.
  return result.sampleRate === sampleRate ? result.samples : samples;
}

/** Applies whatever cleanup the request names, in order: voice detection, then denoising. */
export function clean(samples: Float32Array, sampleRate: number, cleanup: SttCleanup | undefined): Float32Array {
  let out = samples;
  if (cleanup?.vad) out = speechOnly(out, sampleRate, cleanup.vad);
  if (cleanup?.denoiser && out.length > 0) out = denoise(out, sampleRate, cleanup.denoiser);
  return out;
}
