import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ORT_RUNTIME_FILES,
  ORT_URL_PREFIX,
  ortFileContentType,
  ortFileUrl,
} from '../src/shared/web/ort-runtime.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const dest = path.join(root, 'out/web/ort');

test('ORT runtime files have JS MIME for the loaders the worker imports', () => {
  assert.equal(ORT_URL_PREFIX, '/ort');
  assert.deepEqual([...ORT_RUNTIME_FILES], [
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.jsep.mjs',
  ]);
  assert.equal(ortFileContentType('ort-wasm-simd-threaded.wasm'), 'application/wasm');
  assert.equal(ortFileContentType('ort-wasm-simd-threaded.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(ortFileContentType('ort-wasm-simd-threaded.jsep.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(ortFileUrl('ort-wasm-simd-threaded.jsep.mjs'), '/ort/ort-wasm-simd-threaded.jsep.mjs');
});

test('build:web copies every ORT file the worker will import', { skip: !fs.existsSync(dest) }, () => {
  for (const name of ORT_RUNTIME_FILES) {
    const file = path.join(dest, name);
    assert.ok(fs.existsSync(file), `${name} missing from out/web/ort`);
    assert.ok(fs.statSync(file).size > 0, `${name} is empty`);
  }
});
