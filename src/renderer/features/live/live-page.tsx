import { Copy, History, Loader2, MonitorSpeaker, PictureInPicture2, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { needsDisplayCapture, type LiveSource } from '@shared/domain/capture';
import { MODEL_CATALOG } from '@shared/domain/models';
import { LevelWave, RecentItem, Stat, WeekBars } from '@renderer/components/ui/activity';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Kbd, Notice, PageHeader } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { ReadAloudButton } from '@renderer/features/read-aloud/read-aloud-controls';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration, groupByDay } from '@renderer/lib/format';
import { useHistory, useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { weekOf } from '@renderer/lib/week';
import { useUi } from '@renderer/stores/ui-store';
import { ConsentDialog } from './consent-dialog';
import { useLive } from './live-store';
import { SavedSessionsDrawer } from './saved-sessions';

const RECENT = 3;

const SOURCES: { value: LiveSource; label: string }[] = [
  { value: 'system', label: 'System audio' },
  { value: 'system+mic', label: 'System + microphone' },
  { value: 'device', label: 'Audio device' },
];

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

/** Only the waveform follows the input level, so the page does not re-render with it. */
function LiveWave({ active, busy }: { active: boolean; busy: boolean }) {
  const level = useLive((s) => (active ? s.level : 0));
  return <LevelWave level={level} active={active} busy={busy} />;
}

/** "27 seconds", "42 minutes" or "1 h 12 minutes": time transcribed, at a glance. */
function formatSpan(ms: number): { value: string; unit: string } {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return { value: String(seconds), unit: seconds === 1 ? 'second' : 'seconds' };
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'minute' : 'minutes' };
  return { value: `${Math.floor(minutes / 60)} h ${minutes % 60}`, unit: 'minutes' };
}

/** Keeps the end of a growing transcript in view, unless the reader has scrolled up. */
function useFollow(text: string, follow: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && follow && pinned.current) el.scrollTop = el.scrollHeight;
  }, [text, follow]);
  const onScroll = () => {
    const el = box.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  return { box, onScroll };
}

export function LivePage() {
  const live = useLive((s) => s.live);
  const consent = useLive((s) => s.consent);
  const requestError = useLive((s) => s.error);
  const { start, stop, cancel, dismissConsent } = useLive.getState();
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const navigate = useUi((s) => s.navigate);
  const [asking, setAsking] = useState(false);
  const [sessions, setSessions] = useState(false);
  const elapsed = useElapsed(live.phase === 'capturing' ? live.startedAt : 0);
  const { data: history } = useHistory({ kind: 'live', limit: 200, offset: 0 });
  const week = useMemo(() => weekOf(history?.items ?? []), [history]);
  const follow = useFollow(live.text + live.preview, live.phase === 'capturing');
  if (!settings || !status) return null;

  const support = status.systemAudio;
  const stt = MODEL_CATALOG[settings.stt.modelId];
  const installed = status.models.find((m) => m.id === stt.id)?.installed ?? false;
  const capturing = live.phase === 'capturing';
  const starting = live.phase === 'starting';
  const finishing = live.phase === 'finishing';
  const active = capturing || starting || finishing;
  const source = active ? live.source : settings.live.source;
  const display = needsDisplayCapture(source);
  // The device source never touches screen capture, so it works where loopback does not.
  const available = !display || support.available;
  // The platform answer, confirmed by the track once a session has run.
  const ownAudioFiltered = live.ownAudioFiltered || support.ownAudioFiltered;
  const keys = settings.live.shortcut ? formatAccelerator(settings.live.shortcut, status.platform) : null;

  const onPress = () => {
    if (capturing) return stop();
    if (active) return;
    if (!settings.live.consentAcknowledged) return setAsking(true);
    void start(source, true);
  };
  const onConfirm = (remember: boolean) => {
    const chosen = consent ?? source;
    setAsking(false);
    if (remember) update.mutate({ live: { consentAcknowledged: true } });
    void start(chosen, true);
  };
  const onCancelConsent = () => {
    setAsking(false);
    dismissConsent();
  };

  const label = capturing
    ? source === 'system+mic'
      ? 'Recording system audio and microphone'
      : source === 'device'
        ? 'Recording the audio device'
        : 'Recording system audio'
    : starting
      ? display && support.mode === 'system-picker'
        ? 'Choose a screen to share its audio…'
        : 'Starting…'
      : finishing
        ? 'Finishing the transcript…'
        : 'Ready';
  const pendingSeconds = Math.ceil(live.pendingMs / 1000);
  const hasText = live.text.length > 0;
  const recent = (history?.items ?? []).slice(0, RECENT);
  const span = week.ms ? formatSpan(week.ms) : undefined;
  const showTranscript = active || hasText || (live.phase !== 'error' && !!live.message);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Live transcript"
        description="Transcribe audio playing on this computer, like a meeting or a video. Audio is processed here and never saved."
        actions={
          <>
            <Button size="sm" onClick={() => setSessions(true)}>
              <History /> Saved sessions
            </Button>
            <Button size="sm" onClick={() => void api.live.openWindow()}>
              <PictureInPicture2 /> Pop out
            </Button>
          </>
        }
      />

      {!available && (
        <Notice
          tone="danger"
          action={
            <Button size="sm" onClick={() => update.mutate({ live: { source: 'device' } })}>
              Use an audio device
            </Button>
          }
        >
          {support.reason}
        </Notice>
      )}
      {available && !installed && (
        <Notice action={<Button size="sm" variant="primary" onClick={() => navigate('models')}>Open Models</Button>}>
          {stt.name} is not downloaded yet.
        </Notice>
      )}
      {display && support.available && !ownAudioFiltered && settings.live.pauseReadAloud && !active && (
        <Notice tone="neutral">
          This system can’t keep Inaudio’s own sounds out of the recording, so Read Aloud pauses while you record.
        </Notice>
      )}
      {live.behind && (
        <Notice tone="warning">
          Transcription is {formatDuration(live.pendingMs)} behind. Nothing is lost; it catches up when the audio gets quieter or after you stop.
        </Notice>
      )}
      {(requestError || (live.phase === 'error' && live.message)) && (
        <Notice tone="danger">{requestError ?? live.message}</Notice>
      )}

      <section className="grid grid-cols-[auto_1fr] items-center gap-7 rounded-[16px] border border-line bg-sunken px-7 py-6">
        <button
          type="button"
          onClick={onPress}
          disabled={!available || !installed || starting || finishing}
          aria-pressed={capturing}
          aria-label={capturing ? 'Stop live transcript' : 'Start live transcript'}
          className={cn(
            'relative grid size-24 place-items-center rounded-full outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40',
            capturing ? 'bg-record text-white shadow-[0_0_0_10px_var(--record-soft)]' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {starting || finishing ? (
            <Loader2 aria-hidden className={cn('size-9', settings.appearance.animations === 'full' && 'animate-spin')} />
          ) : capturing ? (
            <Square aria-hidden className="size-8 fill-current" />
          ) : (
            <MonitorSpeaker aria-hidden className="size-10" />
          )}
        </button>
        <div className="grid min-w-0 gap-3">
          <div aria-live="polite" className="flex items-baseline gap-3">
            <span className="truncate text-xl font-semibold">{label}</span>
            {capturing && <span className="font-mono text-sm text-muted tabular-nums">{formatDuration(elapsed)}</span>}
            <span className="flex-1" />
            {(capturing || starting) && (
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X /> Discard
              </Button>
            )}
          </div>
          <LiveWave active={capturing} busy={finishing} />
          <p className="m-0 text-sm text-muted">
            {capturing ? (
              <>
                {settings.live.pauseReadAloud && 'Read Aloud is paused while this runs. '}
                {live.parts === 1 ? '1 part transcribed.' : `${live.parts} parts transcribed.`}
                {settings.audio.speechCleanup && ' Background noise is cleaned up.'}
              </>
            ) : keys ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                Click to start, or press <Kbd keys={keys} /> from any app.
              </span>
            ) : (
              'Click to start. Stop when you are done and the transcript is saved to History.'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <Segmented<LiveSource>
              label="Audio source"
              value={source}
              disabled={active}
              onValueChange={(next) => update.mutate({ live: { source: next } })}
              options={SOURCES}
            />
            <span className="flex-1" />
            <Badge>{stt.name}</Badge>
          </div>
        </div>
      </section>

      {showTranscript && (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">{active ? 'Transcript' : 'Last transcript'}</h2>
            <div className="flex items-center gap-1.5">
              {!active && live.savedId && <Badge>Saved to History · {formatDuration(live.durationMs)}</Badge>}
              {hasText && !active && <ReadAloudButton id={live.savedId ?? 'live-last'} title="Live transcript" text={live.text} />}
              {hasText && (
                <IconButton label="Copy transcript" size="icon-sm" onClick={() => void api.text.copy(live.text)}>
                  <Copy />
                </IconButton>
              )}
            </div>
          </div>
          {!active && live.phase !== 'error' && live.message && <Notice tone="neutral">{live.message}</Notice>}
          {(active || hasText) && (
            <div
              ref={follow.box}
              onScroll={follow.onScroll}
              data-selectable
              className={cn(
                'app-scroll-area max-h-[28rem] min-h-32 overflow-y-auto rounded-[16px] border border-line bg-surface px-[22px] py-5 text-[17px] leading-[1.75] break-words whitespace-pre-wrap',
                !hasText && 'text-faint',
              )}
            >
              {hasText ? live.text : capturing && !live.preview ? 'Listening. Text appears as it is heard.' : null}
              {active && live.preview && (
                <span className="text-faint">
                  {hasText && '\n\n'}
                  {live.preview}
                </span>
              )}
            </div>
          )}
          {active && pendingSeconds > 0 && (
            <p className="m-0 text-sm text-faint">
              Transcribing the last {pendingSeconds === 1 ? 'second' : `${pendingSeconds} seconds`}…
            </p>
          )}
        </section>
      )}

      {settings.live.saveHistory && (
        <>
          <section aria-label="The last seven days" className="grid grid-cols-[1.3fr_1fr_1fr] gap-3">
            <Stat label="Words this week" value={week.words.toLocaleString()}>
              <WeekBars days={week.days} />
            </Stat>
            <Stat label="Sessions" value={week.takes.toLocaleString()} />
            <Stat label="Time transcribed" value={span?.value ?? '–'} unit={span?.unit} />
          </section>

          <section className="grid gap-1">
            {recent.length ? (
              groupByDay(recent).map((group, index) => (
                <div key={group.day} className="grid gap-1">
                  <div className="flex min-h-8 items-center justify-between">
                    <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">{group.day}</h2>
                    {index === 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSessions(true)}>
                        All sessions
                      </Button>
                    )}
                  </div>
                  <ul className="m-0 grid list-none gap-0.5 p-0">
                    {group.items.map((item) => (
                      <RecentItem key={item.id} item={item} clamp />
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <>
                <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">Recent sessions</h2>
                <p className="m-0 px-3.5 py-3 text-base text-faint">Your transcripts appear here after you stop a session.</p>
              </>
            )}
          </section>
        </>
      )}

      <ConsentDialog open={asking || consent !== null} onCancel={onCancelConsent} onConfirm={onConfirm} />
      <SavedSessionsDrawer open={sessions} onOpenChange={setSessions} />
    </div>
  );
}
