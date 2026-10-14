import type { ReactNode } from 'react';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { Sidebar } from './sidebar';
import { TitleBar } from './title-bar';

/**
 * The canvas holds the sidebar; the workspace floats on it as the one
 * page-level surface, inset on top/right and flush with the bottom edge.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: status } = useSystemStatus();
  const { data: settings } = useSettings();
  const mac = status?.platform === 'darwin';
  const maxWidth = settings?.appearance.contentWidth === 'compact' ? 'max-w-[840px]' : settings?.appearance.contentWidth === 'wide' ? 'max-w-[1160px]' : 'max-w-[1020px]';
  return (
    <div className="flex h-full bg-canvas">
      <Sidebar macInset={mac} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="app-scroll-area mr-3 min-h-0 flex-1 overflow-y-auto rounded-t-[6px] bg-surface shadow-[0_0_0_1px_var(--line)] [scrollbar-gutter:stable]">
          <div className={`mx-auto w-full ${maxWidth} px-9 pt-9 pb-9`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
