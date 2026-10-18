import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { AudioLines, Boxes, Captions, History, Mic, PanelLeftClose, PanelLeftOpen, Settings2, Sparkles, Volume2 } from 'lucide-react';
import { useLive } from '@renderer/features/live/live-store';
import type { ComponentType } from 'react';
import { Wordmark } from '@renderer/components/brand/logo';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Tooltip } from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/cn';
import { useSettings, useUpdateSettings } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi, type Route } from '@renderer/stores/ui-store';
import { EngineStatus } from './engine-status';

const NAV: { route: Route; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { route: 'dictation', label: 'Dictation', icon: Mic },
  { route: 'live', label: 'Live transcript', icon: Captions },
  { route: 'history', label: 'History', icon: History },
  { route: 'read-aloud', label: 'Read Aloud', icon: Volume2 },
  { route: 'models', label: 'Models', icon: Boxes },
  { route: 'audio', label: 'Audio', icon: AudioLines },
  { route: 'companion', label: 'Companion', icon: Sparkles },
  { route: 'settings', label: 'Settings', icon: Settings2 },
];

export function Sidebar({ macInset }: { macInset: boolean }) {
  const { route, navigate } = useUi();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const phase = useDictation((s) => s.phase);
  const liveCapturing = useLive((s) => s.live.phase === 'capturing');
  const collapsed = settings?.appearance.sidebarCollapsed ?? false;

  const toggle = () => update.mutate({ appearance: { sidebarCollapsed: !collapsed } });

  return (
    <aside
      aria-label="Primary"
      className={cn('flex shrink-0 flex-col pb-4 transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-[232px]')}
    >
      <div className={cn('drag flex h-11 items-center', macInset ? 'pl-[84px]' : 'pl-4')} />
      <div className={cn('flex items-center px-4 pt-3 pb-6', collapsed ? 'justify-center px-0' : 'justify-between')}>
        <Wordmark collapsed={collapsed} />
      </div>

      <NavigationMenu.Root orientation="vertical" className="flex-1">
        <NavigationMenu.List className="grid gap-0.5 px-3">
          {NAV.map(({ route: target, label, icon: Icon }) => {
            const active = target === route;
            const link = (
              <NavigationMenu.Link asChild active={active}>
                <button
                  type="button"
                  onClick={() => navigate(target)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    active ? 'bg-surface text-ink' : 'text-muted hover:bg-surface/60 hover:text-ink',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <Icon className={cn('size-[18px]', active && 'text-accent')} />
                  {!collapsed && <span>{label}</span>}
                  {target === 'dictation' && phase === 'listening' && (
                    <span aria-label="Listening" className="absolute top-2 right-2 size-2 animate-pulse rounded-full bg-record" />
                  )}
                  {target === 'live' && liveCapturing && (
                    <span aria-label="Recording system audio" className="absolute top-2 right-2 size-2 animate-pulse rounded-full bg-record" />
                  )}
                </button>
              </NavigationMenu.Link>
            );
            return (
              <NavigationMenu.Item key={target}>
                {collapsed ? (
                  <Tooltip content={label} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </NavigationMenu.Item>
            );
          })}
        </NavigationMenu.List>
      </NavigationMenu.Root>

      <div className="px-3 pb-2">
        <EngineStatus collapsed={collapsed} />
      </div>
      <div className={cn('flex px-3', collapsed ? 'justify-center' : 'justify-start')}>
        <IconButton
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          side="right"
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </IconButton>
      </div>
    </aside>
  );
}
