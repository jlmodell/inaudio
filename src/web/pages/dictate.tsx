import { Copy, Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, Notice, PageHeader } from '@renderer/components/ui/layout';
import { Progress } from '@renderer/components/ui/progress';
import { toast } from '@renderer/components/ui/toast';
import { Waveform } from '@renderer/components/ui/waveform';
import { Recorder, TARGET_RATE, trimSilence } from '@renderer/features/dictation/audio/recorder';
import { cn } from '@renderer/lib/cn';
import { formatBytes, formatDuration } from '@renderer/lib/format';
import { api } from '../api';
import { keys, useSettings, useStatus } from '../queries';

const FLUSH_MS = 5_500;

export function DictatePage() {
  const { data: status } = useStatus();
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [level, setLevel] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef(new Recorder());
  const session = useRef<string | null>(null);
  const pending = useRef<Float32Array[]>([]);
  const pendingLength = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => void recorder.current.dispose(), []);

  const elapsed = useElapsed(startedAt);
  const ready = !!status?.stt.loaded;
  const downloading = status?.stt.state === 'downloading' || status?.stt.state === 'verifying';

  const flush = async () => {
    const id = session.current;
    if (!id || !pendingLength.current) return;
    const samples = join(pending.current, pendingLength.current);
    pending.current = [];
    pendingLength.current = 0;
    const result = await api.liveChunk(id, samples, TARGET_RATE);
    setText(result.text);
  };

  const start = async () => {
    if (phase !== 'idle' || !ready) return;
    setMessage(null);
    try {
      const live = await api.startLive();
      session.current = live.id;
      pending.current = [];
      pendingLength.current = 0;
      await recorder.current.start({
        deviceId: 'default',
        gain: 1,
        onLevel: setLevel,
        onChunk: (chunk) => {
          pending.current.push(chunk);
          pendingLength.current += chunk.length;
        },
      });
      setPhase('listening');
      setStartedAt(Date.now());
      setText('');
      flushTimer.current = setInterval(() => void flush().catch(() => undefined), FLUSH_MS);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setMessage(
        name === 'NotAllowedError'
          ? 'The browser blocked the microphone. Allow it for this site, and open Inaudio over https or on this computer.'
          : error instanceof Error
            ? error.message
            : 'Could not start the microphone',
      );
    }
  };

  const stop = async () => {
    if (phase !== 'listening') return;
    if (flushTimer.current) clearInterval(flushTimer.current);
    setPhase('transcribing');
    setLevel(0);
    const recorded = trimSilence(await recorder.current.stop());
    try {
      if (session.current && pendingLength.current) await flush();
      if (session.current) {
        const live = await api.stopLive(session.current);
        session.current = null;
        let finalText = live.text;
        if (!finalText && recorded.length >= TARGET_RATE / 4) {
          finalText = (await api.transcribe(recorded, TARGET_RATE)).text;
        }
        setText(finalText);
        if (!finalText) setMessage('No speech detected.');
        void client.invalidateQueries({ queryKey: keys.history });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed');
    } finally {
      setPhase('idle');
      setStartedAt(null);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dictate"
        description="Speak, and the words appear here. They stay on this computer."
        actions={status && <Badge>{status.stt.name}</Badge>}
      />

      {downloading && status && (
        <Notice tone="neutral">
          <div className="grid w-full gap-2">
            <span>
              Downloading {status.stt.name} ({formatBytes(status.stt.bytesDone)} of{' '}
              {formatBytes(status.stt.bytesTotal)}). This happens once.
            </span>
            <Progress
              value={status.stt.bytesTotal ? (status.stt.bytesDone / status.stt.bytesTotal) * 100 : 0}
              label="Model download"
            />
          </div>
        </Notice>
      )}
      {status && !ready && !downloading && (status.stt.error || status.message) && (
        <Notice tone="danger">{status.stt.error || status.message}</Notice>
      )}
      {status && !ready && !downloading && !status.stt.error && !status.message && (
        <Notice>The speech model is still loading.</Notice>
      )}

      <section className="grid grid-cols-[auto_1fr] items-center gap-7 rounded-[16px] border border-line bg-sunken px-7 py-6">
        <button
          type="button"
          onClick={() => void (phase === 'listening' ? stop() : start())}
          disabled={!ready || phase === 'transcribing'}
          aria-pressed={phase === 'listening'}
          aria-label={phase === 'listening' ? 'Stop dictation' : 'Start dictation'}
          className={cn(
            'relative grid size-24 place-items-center rounded-full outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40',
            phase === 'listening' ? 'bg-record text-white' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {phase === 'listening' ? (
            <Square className="size-8 fill-current" />
          ) : phase === 'transcribing' ? (
            <Loader2 className="size-9 animate-spin" />
          ) : (
            <Mic className="size-9" />
          )}
        </button>
        <div className="grid min-w-0 gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-semibold">
              {phase === 'listening' ? 'Listening' : phase === 'transcribing' ? 'Transcribing' : 'Ready'}
            </span>
            {phase === 'listening' && (
              <span className="font-mono text-sm text-muted tabular-nums">{formatDuration(elapsed)}</span>
            )}
          </div>
          <Waveform level={phase === 'listening' ? level : 0} paused={phase !== 'listening'} label={phase === 'listening' ? 'Listening' : 'Idle'} />
          <p className="m-0 text-sm text-muted">
            {phase === 'listening'
              ? 'Press the button again when you are done.'
              : phase === 'transcribing'
                ? 'Turning your words into text…'
                : 'Press the microphone and speak. Use a headset if you can.'}
          </p>
        </div>
      </section>

      {message && <Notice tone="neutral">{message}</Notice>}

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">Transcript</h2>
          {text && (
            <IconButton
              label="Copy transcript"
              size="icon-sm"
              onClick={() => void navigator.clipboard.writeText(text).then(() => toast('Copied'))}
            >
              <Copy />
            </IconButton>
          )}
        </div>
        <p
          data-selectable
          className={cn('m-0 min-h-24 text-base leading-relaxed whitespace-pre-wrap', !text && 'text-faint')}
        >
          {text || 'Your words will appear here as you speak.'}
        </p>
        {settings && !settings.saveHistory && (
          <p className="m-0 text-xs text-faint">Save history is off, so this take is not kept.</p>
        )}
      </section>
    </div>
  );
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? now - startedAt : 0;
}

function join(chunks: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
