import { z } from 'zod';

export const MODEL_IDS = [
  'parakeet-tdt-0.6b-v2-int8',
  'parakeet-tdt-0.6b-v3-int8',
  'nemotron-speech-streaming-en-0.6b-560ms-int8',
  'kokoro-en-v0_19',
] as const;

export const modelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof modelIdSchema>;

export type ModelKind = 'stt' | 'tts';
export type ModelRuntime = 'sherpa-onnx';

/** A file fetched as-is into the model directory. */
export interface ModelFileArtifact {
  type: 'file';
  /** Path relative to the model directory. Never user supplied. */
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}

/** A .tar.bz2 archive extracted into the model directory. */
export interface ModelArchiveArtifact {
  type: 'archive';
  url: string;
  bytes: number;
  sha256: string;
  /** Top-level directory inside the archive, stripped on extraction. */
  stripPrefix: string;
  /** Files that must exist after extraction. */
  expect: string[];
  /** Trusted extracted-file inventory for archives other than legacy fixtures. */
  files?: { path: string; bytes: number; sha256: string }[];
  /** Maximum decompressed size for archives whose contents are hash-anchored by the archive digest. */
  unpackedBytes?: number;
}

export type ModelArtifact = ModelFileArtifact | ModelArchiveArtifact;

export interface SttVariant {
  kind: 'stt';
  modelType: 'nemo_transducer' | 'nemotron';
  sampleRate: 16000;
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  chunkMs?: 80 | 160 | 560 | 1120;
}

export interface TtsVariant {
  kind: 'tts';
  family: 'kokoro';
  sampleRate: 24000;
  model: string;
  voices: string;
  tokens: string;
  dataDir: string;
}

export interface ModelDescriptor {
  id: ModelId;
  kind: ModelKind;
  runtime: ModelRuntime;
  name: string;
  summary: string;
  languages: string[];
  license: string;
  source: string;
  artifacts: ModelArtifact[];
  layout: SttVariant | TtsVariant;
}

const HF = 'https://huggingface.co';
const parakeetV2 = `${HF}/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8/resolve/main`;
const parakeetV3 = `${HF}/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main`;
const nemotron560 = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';

const parakeetLayout: SttVariant = {
  kind: 'stt',
  modelType: 'nemo_transducer',
  sampleRate: 16000,
  encoder: 'encoder.int8.onnx',
  decoder: 'decoder.int8.onnx',
  joiner: 'joiner.int8.onnx',
  tokens: 'tokens.txt',
};

export const MODEL_CATALOG: Record<ModelId, ModelDescriptor> = {
  'parakeet-tdt-0.6b-v2-int8': {
    id: 'parakeet-tdt-0.6b-v2-int8',
    kind: 'stt',
    runtime: 'sherpa-onnx',
    name: 'Parakeet TDT 0.6B v2',
    summary: 'English speech recognition with punctuation and capitalization.',
    languages: ['en'],
    license: 'CC-BY-4.0',
    source: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2',
    layout: parakeetLayout,
    artifacts: [
      {
        type: 'file',
        path: 'encoder.int8.onnx',
        url: `${parakeetV2}/encoder.int8.onnx`,
        bytes: 652_184_296,
        sha256: 'a32b12d17bbbc309d0686fbbcc2987b5e9b8333a7da83fa6b089f0a2acd651ab',
      },
      {
        type: 'file',
        path: 'decoder.int8.onnx',
        url: `${parakeetV2}/decoder.int8.onnx`,
        bytes: 7_257_753,
        sha256: 'b6bb64963457237b900e496ee9994b59294526439fbcc1fecf705b31a15c6b4e',
      },
      {
        type: 'file',
        path: 'joiner.int8.onnx',
        url: `${parakeetV2}/joiner.int8.onnx`,
        bytes: 1_739_080,
        sha256: '7946164367946e7f9f29a122407c3252b680dbae9a51343eb2488d057c3c43d2',
      },
      {
        type: 'file',
        path: 'tokens.txt',
        url: `${parakeetV2}/tokens.txt`,
        bytes: 9_384,
        sha256: 'ec182b70dd42113aff6c5372c75cac58c952443eb22322f57bbd7f53977d497d',
      },
    ],
  },
  'parakeet-tdt-0.6b-v3-int8': {
    id: 'parakeet-tdt-0.6b-v3-int8',
    kind: 'stt',
    runtime: 'sherpa-onnx',
    name: 'Parakeet TDT 0.6B v3',
    summary: 'Speech recognition for 25 European languages, detected automatically.',
    languages: [
      'bg',
      'hr',
      'cs',
      'da',
      'nl',
      'en',
      'et',
      'fi',
      'fr',
      'de',
      'el',
      'hu',
      'it',
      'lv',
      'lt',
      'mt',
      'pl',
      'pt',
      'ro',
      'ru',
      'sk',
      'sl',
      'es',
      'sv',
      'uk',
    ],
    license: 'CC-BY-4.0',
    source: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3',
    layout: parakeetLayout,
    artifacts: [
      {
        type: 'file',
        path: 'encoder.int8.onnx',
        url: `${parakeetV3}/encoder.int8.onnx`,
        bytes: 652_184_281,
        sha256: 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247',
      },
      {
        type: 'file',
        path: 'decoder.int8.onnx',
        url: `${parakeetV3}/decoder.int8.onnx`,
        bytes: 11_845_275,
        sha256: '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e',
      },
      {
        type: 'file',
        path: 'joiner.int8.onnx',
        url: `${parakeetV3}/joiner.int8.onnx`,
        bytes: 6_355_277,
        sha256: '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3',
      },
      {
        type: 'file',
        path: 'tokens.txt',
        url: `${parakeetV3}/tokens.txt`,
        bytes: 93_939,
        sha256: 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',
      },
    ],
  },
  'nemotron-speech-streaming-en-0.6b-560ms-int8': {
    id: 'nemotron-speech-streaming-en-0.6b-560ms-int8',
    kind: 'stt',
    runtime: 'sherpa-onnx',
    name: 'Nemotron ASR Streaming (560 ms)',
    summary:
      'Low-latency English streaming speech recognition with punctuation and capitalization.',
    languages: ['en'],
    license: 'NVIDIA Open Model License',
    source: 'https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b',
    layout: {
      kind: 'stt',
      modelType: 'nemotron',
      sampleRate: 16000,
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
      chunkMs: 560,
    },
    artifacts: [
      {
        type: 'archive',
        url: `${nemotron560}/sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25.tar.bz2`,
        bytes: 463_945_051,
        sha256: '78e2b79fcf7271553a74402a76b771b09ea40117a39566a79f52235b23db6358',
        stripPrefix: 'sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25',
        expect: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
        files: [
          {
            path: 'encoder.int8.onnx',
            bytes: 652_916_849,
            sha256: '7d932213491ad355c6e5576705dc3494731a52af87d7a1b954559340147909d8',
          },
          {
            path: 'decoder.int8.onnx',
            bytes: 7_257_753,
            sha256: '0be9702c2f427a2b6bb241d298e0d3836a558de1f5b9fd3018f1cce6e2b3fa98',
          },
          {
            path: 'joiner.int8.onnx',
            bytes: 1_735_862,
            sha256: 'a35eac38a22ebceb04d230ed7afe0d68f446ba6914a036b97f14fece95967e23',
          },
          {
            path: 'tokens.txt',
            bytes: 8_952,
            sha256: 'dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff',
          },
          { path: 'README.md', bytes: 158, sha256: '' },
          { path: 'test_wavs/8k.wav', bytes: 77_244, sha256: '' },
          { path: 'test_wavs/0.wav', bytes: 212_044, sha256: '' },
          { path: 'test_wavs/1.wav', bytes: 534_924, sha256: '' },
          { path: 'test_wavs/trans.txt', bytes: 449, sha256: '' },
        ],
        unpackedBytes: 700_000_000,
      },
    ],
  },
  'kokoro-en-v0_19': {
    id: 'kokoro-en-v0_19',
    kind: 'tts',
    runtime: 'sherpa-onnx',
    name: 'Kokoro English v0.19',
    summary: '82M-parameter English speech synthesis with 11 voices.',
    languages: ['en'],
    license: 'Apache-2.0',
    source: 'https://huggingface.co/hexgrad/Kokoro-82M',
    layout: {
      kind: 'tts',
      family: 'kokoro',
      sampleRate: 24000,
      model: 'model.onnx',
      voices: 'voices.bin',
      tokens: 'tokens.txt',
      dataDir: 'espeak-ng-data',
    },
    artifacts: [
      {
        type: 'archive',
        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2',
        bytes: 319_625_534,
        sha256: '912804855a04745fa77a30be545b3f9a5d15c4d66db00b88cbcd4921df605ac7',
        stripPrefix: 'kokoro-en-v0_19',
        expect: ['model.onnx', 'voices.bin', 'tokens.txt', 'espeak-ng-data/phontab'],
      },
    ],
  },
};

/** Kokoro v0.19 speaker ids, in the order stored in voices.bin. */
export const KOKORO_VOICES = [
  { id: '00', sid: 0, name: 'Default (af)', accent: 'American', gender: 'female' },
  { id: '01', sid: 1, name: 'Bella', accent: 'American', gender: 'female' },
  { id: '02', sid: 2, name: 'Nicole', accent: 'American', gender: 'female' },
  { id: '03', sid: 3, name: 'Sarah', accent: 'American', gender: 'female' },
  { id: '04', sid: 4, name: 'Sky', accent: 'American', gender: 'female' },
  { id: '05', sid: 5, name: 'Adam', accent: 'American', gender: 'male' },
  { id: '06', sid: 6, name: 'Michael', accent: 'American', gender: 'male' },
  { id: '07', sid: 7, name: 'Emma', accent: 'British', gender: 'female' },
  { id: '08', sid: 8, name: 'Isabella', accent: 'British', gender: 'female' },
  { id: '09', sid: 9, name: 'George', accent: 'British', gender: 'male' },
  { id: '10', sid: 10, name: 'Lewis', accent: 'British', gender: 'male' },
] as const;

export const voiceIdSchema = z.enum(KOKORO_VOICES.map((v) => v.id) as [string, ...string[]]);
export type VoiceId = (typeof KOKORO_VOICES)[number]['id'];

export const sttModelIdSchema = z.enum([
  'parakeet-tdt-0.6b-v2-int8',
  'parakeet-tdt-0.6b-v3-int8',
  'nemotron-speech-streaming-en-0.6b-560ms-int8',
]);
export const ttsModelIdSchema = z.enum(['kokoro-en-v0_19']);

export function modelBytes(model: ModelDescriptor): number {
  return model.artifacts.reduce((sum, a) => sum + a.bytes, 0);
}

/** The Kokoro speaker id for a configured voice. An unknown voice fails rather than reading as speaker 0. */
export function voiceSid(voiceId: string): number {
  const voice = KOKORO_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`Voice ${voiceId} is not part of Kokoro English v0.19`);
  return voice.sid;
}

/** Download hosts, matched exactly or as a parent domain (covers CDN redirects). */
export const DOWNLOAD_HOST_ALLOWLIST = [
  'huggingface.co',
  'hf.co',
  'github.com',
  'githubusercontent.com',
] as const;

export function isAllowedDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return DOWNLOAD_HOST_ALLOWLIST.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

export type ModelInstallState = 'missing' | 'downloading' | 'verifying' | 'installed' | 'error';
export type ModelLoadState = 'unloaded' | 'loading' | 'loaded' | 'unloading' | 'error';
export type ModelHealth = 'unchecked' | 'healthy' | 'error' | 'unavailable';

export interface ModelStatus {
  id: ModelId;
  kind: ModelKind;
  state: ModelInstallState;
  bytesTotal: number;
  bytesDone: number;
  installed: boolean;
  loaded: boolean;
  active: boolean;
  loadState: ModelLoadState;
  health: ModelHealth;
  runtime?: ModelRuntime;
  version?: string;
  lastUsedAt?: number;
  error?: string;
}
