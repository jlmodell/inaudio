import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadProgressBucket, formatModelProgress } from '../src/server/log.ts';

test('download progress lines name the model and the percent', () => {
  assert.equal(
    formatModelProgress('Kokoro English v0.19', {
      state: 'downloading',
      bytesDone: 32,
      bytesTotal: 100,
    }),
    'Downloading Kokoro English v0.19: 32% (32 / 100 bytes)',
  );
  assert.equal(
    formatModelProgress('Kokoro English v0.19', { state: 'verifying', bytesDone: 1, bytesTotal: 1 }),
    'Verifying Kokoro English v0.19',
  );
  assert.equal(
    formatModelProgress('Kokoro English v0.19', { state: 'installed', bytesDone: 1, bytesTotal: 1 }),
    'Installed Kokoro English v0.19',
  );
  assert.equal(
    formatModelProgress('Kokoro English v0.19', {
      state: 'error',
      bytesDone: 0,
      bytesTotal: 1,
      error: '__filename is not defined',
    }),
    'Failed Kokoro English v0.19: __filename is not defined',
  );
  assert.equal(
    formatModelProgress('Kokoro English v0.19', { state: 'missing', bytesDone: 0, bytesTotal: 1 }),
    null,
  );
});

test('download log buckets change every 10 percent', () => {
  assert.equal(downloadProgressBucket({ bytesDone: 9, bytesTotal: 100 }), 0);
  assert.equal(downloadProgressBucket({ bytesDone: 100, bytesTotal: 100 }), 10);
});
