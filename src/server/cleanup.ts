import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const MODELS = {
  vad: {
    file: 'silero_vad.onnx',
    bytes: 643_854,
    sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
  },
  denoiser: {
    file: 'gtcrn_simple.onnx',
    bytes: 535_638,
    sha256: 'e77603ac0c23dac3227dd2d7135b3a585cbee2679048aecfa886657d3ae1b534',
  },
  punct: {
    file: 'punct_en.int8.onnx',
    bytes: 7_490_500,
    sha256: '9d611f445fe4a46186080fe161be6059d87d72eb88d3a8cb00c1a06e83a6067e',
  },
  punctVocab: {
    file: 'punct_en.bpe.vocab',
    bytes: 149_430,
    sha256: 'e118b7ad88c54db562517df49e1cffd4836d166c34fb190fd311d7f34eb238f5',
  },
} as const;

type CleanupName = keyof typeof MODELS;

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

/** Same bundled cleanup models as the desktop app, verified before a path is handed to sherpa. */
export class CleanupModels {
  private readonly verified: Partial<Record<CleanupName, string>> = {};

  constructor(private readonly root: string) {}

  async verify(): Promise<void> {
    await Promise.all(
      (Object.keys(MODELS) as CleanupName[]).map(async (name) => {
        const expected = MODELS[name];
        const file = path.join(this.root, expected.file);
        try {
          const actual = await hashFile(file, expected.bytes);
          if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
            throw new Error('Model file does not match its pinned hash');
          }
          this.verified[name] = file;
        } catch {
          delete this.verified[name];
        }
      }),
    );
  }

  path(name: CleanupName): string | undefined {
    return this.verified[name];
  }
}
