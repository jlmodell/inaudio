import type { Settings } from '@shared/domain/settings';
import { OVERLAY_MIN_OPACITY } from '@shared/domain/settings';
import type { SystemStatus } from '@shared/domain/system';
import { Notice, Row } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { OverlayPlacement } from './overlay-placement';
import { ShortcutInput } from './shortcut-input';

/**
 * The four toggles that decide which sections the pill may show. Each one feeds
 * overlayPillWidth(), which counts a section only while it is drawn.
 */
const SECTIONS = [
  { key: 'showTimer', label: 'Elapsed time', description: 'How long the current recording has been running.' },
  { key: 'showLevel', label: 'Input level', description: 'A small meter that moves with your voice.' },
  { key: 'showModel', label: 'Recognition model', description: 'Also lets you switch model from the overlay.' },
  { key: 'showLanguage', label: 'Language', description: 'Shown only for multilingual models.' },
  { key: 'showCaption', label: 'Live caption', description: 'During a live transcript, the latest words heard.' },
] as const satisfies readonly { key: keyof Settings['overlay']; label: string; description: string }[];

export interface OverlaySettingsProps {
  overlay: Settings['overlay'];
  support: SystemStatus['overlay'];
  platform: SystemStatus['platform'];
  shortcut: SystemStatus['shortcuts']['overlay'];
  onChange(patch: Partial<Settings['overlay']>): void;
  /** Onboarding leaves out the two rows that only make sense once the app is in use. */
  compact?: boolean;
}

/**
 * Every overlay control, shared by the settings page and the setup step so the two stay in
 * step. Options the running session cannot honour are disabled rather than left to fail
 * quietly: on Wayland an overlay cannot float, fade, or notice the pointer.
 */
export function OverlaySettings({
  overlay,
  support,
  platform,
  shortcut,
  onChange,
  compact = false,
}: OverlaySettingsProps) {
  const off = !overlay.enabled;

  return (
    <>
      {!support.alwaysOnTop && (
        <div className="py-3">
          <Notice tone="warning">
            This desktop session does not let an application stay on top of other windows, so
            the overlay can be hidden behind them. The tray icon still reflects recording.
          </Notice>
        </div>
      )}

      <Row label="Show the overlay" description="A small floating pill that shows what dictation is doing.">
        <Switch
          aria-label="Show the overlay"
          checked={overlay.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </Row>

      <Row label="When to show it" description="Always keeps the pill on screen between recordings.">
        <Segmented<Settings['overlay']['visibility']>
          label="When to show the overlay"
          value={overlay.visibility}
          disabled={off}
          onValueChange={(visibility) => onChange({ visibility })}
          options={[
            { value: 'while-active', label: 'While active' },
            { value: 'always', label: 'Always' },
          ]}
        />
      </Row>

      <Row
        label="Placement"
        description={
          overlay.customX !== null
            ? 'Moved by hand. Pick an edge to put it back, or drag it by its handle again.'
            : 'Which edge of the screen the pill sits against. You can also drag it by its handle.'
        }
      >
        <OverlayPlacement
          value={overlay.position}
          disabled={off}
          onChange={(position) => onChange({ position, customX: null, customY: null })}
        />
      </Row>

      {!compact && (
        <Row label="Which display" description="With more than one screen, where the pill appears.">
          <Select<Settings['overlay']['display']>
            label="Which display"
            className="min-w-56"
            value={overlay.display}
            disabled={off}
            onValueChange={(display) => onChange({ display })}
            options={[
              {
                value: 'cursor',
                label: 'Follow the pointer',
                hint: support.cursor ? undefined : 'unavailable',
                disabled: !support.cursor,
              },
              { value: 'primary', label: 'Primary display' },
              { value: 'window', label: "Inaudio's display" },
            ]}
          />
        </Row>
      )}

      <Row
        label="Opacity"
        description={
          support.opacity
            ? 'How solid the pill looks over whatever is behind it.'
            : 'This desktop session does not support window transparency.'
        }
      >
        <div className="flex w-56 items-center gap-3">
          <Slider
            aria-label="Overlay opacity"
            min={OVERLAY_MIN_OPACITY}
            max={1}
            step={0.02}
            disabled={off || !support.opacity}
            value={[overlay.opacity]}
            onValueChange={([opacity]) => opacity !== undefined && onChange({ opacity })}
          />
          <span className="w-10 font-mono text-sm tabular-nums">
            {Math.round(overlay.opacity * 100)}%
          </span>
        </div>
      </Row>

      <Row
        label="Click through when idle"
        description={
          support.hover
            ? 'Clicks pass through to the app underneath until you point at the pill.'
            : 'Clicks pass through to the app underneath. This session cannot report the pointer, so the pill’s controls stay out of reach while this is on.'
        }
      >
        <Switch
          aria-label="Click through when idle"
          checked={overlay.clickThrough}
          disabled={off}
          onCheckedChange={(clickThrough) => onChange({ clickThrough })}
        />
      </Row>

      {SECTIONS.map((section) => (
        <Row key={section.key} label={section.label} description={section.description}>
          <Switch
            aria-label={section.label}
            checked={overlay[section.key]}
            disabled={off}
            onCheckedChange={(next) => onChange({ [section.key]: next })}
          />
        </Row>
      ))}

      {!compact && (
        <Row label="Show or hide the overlay" description="An optional shortcut that turns the pill on and off.">
          <ShortcutInput
            label="Overlay shortcut"
            optional
            value={overlay.toggleShortcut}
            platform={platform}
            status={shortcut}
            onChange={(toggleShortcut) => onChange({ toggleShortcut })}
          />
        </Row>
      )}
    </>
  );
}
