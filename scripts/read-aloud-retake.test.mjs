import assert from 'node:assert/strict';
import test from 'node:test';
import { IDLE_READ_ALOUD } from '../src/shared/domain/read-aloud.ts';
import { dropBufferedFrom, retakeFromCurrent } from '../src/shared/read-aloud/retake.ts';
import { normalizeText, segmentText, textFromSegmentIndex } from '../src/shared/read-aloud/segment.ts';

test('a voice change drops the current sentence and everything ahead', () => {
  const delivered = dropBufferedFrom([0, 1, 2, 3], 1);
  assert.deepEqual([...delivered], [0]);
  const next = retakeFromCurrent(
    {
      ...IDLE_READ_ALOUD,
      sessionId: 's',
      status: 'playing',
      index: 1,
      count: 4,
      take: 0,
      seek: 0,
      durations: [800, 900, 700, 0],
      voiceId: '00',
      speed: 1,
    },
    '04',
    2,
  );
  assert.equal(next.take, 1);
  assert.equal(next.seek, 1);
  assert.equal(next.voiceId, '04');
  assert.equal(next.speed, 2);
  assert.equal(next.index, 1);
  assert.equal(next.waiting, true);
  assert.deepEqual(next.durations, [800, 0, 0, 0]);
});

test('remaining text starts at the current sentence', () => {
  const text = normalizeText(
    'The lighthouse keeper lit the lamp before dusk settled on the harbour. He had kept that same watch for thirty years on those stairs, and the climb still left him short of breath every evening.',
  );
  const segments = segmentText(text);
  assert.ok(segments.length >= 2);
  assert.equal(textFromSegmentIndex(text, segments, 0), text);
  assert.equal(textFromSegmentIndex(text, segments, 1), text.slice(segments[1].start));
  assert.match(textFromSegmentIndex(text, segments, 1), /thirty years/);
});
