import workletUrl from '@renderer/features/dictation/audio/capture.worklet.ts?worker&url';
import { LIVE_SAMPLE_RATE, type LiveSource } from '@shared/domain/capture';
import { Chunker } from './chunker';

export interface SystemRecorderOptions {
  source: LiveSource;
  micDeviceId: string;
  micGain: number;
  systemGain: number;
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
 * Captures the system mix (and optionally the microphone) as 16 kHz mono and hands it out in
 * chunks. The AudioContext runs at 16 kHz, so Chromium resamples both sources onto one clock,
 * and the worklet's single explicit channel downmixes stereo loopback to mono.
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
        this.mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: options.micDeviceId && options.micDeviceId !== 'default' ? { exact: options.micDeviceId } : undefined,
            channelCount: 1,
            // Echo cancellation keeps the call coming out of the speakers from reaching the
            // transcript twice, once through loopback and again through the microphone.
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

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
