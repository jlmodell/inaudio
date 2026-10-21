import assert from 'node:assert/strict';
import test from 'node:test';
import { rewriteModelUrl } from '../src/shared/web/model-url.ts';

const origin = 'https://inaudio.example';

test('rewriteModelUrl keeps same-origin fetches and maps Hugging Face onto the host', () => {
  assert.equal(rewriteModelUrl(`${origin}/browser-tts/x`, origin), `${origin}/browser-tts/x`);
  assert.equal(
    rewriteModelUrl(
      'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx',
      origin,
    ),
    `${origin}/browser-tts/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx`,
  );
  assert.equal(
    rewriteModelUrl(
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort-wasm-simd-threaded.wasm',
      origin,
    ),
    `${origin}/ort/ort-wasm-simd-threaded.wasm`,
  );
  assert.throws(
    () => rewriteModelUrl('https://evil.example/model.onnx', origin),
    /leave this Inaudio \(https:\/\/evil\.example\/model\.onnx\)/,
  );
});
