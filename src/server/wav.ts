/**
 * Encode and decode mono PCM WAV. Browser MediaRecorder is not used: the web UI already
 * captures float32, and tests can build a clip without extra codecs.
 */

export interface WavAudio {
  samples: Float32Array;
  sampleRate: number;
}

const MAX_WAV_BYTES = 80 * 1024 * 1024;

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

function findChunk(view: DataView, name: string, start: number): { offset: number; size: number } | null {
  let offset = start;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (size < 0 || offset + 8 + size > view.byteLength) return null;
    if (id === name) return { offset: offset + 8, size };
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** 16-bit PCM WAV from mono float32 in -1..1. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error('Unsupported sample rate');
  }
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    const clipped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE((clipped * 0x7fff) | 0, 44 + i * 2);
  }
  return buffer;
}

/** Reads 16-bit PCM or 32-bit float WAV. Stereo is averaged to mono. */
export function decodeWav(bytes: Uint8Array): WavAudio {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_WAV_BYTES) {
    throw new Error('Audio is not a usable WAV file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Audio is not a WAV file');
  }
  const fmt = findChunk(view, 'fmt ', 12);
  const data = findChunk(view, 'data', 12);
  if (!fmt || fmt.size < 16 || !data) throw new Error('WAV file is missing fmt or data');
  const format = view.getUint16(fmt.offset, true);
  const channels = view.getUint16(fmt.offset + 2, true);
  const sampleRate = view.getUint32(fmt.offset + 4, true);
  const bits = view.getUint16(fmt.offset + 14, true);
  if (channels < 1 || channels > 2) throw new Error('Only mono or stereo WAV is supported');
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error('Unsupported sample rate');
  }
  const bytesPerSample = bits / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1) {
    throw new Error('Unsupported WAV sample format');
  }
  const frames = Math.floor(data.size / (bytesPerSample * channels));
  if (frames < 1) throw new Error('WAV file has no samples');
  const samples = new Float32Array(frames);
  if (format === 1 && bits === 16) {
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += view.getInt16(data.offset + (i * channels + ch) * 2, true) / 0x8000;
      }
      samples[i] = sum / channels;
    }
    return { samples, sampleRate };
  }
  if (format === 3 && bits === 32) {
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += view.getFloat32(data.offset + (i * channels + ch) * 4, true);
      }
      samples[i] = sum / channels;
    }
    return { samples, sampleRate };
  }
  throw new Error('Only 16-bit PCM or 32-bit float WAV is supported');
}

export function decodeFloat32le(bytes: Uint8Array, sampleRate: number): WavAudio {
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error('Unsupported sample rate');
  }
  if (bytes.byteLength < 4 || bytes.byteLength % 4 !== 0 || bytes.byteLength > MAX_WAV_BYTES) {
    throw new Error('Audio payload is not float32 PCM');
  }
  const aligned = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
  return {
    samples: new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4),
    sampleRate,
  };
}
