import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import {
  ClipboardType,
  Copy,
  Download,
  MoreHorizontal,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KOKORO_VOICES, MODEL_CATALOG, type VoiceId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS, readAloudActive, type ReadAloudSource, type ReadAloudState } from '@shared/domain/read-aloud';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Kbd, Notice, PageHeader } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { toast } from '@renderer/components/ui/toast';
import { Waveform } from '@renderer/components/ui/waveform';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration } from '@renderer/lib/format';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { useReadAloud } from './read-aloud-store';

const SOURCE_LABEL: Record<ReadAloudSource, string> = {
  selection: 'From your selection',
  clipboard: 'From the clipboard',
  manual: 'Typed here',
};

/** Up to this many sentences get their own segment in the progress bar; longer texts get a slider. */
const MAX_SEGMENTS = 60;

const menuItemClass =
  'flex h-8 cursor-default items-center gap-2 rounded-[6px] px-2.5 text-sm text-ink outline-none select-none data-disabled:text-faint data-highlighted:bg-sunken [&_svg]:size-4 [&_svg]:text-muted';

function statusLabel(state: ReadAloudState): string {
  switch (state.status) {
    case 'capturing':
      return 'Reading the selection…';
    case 'preparing':
      return 'Preparing the voice…';
    case 'playing':
      return state.waiting ? 'Waiting for the next sentence…' : 'Reading';
    case 'paused':
      return 'Paused';
    case 'stopped':
      return state.index + 1 >= state.count ? 'Finished' : 'Stopped';
    case 'error':
      return 'Stopped';
    default:
      return 'Ready';
  }
}

/** Ticks while audio plays, so the clock follows without the store re-rendering every frame. */
function useElapsed(playing: boolean): number {
  const elapsed = useReadAloud((s) => s.elapsed);
  const [value, setValue] = useState(() => elapsed());
  useEffect(() => {
    setValue(elapsed());
    if (!playing) return;
    const id = setInterval(() => setValue(elapsed()), 250);
    return () => clearInterval(id);
  }, [elapsed, playing]);
  return value;
}

/**
 * The session text with each sentence clickable. While it is read, the sentence being read is
 * marked, the ones already read stay in full ink and the ones still to come are quieter.
 */
function Preview({ follow }: { follow: boolean }) {
  const session = useReadAloud((s) => s.session);
  const state = useReadAloud((s) => s.state);
  const seek = useReadAloud((s) => s.seek);
  const current = useRef<HTMLButtonElement>(null);
  const active = readAloudActive(state.status) && state.sessionId === session?.sessionId;

  useEffect(() => {
    if (follow && active) current.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [follow, active, state.index]);

  if (!session) return null;
  const parts: ReactNode[] = [];
  let cursor = 0;
  session.segments.forEach((segment, i) => {
    if (segment.start > cursor) parts.push(session.text.slice(cursor, segment.start));
    const marked = follow && active && i === state.index;
    parts.push(
      <button
        key={segment.start}
        ref={marked ? current : undefined}
        type="button"
        tabIndex={-1}
        onClick={() => (state.sessionId ? seek(i) : undefined)}
        className={cn(
          'inline cursor-default rounded-[4px] text-left transition-colors hover:bg-surface',
          follow && active && i > state.index && 'text-muted',
          marked && 'bg-accent-soft text-ink shadow-[0_0_0_3px_var(--accent-soft)] hover:bg-accent-soft',
        )}
      >
        {segment.text}
      </button>,
    );
    cursor = segment.end;
  });

  return (
    <ScrollArea.Root className="h-80 overflow-hidden">
      <ScrollArea.Viewport className="size-full">
        <div data-selectable className="px-[22px] py-5 text-[17px] leading-[1.75] whitespace-pre-wrap text-ink">
          {parts}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none p-0.5 select-none">
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-line-strong hover:bg-muted" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

/** One segment per sentence: read, being read (filling as it plays) and still to come. */
function Segments({ count, index, enabled, onSeek }: { count: number; index: number; enabled: boolean; onSeek(index: number): void }) {
  return (
    <div className="flex h-3 items-center gap-1" role="group" aria-label={`Sentence ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          disabled={!enabled}
          aria-label={`Sentence ${i + 1}`}
          onClick={() => onSeek(i)}
          className={cn(
            'h-1.5 min-w-1 flex-1 rounded-full transition-colors enabled:hover:h-2.5 disabled:cursor-default',
            i < index ? 'bg-accent' : i === index && enabled ? 'bg-accent/60' : 'bg-line-strong',
          )}
        />
      ))}
    </div>
  );
}

export function ReadAloudPage() {
  const session = useReadAloud((s) => s.session);
  const state = useReadAloud((s) => s.state);
  const cached = useReadAloud((s) => s.cached);
  const startError = useReadAloud((s) => s.error);
  const { readText, readClipboard, control, seek, exportWav } = useReadAloud.getState();
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const navigate = useUi((s) => s.navigate);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const shownSession = useRef<string | null>(null);

  useEffect(() => {
    if (!session || shownSession.current === session.sessionId) return;
    shownSession.current = session.sessionId;
    // A draft being written wins: the new session plays on without taking over the editor.
    if (editing && draft.trim()) return;
    setDraft(session.text);
    setEditing(false);
  }, [session, editing, draft]);

  const active = readAloudActive(state.status) && state.status !== 'capturing';
  const elapsed = useElapsed(state.status === 'playing' && !state.waiting);
  if (!settings || !status) return null;

  const tts = MODEL_CATALOG[settings.tts.modelId];
  const installed = status.models.find((m) => m.id === tts.id)?.state === 'installed';
  const hasSession = !!session && state.sessionId === session.sessionId;
  const paused = state.status === 'paused';
  const position = dragIndex ?? state.index;
  const navigable = hasSession && !editing;
  const speaking = state.status === 'playing' && !state.waiting;

  const play = () => {
    if (paused) control('resume');
    else if (editing || !hasSession) {
      setEditing(false);
      void readText(draft);
    } else control('replay');
  };
  const edit = () => {
    if (active) control('stop');
    setEditing(true);
  };
  const download = () => {
    const url = exportWav();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inaudio-speech.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = () => {
    const text = editing ? draft : session?.text;
    if (text) void api.text.copy(text).then(() => toast('Copied to the clipboard'));
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Read Aloud"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            Select text in any app and press <Kbd keys={formatAccelerator(settings.tts.shortcut, status.platform)} />, or
            type or paste it here.
          </span>
        }
        actions={
          <>
            <Button size="sm" disabled={!installed} onClick={() => void readClipboard()}>
              <ClipboardType /> Read clipboard
            </Button>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <IconButton label="More actions">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-48 rounded-[12px] border border-line bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
                >
                  <DropdownMenu.Item className={menuItemClass} disabled={editing || !hasSession} onSelect={edit}>
                    <PencilLine /> Edit text
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={menuItemClass} disabled={!(editing ? draft : session?.text)} onSelect={copy}>
                    <Copy /> Copy text
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />
                  <DropdownMenu.Item className={menuItemClass} disabled={!hasSession || cached < state.count} onSelect={download}>
                    <Download /> Save WAV
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        }
      />

      {!installed && (
        <Notice action={<Button size="sm" variant="primary" onClick={() => navigate('models')}>Open Models</Button>}>
          {tts.name} is not downloaded yet.
        </Notice>
      )}
      {(startError || state.status === 'error') && <Notice tone="danger">{startError ?? state.message}</Notice>}
      {hasSession && session.truncated && !editing && (
        <Notice tone="neutral">Only the first {MAX_READ_ALOUD_CHARS.toLocaleString()} characters are read.</Notice>
      )}

      <section aria-label="Text" className="overflow-hidden rounded-[16px] border border-line bg-sunken focus-within:shadow-[0_0_0_2px_var(--accent)]">
        <div className="flex h-11 items-center gap-3 border-b border-line px-[18px] text-xs text-faint">
          <span className="truncate">
            {editing
              ? hasSession
                ? 'Replay reads the edited text, not the original selection.'
                : 'Text to read'
              : `${SOURCE_LABEL[session?.source ?? 'manual']} · ${state.count} ${state.count === 1 ? 'sentence' : 'sentences'}`}
          </span>
          <span className="flex-1" />
          {editing ? (
            <span className="tabular-nums">
              {draft.length.toLocaleString()} / {MAX_READ_ALOUD_CHARS.toLocaleString()}
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!hasSession} onClick={edit}>
              <PencilLine /> Edit text
            </Button>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_READ_ALOUD_CHARS}
            placeholder="Type or paste the text to read aloud"
            aria-label="Text to read aloud"
            className="block h-80 w-full resize-y bg-transparent px-[22px] py-5 text-[17px] leading-[1.75] outline-none placeholder:text-faint"
          />
        ) : (
          <Preview follow={settings.tts.followAlong} />
        )}
      </section>

      <section aria-label="Player" className="grid gap-4 rounded-[16px] border border-line bg-surface px-5 py-[18px] shadow-[0_8px_24px_rgb(0_0_0/0.06)]">
        <div className="flex items-center gap-2">
          <IconButton label="Previous sentence" disabled={!navigable || state.index === 0} onClick={() => seek(state.index - 1)}>
            <SkipBack />
          </IconButton>
          {active && !paused ? (
            <button
              type="button"
              aria-label="Pause"
              onClick={() => control('pause')}
              className="grid size-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent outline-none hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Pause className="size-5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={paused ? 'Resume' : editing || !hasSession ? 'Read aloud' : 'Play again'}
              disabled={!installed || state.status === 'capturing' || (editing || !hasSession ? !draft.trim() : false)}
              onClick={play}
              className="grid size-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent outline-none hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
            >
              <Play className="ml-0.5 size-5 fill-current" />
            </button>
          )}
          <IconButton label="Next sentence" disabled={!navigable || state.index + 1 >= state.count} onClick={() => seek(state.index + 1)}>
            <SkipForward />
          </IconButton>
          <IconButton label="Stop" disabled={!active} onClick={() => control('stop')}>
            <Square />
          </IconButton>
          <IconButton label="Replay from the start" disabled={!navigable} onClick={() => control('replay')}>
            <RotateCcw />
          </IconButton>

          <div className="grid min-w-0 flex-1 gap-2 pl-3">
            {navigable && state.count > 1 && state.count <= MAX_SEGMENTS ? (
              <Segments count={state.count} index={position} enabled={navigable} onSeek={seek} />
            ) : (
              <Slider
                aria-label="Sentence"
                min={0}
                max={Math.max(1, state.count - 1)}
                step={1}
                disabled={!navigable || state.count < 2}
                value={[hasSession ? position : 0]}
                onValueChange={([index]) => index !== undefined && setDragIndex(index)}
                onValueCommit={([index]) => {
                  setDragIndex(null);
                  if (index !== undefined) seek(index);
                }}
              />
            )}
            <div className="flex items-center gap-2.5 text-xs text-muted">
              {active && <Waveform paused={!speaking} className="text-accent" />}
              <span role="status" aria-live="polite">
                {editing ? 'Ready' : statusLabel(state)}
                {navigable && state.count ? ` · sentence ${position + 1} of ${state.count}` : ''}
              </span>
              <span className="flex-1" />
              <span className="font-mono tabular-nums">{navigable ? formatDuration(elapsed) : ''}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-4">
          <Select<VoiceId>
            label="Voice"
            value={settings.tts.voiceId as VoiceId}
            onValueChange={(voiceId) => update.mutate({ tts: { voiceId } })}
            options={KOKORO_VOICES.map((v) => ({ value: v.id, label: v.name, hint: `${v.accent} ${v.gender}` }))}
          />
          <label className="flex w-60 items-center gap-3 text-sm text-muted">
            Speed
            <Slider
              aria-label="Speech speed"
              min={0.5}
              max={2}
              step={0.05}
              value={[speed ?? settings.tts.speed]}
              onValueChange={([next]) => next !== undefined && setSpeed(next)}
              onValueCommit={([next]) => {
                setSpeed(null);
                if (next !== undefined) update.mutate({ tts: { speed: next } });
              }}
            />
            <span className="w-12 font-mono tabular-nums text-ink">{(speed ?? settings.tts.speed).toFixed(2)}×</span>
          </label>
          <label className="flex w-52 items-center gap-3 text-sm text-muted">
            Volume
            <Slider
              aria-label="Speech volume"
              min={0}
              max={1}
              step={0.05}
              value={[settings.tts.volume]}
              onValueChange={([volume]) => volume !== undefined && update.mutate({ tts: { volume } })}
            />
            <span className="w-10 font-mono tabular-nums text-ink">{Math.round(settings.tts.volume * 100)}%</span>
          </label>
        </div>
      </section>
    </div>
  );
}
