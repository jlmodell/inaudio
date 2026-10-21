import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIRST_SEGMENT_CHARS,
  MAX_SEGMENT_CHARS,
  normalizeText,
  segmentText,
} from '../src/shared/read-aloud/segment.ts';

function check(text, max = MAX_SEGMENT_CHARS) {
  const normalized = normalizeText(text);
  const segments = segmentText(normalized, max);
  let previous = -1;
  for (const segment of segments) {
    assert.equal(normalized.slice(segment.start, segment.end), segment.text);
    assert.ok(segment.text.length <= max, `segment of ${segment.text.length} chars`);
    assert.ok(segment.start > previous, 'segments stay in order');
    assert.equal(segment.text, segment.text.trim());
    previous = segment.start;
  }
  return { normalized, segments };
}

test('normalizes whitespace without touching words', () => {
  assert.equal(normalizeText('  One\r\ntwo\tthree  \r\n\r\n\r\n Four. '), 'One two three\n\nFour.');
  assert.equal(normalizeText('\n \n'), '');
});

test('splits sentences and never crosses a paragraph', () => {
  const { normalized, segments } = check(
    'The first sentence is comfortably long enough to stand on its own here. The second one is long enough too, as it happens.\n\nA new paragraph starts here and keeps going.',
  );
  assert.equal(segments.length, 3);
  const breakAt = normalized.indexOf('\n\n');
  for (const segment of segments) assert.ok(segment.end <= breakAt || segment.start > breakAt);
});

test('joins short fragments to the next sentence', () => {
  const { segments } = check('Hi. Yes. This sentence carries on for a while so that it is long enough.');
  assert.equal(segments.length, 1);
});

test('does not grow the first segment past FIRST_SEGMENT_CHARS', () => {
  const { segments } = check(
    'The lighthouse keeper lit the lamp. He had kept that same watch for thirty years on those stairs, and the climb still left him short of breath every evening.',
  );
  assert.ok(segments.length >= 2);
  assert.ok(segments[0].text.length <= FIRST_SEGMENT_CHARS);
  assert.match(segments[0].text, /lighthouse keeper/);
});

test('splits an overlong sentence at a space, never inside a word', () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
  const { segments } = check(`${words}.`);
  assert.ok(segments.length > 1);
  assert.ok(segments[0].text.length <= FIRST_SEGMENT_CHARS);
  for (const segment of segments) assert.match(segment.text, /^word\d+/);
});

test('cuts a single token longer than the limit', () => {
  const { segments } = check('x'.repeat(1000));
  assert.ok(segments.length >= 3);
  assert.equal(segments.map((s) => s.text).join(''), 'x'.repeat(1000));
});

test('keeps non-Latin text and emoji intact', () => {
  const text = 'Привет, мир. Это проверка разбиения текста на предложения, достаточно длинная. 🎧 Done here, finally!';
  const { segments, normalized } = check(text);
  assert.equal(segments.map((s) => s.text).join(' '), normalized);
});

test('empty input gives no segments', () => {
  assert.deepEqual(segmentText(normalizeText('   ')), []);
});
