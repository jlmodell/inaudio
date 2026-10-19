import { Copy, Loader2, Mic, Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Transcript } from '@shared/domain/history';
import { MODEL_CATALOG } from '@shared/domain/models';
import { LevelWave, RecentItem, Stat, WeekBars } from '@renderer/components/ui/activity';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Kbd, Notice, PageHeader } from '@renderer/components/ui/layout';
import { useMediaDevices } from '@renderer/features/audio/use-devices';
import { ReadAloudButton } from '@renderer/features/read-aloud/read-aloud-controls';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration, groupByDay } from '@renderer/lib/format';
import { useHistory, useSettings, useSystemStatus } from '@renderer/lib/queries';
import { weekOf } from '@renderer/lib/week';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi } from '@renderer/stores/ui-store';

const RECENT = 4;

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

/** Only this piece follows the input level, so the page does not re-render with it. */
function DictationWave({ active, busy }: { active: boolean; busy: boolean }) {
  const level = useDictation((s) => (active ? s.level : 0));
  return <LevelWave level={level} active={active} busy={busy} />;
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
          <DictationWave active={listening} busy={busy} />
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
                      <RecentItem
                        key={item.id}
                        item={item}
                        fresh={fresh(item)}
                        detail={fresh(item) && last ? `${(last.inferenceMs / 1000).toFixed(2)} s on device` : undefined}
                      />
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
