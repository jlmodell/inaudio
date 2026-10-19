import { PictureInPicture2 } from 'lucide-react';
import { LIVE_WINDOW_MIN_OPACITY, type Settings } from '@shared/domain/settings';
import type { OverlaySupport } from '@shared/domain/system';
import { Button } from '@renderer/components/ui/button';
import { Row } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { api } from '@renderer/lib/api';
import { OverlayPlacement } from './overlay-placement';

const TEXT_SIZES: { value: Settings['liveWindow']['textSize']; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

/** The floating live window: when it opens, how it floats, and how it reads. */
export function LiveWindowSettings({
  liveWindow,
  support,
  platform,
  onChange,
}: {
  liveWindow: Settings['liveWindow'];
  support: OverlaySupport;
  platform: NodeJS.Platform;
  onChange(patch: Partial<Settings['liveWindow']>): void;
}) {
  const protection = platform === 'win32' || platform === 'darwin';
  return (
    <>
      <Row id="settings-live-window-open" label="Show when a session starts" description="Otherwise open it from the tray, the overlay or its shortcut.">
        <Button size="sm" variant="ghost" onClick={() => void api.live.openWindow()}>
          <PictureInPicture2 /> Show now
        </Button>
        <Switch aria-label="Show when a session starts" checked={liveWindow.openOnStart} onCheckedChange={(openOnStart) => onChange({ openOnStart })} />
      </Row>
      <Row
        id="settings-live-window-top"
        label="Keep on top of other windows"
        description={support.alwaysOnTop ? 'The pin in the window’s header changes this too.' : 'This desktop session does not let apps keep windows on top.'}
      >
        <Switch
          aria-label="Keep on top of other windows"
          disabled={!support.alwaysOnTop}
          checked={liveWindow.alwaysOnTop}
          onCheckedChange={(alwaysOnTop) => onChange({ alwaysOnTop })}
        />
      </Row>
      <Row
        id="settings-live-window-capture"
        label="Hide from screen sharing"
        description={
          !protection
            ? 'Not available on Linux.'
            : platform === 'darwin'
              ? 'Others in a call won’t see it. Apps that use ScreenCaptureKit can still capture it.'
              : 'Others in a call won’t see it, and it is left out of screenshots.'
        }
      >
        <Switch
          aria-label="Hide from screen sharing"
          disabled={!protection}
          checked={protection && liveWindow.hideFromCapture}
          onCheckedChange={(hideFromCapture) => onChange({ hideFromCapture })}
        />
      </Row>
      <Row id="settings-live-window-text" label="Text size">
        <Segmented label="Live window text size" value={liveWindow.textSize} onValueChange={(textSize) => onChange({ textSize })} options={TEXT_SIZES} />
      </Row>
      <Row label="Opacity" description={support.opacity ? undefined : 'Not available on Linux.'}>
        <div className="flex w-72 items-center gap-3">
          <Slider
            aria-label="Live window opacity"
            min={LIVE_WINDOW_MIN_OPACITY}
            max={1}
            step={0.05}
            disabled={!support.opacity}
            value={[liveWindow.opacity]}
            onValueChange={([opacity]) => opacity !== undefined && onChange({ opacity })}
          />
          <span className="w-12 font-mono text-sm tabular-nums">{Math.round(liveWindow.opacity * 100)}%</span>
        </div>
      </Row>
      <Row id="settings-live-window-position" label="Where it opens" description="Drag it anywhere while it is open. It returns to this corner next time.">
        <OverlayPlacement label="Live window placement" value={liveWindow.position} onChange={(position) => onChange({ position })} />
      </Row>
    </>
  );
}
