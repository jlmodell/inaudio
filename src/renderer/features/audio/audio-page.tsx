import { Mic, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Badge, Notice, PageHeader, Row, Section } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { playCue } from '@renderer/features/dictation/audio/cues';
import { micProcessing } from '@renderer/features/dictation/audio/mic-constraints';
import { Recorder } from '@renderer/features/dictation/audio/recorder';
import { LevelMeter } from '@renderer/features/dictation/level-meter';
import { errorMessage } from '@renderer/lib/api';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import type { MicProcessing } from '@shared/domain/capture';
import { DiagnosticsSection } from './diagnostics-section';
import { LiveSessionSection } from './live-session-section';
import { MicProcessingSection } from './mic-processing-section';
import { SystemAudioSection } from './system-audio-section';
import { useMediaDevices } from './use-devices';

function useMicTest(deviceId: string, gain: number, processing: MicProcessing | null) {
  const recorder = useRef<Recorder | null>(null);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = async () => {
    await recorder.current?.dispose();
    recorder.current = null;
    setTesting(false);
    setLevel(0);
  };
  const start = async () => {
    setError(null);
    const r = new Recorder();
    recorder.current = r;
    try {
      await r.start({ deviceId, gain, processing: processing ?? undefined, onLevel: setLevel });
      setTesting(true);
    } catch (e) {
      recorder.current = null;
      setError(errorMessage(e));
    }
  };
  useEffect(() => () => void recorder.current?.dispose(), []);
  useEffect(() => {
    if (testing) void stop();
    // Restart manually after changing device or gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, gain]);
  return { level, testing, error, start, stop };
}

const PERMISSION: Record<string, { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string }> = {
  granted: { tone: 'success', label: 'Allowed' },
  denied: { tone: 'danger', label: 'Denied' },
  restricted: { tone: 'danger', label: 'Restricted' },
  'not-determined': { tone: 'warning', label: 'Not asked yet' },
  unknown: { tone: 'neutral', label: 'Managed by the system' },
};

export function AudioPage() {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const inputs = useMediaDevices('audioinput');
  const outputs = useMediaDevices('audiooutput');
  const dictating = useDictation((s) => s.phase === 'listening');
  const test = useMicTest(
    settings?.audio.inputDeviceId ?? 'default',
    settings?.audio.inputGain ?? 1,
    settings ? micProcessing(settings.audio) : null,
  );
  if (!settings || !status) return null;

  const permission = PERMISSION[status.microphonePermission] ?? PERMISSION.unknown!;
  const deviceOptions = (list: MediaDeviceInfo[], fallback: string) => [
    { value: 'default', label: fallback },
    ...list
      .filter((d) => d.deviceId !== 'default')
      .map((d, i) => ({ value: d.deviceId, label: d.label || `Device ${i + 1}` })),
  ];

  return (
    <div>
      <PageHeader title="Audio" description="Pick the microphone used for dictation, the speaker used for Read Aloud, and how Live transcript records system audio." />
      {permission.tone === 'danger' && (
        <div className="pb-6">
          <Notice tone="danger">Microphone access is blocked. Allow Inaudio in your system privacy settings, then restart the app.</Notice>
        </div>
      )}
      <Section title="Input">
        <Row label="Microphone permission">
          <Badge tone={permission.tone}>{permission.label}</Badge>
        </Row>
        <Row label="Microphone" description="Used for dictation and the level test below.">
          <Select
            label="Microphone"
            className="w-72"
            value={settings.audio.inputDeviceId}
            onValueChange={(inputDeviceId) => update.mutate({ audio: { inputDeviceId } })}
            options={deviceOptions(inputs, 'System default')}
          />
        </Row>
        <Row label="Input gain" description="Boost quiet microphones before transcription.">
          <div className="flex w-72 items-center gap-3">
            <Slider
              aria-label="Input gain"
              min={0.5}
              max={2}
              step={0.1}
              value={[settings.audio.inputGain]}
              onValueChange={([inputGain]) => inputGain !== undefined && update.mutate({ audio: { inputGain } })}
            />
            <span className="w-10 font-mono text-sm tabular-nums">{settings.audio.inputGain.toFixed(1)}×</span>
          </div>
        </Row>
        <Row label="Level test" description={test.error ?? 'Speak normally; bars should reach about half height.'}>
          <LevelMeter level={test.level} active={test.testing} />
          <Button size="sm" disabled={dictating} onClick={() => void (test.testing ? test.stop() : test.start())}>
            {test.testing ? <><Square /> Stop</> : <><Mic /> Test</>}
          </Button>
        </Row>
      </Section>
      <MicProcessingSection
        audio={settings.audio}
        cleanup={status.cleanupModels}
        onChange={(audio) => update.mutate({ audio })}
      />
      <Section title="Output">
        <Row label="Speaker" description="Used by Read Aloud.">
          <Select
            label="Speaker"
            className="w-72"
            value={settings.audio.outputDeviceId}
            onValueChange={(outputDeviceId) => update.mutate({ audio: { outputDeviceId } })}
            options={deviceOptions(outputs, 'System default')}
          />
        </Row>
        <Row label="Sound cues" description="Short tones when dictation starts and stops.">
          <Button size="icon-sm" variant="ghost" aria-label="Preview cue" onClick={() => void playCue('start', { volume: settings.dictation.cueVolume, outputDeviceId: settings.audio.outputDeviceId })}>
            <Volume2 />
          </Button>
          <Switch
            aria-label="Sound cues"
            checked={settings.dictation.playCues}
            onCheckedChange={(playCues) => update.mutate({ dictation: { playCues } })}
          />
        </Row>
        <Row label="Cue volume" description="Controls the volume of the start, stop and error tones.">
          <div className="flex w-72 items-center gap-3">
            <Slider
              aria-label="Cue volume"
              min={0}
              max={1}
              step={0.05}
              value={[settings.dictation.cueVolume]}
              onValueChange={([cueVolume]) => cueVolume !== undefined && update.mutate({ dictation: { cueVolume } })}
            />
            <span className="w-12 font-mono text-sm tabular-nums">{Math.round(settings.dictation.cueVolume * 100)}%</span>
          </div>
        </Row>
      </Section>
      <SystemAudioSection
        live={settings.live}
        support={status.systemAudio}
        inputs={deviceOptions(inputs, 'System default')}
        onChange={(live) => update.mutate({ live })}
      />
      <LiveSessionSection live={settings.live} onChange={(live) => update.mutate({ live })} />
      <DiagnosticsSection status={status} />
    </div>
  );
}
