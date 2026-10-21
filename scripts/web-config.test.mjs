import assert from 'node:assert/strict';
import os from 'node:os';
import test from 'node:test';
import { parseThreads } from '../src/server/threads.ts';

test('unset INAUDIO_THREADS uses the host CPU count, capped at 16', () => {
  const cpus = os.availableParallelism();
  assert.equal(parseThreads(undefined), Math.min(16, Math.max(1, cpus)));
  assert.equal(parseThreads(''), Math.min(16, Math.max(1, cpus)));
  assert.equal(parseThreads('  '), Math.min(16, Math.max(1, cpus)));
});

test('INAUDIO_THREADS keeps an explicit value', () => {
  assert.equal(parseThreads('2'), 2);
  assert.equal(parseThreads('16'), 16);
});
