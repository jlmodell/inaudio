import type { CleanupModelsStatus } from '@shared/domain/system';
import type { Settings } from '@shared/domain/settings';
import { Row, Section } from '@renderer/components/ui/layout';
import { Switch } from '@renderer/components/ui/switch';
import { voiceIsolationSupported } from '@renderer/features/dictation/audio/mic-constraints';

/**
 * Chromium's WebRTC processing for the microphone, plus the on-device speech cleanup model.
 * The first four only ever touch a microphone track; cleanup runs on whatever is transcribed.
 */
export function MicProcessingSection({
  audio,
  cleanup,
  onChange,
}: {
  audio: Settings['audio'];
  cleanup: CleanupModelsStatus;
  onChange(patch: Partial<Settings['audio']>): void;
}) {
  const isolation = voiceIsolationSupported();
  const cleanupReady = cleanup.denoiser !== 'missing';
  return (
    <Section
      id="audio-mic-processing"
      title="Microphone processing"
      description="Applied by Chromium to your microphone, for dictation and for System + microphone. Not applied to system audio."
    >
      <Row label="Noise suppression" description="Reduces steady background noise like fans and traffic.">
        <Switch aria-label="Noise suppression" checked={audio.noiseSuppression} onCheckedChange={(noiseSuppression) => onChange({ noiseSuppression })} />
      </Row>
      <Row label="Echo cancellation" description="Keeps sound from your speakers out of the microphone, so a call isn’t transcribed twice.">
        <Switch aria-label="Echo cancellation" checked={audio.echoCancellation} onCheckedChange={(echoCancellation) => onChange({ echoCancellation })} />
      </Row>
      <Row label="Automatic gain" description="Evens out loud and quiet speech. Turn it off if you set the level yourself.">
        <Switch aria-label="Automatic gain" checked={audio.autoGainControl} onCheckedChange={(autoGainControl) => onChange({ autoGainControl })} />
      </Row>
      <Row
        label="Voice isolation"
        description={
          isolation
            ? 'Keeps your voice and removes other voices and sounds. Stronger than noise suppression.'
            : 'Not offered by this system. Noise suppression is used instead.'
        }
      >
        <Switch
          aria-label="Voice isolation"
          disabled={!isolation}
          checked={isolation && audio.voiceIsolation}
          onCheckedChange={(voiceIsolation) => onChange({ voiceIsolation })}
        />
      </Row>
      <Row
        label="Clean up background noise"
        description={
          cleanupReady
            ? 'Runs a small on-device speech-cleanup model before transcription, for dictation and live transcripts. It helps in noisy rooms but can soften clean speech.'
            : 'The speech-cleanup model is missing or damaged. Reinstall Inaudio to restore it.'
        }
      >
        <Switch
          aria-label="Clean up background noise"
          disabled={!cleanupReady}
          checked={cleanupReady && audio.speechCleanup}
          onCheckedChange={(speechCleanup) => onChange({ speechCleanup })}
        />
      </Row>
    </Section>
  );
}
