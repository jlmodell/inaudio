import { Copy, Mic, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODEL_CATALOG } from '@shared/domain/models';
import { Button } from '@renderer/components/ui/button';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Kbd, Notice, PageHeader, Separator } from '@renderer/components/ui/layout';
import { api } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatAccelerator, formatDuration } from '@renderer/lib/format';
import { useSettings, useSystemStatus } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi } from '@renderer/stores/ui-store';
import { LevelMeter } from './level-meter';

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
      className="absolute inset-0 rounded-full border-4 border-record"
      style={{ transform: `scale(${1.08 + level * 0.5})`, opacity: 0.35 + level * 0.4, transition: 'transform 80ms linear' }}
    />
  );
}

function LiveLevelMeter({ active }: { active: boolean }) {
  const level = useDictation((s) => (active ? s.level : 0));
  return <LevelMeter level={level} active={active} />;
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
  if (!settings || !status) return null;

  const stt = MODEL_CATALOG[settings.stt.modelId];
  const installed = status.models.find((m) => m.id === stt.id)?.state === 'installed';
  const listening = phase === 'listening';
  const busy = phase === 'transcribing' || phase === 'inserting';
  const keys = formatAccelerator(settings.dictation.shortcut, status.platform);

  const label = listening ? 'Listening' : busy ? 'Transcribing' : phase === 'error' ? 'Needs attention' : 'Ready';

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Dictation"
        description="Speak into any app. Audio is transcribed on this computer and typed where your cursor is."
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

      <section aria-live="polite" className="grid justify-items-center gap-6 py-10">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!installed || busy}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          className={cn(
            'relative grid size-28 place-items-center rounded-full transition-colors disabled:opacity-40',
            listening ? 'bg-record text-white' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {listening && <LevelRing />}
          {listening ? <Square className="size-9 fill-current" /> : <Mic className="size-10" />}
        </button>
        <div className="grid justify-items-center gap-2">
          <div className="flex items-center gap-2 text-base font-medium">
            {label}
            {listening && <span className="font-mono text-sm text-muted tabular-nums">{formatDuration(elapsed)}</span>}
          </div>
          <LiveLevelMeter active={listening} />
          <p className="text-sm text-muted">
            {listening ? 'Press again to insert the text.' : (
              <span className="inline-flex items-center gap-2">Press <Kbd keys={keys} /> from any app{settings.dictation.mode === 'push-to-talk' ? ', or hold it while Inaudio is focused' : ''}.</span>
            )}
          </p>
          {listening && (
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>
              <X /> Discard
            </Button>
          )}
        </div>
      </section>

      {message && <Notice tone={phase === 'error' ? 'danger' : 'neutral'}>{message}</Notice>}

      <Separator />

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-faint uppercase">Last transcript</h2>
          <div className="flex items-center gap-2">
            {last && <Badge>{(last.inferenceMs / 1000).toFixed(2)} s on device</Badge>}
            {lastText && (
              <IconButton label="Copy transcript" size="icon-sm" onClick={() => void api.text.copy(lastText)}>
                <Copy />
              </IconButton>
            )}
          </div>
        </div>
        <p data-selectable className={cn('min-h-16 text-base leading-relaxed whitespace-pre-wrap', !lastText && 'text-faint')}>
          {lastText || 'Your words will appear here.'}
        </p>
      </section>
    </div>
  );
}
