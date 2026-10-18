import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';

/**
 * A panel that slides in from the right edge: a Radix Dialog drawn as a side sheet. It is
 * modal, traps focus, closes on Escape or a click outside, and hands focus back to whatever
 * opened it. Motion follows the app's animation setting.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: ReactNode;
  /** Announced with the title; shown under it. */
  description?: ReactNode;
  /** Buttons beside the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-40 bg-black/30" />
        <DialogPrimitive.Content
          className={cn(
            'drawer-content fixed top-0 right-0 bottom-0 z-50 flex w-[min(520px,100vw)] flex-col border-l border-line bg-surface text-ink outline-none',
            'shadow-[-12px_0_32px_rgb(0_0_0/0.18)] dark:shadow-[-12px_0_32px_rgb(0_0_0/0.5)]',
            className,
          )}
        >
          <header className="flex items-start gap-2 border-b border-line px-5 pt-5 pb-4">
            <div className="grid min-w-0 flex-1 gap-1">
              <DialogPrimitive.Title className="m-0 truncate text-lg font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description asChild>
                  <div className="text-sm text-muted">{description}</div>
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>
              )}
            </div>
            {headerActions}
            <DialogPrimitive.Close
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-[6px] text-muted hover:bg-sunken hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="app-scroll-area min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <footer className="flex items-center gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
