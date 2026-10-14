/** A span of the normalized text, synthesized and highlighted as one unit. */
export interface TextSegment {
  text: string;
  /** Offsets into the normalized text: `normalized.slice(start, end) === text`. */
  start: number;
  end: number;
}

/** Longest segment sent to the speech engine in one request. */
export const MAX_SEGMENT_CHARS = 400;
/** The first segment is kept shorter so the first audio arrives sooner. */
export const FIRST_SEGMENT_CHARS = 200;
/** Sentences shorter than this are joined to the next one, so fragments like "e.g." do not stand alone. */
export const MIN_SEGMENT_CHARS = 60;

/**
 * Whitespace only: line endings become LF, a blank line separates paragraphs, and any other
 * run of whitespace becomes one space. The words themselves are never changed.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*\n\s*/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function trimmed(text: string, start: number, end: number): TextSegment | null {
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  return end > start ? { text: text.slice(start, end), start, end } : null;
}

/** Splits at the last space within `max`; a single word longer than `max` is cut at `max`. */
function splitLong(text: string, piece: TextSegment, max: number): TextSegment[] {
  const parts: TextSegment[] = [];
  let { start } = piece;
  while (piece.end - start > max) {
    const cut = text.lastIndexOf(' ', start + max);
    const end = cut > start ? cut : start + max;
    const part = trimmed(text, start, end);
    if (part) parts.push(part);
    start = end;
  }
  const rest = trimmed(text, start, piece.end);
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Splits normalized text into paragraphs, then sentences, in order. A segment never crosses a
 * paragraph break or cuts a word, unless one word is longer than `max`.
 */
export function segmentText(text: string, max = MAX_SEGMENT_CHARS): TextSegment[] {
  const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
  const out: TextSegment[] = [];
  let offset = 0;
  for (const paragraph of text.split('\n\n')) {
    let current: TextSegment | null = null;
    for (const { segment, index } of sentences.segment(paragraph)) {
      const sentence = trimmed(text, offset + index, offset + index + segment.length);
      if (!sentence) continue;
      const limit: number = out.length === 0 && current === null ? Math.min(max, FIRST_SEGMENT_CHARS) : max;
      const parts: TextSegment[] = splitLong(text, sentence, limit);
      for (const part of parts) {
        if (current && current.text.length < MIN_SEGMENT_CHARS && part.end - current.start <= max) {
          current = { text: text.slice(current.start, part.end), start: current.start, end: part.end };
          continue;
        }
        if (current) out.push(current);
        current = part;
      }
    }
    if (current) out.push(current);
    offset += paragraph.length + 2;
  }
  return out;
}
