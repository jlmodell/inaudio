import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';

const WAVE_BARS = 64;

/**
 * The last few seconds of a level as a wide, scrolling waveform: still and faint while idle,
 * frozen and dimmed while busy.
 */
export function LevelWave({ level, active, busy = false }: { level: number; active: boolean; busy?: boolean }) {
  const latest = useRef(level);
  latest.current = level;
  const [history, setHistory] = useState<number[]>(() => Array(WAVE_BARS).fill(0));

  useEffect(() => {
    if (!active) {
      if (!busy) setHistory(Array(WAVE_BARS).fill(0));
      return;
    }
    const id = setInterval(() => setHistory((h) => [...h.slice(1), latest.current]), 60);
    return () => clearInterval(id);
  }, [active, busy]);

  return (
    <div aria-hidden className="flex h-14 w-full items-center justify-between gap-[2px]">
      {history.map((value, index) => (
        <span
          key={index}
          className={cn('w-1 shrink-0 rounded-full transition-[height] duration-75', active ? 'bg-accent' : busy ? 'bg-accent/40' : 'bg-line-strong')}
          style={{ height: `${Math.max(4, Math.min(56, Math.sqrt(value) * 70))}px` }}
        />
      ))}
    </div>
  );
}

/** One number, with an optional drawing beside it. */
export function Stat({ label, value, unit, children }: { label: string; value: string; unit?: string; children?: ReactNode }) {
  return (
    <div className="grid gap-1.5 rounded-[12px] border border-line bg-surface px-[18px] py-4">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tabular-nums">
          {value}
          {unit && <span className="ml-1.5 text-[13px] font-medium text-muted">{unit}</span>}
        </span>
        {children}
      </div>
    </div>
  );
}
