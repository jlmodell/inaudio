import { MODEL_CATALOG, MODEL_IDS } from '@shared/domain/models';
import { PageHeader, Row, Section } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { api } from '../api';
import { keys, queryClient, useSettings, useStatus, useUpdateSettings } from '../queries';

const STT_OPTIONS = MODEL_IDS.filter((id) => MODEL_CATALOG[id].kind === 'stt').map((id) => ({
  value: id,
  label: MODEL_CATALOG[id].name,
  hint: MODEL_CATALOG[id].summary,
}));

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: status } = useStatus();
  const update = useUpdateSettings();
  if (!settings) return null;

  return (
    <div>
      <PageHeader title="Settings" description="These apply to this Inaudio. Desktop-only features are not here." />
      <Section title="Speech">
        <Row label="Speech to text" description="Downloaded on this server the first time it is needed.">
          <Select
            label="Speech to text"
            value={settings.sttModelId}
            onValueChange={(sttModelId) => update.mutate({ sttModelId })}
            options={STT_OPTIONS}
          />
        </Row>
        <Row label="Save history" description="Keep transcripts so you can find them later.">
          <Switch
            checked={settings.saveHistory}
            onCheckedChange={(saveHistory) => update.mutate({ saveHistory })}
            aria-label="Save history"
          />
        </Row>
        <Row label="Speech cleanup" description="Skip quiet stretches and reduce background noise before recognition.">
          <Switch
            checked={settings.speechCleanup}
            onCheckedChange={(speechCleanup) => update.mutate({ speechCleanup })}
            aria-label="Speech cleanup"
          />
        </Row>
      </Section>
      <Section title="This copy">
        <Row
          label="Sign out"
          description={
            status?.authRequired
              ? 'You will need the password the next time you open Inaudio.'
              : 'No password is set. Anyone on the network who can open this address can use it.'
          }
        >
          {status?.authRequired && (
            <button
              type="button"
              className="text-sm font-medium text-accent"
              onClick={() =>
                void api.logout().then(() => {
                  void queryClient.invalidateQueries({ queryKey: keys.status });
                  window.location.reload();
                })
              }
            >
              Sign out
            </button>
          )}
        </Row>
      </Section>
    </div>
  );
}
