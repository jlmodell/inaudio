import { useEffect, useState } from 'react';
import { MODEL_CATALOG, MODEL_IDS } from '@shared/domain/models';
import { MAX_READ_ALOUD_BUFFER, MIN_READ_ALOUD_BUFFER } from '@shared/read-aloud/ahead';
import type { ReadAloudEngine } from '@shared/web/read-aloud-engine';
import { Button } from '@renderer/components/ui/button';
import { PageHeader, Row, Section } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { api } from '../api';
import { keys, queryClient, useSettings, useStatus, useUpdateSettings } from '../queries';
import { ReadAloudDiagLine } from '../tts/diag-line';
import { readDeviceFallback, subscribeDeviceFallback, writeDeviceFallback } from '../tts/device-fallback';
import { resetKokoroHost } from '../tts/kokoro-host';

const STT_OPTIONS = MODEL_IDS.filter((id) => MODEL_CATALOG[id].kind === 'stt').map((id) => ({
  value: id,
  label: MODEL_CATALOG[id].name,
  hint: MODEL_CATALOG[id].summary,
}));

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: status } = useStatus();
  const update = useUpdateSettings();
  const [fallback, setFallback] = useState(readDeviceFallback);
  useEffect(() => subscribeDeviceFallback(setFallback), []);
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
        <Row
          label="Read aloud"
          description={
            settings.readAloudEngine === 'browser'
              ? 'Downloads a voice once onto this phone or computer, then reads without waiting on the server.'
              : settings.readAloudEngine === 'speech'
                ? 'Starts immediately with the voice built into Safari or Chrome.'
                : 'The host computer speaks. Useful if this device cannot run the on-device voice.'
          }
        >
          <Select
            label="Read aloud"
            value={settings.readAloudEngine}
            onValueChange={(readAloudEngine: ReadAloudEngine) => {
              if (readAloudEngine === 'browser') writeDeviceFallback(null);
              update.mutate({ readAloudEngine });
            }}
            options={[
              { value: 'browser', label: 'On this device', hint: 'Kokoro, after a one-time download' },
              { value: 'speech', label: "This browser's voice", hint: 'Instant' },
              { value: 'server', label: 'This server', hint: 'The host computer speaks' },
            ]}
          />
        </Row>
        <Row
          label="Sentence buffer"
          description="On-device and server voices wait for this many sentences before they start, then keep generating to stay that far ahead."
        >
          <label className="grid w-40 gap-1">
            <span className="text-right text-xs text-muted">{settings.readAloudBuffer}</span>
            <Slider
              aria-label="Sentence buffer"
              min={MIN_READ_ALOUD_BUFFER}
              max={MAX_READ_ALOUD_BUFFER}
              step={1}
              value={[settings.readAloudBuffer]}
              onValueChange={([readAloudBuffer]) =>
                readAloudBuffer !== undefined && update.mutate({ readAloudBuffer })
              }
            />
          </label>
        </Row>
        <Row
          label="Voice status"
          description={
            <div className="grid gap-2">
              <ReadAloudDiagLine className="text-sm text-muted" />
              {settings.readAloudEngine === 'browser' && fallback === 'speech' && (
                <p className="text-sm text-muted">
                  This visit fell back to the browser voice. Reload or try again to load the on-device voice.
                </p>
              )}
            </div>
          }
        >
          {settings.readAloudEngine === 'browser' && fallback === 'speech' && (
            <Button
              size="sm"
              onClick={() => {
                writeDeviceFallback(null);
                resetKokoroHost();
              }}
            >
              Try on-device voice again
            </Button>
          )}
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
