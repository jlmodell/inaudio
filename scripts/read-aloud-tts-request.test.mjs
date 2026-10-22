import assert from 'node:assert/strict';
import test from 'node:test';
import { KOKORO_VOICES } from '../src/shared/domain/models.ts';
import {
  float32Samples,
  playbackSampleRate,
  sameSpeakRequest,
  ttsSpeakRequest,
} from '../src/shared/read-aloud/tts-request.ts';

const persisted = {
  modelId: 'kokoro-en-v0_19',
  voiceId: '04',
  speed: 2,
  readAloudBuffer: 3,
};

test('typed text, clipboard and the shortcut resolve the same speak request', () => {
  const play = ttsSpeakRequest(persisted);
  const clipboard = ttsSpeakRequest(persisted);
  const hotkey = ttsSpeakRequest(persisted);
  assert.equal(play.sid, 4);
  assert.equal(play.speed, 2);
  assert.equal(play.sampleRate, 24_000);
  assert.equal(play.buffer, 3);
  assert.ok(sameSpeakRequest(play, clipboard));
  assert.ok(sameSpeakRequest(play, hotkey));
});

test('defaults are not used when a voice and speed are persisted', () => {
  const selected = ttsSpeakRequest(persisted);
  const fallback = ttsSpeakRequest({ modelId: 'kokoro-en-v0_19', voiceId: '00', speed: 1 });
  assert.notEqual(selected.sid, fallback.sid);
  assert.notEqual(selected.speed, fallback.speed);
  assert.equal(selected.sampleRate, fallback.sampleRate);
  assert.equal(sameSpeakRequest(selected, fallback), false);
});

test('speak sids stay aligned with the Kokoro catalog', () => {
  for (const voice of KOKORO_VOICES) {
    assert.equal(ttsSpeakRequest({ modelId: 'kokoro-en-v0_19', voiceId: voice.id, speed: 1 }).sid, voice.sid);
  }
});

test('an unknown voice fails instead of reading as speaker 0', () => {
  assert.throws(
    () => ttsSpeakRequest({ modelId: 'kokoro-en-v0_19', voiceId: 'Sky', speed: 2 }),
    /not part of Kokoro/,
  );
});

test('speed clamps to 0.5–3 so a missing value cannot whisper through as 0', () => {
  assert.equal(ttsSpeakRequest({ ...persisted, speed: Number.NaN }).speed, 1);
  assert.equal(ttsSpeakRequest({ ...persisted, speed: 0 }).speed, 0.5);
  assert.equal(ttsSpeakRequest({ ...persisted, speed: 8 }).speed, 3);
});

test('float32Samples keeps a 24 kHz frame count from a byte view', () => {
  const frames = new Float32Array([0.1, -0.2, 0.3]);
  const copy = float32Samples(new Uint8Array(frames.buffer, frames.byteOffset, frames.byteLength));
  assert.equal(copy.length, 3);
  assert.ok(Math.abs(copy[0] - 0.1) < 1e-6);
  assert.equal(playbackSampleRate(24_000, 24_000), 24_000);
  assert.equal(playbackSampleRate(0, 24_000), 24_000);
  assert.equal(playbackSampleRate(22_050, 24_000), 22_050);
});
