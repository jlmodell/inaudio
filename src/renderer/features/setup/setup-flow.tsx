import { ArrowLeft, ArrowRight, Check, Mic } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from '@renderer/components/brand/logo';
import { Button } from '@renderer/components/ui/button';
import type { LiveSource } from '@shared/domain/capture';
import { Badge, Notice, Row } from '@renderer/components/ui/layout';
import { RadioGroup } from '@renderer/components/ui/radio-group';
import { Select } from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { useMediaDevices } from '@renderer/features/audio/use-devices';
import { Recorder } from '@renderer/features/dictation/audio/recorder';
import { LevelMeter } from '@renderer/features/dictation/level-meter';
import { ModelRow } from '@renderer/features/models/model-row';
import { useModelStatuses } from '@renderer/features/models/use-model-statuses';
import { OverlaySettings } from '@renderer/features/settings/overlay-settings';
import { ShortcutInput } from '@renderer/features/settings/shortcut-input';
import { errorMessage } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';

const STEPS = ['Welcome', 'Microphone', 'Models', 'Live transcript', 'Overlay'] as const;
const OVERLAY_STEP = STEPS.indexOf('Overlay');

function MicrophoneStep() {
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  const { data: settings } = useSettings();

  const test = async () => {
    const recorder = new Recorder();
    setState('testing');
    try {
      await recorder.start({ deviceId: settings?.audio.inputDeviceId ?? 'default', gain: 1, onLevel: setLevel });
      await new Promise((r) => setTimeout(r, 3000));
      await recorder.dispose();
      setLevel(0);
      setState('ok');
    } catch (e) {
      await recorder.dispose();
      setError(errorMessage(e));
      setState('error');
    }
  };

  return (
    <div className="grid gap-6">
      <p className="text-muted">Inaudio needs microphone access. Audio is processed on this computer and never uploaded.</p>
      <div className="flex items-center gap-4">
        <Button variant="primary" onClick={() => void test()} disabled={state === 'testing'}>
          <Mic /> {state === 'testing' ? 'Say something…' : state === 'ok' ? 'Test again' : 'Allow and test'}
        </Button>
        <LevelMeter level={level} active={state === 'testing'} />
        {state === 'ok' && <Badge tone="success"><Check className="size-3" /> Working</Badge>}
      </div>
      {state === 'error' && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

function ModelsStep() {
  const models = useModelStatuses();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  if (!settings) return null;
  return (
    <div className="grid gap-2">
      <p className="text-muted">Download a speech model once; it then works offline. Read Aloud is optional.</p>
      <div className="divide-y divide-line">
        {models.map((m) => (
          <ModelRow
            key={m.id}
            status={m}
            compact
            selected={settings.stt.modelId === m.id || settings.tts.modelId === m.id}
            onSelect={m.kind === 'stt' ? () => update.mutate({ stt: { modelId: m.id as typeof settings.stt.modelId } }) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The settings that decide how a live transcript behaves, in one place: what it records,
 * whether the floating window opens, what is kept, and how to start it from any app.
 */
function LiveStep() {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const inputs = useMediaDevices('audioinput');
  if (!settings || !status) return null;
  const { live, liveWindow } = settings;
  const support = status.systemAudio;
  const devices = [
    { value: 'default', label: 'System default' },
    ...inputs.filter((d) => d.deviceId !== 'default').map((d, i) => ({ value: d.deviceId, label: d.label || `Device ${i + 1}` })),
  ];
  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-4">
        <p className="m-0 text-muted">
          Transcribe what this computer plays, like a meeting or a video. Audio stays here and is never saved. Pick how it
          should work; you can change it any time.
        </p>
        <Badge tone={support.available ? 'success' : 'warning'} className="shrink-0">
          {support.available ? (support.mode === 'system-picker' ? 'Asks for a screen each time' : 'System audio supported') : 'Audio device only'}
        </Badge>
      </div>
      {!support.available && <Notice tone="warning">{support.reason} You can still record an audio device, such as a virtual cable.</Notice>}
      <div className="grid gap-2">
        <p className="m-0 text-sm font-medium">Record</p>
        <RadioGroup<LiveSource>
          label="What a live transcript records"
          value={live.source}
          onValueChange={(source) => update.mutate({ live: { source } })}
          options={[
            { value: 'system', label: 'System audio', description: 'Everything playing through your speakers or headset.' },
            { value: 'system+mic', label: 'System audio and microphone', description: 'Adds your voice, for calls you take part in.' },
            { value: 'device', label: 'Audio device', description: 'One input you choose, such as a virtual cable.' },
          ]}
        />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {live.source === 'device' && (
          <Row label="Audio device">
            <Select
              label="Audio device"
              className="w-64"
              value={live.deviceId}
              onValueChange={(deviceId) => update.mutate({ live: { deviceId } })}
              options={devices}
            />
          </Row>
        )}
        <Row label="Show the live window when a session starts" description="A small floating window with the transcript as it is heard.">
          <Switch
            aria-label="Show the live window when a session starts"
            checked={liveWindow.openOnStart}
            onCheckedChange={(openOnStart) => update.mutate({ liveWindow: { openOnStart } })}
          />
        </Row>
        <Row label="Skip stretches without speech" description="Music and silence are not turned into stray words.">
          <Switch
            aria-label="Skip stretches without speech"
            checked={live.skipNonSpeech}
            onCheckedChange={(skipNonSpeech) => update.mutate({ live: { skipNonSpeech } })}
          />
        </Row>
        <Row label="Save live transcripts to History" description="One entry per session, on this computer only.">
          <Switch
            aria-label="Save live transcripts to History"
            checked={live.saveHistory}
            onCheckedChange={(saveHistory) => update.mutate({ live: { saveHistory } })}
          />
        </Row>
        <Row label="Start or stop from any app" description="Optional. Off until you set it.">
          <ShortcutInput
            label="Live transcript shortcut"
            optional
            value={live.shortcut}
            platform={status.platform}
            status={status.shortcuts.live}
            onChange={(shortcut) => update.mutate({ live: { shortcut } })}
          />
        </Row>
      </div>
      <Notice tone="neutral">Recording other people may need their consent where you live.</Notice>
    </div>
  );
}

function OverlayStep() {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  if (!settings || !status) return null;
  return (
    <div className="grid gap-6">
      <p className="text-muted">
        A small pill sits at the edge of the screen while you dictate, showing whether Inaudio is
        listening and offering the controls you reach for. You can change any of this later in
        Settings.
      </p>
      <div className="divide-y divide-line">
        <OverlaySettings
          compact
          overlay={settings.overlay}
          support={status.overlay}
          platform={status.platform}
          shortcut={status.shortcuts.overlay}
          onChange={(patch) => update.mutate({ overlay: patch })}
        />
      </div>
    </div>
  );
}

export function SetupFlow() {
  const [step, setStep] = useState(0);
  const update = useUpdateSettings();
  const { data: status } = useSystemStatus();
  const { data: settings } = useSettings();
  const sttReady = status?.models.some((m) => m.id === settings?.stt.modelId && m.state === 'installed');
  const last = step === STEPS.length - 1;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="drag h-11 shrink-0" />
      <main className="mx-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-2xl bg-surface shadow-[0_0_0_1px_var(--line)]">
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-10 pt-14 pb-10">
          <ol className="flex gap-2 pb-12" aria-label="Setup progress">
            {STEPS.map((name, i) => (
              <li key={name} aria-current={i === step ? 'step' : undefined} className="grid flex-1 gap-2">
                <span className={cn('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
                <span className={cn('text-xs', i === step ? 'text-ink' : 'text-faint')}>{name}</span>
              </li>
            ))}
          </ol>

          {step === 0 ? (
            <div className="grid justify-items-start gap-6">
              <span className="grid size-20 place-items-center rounded-[18px] border border-line bg-surface text-accent">
                <LogoMark className="size-14" />
              </span>
              <h1 className="text-3xl font-semibold tracking-tight">Talk instead of typing.</h1>
              <p className="max-w-md text-base text-muted">
                Inaudio turns speech into text in any app and reads text back to you. Everything runs on this computer: no account, no cloud.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">{STEPS[step]}</h1>
              {step === 1 && <MicrophoneStep />}
              {step === 2 && <ModelsStep />}
              {step === 3 && <LiveStep />}
              {step === OVERLAY_STEP && <OverlayStep />}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-12">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className={cn(step === 0 && 'invisible')}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex items-center gap-3">
              {step === 2 && !sttReady && <span className="text-xs text-faint">You can download later from Models.</span>}
              <Button
                variant="primary"
                onClick={() => (last ? update.mutate({ onboardingComplete: true }) : setStep((s) => s + 1))}
              >
                {last ? 'Start using Inaudio' : step === 0 ? 'Get started' : 'Continue'} <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
