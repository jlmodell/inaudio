import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const workerJs = path.join(root, 'out/server/inference-worker.mjs');

const ttsLayout = {
  kind: 'tts',
  family: 'kokoro',
  sampleRate: 24_000,
  model: 'model.onnx',
  voices: 'voices.bin',
  tokens: 'tokens.txt',
  dataDir: 'espeak-ng-data',
};

function skipWithoutBuild() {
  if (fs.existsSync(workerJs)) return false;
  test('built inference worker (skipped until npm run build:web)', { skip: true }, () => undefined);
  return true;
}

function startWorker() {
  const worker = new Worker(workerJs);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('inference worker did not start')), 15_000);
    const onMessage = (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timer);
        worker.off('message', onMessage);
        resolve(undefined);
      }
    };
    worker.on('message', onMessage);
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return { worker, ready };
}

function request(worker, input) {
  const id = Math.floor(Math.random() * 1_000_000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out (${input.type})`)), 30_000);
    const onMessage = (message) => {
      if (!message || message.id !== id) return;
      clearTimeout(timer);
      worker.off('message', onMessage);
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    };
    worker.on('message', onMessage);
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.postMessage({ ...input, id });
  });
}

function assertNotFilename(error) {
  assert.doesNotMatch(
    error instanceof Error ? error.message : String(error),
    /__filename is not defined/,
  );
  return true;
}

if (!skipWithoutBuild()) {
  test('built ESM worker can resolve sherpa without a CJS __filename', () => {
    const source = fs.readFileSync(workerJs, 'utf8');
    assert.match(source, /createRequire\(/);
    assert.match(source, /import\.meta\.url/);
  });

  test('built worker can load sherpa for TTS without __filename', async (t) => {
    const { worker, ready } = startWorker();
    t.after(() => worker.terminate());
    await ready;
    const ping = await request(worker, { type: 'ping' });
    assert.equal(typeof ping.memoryRss, 'number');

    const missing = path.join(root, 'out', 'missing-sherpa-models');
    await assert.rejects(
      request(worker, {
        type: 'tts:load',
        modelId: 'kokoro-en-v0_19',
        dir: missing,
        layout: ttsLayout,
        threads: 1,
      }),
      assertNotFilename,
    );
  });
}
