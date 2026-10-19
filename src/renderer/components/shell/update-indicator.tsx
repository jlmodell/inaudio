import { ArrowDown, RotateCw } from 'lucide-react';
import { Tooltip } from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/cn';
import { useSettings, useUpdateStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';

const RING = 2 * Math.PI * 7;

/** A ring that fills with the download, around an arrow that nudges down while bytes arrive. */
function ProgressRing({ progress }: { progress: number }) {
  return (
    <span aria-hidden className="relative grid size-[18px] place-items-center">
      <svg viewBox="0 0 18 18" className="absolute inset-0 size-[18px] -rotate-90">
        <circle cx="9" cy="9" r="7" fill="none" strokeWidth="2.25" className="stroke-accent/25" />
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          strokeWidth="2.25"
          strokeLinecap="round"
          className="update-ring stroke-accent"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - Math.min(100, Math.max(0, progress)) / 100)}
        />
      </svg>
      <ArrowDown className="update-nudge size-[9px]" strokeWidth={3} />
    </span>
  );
}

/**
 * The update state beside the window controls. It appears only while automatic updates are
 * on and a release is on its way, and opens the Updates page; restarting is done there.
 */
export function UpdateIndicator() {
  const { data: settings } = useSettings();
  const { data: status } = useUpdateStatus();
  const openSettings = useUi((s) => s.openSettings);
  if (!settings?.updates.checkAutomatically || !status) return null;
  const { state, progress = 0, availableVersion } = status;
  if (state !== 'downloading' && state !== 'downloaded' && state !== 'available') return null;

  const label =
    state === 'downloading'
      ? `Downloading Inaudio ${availableVersion ?? ''}, ${Math.round(progress)}%`
      : state === 'downloaded'
        ? `Inaudio ${availableVersion ?? ''} is ready. Restart from Updates.`
        : `Inaudio ${availableVersion ?? ''} is available`;

  return (
    <>
      <Tooltip content={label} side="bottom">
        <button
          type="button"
          aria-label={label}
          onClick={() => openSettings('updates')}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full pr-2.5 text-xs font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            state === 'downloading' && 'bg-accent-soft pl-1.5 text-accent',
            state === 'downloaded' && 'update-pulse bg-accent pl-2 text-on-accent',
            state === 'available' && 'bg-sunken pl-2.5 text-ink hover:bg-line',
          )}
        >
          {state === 'downloading' && (
            <>
              <ProgressRing progress={progress} />
              <span className="tabular-nums">{Math.round(progress)}%</span>
            </>
          )}
          {state === 'downloaded' && (
            <>
              <RotateCw aria-hidden className="size-3.5" strokeWidth={2.5} />
              Update ready
            </>
          )}
          {state === 'available' && (
            <>
              <span aria-hidden className="size-[7px] rounded-full bg-accent" />
              Update {availableVersion}
            </>
          )}
        </button>
      </Tooltip>
      <span aria-hidden className="mx-1 h-[18px] w-px bg-line" />
    </>
  );
}
