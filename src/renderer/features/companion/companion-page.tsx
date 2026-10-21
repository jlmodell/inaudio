import { useEffect, useState } from 'react';
import {
  COMPANIONS,
  type CompanionEvent,
  type CompanionSettings,
} from '@shared/domain/companion';
import type { SettingsPatch } from '@shared/domain/settings';
import { PageHeader, Row, Section } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { api } from '@renderer/lib/api';
import { useSettings, useUpdateSettings } from '@renderer/lib/queries';
import { CompanionAvatar, companionExpression } from './companion-avatar';

const STATES: readonly (readonly [CompanionEvent, string])[] = [
  ['tts.started', 'When Inaudio speaks'],
  ['model.loading', 'While a model loads'],
  ['model.missing', 'When a model is unavailable'],
  ['app.error', 'When something goes wrong'],
  ['companion.clicked', 'When I interact with it'],
];

type DraftKey = 'scale' | 'edgeMargin' | 'soundVolume' | 'idleSleepMinutes' | 'hue';

export function CompanionPage() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [drafts, setDrafts] = useState<Partial<Pick<CompanionSettings, DraftKey>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (update.error) setError(update.error instanceof Error ? update.error.message : String(update.error));
  }, [update.error]);
  if (!settings) return null;
  const companionSettings = settings.companion;
  const selected = COMPANIONS.find((item) => item.id === companionSettings.activeId) ?? COMPANIONS[0];
  if (!selected) return null;

  const change = (patch: SettingsPatch['companion']) => {
    setError(null);
    update.mutate({ companion: patch });
  };
  const draftValue = <K extends DraftKey>(key: K, value: CompanionSettings[K]) =>
    drafts[key] ?? value;
  const setDraft = <K extends DraftKey>(key: K, value: CompanionSettings[K]) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };
  const commitDraft = <K extends DraftKey>(key: K, value: CompanionSettings[K]) => {
    setDraft(key, value);
    change({ [key]: value } as SettingsPatch['companion']);
  };

  return (
    <>
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <PageHeader
        title="Companion"
        description="Choose a small desktop companion that follows Inaudio's real voice and model states."
        actions={
          <Switch
            aria-label="Show companion"
            checked={companionSettings.visible}
            onCheckedChange={(visible) => {
              setError(null);
              void api.companions.setVisibility(visible).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
              });
            }}
          />
        }
      />

      <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3 sm:grid-cols-3">
          {COMPANIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setError(null);
                void api.companions.select(item.id).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason));
                });
              }}
              className={`grid justify-items-center gap-3 rounded-xl border p-4 text-center transition-colors ${
                item.id === selected.id ? 'border-accent bg-accent-soft' : 'border-line bg-sunken hover:bg-line'
              }`}
            >
              <CompanionAvatar
                companion={item}
                settings={companionSettings}
                expression={companionExpression('idle', companionSettings.personality)}
                size={56}
              />
              <span>
                <span className="block text-sm font-semibold">{item.displayName}</span>
                <span className="mt-1 block text-xs text-muted">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid min-h-56 place-items-center rounded-xl border border-line bg-canvas p-6">
          <div className="grid justify-items-center gap-3">
            <CompanionAvatar
              companion={selected}
              settings={companionSettings}
              expression={companionExpression('idle', companionSettings.personality)}
              size={128}
            />
            <span className="text-sm font-medium">{selected.displayName} preview</span>
          </div>
        </div>
      </section>

      <Section title="Appearance" description="The same companion window follows the app theme and stays on the selected display.">
        <Row label="Size" description="How large the companion appears on the desktop.">
          <div className="flex w-56 items-center gap-3">
            <Slider
              aria-label="Companion size"
              min={0.5}
              max={2}
              step={0.1}
              value={[draftValue('scale', companionSettings.scale)]}
              onValueChange={([scale]) => scale !== undefined && setDraft('scale', scale)}
              onValueCommit={([scale]) => scale !== undefined && commitDraft('scale', scale)}
            />
            <span className="w-12 text-right font-mono text-sm">{Math.round(draftValue('scale', companionSettings.scale) * 100)}%</span>
          </div>
        </Row>
        <Row label="Color" description="Its own color, the app's accent, or a custom hue.">
          <Select
            label="Color"
            value={companionSettings.color}
            onValueChange={(color) => change({ color: color as CompanionSettings['color'] })}
            options={[
              { value: 'own', label: 'Its own' },
              { value: 'accent', label: 'App accent' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </Row>
        {companionSettings.color === 'custom' && (
          <Row label="Custom hue" description="The color wheel position, in degrees.">
            <div className="flex w-56 items-center gap-3">
              <Slider
                aria-label="Custom hue"
                min={0}
                max={359}
                step={1}
                value={[draftValue('hue', companionSettings.hue)]}
                onValueChange={([hue]) => hue !== undefined && setDraft('hue', hue)}
                onValueCommit={([hue]) => hue !== undefined && commitDraft('hue', hue)}
              />
              <span className="w-12 text-right font-mono text-sm">{draftValue('hue', companionSettings.hue)}°</span>
            </div>
          </Row>
        )}
        <Row label="Backdrop" description="A soft shape behind the companion instead of bare desktop.">
          <Select
            label="Backdrop"
            value={companionSettings.backdrop}
            onValueChange={(backdrop) => change({ backdrop: backdrop as CompanionSettings['backdrop'] })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'circle', label: 'Circle' },
              { value: 'squircle', label: 'Squircle' },
            ]}
          />
        </Row>
        <Row label="Desktop position" description="The position is clamped to the active display work area.">
          <Select
            label="Desktop position"
            value={companionSettings.position}
            onValueChange={(position) => change({ position: position as CompanionSettings['position'] })}
            options={[
              { value: 'top-left', label: 'Top left' },
              { value: 'top-right', label: 'Top right' },
              { value: 'bottom-left', label: 'Bottom left' },
              { value: 'bottom-right', label: 'Bottom right' },
            ]}
          />
        </Row>
        <Row label="Edge inset" description="Keep the buddy this far inside the display edges.">
          <div className="flex w-56 items-center gap-3">
            <Slider
              aria-label="Edge inset"
              min={24}
              max={160}
              step={4}
              value={[draftValue('edgeMargin', companionSettings.edgeMargin)]}
              onValueChange={([edgeMargin]) => edgeMargin !== undefined && setDraft('edgeMargin', edgeMargin)}
              onValueCommit={([edgeMargin]) => edgeMargin !== undefined && commitDraft('edgeMargin', edgeMargin)}
            />
            <span className="w-16 text-right font-mono text-sm">{draftValue('edgeMargin', companionSettings.edgeMargin)}px</span>
          </div>
        </Row>
        <Row label="Status bubble" description="Show the speaking and model-status label.">
          <Switch
            aria-label="Status bubble"
            checked={companionSettings.showBubble}
            onCheckedChange={(showBubble) => change({ showBubble })}
          />
        </Row>
        <Row label="Click-through" description="Let clicks pass to the window behind the companion.">
          <Switch
            aria-label="Click-through"
            checked={companionSettings.clickThrough}
            onCheckedChange={(clickThrough) => change({ clickThrough })}
          />
        </Row>
      </Section>

      <Section title="Behavior" description="Keep reactions deterministic, local, and tied to actions you can see.">
        <Row label="Personality">
          <Select
            label="Personality"
            value={companionSettings.personality}
            onValueChange={(personality) => change({ personality: personality as CompanionSettings['personality'] })}
            options={['calm', 'playful', 'curious', 'energetic', 'sleepy', 'quiet'].map((value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            }))}
          />
        </Row>
        <Row label="Motion" description="Reduce movement without changing the companion state.">
          <Select
            label="Motion"
            value={companionSettings.motion}
            onValueChange={(motion) => change({ motion: motion as CompanionSettings['motion'] })}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Row>
        <Row label="Follow your cursor" description="Its eyes track the pointer.">
          <Switch
            aria-label="Follow your cursor"
            checked={companionSettings.eyesFollow}
            onCheckedChange={(eyesFollow) => change({ eyesFollow })}
          />
        </Row>
        <Row label="Idle moods" description="While idle, the face drifts through small expressions now and then.">
          <Switch
            aria-label="Idle moods"
            checked={companionSettings.idleMoods}
            onCheckedChange={(idleMoods) => change({ idleMoods })}
          />
        </Row>
        <Row label="Spoken reactions" description="Speak the same status text shown in the companion bubble.">
          <Switch
            aria-label="Spoken reactions"
            checked={companionSettings.voiceEnabled}
            onCheckedChange={(voiceEnabled) => change({ voiceEnabled })}
          />
        </Row>
        <Row label="Sound notifications" description="Play a short local cue when the buddy changes activity.">
          <Switch
            aria-label="Sound notifications"
            checked={companionSettings.soundEnabled}
            onCheckedChange={(soundEnabled) => change({ soundEnabled })}
          />
        </Row>
        <Row label="Notification volume">
          <div className="flex w-56 items-center gap-3">
            <Slider
              aria-label="Notification volume"
              min={0}
              max={1}
              step={0.05}
              value={[draftValue('soundVolume', companionSettings.soundVolume)]}
              onValueChange={([soundVolume]) => soundVolume !== undefined && setDraft('soundVolume', soundVolume)}
              onValueCommit={([soundVolume]) => soundVolume !== undefined && commitDraft('soundVolume', soundVolume)}
            />
            <span className="w-12 text-right font-mono text-sm">{Math.round(draftValue('soundVolume', companionSettings.soundVolume) * 100)}%</span>
          </div>
        </Row>
        <Row label="Sleep after inactivity" description="The buddy settles down without changing reading or model state.">
          <div className="flex w-56 items-center gap-3">
            <Slider
              aria-label="Sleep after inactivity"
              min={1}
              max={120}
              step={1}
              value={[draftValue('idleSleepMinutes', companionSettings.idleSleepMinutes)]}
              onValueChange={([idleSleepMinutes]) => idleSleepMinutes !== undefined && setDraft('idleSleepMinutes', idleSleepMinutes)}
              onValueCommit={([idleSleepMinutes]) => idleSleepMinutes !== undefined && commitDraft('idleSleepMinutes', idleSleepMinutes)}
            />
            <span className="w-16 text-right font-mono text-sm">
              {draftValue('idleSleepMinutes', companionSettings.idleSleepMinutes)} min
            </span>
          </div>
        </Row>
      </Section>

      <Section title="Reactions" description="The companion only reacts to enabled events from the application.">
        {STATES.map(([event, label]) => (
          <Row key={event} label={label}>
            <Switch
              aria-label={label}
              checked={companionSettings.reactions[event]}
              onCheckedChange={(enabled) => change({ reactions: { [event]: enabled } })}
            />
          </Row>
        ))}
      </Section>
    </>
  );
}
