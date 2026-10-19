import { Copy, Loader2, Mic, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { transcriptTitle, wordCount, type Transcript } from '@shared/domain/history';
import { MODEL_CATALOG } from '@shared/domain/models';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Kbd, Notice, PageHeader } from '@renderer/components/ui/layout';
import { useMediaDevices } from '@renderer/features/audio/use-devices';
import { ReadAloudButton, useReadingState } from '@renderer/features/read-aloud/read-aloud-controls';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration, formatTime, groupByDay } from '@renderer/lib/format';
import { useHistory, useSettings, useSystemStatus } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi } from '@renderer/stores/ui-store';

const WAVE_BARS = 64;
const RECENT = 4;
const DAY_MS = 86_400_000;

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

/** The input level changes ~20 times a second, so only these two pieces subscribe to it. */
function LevelRing() {
  const level = useDictation((s) => s.level);
  return (
    <span
      aria-hidden
      className="absolute inset-0 rounded-full bg-record/20"
      style={{ transform: `scale(${1.1 + level * 0.6})`, transition: 'transform 80ms linear' }}
    />
  );
}

/**
 * The last few seconds of input as a wide, scrolling waveform. Still and faint while idle,
 * frozen and dimmed while the take is transcribed.
 */
function LevelWave({ active, busy }: { active: boolean; busy: boolean }) {
  const level = useDictation((s) => (active ? s.level : 0));
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

interface Week {
  words: number;
  takes: number;
  /** Words a minute across the week's takes, 0 when there is nothing to measure. */
  pace: number;
  /** Words per day, oldest first, today last. */
  days: number[];
}

/** The last seven days of saved dictations, counted on this computer. */
function weekOf(items: Transcript[], now = Date.now()): Week {
  const today = new Date(new Date(now).toDateString()).getTime();
  const start = today - 6 * DAY_MS;
  const days = Array<number>(7).fill(0);
  let words = 0;
  let takes = 0;
  let ms = 0;
  for (const item of items) {
    if (item.createdAt < start) continue;
    const count = wordCount(item.text);
    const day = Math.min(6, Math.floor((item.createdAt - start) / DAY_MS));
    days[day] = (days[day] ?? 0) + count;
    words += count;
    takes += 1;
    ms += item.durationMs;
  }
  return { words, takes, pace: ms > 5_000 ? Math.round(words / (ms / 60_000)) : 0, days };
}

function Stat({ label, value, unit, children }: { label: string; value: string; unit?: string; children?: ReactNode }) {
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

function WeekBars({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  return (
    <span aria-hidden className="flex h-[30px] items-end gap-1">
      {days.map((value, index) => (
        <i
          key={index}
          className={cn('block w-2 rounded-[3px]', index === days.length - 1 ? 'bg-accent' : 'bg-line-strong')}
          style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

/** One recent take: its words, when, and Read aloud and Copy within reach. */
function Take({ item, fresh, inferenceMs }: { item: Transcript; fresh: boolean; inferenceMs?: number }) {
  const reading = useReadingState(item.id);
  const words = wordCount(item.text);
  return (
    <li
      className={cn(
        'group flex items-start gap-3 rounded-[10px] px-3.5 py-3 transition-colors hover:bg-sunken',
        (fresh || reading !== 'idle') && 'bg-accent-soft hover:bg-accent-soft',
      )}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <p data-selectable className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {item.text}
        </p>
        <span className="text-xs text-faint tabular-nums">
          {fresh ? 'Just now' : formatTime(item.createdAt)} · {formatDuration(item.durationMs)} · {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
          {fresh && inferenceMs !== undefined ? ` · ${(inferenceMs / 1000).toFixed(2)} s on device` : ''}
        </span>
      </div>
      <span className={cn('flex shrink-0 items-center gap-1', !fresh && reading === 'idle' && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')}>
        <ReadAloudButton id={item.id} title={transcriptTitle(item)} text={item.text} />
        <IconButton label="Copy transcript" size="icon-sm" onClick={() => void api.text.copy(item.text)}>
          <Copy />
        </IconButton>
      </span>
    </li>
  );
}

export function DictationPage() {
  const phase = useDictation((s) => s.phase);
  const startedAt = useDictation((s) => s.startedAt);
  const lastText = useDictation((s) => s.lastText);
  const last = useDictation((s) => s.last);
  const message = useDictation((s) => s.message);
  const toggle = useDictation((s) => s.toggle);
  const cancel = useDictation((s) => s.cancel);
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const navigate = useUi((s) => s.navigate);
  const elapsed = useElapsed(startedAt);
  const microphones = useMediaDevices('audioinput');
  const saving = settings?.dictation.saveHistory !== false;
  const { data: history } = useHistory({ kind: 'dictation', limit: 500, offset: 0 });
  const week = useMemo(() => weekOf(history?.items ?? []), [history]);
  if (!settings || !status) return null;

  const stt = MODEL_CATALOG[settings.stt.modelId];
  const installed = status.models.find((m) => m.id === stt.id)?.state === 'installed';
  const listening = phase === 'listening';
  const busy = phase === 'transcribing' || phase === 'inserting';
  const keys = formatAccelerator(settings.dictation.shortcut, status.platform);
  const microphone = microphones.find((device) => device.deviceId === settings.audio.inputDeviceId)?.label.replace(/^Default - /, '');
  const recent = (history?.items ?? []).slice(0, RECENT);
  const newest = recent[0];
  const fresh = (item: Transcript) => item === newest && !!last && Date.now() - item.createdAt < 120_000;

  const label = listening ? 'Listening' : busy ? 'Transcribing' : phase === 'error' ? 'Needs attention' : 'Ready';

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dictation"
        description="Speak into any app. Audio is transcribed on this computer and typed where your cursor is."
        actions={
          <span className="flex flex-wrap justify-end gap-2">
            <Badge>{settings.dictation.mode === 'push-to-talk' ? 'Push to talk' : 'Toggle'}</Badge>
            {microphone && <Badge className="max-w-60 truncate">{microphone}</Badge>}
          </span>
        }
      />

      {!installed && (
        <Notice action={<Button size="sm" variant="primary" onClick={() => navigate('models')}>Open Models</Button>}>
          {stt.name} is not downloaded yet.
        </Notice>
      )}
      {!status.insertion.available && (
        <Notice tone="neutral">
          Typing into other apps is unavailable: {status.insertion.reason} Transcripts will be copied to the clipboard.
        </Notice>
      )}

      <section aria-live="polite" className="grid grid-cols-[auto_1fr] items-center gap-7 rounded-[16px] border border-line bg-sunken px-7 py-6">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!installed || busy}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          className={cn(
            'relative grid size-24 place-items-center rounded-full outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40',
            listening ? 'bg-record text-white' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {listening && <LevelRing />}
          <span className="relative">
            {listening ? <Square className="size-8 fill-current" /> : busy ? <Loader2 className="size-9 animate-spin" /> : <Mic className="size-9" />}
          </span>
        </button>
        <div className="grid min-w-0 gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-semibold">{label}</span>
            {listening && <span className="font-mono text-sm text-muted tabular-nums">{formatDuration(elapsed)}</span>}
            <span className="flex-1" />
            {listening && (
              <Button variant="ghost" size="sm" onClick={() => void cancel()}>
                <X /> Discard
              </Button>
            )}
          </div>
          <LevelWave active={listening} busy={busy} />
          <p className="m-0 text-sm text-muted">
            {listening ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                Press <Kbd keys={keys} /> again to type it where your cursor is.
              </span>
            ) : busy ? (
              'Turning your words into text on this computer…'
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2">
                Press <Kbd keys={keys} /> from any app{settings.dictation.mode === 'push-to-talk' ? ', or hold it while Inaudio is focused' : ''}.
              </span>
            )}
          </p>
        </div>
      </section>

      {message && <Notice tone={phase === 'error' ? 'danger' : 'neutral'}>{message}</Notice>}

      {saving ? (
        <>
          <section aria-label="The last seven days" className="grid grid-cols-[1.3fr_1fr_1fr] gap-3">
            <Stat label="Words this week" value={week.words.toLocaleString()}>
              <WeekBars days={week.days} />
            </Stat>
            <Stat label="Dictations" value={week.takes.toLocaleString()} />
            <Stat label="Speaking pace" value={week.pace ? week.pace.toLocaleString() : '–'} unit={week.pace ? 'words a minute' : undefined} />
          </section>

          <section className="grid gap-1">
            {recent.length ? (
              groupByDay(recent).map((group, index) => (
                <div key={group.day} className="grid gap-1">
                  <div className="flex min-h-8 items-center justify-between">
                    <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">{group.day}</h2>
                    {index === 0 && (
                      <Button variant="ghost" size="sm" onClick={() => navigate('history')}>
                        All dictations
                      </Button>
                    )}
                  </div>
                  <ul className="m-0 grid list-none gap-0.5 p-0">
                    {group.items.map((item) => (
                      <Take key={item.id} item={item} fresh={fresh(item)} inferenceMs={fresh(item) ? last?.inferenceMs : undefined} />
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <>
                <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">Recent</h2>
                <p className="m-0 px-3.5 py-3 text-base text-faint">Your words will appear here.</p>
              </>
            )}
          </section>
        </>
      ) : (
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">Last transcript</h2>
            <div className="flex items-center gap-2">
              {last && <Badge>{(last.inferenceMs / 1000).toFixed(2)} s on device</Badge>}
              {lastText && (
                <>
                  <ReadAloudButton id="dictation-last" title="Last transcript" text={lastText} />
                  <IconButton label="Copy transcript" size="icon-sm" onClick={() => void api.text.copy(lastText)}>
                    <Copy />
                  </IconButton>
                </>
              )}
            </div>
          </div>
          <p data-selectable className={cn('m-0 min-h-16 text-base leading-relaxed whitespace-pre-wrap', !lastText && 'text-faint')}>
            {lastText || 'Your words will appear here.'}
          </p>
          <p className="m-0 text-xs text-faint">Save history is off, so only the last take is kept, and only until Inaudio closes.</p>
        </section>
      )}
    </div>
  );
}
