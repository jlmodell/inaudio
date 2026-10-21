import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_TTS_BYTES,
  BROWSER_TTS_FILES,
  BROWSER_TTS_MODEL_ID,
  BROWSER_TTS_VOICE_BYTES,
  browserTtsFile,
  browserTtsVoicePath,
  browserTtsVoiceUrl,
  isEnglishKokoroVoice,
} from '../src/shared/web/browser-tts.ts';
import {
  BROWSER_VOICE_BY_ID,
  browserVoiceName,
  clampReadSpeed,
  DEFAULT_READ_ALOUD_ENGINE,
  effectiveReadAloudEngine,
  formatSpokenDiag,
  kokoroRuntime,
  MAX_READ_SPEED,
  readAloudProgressPercent,
  readAloudRuntimeLabel,
  sentenceRealtimeFactor,
  wasmThreadCount,
} from '../src/shared/web/read-aloud-engine.ts';

test('read-aloud defaults to the on-device voice', () => {
  assert.equal(DEFAULT_READ_ALOUD_ENGINE, 'browser');
  assert.equal(effectiveReadAloudEngine('browser', null), 'browser');
  assert.equal(effectiveReadAloudEngine('browser', 'speech'), 'speech');
  assert.equal(effectiveReadAloudEngine('server', 'speech'), 'server');
  assert.equal(effectiveReadAloudEngine('speech', null), 'speech');
});

test('desktop voice ids map onto Kokoro v1 names', () => {
  assert.equal(browserVoiceName('00'), 'af_heart');
  assert.equal(browserVoiceName('01'), 'af_bella');
  assert.equal(browserVoiceName('10'), 'bm_lewis');
  assert.equal(browserVoiceName('unknown'), 'af_heart');
  assert.equal(Object.keys(BROWSER_VOICE_BY_ID).length, 11);
  assert.ok(Object.values(BROWSER_VOICE_BY_ID).every((name) => isEnglishKokoroVoice(name)));
  assert.equal(
    Object.values(BROWSER_VOICE_BY_ID).some((name) => name.startsWith('zf_') || name.startsWith('zm_')),
    false,
  );
  assert.equal(isEnglishKokoroVoice('zf_xiaoxiao'), false);
  assert.equal(isEnglishKokoroVoice('zm_yunxi'), false);
  assert.equal(browserTtsVoiceUrl('af_heart'), '/browser-tts/onnx-community/Kokoro-82M-v1.0-ONNX/voices/af_heart.bin');
  assert.throws(() => browserTtsVoicePath('zf_xiaoxiao'), /not an English Kokoro voice/);
});

test('catalog Heart voice is the English pack, not a Chinese zf_ file', () => {
  const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
  const heart = readFileSync(path.join(root, 'node_modules/kokoro-js/voices/af_heart.bin'));
  const xiaoxiao = readFileSync(path.join(root, 'node_modules/kokoro-js/voices/zf_xiaoxiao.bin'));
  const catalog = browserTtsFile(`${BROWSER_TTS_MODEL_ID}/voices/af_heart.bin`);
  assert.equal(heart.byteLength, BROWSER_TTS_VOICE_BYTES);
  assert.equal(createHash('sha256').update(heart).digest('hex'), catalog?.sha256);
  assert.notEqual(createHash('sha256').update(heart).digest('hex'), createHash('sha256').update(xiaoxiao).digest('hex'));
});

test('browser TTS catalog is the q8 model plus the English voices', () => {
  assert.equal(BROWSER_TTS_MODEL_ID, 'onnx-community/Kokoro-82M-v1.0-ONNX');
  assert.ok(BROWSER_TTS_BYTES > 90_000_000);
  assert.ok(browserTtsFile(`${BROWSER_TTS_MODEL_ID}/onnx/model_quantized.onnx`));
  assert.ok(browserTtsFile(`${BROWSER_TTS_MODEL_ID}/voices/af_heart.bin`));
  assert.equal(browserTtsFile('nope'), undefined);
  assert.ok(BROWSER_TTS_FILES.every((file) => file.sha256.length === 64));
});

test('download progress is a 0-100 percent', () => {
  assert.equal(readAloudProgressPercent(0, 100), 0);
  assert.equal(readAloudProgressPercent(50, 100), 50);
  assert.equal(readAloudProgressPercent(100, 100), 100);
  assert.equal(readAloudProgressPercent(1, 0), 0);
});

test('read speed clamps to 0.5–3', () => {
  assert.equal(MAX_READ_SPEED, 3);
  assert.equal(clampReadSpeed(1.25), 1.25);
  assert.equal(clampReadSpeed(0.1), 0.5);
  assert.equal(clampReadSpeed(4), 3);
  assert.equal(clampReadSpeed(Number.NaN), 1);
});

test('Kokoro runtime follows device and isolation', () => {
  assert.equal(wasmThreadCount(false, 8), 1);
  assert.equal(wasmThreadCount(true, 16), 8);
  assert.equal(wasmThreadCount(true, 4), 4);
  assert.equal(kokoroRuntime('webgpu', 1), 'webgpu');
  assert.equal(kokoroRuntime('wasm', 4), 'wasm-multi');
  assert.equal(kokoroRuntime('wasm', 1), 'wasm-single');
  assert.equal(readAloudRuntimeLabel('wasm-single'), 'WASM, 1 thread');
  assert.equal(sentenceRealtimeFactor({ index: 0, count: 1, chars: 10, generateMs: 2000, durationMs: 1000 }), 2);
  assert.equal(sentenceRealtimeFactor({ index: 0, count: 1, chars: 10, generateMs: 500, durationMs: 0 }), 0);
});

test('diagnostic text names the English voice and its phonemes', () => {
  assert.equal(
    formatSpokenDiag('af_heart', 'lˈaɪf ɪz lˈaɪk ɐ bˈɑːks ʌv tʃˈɑːkləts.'),
    'af_heart. Phonemes: lˈaɪf ɪz lˈaɪk ɐ bˈɑːks ʌv tʃˈɑːkləts.',
  );
  assert.doesNotMatch(formatSpokenDiag('af_heart', 'lˈaɪf'), /zf_|xiaoxiao/);
});
