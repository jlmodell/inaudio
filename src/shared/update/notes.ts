/**
 * GitHub release notes arrive as HTML. They are turned into plain text in the main process,
 * so no markup from a release ever reaches a page. No imports: the script tests load this
 * file directly.
 */

export const MAX_RELEASE_NOTES_CHARS = 4_000;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16) || 32);
    if (name.startsWith('#') && name !== '#39') return String.fromCodePoint(Number(name.slice(1)) || 32);
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Removes a pattern until none is left, so removing one match cannot form another. */
function removeAll(text: string, pattern: RegExp): string {
  let previous: string;
  do {
    previous = text;
    text = text.replace(pattern, '');
  } while (text !== previous);
  return text;
}

/** One release's notes as readable lines: list items keep a bullet, everything else is text. */
function toText(html: string): string {
  const lines = removeAll(html, /<(script|style)[\s\S]*?<\/\1>/gi)
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|pre|blockquote)>/gi, '\n\n');
  return decode(removeAll(lines, /<[^>]*>/g).replace(/[<>]/g, ''))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function releaseNotesText(
  notes: string | readonly { version: string; note: string | null }[] | null | undefined,
): string {
  if (!notes) return '';
  const text =
    typeof notes === 'string'
      ? toText(notes)
      : notes
          .map(({ version, note }) => (note ? `${version}\n${toText(note)}` : ''))
          .filter(Boolean)
          .join('\n\n');
  return text.length > MAX_RELEASE_NOTES_CHARS ? `${text.slice(0, MAX_RELEASE_NOTES_CHARS).trimEnd()}…` : text;
}
