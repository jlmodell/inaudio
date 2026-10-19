import assert from 'node:assert/strict';
import test from 'node:test';
import { dropRepeatedStart, forPunctuation, joinPassage, openSentenceStart } from '../src/shared/live/join.ts';
import { applyReplacements } from '../src/shared/text/replacements.ts';

const pause = (pauseBeforeMs = 0) => ({ cut: 'pause', pauseBeforeMs, overlapMs: 0 });

test('a passage after a hard cut continues the sentence', () => {
  const text = joinPassage('We still need the Linux packages.', 'limit', 'Signed before Thursday.', { cut: 'pause', pauseBeforeMs: 0, overlapMs: 0 }, true);
  assert.equal(text, 'We still need the Linux packages Signed before Thursday.');
  const lower = joinPassage('So for the release on.', 'limit', 'The other hand, we wait.', pause(), true);
  assert.equal(lower, 'So for the release on the other hand, we wait.');
});

test('a hard cut keeps question marks, ellipses and the pronoun I', () => {
  assert.equal(joinPassage('Can you take it?', 'limit', 'I think so.', pause(), true), 'Can you take it? I think so.');
  assert.equal(joinPassage('Wait...', 'limit', 'The build.', pause(), true), 'Wait... the build.');
});

test('a long pause after a finished sentence starts a paragraph, a short one does not', () => {
  assert.equal(joinPassage('First point.', 'pause', 'Second point.', pause(2_000), true), 'First point.\n\nSecond point.');
  assert.equal(joinPassage('First point.', 'pause', 'Second point.', pause(800), true), 'First point. Second point.');
  assert.equal(joinPassage('And then', 'pause', 'we left.', pause(3_000), true), 'And then we left.');
});

test('words repeated by the overlap are dropped once', () => {
  assert.equal(dropRepeatedStart('we should hold the macOS build', 'the macOS build until Friday'), 'until Friday');
  assert.equal(dropRepeatedStart('signed and reviewed.', 'Reviewed, then shipped.'), 'then shipped.');
  // One short common word is not enough evidence.
  assert.equal(dropRepeatedStart('give me the', 'the keys'), 'the keys');
  assert.equal(dropRepeatedStart('nothing alike here', 'completely different words'), 'completely different words');
  const joined = joinPassage('we should hold the macOS build.', 'limit', 'The macOS build until Friday.', { cut: 'pause', pauseBeforeMs: 0, overlapMs: 1_500 }, true);
  assert.equal(joined, 'we should hold the macOS build until Friday.');
});

test('smart joining off keeps one paragraph per passage', () => {
  assert.equal(joinPassage('One.', 'limit', 'Two.', pause(), false), 'One.\n\nTwo.');
  assert.equal(joinPassage('', null, '  First.  ', pause(), true), 'First.');
  assert.equal(joinPassage('Kept.', 'pause', '   ', pause(), true), 'Kept.');
});

test('the open sentence starts after the last finished one, within the paragraph', () => {
  const text = 'Done here. And this one is still going';
  assert.equal(text.slice(openSentenceStart(text)), 'And this one is still going');
  assert.equal(openSentenceStart('Old paragraph.\n\nNew start'), 'Old paragraph.\n\n'.length);
  assert.equal(openSentenceStart('All finished.'), 0);
});

test('text for the punctuation model is bare lower-case words', () => {
  assert.equal(forPunctuation('Okay, so: "Priya" can you take it? I\'ll  do it.'), "okay so priya can you take it i'll do it");
});

test('custom words replace whole words and phrases, case-insensitively', () => {
  const list = [
    { from: 'in audio', to: 'Inaudio' },
    { from: 'pre a', to: 'Priya' },
    { from: 'k8s', to: 'Kubernetes' },
  ];
  assert.equal(applyReplacements('Open In  Audio and ask pre a about k8s.', list), 'Open Inaudio and ask Priya about Kubernetes.');
  // Not inside longer words.
  assert.equal(applyReplacements('preamble and k8sx', list), 'preamble and k8sx');
});

test('custom words are literal: patterns and replacement tokens are not interpreted', () => {
  assert.equal(applyReplacements('cost is a.b today', [{ from: 'a.b', to: '$& $1' }]), 'cost is $& $1 today');
  assert.equal(applyReplacements('axb stays', [{ from: 'a.b', to: 'X' }]), 'axb stays');
  assert.equal(applyReplacements('unchanged', [{ from: '   ', to: 'X' }]), 'unchanged');
});
