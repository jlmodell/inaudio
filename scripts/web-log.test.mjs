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
    formatModelProgress('Parakeet TDT 0.6B v2', { state: 'verifying', bytesDone: 1, bytesTotal: 1 }),
    'Verifying Parakeet TDT 0.6B v2',
  );
  assert.equal(
    formatModelProgress('Parakeet TDT 0.6B v2', { state: 'installed', bytesDone: 1, bytesTotal: 1 }),
    'Installed Parakeet TDT 0.6B v2',
  );
  assert.equal(
    formatModelProgress('Parakeet TDT 0.6B v2', {
      state: 'error',
      bytesDone: 0,
      bytesTotal: 1,
      error: '__filename is not defined',
    }),
    'Failed Parakeet TDT 0.6B v2: __filename is not defined',
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
