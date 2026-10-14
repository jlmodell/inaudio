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
import { Kbd, Notice, PageHeader, Separator } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { toast } from '@renderer/components/ui/toast';
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

/** The session text with each segment clickable, and the one being read marked. */
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
          'inline cursor-default rounded-[4px] text-left transition-colors hover:bg-sunken',
          marked && 'bg-accent-soft text-ink hover:bg-accent-soft',
        )}
      >
        {segment.text}
      </button>,
    );
    cursor = segment.end;
  });

  return (
    <ScrollArea.Root className="h-80 overflow-hidden rounded-lg bg-sunken">
      <ScrollArea.Viewport className="size-full">
        <div data-selectable className="p-4 text-base leading-relaxed whitespace-pre-wrap text-ink">
          {parts}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="flex w-2.5 touch-none p-0.5 select-none">
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-line-strong hover:bg-muted" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
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
    setDraft(session.text);
    setEditing(false);
  }, [session]);

  const active = readAloudActive(state.status) && state.status !== 'capturing';
  const elapsed = useElapsed(state.status === 'playing' && !state.waiting);
  if (!settings || !status) return null;

  const tts = MODEL_CATALOG[settings.tts.modelId];
  const installed = status.models.find((m) => m.id === tts.id)?.state === 'installed';
  const hasSession = !!session && state.sessionId === session.sessionId;
  const paused = state.status === 'paused';
  const position = dragIndex ?? state.index;

  const play = () => {
    if (paused) control('resume');
    else if (editing || !hasSession) void readText(draft);
    else control('replay');
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
    <div className="grid gap-6">
      <PageHeader
        title="Read Aloud"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            Select text in any app and press <Kbd keys={formatAccelerator(settings.tts.shortcut, status.platform)} />, or
            type or paste it here.
          </span>
        }
        actions={
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
                <DropdownMenu.Item className={menuItemClass} disabled={!installed} onSelect={() => void readClipboard()}>
                  <ClipboardType /> Read clipboard
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItemClass} disabled={editing || !hasSession} onSelect={edit}>
                  <PencilLine /> Edit text
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItemClass} disabled={!(editing ? draft : session?.text)} onSelect={copy}>
                  <Copy /> Copy text
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />
                <DropdownMenu.Item
                  className={menuItemClass}
                  disabled={!hasSession || cached < state.count}
                  onSelect={download}
                >
                  <Download /> Save WAV
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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

      <div className="grid gap-2">
        <div className="flex items-center justify-between text-xs text-faint">
          <span>
            {editing
              ? hasSession
                ? 'Replay reads the edited text, not the original selection.'
                : 'Text to read'
              : `${SOURCE_LABEL[session?.source ?? 'manual']} · ${state.count} ${state.count === 1 ? 'sentence' : 'sentences'}`}
          </span>
          {editing && (
            <span className="tabular-nums">
              {draft.length.toLocaleString()} / {MAX_READ_ALOUD_CHARS.toLocaleString()}
            </span>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_READ_ALOUD_CHARS}
            placeholder="Text to read aloud"
            aria-label="Text to read aloud"
            className="h-80 w-full resize-y rounded-lg bg-sunken p-4 text-base leading-relaxed outline-none placeholder:text-faint focus:shadow-[0_0_0_2px_var(--accent)]"
          />
        ) : (
          <Preview follow={settings.tts.followAlong} />
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          {active && !paused ? (
            <Button variant="primary" onClick={() => control('pause')}>
              <Pause /> Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!installed || state.status === 'capturing' || (editing || !hasSession ? !draft.trim() : false)}
              onClick={play}
            >
              <Play /> {paused ? 'Resume' : editing || !hasSession ? 'Read aloud' : 'Play again'}
            </Button>
          )}
          <IconButton label="Stop" disabled={!active} onClick={() => control('stop')}>
            <Square />
          </IconButton>
          <IconButton label="Replay from the start" disabled={!hasSession || editing} onClick={() => control('replay')}>
            <RotateCcw />
          </IconButton>
          <Separator className="mx-1 h-5 w-px" />
          <IconButton label="Previous sentence" disabled={!hasSession || editing || state.index === 0} onClick={() => seek(state.index - 1)}>
            <SkipBack />
          </IconButton>
          <IconButton
            label="Next sentence"
            disabled={!hasSession || editing || state.index + 1 >= state.count}
            onClick={() => seek(state.index + 1)}
          >
            <SkipForward />
          </IconButton>
          <Slider
            aria-label="Sentence"
            className="mx-2 flex-1"
            min={0}
            max={Math.max(1, state.count - 1)}
            step={1}
            disabled={!hasSession || editing || state.count < 2}
            value={[hasSession ? position : 0]}
            onValueChange={([index]) => index !== undefined && setDragIndex(index)}
            onValueCommit={([index]) => {
              setDragIndex(null);
              if (index !== undefined) seek(index);
            }}
          />
          <span className="w-24 text-right font-mono text-xs text-muted tabular-nums">
            {hasSession && !editing ? `${position + 1} / ${state.count}` : '–'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-faint">
          <span role="status" aria-live="polite">
            {editing ? 'Ready' : statusLabel(state)}
          </span>
          <span className="font-mono tabular-nums">{hasSession && !editing ? formatDuration(elapsed) : ''}</span>
        </div>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
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
    </div>
  );
}
