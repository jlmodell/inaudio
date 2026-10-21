import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_TTS_BYTES,
  BROWSER_TTS_FILES,
  BROWSER_TTS_MODEL_ID,
  browserTtsFile,
} from '../src/shared/web/browser-tts.ts';
import {
  BROWSER_VOICE_BY_ID,
  browserVoiceName,
  DEFAULT_READ_ALOUD_ENGINE,
  effectiveReadAloudEngine,
  readAloudProgressPercent,
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
