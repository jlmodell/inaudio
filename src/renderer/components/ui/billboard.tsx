import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';
import { useSettings } from '@renderer/lib/queries';

/**
 * A billboard modal: a centered dialog led by a large animated hero, then short copy and the
 * actions. Used for setup and for what's new; never for anything that could wait. The hero
 * is decorative and hidden from assistive tech; the title and description carry the meaning.
 */
export function Billboard({
  open,
  onOpenChange,
  hero,
  stepKey,
  title,
  description,
  children,
  footer,
  dismissible = true,
  label,
  className,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  hero: ReactNode;
  /** Changing it slides the hero and copy to the next step. */
  stepKey?: string | number;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  /** Escape and a click outside close it; off for setup, which closes from its own buttons. */
  dismissible?: boolean;
  /** Accessible name of the whole dialog when the title changes per step. */
  label?: string;
  className?: string;
}) {
  const { data: settings } = useSettings();
  const motionSetting = settings?.appearance.animations ?? 'full';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="billboard-overlay fixed inset-0 z-50 bg-[rgb(10_12_16/0.45)] dark:bg-black/60" />
        <DialogPrimitive.Content
          aria-label={label}
          onEscapeKeyDown={(event) => !dismissible && event.preventDefault()}
          onPointerDownOutside={(event) => !dismissible && event.preventDefault()}
          onInteractOutside={(event) => !dismissible && event.preventDefault()}
          className={cn(
            'billboard-content fixed top-1/2 left-1/2 z-50 flex max-h-[min(88vh,820px)] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-line bg-surface text-ink outline-none',
            'shadow-[0_24px_64px_rgb(0_0_0/0.28)] dark:shadow-[0_24px_64px_rgb(0_0_0/0.6)]',
            className,
          )}
        >
          {/* "reduced" and "off" both mean no sliding; Radix and CSS handle the rest. */}
          <MotionConfig reducedMotion={motionSetting === 'full' ? 'user' : 'always'}>
            <div aria-hidden className="relative h-[210px] shrink-0 overflow-hidden bg-accent-soft">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stepKey ?? 'hero'}
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  {hero}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="app-scroll-area min-h-0 flex-1 overflow-y-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stepKey ?? 'body'}
                  className="grid gap-3 px-7 pt-6 pb-1"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
                >
                  <DialogPrimitive.Title className="m-0 text-[22px] leading-tight font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                  {description ? (
                    <DialogPrimitive.Description className="m-0 text-sm leading-relaxed text-muted">{description}</DialogPrimitive.Description>
                  ) : (
                    <DialogPrimitive.Description className="sr-only">{label}</DialogPrimitive.Description>
                  )}
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
            <footer className="flex shrink-0 items-center gap-2 px-7 pt-4 pb-6">{footer}</footer>
          </MotionConfig>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The step indicator: dots, with the current step drawn long. */
export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 rounded-full transition-[width,background-color] duration-300',
            index === current ? 'w-5 bg-accent' : index < current ? 'w-1.5 bg-line-strong' : 'w-1.5 bg-line',
          )}
        />
      ))}
    </span>
  );
}
