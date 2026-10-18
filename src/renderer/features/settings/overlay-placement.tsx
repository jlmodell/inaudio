import { OVERLAY_POSITIONS, type OverlayPosition } from '@shared/domain/settings';
import { cn } from '@renderer/lib/cn';

/**
 * The nine cells of frame 11. The middle row is not a placement — it stands in for the
 * screen so the six corners and edges read as positions on it.
 */
const GRID: (OverlayPosition | null)[] = [
  'top-left',
  'top',
  'top-right',
  null,
  null,
  null,
  'bottom-left',
  'bottom',
  'bottom-right',
];

const LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top left',
  top: 'Top centre',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  bottom: 'Bottom centre',
  'bottom-right': 'Bottom right',
};

/** Picks which edge of the work area a floating window is pinned to. */
export function OverlayPlacement({
  value,
  onChange,
  disabled,
  label = 'Overlay placement',
}: {
  value: OverlayPosition;
  onChange(position: OverlayPosition): void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid grid-cols-[repeat(3,34px)] grid-rows-[repeat(3,26px)] gap-1',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {GRID.map((position, index) =>
        position === null ? (
          <span
            key={`gap-${index}`}
            aria-hidden
            className="rounded-[6px] border border-dashed border-line opacity-40"
          />
        ) : (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={value === position}
            aria-label={LABELS[position]}
            title={LABELS[position]}
            onClick={() => onChange(position)}
            className={cn(
              'rounded-[6px] border transition-colors',
              value === position
                ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]'
                : 'border-line bg-sunken hover:border-line-strong',
            )}
          />
        ),
      )}
    </div>
  );
}

/** Every placement, in schema order, for anywhere a list reads better than a grid. */
export const OVERLAY_PLACEMENT_OPTIONS = OVERLAY_POSITIONS.map((position) => ({
  value: position,
  label: LABELS[position],
}));
