import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Settings } from '@shared/domain/settings';
import { ConfirmDialog } from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';
import { Row, Section } from '@renderer/components/ui/layout';
import { Switch } from '@renderer/components/ui/switch';
import { api, errorMessage } from '@renderer/lib/api';
import { keys, useUpdateSettings } from '@renderer/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@renderer/components/ui/toast';

export function PrivacySettings({ settings, platform }: { settings: Settings; platform: NodeJS.Platform }) {
  const [clearing, setClearing] = useState(false);
  const update = useUpdateSettings();
  const client = useQueryClient();
  const protectsCapture = platform === 'win32' || platform === 'darwin';

  const clearHistory = () => {
    setClearing(false);
    void api.history
      .clear()
      .then(() => client.invalidateQueries({ queryKey: keys.historyAll }))
      .then(() => toast('History cleared'))
      .catch((error: unknown) => toast(errorMessage(error), { tone: 'danger' }));
  };

  return (
    <>
      <Section id="settings-privacy">
        <Row
          id="settings-privacy-dictation-history"
          label="Save dictation history"
          description="Keep new dictations in History on this computer."
        >
          <Switch
            aria-label="Save dictation history"
            checked={settings.dictation.saveHistory}
            onCheckedChange={(saveHistory) => update.mutate({ dictation: { saveHistory } })}
          />
        </Row>
        <Row
          id="settings-privacy-live-history"
          label="Save live transcript history"
          description="Keep new live transcripts in History on this computer."
        >
          <Switch
            aria-label="Save live transcript history"
            checked={settings.live.saveHistory}
            onCheckedChange={(saveHistory) => update.mutate({ live: { saveHistory } })}
          />
        </Row>
        <Row
          id="settings-privacy-screen-capture"
          label="Hide live window from screen capture"
          description={
            protectsCapture
              ? 'Exclude the live transcript window from screen sharing and screenshots where the operating system allows it.'
              : 'Screen-capture protection is not available on Linux.'
          }
        >
          <Switch
            aria-label="Hide live window from screen capture"
            disabled={!protectsCapture}
            checked={protectsCapture && settings.liveWindow.hideFromCapture}
            onCheckedChange={(hideFromCapture) => update.mutate({ liveWindow: { hideFromCapture } })}
          />
        </Row>
        <Row label="Clear all history" description="Delete every saved transcript from this computer.">
          <Button size="sm" variant="danger" disabled={clearing} onClick={() => setClearing(true)}>
            <Trash2 /> Clear history
          </Button>
        </Row>
      </Section>
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear all history?"
        description="Every saved transcript is deleted from this computer. This cannot be undone."
        confirmLabel="Clear history"
        onConfirm={clearHistory}
      />
    </>
  );
}
