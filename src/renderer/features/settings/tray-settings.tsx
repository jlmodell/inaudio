import type { Settings } from '@shared/domain/settings';
import type { SystemStatus } from '@shared/domain/system';
import { Notice, Row } from '@renderer/components/ui/layout';
import { Switch } from '@renderer/components/ui/switch';

export interface TraySettingsProps {
  tray: Settings['tray'];
  status: SystemStatus;
  onChange(patch: Partial<Settings['tray']>): void;
}

/** The tray icon and the menu behind it. */
export function TraySettings({ tray, status, onChange }: TraySettingsProps) {
  const off = !tray.enabled;

  return (
    <>
      {!status.notificationsSupported && (
        <div className="py-3">
          <Notice tone="neutral">
            This system has no notification service, so Inaudio reports reading state through
            the tray icon only.
          </Notice>
        </div>
      )}

      <Row label="Show the tray icon" description="Keep Inaudio reachable after its window is closed.">
        <Switch
          aria-label="Show the tray icon"
          checked={tray.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </Row>

      <Row
        label="Icon reflects state"
        description="The icon changes while Inaudio is reading aloud."
      >
        <Switch
          aria-label="Icon reflects state"
          checked={tray.reflectState}
          disabled={off}
          onCheckedChange={(reflectState) => onChange({ reflectState })}
        />
      </Row>

      <Row
        label="Notify instead"
        description={
          status.notificationsSupported
            ? 'Send a system notification when Read Aloud cannot start.'
            : 'This system has no notification service.'
        }
      >
        <Switch
          aria-label="Notify instead"
          checked={tray.notifications}
          disabled={off || !status.notificationsSupported}
          onCheckedChange={(notifications) => onChange({ notifications })}
        />
      </Row>
    </>
  );
}
