import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {
  MODEL_CATALOG,
  modelBytes,
  type ModelId,
  type ModelInstallState,
} from '@shared/domain/models';
import { KOKORO_ARCHIVE_SHA256, KOKORO_FILES } from '../main/services/kokoro-integrity';
import {
  assertSafePath,
  extractVerifiedArchive,
  readMarker,
  snapshot,
  verifyFiles,
  writeMarker,
  type IntegrityFile,
} from '../main/services/model-integrity';
import { downloadVerified } from './download';
import { resolveInside } from './paths';

function inventory(id: ModelId): readonly IntegrityFile[] {
  return MODEL_CATALOG[id].artifacts.flatMap((artifact) => {
    if (artifact.type === 'file')
      return [{ path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 }];
    if (artifact.files?.length) return artifact.files;
    if (artifact.sha256 === KOKORO_ARCHIVE_SHA256) return KOKORO_FILES;
    throw new Error('No trusted inventory for this archive');
  });
}

export interface ModelProgress {
  id: ModelId;
  state: ModelInstallState;
  bytesDone: number;
  bytesTotal: number;
  installed: boolean;
  error?: string;
}

/** Installs catalog models with the same hash checks as the desktop app. */
export class ModelStore extends EventEmitter<{ progress: [ModelProgress] }> {
  private readonly verified = new Map<ModelId, Map<string, string>>();
  private readonly errors = new Map<ModelId, string>();
  private readonly active = new Map<
    ModelId,
    { bytesDone: number; state: 'downloading' | 'verifying' }
  >();
  private readonly pending = new Map<ModelId, Promise<void>>();

  constructor(
    private readonly modelsRoot: string,
    private readonly downloadsRoot: string,
  ) {
    super();
  }

  directory(id: ModelId): string {
    return resolveInside(this.modelsRoot, MODEL_CATALOG[id].id);
  }

  isInstalled(id: ModelId): boolean {
    return this.verified.has(id);
  }

  progress(id: ModelId): ModelProgress {
    const model = MODEL_CATALOG[id];
    const active = this.active.get(id);
    const installed = this.isInstalled(id);
    const error = this.errors.get(id);
    return {
      id,
      state: active?.state ?? (installed ? 'installed' : error ? 'error' : 'missing'),
      bytesDone: active ? active.bytesDone : installed ? modelBytes(model) : 0,
      bytesTotal: modelBytes(model),
      installed,
      ...(error ? { error } : {}),
    };
  }

  async discover(id: ModelId): Promise<boolean> {
    if (this.verified.has(id)) return true;
    await this.check(id).catch(() => undefined);
    return this.verified.has(id);
  }

  check(id: ModelId): Promise<void> {
    return this.enqueue(id, async () => {
      this.verified.delete(id);
      this.errors.delete(id);
      const directory = this.directory(id);
      if (!fs.existsSync(directory)) return;
      const files = inventory(id);
      const [current, recorded] = await Promise.all([
        snapshot(directory, files),
        readMarker(directory),
      ]);
      const changed = recorded
        ? [...files].filter((file) => recorded.get(file.path) !== current.get(file.path))
        : files;
      if (!recorded || changed.length) {
        this.active.set(id, { bytesDone: 0, state: 'verifying' });
        this.emit('progress', this.progress(id));
        const stamps = await verifyFiles(
          directory,
          files,
          undefined,
          recorded ? new Set(changed.map((file) => file.path)) : undefined,
        );
        await writeMarker(directory, files, stamps);
      }
      this.verified.set(id, await snapshot(directory, files));
      this.active.delete(id);
      this.emit('progress', this.progress(id));
    });
  }

  ensure(id: ModelId): Promise<void> {
    return this.enqueue(id, async () => {
      if (this.verified.has(id)) return;
      await this.install(id);
    });
  }

  private async install(id: ModelId): Promise<void> {
    let staging: string | undefined;
    let archiveRoot: string | undefined;
    const finalDir = this.directory(id);
    const job: { bytesDone: number; state: 'downloading' | 'verifying' } = {
      bytesDone: 0,
      state: 'downloading',
    };
    this.errors.delete(id);
    this.active.set(id, job);
    this.emit('progress', this.progress(id));
    const controller = new AbortController();
    try {
      if (this.verified.has(id)) return;
      assertSafePath(this.modelsRoot);
      assertSafePath(this.downloadsRoot);
      staging = await fs.promises.mkdtemp(path.join(this.modelsRoot, `.${id}.staging-`));
      archiveRoot = await fs.promises.mkdtemp(path.join(this.downloadsRoot, `.${id}.download-`));
      const files = inventory(id);
      for (const [index, artifact] of MODEL_CATALOG[id].artifacts.entries()) {
        job.state = 'downloading';
        const target =
          artifact.type === 'file'
            ? resolveInside(staging, artifact.path)
            : path.join(archiveRoot, `${index}.tar.bz2`);
        await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await downloadVerified({
          url: artifact.url,
          destination: target,
          expectedBytes: artifact.bytes,
          expectedSha256: artifact.sha256,
          signal: controller.signal,
          onProgress: (bytes) => {
            job.bytesDone += bytes;
            this.emit('progress', this.progress(id));
          },
        });
        if (artifact.type === 'archive') {
          job.state = 'verifying';
          this.emit('progress', this.progress(id));
          await extractVerifiedArchive(
            target,
            staging,
            artifact.stripPrefix,
            files,
            controller.signal,
            artifact.unpackedBytes,
          );
        }
      }
      job.state = 'verifying';
      this.emit('progress', this.progress(id));
      const stamps = await verifyFiles(staging, files, controller.signal);
      await writeMarker(staging, files, stamps);
      if (fs.existsSync(finalDir)) await fs.promises.rm(finalDir, { recursive: true, force: true });
      await fs.promises.rename(staging, finalDir);
      staging = undefined;
      this.verified.set(id, await snapshot(finalDir, files));
    } catch (error) {
      this.verified.delete(id);
      this.errors.set(id, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      for (const directory of [staging, archiveRoot]) {
        if (directory) await fs.promises.rm(directory, { recursive: true, force: true });
      }
      this.active.delete(id);
      this.emit('progress', this.progress(id));
    }
  }

  private enqueue(id: ModelId, operation: () => Promise<void>): Promise<void> {
    const next = (this.pending.get(id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(operation);
    this.pending.set(id, next);
    void next.finally(() => {
      if (this.pending.get(id) === next) this.pending.delete(id);
    });
    return next;
  }
}
