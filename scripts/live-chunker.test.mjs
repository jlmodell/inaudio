import assert from 'node:assert/strict';
import test from 'node:test';
import { Chunker } from '../src/renderer/features/live/chunker.ts';

const RATE = 16_000;
const BLOCK = 800; // 50 ms, what the capture worklet posts

function tone(ms, amplitude = 0.3) {
  const out = new Float32Array(Math.round((RATE * ms) / 1000));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return out;
}

function silence(ms) {
  return new Float32Array(Math.round((RATE * ms) / 1000));
}

function feed(chunker, ...parts) {
  const out = [];
  for (const part of parts) {
    for (let i = 0; i < part.length; i += BLOCK) out.push(...chunker.push(part.subarray(i, i + BLOCK)));
  }
  return out;
}

const ms = (samples) => Math.round((samples.length / RATE) * 1000);

test('a pause after enough speech ends a chunk', () => {
  const chunks = feed(new Chunker(), tone(7_000), silence(800));
  assert.equal(chunks.length, 1);
  assert.ok(ms(chunks[0]) >= 7_000);
});

test('a short pause before the minimum length does not end a chunk', () => {
  const chunker = new Chunker();
  assert.equal(feed(chunker, tone(3_000), silence(800), tone(1_000)).length, 0);
  const last = chunker.flush();
  assert.ok(last && ms(last) >= 4_800);
});

test('continuous speech is cut before the hard limit, at the quietest point near the end', () => {
  const chunker = new Chunker();
  // Loud speech with a brief dip 1.5 s before the 25 s limit.
  const chunks = feed(chunker, tone(23_500), tone(150, 0.002), tone(5_000));
  assert.equal(chunks.length, 1);
  const length = ms(chunks[0]);
  assert.ok(length > 23_400 && length < 23_700, `cut at ${length} ms`);
  const rest = chunker.flush();
  assert.ok(rest && ms(rest) > 4_000);
});

test('no chunk is ever longer than the hard limit', () => {
  const chunks = feed(new Chunker(), tone(80_000));
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) assert.ok(ms(chunk) <= 25_000);
});

test('silence is dropped instead of being transcribed', () => {
  const chunker = new Chunker();
  assert.deepEqual(feed(chunker, silence(60_000)), []);
  assert.equal(chunker.flush(), null);
  assert.ok(chunker.bufferedMs() < 1_000);
});

test('flush hands out the remaining speech once', () => {
  const chunker = new Chunker();
  feed(chunker, tone(2_000));
  assert.ok(chunker.flush());
  assert.equal(chunker.flush(), null);
});

test('peek copies the speech held so far without taking it', () => {
  const chunker = new Chunker();
  feed(chunker, tone(500));
  assert.equal(chunker.peek(), null, 'shorter than a second is not worth a guess');
  feed(chunker, tone(1_500));
  const first = chunker.peek();
  assert.ok(first && ms(first) >= 1_900 && ms(first) <= 2_100);
  first[0] = 99;
  feed(chunker, tone(5_000), silence(800));
  // The buffer was not changed by the copy, and peeking did not stop the chunk from ending.
  assert.equal(chunker.peek(), null);
});

test('peek ignores held quiet', () => {
  const chunker = new Chunker();
  feed(chunker, silence(400));
  assert.equal(chunker.peek(0), null);
});
