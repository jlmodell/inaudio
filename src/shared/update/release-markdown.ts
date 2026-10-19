/**
 * GitHub release bodies are Markdown, usually the generated "What's Changed" list. They are
 * reduced to plain headings, list items and lines here, in the main process, so a release can
 * never put markup, links or images into a page. No imports: the script tests load this file
 * directly.
 */

export type ReleaseBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; text: string }
  | { kind: 'text'; text: string };

export interface ReleaseNote {
  /** The tag without its leading "v", e.g. "1.9.2". */
  version: string;
  name: string;
  publishedAt: string;
  /** The release page on github.com. */
  url: string;
  blocks: ReleaseBlock[];
}

const MAX_BLOCKS = 200;
const MAX_LINE = 400;

/** Inline Markdown to plain words: links keep their text, PR and compare links shrink. */
function inline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/(\d+)/g, '#$1')
    .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/compare\/(\S+)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE);
}

export function parseReleaseMarkdown(markdown: string): ReleaseBlock[] {
  const blocks: ReleaseBlock[] = [];
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    if (blocks.length >= MAX_BLOCKS) break;
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const text = inline(heading?.[1] ?? item?.[1] ?? line);
    if (!text) continue;
    blocks.push(heading ? { kind: 'heading', text } : item ? { kind: 'item', text } : { kind: 'text', text });
  }
  return blocks;
}

/**
 * A release item as a short highlight: no conventional-commit prefix, no "by @someone in #12",
 * first letter up. Used where a few items stand in for a whole release.
 */
export function highlight(text: string): string {
  const plain = text
    .replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:\s*/i, '')
    .replace(/\s+by\s+@[\w-]+(\s+in\s+#\d+)?\s*$/i, '')
    .trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Release items worth leading with: changes people notice, not release chores. */
export function highlights(note: ReleaseNote | undefined, count = 3): string[] {
  if (!note) return [];
  return note.blocks
    .filter((block) => block.kind === 'item' && !/^(chore|ci|build|docs|test)(\(|:)/i.test(block.text))
    .map((block) => highlight(block.text))
    .filter(Boolean)
    .slice(0, count);
}

/** Orders "1.10.0" after "1.9.2"; anything after the numbers is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => (/^(\d+)\.(\d+)\.(\d+)/.exec(version) ?? []).slice(1).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export interface WhatsNewItem {
  text: string;
  version: string;
}

/**
 * What changed since the version someone last saw, newest first, from the releases themselves.
 * Releases newer than the installed one are left out. When those releases hold only chores,
 * the notable items of earlier releases fill in, so a chore-only release never shows nothing.
 */
export function whatsNewSince(releases: ReleaseNote[], current: string, seen: string, count = 3): WhatsNewItem[] {
  const installed = releases
    .filter((release) => compareVersions(release.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  const pick = (list: ReleaseNote[]) =>
    list.flatMap((release) => highlights(release, count).map((text) => ({ text, version: release.version })));
  const since = seen ? installed.filter((release) => compareVersions(release.version, seen) > 0) : installed.slice(0, 1);
  const items = pick(since);
  if (items.length >= count) return items.slice(0, count);
  const earlier = installed.filter((release) => !since.includes(release));
  return [...items, ...pick(earlier)].slice(0, count);
}
