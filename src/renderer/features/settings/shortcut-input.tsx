import { useState } from 'react';
import { X } from 'lucide-react';
import type { ShortcutStatus } from '@shared/domain/system';
import { Kbd } from '@renderer/components/ui/layout';
import { cn } from '@renderer/lib/cn';
import { acceleratorFromEvent, formatAccelerator } from '@renderer/lib/format';

/** What went wrong, for a shortcut that is configured but not held by this app. */
const NOTE: Record<ShortcutStatus, string | null> = {
  registered: null,
  unavailable: 'In use by another app',
  off: null,
};

/**
 * Click, then press a key combination. Escape cancels. An optional shortcut can also be
 * cleared, which is the only way to turn one off.
 */
export function ShortcutInput({
  value,
  platform,
  onChange,
  label,
  status,
  optional = false,
}: {
  value: string;
  platform: string;
  onChange(accelerator: string): void;
  label: string;
  /** Whether the main process actually holds this accelerator. */
  status: ShortcutStatus;
  /** True where "" is a valid value, which adds a button to clear it. */
  optional?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const note = recording ? null : NOTE[status];

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-danger">{note}</span>}
      <button
        type="button"
        aria-label={value ? `${label}: ${value}. Press to change.` : `${label}: off. Press to set.`}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(event) => {
          if (!recording) return;
          event.preventDefault();
          if (event.key === 'Escape') return setRecording(false);
          const accelerator = acceleratorFromEvent(event.nativeEvent, platform);
          if (accelerator) {
            onChange(accelerator);
            setRecording(false);
          }
        }}
        className={cn(
          'flex h-9 min-w-44 items-center justify-center rounded-[6px] px-3 text-sm',
          recording
            ? 'bg-accent-soft text-accent shadow-[0_0_0_2px_var(--accent)]'
            : 'bg-sunken hover:bg-line',
        )}
      >
        {recording ? (
          'Press keys…'
        ) : value ? (
          <Kbd keys={formatAccelerator(value, platform)} />
        ) : (
          <span className="text-muted">Not set</span>
        )}
      </button>
      {optional && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          disabled={!value}
          onClick={() => onChange('')}
          className="grid size-8 place-items-center rounded-lg text-faint hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-0"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
