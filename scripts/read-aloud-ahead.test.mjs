import assert from 'node:assert/strict';
import test from 'node:test';
import { clampAhead, DEFAULT_READ_ALOUD_BUFFER, pullAhead } from '../src/shared/read-aloud/ahead.ts';

test('clampAhead stays between 1 and 8', () => {
  assert.equal(DEFAULT_READ_ALOUD_BUFFER, 3);
  assert.equal(clampAhead(3), 3);
  assert.equal(clampAhead(0), 1);
  assert.equal(clampAhead(9), 8);
  assert.equal(clampAhead(3.4), 3);
  assert.equal(clampAhead(Number.NaN), 3);
  assert.equal(clampAhead(Number.POSITIVE_INFINITY), 3);
});

test('pullAhead keeps a window of work in flight and yields in order', async () => {
  const items = [1, 2, 3, 4, 5];
  const inflight = [];
  const peaks = [];
  const seen = [];
  for await (const value of pullAhead(items, 3, async (item) => {
    inflight.push(item);
    peaks.push(inflight.length);
    await Promise.resolve();
    inflight.splice(inflight.indexOf(item), 1);
    return item * 10;
  })) {
    seen.push(value);
  }
  assert.deepEqual(seen, [10, 20, 30, 40, 50]);
  assert.ok(Math.max(...peaks) <= 3);
  assert.ok(Math.max(...peaks) >= 2);
});
