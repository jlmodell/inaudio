import { Copy, History, Loader2, MonitorSpeaker, PictureInPicture2, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { needsDisplayCapture, type LiveSource } from '@shared/domain/capture';
import { MODEL_CATALOG } from '@shared/domain/models';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Kbd, Notice, PageHeader, StatusDot } from '@renderer/components/ui/layout';
import { Segmented } from '@renderer/components/ui/segmented';
import { LevelMeter } from '@renderer/features/dictation/level-meter';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration } from '@renderer/lib/format';
import { useSettings, useSystemStatus, useUpdateSettings } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { ConsentDialog } from './consent-dialog';
import { useLive } from './live-store';
import { SavedSessionsDrawer } from './saved-sessions';

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

/** The meter re-renders on every level change, so only it subscribes to the level. */
function LiveMeter({ active }: { active: boolean }) {
  const level = useLive((s) => (active ? s.level : 0));
  return <LevelMeter level={level} active={active} />;
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

      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted">Source</span>
        <Segmented<LiveSource>
          label="Audio source"
          value={source}
          disabled={active}
          onValueChange={(next) => update.mutate({ live: { source: next } })}
          options={SOURCES}
        />
      </div>

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

      <section className="flex items-center gap-5 border-b border-line pb-6">
        <button
          type="button"
          onClick={onPress}
          disabled={!available || !installed || starting || finishing}
          aria-pressed={capturing}
          aria-label={capturing ? 'Stop live transcript' : 'Start live transcript'}
          className={cn(
            'relative grid size-16 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40',
            capturing ? 'bg-record text-white shadow-[0_0_0_6px_var(--record-soft)]' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {starting || finishing ? (
            <Loader2 aria-hidden className={cn('size-6', settings.appearance.animations === 'full' && 'animate-spin')} />
          ) : capturing ? (
            <Square aria-hidden className="size-6 fill-current" />
          ) : (
            <MonitorSpeaker aria-hidden className="size-7" />
          )}
        </button>
        <div className="grid min-w-0 gap-1.5">
          <div aria-live="polite" className="flex items-center gap-2 text-base font-medium">
            {capturing && <StatusDot tone="record" />}
            <span className="truncate">{label}</span>
            {capturing && <span className="font-mono text-sm text-muted tabular-nums">{formatDuration(elapsed)}</span>}
          </div>
          <LiveMeter active={capturing} />
          <p className="text-sm text-muted">
            {capturing ? (
              <>
                {settings.live.pauseReadAloud && 'Read Aloud is paused while this runs. '}
                {live.parts === 1 ? '1 part transcribed.' : `${live.parts} parts transcribed.`}
                {settings.audio.speechCleanup && ' Background noise is cleaned up.'}
              </>
            ) : keys ? (
              <span className="inline-flex flex-wrap items-center gap-2">Click to start, or press <Kbd keys={keys} /> from any app.</span>
            ) : (
              'Click to start. Stop when you are done and the transcript is saved to History.'
            )}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 self-start">
          <Badge>{stt.name}</Badge>
          {(capturing || starting) && (
            <Button variant="ghost" size="sm" onClick={cancel}>
              <X /> Discard
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-faint uppercase">{active ? 'Transcript' : 'Last transcript'}</h2>
          <div className="flex items-center gap-2">
            {!active && live.savedId && <Badge>Saved to History · {formatDuration(live.durationMs)}</Badge>}
            {hasText && (
              <IconButton label="Copy transcript" size="icon-sm" onClick={() => void api.text.copy(live.text)}>
                <Copy />
              </IconButton>
            )}
          </div>
        </div>
        {!active && live.phase !== 'error' && live.message && <Notice tone="neutral">{live.message}</Notice>}
        <div data-selectable className={cn('min-h-16 text-base leading-relaxed break-words whitespace-pre-wrap', !hasText && 'text-faint')}>
          {hasText ? live.text : capturing && !live.preview ? 'Listening. Text appears as it is heard.' : !active ? 'Your transcript appears here while you record.' : null}
          {active && live.preview && (
            <span className="text-faint">
              {hasText && '\n\n'}
              {live.preview}
            </span>
          )}
        </div>
        {active && pendingSeconds > 0 && (
          <p className="text-sm text-faint">
            Transcribing the last {pendingSeconds === 1 ? 'second' : `${pendingSeconds} seconds`}…
          </p>
        )}
      </section>

      <ConsentDialog open={asking || consent !== null} onCancel={onCancelConsent} onConfirm={onConfirm} />
      <SavedSessionsDrawer open={sessions} onOpenChange={setSessions} />
    </div>
  );
}
