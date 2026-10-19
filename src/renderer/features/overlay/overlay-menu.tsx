import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { OverlayState } from '@shared/domain/system';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { iconButtonClass } from './pill-parts';
import { panelClass, panelItemClass, PanelSeparator, PanelTail } from './panel';

/**
 * The overflow menu: everything the pill has no room to show as a button, including the
 * two ways out of the overlay itself.
 */
export function OverlayMenu({
  state,
  open,
  onOpenChange,
}: {
  state: OverlayState;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const recording = state.phase === 'listening';
  const busy = state.phase !== 'idle' && state.phase !== 'error';

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger
        aria-label="More overlay actions"
        className={cn(iconButtonClass, open && 'bg-accent-soft text-accent')}
      >
        <MoreHorizontal className="size-[15px]" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={state.anchor === 'top' ? 'bottom' : 'top'}
          align="end"
          sideOffset={8}
          collisionPadding={0}
          // The window cannot take focus, so returning it on close has nowhere to go.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn(panelClass, 'min-w-[196px]')}
        >
          {recording && (
            <DropdownMenu.Item
              className={panelItemClass}
              onSelect={() => void api.overlay.act({ type: 'stop' })}
            >
              Stop and transcribe
              <PanelTail>↵</PanelTail>
            </DropdownMenu.Item>
          )}
          {!busy && !recording && (
            <DropdownMenu.Item
              className={panelItemClass}
              onSelect={() => void api.overlay.act({ type: 'start' })}
            >
              Start recording
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            disabled={!busy}
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'cancel' })}
          >
            Cancel recording
            <PanelTail>Esc</PanelTail>
          </DropdownMenu.Item>
          <PanelSeparator />
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'open-latest' })}
          >
            Open last transcript
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'open-history' })}
          >
            Open History
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'reset-position' })}
          >
            Reset position
          </DropdownMenu.Item>
          <PanelSeparator />
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'hide' })}
          >
            Hide overlay
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'open-app' })}
          >
            Open Inaudio
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={panelItemClass}
            onSelect={() => void api.overlay.act({ type: 'open-audio' })}
          >
            Audio settings
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
