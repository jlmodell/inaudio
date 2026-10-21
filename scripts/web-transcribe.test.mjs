import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeWav } from '../src/server/wav.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const modelDir = process.env.INAUDIO_DATA
  ? path.join(process.env.INAUDIO_DATA, 'models/parakeet-tdt-0.6b-v2-int8')
  : path.join(osData(), 'models/parakeet-tdt-0.6b-v2-int8');

function osData() {
  return process.env.HOME
    ? path.join(process.env.HOME, '.inaudio-web')
    : path.join(root, '.inaudio-web');
}

const installed = fs.existsSync(path.join(modelDir, 'encoder.int8.onnx'));
const serverJs = path.join(root, 'out/server/index.mjs');

test(
  'real sherpa-onnx transcribe of a speech clip',
  { skip: !installed || !fs.existsSync(serverJs) },
  async () => {
    const { spawn } = await import('node:child_process');
    const os = await import('node:os');
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'inaudio-real-'));
    await fs.promises.cp(path.dirname(modelDir), path.join(data, 'models'), { recursive: true });
    const port = 19_000 + Math.floor(Math.random() * 500);
    const child = spawn(process.execPath, [serverJs], {
      cwd: root,
      env: {
        ...process.env,
        INAUDIO_DATA: data,
        INAUDIO_PORT: String(port),
        INAUDIO_HOST: '127.0.0.1',
        INAUDIO_PASSWORD: '',
        INAUDIO_DOWNLOAD_MODELS: '0',
        INAUDIO_WEB_ROOT: path.join(root, 'out/web'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await waitFor(child, 'Inaudio web is on', 30_000);
      await waitReady(port, 120_000);
      const sample = speechClip();
      const response = await fetch(`http://127.0.0.1:${port}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: sample,
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(typeof body.text === 'string');
    } finally {
      child.kill('SIGTERM');
      await fs.promises.rm(data, { recursive: true, force: true });
    }
  },
);

function speechClip() {
  // A short voiced-like sweep. Real words need a real recording; this still
  // exercises the loaded recognizer end to end.
  const sampleRate = 16_000;
  const samples = new Float32Array(sampleRate * 2);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] = Math.sin(2 * Math.PI * (180 + 40 * t) * t) * 0.35;
  }
  return encodeWav(samples, sampleRate);
}

function waitFor(child, needle, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for server')), ms);
    const onData = (chunk) => {
      if (String(chunk).includes(needle)) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`exited ${code}`));
    });
  });
}

async function waitReady(port, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const status = await fetch(`http://127.0.0.1:${port}/api/status`).then((r) => r.json());
      if (status.ready) return;
    } catch {
      /* still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('model did not become ready');
}
