import type { MicProcessing } from '@shared/domain/capture';
import type { Settings } from '@shared/domain/settings';

/** Constraints Chromium understands for microphone capture but lib.dom does not type yet. */
interface MicTrackConstraints extends MediaTrackConstraints {
  voiceIsolation?: boolean;
}

/** What the microphone settings ask Chromium's WebRTC audio processing to do. */
export function micProcessing(audio: Settings['audio']): MicProcessing {
  return {
    noiseSuppression: audio.noiseSuppression,
    echoCancellation: audio.echoCancellation,
    autoGainControl: audio.autoGainControl,
    voiceIsolation: audio.voiceIsolation,
  };
}

/**
 * True where Chromium offers voice isolation. An unsupported constraint is dropped without
 * an error, so the setting is only offered, and only applied, where this says so.
 */
export function voiceIsolationSupported(): boolean {
  const supported = navigator.mediaDevices?.getSupportedConstraints() as (MediaTrackSupportedConstraints & { voiceIsolation?: boolean }) | undefined;
  return supported?.voiceIsolation === true;
}

/** One mono microphone track, processed as the settings ask. */
export function micConstraints(deviceId: string, processing: MicProcessing): MicTrackConstraints {
  return {
    deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
    channelCount: 1,
    echoCancellation: processing.echoCancellation,
    noiseSuppression: processing.noiseSuppression,
    autoGainControl: processing.autoGainControl,
    ...(processing.voiceIsolation && voiceIsolationSupported() ? { voiceIsolation: true } : {}),
  };
}

/**
 * An input recorded as playback rather than as a voice: a virtual cable carries a call or a
 * video, so voice processing would only distort it.
 */
export function rawConstraints(deviceId: string): MediaTrackConstraints {
  return {
    deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}
