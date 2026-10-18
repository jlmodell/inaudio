import type { ReactNode } from 'react';
import { SettingsSidebar } from '@renderer/features/settings/settings-sidebar';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { Sidebar } from './sidebar';
import { TitleBar } from './title-bar';

/**
 * The canvas holds the sidebar; the workspace floats on it as one
 * full-height surface that includes the title bar and page content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: status } = useSystemStatus();
  const { data: settings } = useSettings();
  const mac = status?.platform === 'darwin';
  // Settings bring their own navigation, with a way back to the app.
  const inSettings = useUi((s) => s.route === 'settings');
  const maxWidth = settings?.appearance.contentWidth === 'compact' ? 'max-w-[840px]' : settings?.appearance.contentWidth === 'wide' ? 'max-w-[1160px]' : 'max-w-[1020px]';
  return (
    <div className="flex h-full bg-canvas">
      {inSettings ? <SettingsSidebar macInset={mac} /> : <Sidebar macInset={mac} />}
      <div className="flex min-w-0 flex-1 flex-col bg-surface shadow-[0_0_0_1px_var(--line)]">
        <TitleBar />
        <main className="app-scroll-area min-h-0 flex-1 overflow-y-auto bg-surface [scrollbar-gutter:stable]">
          <div className={`mx-auto w-full ${maxWidth} px-9 pt-9 pb-9`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
