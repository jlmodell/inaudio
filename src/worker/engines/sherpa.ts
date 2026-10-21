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

/** CJS Electron workers get this from Node's wrapper; ESM workers do not. */
declare const __filename: string;

/**
 * createRequire needs a real file URL or absolute path. The Electron Forge
 * worker is CJS: Vite leaves `import.meta.url` as undefined there, which is
 * the packaged "filename … Received undefined" crash. The web worker is ESM
 * and has a real `import.meta.url`.
 */
export function requireAnchor(): string {
  try {
    if (typeof __filename === 'string' && __filename.length > 0) return __filename;
  } catch {
    // ESM: __filename is not defined
  }
  if (typeof import.meta.url === 'string' && import.meta.url.length > 0) return import.meta.url;
  throw new Error('Unable to resolve the sherpa-onnx runtime from this process.');
}

let cached: SherpaModule | null = null;

export function loadSherpa(): SherpaModule {
  if (!cached) {
    const require = createRequire(requireAnchor());
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
