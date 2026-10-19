import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readAloudActive } from '@shared/domain/read-aloud';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Waveform } from '@renderer/components/ui/waveform';
import { cn } from '@renderer/lib/cn';
import { formatDuration } from '@renderer/lib/format';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { useReadAloud } from './read-aloud-store';

/** Whether the Read Aloud voice is downloaded, so a button can say why it cannot read yet. */
export function useVoiceReady(): boolean {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  return !!settings && !!status?.models.some((m) => m.id === settings.tts.modelId && m.state === 'installed');
}

/** How the current session relates to one in-app item: not it, reading it, or paused on it. */
export function useReadingState(id: string): 'idle' | 'reading' | 'paused' {
  return useReadAloud((s) => {
    if (s.origin?.id !== id || s.state.sessionId !== s.session?.sessionId || !readAloudActive(s.state.status)) return 'idle';
    return s.state.status === 'paused' ? 'paused' : 'reading';
  });
}

/**
 * Reads a piece of saved text aloud, or pauses and resumes it while it is the one being read.
 * Used on History rows, in the transcript drawer and on the Dictation page's recent takes.
 */
export function ReadAloudButton({
  id,
  title,
  text,
  variant = 'icon',
  className,
}: {
  id: string;
  title: string;
  text: string;
  /** `icon` for rows, `button` with a label for toolbars. */
  variant?: 'icon' | 'button';
  className?: string;
}) {
  const reading = useReadingState(id);
  const ready = useVoiceReady();
  const { readText, control } = useReadAloud.getState();
  const act = () => (reading === 'reading' ? control('pause') : reading === 'paused' ? control('resume') : void readText(text, { id, title }));
  const label = !ready ? 'Download a Read Aloud voice in Models first' : reading === 'reading' ? 'Pause reading' : reading === 'paused' ? 'Resume reading' : 'Read aloud';

  if (variant === 'button') {
    return (
      <Button size="sm" onClick={act} disabled={!ready} title={ready ? undefined : label} aria-pressed={reading !== 'idle'} className={cn(reading !== 'idle' && 'bg-accent-soft text-accent hover:bg-accent-soft', className)}>
        {reading === 'idle' ? <Volume2 /> : <Waveform paused={reading === 'paused'} className="h-3.5" />}
        {reading === 'reading' ? 'Pause' : reading === 'paused' ? 'Resume' : 'Read aloud'}
      </Button>
    );
  }
  if (reading !== 'idle') {
    return (
      <button
        type="button"
        onClick={act}
        aria-label={label}
        title={label}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 text-xs font-medium text-accent outline-none focus-visible:outline-2 focus-visible:outline-accent',
          className,
        )}
      >
        <Waveform paused={reading === 'paused'} />
        {reading === 'paused' ? 'Paused' : 'Reading'}
        {reading === 'paused' ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5 fill-current" />}
      </button>
    );
  }
  return (
    <IconButton label={label} size="icon-sm" onClick={act} disabled={!ready} className={className}>
      <Volume2 />
    </IconButton>
  );
}

/**
 * The reading started from somewhere in the app, kept in reach on every page but Read Aloud:
 * what is being read, how far along, pause, stop, and the way to the full player.
 */
/** Time read so far, ticking twice a second while audio plays. */
function useReadClock(playing: boolean): number {
  const elapsed = useReadAloud((s) => s.elapsed);
  const [value, setValue] = useState(() => elapsed());
  useEffect(() => {
    setValue(elapsed());
    if (!playing) return;
    const id = setInterval(() => setValue(elapsed()), 500);
    return () => clearInterval(id);
  }, [elapsed, playing]);
  return value;
}

export function useNowReadingVisible(): boolean {
  const route = useUi((s) => s.route);
  const active = useReadAloud((s) => !!s.origin && s.state.sessionId === s.session?.sessionId && readAloudActive(s.state.status));
  return active && route !== 'read-aloud' && route !== 'settings';
}

export function NowReadingBar() {
  const origin = useReadAloud((s) => s.origin);
  const state = useReadAloud((s) => s.state);
  const navigate = useUi((s) => s.navigate);
  const visible = useNowReadingVisible();
  const { control } = useReadAloud.getState();
  const clock = useReadClock(visible && state.status === 'playing' && !state.waiting);
  if (!visible || !origin) return null;
  const paused = state.status === 'paused';
  const position = state.count ? `Sentence ${Math.min(state.index + 1, state.count)} of ${state.count}` : 'Preparing the voice…';

  return (
    <section
      aria-label="Now reading"
      className="now-reading pointer-events-auto absolute bottom-5 left-1/2 z-30 flex w-[min(620px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-ink py-2.5 pr-3 pl-4 text-canvas shadow-[0_16px_40px_rgb(0_0_0/0.28)]"
    >
      <Waveform paused={paused || state.status === 'preparing'} label={paused ? 'Paused' : 'Reading aloud'} className="text-accent-soft" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-semibold">{origin.title}</span>
        <span className="truncate text-xs opacity-70">
          {position}
          {state.count ? ` · ${formatDuration(clock)}` : ''}
          {origin.truncated ? ' · first 50,000 characters' : ''}
        </span>
      </span>
      <button
        type="button"
        aria-label={paused ? 'Resume' : 'Pause'}
        onClick={() => control(paused ? 'resume' : 'pause')}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
      >
        {paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
      </button>
      <button
        type="button"
        aria-label="Stop reading"
        onClick={() => control('stop')}
        className="grid size-8 shrink-0 place-items-center rounded-lg opacity-80 outline-none hover:bg-canvas/15 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-accent-soft"
      >
        <Square className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => navigate('read-aloud')}
        className="h-8 shrink-0 rounded-lg bg-canvas/15 px-3 text-[13px] outline-none hover:bg-canvas/25 focus-visible:outline-2 focus-visible:outline-accent-soft"
      >
        Open in Read Aloud
      </button>
    </section>
  );
}
