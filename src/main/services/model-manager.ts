import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {
  MODEL_CATALOG,
  MODEL_IDS,
  modelBytes,
  type ModelHealth,
  type ModelId,
  type ModelLoadState,
  type ModelStatus,
} from '@shared/domain/models';
import type { ModelProgressEvent } from '@shared/domain/system';
import { resolveInside } from '../app/paths';
import { downloadVerified } from './downloader';
import {
  assertSafePath,
  changedFiles,
  extractVerifiedArchive,
  readMarker,
  sameSnapshot,
  snapshot,
  verifyFiles,
  writeMarker,
  type IntegrityFile,
} from './model-integrity';
import { KOKORO_ARCHIVE_SHA256, KOKORO_FILES } from './kokoro-integrity';

interface ActiveDownload {
  controller: AbortController;
  bytesDone: number;
  state: 'downloading' | 'verifying';
}

function inventory(id: ModelId): readonly IntegrityFile[] {
  return MODEL_CATALOG[id].artifacts.flatMap((artifact) => {
    if (artifact.type === 'file')
      return [{ path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 }];
    if (artifact.files?.length) return artifact.files;
    if (artifact.sha256 === KOKORO_ARCHIVE_SHA256) return KOKORO_FILES;
    throw new Error('No trusted inventory for this archive');
  });
}

/** Owns model storage. Installation is cached only after full cryptographic verification. */
export class ModelManager extends EventEmitter<{ progress: [ModelProgressEvent] }> {
  private readonly active = new Map<ModelId, ActiveDownload>();
  private readonly errors = new Map<ModelId, string>();
  private readonly verified = new Map<ModelId, Map<string, string>>();
  private readonly pending = new Map<ModelId, Promise<void>>();
  private readonly downloads = new Map<ModelId, Promise<void>>();
  private readonly controllers = new Map<ModelId, Set<AbortController>>();

  constructor(
    private readonly modelsRoot: string,
    private readonly downloadsRoot: string,
    private readonly isLoaded: (id: ModelId) => boolean,
  ) {
    super();
  }

  directory(id: ModelId): string {
    return resolveInside(this.modelsRoot, MODEL_CATALOG[id].id);
  }

  /** In-memory only: status reads must never touch the disk. `revalidate` guards each load. */
  isInstalled(id: ModelId): boolean {
    return this.verified.has(id);
  }

  /** Re-checks stamps before a model is loaded; changed files are re-hashed. */
  async revalidate(id: ModelId): Promise<boolean> {
    const cached = this.verified.get(id);
    if (!cached) return false;
    try {
      if (sameSnapshot(cached, await snapshot(this.directory(id), inventory(id)))) return true;
    } catch {
      /* Any filesystem change invalidates the verified cache. */
    }
    this.verified.delete(id);
    await this.check(id).catch(() => undefined);
    return this.verified.has(id);
  }

  status(id: ModelId): ModelStatus {
    const model = MODEL_CATALOG[id];
    const active = this.active.get(id);
    const total = modelBytes(model);
    const installed = this.isInstalled(id);
    const loaded = installed && this.isLoaded(id);
    const error = this.errors.get(id);
    const state: ModelStatus['state'] =
      active?.state ?? (installed ? 'installed' : error ? 'error' : 'missing');
    let loadState: ModelLoadState = loaded ? 'loaded' : 'unloaded';
    let health: ModelHealth = installed ? 'healthy' : 'unavailable';
    if (active?.state === 'downloading' || active?.state === 'verifying') {
      loadState = 'loading';
      health = installed ? 'healthy' : 'unchecked';
    }
    if (error) {
      loadState = 'error';
      health = 'error';
    }
    return {
      id,
      kind: model.kind,
      state,
      bytesTotal: total,
      bytesDone: active ? active.bytesDone : installed ? total : 0,
      installed,
      loaded,
      active: false,
      loadState,
      health,
      ...(error ? { error } : {}),
    };
  }

  list(): ModelStatus[] {
    return MODEL_IDS.map((id) => this.status(id));
  }

  private enqueue(id: ModelId, operation: () => Promise<void>): Promise<void> {
    const next = (this.pending.get(id) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.pending.set(id, next);
    void next.then(
      () => {
        if (this.pending.get(id) === next) this.pending.delete(id);
      },
      () => {
        if (this.pending.get(id) === next) this.pending.delete(id);
      },
    );
    return next;
  }

  private controller(id: ModelId): AbortController {
    const controller = new AbortController();
    const controllers = this.controllers.get(id) ?? new Set<AbortController>();
    controllers.add(controller);
    this.controllers.set(id, controllers);
    return controller;
  }

  private finished(id: ModelId, controller: AbortController): void {
    this.controllers.get(id)?.delete(controller);
    if (!this.controllers.get(id)?.size) this.controllers.delete(id);
    this.active.delete(id);
    this.emit('progress', this.status(id));
  }

  /** Checks every install not already verified this session. Sequential to spare the disk. */
  async discover(): Promise<void> {
    for (const id of MODEL_IDS) {
      if (!this.verified.has(id)) await this.check(id).catch(() => undefined);
    }
  }

  /**
   * Launch-time check: compares file stamps with the marker written after the last full
   * verification and hashes only files that changed. Installs without a marker are hashed
   * in full once.
   */
  check(id: ModelId): Promise<void> {
    return this.run(id, true);
  }

  /** Explicit verification: hashes every byte regardless of the marker. */
  verify(id: ModelId): Promise<void> {
    return this.run(id, false);
  }

  private run(id: ModelId, trustMarker: boolean): Promise<void> {
    const controller = this.controller(id);
    return this.enqueue(id, async () => {
      this.verified.delete(id);
      this.errors.delete(id);
      try {
        controller.signal.throwIfAborted();
        assertSafePath(this.modelsRoot);
        const directory = this.directory(id);
        if (!fs.existsSync(directory)) return;
        const files = inventory(id);
        let only: Set<string> | undefined;
        if (trustMarker) {
          const [current, recorded] = await Promise.all([snapshot(directory, files), readMarker(directory)]);
          only = changedFiles(files, current, recorded);
        }
        if (!only || only.size) {
          this.active.set(id, { controller, bytesDone: 0, state: 'verifying' });
          this.emit('progress', this.status(id));
          const stamps = await verifyFiles(directory, files, controller.signal, only);
          controller.signal.throwIfAborted();
          await writeMarker(directory, files, stamps);
        }
        // Writing the marker touches the directory, so the cached snapshot is taken last.
        const verified = await snapshot(directory, files);
        controller.signal.throwIfAborted();
        this.verified.set(id, verified);
      } catch (error) {
        if (!controller.signal.aborted) {
          this.errors.set(id, error instanceof Error ? error.message : String(error));
          throw error;
        }
      } finally {
        this.finished(id, controller);
      }
    });
  }

  download(id: ModelId): Promise<void> {
    const existing = this.downloads.get(id);
    if (existing) return existing;
    const controller = this.controller(id);
    const operation = this.enqueue(id, () => this.install(id, controller));
    this.downloads.set(id, operation);
    void operation.then(
      () => {
        if (this.downloads.get(id) === operation) this.downloads.delete(id);
      },
      () => {
        if (this.downloads.get(id) === operation) this.downloads.delete(id);
      },
    );
    return operation;
  }

  private async install(id: ModelId, controller: AbortController): Promise<void> {
    let staging: string | undefined;
    let archiveRoot: string | undefined;
    let backup: string | undefined;
    let promoted = false;
    const finalDir = this.directory(id);
    const job: ActiveDownload = { controller, bytesDone: 0, state: 'downloading' };
    let lastEmit = 0;
    const report = (force = false) => {
      if (!force && Date.now() - lastEmit < 200) return;
      lastEmit = Date.now();
      this.emit('progress', this.status(id));
    };
    try {
      controller.signal.throwIfAborted();
      if (this.isInstalled(id)) return;
      this.errors.delete(id);
      this.active.set(id, job);
      assertSafePath(this.modelsRoot);
      assertSafePath(this.downloadsRoot);
      // Staging and backup share the final filesystem, so promotion is a rename.
      staging = await fs.promises.mkdtemp(path.join(this.modelsRoot, `.${id}.staging-`));
      archiveRoot = await fs.promises.mkdtemp(path.join(this.downloadsRoot, `.${id}.download-`));
      const files = inventory(id);
      report(true);
      for (const [index, artifact] of MODEL_CATALOG[id].artifacts.entries()) {
        controller.signal.throwIfAborted();
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
            report();
          },
        });
        if (artifact.type === 'archive') {
          job.state = 'verifying';
          report(true);
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
      report(true);
      const stamps = await verifyFiles(staging, files, controller.signal);
      controller.signal.throwIfAborted();
      // Renaming the staging directory keeps every file's stamp, so the marker stays valid.
      await writeMarker(staging, files, stamps);
      assertSafePath(this.modelsRoot);
      this.verified.delete(id);
      if (fs.existsSync(finalDir)) {
        assertSafePath(finalDir);
        backup = `${staging}.previous`;
        await fs.promises.rename(finalDir, backup);
      }
      controller.signal.throwIfAborted();
      await fs.promises.rename(staging, finalDir);
      promoted = true;
      // Cancellation during promotion must not leave an installed model behind.
      controller.signal.throwIfAborted();
      const verified = await snapshot(finalDir, files);
      controller.signal.throwIfAborted();
      this.verified.set(id, verified);
    } catch (error) {
      this.verified.delete(id);
      if (promoted) await fs.promises.rm(finalDir, { recursive: true, force: true });
      if (backup) {
        await fs.promises.rename(backup, finalDir);
        backup = undefined;
      }
      if (!controller.signal.aborted) {
        this.errors.set(id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    } finally {
      try {
        for (const directory of [staging, archiveRoot, backup]) {
          if (directory) {
            assertSafePath(path.dirname(directory));
            await fs.promises.rm(directory, { recursive: true, force: true });
          }
        }
      } finally {
        this.finished(id, controller);
      }
    }
  }

  cancel(id: ModelId): void {
    for (const controller of this.controllers.get(id) ?? []) controller.abort();
  }

  remove(id: ModelId): Promise<void> {
    this.cancel(id);
    return this.enqueue(id, async () => {
      this.verified.delete(id);
      this.errors.delete(id);
      assertSafePath(this.modelsRoot);
      // rm unlinks a symlink at the model root rather than traversing it.
      await fs.promises.rm(this.directory(id), { recursive: true, force: true });
      this.emit('progress', this.status(id));
    });
  }

  cancelAll(): void {
    for (const id of this.controllers.keys()) this.cancel(id);
  }
}
