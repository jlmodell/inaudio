import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { historyQuerySchema, historyUpdateSchema } from '@shared/domain/history';
import { KOKORO_VOICES, voiceIdSchema } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { buildContentSecurityPolicy } from '@shared/security/csp';
import { AuthGate, readCookie, SESSION_COOKIE } from './auth';
import type { WebConfig } from './config';
import { log } from './log';
import { resolveInside } from './paths';
import type { SpeechService } from './speech';
import { decodeFloat32le, decodeWav, encodeWav } from './wav';

const JSON_LIMIT = 64 * 1024;
const AUDIO_LIMIT = 50 * 1024 * 1024;
const CSP = buildContentSecurityPolicy({ dev: false });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function createServer(config: WebConfig, speech: SpeechService): http.Server {
  const auth = new AuthGate(config.password);
  return http.createServer((req, res) => {
    void route(req, res, config, speech, auth).catch((error) => {
      log.error(`${req.method ?? 'GET'} ${req.url ?? '/'} failed with 500`, error);
      if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
}

async function route(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: WebConfig,
  speech: SpeechService,
  auth: AuthGate,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';
  const secure = isSecure(req);

  if (method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, ready: speech.status(true).ready });
  }
  if (method === 'POST' && url.pathname === '/api/login') {
    const body = await readJson(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const token = auth.login(password, clientIp(req));
    if (!token) return json(res, 401, { error: 'Wrong password, or too many tries. Wait and try again.' });
    res.setHeader('Set-Cookie', auth.cookie(token, secure));
    return json(res, 200, { ok: true });
  }
  if (method === 'POST' && url.pathname === '/api/logout') {
    auth.logout(readCookie(req.headers.cookie, SESSION_COOKIE));
    res.setHeader('Set-Cookie', auth.clearCookie(secure));
    return json(res, 200, { ok: true });
  }

  const signedIn = auth.verify(readCookie(req.headers.cookie, SESSION_COOKIE));
  // The first paint reads this to decide between LoginPage and the app. A 401 here
  // becomes a generic error in the client, so visitors never see the password field.
  if (method === 'GET' && url.pathname === '/api/status') {
    return json(res, 200, speech.status(signedIn));
  }
  if (url.pathname.startsWith('/api/') && !signedIn) {
    return json(res, 401, { error: 'Sign in to use Inaudio.' });
  }
  if (method === 'GET' && url.pathname === '/api/settings') {
    return json(res, 200, speech.settings.get());
  }
  if (method === 'PATCH' && url.pathname === '/api/settings') {
    return json(res, 200, speech.settings.update(await readJson(req)));
  }
  if (method === 'GET' && url.pathname === '/api/voices') {
    return json(res, 200, KOKORO_VOICES);
  }
  if (method === 'GET' && url.pathname === '/api/history') {
    const query = historyQuerySchema.parse({
      search: url.searchParams.get('search') ?? '',
      limit: Number(url.searchParams.get('limit') ?? 100),
      offset: Number(url.searchParams.get('offset') ?? 0),
      kind: url.searchParams.get('kind') ?? 'all',
      pinnedOnly: url.searchParams.get('pinned') === '1',
    });
    return json(res, 200, speech.history.list(query));
  }
  if (method === 'DELETE' && url.pathname === '/api/history') {
    speech.history.clear();
    return json(res, 200, { ok: true });
  }
  const historyItem = /^\/api\/history\/([^/]+)$/.exec(url.pathname);
  if (historyItem) {
    const id = decodeURIComponent(historyItem[1] ?? '');
    if (method === 'GET') {
      const item = speech.history.get(id);
      return item ? json(res, 200, item) : json(res, 404, { error: 'Transcript not found' });
    }
    if (method === 'PATCH') {
      const item = speech.history.update(id, historyUpdateSchema.parse(await readJson(req)));
      return item ? json(res, 200, item) : json(res, 404, { error: 'Transcript not found' });
    }
    if (method === 'DELETE') {
      speech.history.remove(id);
      return json(res, 200, { ok: true });
    }
  }
  if (method === 'POST' && url.pathname === '/api/transcribe') {
    const audio = await readAudio(req);
    const result = await speech.transcribe(audio.samples, audio.sampleRate, { save: true });
    return json(res, 200, result);
  }
  if (method === 'POST' && url.pathname === '/api/live/start') {
    return json(res, 200, speech.startLive());
  }
  const liveChunk = /^\/api\/live\/([^/]+)\/chunk$/.exec(url.pathname);
  if (method === 'POST' && liveChunk) {
    const audio = await readAudio(req);
    return json(res, 200, await speech.liveChunk(liveChunk[1] ?? '', audio.samples, audio.sampleRate));
  }
  const liveStop = /^\/api\/live\/([^/]+)\/stop$/.exec(url.pathname);
  if (method === 'POST' && liveStop) {
    return json(res, 200, await speech.stopLive(liveStop[1] ?? ''));
  }
  if (method === 'POST' && (url.pathname === '/api/speak' || url.pathname === '/api/speak/stream')) {
    const body = await readJson(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return json(res, 400, { error: 'Paste some text to read aloud.' });
    const clipped = text.slice(0, MAX_READ_ALOUD_CHARS);
    const voice = voiceIdSchema.safeParse(body.voiceId ?? speech.settings.get().voiceId);
    if (!voice.success) return json(res, 400, { error: 'Unknown voice' });
    const speed = typeof body.speed === 'number' ? body.speed : speech.settings.get().speed;
    if (speed < 0.5 || speed > 2) return json(res, 400, { error: 'Speed must be between 0.5 and 2' });
    if (url.pathname === '/api/speak/stream') {
      return streamSpeak(res, speech, clipped, voice.data, speed);
    }
    const spoken = await speech.speak(clipped, voice.data, speed);
    const wav = encodeWav(spoken.samples, spoken.sampleRate);
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': wav.length,
      'Cache-Control': 'no-store',
    });
    res.end(wav);
    return;
  }

  if (method === 'GET' && !url.pathname.startsWith('/api/')) {
    return serveStatic(res, config.paths.webRoot, url.pathname);
  }
  json(res, 404, { error: 'Not found' });
}

/** Proxies such as Tailscale Serve and nginx hold the first few KB. */
export const SPEAK_STREAM_PAD = ' '.repeat(16 * 1024);

async function streamSpeak(
  res: http.ServerResponse,
  speech: SpeechService,
  text: string,
  voiceId: string,
  speed: number,
): Promise<void> {
  const started = Date.now();
  const segments = speech.planSpeak(text);
  if (!segments.length) return json(res, 400, { error: 'Paste some text to read aloud.' });
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Content-Encoding': 'identity',
    'X-Accel-Buffering': 'no',
  });
  res.socket?.setNoDelay(true);
  res.flushHeaders();
  flushLine(
    res,
    JSON.stringify({ type: 'start', index: -1, count: segments.length, sampleRate: 0, wav: '', pad: SPEAK_STREAM_PAD }),
  );
  log.info(`Speak stream opened in ${Date.now() - started}ms (${segments.length} segments, first ${segments[0]?.text.length ?? 0} chars)`);
  let firstAudio = true;
  try {
    for await (const chunk of speech.speakPrepared(segments, voiceId, speed)) {
      if (!res.writable) break;
      const wav = encodeWav(chunk.samples, chunk.sampleRate);
      flushLine(
        res,
        JSON.stringify({ index: chunk.index, count: chunk.count, sampleRate: chunk.sampleRate, wav: wav.toString('base64') }),
      );
      if (firstAudio) {
        log.info(`First audio flushed at ${Date.now() - started}ms (${chunk.text.length} chars)`);
        firstAudio = false;
      }
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}

function flushLine(res: http.ServerResponse, line: string): void {
  res.write(`${line}\n`);
  res.socket?.setNoDelay(true);
  const flushable = res as http.ServerResponse & { flush?: () => void };
  flushable.flush?.();
}

async function serveStatic(res: http.ServerResponse, root: string, pathname: string): Promise<void> {
  const requested = pathname === '/' ? '/index.html' : pathname;
  let file: string;
  try {
    file = resolveInside(root, requested.replace(/^\/+/, ''));
  } catch {
    json(res, 404, { error: 'Not found' });
    return;
  }
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    if (path.extname(requested)) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    file = path.join(root, 'index.html');
  }
  const type = MIME[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': type.includes('html') ? 'no-store' : 'public, max-age=86400',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  createReadStream(file).pipe(res);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req, JSON_LIMIT);
  if (!raw.byteLength) return {};
  const parsed: unknown = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object');
  return parsed as Record<string, unknown>;
}

async function readAudio(req: http.IncomingMessage): Promise<{ samples: Float32Array; sampleRate: number }> {
  const raw = await readBody(req, AUDIO_LIMIT);
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
  if (type === 'application/octet-stream') {
    const rate = Number(req.headers['x-sample-rate'] ?? 16_000);
    return decodeFloat32le(raw, rate);
  }
  return decodeWav(raw);
}

function readBody(req: http.IncomingMessage, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('Request is too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': payload.length,
  });
  res.end(payload);
}

function isSecure(req: http.IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value === 'https';
}

function clientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}
