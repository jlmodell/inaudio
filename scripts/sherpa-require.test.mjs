import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { requireAnchor } from '../src/worker/engines/sherpa.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const source = fs.readFileSync(path.join(root, 'src/worker/engines/sherpa.ts'), 'utf8');

test('sherpa require prefers the CJS filename when import.meta.url is missing', () => {
  assert.match(source, /typeof __filename === 'string'/);
  assert.match(source, /import\.meta\.url/);
  assert.match(source, /createRequire\(requireAnchor\(\)\)/);
  assert.doesNotMatch(source, /createRequire\(import\.meta\.url\)/);
});

test('ESM worker can still resolve a file URL anchor', () => {
  assert.match(requireAnchor(), /^file:/);
});

test('CJS worker falls back to __filename when import.meta.url is undefined', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inaudio-sherpa-'));
  const file = path.join(dir, 'anchor.cjs');
  fs.writeFileSync(
    file,
    `
const { createRequire } = require('node:module');
const import_meta_url = undefined;
function requireAnchor() {
  try {
    if (typeof __filename === 'string' && __filename.length > 0) return __filename;
  } catch {
    // ESM
  }
  if (typeof import_meta_url === 'string' && import_meta_url.length > 0) return import_meta_url;
  throw new Error('Unable to resolve the sherpa-onnx runtime from this process.');
}
const requireFrom = createRequire(requireAnchor());
process.stdout.write(requireAnchor());
requireFrom('node:fs');
`,
  );
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, file);
});
