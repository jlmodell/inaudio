import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeWav } from '../src/server/wav.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const serverJs = path.join(root, 'out/server/index.mjs');

function skipWithoutBuild() {
  if (!fs.existsSync(serverJs)) {
    test('web server HTTP (skipped until npm run build:web)', { skip: true }, () => undefined);
    return true;
  }
  return false;
}

function tone(seconds = 0.4, sampleRate = 16_000) {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.4;
  }
  return encodeWav(samples, sampleRate);
}

async function startServer() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'inaudio-web-'));
  const port = 18_000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [serverJs], {
    cwd: root,
    env: {
      ...process.env,
      INAUDIO_FAKE_SPEECH: '1',
      INAUDIO_PASSWORD: 'test-pass',
      INAUDIO_DATA: data,
      INAUDIO_PORT: String(port),
      INAUDIO_HOST: '127.0.0.1',
      INAUDIO_WEB_ROOT: path.join(root, 'out/web'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 15_000);
    const onData = (chunk) => {
      if (String(chunk).includes('Inaudio web is on')) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}`));
    });
  });
  void ready;
  return {
    port,
    async close() {
      child.kill('SIGTERM');
      await fs.promises.rm(data, { recursive: true, force: true });
    },
  };
}

async function waitReady(base, headers, ms = 5_000) {
  const deadline = Date.now() + ms;
  let last = { ready: false };
  while (Date.now() < deadline) {
    last = await fetch(`${base}/api/status`, { headers }).then((r) => r.json());
    if (last.ready) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Speech engine was not ready: ${JSON.stringify(last)}`);
}

if (!skipWithoutBuild()) {
  test('password-set first visit returns status for the login page', async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.port}`;

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Inaudio/);

    const status = await fetch(`${base}/api/status`).then(async (response) => {
      assert.equal(response.status, 200);
      return response.json();
    });
    assert.equal(status.authRequired, true);
    assert.equal(status.authenticated, false);
    assert.equal(typeof status.ready, 'boolean');

    const history = await fetch(`${base}/api/history`);
    assert.equal(history.status, 401);
  });

  test('web server transcribes a clip and protects routes', async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.port}`;

    const firstVisit = await fetch(`${base}/api/status`);
    assert.equal(firstVisit.status, 200);
    const firstStatus = await firstVisit.json();
    assert.equal(firstStatus.authRequired, true);
    assert.equal(firstStatus.authenticated, false);

    const locked = await fetch(`${base}/api/history`);
    assert.equal(locked.status, 401);

    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-pass' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie);

    const headers = { Cookie: cookie.split(';', 1)[0] ?? '' };
    const status = await waitReady(base, headers);
    assert.equal(status.authenticated, true);

    const transcribed = await fetch(`${base}/api/transcribe`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'audio/wav' },
      body: tone(),
    });
    assert.equal(transcribed.status, 200);
    const body = await transcribed.json();
    assert.equal(body.text, 'hello from inaudio');
    assert.ok(body.transcript?.id);

    const history = await fetch(`${base}/api/history`, { headers }).then((r) => r.json());
    assert.equal(history.total, 1);
    assert.equal(history.items[0].text, 'hello from inaudio');

    const page = await fetch(`${base}/`, { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Inaudio/);
  });
}
