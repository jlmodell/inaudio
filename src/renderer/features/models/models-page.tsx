import { FolderOpen } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { PageHeader, Section } from '@renderer/components/ui/layout';
import { api } from '@renderer/lib/api';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { ModelRow } from './model-row';
import { useModelStatuses } from './use-model-statuses';

export function ModelsPage() {
  const models = useModelStatuses();
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  if (!settings || !status) return null;

  return (
    <div>
      <PageHeader
        title="Models"
        description="The Kokoro voice is downloaded once, checked against a pinned SHA-256 hash, and run offline after that."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void api.system.revealModels()}>
            <FolderOpen /> Show folder
          </Button>
        }
      />
      <Section title="Text to speech">
        {models.map((m) => (
          <ModelRow key={m.id} status={m} selected={settings.tts.modelId === m.id} />
        ))}
      </Section>
      <p className="pt-2 text-xs text-faint" data-selectable>
        Stored in {status.modelsDir}. Inference runs in a separate process on the CPU through sherpa-onnx.
      </p>
    </div>
  );
}
