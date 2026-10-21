import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { MODEL_CATALOG, isAllowedDownloadUrl } from '@shared/domain/models';
import { assertSafePath } from '../main/services/model-integrity';

export interface DownloadOptions {
  url: string;
  destination: string;
  expectedBytes: number;
  expectedSha256: string;
  signal: AbortSignal;
  onProgress(bytes: number): void;
}

const CONNECT_TIMEOUT_MS = 120_000;
const STALL_TIMEOUT_MS = 60_000;
const TOTAL_DOWNLOAD_MS = 60 * 60_000;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

class RetryableDownloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RetryableDownloadError';
  }
}

function isAllowedModelDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.port || url.hash) return false;
    return isAllowedDownloadUrl(url.href);
  } catch {
    return false;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Download cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return (error as { name?: string } | null)?.name === 'AbortError';
}

export async function downloadVerified(options: DownloadOptions): Promise<void> {
  const { url, destination, expectedBytes, expectedSha256, signal } = options;
  const trusted = Object.values(MODEL_CATALOG).some((model) =>
    model.artifacts.some(
      (artifact) =>
        artifact.url === url && artifact.bytes === expectedBytes && artifact.sha256 === expectedSha256,
    ),
  );
  if (!trusted || !isAllowedModelDownloadUrl(url)) throw new Error('Untrusted model download');
  assertSafePath(path.dirname(destination));

  const deadline = Date.now() + TOTAL_DOWNLOAD_MS;
  let lastError: unknown = new Error('Download failed');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw signal.reason ?? new Error('Download cancelled');
    if (Date.now() >= deadline) throw new Error('Download exceeded 60 minutes');
    try {
      await attemptDownload(options, deadline);
      return;
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw signal.reason ?? error;
      const retryable = error instanceof RetryableDownloadError;
      if (!retryable || attempt === MAX_ATTEMPTS || Date.now() >= deadline) throw error;
      await sleep(Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS), signal);
    }
  }
  throw lastError;
}

async function attemptDownload(options: DownloadOptions, deadline: number): Promise<void> {
  const { url, destination, expectedBytes, expectedSha256, signal, onProgress } = options;
  const partial = `${destination}.${randomUUID()}.partial`;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const totalTimer = setTimeout(
    () => controller.abort(new Error('Download exceeded 60 minutes')),
    Math.max(0, deadline - Date.now()),
  );
  let connectTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(new RetryableDownloadError('Could not connect to the download server in time')),
    CONNECT_TIMEOUT_MS,
  );
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearConnect = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = undefined;
    }
  };
  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };
  let created = false;
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    clearConnect();
    if (!response.ok || !response.body || (response.url && !isAllowedModelDownloadUrl(response.url))) {
      const message = `Download failed (HTTP ${response.status})`;
      throw response.status >= 500 || response.status === 429
        ? new RetryableDownloadError(message)
        : new Error(message);
    }
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) !== expectedBytes) throw new Error('Unexpected download length');
    const hash = createHash('sha256');
    let received = 0;
    const resetIdle = () => {
      clearIdle();
      idleTimer = setTimeout(
        () => controller.abort(new RetryableDownloadError('Download stalled')),
        STALL_TIMEOUT_MS,
      );
    };
    resetIdle();
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        resetIdle();
        received += chunk.length;
        if (received > expectedBytes) return callback(new Error('Download is larger than expected'));
        hash.update(chunk);
        onProgress(chunk.length);
        callback(null, chunk);
      },
    });
    created = true;
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
      meter,
      fs.createWriteStream(partial, { flags: 'wx', mode: 0o600 }),
      { signal: controller.signal },
    );
    controller.signal.throwIfAborted();
    if (received !== expectedBytes) throw new Error('Download is incomplete');
    if (hash.digest('hex') !== expectedSha256) throw new Error('Checksum mismatch, file discarded');
    assertSafePath(path.dirname(destination));
    if (fs.existsSync(destination)) throw new Error('Download destination already exists');
    await fs.promises.rename(partial, destination);
  } catch (error) {
    throw classifyDownloadError(error, controller.signal, signal);
  } finally {
    clearTimeout(totalTimer);
    clearConnect();
    clearIdle();
    signal.removeEventListener('abort', abort);
    controller.abort();
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    if (created) await fs.promises.rm(partial, { force: true });
  }
}

function classifyDownloadError(
  error: unknown,
  attemptSignal: AbortSignal,
  userSignal: AbortSignal,
): unknown {
  if (userSignal.aborted) return userSignal.reason ?? error;
  const reason = attemptSignal.reason;
  if (reason instanceof RetryableDownloadError) return reason;
  if (reason instanceof Error && reason.message === 'Download exceeded 60 minutes') return reason;
  if (error instanceof RetryableDownloadError) return error;
  if (isNetworkError(error)) {
    return new RetryableDownloadError(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}
