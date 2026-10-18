import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_WINDOW_COLLAPSED_HEIGHT,
  LIVE_WINDOW_MARGIN,
  keepInside,
  liveWindowBounds,
} from '../src/main/windows/live-window-size.ts';

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const size = { width: 420, height: 300 };

test('opens in the chosen corner, inside the margin', () => {
  assert.deepEqual(liveWindowBounds(area, 'bottom-right', size, false), {
    x: 1920 - 420 - LIVE_WINDOW_MARGIN,
    y: 1040 - 300 - LIVE_WINDOW_MARGIN,
    width: 420,
    height: 300,
  });
  assert.deepEqual(liveWindowBounds(area, 'top-left', size, false), { x: LIVE_WINDOW_MARGIN, y: LIVE_WINDOW_MARGIN, width: 420, height: 300 });
  const top = liveWindowBounds(area, 'top', size, false);
  assert.equal(top.x, Math.round((1920 - 420) / 2));
});

test('collapsed keeps the width and shrinks to the header, still pinned to its edge', () => {
  const bounds = liveWindowBounds(area, 'bottom-left', size, true);
  assert.equal(bounds.height, LIVE_WINDOW_COLLAPSED_HEIGHT);
  assert.equal(bounds.width, 420);
  assert.equal(bounds.y + bounds.height, 1040 - LIVE_WINDOW_MARGIN);
});

test('follows a work area that does not start at the origin and never outgrows it', () => {
  const second = { x: -1280, y: 200, width: 400, height: 260 };
  const bounds = liveWindowBounds(second, 'bottom-right', size, false);
  assert.ok(bounds.width <= second.width && bounds.height <= second.height);
  assert.ok(bounds.x >= second.x && bounds.x + bounds.width <= second.x + second.width);
  assert.ok(bounds.y >= second.y && bounds.y + bounds.height <= second.y + second.height);
});

test('a dragged window is pulled back on screen only when it no longer fits', () => {
  const inside = { x: 300, y: 300, width: 420, height: 300 };
  assert.deepEqual(keepInside(inside, area), inside);
  const off = keepInside({ x: 1800, y: 900, width: 420, height: 300 }, area);
  assert.equal(off.x, 1920 - 420);
  assert.equal(off.y, 1040 - 300);
});
