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
