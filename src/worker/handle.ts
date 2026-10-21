import type { WorkerRequest } from '@shared/worker/protocol';
import { KokoroEngine } from './engines/tts/kokoro-engine';
import type { TextToSpeechEngine } from './engines/types';

let tts: TextToSpeechEngine | null = null;

/** One request at a time so a long synthesis never interleaves with a model swap. */
export async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'tts:load':
      tts?.dispose();
      tts = null;
      tts = await KokoroEngine.create(request.modelId, request.dir, request.layout, request.threads);
      return { modelId: request.modelId };
    case 'tts:speak':
      if (!tts) throw new Error('No text-to-speech model is loaded');
      return tts.speak(request.text, request.sid, request.speed);
    case 'unload':
      tts?.dispose();
      tts = null;
      return null;
    case 'ping':
      return {
        loadedTts: tts?.modelId,
        memoryRss: process.memoryUsage().rss,
      };
  }
}
