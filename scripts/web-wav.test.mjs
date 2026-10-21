import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFloat32le, decodeWav, encodeWav } from '../src/server/wav.ts';

test('round-trips 16-bit mono WAV', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0.25]);
  const wav = encodeWav(samples, 16_000);
  const decoded = decodeWav(wav);
  assert.equal(decoded.sampleRate, 16_000);
  assert.equal(decoded.samples.length, 4);
  assert.ok(Math.abs((decoded.samples[1] ?? 0) - 0.5) < 0.01);
  assert.ok(Math.abs((decoded.samples[2] ?? 0) + 0.5) < 0.01);
});

test('rejects a truncated file', () => {
  assert.throws(() => decodeWav(Buffer.from('RIFF')), /WAV/);
});

test('reads float32le payloads', () => {
  const samples = new Float32Array([0.1, -0.2]);
  const decoded = decodeFloat32le(Buffer.from(samples.buffer), 16_000);
  assert.equal(decoded.sampleRate, 16_000);
  assert.equal(decoded.samples.length, 2);
});
