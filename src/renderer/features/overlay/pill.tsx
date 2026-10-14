import { AlertTriangle, Loader2, Mic, Square, TextCursorInput, X } from 'lucide-react';
import type { OverlayState } from '@shared/domain/system';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { LevelBars, Timer } from './level-bars';
import { OverlayMenu } from './overlay-menu';
import { DevicePicker, ModelPicker } from './pickers';
import { Chip, Divider, Dot, iconButtonClass, recordButtonClass } from './pill-parts';
import { useCloseOnIdle, useHoverReport, useMenuRoom } from './use-overlay';

const labelClass = 'min-w-0 truncate text-[13px] font-medium';

/** The leading marker and the line of text, which together name the phase. */
function Readout({ state }: { state: OverlayState }) {
  const { phase, message, animate } = state;

  if (phase === 'error') {
    return (
      <>
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-danger" />
        <span className={cn(labelClass, 'flex-1 text-ink')} title={message}>
          {message || 'Dictation failed'}
        </span>
      </>
    );
  }
  if (phase === 'listening') {
    return (
      <>
        <Dot className="bg-record" pulse={animate} />
        <span className={cn(labelClass, 'text-ink')}>Listening</span>
      </>
    );
  }
  if (phase === 'transcribing') {
    return (
      <>
        <Loader2
          aria-hidden
          className={cn('size-4 shrink-0 text-accent', animate && 'animate-spin')}
        />
        <span className={cn(labelClass, 'text-ink')}>Transcribing</span>
      </>
    );
  }
  if (phase === 'inserting') {
    return (
      <>
        <TextCursorInput aria-hidden className="size-4 shrink-0 text-accent" />
        <span className={cn(labelClass, 'text-ink')}>Inserting</span>
      </>
    );
  }
  return (
    <>
      <Mic aria-hidden className="size-4 shrink-0 text-muted" />
      <span className={cn(labelClass, 'text-muted')}>Ready</span>
    </>
  );
}

/**
 * The overlay itself: one pill, sized by the main process, showing the phase and — once the
 * pointer arms it — the controls that act on it.
 */
export function Pill({ state }: { state: OverlayState }) {
  const menu = useMenuRoom();
  const hover = useHoverReport();
  useCloseOnIdle(state.phase, menu.close);

  const recording = state.phase === 'listening';
  const busy = state.phase !== 'idle' && state.phase !== 'error';
  const failed = state.phase === 'error';
  // The error line takes the whole pill: the width granted for it was granted to be read.
  const armed = state.armed && !failed;
  const showModel = state.showModel && !failed;
  const showLanguage = state.showLanguage && !failed && state.language !== '' && !armed;
  const trailing = armed || failed || showModel || showLanguage;

  return (
    <div
      onMouseEnter={hover.onMouseEnter}
      onMouseMove={hover.onMouseMove}
      onMouseLeave={hover.onMouseLeave}
      className={cn(
        'flex h-11 w-max max-w-full items-center gap-2.5 overflow-hidden rounded-[22px] border border-line bg-surface px-3.5',
        'shadow-[0_6px_20px_rgb(0_0_0/0.14)] dark:shadow-[0_6px_22px_rgb(0_0_0/0.5)]',
        state.animate && 'transition-opacity duration-150',
        // At rest the pill sits back a little; working, armed or failing it comes forward.
        !armed && !busy && !failed && 'opacity-[0.92]',
      )}
    >
      <Readout state={state} />

      {state.showTimer && recording && <Timer startedAt={state.startedAt} />}
      {/* The bars give their width to the controls, which is what it was granted for. */}
      {state.showLevel && recording && !armed && (
        <LevelBars level={state.level} active animate={state.animate} />
      )}

      {trailing && <Divider />}

      {showModel &&
        (armed ? (
          <ModelPicker
            state={state}
            open={menu.isOpen('models')}
            onOpenChange={(open) => menu.change('models', open)}
          />
        ) : (
          <Chip title={state.model}>{state.model}</Chip>
        ))}
      {showLanguage && <Chip>{state.language}</Chip>}

      {armed && (
        <>
          {state.devices.length > 1 && (
            <DevicePicker
              state={state}
              open={menu.isOpen('devices')}
              onOpenChange={(open) => menu.change('devices', open)}
            />
          )}
          {recording ? (
            <button
              type="button"
              aria-label="Stop and transcribe"
              onClick={() => void api.overlay.act({ type: 'stop' })}
              className={cn(iconButtonClass, recordButtonClass)}
            >
              <Square aria-hidden className="size-[11px] fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Start recording"
              disabled={busy}
              onClick={() => void api.overlay.act({ type: 'start' })}
              className={iconButtonClass}
            >
              <Mic aria-hidden className="size-[15px]" />
            </button>
          )}
          <button
            type="button"
            aria-label="Cancel recording"
            disabled={!busy}
            onClick={() => void api.overlay.act({ type: 'cancel' })}
            className={iconButtonClass}
          >
            <X aria-hidden className="size-[15px]" />
          </button>
          <OverlayMenu
            state={state}
            open={menu.isOpen('more')}
            onOpenChange={(open) => menu.change('more', open)}
          />
        </>
      )}

      {failed && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => void api.overlay.act({ type: 'cancel' })}
          className={iconButtonClass}
        >
          <X aria-hidden className="size-[15px]" />
        </button>
      )}
    </div>
  );
}
