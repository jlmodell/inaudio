import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MODEL_CATALOG } from '../src/shared/domain/models.ts';
import { ModelStore } from '../src/server/model-store.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const require = createRequire(import.meta.url);
const electron = require('electron');

function packagedApp() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return path.join(root, 'out', `Inaudio-${process.platform}-${arch}`);
}

function resourcesDir(appDir) {
  return process.platform === 'darwin'
    ? path.join(appDir, 'Inaudio.app', 'Contents', 'Resources')
    : path.join(appDir, 'resources');
}

function findWorker(appDir) {
  const resources = resourcesDir(appDir);
  const asar = path.join(resources, 'app.asar');
  if (fs.existsSync(asar)) return path.join(asar, '.vite', 'build', 'inference-worker.js');
  const unpacked = path.join(resources, 'app', '.vite', 'build', 'inference-worker.js');
  if (fs.existsSync(unpacked)) return unpacked;
  throw new Error(`Packaged inference worker not found under ${resources}`);
}

function cacheRoot() {
  return process.env.INAUDIO_SMOKE_CACHE || path.join(os.homedir(), '.cache', 'inaudio-smoke-models');
}

async function ensureModel() {
  const cache = cacheRoot();
  const models = path.join(cache, 'models');
  const downloads = path.join(cache, 'downloads');
  fs.mkdirSync(models, { recursive: true, mode: 0o700 });
  fs.mkdirSync(downloads, { recursive: true, mode: 0o700 });
  const store = new ModelStore(models, downloads);
  store.on('progress', (progress) => {
    if (progress.state === 'downloading' && progress.bytesTotal) {
      const pct = Math.floor((progress.bytesDone / progress.bytesTotal) * 100);
      if (pct % 10 === 0) process.stdout.write(`Downloading ${progress.id}: ${pct}%\n`);
    }
  });
  const id = 'kokoro-en-v0_19';
  if (!(await store.discover(id))) {
    process.stdout.write(`Installing ${MODEL_CATALOG[id].name} for the packaged TTS smoke test\n`);
    await store.ensure(id);
  }
  return store.directory(id);
}

function runElectron(worker, models) {
  const main = path.join(root, 'scripts', 'desktop-tts-smoke-main.cjs');
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      INAUDIO_SMOKE_WORKER: worker,
      INAUDIO_SMOKE_MODELS: models,
      INAUDIO_SMOKE_TEXT: 'The quick brown fox jumps over the lazy dog.',
      INAUDIO_SMOKE_SID: '4',
      INAUDIO_SMOKE_SPEED: '2',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [main], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      out += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      err += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`packaged TTS smoke failed (${code}): ${err || out}`));
    });
  });
}

const appDir = packagedApp();
if (!fs.existsSync(appDir)) {
  throw new Error(`Packaged app not found at ${appDir}. Run npm run package first.`);
}
const worker = findWorker(appDir);
process.stdout.write(`Using packaged worker ${worker}\n`);
const models = await ensureModel();
const output = await runElectron(worker, models);
if (!/"ok":true/.test(output) && !/"ok": true/.test(output)) {
  throw new Error('packaged TTS smoke did not report success');
}
process.stdout.write('Packaged TTS smoke passed\n');
