import type { VoiceId } from '@shared/domain/models';
import { clampAhead, DEFAULT_READ_ALOUD_BUFFER } from '@shared/read-aloud/ahead';
import type { SentenceTiming } from '@shared/web/read-aloud-engine';
import { api } from './api';
import { AudioQueue, type PcmChunk } from './tts/audio-queue';

type SpeakHooks = {
  onPlaying(): void;
  onEnded(): void;
  onError(error: Error): void;
  onWord?(word: string): void;
  onTiming?(timing: SentenceTiming): void;
};

/**
 * Streams sentence WAVs from the server, decodes them, and hands them to
 * AudioQueue so playback can wait for a buffer and stay scheduled back-to-back.
 */
export class SpeakQueue {
  private audio: AudioQueue | null = null;
  private abort: AbortController | null = null;
  private stopped = false;

  async start(
    input: { text: string; voiceId: VoiceId; speed: number },
    hooks: SpeakHooks,
    options: { buffer?: number } = {},
  ): Promise<void> {
    this.stop();
    this.stopped = false;
    this.abort = new AbortController();
    const queue = new AudioQueue();
    this.audio = queue;
    await queue.start(this.chunks(input), hooks, { buffer: clampAhead(options.buffer ?? DEFAULT_READ_ALOUD_BUFFER) });
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    this.audio?.resume();
  }

  stop(): void {
    this.stopped = true;
    this.abort?.abort();
    this.abort = null;
    this.audio?.stop();
    this.audio = null;
  }

  private async *chunks(input: { text: string; voiceId: VoiceId; speed: number }): AsyncGenerator<PcmChunk> {
    for await (const chunk of api.speakStream(input, this.abort?.signal)) {
      if (this.stopped) return;
      const pcm = pcmFromWav(chunk.wav);
      yield {
        index: chunk.index,
        samples: pcm.samples,
        sampleRate: chunk.sampleRate || pcm.sampleRate,
        text: chunk.text,
        generateMs: chunk.generateMs,
      };
    }
  }
}

/** 16-bit mono PCM WAV, the format `/api/speak/stream` writes. */
function pcmFromWav(wav: string): { samples: Float32Array; sampleRate: number } {
  const binary = atob(wav);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Could not read that aloud');
  }
  const sampleRate = view.getUint32(24, true);
  const frames = Math.floor((bytes.byteLength - 44) / 2);
  if (frames < 1) throw new Error('Could not read that aloud');
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) samples[i] = view.getInt16(44 + i * 2, true) / 0x8000;
  return { samples, sampleRate };
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}
