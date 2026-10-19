import assert from 'node:assert/strict';
import test from 'node:test';
import { highlight, highlights, parseReleaseMarkdown } from '../src/shared/update/release-markdown.ts';

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
