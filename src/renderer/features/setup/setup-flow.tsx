import { Minus, X } from 'lucide-react';
import { AppShell } from '@renderer/components/shell/app-shell';
import { Billboard, StepDots } from '@renderer/components/ui/billboard';
import { Button } from '@renderer/components/ui/button';
import { ModelRow } from '@renderer/features/models/model-row';
import { useModelStatuses } from '@renderer/features/models/use-model-statuses';
import { ModelsScene, WelcomeScene } from '@renderer/features/tour/hero-scenes';
import { api } from '@renderer/lib/api';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useState } from 'react';

function ModelsStep() {
  const models = useModelStatuses();
  const { data: settings } = useSettings();
  if (!settings) return null;
  return (
    <div className="grid gap-2">
      <div className="divide-y divide-line">
        {models.map((m) => (
          <ModelRow key={m.id} status={m} compact selected={settings.tts.modelId === m.id} />
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Inaudio',
    description: 'Read selected or typed text aloud with a local Kokoro voice. Nothing is recorded.',
    scene: <WelcomeScene />,
  },
  {
    id: 'voice',
    title: 'Download the voice',
    description: 'Kokoro English stays on this computer. Download it once, then Inaudio can read without a network.',
    scene: <ModelsScene />,
  },
] as const;

export function SetupFlow() {
  const [step, setStep] = useState(0);
  const update = useUpdateSettings();
  const { data: status } = useSystemStatus();
  const models = useModelStatuses();
  const voiceReady = models.some((m) => m.kind === 'tts' && m.installed);
  const current = STEPS[step] ?? STEPS[0];

  const finish = () => {
    update.mutate({
      onboardingComplete: true,
      announcements: { seenVersion: status?.appVersion ?? '' },
    });
  };

  return (
    <>
      <AppShell backdrop>
        <div className="grid h-full place-items-center" />
      </AppShell>
      <Billboard
        open
        onOpenChange={() => undefined}
        label="Set up Inaudio"
        hero={current.scene}
        title={current.title}
        description={current.description}
        footer={
          <>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-[6px] text-muted hover:bg-sunken hover:text-ink"
              aria-label="Minimize window"
              onClick={() => void api.system.window('minimize')}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-[6px] text-muted hover:bg-danger hover:text-white"
              aria-label="Close window"
              onClick={() => void api.system.window('close')}
            >
              <X className="size-4" />
            </button>
            <span className="flex-1" />
            <StepDots count={STEPS.length} current={step} />
            {step > 0 && (
              <Button onClick={() => setStep((n) => n - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((n) => n + 1)}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" onClick={finish} disabled={!voiceReady && models.length > 0}>
                {voiceReady ? 'Start reading' : 'Download the voice to continue'}
              </Button>
            )}
          </>
        }
      >
        {current.id === 'voice' && <ModelsStep />}
      </Billboard>
    </>
  );
}
