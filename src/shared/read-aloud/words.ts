export interface TextWord {
  word: string;
  start: number;
  end: number;
}

export function splitWords(text: string): TextWord[] {
  const out: TextWord[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    out.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return out;
}

export interface WordCue {
  word: string;
  atMs: number;
}

/** Spread `durationMs` across words by character weight so longer words linger. */
export function wordCues(text: string, durationMs: number): WordCue[] {
  const words = splitWords(text);
  if (!words.length || durationMs <= 0) return [];
  const weights = words.map((item) => Math.max(1, item.word.replace(/[^\p{L}\p{N}]/gu, '').length || 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let at = 0;
  return words.map((item, index) => {
    const cue = { word: item.word, atMs: at };
    at += (durationMs * (weights[index] ?? 1)) / total;
    return cue;
  });
}

export function wordAtChar(text: string, charIndex: number): string {
  const words = splitWords(text);
  if (!words.length) return '';
  const hit = words.find((item) => charIndex >= item.start && charIndex < item.end);
  if (hit) return hit.word;
  const previous = [...words].reverse().find((item) => item.start <= charIndex);
  return previous?.word ?? words[0]?.word ?? '';
}

/** The word whose cue has started by `atMs`, for one-word speed reading. */
export function wordAtMs(text: string, durationMs: number, atMs: number): string {
  const cues = wordCues(text, durationMs);
  if (!cues.length) return '';
  let current = cues[0]?.word ?? '';
  for (const cue of cues) {
    if (cue.atMs > atMs) break;
    current = cue.word;
  }
  return current;
}
