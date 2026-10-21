import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODEL_CATALOG,
  sttModelIdSchema,
  ttsModelIdSchema,
  type ModelId,
} from '@shared/domain/models';
import { createPaths, type WebPaths } from './paths';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface WebConfig {
  host: string;
  port: number;
  password: string;
  paths: WebPaths;
  sttModelId: ModelId;
  ttsModelId: ModelId;
  threads: number;
  downloadModels: boolean;
  fakeSpeech: boolean;
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function modelId(raw: string, kind: 'stt' | 'tts'): ModelId {
  const parsed = kind === 'stt' ? sttModelIdSchema.safeParse(raw) : ttsModelIdSchema.safeParse(raw);
  if (!parsed.success || MODEL_CATALOG[parsed.data].kind !== kind) {
    throw new Error(`INAUDIO_${kind.toUpperCase()}_MODEL is not a supported ${kind} model`);
  }
  return parsed.data;
}

function defaultRoot(): string {
  if (here.endsWith(`${path.sep}src${path.sep}server`)) return path.resolve(here, '../..');
  if (here.endsWith(`${path.sep}out${path.sep}server`)) return path.resolve(here, '../..');
  return path.resolve(here, '../..');
}

export function loadConfig(): WebConfig {
  const root = defaultRoot();
  const threads = Number.parseInt(env('INAUDIO_THREADS', '4'), 10);
  const port = Number.parseInt(env('INAUDIO_PORT', '8080'), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('INAUDIO_PORT is not a valid port');
  if (!Number.isInteger(threads) || threads < 1 || threads > 16) throw new Error('INAUDIO_THREADS must be 1-16');
  return {
    host: env('INAUDIO_HOST', '0.0.0.0'),
    port,
    password: process.env.INAUDIO_PASSWORD ?? '',
    paths: createPaths(
      env('INAUDIO_DATA', path.join(os.homedir(), '.inaudio-web')),
      env('INAUDIO_ASSETS', path.join(root, 'assets')),
      env('INAUDIO_WEB_ROOT', path.join(root, 'out/web')),
    ),
    sttModelId: modelId(env('INAUDIO_STT_MODEL', 'parakeet-tdt-0.6b-v2-int8'), 'stt'),
    ttsModelId: modelId(env('INAUDIO_TTS_MODEL', 'kokoro-en-v0_19'), 'tts'),
    threads,
    downloadModels: env('INAUDIO_DOWNLOAD_MODELS', '1') !== '0',
    fakeSpeech: env('INAUDIO_FAKE_SPEECH', '') === '1',
  };
}
