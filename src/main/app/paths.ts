import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface AppPaths {
  data: string;
  models: string;
  downloads: string;
  cache: string;
  audio: string;
  history: string;
  logs: string;
  database: string;
  settings: string;
}

let cached: AppPaths | null = null;

export function appPaths(): AppPaths {
  if (cached) return cached;
  const data = app.getPath('userData');
  cached = {
    data,
    models: path.join(data, 'models'),
    downloads: path.join(data, 'downloads'),
    cache: path.join(data, 'cache'),
    audio: path.join(data, 'audio'),
    history: path.join(data, 'history'),
    logs: path.join(data, 'logs'),
    database: path.join(data, 'history.sqlite3'),
    settings: path.join(data, 'settings.json'),
  };
  for (const dir of [cached.models, cached.downloads, cached.cache, cached.audio, cached.history, cached.logs]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return cached;
}

/**
 * Resolve `segments` under `root` and refuse anything that escapes it.
 * All privileged filesystem access goes through this.
 */
export function resolveInside(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes ${base}`);
  }
  return target;
}
