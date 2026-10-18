import { app } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { CleanupModelsStatus } from '@shared/domain/system';

/**
 * The small models behind speech cleanup and punctuation. They ship with the app (MIT, from the
 * sherpa-onnx releases) so cleanup works offline from the first launch, and each is checked
 * against its pinned hash before the worker is given its path.
 */
const MODELS = {
  vad: { file: 'silero_vad.onnx', bytes: 643_854, sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6' },
  denoiser: { file: 'gtcrn_simple.onnx', bytes: 535_638, sha256: 'e77603ac0c23dac3227dd2d7135b3a585cbee2679048aecfa886657d3ae1b534' },
  punct: { file: 'punct_en.int8.onnx', bytes: 7_490_500, sha256: '9d611f445fe4a46186080fe161be6059d87d72eb88d3a8cb00c1a06e83a6067e' },
  punctVocab: { file: 'punct_en.bpe.vocab', bytes: 149_430, sha256: 'e118b7ad88c54db562517df49e1cffd4836d166c34fb190fd311d7f34eb238f5' },
} as const;

type CleanupModel = keyof typeof MODELS;

/** Models ship as an extra resource in packaged builds and live in assets/ during development. */
function modelPath(name: CleanupModel): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(app.getAppPath(), 'assets', 'models');
  return path.join(root, MODELS[name].file);
}

async function hashFile(file: string, limit: number): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Model file is larger than expected');
    hash.update(chunk);
  }
  return { sha256: hash.digest('hex'), bytes };
}

/**
 * Verifies each bundled model once, off the status path. `paths()` and `status()` only read
 * the in-memory result, so the main process never touches the disk to report them.
 */
export class CleanupModels {
  private verified: Partial<Record<CleanupModel, string>> = {};
  private failed: Partial<Record<CleanupModel, string>> = {};
  private checking: Promise<void> | null = null;

  /** Checks both files. Safe to call repeatedly; the work happens once. */
  verify(): Promise<void> {
    this.checking ??= Promise.all(
      (Object.keys(MODELS) as CleanupModel[]).map(async (name) => {
        const expected = MODELS[name];
        const file = modelPath(name);
        try {
          const actual = await hashFile(file, expected.bytes);
          if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
            throw new Error('Model file does not match its pinned hash');
          }
          this.verified[name] = file;
        } catch (error) {
          this.failed[name] = error instanceof Error ? error.message : String(error);
        }
      }),
    ).then(() => undefined);
    return this.checking;
  }

  /** The verified path for a model, or undefined when it is missing, altered or unchecked. */
  path(name: CleanupModel): string | undefined {
    return this.verified[name];
  }

  status(): CleanupModelsStatus {
    const state = (name: CleanupModel) =>
      this.verified[name] ? 'verified' : this.failed[name] ? 'missing' : 'unchecked';
    const punct = state('punct') === 'verified' && state('punctVocab') === 'verified' ? 'verified' : state('punct') === 'missing' || state('punctVocab') === 'missing' ? 'missing' : 'unchecked';
    return { vad: state('vad'), denoiser: state('denoiser'), punct };
  }
}
