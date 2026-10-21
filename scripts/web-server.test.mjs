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
  const logs = [];
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
      const text = String(chunk);
      logs.push(text);
      if (text.includes('Inaudio web is on')) {
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
    logs,
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

  test('web server reads text aloud and logs API 500s', async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.port}`;
    const headers = await signIn(base);
    await waitReady(base, headers);

    const spoken = await fetch(`${base}/api/speak`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello from inaudio' }),
    });
    assert.equal(spoken.status, 200);
    assert.equal(spoken.headers.get('content-type'), 'audio/wav');
    const wav = Buffer.from(await spoken.arrayBuffer());
    assert.ok(wav.byteLength > 44);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');

    const live = await fetch(`${base}/api/live/start`, { method: 'POST', headers });
    assert.equal(live.status, 200);
    const session = await live.json();
    const chunk = await fetch(`${base}/api/live/${session.id}/chunk`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'audio/wav' },
      body: tone(0.2),
    });
    assert.equal(chunk.status, 200);
    const stopped = await fetch(`${base}/api/live/${session.id}/stop`, { method: 'POST', headers });
    assert.equal(stopped.status, 200);
    const finished = await stopped.json();
    assert.equal(finished.text, 'hello from inaudio');

    const failed = await fetch(`${base}/api/speak`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(failed.status, 500);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(server.logs.join(''), /POST \/api\/speak failed with 500/);
  });

  test('web server streams read-aloud sentences in order', { timeout: 15_000 }, async (t) => {
    const server = await startServer();
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.port}`;
    const headers = await signIn(base);
    await waitReady(base, headers);

    const text =
      'The first sentence is comfortably long enough to stand on its own here. The second one is long enough too, as it happens.';
    const response = await fetch(`${base}/api/speak/stream`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /ndjson/);
    const body = await response.text();
    const lines = body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(lines[0].type, 'start');
    assert.ok((lines[0].pad ?? '').length >= 16 * 1024);
    const chunks = lines.filter((line) => line.wav);
    assert.ok(chunks.length >= 2);
    assert.equal(chunks[0].index, 0);
    assert.equal(chunks[0].count, chunks.length);
    for (const [index, chunk] of chunks.entries()) {
      assert.equal(chunk.index, index);
      assert.equal(chunk.count, chunks.length);
      assert.equal(typeof chunk.sampleRate, 'number');
      const wav = Buffer.from(chunk.wav, 'base64');
      assert.ok(wav.byteLength > 44);
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    }
    const logs = server.logs.join('');
    assert.match(logs, /Speak stream opened in \d+ms/);
    assert.match(logs, /First audio flushed at \d+ms/);
    assert.match(logs, /Segment 1\/\d+: \d+ chars in \d+ms/);
  });
}

async function signIn(base) {
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-pass' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie);
  return { Cookie: cookie.split(';', 1)[0] ?? '' };
}
