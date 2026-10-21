import assert from 'node:assert/strict';
import test from 'node:test';
import { clampReadSpeed, MAX_READ_SPEED, MIN_READ_SPEED, READ_SPEED_PRESETS } from '../src/shared/read-aloud/speed.ts';

test('desktop read speed matches the web 0.5–3 range', () => {
  assert.equal(MIN_READ_SPEED, 0.5);
  assert.equal(MAX_READ_SPEED, 3);
  assert.deepEqual([...READ_SPEED_PRESETS], [1, 1.25, 1.5, 2, 2.5, 3]);
  assert.equal(clampReadSpeed(2.5), 2.5);
  assert.equal(clampReadSpeed(0.1), 0.5);
  assert.equal(clampReadSpeed(4), 3);
  assert.equal(clampReadSpeed(Number.NaN), 1);
});
