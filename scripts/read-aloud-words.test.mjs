import assert from 'node:assert/strict';
import test from 'node:test';
import { splitWords, wordAtChar, wordCues } from '../src/shared/read-aloud/words.ts';

test('splitWords keeps offsets into the original string', () => {
  const words = splitWords('Hi there, world');
  assert.deepEqual(
    words.map((item) => item.word),
    ['Hi', 'there,', 'world'],
  );
  assert.equal(words[0].start, 0);
  assert.equal(words[1].start, 3);
  assert.equal(words[2].start, 10);
});

test('wordCues spread time by letter weight', () => {
  const cues = wordCues('Hi there', 700);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].word, 'Hi');
  assert.equal(cues[0].atMs, 0);
  assert.equal(cues[1].word, 'there');
  assert.equal(Math.round(cues[1].atMs), 200);
});

test('wordAtChar finds the word under a speech boundary', () => {
  assert.equal(wordAtChar('hello world', 0), 'hello');
  assert.equal(wordAtChar('hello world', 6), 'world');
  assert.equal(wordAtChar('hello world', 5), 'hello');
  assert.equal(wordAtChar('', 0), '');
});
