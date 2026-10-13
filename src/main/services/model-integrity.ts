import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import bz2 from 'unbzip2-stream';

export interface IntegrityFile {
  path: string;
  bytes: number;
  sha256: string;
}

export function assertSafePath(target: string): void {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`);
  }
}

export function safeRelative(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !value.includes('\\') &&
    !value.includes(':') &&
    !value.includes('\0') &&
    value
      .split('/')
      .every(
        (part) =>
          part !== '' &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  );
}

export const MARKER_FILE = '.installed.json';
const MARKER_VERSION = 1;
const MAX_MARKER_BYTES = 1024 * 1024;

function stamp(stat: fs.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode].join(':');
}

/** Bounded fan-out: dispatching hundreds of fs requests at once stalls the event loop. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

function directoriesOf(files: readonly IntegrityFile[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  return directories;
}

/**
 * A cheap structural check with file stamps; explicit verification still hashes every byte.
 * Asynchronous so walking a large inventory never blocks the main process.
 */
export async function snapshot(
  root: string,
  files: readonly IntegrityFile[],
): Promise<Map<string, string>> {
  assertSafePath(root);
  const result = new Map<string, string>();
  const expected = new Map(files.map((file) => [file.path, file.bytes]));
  const directories = directoriesOf(files);
  const walk = async (directory: string, relative: string): Promise<void> => {
    const dirStat = await fs.promises.lstat(directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink())
      throw new Error('Unsafe model directory');
    result.set(relative, stamp(dirStat));
    const names = await fs.promises.readdir(directory);
    const stats = await mapLimit(names, 16, (name) => fs.promises.lstat(path.join(directory, name)));
    const subdirectories: [string, string][] = [];
    names.forEach((name, index) => {
      const key = relative ? `${relative}/${name}` : name;
      const stat = stats[index];
      if (!stat) throw new Error(`Missing model entry: ${key}`);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic link in model: ${key}`);
      if (stat.isDirectory()) {
        if (!directories.has(key)) throw new Error(`Unexpected directory: ${key}`);
        subdirectories.push([path.join(directory, name), key]);
        return;
      }
      if (!stat.isFile()) throw new Error(`Not a regular file: ${key}`);
      if (key === MARKER_FILE) return;
      if (!expected.has(key)) throw new Error(`Unexpected or damaged model file: ${key}`);
      if (expected.get(key) && expected.get(key) !== stat.size)
        throw new Error(`Unexpected or damaged model file: ${key}`);
      expected.delete(key);
      result.set(key, stamp(stat));
    });
    for (const [target, key] of subdirectories) await walk(target, key);
  };
  await walk(root, '');
  if (expected.size) throw new Error(`Missing model file: ${expected.keys().next().value}`);
  return result;
}

export function sameSnapshot(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}

/** File stamps recorded after the last full verification, or null when absent or invalid. */
export async function readMarker(root: string): Promise<Map<string, string> | null> {
  const target = path.join(root, MARKER_FILE);
  let handle: fs.promises.FileHandle;
  try {
    assertSafePath(root);
    handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch {
    return null;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_MARKER_BYTES) return null;
    const raw = JSON.parse(await handle.readFile('utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const { version, files } = raw as { version?: unknown; files?: unknown };
    if (version !== MARKER_VERSION || !files || typeof files !== 'object') return null;
    const result = new Map<string, string>();
    for (const [key, value] of Object.entries(files)) {
      if (typeof value !== 'string') return null;
      result.set(key, value);
    }
    return result;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

/**
 * Records the stamps of verified files. The temporary file lives beside the model directory
 * so an interrupted write never leaves an unexpected entry inside it.
 */
export async function writeMarker(
  root: string,
  files: readonly IntegrityFile[],
  stamps: Map<string, string>,
): Promise<void> {
  assertSafePath(root);
  const body = JSON.stringify({
    version: MARKER_VERSION,
    files: Object.fromEntries(files.map((file) => [file.path, stamps.get(file.path) ?? ''])),
  });
  const temporary = `${root}.${process.pid}.marker.tmp`;
  await fs.promises.writeFile(temporary, body, { mode: 0o600 });
  await fs.promises.rename(temporary, path.join(root, MARKER_FILE));
}

/** Inventory files whose current stamp differs from the recorded one. */
export function changedFiles(
  files: readonly IntegrityFile[],
  current: Map<string, string>,
  recorded: Map<string, string> | null,
): Set<string> {
  return new Set(
    files
      .filter((file) => !recorded || recorded.get(file.path) !== current.get(file.path))
      .map((file) => file.path),
  );
}

/** Hashes every inventory file, or only `only` when given. */
export async function verifyFiles(
  root: string,
  files: readonly IntegrityFile[],
  signal?: AbortSignal,
  only?: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const before = await snapshot(root, files);
  for (const file of files) {
    signal?.throwIfAborted();
    if (only && !only.has(file.path)) continue;
    const target = path.join(root, file.path);
    assertSafePath(target);
    const handle = await fs.promises.open(
      target,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stamp(stat) !== before.get(file.path))
        throw new Error(`Model changed during verification: ${file.path}`);
      if (file.sha256) {
        const hash = createHash('sha256');
        // Large reads keep the per-chunk main-thread hashing to a few hundred short slices.
        for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 1 << 20 })) {
          signal?.throwIfAborted();
          hash.update(chunk);
        }
        if (hash.digest('hex') !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
      }
      if (stamp(await handle.stat()) !== before.get(file.path))
        throw new Error(`Model changed during verification: ${file.path}`);
    } finally {
      await handle.close();
    }
  }
  const after = await snapshot(root, files);
  if (!sameSnapshot(before, after)) throw new Error('Model changed during verification');
  return after;
}

/** Preflight before extraction: reject unsupported members, duplicates and unsafe names. */
export async function extractVerifiedArchive(
  archive: string,
  destination: string,
  prefix: string,
  files: readonly IntegrityFile[],
  signal: AbortSignal,
  unpackedBytes?: number,
): Promise<void> {
  const expected = new Map(files.map((file) => [file.path, file.bytes]));
  const directories = new Set<string>([prefix]);
  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++)
      directories.add(`${prefix}/${parts.slice(0, i).join('/')}`);
  }
  const seen = new Set<string>();
  const maxBytes =
    unpackedBytes ??
    files.reduce((sum, file) => sum + (file.bytes || 16 * 1024 * 1024), 0) +
      (files.length + directories.size + 100) * 4096;
  const run = async (extract: boolean) => {
    let bytes = 0;
    let entries = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(bytes > maxBytes ? new Error('Archive expansion limit exceeded') : null, chunk);
      },
    });
    const parser = extract
      ? tar.x({ cwd: destination, strip: 1, strict: true, noChmod: true, noMtime: true })
      : tar.t({ strict: true });
    if (!extract)
      parser.on('entry', (entry) => {
        const name = entry.type === 'Directory' ? entry.path.replace(/\/$/, '') : entry.path;
        const relative = name.slice(prefix.length + 1);
        const expectedBytes = expected.get(relative);
        const validSize =
          expectedBytes === undefined || expectedBytes <= 0 || expectedBytes === entry.size;
        if (
          ++entries > files.length + directories.size + 100 ||
          !safeRelative(name) ||
          seen.has(name.toLowerCase()) ||
          (entry.type === 'Directory'
            ? !directories.has(name) || entry.size !== 0
            : entry.type !== 'File' || !name.startsWith(`${prefix}/`) || !validSize)
        ) {
          parser.abort(new Error(`Unsafe or unexpected archive entry: ${entry.path}`));
          return;
        }
        seen.add(name.toLowerCase());
        if (entry.type === 'File') expected.delete(relative);
      });
    await pipeline(fs.createReadStream(archive), bz2(), limit, parser, { signal });
  };
  await run(false);
  if (expected.size) throw new Error('Archive is missing required inventory files');
  signal.throwIfAborted();
  assertSafePath(destination);
  await run(true);
}
