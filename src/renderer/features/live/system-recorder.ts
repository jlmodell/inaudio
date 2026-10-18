import workletUrl from '@renderer/features/dictation/audio/capture.worklet.ts?worker&url';
import { micConstraints, rawConstraints } from '@renderer/features/dictation/audio/mic-constraints';
import { LIVE_SAMPLE_RATE, type LiveSource, type MicProcessing } from '@shared/domain/capture';
import { Chunker } from './chunker';

export interface SystemRecorderOptions {
  source: LiveSource;
  micDeviceId: string;
  /** The input the `device` source records. */
  deviceId: string;
  micGain: number;
  systemGain: number;
  mic: MicProcessing;
  onLevel(level: number): void;
  onChunk(samples: Float32Array): void;
  /** The system track ended without being asked to: device change, permission, or app exit. */
  onTrackEnded(): void;
}

/** A capture that returned no usable system audio track. */
export class SystemAudioUnavailableError extends Error {}

/** Constraints Chromium 141+ understands for display capture but lib.dom does not type yet. */
interface DisplayAudioConstraints extends MediaTrackConstraints {
  restrictOwnAudio?: boolean;
  suppressLocalAudioPlayback?: boolean;
}

/**
 * Captures the system mix (and optionally the microphone), or one chosen input device, as
 * 16 kHz mono and hands it out in chunks. The AudioContext runs at 16 kHz, so Chromium
 * resamples every source onto one clock, and the worklet's single explicit channel
 * downmixes stereo to mono.
 */
export class SystemRecorder {
  private context: AudioContext | null = null;
  private display: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunker = new Chunker({ sampleRate: LIVE_SAMPLE_RATE });
  private onChunk: ((samples: Float32Array) => void) | null = null;
  private stopping = false;
  ownAudioFiltered = false;

  async start(options: SystemRecorderOptions): Promise<void> {
    this.stopping = false;
    this.chunker = new Chunker({ sampleRate: LIVE_SAMPLE_RATE });
    this.onChunk = options.onChunk;
    if (options.source === 'device') return this.startDevice(options);
    const audio: DisplayAudioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // Leaves Read Aloud, cues and anything else this window plays out of the capture where
      // Chromium can (Windows 11, macOS 14.2+).
      restrictOwnAudio: true,
      suppressLocalAudioPlayback: false,
    };
    // Video is required for the request to reach the main process; it is stopped at once.
    this.display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio });
    try {
      for (const track of this.display.getVideoTracks()) {
        track.stop();
        this.display.removeTrack(track);
      }
      const track = this.display.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') {
        throw new SystemAudioUnavailableError('No system audio came through.');
      }
      this.ownAudioFiltered = (track.getSettings() as { restrictOwnAudio?: boolean }).restrictOwnAudio === true;
      track.addEventListener('ended', () => {
        if (!this.stopping) options.onTrackEnded();
      });

      if (options.source === 'system+mic') {
        // Echo cancellation, when on, keeps the call coming out of the speakers from reaching
        // the transcript twice: once through loopback and again through the microphone.
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(options.micDeviceId, options.mic) });
      }

      await this.openGraph(options);
      if (!this.context || !this.node) return;
      const system = this.context.createMediaStreamSource(this.display);
      system.connect(new GainNode(this.context, { gain: options.systemGain })).connect(this.node);
      if (this.mic) {
        const voice = this.context.createMediaStreamSource(this.mic);
        voice.connect(new GainNode(this.context, { gain: options.micGain })).connect(this.node);
      }
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  /**
   * The `device` source: one input recorded as it is, through getUserMedia alone. No screen
   * capture, so no picker, no capture grant and no video track.
   */
  private async startDevice(options: SystemRecorderOptions): Promise<void> {
    this.display = await navigator.mediaDevices.getUserMedia({ audio: rawConstraints(options.deviceId) });
    try {
      const track = this.display.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new SystemAudioUnavailableError('The audio device sent nothing.');
      // Nothing of Inaudio's plays into an input device unless the user routes it there.
      this.ownAudioFiltered = false;
      track.addEventListener('ended', () => {
        if (!this.stopping) options.onTrackEnded();
      });
      await this.openGraph(options);
      if (!this.context || !this.node) return;
      const input = this.context.createMediaStreamSource(this.display);
      input.connect(new GainNode(this.context, { gain: options.systemGain })).connect(this.node);
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  /** The 16 kHz context and the worklet every source feeds. */
  private async openGraph(options: SystemRecorderOptions): Promise<void> {
    this.context = new AudioContext({ sampleRate: LIVE_SAMPLE_RATE, latencyHint: 'balanced' });
    await this.context.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.context, 'inaudio-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.node.port.onmessage = ({ data }: MessageEvent<{ chunk: Float32Array; peak: number }>) => {
      options.onLevel(Math.min(1, data.peak));
      for (const chunk of this.chunker.push(data.chunk)) this.onChunk?.(chunk);
    };
  }

  /** A copy of the stretch still being spoken, for the provisional line. */
  peek(): Float32Array | null {
    return this.stopping ? null : this.chunker.peek();
  }

  /** Stops capture and hands out the last chunk, if it holds anything. */
  async stop(): Promise<void> {
    this.stopping = true;
    const last = this.chunker.flush();
    if (last) this.onChunk?.(last);
    await this.dispose();
  }

  /** Stops capture and drops whatever was not sent yet. */
  async dispose(): Promise<void> {
    this.stopping = true;
    this.node?.port.close();
    this.node?.disconnect();
    this.display?.getTracks().forEach((track) => track.stop());
    this.mic?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.node = null;
    this.display = null;
    this.mic = null;
    this.context = null;
    this.onChunk = null;
    this.chunker.flush();
  }
}
