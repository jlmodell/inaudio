import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Wordmark } from '@renderer/components/brand/logo';
import {
  BoxesMotion,
  PanelLeftCloseMotion,
  PanelLeftOpenMotion,
  Settings2Motion,
  SparklesMotion,
  Volume2Motion,
  WandSparklesMotion,
  type MotionIcon,
  type MotionIconHandle,
} from '@renderer/components/icons/motion-icons';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Tooltip } from '@renderer/components/ui/tooltip';
import { Waveform } from '@renderer/components/ui/waveform';
import { useReadAloud } from '@renderer/features/read-aloud/read-aloud-store';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator } from '@renderer/lib/format';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useUi, type Route } from '@renderer/stores/ui-store';
import { EngineStatus } from './engine-status';

type NavItem = { route: Route; label: string; icon: MotionIcon };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Listen',
    items: [{ route: 'read-aloud', label: 'Read Aloud', icon: Volume2Motion }],
  },
  {
    label: 'Engine',
    items: [
      { route: 'models', label: 'Models', icon: BoxesMotion },
      { route: 'companion', label: 'Companion', icon: SparklesMotion },
    ],
  },
];

function ActivityWave({ compact }: { compact: boolean }) {
  return (
    <Waveform
      bars={compact ? 3 : 4}
      label="Reading aloud"
      className={cn('text-accent', compact ? 'absolute top-1 right-1.5 h-2.5 gap-px' : 'ml-auto')}
      barClassName={compact ? 'w-[2px]' : 'w-[2.5px]'}
    />
  );
}

function usePlayOnActive(icon: RefObject<MotionIconHandle | null>, active: boolean | undefined) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && active) icon.current?.start();
    mounted.current = true;
  }, [active, icon]);
}

function NavButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
  trailing,
  reading,
}: {
  label: string;
  icon: MotionIcon;
  active?: boolean;
  collapsed: boolean;
  onClick(): void;
  trailing?: ReactNode;
  reading?: boolean;
}) {
  const icon = useRef<MotionIconHandle>(null);
  usePlayOnActive(icon, active);
  const button = (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => icon.current?.start()}
      onFocus={(event) => event.currentTarget.matches(':focus-visible') && icon.current?.start()}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent',
        active ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:bg-surface/60 hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon ref={icon} className={cn('size-[17px] shrink-0', active && 'text-accent')} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && trailing && !reading && <span className="ml-auto truncate pl-2 text-[11px] text-faint">{trailing}</span>}
      {reading && <ActivityWave compact={collapsed} />}
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

export function Sidebar({ macInset }: { macInset: boolean }) {
  const { route, navigate } = useUi();
  const openWhatsNew = useUi((s) => s.setWhatsNew);
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const reading = useReadAloud((s) => s.state.status === 'playing' || s.state.status === 'preparing');
  const whatsNewIcon = useRef<MotionIconHandle>(null);
  const toggleIcon = useRef<MotionIconHandle>(null);
  const collapsed = settings?.appearance.sidebarCollapsed ?? false;
  const unseen = !!status?.appVersion && settings?.announcements.seenVersion !== status.appVersion;
  const shortcut = settings && status ? formatAccelerator(settings.tts.shortcut, status.platform).join(' ') : '';

  const toggle = () => update.mutate({ appearance: { sidebarCollapsed: !collapsed } });

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
                        trailing={item.route === 'read-aloud' ? shortcut : undefined}
                        reading={item.route === 'read-aloud' && reading}
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
          <span className="relative">
            <NavButton label="What’s new" icon={WandSparklesMotion} collapsed onClick={() => openWhatsNew(true)} />
            {unseen && <span aria-label="Not seen yet" className="pointer-events-none absolute top-1.5 right-2 size-2 rounded-full bg-accent" />}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => openWhatsNew(true)}
            onMouseEnter={() => whatsNewIcon.current?.start()}
            className={cn(
              'flex items-center gap-2.5 rounded-[10px] p-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent',
              unseen ? 'border border-line bg-surface hover:border-line-strong' : 'hover:bg-surface/60',
            )}
          >
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-[8px]', unseen ? 'bg-accent-soft text-accent' : 'text-muted')}>
              <WandSparklesMotion ref={whatsNewIcon} className="size-4" />
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
            <NavButton label="Settings" icon={Settings2Motion} active={route === 'settings'} collapsed={collapsed} onClick={() => navigate('settings')} />
          </div>
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            side="right"
            onClick={toggle}
            onMouseEnter={() => toggleIcon.current?.start()}
          >
            {collapsed ? <PanelLeftOpenMotion ref={toggleIcon} /> : <PanelLeftCloseMotion ref={toggleIcon} />}
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
