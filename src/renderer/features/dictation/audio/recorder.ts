import type { MicProcessing } from '@shared/domain/capture';
import workletUrl from './capture.worklet.ts?worker&url';
import { micConstraints } from './mic-constraints';

export const TARGET_RATE = 16_000;

export interface RecorderOptions {
  deviceId: string;
  gain: number;
  /** Chromium's voice processing; all on unless the audio settings say otherwise. */
  processing?: MicProcessing;
  onLevel(level: number): void;
  /** Each 16 kHz chunk, for a live transcript that cannot wait until stop. */
  onChunk?(chunk: Float32Array): void;
}

const DEFAULT_PROCESSING: MicProcessing = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceIsolation: false,
};

/**
 * Captures microphone audio as 16 kHz mono float32. The AudioContext runs at
 * 16 kHz so Chromium resamples the device stream for us.
 */
export class Recorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private startedAt = 0;

  get elapsedMs(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  async start({ deviceId, gain, processing = DEFAULT_PROCESSING, onLevel, onChunk }: RecorderOptions): Promise<void> {
    this.chunks = [];
    this.length = 0;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(deviceId, processing) });
    try {
      this.context = new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' });
      await this.context.audioWorklet.addModule(workletUrl);
      const source = this.context.createMediaStreamSource(this.stream);
      const gainNode = new GainNode(this.context, { gain });
      this.node = new AudioWorkletNode(this.context, 'inaudio-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
      this.node.port.onmessage = ({ data }: MessageEvent<{ chunk: Float32Array; peak: number }>) => {
        this.chunks.push(data.chunk);
        this.length += data.chunk.length;
        onLevel(Math.min(1, data.peak));
        onChunk?.(data.chunk);
      };
      source.connect(gainNode).connect(this.node);
      this.startedAt = performance.now();
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  /** Stops capture and returns the recorded samples. */
  async stop(): Promise<Float32Array> {
    const out = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    await this.dispose();
    return out;
  }

  async dispose(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.node = null;
    this.stream = null;
    this.context = null;
    this.chunks = [];
    this.length = 0;
    this.startedAt = 0;
  }
}

/** Leading/trailing silence trimmed, but keep a short pad so words are not clipped. */
export function trimSilence(samples: Float32Array, threshold = 0.01, padMs = 200): Float32Array {
  const pad = Math.round((TARGET_RATE * padMs) / 1000);
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start] ?? 0) < threshold) start++;
  while (end > start && Math.abs(samples[end] ?? 0) < threshold) end--;
  if (start >= end) return new Float32Array(0);
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}
