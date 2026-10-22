import type { ModelId, VoiceId } from '../domain/models';

const DEFAULT_READ_ALOUD_BUFFER = 3;

function clampReadSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(3, Math.max(0.5, Math.round(speed * 20) / 20));
}

function clampAhead(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_READ_ALOUD_BUFFER;
  return Math.min(8, Math.max(1, Math.round(value)));
}

/** Kokoro v0.19 speaker ids — keep in lockstep with `KOKORO_VOICES`. */
const KOKORO_SID: Record<string, number> = {
  '00': 0,
  '01': 1,
  '02': 2,
  '03': 3,
  '04': 4,
  '05': 5,
  '06': 6,
  '07': 7,
  '08': 8,
  '09': 9,
  '10': 10,
};

const KOKORO_SAMPLE_RATE = 24_000;

/** The fields Read Aloud needs from persisted TTS settings to synthesize a sentence. */
export interface TtsSettingsView {
  modelId: ModelId;
  voiceId: string;
  speed: number;
  readAloudBuffer?: number;
}

/** One synthesis job: the same object for typed text, the clipboard, and the shortcut. */
export interface TtsSpeakRequest {
  modelId: ModelId;
  voiceId: VoiceId;
  sid: number;
  speed: number;
  sampleRate: number;
  buffer: number;
}

/**
 * Resolves voice, speed, sample rate and buffer from persisted settings. Clipboard and
 * hotkey starts must call this — they do not have a renderer-side sid/speed to send.
 */
export function ttsSpeakRequest(tts: TtsSettingsView): TtsSpeakRequest {
  if (tts.modelId !== 'kokoro-en-v0_19') {
    throw new Error(`Model ${tts.modelId} is not installed in this build`);
  }
  const sid = KOKORO_SID[tts.voiceId];
  if (sid === undefined) throw new Error(`Voice ${tts.voiceId} is not part of Kokoro English v0.19`);
  return {
    modelId: tts.modelId,
    voiceId: tts.voiceId as VoiceId,
    sid,
    speed: clampReadSpeed(tts.speed),
    sampleRate: KOKORO_SAMPLE_RATE,
    buffer: clampAhead(tts.readAloudBuffer ?? DEFAULT_READ_ALOUD_BUFFER),
  };
}

/** True when two starts will synthesize the same way. */
export function sameSpeakRequest(left: TtsSpeakRequest, right: TtsSpeakRequest): boolean {
  return (
    left.modelId === right.modelId &&
    left.sid === right.sid &&
    left.speed === right.speed &&
    left.sampleRate === right.sampleRate &&
    left.buffer === right.buffer
  );
}

/**
 * PCM from the worker or IPC. A raw byte view is treated as float32 frames so a
 * 24 kHz buffer is never played as 22.05 kHz (slow and low) or as bytes-as-samples.
 */
export function float32Samples(input: unknown): Float32Array {
  if (input instanceof Float32Array) return input;
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    if (view.byteLength % 4 !== 0 || view.byteLength === 0) {
      throw new Error('Speech audio was not PCM');
    }
    return new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (Array.isArray(input) && input.length > 0 && input.every((value) => typeof value === 'number')) {
    return Float32Array.from(input);
  }
  throw new Error('Speech audio was not PCM');
}

export function playbackSampleRate(sampleRate: number, expected: number): number {
  if (Number.isInteger(sampleRate) && sampleRate >= 8_000 && sampleRate <= 96_000) return sampleRate;
  if (Number.isInteger(expected) && expected >= 8_000 && expected <= 96_000) return expected;
  return KOKORO_SAMPLE_RATE;
}
