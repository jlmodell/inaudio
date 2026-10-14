import path from 'node:path';
import type { TtsVariant } from '@shared/domain/models';
import type { TtsResult } from '@shared/worker/protocol';
import { loadSherpa, type SherpaTts } from '../sherpa';
import type { TextToSpeechEngine } from '../types';

/** Kokoro (espeak-ng phonemes + ONNX acoustic model) through sherpa-onnx. */
export class KokoroEngine implements TextToSpeechEngine {
  private constructor(
    readonly modelId: string,
    private readonly tts: SherpaTts,
  ) {}

  static async create(modelId: string, dir: string, layout: TtsVariant, threads: number) {
    const sherpa = loadSherpa();
    const tts = await sherpa.OfflineTts.createAsync({
      model: {
        kokoro: {
          model: path.join(dir, layout.model),
          voices: path.join(dir, layout.voices),
          tokens: path.join(dir, layout.tokens),
          dataDir: path.join(dir, layout.dataDir),
        },
        numThreads: threads,
        provider: 'cpu',
        debug: 0,
      },
      maxNumSentences: 1,
    });
    return new KokoroEngine(modelId, tts);
  }

  async speak(text: string, sid: number, speed: number): Promise<TtsResult> {
    const started = performance.now();
    if (!Number.isInteger(sid) || sid < 0 || sid >= this.tts.numSpeakers) {
      throw new Error(`Speaker ${sid} is not in this model (${this.tts.numSpeakers} speakers)`);
    }
    // Electron's V8 memory cage rejects external ArrayBuffers, so the addon must copy.
    const audio = await this.tts.generateAsync({ text, sid, speed, enableExternalBuffer: false });
    return {
      samples: audio.samples,
      sampleRate: audio.sampleRate,
      inferenceMs: Math.round(performance.now() - started),
    };
  }

  dispose(): void {
    // Released by the addon's finalizers.
  }
}
