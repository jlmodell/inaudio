import assert from 'node:assert/strict';
import test from 'node:test';
import { failingUrlFromText, isWebGpuFailure, voiceErrorText, workerFailureText } from '../src/shared/web/voice-error.ts';

test('voiceErrorText keeps the message, stack, and cause', () => {
  const inner = new Error('no adapter');
  const error = new Error('WebGPU failed');
  error.cause = inner;
  error.stack = 'Error: WebGPU failed\n    at load';
  const text = voiceErrorText(error);
  assert.match(text, /WebGPU failed/);
  assert.match(text, /no adapter/);
  assert.match(text, /at load/);
});

test('workerFailureText keeps the worker message, file, line, and failing URL', () => {
  assert.equal(
    workerFailureText({
      message: 'Could not fetch /browser-tts/voices/af_heart.bin (404)',
      filename: 'http://inaudio.example/assets/kokoro.worker.js',
      lineno: 12,
      colno: 3,
    }),
    'Could not fetch /browser-tts/voices/af_heart.bin (404) http://inaudio.example/assets/kokoro.worker.js:12:3',
  );
  assert.equal(
    workerFailureText({
      message: 'Script error.',
      filename: '',
      lineno: 0,
      colno: 0,
      url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    }),
    'url: https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  );
  assert.equal(workerFailureText({ message: '', filename: '', url: '' }), 'The on-device voice could not start.');
  assert.equal(
    failingUrlFromText('Failed to fetch dynamically imported module: http://x/ort/ort-wasm-simd-threaded.mjs'),
    'http://x/ort/ort-wasm-simd-threaded.mjs',
  );
});

test('isWebGpuFailure matches adapter and JSEP failures only', () => {
  assert.equal(isWebGpuFailure(new Error('WebGPU has no adapter in this worker.')), true);
  assert.equal(isWebGpuFailure(new Error('Failed to create JSEP kernel')), true);
  assert.equal(isWebGpuFailure(new Error('Could not fetch /browser-tts/x (404)')), false);
});
