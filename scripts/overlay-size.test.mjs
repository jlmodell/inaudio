import assert from 'node:assert/strict';
import test from 'node:test';
import { overlayAlign, overlayPillWidth, overlaySize } from '../src/main/windows/overlay-size.ts';

const overlay = {
  enabled: true,
  visibility: 'always',
  position: 'bottom',
  display: 'cursor',
  opacity: 1,
  clickThrough: true,
  showTimer: true,
  showLevel: true,
  showModel: false,
  showLanguage: false,
  toggleShortcut: '',
};
const content = {
  phase: 'idle',
  armed: false,
  message: false,
  menuOpen: false,
  devices: 1,
  language: false,
  reading: null,
  live: false,
};

test('the timer and level only take room while listening', () => {
  const idle = overlayPillWidth(overlay, content);
  const listening = overlayPillWidth(overlay, { ...content, phase: 'listening' });
  assert.ok(listening > idle);
  assert.equal(idle, overlayPillWidth({ ...overlay, showTimer: false, showLevel: false }, content));
});

test('controls only take room while armed, and a second microphone adds its picker', () => {
  const rest = overlayPillWidth(overlay, content);
  const armed = overlayPillWidth(overlay, { ...content, armed: true });
  const twoMics = overlayPillWidth(overlay, { ...content, armed: true, devices: 2 });
  assert.ok(armed > rest);
  assert.ok(twoMics > armed);
});

test('an error with a message gets room to be read, and its controls are not counted', () => {
  const failed = overlayPillWidth(overlay, { ...content, phase: 'error', armed: true });
  const withMessage = overlayPillWidth(overlay, { ...content, phase: 'error', message: true });
  assert.ok(withMessage - failed >= 180);
  assert.equal(failed, overlayPillWidth(overlay, { ...content, phase: 'error' }));
});

test('the language chip appears only for a multilingual model and gives way to controls', () => {
  const settings = { ...overlay, showLanguage: true };
  assert.equal(overlayPillWidth(settings, content), overlayPillWidth(overlay, content));
  assert.ok(overlayPillWidth(settings, { ...content, language: true }) > overlayPillWidth(overlay, content));
});

test('a reading session replaces the readout while dictation is idle', () => {
  const reading = overlayPillWidth(overlay, { ...content, reading: { message: false } });
  const armed = overlayPillWidth(overlay, { ...content, reading: { message: false }, armed: true });
  const failed = overlayPillWidth(overlay, { ...content, reading: { message: true } });
  assert.ok(reading > overlayPillWidth(overlay, content));
  assert.ok(armed > reading);
  assert.ok(failed > reading);
  const listening = overlayPillWidth(overlay, { ...content, phase: 'listening', reading: { message: false } });
  assert.equal(listening, overlayPillWidth(overlay, { ...content, phase: 'listening' }));
});

test('a live session takes the pill ahead of reading but behind dictation', () => {
  const live = overlayPillWidth(overlay, { ...content, live: true });
  const withReading = overlayPillWidth(overlay, { ...content, live: true, reading: { message: false } });
  const armed = overlayPillWidth(overlay, { ...content, live: true, armed: true });
  assert.ok(live > overlayPillWidth(overlay, content));
  assert.equal(withReading, live);
  assert.ok(armed > overlayPillWidth({ ...overlay, showLevel: false }, { ...content, live: true }));
  const listening = overlayPillWidth(overlay, { ...content, phase: 'listening', live: true });
  assert.equal(listening, overlayPillWidth(overlay, { ...content, phase: 'listening' }));
});

test('the window adds the shadow pad and room for an open menu', () => {
  const closed = overlaySize(overlay, content);
  const open = overlaySize(overlay, { ...content, menuOpen: true });
  assert.equal(closed.width, overlayPillWidth(overlay, content) + 32);
  assert.ok(open.height > closed.height);
});

test('the pill holds the edge its position names', () => {
  assert.equal(overlayAlign('top-left'), 'left');
  assert.equal(overlayAlign('bottom'), 'center');
  assert.equal(overlayAlign('bottom-right'), 'right');
});
