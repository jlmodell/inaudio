import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./release-assets.mjs', import.meta.url));
const extensions = process.platform === 'win32' ? ['.exe', '.nupkg'] : process.platform === 'darwin' ? ['.zip'] : ['.deb', '.rpm'];

function fixture(run) {
  const root = path.resolve(`.release-test-${randomUUID()}`);
  mkdirSync(path.join(root, 'out', 'make', 'nested'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('collects all platform installers and calculates verifiable checksums', () => {
  fixture((root) => {
    for (const extension of extensions) writeFileSync(path.join(root, 'out', 'make', 'nested', `installer${extension}`), 'installer bytes');
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(root, 'release-assets');
    const manifest = readdirSync(directory).find((name) => name.startsWith('SHA256SUMS'));
    const lines = readFileSync(path.join(directory, manifest), 'utf8').trim().split('\n');
    assert.equal(lines.length, extensions.length);
    for (const line of lines) {
      const [digest, name] = line.split('  ');
      assert.equal(createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex'), digest);
      assert.ok(name.startsWith(`${process.platform}-${process.arch}-`));
    }
  });
});

test('fails if any required installer format is missing', () => {
  fixture((root) => {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing .* installer/);
  });
});

test('fails if electron-builder output has no update manifest', () => {
  fixture((root) => {
    const builder = path.join(root, 'out', 'builder');
    mkdirSync(builder, { recursive: true });
    for (const extension of extensions) writeFileSync(path.join(builder, `installer${extension}`), 'installer bytes');
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing update manifest/);
  });
});

test('sanitizes unsafe characters in produced asset names', () => {
  fixture((root) => {
    for (const extension of extensions) {
      const base = extension === extensions[0] ? `my installer${extension}` : `installer${extension}`;
      writeFileSync(path.join(root, 'out', 'make', 'nested', base), 'installer bytes');
    }
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(root, 'release-assets');
    const names = readdirSync(directory);
    for (const name of names) assert.match(name, /^[a-zA-Z0-9._+-]+$/);
    const manifest = names.find((name) => name.startsWith('SHA256SUMS'));
    for (const line of readFileSync(path.join(directory, manifest), 'utf8').trim().split('\n')) {
      const [digest, name] = line.split('  ');
      assert.match(name, /^[a-zA-Z0-9._+-]+$/);
      assert.equal(createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex'), digest);
    }
  });
});
