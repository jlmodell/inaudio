import { z } from 'zod';

export const MODEL_IDS = ['kokoro-en-v0_19'] as const;

export const modelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof modelIdSchema>;

export type ModelKind = 'tts';
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
  layout: TtsVariant;
}

export const MODEL_CATALOG: Record<ModelId, ModelDescriptor> = {
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
    return DOWNLOAD_HOST_ALLOWLIST.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
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
