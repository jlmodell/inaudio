/**
 * The custom words list: fixes for names and terms the engine mishears. Whole words or
 * phrases only, matched without regard to case, applied in list order. No imports: the
 * script tests load this file directly.
 */

export interface Replacement {
  from: string;
  to: string;
}

export const MAX_REPLACEMENTS = 200;
export const MAX_REPLACEMENT_CHARS = 64;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds the matchers once; the result is reused for every passage of a session. */
export function compileReplacements(list: readonly Replacement[]): (text: string) => string {
  const rules = list
    .slice(0, MAX_REPLACEMENTS)
    .map(({ from, to }) => ({ from: from.trim().replace(/\s+/g, ' '), to }))
    .filter(({ from }) => from.length > 0 && from.length <= MAX_REPLACEMENT_CHARS)
    .map(({ from, to }) => ({
      // Letters or digits on either side mean the match is inside a longer word.
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(from).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'),
      // A literal: "$&" in the user's text must not reach String.replace as a pattern.
      to: to.slice(0, MAX_REPLACEMENT_CHARS),
    }));
  if (!rules.length) return (text) => text;
  return (text) => rules.reduce((out, rule) => out.replace(rule.pattern, () => rule.to), text);
}

export function applyReplacements(text: string, list: readonly Replacement[]): string {
  return compileReplacements(list)(text);
}
