/**
 * Kokoro v1.0 English G2P: eSpeak-NG IPA plus the hexgrad/kokoro.js fixups, then
 * the official onnx-community/Kokoro-82M-v1.0-ONNX phoneme ids.
 *
 * kokoro-js `generate()` is supposed to do this, but the in-browser worker can
 * feed the tokenizer raw English letters. Those letters are in the vocab, so
 * the model speaks them as phonemes — English that sounds like another language.
 */

export type KokoroEspeakLang = 'en-us' | 'en';

export type EspeakPhonemize = (text: string, language: string) => Promise<string[]>;

/** `$` wraps every sequence (BOS/EOS) in tokenizer.json. */
export const KOKORO_PAD_ID = 0;

/** Character ids from Kokoro-82M-v1.0-ONNX/tokenizer.json. */
export const KOKORO_PHONEME_IDS: Readonly<Record<string, number>> = Object.freeze({
  $: 0,
  ';': 1,
  ':': 2,
  ',': 3,
  '.': 4,
  '!': 5,
  '?': 6,
  '\u2014': 9,
  '\u2026': 10,
  '"': 11,
  '(': 12,
  ')': 13,
  '\u201c': 14,
  '\u201d': 15,
  ' ': 16,
  '\u0303': 17,
  '\u02a3': 18,
  '\u02a5': 19,
  '\u02a6': 20,
  '\u02a8': 21,
  '\u1d5d': 22,
  '\uab67': 23,
  A: 24,
  I: 25,
  O: 31,
  Q: 33,
  S: 35,
  T: 36,
  W: 39,
  Y: 41,
  '\u1d4a': 42,
  a: 43,
  b: 44,
  c: 45,
  d: 46,
  e: 47,
  f: 48,
  h: 50,
  i: 51,
  j: 52,
  k: 53,
  l: 54,
  m: 55,
  n: 56,
  o: 57,
  p: 58,
  q: 59,
  r: 60,
  s: 61,
  t: 62,
  u: 63,
  v: 64,
  w: 65,
  x: 66,
  y: 67,
  z: 68,
  '\u0251': 69,
  '\u0250': 70,
  '\u0252': 71,
  '\u00e6': 72,
  '\u03b2': 75,
  '\u0254': 76,
  '\u0255': 77,
  '\u00e7': 78,
  '\u0256': 80,
  '\u00f0': 81,
  '\u02a4': 82,
  '\u0259': 83,
  '\u025a': 85,
  '\u025b': 86,
  '\u025c': 87,
  '\u025f': 90,
  '\u0261': 92,
  '\u0265': 99,
  '\u0268': 101,
  '\u026a': 102,
  '\u029d': 103,
  '\u026f': 110,
  '\u0270': 111,
  '\u014b': 112,
  '\u0273': 113,
  '\u0272': 114,
  '\u0274': 115,
  '\u00f8': 116,
  '\u0278': 118,
  '\u03b8': 119,
  '\u0153': 120,
  '\u0279': 123,
  '\u027e': 125,
  '\u027b': 126,
  '\u0281': 128,
  '\u027d': 129,
  '\u0282': 130,
  '\u0283': 131,
  '\u0288': 132,
  '\u02a7': 133,
  '\u028a': 135,
  '\u028b': 136,
  '\u028c': 138,
  '\u0263': 139,
  '\u0264': 140,
  '\u03c7': 142,
  '\u028e': 143,
  '\u0292': 147,
  '\u0294': 148,
  '\u02c8': 156,
  '\u02cc': 157,
  '\u02d0': 158,
  '\u02b0': 162,
  '\u02b2': 164,
  '\u2193': 169,
  '\u2192': 171,
  '\u2197': 172,
  '\u2198': 173,
  '\u1d7b': 177,
});

/** Known English sentence used to lock G2P + vocab against the server/kokoro-js path. */
export const KOKORO_ENGLISH_SAMPLE = 'Life is like a box of chocolates.';

/** eSpeak-NG `en-us` + kokoro-js post-process (phonemizer 1.2.1). */
export const KOKORO_ENGLISH_SAMPLE_PHONEMES = 'lˈaɪf ɪz lˈaɪk ɐ bˈɑːks ʌv tʃˈɑːkləts.';

/** `$` + one id per phoneme character + `$`. */
export const KOKORO_ENGLISH_SAMPLE_IDS = [
  0, 54, 156, 43, 102, 48, 16, 102, 68, 16, 54, 156, 43, 102, 53, 16, 70, 16, 44, 156, 69, 158, 53, 61, 16, 138, 64,
  16, 62, 131, 156, 69, 158, 53, 54, 83, 62, 61, 4, 0,
] as const;

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${escapeRegExp(PUNCTUATION)}]+\\s*)+`, 'g');
const ENGLISH_IPA = /[əɪɑɐʌʊɔæʃʒθðŋɹˈˌː]/;

export function kokoroEspeakLang(voice: string): KokoroEspeakLang {
  return voice.startsWith('b') ? 'en' : 'en-us';
}

export function textNeedsEnglishIpa(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

export function isEnglishIpa(phonemes: string): boolean {
  return ENGLISH_IPA.test(phonemes);
}

export async function phonemizeForKokoro(
  text: string,
  language: KokoroEspeakLang,
  phonemize: EspeakPhonemize,
): Promise<string> {
  const normalized = normalizeKokoroText(text);
  const parts = splitKeeping(normalized, PUNCTUATION_PATTERN);
  const rendered = await Promise.all(
    parts.map(async (part) => (part.keep ? part.text : (await phonemize(part.text, language)).join(' '))),
  );
  return applyEnglishPhonemeFixups(rendered.join(''), language);
}

/** Style row in the 510×256 voice pack: token count includes the `$` pads. */
export function kokoroStyleOffset(tokenCount: number): number {
  return 256 * Math.min(Math.max(tokenCount - 2, 0), 509);
}

export function encodeKokoroPhonemes(phonemes: string): number[] {
  const ids = [KOKORO_PAD_ID];
  for (const char of phonemes) {
    const id = KOKORO_PHONEME_IDS[char];
    if (id !== undefined) ids.push(id);
  }
  ids.push(KOKORO_PAD_ID);
  return ids;
}

/** Same replacements as kokoro-js `phonemize()` after eSpeak-NG. */
export function applyEnglishPhonemeFixups(phonemes: string, language: KokoroEspeakLang): string {
  let processed = phonemes
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (language === 'en-us') processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return processed.trim();
}

/** Same number / abbreviation expansion as kokoro-js. */
export function normalizeKokoroText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/[“”]/g, '"')
    .replace(/\(/g, '«')
    .replace(/\)/g, '»')
    .replace(/、/g, ', ')
    .replace(/。/g, '. ')
    .replace(/！/g, '! ')
    .replace(/，/g, ', ')
    .replace(/：/g, ': ')
    .replace(/；/g, '; ')
    .replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ')
    .replace(/  +/, ' ')
    .replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (match) => match.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

function splitKeeping(text: string, regex: RegExp): { keep: boolean; text: string }[] {
  const parts: { keep: boolean; text: string }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(regex)) {
    const run = match[0];
    const index = match.index ?? 0;
    if (cursor < index) parts.push({ keep: false, text: text.slice(cursor, index) });
    if (run.length > 0) parts.push({ keep: true, text: run });
    cursor = index + run.length;
  }
  if (cursor < text.length) parts.push({ keep: false, text: text.slice(cursor) });
  return parts;
}

function splitNum(match: string): string {
  if (match.includes('.')) return match;
  if (match.includes(':')) {
    const [hours, minutes = 0] = match.split(':').map(Number);
    if (minutes === 0) return `${hours} o'clock`;
    if (minutes < 10) return `${hours} oh ${minutes}`;
    return `${hours} ${minutes}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith('s') ? 's' : '';
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const bill = match[0] === '$' ? 'dollar' : 'pound';
  if (Number.isNaN(Number(match.slice(1)))) return `${match.slice(1)} ${bill}s`;
  if (!match.includes('.')) {
    const suffix = match.slice(1) === '1' ? '' : 's';
    return `${match.slice(1)} ${bill}${suffix}`;
  }
  const [bills, fraction = '0'] = match.slice(1).split('.');
  const coins = parseInt(fraction.padEnd(2, '0'), 10);
  const coinName = match[0] === '$' ? (coins === 1 ? 'cent' : 'cents') : coins === 1 ? 'penny' : 'pence';
  return `${bills} ${bill}${bills === '1' ? '' : 's'} and ${coins} ${coinName}`;
}

function pointNum(match: string): string {
  const [whole, fraction = ''] = match.split('.');
  return `${whole} point ${fraction.split('').join(' ')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
