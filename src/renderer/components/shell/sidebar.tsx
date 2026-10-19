import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { AudioLines, Boxes, Captions, History, Mic, PanelLeftClose, PanelLeftOpen, Settings2, Sparkles, Volume2, WandSparkles } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Wordmark } from '@renderer/components/brand/logo';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Tooltip } from '@renderer/components/ui/tooltip';
import { useLive } from '@renderer/features/live/live-store';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator } from '@renderer/lib/format';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi, type Route } from '@renderer/stores/ui-store';
import { EngineStatus } from './engine-status';

type NavItem = { route: Route; label: string; icon: ComponentType<{ className?: string }> };

/** The app's pages in groups, the same way Settings lists its categories. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Speak',
    items: [
      { route: 'dictation', label: 'Dictation', icon: Mic },
      { route: 'live', label: 'Live transcript', icon: Captions },
      { route: 'read-aloud', label: 'Read Aloud', icon: Volume2 },
    ],
  },
  { label: 'Library', items: [{ route: 'history', label: 'History', icon: History }] },
  {
    label: 'Engine',
    items: [
      { route: 'models', label: 'Models', icon: Boxes },
      { route: 'audio', label: 'Audio', icon: AudioLines },
      { route: 'companion', label: 'Companion', icon: Sparkles },
    ],
  },
];

function NavButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
  trailing,
  marker,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  collapsed: boolean;
  onClick(): void;
  /** Quiet text on the right, such as a shortcut. Hidden when collapsed. */
  trailing?: ReactNode;
  /** A dot that says something is happening there. */
  marker?: { label: string; className: string } | null;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent',
        active ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:bg-surface/60 hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className={cn('size-[17px] shrink-0', active && 'text-accent')} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && trailing && !marker && <span className="ml-auto truncate pl-2 text-[11px] text-faint">{trailing}</span>}
      {marker && (
        <span
          aria-label={marker.label}
          className={cn('size-2 shrink-0 rounded-full', collapsed ? 'absolute top-1.5 right-2' : 'ml-auto', marker.className)}
        />
      )}
    </button>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

/**
 * The app's navigation: pages in groups, then what is always within reach at the bottom:
 * what's new, the engine's state, Settings and the collapse control.
 */
export function Sidebar({ macInset }: { macInset: boolean }) {
  const { route, navigate } = useUi();
  const openWhatsNew = useUi((s) => s.setWhatsNew);
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const phase = useDictation((s) => s.phase);
  const liveCapturing = useLive((s) => s.live.phase === 'capturing');
  const collapsed = settings?.appearance.sidebarCollapsed ?? false;
  const unseen = !!status?.appVersion && settings?.announcements.seenVersion !== status.appVersion;
  const shortcut = settings && status ? formatAccelerator(settings.dictation.shortcut, status.platform).join(' ') : '';

  const toggle = () => update.mutate({ appearance: { sidebarCollapsed: !collapsed } });
  const marker = (target: Route) =>
    target === 'dictation' && phase === 'listening'
      ? { label: 'Listening', className: 'animate-pulse bg-record' }
      : target === 'live' && liveCapturing
        ? { label: 'Recording system audio', className: 'animate-pulse bg-record' }
        : null;

  return (
    <aside
      aria-label="Primary"
      className={cn('flex shrink-0 flex-col pb-3 transition-[width] duration-200', collapsed ? 'w-[72px]' : 'w-[240px]')}
    >
      <div className={cn('drag flex h-11 shrink-0 items-center', macInset ? 'pl-[84px]' : 'pl-4')} />
      <div className={cn('flex shrink-0 items-center px-4 pt-2 pb-3', collapsed ? 'justify-center px-0' : 'justify-between')}>
        <Wordmark collapsed={collapsed} />
      </div>

      <NavigationMenu.Root orientation="vertical" className="app-scroll-area min-h-0 flex-1 overflow-y-auto">
        <NavigationMenu.List className="grid gap-0.5 px-3">
          {GROUPS.map((group) => (
            <li key={group.label} className="contents">
              {collapsed ? (
                <span aria-hidden className="mx-auto my-2 block h-px w-6 bg-line first:hidden" />
              ) : (
                <span className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">{group.label}</span>
              )}
              <ul className="m-0 grid list-none gap-0.5 p-0" aria-label={group.label}>
                {group.items.map((item) => (
                  <NavigationMenu.Item key={item.route}>
                    <NavigationMenu.Link asChild active={item.route === route}>
                      <NavButton
                        label={item.label}
                        icon={item.icon}
                        active={item.route === route}
                        collapsed={collapsed}
                        onClick={() => navigate(item.route)}
                        trailing={item.route === 'dictation' ? shortcut : undefined}
                        marker={marker(item.route)}
                      />
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                ))}
              </ul>
            </li>
          ))}
        </NavigationMenu.List>
      </NavigationMenu.Root>

      <div className="grid shrink-0 gap-1 px-3 pt-2">
        {collapsed ? (
          <NavButton
            label="What’s new"
            icon={WandSparkles}
            collapsed
            onClick={() => openWhatsNew(true)}
            marker={unseen ? { label: 'Not seen yet', className: 'bg-accent' } : null}
          />
        ) : (
          <button
            type="button"
            onClick={() => openWhatsNew(true)}
            className={cn(
              'flex items-center gap-2.5 rounded-[10px] p-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              unseen ? 'border border-line bg-surface hover:border-line-strong' : 'hover:bg-surface/60',
            )}
          >
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-[8px]', unseen ? 'bg-accent-soft text-accent' : 'text-muted')}>
              <WandSparkles aria-hidden className="size-4" />
            </span>
            <span className="grid min-w-0 gap-px">
              <span className={cn('truncate text-[13px]', unseen ? 'font-semibold text-ink' : 'text-muted')}>
                What’s new{status?.appVersion ? ` in ${status.appVersion}` : ''}
              </span>
              {unseen && <span className="truncate text-xs text-muted">See what changed</span>}
            </span>
            {unseen && <span aria-label="Not seen yet" className="ml-auto size-[7px] shrink-0 rounded-full bg-accent" />}
          </button>
        )}
        <EngineStatus collapsed={collapsed} />
        <div className={cn('flex items-center gap-1 border-t border-line pt-1.5', collapsed && 'flex-col')}>
          <div className={cn(collapsed ? 'w-full' : 'flex-1')}>
            <NavButton label="Settings" icon={Settings2} active={route === 'settings'} collapsed={collapsed} onClick={() => navigate('settings')} />
          </div>
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right" onClick={toggle}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
