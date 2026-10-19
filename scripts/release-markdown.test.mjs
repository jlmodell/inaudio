import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, highlight, highlights, parseReleaseMarkdown, whatsNewSince } from '../src/shared/update/release-markdown.ts';

// The real body of shikki841/inaudio v1.9.1.
const GENERATED = `<!-- Release notes generated using configuration in .github/release.yml at v1.9.1 -->

## What's Changed
### Other changes
* chore(release): prepare v1.9.1 by @BotCoder254 in https://github.com/shikki841/inaudio/pull/56


**Full Changelog**: https://github.com/shikki841/inaudio/compare/v1.9.0...v1.9.1`;

test('generated release notes become headings, items and lines', () => {
  assert.deepEqual(parseReleaseMarkdown(GENERATED), [
    { kind: 'heading', text: "What's Changed" },
    { kind: 'heading', text: 'Other changes' },
    { kind: 'item', text: 'chore(release): prepare v1.9.1 by @BotCoder254 in #56' },
    { kind: 'text', text: 'Full Changelog: v1.9.0...v1.9.1' },
  ]);
});

test('links keep their words; images, html and other urls are dropped', () => {
  const blocks = parseReleaseMarkdown('- See [the docs](https://example.com) ![shot](x.png) <img src=x onerror=alert(1)> now https://evil.example/x\n1. **Bold** and `code`');
  assert.deepEqual(blocks, [
    { kind: 'item', text: 'See the docs now' },
    { kind: 'item', text: 'Bold and code' },
  ]);
});

test('highlights skip chores and read like sentences', () => {
  assert.equal(highlight('feat(live): floating live window by @BotCoder254 in #59'), 'Floating live window');
  const note = {
    version: '1.9.2',
    name: 'v1.9.2',
    publishedAt: '',
    url: '',
    blocks: parseReleaseMarkdown('* chore: bump\n* feat(live): floating window by @a in #1\n* fix: faster start\n* feat: history drawer\n* feat: more'),
  };
  assert.deepEqual(highlights(note), ['Floating window', 'Faster start', 'History drawer']);
  assert.deepEqual(highlights(undefined), []);
});

test('what is new since the last seen version, filled from earlier releases when only chores', () => {
  const release = (version, body) => ({ version, name: `v${version}`, publishedAt: '', url: '', blocks: parseReleaseMarkdown(body) });
  const releases = [
    release('1.10.0', '* feat: not installed yet'),
    release('1.9.1', '* chore(release): prepare v1.9.1 by @a in #56'),
    release('1.9.0', '* fix(read-aloud): honor pauses by @b in #55'),
    release('1.8.0', '* feat(read-aloud): speak selected text by @a in #53\n* feat: second'),
  ];
  assert.equal(compareVersions('1.10.0', '1.9.2') > 0, true);
  assert.deepEqual(whatsNewSince(releases, '1.9.1', '1.8.0'), [
    { text: 'Honor pauses', version: '1.9.0' },
    { text: 'Speak selected text', version: '1.8.0' },
    { text: 'Second', version: '1.8.0' },
  ]);
  assert.deepEqual(whatsNewSince(releases, '1.9.1', '1.9.0', 1), [{ text: 'Honor pauses', version: '1.9.0' }]);
  assert.deepEqual(whatsNewSince([], '1.9.1', ''), []);
});
