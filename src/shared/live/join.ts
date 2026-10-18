/**
 * Joins live passages into running text. Parakeet punctuates each chunk as if it were a
 * whole utterance, so a chunk cut at the hard limit ends in a full stop mid-sentence, and
 * the audio repeated after such a cut is transcribed twice. This undoes both and starts a
 * paragraph only after a real pause. No imports: the script tests load this file directly.
 */

export type PassageCut = 'pause' | 'limit' | 'end';

export interface PassageMeta {
  /** How the passage's audio ended. */
  cut: PassageCut;
  /** Quiet before the passage, in ms. */
  pauseBeforeMs: number;
  /** Audio at its start that repeats the previous passage, in ms. */
  overlapMs: number;
}

/** A pause at least this long, after a finished sentence, starts a new paragraph. */
export const PARAGRAPH_PAUSE_MS = 1_500;
/** Repeated words are looked for in at most this many words at the seam. */
const MAX_OVERLAP_WORDS = 12;

/** Words Parakeet capitalises only because it thinks a sentence starts there. */
const SENTENCE_STARTERS = new Set([
  'a', 'an', 'and', 'as', 'at', 'because', 'but', 'by', 'for', 'from', 'if', 'in', 'into', 'is',
  'it', 'its', 'of', 'on', 'or', 'so', 'that', 'the', 'then', 'there', 'these', 'they', 'this',
  'those', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'with',
  'you', 'your', 'he', 'she', 'his', 'her', 'our', 'their', 'not', 'no', 'yes', 'all', 'some',
  'about', 'after', 'before', 'over', 'under', 'just', 'also', 'like', 'how', 'why', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'may',
]);

const TERMINAL = /[.!?…]["'”’)\]]*$/;

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

/**
 * Drops the words at the start of `next` that repeat the end of `previous`: the longest
 * run, up to MAX_OVERLAP_WORDS, whose normalised words match. Nothing is dropped when no
 * run of at least one word matches, so a miss costs a repeated word, never a lost one.
 */
export function dropRepeatedStart(previous: string, next: string): string {
  const tail = previous.split(/\s+/).filter(Boolean).slice(-MAX_OVERLAP_WORDS).map(normalizeWord);
  const head = next.split(/\s+/).filter(Boolean);
  const headNorm = head.slice(0, MAX_OVERLAP_WORDS).map(normalizeWord);
  for (let size = Math.min(tail.length, headNorm.length); size > 0; size--) {
    let same = true;
    for (let i = 0; i < size; i++) {
      if (!tail[tail.length - size + i] || tail[tail.length - size + i] !== headNorm[i]) {
        same = false;
        break;
      }
    }
    // A single repeated short word ("the", "a") is too weak a match to trust.
    if (same && (size > 1 || (headNorm[0]?.length ?? 0) > 3)) return head.slice(size).join(' ');
  }
  return next;
}

/** Lowercases a first word that is only capitalised because a sentence seemed to start. */
function continueSentence(text: string): string {
  const match = /^(\S+)/.exec(text);
  const word = match?.[1];
  if (!word || word === 'I' || word.startsWith("I'")) return text;
  if (!SENTENCE_STARTERS.has(normalizeWord(word))) return text;
  return word.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Appends one passage to the text so far. `previousCut` is how the previous passage ended,
 * or null for the first one. With `smart` off this is the plain paragraph-per-passage join.
 */
export function joinPassage(
  text: string,
  previousCut: PassageCut | null,
  passage: string,
  meta: PassageMeta,
  smart: boolean,
): string {
  let next = passage.trim();
  if (!next) return text;
  if (!text) return next;
  if (!smart) return `${text}\n\n${next}`;

  let before = text;
  if (meta.overlapMs > 0) next = dropRepeatedStart(before, next);
  if (!next) return text;
  if (previousCut === 'limit') {
    // The cut fell mid-speech: its full stop and the capital after it are the model's guess.
    if (/[^.]\.$/.test(before)) before = before.slice(0, -1);
    next = continueSentence(next);
  }
  const paragraph = meta.pauseBeforeMs >= PARAGRAPH_PAUSE_MS && TERMINAL.test(before);
  return `${before}${paragraph ? '\n\n' : ' '}${next}`;
}

/**
 * Where the last unfinished sentence starts: after the last sentence-ending mark followed
 * by a space, and never before the current paragraph. Text from here on is what a
 * punctuation pass should see together with the next passage.
 */
export function openSentenceStart(text: string): number {
  const paragraph = text.lastIndexOf('\n\n');
  const floor = paragraph >= 0 ? paragraph + 2 : 0;
  const pattern = /[.!?…]["'”’)\]]*\s+/g;
  let start = floor;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const end = match.index + match[0].length;
    if (end > floor && end < text.length) start = end;
  }
  return start;
}

/** What the English punctuation model expects: lower case, words only, apostrophes kept. */
export function forPunctuation(text: string): string {
  return text
    .replace(/[.,!?;:…"“”()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
