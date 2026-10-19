import type { LiveSource, SystemAudioSupport } from '@shared/domain/capture';
import type { Settings } from '@shared/domain/settings';
import { Badge, Row, Section } from '@renderer/components/ui/layout';
import { RadioGroup } from '@renderer/components/ui/radio-group';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';

function availability(support: SystemAudioSupport): { tone: 'success' | 'warning' | 'danger'; label: string; note: string } {
  if (!support.available) return { tone: 'danger', label: 'Unavailable', note: support.reason };
  if (support.mode === 'system-picker') {
    return { tone: 'warning', label: 'Asks each time', note: 'macOS asks you to pick a screen each time. Only its audio is used.' };
  }
  return {
    tone: 'success',
    label: 'Supported',
    note: support.ownAudioFiltered
      ? 'Inaudio’s own sounds are kept out of the recording.'
      : 'This system can’t keep Inaudio’s own sounds out, so pause Read Aloud while recording.',
  };
}

/** Defaults for Live transcript. Each session can still switch source on its own page. */
export function SystemAudioSection({
  live,
  support,
  inputs,
  onChange,
}: {
  live: Settings['live'];
  support: SystemAudioSupport;
  /** Enumerated input devices, for the `device` source. */
  inputs: { value: string; label: string }[];
  onChange(patch: Partial<Settings['live']>): void;
}) {
  const state = availability(support);
  return (
    <Section id="audio-system" title="System audio" description="Used by Live transcript. Audio is processed in memory and never saved.">
      <Row label="Availability" description={state.note}>
        <Badge tone={state.tone}>{state.label}</Badge>
      </Row>
      <div className="py-3">
        <p className="pb-2 text-sm font-medium">Default source</p>
        <RadioGroup<LiveSource>
          label="Default live transcript source"
          value={live.source}
          onValueChange={(source) => onChange({ source })}
          options={[
            { value: 'system', label: 'System audio', description: 'Everything playing through your speakers or headset.' },
            { value: 'system+mic', label: 'System audio and microphone', description: 'Adds your voice. Both go into one transcript.' },
            {
              value: 'device',
              label: 'Audio device',
              description: 'One input you choose, such as a virtual cable (VB-Cable, BlackHole). No screen capture is used.',
            },
          ]}
        />
      </div>
      <Row label="Audio device" description="Used by the Audio device source. Virtual cables appear here once installed.">
        <Select
          label="Audio device"
          className="w-72"
          value={live.deviceId}
          onValueChange={(deviceId) => onChange({ deviceId })}
          options={inputs}
        />
      </Row>
      <Row label="System level" description="Raise it for quiet calls.">
        <div className="flex w-72 items-center gap-3">
          <Slider
            aria-label="System level"
            min={0.5}
            max={2}
            step={0.1}
            value={[live.systemGain]}
            onValueChange={([systemGain]) => systemGain !== undefined && onChange({ systemGain })}
          />
          <span className="w-10 font-mono text-sm tabular-nums">{live.systemGain.toFixed(1)}×</span>
        </div>
      </Row>
      <Row label="Microphone level in the mix" description="Used with System audio and microphone.">
        <div className="flex w-72 items-center gap-3">
          <Slider
            aria-label="Microphone level in the mix"
            min={0}
            max={2}
            step={0.1}
            value={[live.micGain]}
            onValueChange={([micGain]) => micGain !== undefined && onChange({ micGain })}
          />
          <span className="w-10 font-mono text-sm tabular-nums">{live.micGain.toFixed(1)}×</span>
        </div>
      </Row>
      <Row
        label="Skip stretches without speech"
        description="An on-device voice detector drops music, hold tones and silence before transcription, so they don’t turn into stray words."
      >
        <Switch
          aria-label="Skip stretches without speech"
          checked={live.skipNonSpeech}
          onCheckedChange={(skipNonSpeech) => onChange({ skipNonSpeech })}
        />
      </Row>
      <Row
        label="Show text as it is heard"
        description="A grey line updates while someone is speaking and is replaced by the finished passage. Uses more CPU."
      >
        <Switch aria-label="Show text as it is heard" checked={live.preview} onCheckedChange={(preview) => onChange({ preview })} />
      </Row>
      <Row label="Pause Read Aloud while recording" description="Keeps Inaudio’s own voice out of the transcript.">
        <Switch
          aria-label="Pause Read Aloud while recording"
          checked={live.pauseReadAloud}
          onCheckedChange={(pauseReadAloud) => onChange({ pauseReadAloud })}
        />
      </Row>
    </Section>
  );
}
