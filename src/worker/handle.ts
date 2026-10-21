import type { WorkerRequest } from '@shared/worker/protocol';
import { ParakeetEngine } from './engines/stt/parakeet-engine';
import { NemotronEngine } from './engines/stt/nemotron-engine';
import { KokoroEngine } from './engines/tts/kokoro-engine';
import { clean, punctuate } from './engines/cleanup';
import type { SpeechToTextEngine, TextToSpeechEngine } from './engines/types';

let stt: SpeechToTextEngine | null = null;
let tts: TextToSpeechEngine | null = null;

/** One request at a time so a long transcription never interleaves with a model swap. */
export async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'stt:load':
      stt?.dispose();
      stt = null;
      stt =
        request.layout.modelType === 'nemotron'
          ? NemotronEngine.create(request.modelId, request.dir, request.layout, request.threads)
          : await ParakeetEngine.create(
              request.modelId,
              request.dir,
              request.layout,
              request.threads,
            );
      return { modelId: request.modelId };
    case 'tts:load':
      tts?.dispose();
      tts = null;
      tts = await KokoroEngine.create(
        request.modelId,
        request.dir,
        request.layout,
        request.threads,
      );
      return { modelId: request.modelId };
    case 'stt:transcribe': {
      if (!stt) throw new Error('No speech-to-text model is loaded');
      if (!request.cleanup) return stt.transcribe(request.samples, request.sampleRate);
      const started = performance.now();
      const samples = clean(request.samples, request.sampleRate, request.cleanup);
      // Nothing but noise: no words to find, so the recognizer is not run at all.
      if (!samples.length)
        return { text: '', language: '', inferenceMs: Math.round(performance.now() - started) };
      const result = await stt.transcribe(samples, request.sampleRate);
      return { ...result, inferenceMs: Math.round(performance.now() - started) };
    }
    case 'text:punct':
      return punctuate(request.text, request.model, request.vocab);
    case 'tts:speak':
      if (!tts) throw new Error('No text-to-speech model is loaded');
      return tts.speak(request.text, request.sid, request.speed);
    case 'unload':
      if (request.kind !== 'tts') {
        stt?.dispose();
        stt = null;
      }
      if (request.kind !== 'stt') {
        tts?.dispose();
        tts = null;
      }
      return null;
    case 'ping':
      return {
        loadedStt: stt?.modelId,
        loadedTts: tts?.modelId,
        memoryRss: process.memoryUsage().rss,
      };
  }
}
