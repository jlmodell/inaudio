import {
  AlertTriangle,
  ArrowDown,
  Captions,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  MonitorSpeaker,
  Pin,
  Square,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { LiveSource } from '@shared/domain/capture';
import type { LiveWindowAction, LiveWindowState } from '@shared/domain/system';
import { Button } from '@renderer/components/ui/button';
import { Badge, Kbd, Notice } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { LevelBars, Timer } from '@renderer/features/overlay/level-bars';
import {
  Chip,
  Dot,
  iconButtonClass,
  recordButtonClass,
} from '@renderer/features/overlay/pill-parts';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration } from '@renderer/lib/format';

const SOURCES: { value: LiveSource; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'system+mic', label: '+ Mic' },
  { value: 'device', label: 'Device' },
];

const TEXT_SIZE = {
  sm: 'text-[13px] leading-normal',
  md: 'text-[15px] leading-relaxed',
  lg: 'text-lg leading-normal',
};

/** Further than this from the bottom, new text no longer scrolls the view. */
const FOLLOW_SLACK_PX = 24;

/** The panel: 6px corners, a hairline and a soft shadow inside the window's 8px margin. */
const panelClass =
  'h-full overflow-hidden rounded-[6px] border border-line bg-surface text-ink shadow-[0_4px_14px_rgb(0_0_0/0.16)] dark:shadow-[0_4px_16px_rgb(0_0_0/0.55)]';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: { edge: Edge; className: string }[] = [
  { edge: 'n', className: 'top-0 right-3 left-3 h-2 cursor-ns-resize' },
  { edge: 's', className: 'right-3 bottom-0 left-3 h-2 cursor-ns-resize' },
  { edge: 'e', className: 'top-3 right-0 bottom-3 w-2 cursor-ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 left-0 w-2 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-3 cursor-nwse-resize' },
];

/**
 * A transparent window has no native frame, so its margin is the frame: dragging an edge
 * or corner reports the pointer to the main process, which resizes within the limits.
 */
function ResizeEdges() {
  const frame = useRef(0);
  const down = (edge: Edge) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    api.liveWindow.resize('start', edge, event.screenX, event.screenY);
  };
  const move = (edge: Edge) => (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { screenX, screenY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() =>
      api.liveWindow.resize('move', edge, screenX, screenY),
    );
  };
  const up = (edge: Edge) => (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    cancelAnimationFrame(frame.current);
    event.currentTarget.releasePointerCapture(event.pointerId);
    api.liveWindow.resize('end', edge, event.screenX, event.screenY);
  };
  return (
    <>
      {EDGES.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          onPointerDown={down(edge)}
          onPointerMove={move(edge)}
          onPointerUp={up(edge)}
          onPointerCancel={up(edge)}
          className={cn('no-drag absolute z-10', className)}
        />
      ))}
    </>
  );
}

function act(action: LiveWindowAction): void {
  void api.liveWindow.act(action).catch(() => undefined);
}

/** The accent and motion the app window uses; light and dark follow the OS theme source. */
function useAppearance(state: LiveWindowState | null): void {
  const accentTone = state?.accentTone;
  const animate = state?.animate;
  useEffect(() => {
    if (!accentTone) return;
    const root = document.documentElement;
    root.dataset.accentTone = accentTone;
    root.dataset.motion = animate ? 'full' : 'off';
  }, [accentTone, animate]);
}

function useLiveWindow(): { state: LiveWindowState | null; level: number } {
  const [state, setState] = useState<LiveWindowState | null>(null);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const offs = [
      api.events.onLiveWindowState((next) => {
        setState(next);
        setLevel(next.level);
      }),
      api.events.onLiveWindowLevel(setLevel),
    ];
    // Escape puts the window away, once the user has clicked into it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) act('hide');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return { state, level };
}

function IconAction({
  label,
  onClick,
  children,
  pressed,
  className,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'no-drag',
        iconButtonClass,
        pressed && 'bg-accent-soft text-accent hover:text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The phase marker and the line beside it. */
function Status({ state, level }: { state: LiveWindowState; level: number }) {
  const { live, animate } = state;
  if (live.phase === 'capturing') {
    return (
      <>
        <Dot className="bg-record" pulse={animate} />
        <span className="min-w-0 truncate text-[13px] font-medium" title={state.sourceLabel}>
          {state.sourceLabel}
        </span>
        <Timer startedAt={live.startedAt} />
        <LevelBars level={level} active animate={animate} />
      </>
    );
  }
  if (live.phase === 'starting' || live.phase === 'finishing') {
    return (
      <>
        <Loader2
          aria-hidden
          className={cn('size-4 shrink-0 text-accent', animate && 'animate-spin')}
        />
        <span className="truncate text-[13px] font-medium">
          {live.phase === 'starting' ? 'Starting…' : 'Finishing…'}
        </span>
      </>
    );
  }
  if (live.phase === 'error') {
    return (
      <>
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-danger" />
        <span className="truncate text-[13px] font-medium">Live transcript stopped</span>
      </>
    );
  }
  return (
    <>
      <Captions aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="truncate text-[13px] font-medium text-muted">Live transcript</span>
    </>
  );
}

/**
 * Follows the end of the transcript while the reader is at the end. Scrolling up stops the
 * follow and offers a way back, so reading earlier text is never yanked away.
 */
function useFollow(content: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [content, following]);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK_PX);
  };
  const jump = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollowing(true);
  };
  return { ref, following, onScroll, jump };
}

function Transcript({ state }: { state: LiveWindowState }) {
  const { live } = state;
  const paragraphs = live.text ? live.text.split('\n\n') : [];
  const follow = useFollow(`${live.text}\u0000${live.preview}`);
  const active = live.phase === 'capturing' || live.phase === 'finishing';
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={follow.ref}
        onScroll={follow.onScroll}
        data-selectable
        className={cn(
          'app-scroll-area h-full overflow-y-auto px-4 py-3 break-words',
          TEXT_SIZE[state.textSize],
        )}
      >
        {state.truncated && (
          <p className="pb-2 text-xs text-faint">Earlier text is on the Live transcript page.</p>
        )}
        {live.behind && (
          <div className="pb-3">
            <Notice tone="warning">
              Transcription is {formatDuration(live.pendingMs)} behind. Nothing is lost; it catches
              up when the audio gets quieter.
            </Notice>
          </div>
        )}
        {/* A log announces each finished paragraph once; the grey guess below is never read out. */}
        <div role="log" aria-label="Transcript" className="grid gap-2.5">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="m-0 whitespace-pre-wrap text-ink">
              {paragraph}
            </p>
          ))}
        </div>
        {active && live.preview && (
          <p className="m-0 mt-2.5 whitespace-pre-wrap text-faint">{live.preview}</p>
        )}
        {active && !live.text && !live.preview && (
          <p className="m-0 text-faint">
            {live.phase === 'capturing'
              ? 'Listening. Text appears as it is heard.'
              : 'Finishing the transcript…'}
          </p>
        )}
        {!active && live.message && live.phase !== 'error' && (
          <p className="m-0 mt-3 text-sm text-muted">{live.message}</p>
        )}
      </div>
      {!follow.following && (
        <button
          type="button"
          onClick={follow.jump}
          className="absolute bottom-3 left-1/2 inline-flex h-[30px] -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink shadow-[0_4px_12px_rgb(0_0_0/0.14)]"
        >
          <ArrowDown aria-hidden className="size-[13px]" />
          Jump to latest
        </button>
      )}
    </div>
  );
}

function Ready({ state }: { state: LiveWindowState }) {
  const keys = state.shortcut ? formatAccelerator(state.shortcut, state.platform) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 py-3">
      {state.blocked ? (
        <Notice tone="warning">{state.blocked}</Notice>
      ) : (
        <>
          <p className="m-0 text-[15px] font-medium">Transcribe what this computer is playing.</p>
          <p className="m-0 text-[13px] leading-normal text-muted">
            Text appears here as it is heard. Audio stays on this computer and is never saved.
          </p>
          {keys && (
            <p className="m-0 mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              Or press <Kbd keys={keys} /> from any app.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Starting({ state }: { state: LiveWindowState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 py-3">
      <p className="m-0 text-[15px] font-medium">
        {state.picker ? 'Choose a screen to share its audio.' : 'Starting the live transcript…'}
      </p>
      {state.picker && (
        <p className="m-0 text-[13px] leading-normal text-muted">
          macOS asks each time. Only the audio is used; the picture is dropped right away.
        </p>
      )}
    </div>
  );
}

function Failed({ state }: { state: LiveWindowState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3.5">
      <Notice tone="danger">
        {state.live.message || 'The live transcript stopped unexpectedly.'}
      </Notice>
    </div>
  );
}

function Footer({ state }: { state: LiveWindowState }) {
  const { live } = state;
  const hasText = live.text.length > 0;
  const copy = hasText && (
    <IconAction label="Copy transcript" onClick={() => act('copy')}>
      <Copy aria-hidden className="size-[15px]" />
    </IconAction>
  );
  const openApp = (
    <IconAction label="Open in Inaudio" onClick={() => act('open-app')}>
      <ExternalLink aria-hidden className="size-[15px]" />
    </IconAction>
  );

  if (live.phase === 'capturing') {
    return (
      <>
        <Button
          variant="record"
          size="sm"
          className="no-drag h-[30px] px-3 text-[13px]"
          onClick={() => act('stop')}
        >
          <Square aria-hidden className="size-[11px]! fill-current" />
          Stop
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="no-drag h-[30px] px-2.5 text-[13px]"
          onClick={() => act('cancel')}
        >
          Discard
        </Button>
        <span className="flex-1" />
        <Chip title={state.model} className="max-w-32">
          {state.model}
        </Chip>
        {copy}
        {openApp}
      </>
    );
  }
  if (live.phase === 'starting') {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="no-drag h-[30px] px-3 text-[13px]"
        onClick={() => act('cancel')}
      >
        Cancel
      </Button>
    );
  }
  if (live.phase === 'finishing') {
    return (
      <>
        <span className="flex-1 text-xs text-faint">
          {live.pendingMs > 0
            ? `Transcribing the last ${Math.ceil(live.pendingMs / 1000)} s…`
            : 'Finishing the transcript…'}
        </span>
        {openApp}
      </>
    );
  }
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        className="no-drag h-[30px] px-3 text-[13px]"
        disabled={!!state.blocked}
        onClick={() => act('start')}
      >
        <MonitorSpeaker aria-hidden className="size-[14px]!" />
        {live.phase === 'error' ? 'Try again' : 'Start'}
      </Button>
      {/* The window is its own viewport: below 400px the source switch gives way to the actions. */}
      <div className="no-drag shrink-0 whitespace-nowrap max-[400px]:hidden [&_button]:h-[26px] [&_button]:px-2 [&_button]:text-xs">
        <Segmented<LiveSource>
          label="Audio source"
          value={state.nextSource}
          onValueChange={(source) => act(`source-${source}`)}
          options={SOURCES}
        />
      </div>
      <span className="flex-1" />
      {!!live.savedId && <Badge className="hidden min-[400px]:inline-flex">Saved</Badge>}
      {copy}
      {openApp}
    </>
  );
}

/** One caption line: the latest words, the timer, and stop. */
function Collapsed({ state }: { state: LiveWindowState }) {
  const { live } = state;
  const line = live.preview || live.text.slice(live.text.lastIndexOf('\n\n') + 2) || 'Listening…';
  return (
    <div className="h-full p-2">
      <section
        aria-label="Live transcript, collapsed"
        className={cn(panelClass, 'drag flex items-center gap-2.5 pr-2 pl-3.5')}
      >
        {live.phase === 'capturing' ? (
          <Dot className="bg-record" pulse={state.animate} />
        ) : (
          <Captions aria-hidden className="size-4 shrink-0 text-muted" />
        )}
        <Timer startedAt={live.phase === 'capturing' ? live.startedAt : 0} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px]',
            live.preview ? 'text-faint' : 'text-ink',
          )}
          title={line}
        >
          {line}
        </span>
        {live.phase === 'capturing' && (
          <IconAction
            label="Stop live transcript"
            onClick={() => act('stop')}
            className={recordButtonClass}
          >
            <Square aria-hidden className="size-[11px] fill-current" />
          </IconAction>
        )}
        <IconAction label="Expand" onClick={() => act('expand')}>
          <ChevronDown aria-hidden className="size-[15px]" />
        </IconAction>
      </section>
    </div>
  );
}

/**
 * The floating live window. The main process owns its size, its place and everything it
 * shows; this page only draws the pushed state and sends back one of a fixed set of actions.
 */
export function LiveWindow() {
  const { state, level } = useLiveWindow();
  useAppearance(state);
  if (!state) return null;
  if (state.collapsed) return <Collapsed state={state} />;

  const { live } = state;
  const body =
    live.phase === 'error' ? (
      <Failed state={state} />
    ) : live.phase === 'starting' ? (
      <Starting state={state} />
    ) : live.phase === 'idle' && !live.text ? (
      <Ready state={state} />
    ) : (
      <Transcript state={state} />
    );

  return (
    <div className="relative h-full p-2">
      <ResizeEdges />
      <section aria-label="Live transcript window" className={cn(panelClass, 'flex flex-col')}>
        <header className="drag flex h-11 shrink-0 items-center gap-2.5 border-b border-line pr-2 pl-3.5">
          <Status state={state} level={level} />
          <span className="flex-1" />
          {state.canPin && (
            <IconAction
              label={state.alwaysOnTop ? 'Stop keeping on top' : 'Keep on top'}
              pressed={state.alwaysOnTop}
              onClick={() => act('pin')}
            >
              <Pin aria-hidden className="size-[15px]" />
            </IconAction>
          )}
          {(live.phase === 'capturing' || live.text) && (
            <IconAction label="Collapse to one line" onClick={() => act('collapse')}>
              <ChevronUp aria-hidden className="size-[15px]" />
            </IconAction>
          )}
          <IconAction label="Hide window" onClick={() => act('hide')}>
            <X aria-hidden className="size-[15px]" />
          </IconAction>
        </header>
        {body}
        <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-2.5">
          <Footer state={state} />
        </footer>
      </section>
    </div>
  );
}
