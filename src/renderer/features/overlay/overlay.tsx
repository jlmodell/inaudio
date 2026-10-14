import { useEffect } from 'react';
import type { OverlayState } from '@shared/domain/system';
import { cn } from '@renderer/lib/cn';
import { Pill } from './pill';
import { useOverlayState } from './use-overlay';

/**
 * Mirrors the appearance attributes the app window sets from settings. The overlay has no
 * settings query of its own, so these arrive on the pushed state instead. Light and dark
 * need nothing here: the main process sets the OS theme source, which both windows read.
 */
function useAppearance(state: OverlayState | null): void {
  const accentTone = state?.accentTone;
  const animate = state?.animate;
  useEffect(() => {
    if (!accentTone) return;
    const root = document.documentElement;
    root.dataset.accentTone = accentTone;
    root.dataset.motion = animate ? 'full' : 'off';
  }, [accentTone, animate]);
}

export function Overlay() {
  const state = useOverlayState();
  useAppearance(state);

  // Nothing is drawn until the main process says what to draw. The window is transparent,
  // so an empty frame is invisible rather than a flash of blank surface.
  if (!state) return null;

  return (
    <div
      // The padding matches OVERLAY_PAD: transparent room for the pill's drop shadow.
      // Room for a panel is added on the far side of the anchor, so the pill holds its edge
      // and never jumps when a menu opens.
      className={cn(
        'flex h-full flex-col p-4',
        state.anchor === 'top' ? 'justify-start' : 'justify-end',
        state.align === 'left' ? 'items-start' : state.align === 'right' ? 'items-end' : 'items-center',
      )}
    >
      <Pill state={state} />
    </div>
  );
}
