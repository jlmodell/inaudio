import { Check, Mic, Minus, X } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@renderer/components/shell/app-shell';
import { Billboard, StepDots } from '@renderer/components/ui/billboard';
import { Button } from '@renderer/components/ui/button';
import type { LiveSource } from '@shared/domain/capture';
import { Badge, Notice, Row } from '@renderer/components/ui/layout';
import { RadioGroup } from '@renderer/components/ui/radio-group';
import { Select } from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { useMediaDevices } from '@renderer/features/audio/use-devices';
import { DictationPage } from '@renderer/features/dictation/dictation-page';
import { LiveScene, MicrophoneScene, ModelsScene, OverlayScene, WelcomeScene } from '@renderer/features/tour/hero-scenes';
import { Recorder } from '@renderer/features/dictation/audio/recorder';
import { LevelMeter } from '@renderer/features/dictation/level-meter';
import { ModelRow } from '@renderer/features/models/model-row';
import { useModelStatuses } from '@renderer/features/models/use-model-statuses';
import { OverlaySettings } from '@renderer/features/settings/overlay-settings';
import { ShortcutInput } from '@renderer/features/settings/shortcut-input';
import { api, errorMessage } from '@renderer/lib/api';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';


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
      <div className="flex">
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

const STEPS = [
  {
    id: 'welcome',
    title: 'Talk instead of typing.',
    description: 'Inaudio turns speech into text in any app and reads text back to you. Everything runs on this computer: no account, no cloud.',
    hero: <WelcomeScene />,
    body: null,
  },
  {
    id: 'microphone',
    title: 'Check your microphone',
    description: 'Inaudio needs microphone access. Audio is processed on this computer and never uploaded.',
    hero: <MicrophoneScene />,
    body: <MicrophoneStep />,
  },
  {
    id: 'models',
    title: 'Download a speech model',
    description: 'Download a speech model once; it then works offline. Read Aloud is optional.',
    hero: <ModelsScene />,
    body: <ModelsStep />,
  },
  {
    id: 'live',
    title: 'Transcribe what your computer plays',
    description: 'Meetings, videos, lectures. Audio stays on this computer and is never saved. You can change any of this later.',
    hero: <LiveScene />,
    body: <LiveStep />,
  },
  {
    id: 'overlay',
    title: 'A small pill shows what is happening',
    description: 'It sits at the edge of the screen while you dictate, showing whether Inaudio is listening and the controls you reach for.',
    hero: <OverlayScene />,
    body: <OverlayStep />,
  },
] as const;

/**
 * Setup runs as a billboard over the app itself: the workspace waits, dimmed, underneath,
 * and each step leads with a small animation of what it sets up. The window can still be
 * minimized or closed; nothing else outside the steps reacts until setup is done.
 */
export function SetupFlow() {
  const [step, setStep] = useState(0);
  const update = useUpdateSettings();
  const { data: status } = useSystemStatus();
  const { data: settings } = useSettings();
  const sttReady = status?.models.some((m) => m.id === settings?.stt.modelId && m.state === 'installed');
  const last = step === STEPS.length - 1;
  const current = STEPS[step] ?? STEPS[0];
  // Finishing setup also counts as having seen what is new in this version.
  const finish = () => update.mutate({ onboardingComplete: true, announcements: { seenVersion: status?.appVersion ?? '' } });

  return (
    <>
      <div inert aria-hidden className="h-full">
        <AppShell backdrop>
          <DictationPage />
        </AppShell>
      </div>
      <div className="drag pointer-events-auto fixed inset-x-0 top-0 z-[60] flex h-11 items-center justify-end gap-1 px-3 [&>button]:no-drag">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={() => void api.system.window('minimize')}
          className="grid size-7 place-items-center rounded-[6px] text-white/80 hover:bg-white/15 hover:text-white"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={() => void api.system.window('close')}
          className="grid size-7 place-items-center rounded-[6px] text-white/80 hover:bg-danger hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      <Billboard
        open
        onOpenChange={() => undefined}
        dismissible={false}
        label="Set up Inaudio"
        stepKey={current.id}
        hero={current.hero}
        title={current.title}
        description={current.description}
        footer={
          <>
            {!last && (
              <button type="button" onClick={finish} className="rounded-[6px] px-1 text-[13px] text-faint hover:text-muted">
                Skip setup
              </button>
            )}
            <span className="flex-1" />
            <span className="mr-2 flex items-center gap-2.5">
              <span className="text-xs font-medium text-faint tabular-nums">
                {step + 1} of {STEPS.length}
              </span>
              <StepDots count={STEPS.length} current={step} />
            </span>
            {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
            <Button variant="primary" onClick={() => (last ? finish() : setStep((s) => s + 1))}>
              {last ? 'Start using Inaudio' : step === 0 ? 'Get started' : current.id === 'models' && !sttReady ? 'Later' : 'Continue'}
            </Button>
          </>
        }
      >
        {current.body}
      </Billboard>
    </>
  );
}
