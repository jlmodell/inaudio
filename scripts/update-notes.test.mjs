import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RELEASE_NOTES_CHARS, releaseNotesText } from '../src/shared/update/notes.ts';

test('release HTML becomes plain lines with bullets', () => {
  const html = '<h2>What&#39;s new</h2><ul><li>Live <b>window</b></li><li>History &amp; export</li></ul><p>Thanks!<br>Team</p>';
  assert.equal(releaseNotesText(html), "What's new\n\n• Live window\n• History & export\n\nThanks!\nTeam");
});

test('scripts, styles and stray markup never survive', () => {
  const out = releaseNotesText('<script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)>Safe &lt;tag&gt;');
  assert.equal(out, 'Safe <tag>');
});

test('per-version notes are joined, empty ones skipped, and long notes capped', () => {
  assert.equal(releaseNotesText([{ version: '1.9.2', note: '<p>Fix</p>' }, { version: '1.9.1', note: null }]), '1.9.2\nFix');
  assert.equal(releaseNotesText(null), '');
  const long = releaseNotesText(`<p>${'word '.repeat(2_000)}</p>`);
  assert.ok(long.length <= MAX_RELEASE_NOTES_CHARS + 1 && long.endsWith('…'));
});
