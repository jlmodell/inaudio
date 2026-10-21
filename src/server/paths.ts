import fs from 'node:fs';
import path from 'node:path';

export interface WebPaths {
  data: string;
  models: string;
  downloads: string;
  browserTts: string;
  settings: string;
  assets: string;
  webRoot: string;
}

export function resolveInside(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes ${base}`);
  }
  return target;
}

export function createPaths(data: string, assets: string, webRoot: string): WebPaths {
  const root = path.resolve(data);
  const paths: WebPaths = {
    data: root,
    models: path.join(root, 'models'),
    downloads: path.join(root, 'downloads'),
    browserTts: path.join(root, 'browser-tts'),
    settings: path.join(root, 'settings.json'),
    assets: path.resolve(assets),
    webRoot: path.resolve(webRoot),
  };
  for (const dir of [paths.data, paths.models, paths.downloads, paths.browserTts]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return paths;
}
