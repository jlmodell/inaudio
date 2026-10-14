import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

/** Flat `key: value` pairs; enough for app-update.yml and one block of electron-builder.yml. */
function pairs(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Za-z]+):\s*(\S.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
}

test('app-update.yml points at the feed electron-builder publishes to', () => {
  const config = pairs(read('assets/app-update.yml'));
  const builder = read('electron-builder.yml');
  const publish = pairs(/^publish:\r?\n((?:[ \t]+.*\r?\n)+)/m.exec(builder)?.[1] ?? '');
  for (const key of ['provider', 'owner', 'repo', 'releaseType']) {
    assert.equal(config[key], publish[key], `${key} differs from electron-builder.yml`);
  }
  // electron-updater reads this on every download; without it the download fails.
  assert.equal(config.updaterCacheDirName, 'inaudio-updater');
});

test('Forge copies app-update.yml into resources', () => {
  assert.match(read('forge.config.ts'), /extraResource:\s*\[[^\]]*'assets\/app-update\.yml'/);
});
