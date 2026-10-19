import type { CSSProperties } from 'react';
import { cn } from '@renderer/lib/cn';

/**
 * A small moving waveform: the app's sign that something is recording or speaking. `level`
 * (0–1) makes the bars follow a live input; without it they keep an even rhythm. Under reduced
 * or off motion the bars hold still, so `label` carries the meaning.
 */
export function Waveform({
  level,
  bars = 4,
  label,
  paused,
  className,
  barClassName = 'w-[2.5px]',
}: {
  level?: number;
  bars?: number;
  label?: string;
  paused?: boolean;
  className?: string;
  barClassName?: string;
}) {
  const style = level === undefined ? undefined : ({ '--wave-amp': Math.min(1, Math.max(0, Math.sqrt(level) * 1.6)) } as CSSProperties);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-paused={paused || undefined}
      style={style}
      className={cn('wave-bars inline-flex h-3.5 shrink-0 items-center gap-[2px]', className)}
    >
      {Array.from({ length: bars }, (_, index) => (
        <i key={index} className={barClassName} />
      ))}
    </span>
  );
}
