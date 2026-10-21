import assert from 'node:assert/strict';
import test from 'node:test';
import { isWebGpuFailure, voiceErrorText } from '../src/shared/web/voice-error.ts';

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

test('isWebGpuFailure matches adapter and JSEP failures only', () => {
  assert.equal(isWebGpuFailure(new Error('WebGPU has no adapter in this worker.')), true);
  assert.equal(isWebGpuFailure(new Error('Failed to create JSEP kernel')), true);
  assert.equal(isWebGpuFailure(new Error('Could not fetch /browser-tts/x (404)')), false);
});
