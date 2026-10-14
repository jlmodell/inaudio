/** Plays float32 PCM from the TTS engine on a chosen output device. */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  async play(
    samples: Float32Array,
    sampleRate: number,
    outputDeviceId: string,
    onEnded: () => void,
    volume = 1,
  ): Promise<void> {
    this.stop();
    const context = new AudioContext({ sampleRate });
    this.context = context;
    if (outputDeviceId && outputDeviceId !== 'default' && 'setSinkId' in context) {
      try {
        await (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(outputDeviceId);
      } catch {
        // Device vanished; fall back to the default output.
      }
    }
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      if (this.source === source) {
        this.stop();
        onEnded();
      }
    };
    this.source = source;
    source.start();
  }

  stop(): void {
    const source = this.source;
    this.source = null;
    try {
      source?.stop();
    } catch {
      // Already stopped.
    }
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
  }
}

/**
 * Plays the segments of one Read Aloud session back to back on a single AudioContext, so the
 * output device is chosen once and pause keeps the exact position (the context is suspended).
 */
export class SegmentPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private sampleRate = 0;
  private deviceId = 'default';
  /** A pause asked for, so an in-flight play() does not resume the context back out from under it. */
  private paused = false;

  async play(
    samples: Float32Array,
    sampleRate: number,
    options: { deviceId: string; volume: number },
    onEnded: () => void,
  ): Promise<void> {
    const context = await this.open(sampleRate, options.deviceId);
    this.stopSource();
    this.setVolume(options.volume);
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain ?? context.destination);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      onEnded();
    };
    this.source = source;
    // A pause that landed while the context was opening is honored: the source still starts,
    // it just stays silent on the suspended context until resume() brings it back.
    if (this.paused) {
      if (context.state === 'running') void context.suspend();
    } else if (context.state === 'suspended') {
      await context.resume();
    }
    this.startedAt = context.currentTime;
    source.start();
  }

  pause(): void {
    this.paused = true;
    if (this.context?.state === 'running') void this.context.suspend();
  }

  resume(): void {
    this.paused = false;
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  setVolume(volume: number): void {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** Milliseconds played of the current segment. */
  position(): number {
    if (!this.context || !this.source) return 0;
    return Math.max(0, (this.context.currentTime - this.startedAt) * 1000);
  }

  stop(): void {
    this.paused = false;
    this.stopSource();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
    this.gain = null;
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    try {
      source?.stop();
    } catch {
      // Already stopped.
    }
  }

  private async open(sampleRate: number, deviceId: string): Promise<AudioContext> {
    if (this.context && this.context.state !== 'closed' && this.sampleRate === sampleRate && this.deviceId === deviceId) {
      return this.context;
    }
    this.stop();
    const context = new AudioContext({ sampleRate });
    if (deviceId && deviceId !== 'default' && 'setSinkId' in context) {
      try {
        await (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
      } catch {
        // Device vanished; fall back to the default output.
      }
    }
    const gain = context.createGain();
    gain.connect(context.destination);
    this.context = context;
    this.gain = gain;
    this.sampleRate = sampleRate;
    this.deviceId = deviceId;
    return context;
  }
}

/** Encodes mono float32 PCM as a 16-bit WAV for export. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([view], { type: 'audio/wav' });
}
