import { createReadStream, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import {
  BROWSER_TTS_BYTES,
  BROWSER_TTS_FILES,
  BROWSER_TTS_URL_PREFIX,
  browserTtsFile,
  type BrowserTtsFile,
  type BrowserTtsProgress,
} from '@shared/web/browser-tts';
import { downloadVerified } from './download';
import { log } from './log';
import { resolveInside } from './paths';

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

export class BrowserTtsStore {
  private bytesDone = 0;
  private downloading = false;
  private error?: string;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly root: string,
    private readonly downloads: boolean,
  ) {}

  status(): BrowserTtsProgress {
    return {
      installed: this.isInstalled(),
      downloading: this.downloading,
      bytesDone: this.isInstalled() ? BROWSER_TTS_BYTES : this.bytesDone,
      bytesTotal: BROWSER_TTS_BYTES,
      ...(this.error ? { error: this.error } : {}),
    };
  }

  isInstalled(): boolean {
    return BROWSER_TTS_FILES.every((file) => {
      try {
        return statSync(this.absolute(file.path)).size === file.bytes;
      } catch {
        return false;
      }
    });
  }

  ensure(): Promise<void> {
    if (this.isInstalled()) return Promise.resolve();
    if (!this.downloads) return Promise.resolve();
    this.pending ??= this.downloadAll().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async serve(res: http.ServerResponse, pathname: string, headers: Record<string, string>): Promise<void> {
    const relative = pathname.replace(new RegExp(`^${BROWSER_TTS_URL_PREFIX}/`), '');
    const file = browserTtsFile(relative);
    if (!file) {
      res.writeHead(404, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (!this.present(file) && this.downloads) {
      try {
        await this.ensureFile(file);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        log.error(`Browser voice ${file.path} failed to download`, error);
        res.writeHead(503, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'The on-device voice is still arriving on the server.' }));
        return;
      }
    }
    const absolute = this.absolute(file.path);
    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) throw new Error('not a file');
      res.writeHead(200, {
        ...headers,
        'Content-Type': MIME[path.extname(file.path)] ?? 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      createReadStream(absolute).pipe(res);
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'The on-device voice is not on this server yet.' }));
    }
  }

  private async downloadAll(): Promise<void> {
    this.downloading = true;
    this.error = undefined;
    this.bytesDone = 0;
    log.info(`Preparing the on-device voice (${Math.round(BROWSER_TTS_BYTES / 1_000_000)} MB)`);
    try {
      for (const file of BROWSER_TTS_FILES) {
        await this.ensureFile(file);
      }
      log.info('On-device voice is ready to serve');
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      log.error('On-device voice download failed', error);
      throw error;
    } finally {
      this.downloading = false;
    }
  }

  private async ensureFile(file: BrowserTtsFile): Promise<void> {
    if (this.present(file)) {
      this.bytesDone += file.bytes;
      return;
    }
    const destination = this.absolute(file.path);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.rm(destination, { force: true });
    await downloadVerified({
      url: file.url,
      destination,
      expectedBytes: file.bytes,
      expectedSha256: file.sha256,
      signal: new AbortController().signal,
      onProgress: (bytes) => {
        this.bytesDone += bytes;
      },
    });
    log.info(`Saved ${file.path}`);
  }

  private present(file: BrowserTtsFile): boolean {
    try {
      return statSync(this.absolute(file.path)).size === file.bytes;
    } catch {
      return false;
    }
  }

  private absolute(relative: string): string {
    return resolveInside(this.root, relative);
  }
}
