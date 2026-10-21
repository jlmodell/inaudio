import assert from 'node:assert/strict';
import test from 'node:test';
import { phonemize } from 'phonemizer';
import {
  encodeKokoroPhonemes,
  isEnglishIpa,
  kokoroEspeakLang,
  kokoroStyleOffset,
  KOKORO_ENGLISH_SAMPLE,
  KOKORO_ENGLISH_SAMPLE_IDS,
  KOKORO_ENGLISH_SAMPLE_PHONEMES,
  phonemizeForKokoro,
  textNeedsEnglishIpa,
} from '../src/shared/web/kokoro-phonemes.ts';

test('American voices use en-us; British voices use en', () => {
  assert.equal(kokoroEspeakLang('af_heart'), 'en-us');
  assert.equal(kokoroEspeakLang('am_michael'), 'en-us');
  assert.equal(kokoroEspeakLang('bf_emma'), 'en');
  assert.equal(kokoroEspeakLang('bm_lewis'), 'en');
});

test('a sample English sentence phonemizes to Kokoro en-us IPA and those token ids', async () => {
  const phonemes = await phonemizeForKokoro(KOKORO_ENGLISH_SAMPLE, 'en-us', phonemize);
  assert.equal(phonemes, KOKORO_ENGLISH_SAMPLE_PHONEMES);
  assert.deepEqual(encodeKokoroPhonemes(phonemes), [...KOKORO_ENGLISH_SAMPLE_IDS]);
});

test('style row follows the phoneme count without the pad tokens', () => {
  assert.equal(kokoroStyleOffset(KOKORO_ENGLISH_SAMPLE_IDS.length), 256 * (KOKORO_ENGLISH_SAMPLE_IDS.length - 2));
  assert.equal(kokoroStyleOffset(2), 0);
  assert.equal(kokoroStyleOffset(512), 256 * 509);
});

test('raw English letters are not the phoneme string the model should see', () => {
  assert.equal(isEnglishIpa(KOKORO_ENGLISH_SAMPLE), false);
  assert.equal(isEnglishIpa(KOKORO_ENGLISH_SAMPLE_PHONEMES), true);
  assert.equal(textNeedsEnglishIpa(KOKORO_ENGLISH_SAMPLE), true);
  const rawIds = encodeKokoroPhonemes(KOKORO_ENGLISH_SAMPLE);
  assert.notDeepEqual(rawIds, [...KOKORO_ENGLISH_SAMPLE_IDS]);
  assert.ok(rawIds.length < KOKORO_ENGLISH_SAMPLE_IDS.length);
});
