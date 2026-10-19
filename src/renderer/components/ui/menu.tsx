import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';

/** The card every app menu draws in; the same surface the overlay panels use. */
const contentClass =
  'z-50 min-w-[220px] rounded-[12px] border border-line bg-surface p-[5px] text-ink shadow-[0_10px_30px_rgb(0_0_0/0.14)] dark:shadow-[0_10px_30px_rgb(0_0_0/0.55)]';
const itemClass =
  'flex h-8 cursor-default items-center gap-2.5 rounded-[6px] px-2.5 text-sm outline-none select-none data-disabled:text-faint data-highlighted:bg-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted';

/** A "⋯" button, or a labelled one, that opens a menu of actions. */
export function ActionMenu({
  label,
  children,
  align = 'end',
  triggerClassName,
  trigger,
}: {
  /** Accessible name for the trigger, e.g. "Actions for Release planning call". */
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
  /** Visible trigger content in place of the "⋯" icon. */
  trigger?: ReactNode;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[6px] text-muted outline-none hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-sunken data-[state=open]:text-ink',
          triggerClassName,
        )}
      >
        {trigger ?? <MoreHorizontal aria-hidden className="size-4" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} collisionPadding={12} className={contentClass}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  tail,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect(): void;
  icon?: ReactNode;
  tail?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, danger && 'text-danger [&_svg]:text-danger')}>
      {icon}
      <span className="flex-1">{children}</span>
      {tail && <span className="pl-4 text-xs text-faint">{tail}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuSub({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-sunken')}>
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight aria-hidden />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={6} collisionPadding={12} className={cn(contentClass, 'min-w-[180px]')}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-[7px] my-[5px] h-px bg-line" />;
}
