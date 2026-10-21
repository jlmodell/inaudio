import { createRequire } from 'node:module';

/**
 * sherpa-onnx-node ships prebuilt native addons per platform. It is loaded
 * lazily so the worker can boot and report errors even if the addon fails.
 */
export interface SherpaModule {
  OfflineRecognizer: {
    createAsync(config: unknown): Promise<SherpaRecognizer>;
  };
  OfflineTts: {
    createAsync(config: unknown): Promise<SherpaTts>;
  };
  OnlineRecognizer: new (config: unknown) => SherpaOnlineRecognizer;
}

export interface SherpaStream {
  acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
}

export interface SherpaRecognizer {
  createStream(): SherpaStream;
  decodeAsync(stream: SherpaStream): Promise<{ text: string; lang?: string }>;
}

export interface SherpaOnlineStream {
  acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
}

export interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream;
  isReady(stream: SherpaOnlineStream): boolean;
  decode(stream: SherpaOnlineStream): void;
  getResult(stream: SherpaOnlineStream): { text: string; lang?: string };
}

export interface SherpaTts {
  numSpeakers: number;
  sampleRate: number;
  generateAsync(input: {
    text: string;
    sid: number;
    speed: number;
    enableExternalBuffer?: boolean;
  }): Promise<{
    samples: Float32Array;
    sampleRate: number;
  }>;
}

let cached: SherpaModule | null = null;

export function loadSherpa(): SherpaModule {
  if (!cached) {
    // Electron's worker bundle is CJS (__filename). The web server worker is ESM,
    // so createRequire must use import.meta.url (Vite rewrites it in the CJS build).
    const require = createRequire(import.meta.url);
    try {
      cached = require('sherpa-onnx-node') as SherpaModule;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to load the bundled sherpa-onnx runtime. Reinstall the app so its platform native module is present. ${detail}`,
        { cause: error },
      );
    }
  }
  return cached;
}
