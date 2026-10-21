export type KokoroDevice = 'wasm' | 'webgpu';

export type KokoroWorkerIn =
  | { type: 'load'; device: KokoroDevice }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'dispose' };

export type KokoroWorkerOut =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; device: KokoroDevice }
  | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; message: string };
