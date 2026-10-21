import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import bz2 from 'unbzip2-stream';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const require = createRequire(import.meta.url);
const electron = require('electron');

const ARTIFACT = {
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2',
  sha256: '912804855a04745fa77a30be545b3f9a5d15c4d66db00b88cbcd4921df605ac7',
  expect: ['model.onnx', 'voices.bin', 'tokens.txt', 'espeak-ng-data/phontab'],
};

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
  if (existsSync(asar)) return path.join(asar, '.vite', 'build', 'inference-worker.js');
  const unpacked = path.join(resources, 'app', '.vite', 'build', 'inference-worker.js');
  if (existsSync(unpacked)) return unpacked;
  throw new Error(`Packaged inference worker not found under ${resources}`);
}

function cacheRoot() {
  return process.env.INAUDIO_SMOKE_CACHE || path.join(os.homedir(), '.cache', 'inaudio-smoke-models');
}

function modelReady(dir) {
  return ARTIFACT.expect.every((name) => existsSync(path.join(dir, name)));
}

async function downloadArchive(url, destination, expectedSha256) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download failed: ${response.status} ${url}`);
  const hash = createHash('sha256');
  const file = createWriteStream(destination);
  let bytes = 0;
  let lastBucket = -1;
  for await (const chunk of response.body) {
    hash.update(chunk);
    bytes += chunk.length;
    const bucket = Math.floor(bytes / (32 * 1024 * 1024));
    if (bucket !== lastBucket) {
      lastBucket = bucket;
      process.stdout.write(`Downloading Kokoro: ${(bytes / 1_000_000).toFixed(0)} MB\n`);
    }
    if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve));
  }
  await new Promise((resolve, reject) => {
    file.end(resolve);
    file.on('error', reject);
  });
  const digest = hash.digest('hex');
  if (digest !== expectedSha256) throw new Error(`Kokoro archive hash ${digest}, expected ${expectedSha256}`);
}

async function extractArchive(archive, destination) {
  await pipeline(createReadStream(archive), bz2(), tar.x({ cwd: destination, strip: 1 }));
}

async function ensureModel() {
  const cache = cacheRoot();
  const dir = path.join(cache, 'models', 'kokoro-en-v0_19');
  const downloads = path.join(cache, 'downloads');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(downloads, { recursive: true, mode: 0o700 });
  if (modelReady(dir)) return dir;
  process.stdout.write('Installing Kokoro English v0.19 for the packaged TTS smoke test\n');
  const archive = path.join(downloads, 'kokoro-en-v0_19.tar.bz2');
  await downloadArchive(ARTIFACT.url, archive, ARTIFACT.sha256);
  await extractArchive(archive, dir);
  if (!modelReady(dir)) throw new Error(`Kokoro extract missed files in ${dir}`);
  await fs.rm(archive, { force: true });
  return dir;
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
if (!existsSync(appDir)) {
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
