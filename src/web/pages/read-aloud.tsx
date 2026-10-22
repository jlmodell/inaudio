import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { KOKORO_VOICES, type VoiceId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { READ_SPEED_PRESETS, readAloudProgressPercent } from '@shared/web/read-aloud-engine';
import { voiceErrorText } from '@shared/web/voice-error';
import { Button } from '@renderer/components/ui/button';
import { Notice, PageHeader } from '@renderer/components/ui/layout';
import { Progress } from '@renderer/components/ui/progress';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { Switch } from '@renderer/components/ui/switch';
import { useSettings, useStatus, useUpdateSettings } from '../queries';
import { IsolationNotice, ReadAloudDiagLine } from '../tts/diag-line';
import { VoiceErrorBox } from '../tts/error-box';
import { ReadAloudPlayer, type ReadAloudProgress } from '../tts/player';
import { readDeviceFallback, subscribeDeviceFallback, writeDeviceFallback } from '../tts/device-fallback';
import { resetKokoroHost } from '../tts/kokoro-host';

export function ReadAloudPage() {
  const { data: settings } = useSettings();
  const { data: status } = useStatus();
  const update = useUpdateSettings();
  const engine = settings?.readAloudEngine ?? 'browser';
  const serverReady = !!status?.tts.loaded;
  const needsServer = engine === 'server';
  const [text, setText] = useState('');
  const [word, setWord] = useState('');
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(readDeviceFallback);
  const [progress, setProgress] = useState<ReadAloudProgress | null>(null);
  const player = useRef<ReadAloudPlayer | null>(null);

  useEffect(
    () => () => {
      player.current?.stop();
    },
    [],
  );

  useEffect(() => subscribeDeviceFallback(setUsingFallback), []);

  if (!settings) return null;

  const play = async (retryOnDevice = false) => {
    const clipped = text.trim().slice(0, MAX_READ_ALOUD_CHARS);
    if (!clipped) return;
    setError(null);
    if (retryOnDevice) setFallback(null);
    setProgress(null);
    setWord('');
    setPhase('loading');
    const next = player.current ?? new ReadAloudPlayer();
    player.current = next;
    await next.start(
      {
        text: clipped,
        voiceId: settings.voiceId,
        speed: settings.speed,
        engine,
        buffer: settings.readAloudBuffer,
        retryOnDevice,
      },
      {
        onProgress: (value) => setProgress(value),
        onWord: (nextWord) => setWord(nextWord),
        onPlaying: () => {
          setPhase('playing');
          setProgress(null);
        },
        onEnded: () => {
          setPhase('idle');
          setProgress(null);
          setWord('');
        },
        onFallback: (_used, reason) => {
          setFallback(reason);
        },
        onError: (caught) => {
          setPhase('idle');
          setProgress(null);
          setWord('');
          setError(voiceErrorText(caught));
        },
      },
    );
  };

  const retryOnDevice = () => {
    writeDeviceFallback(null);
    resetKokoroHost();
    setFallback(null);
    setError(null);
    void play(true);
  };

  const togglePause = () => {
    const current = player.current;
    if (!current) return;
    if (phase === 'playing') {
      current.pause();
      setPhase('paused');
    } else if (phase === 'paused') {
      current.resume();
      setPhase('playing');
    }
  };

  const stop = () => {
    player.current?.stop();
    setPhase('idle');
    setProgress(null);
    setWord('');
  };

  const applySpeech = (voiceId: VoiceId, speed: number) => {
    if (phase !== 'playing' && phase !== 'paused') return;
    void player.current?.updateSpeech({ voiceId, speed });
  };

  const blocked = needsServer && !serverReady;
  const percent = progress ? readAloudProgressPercent(progress.loaded, progress.total) : 0;
  const speedReading = settings.speedReading;
  const showRetry = engine === 'browser' && (usingFallback === 'speech' || !!fallback || !!error);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Read aloud"
        description="Paste text and hear it here. The default voice runs on this device after a one-time download from your Inaudio."
      />
      <div className="flex flex-wrap items-center gap-4">
        <Select
          label="Voice"
          value={settings.voiceId}
          onValueChange={(voiceId: VoiceId) => {
            update.mutate({ voiceId });
            applySpeech(voiceId, settings.speed);
          }}
          disabled={engine === 'speech'}
          options={KOKORO_VOICES.map((voice) => ({
            value: voice.id,
            label: voice.name,
            hint: `${voice.accent}, ${voice.gender}`,
          }))}
        />
        <label className="grid min-w-48 flex-1 gap-1">
          <span className="text-xs text-muted">Speed {(speedDraft ?? settings.speed)}×</span>
          <Slider
            aria-label="Reading speed"
            min={0.5}
            max={3}
            step={0.05}
            value={[speedDraft ?? settings.speed]}
            onValueChange={([speed]) => speed !== undefined && setSpeedDraft(speed)}
            onValueCommit={([speed]) => {
              setSpeedDraft(null);
              if (speed === undefined) return;
              update.mutate({ speed });
              applySpeech(settings.voiceId, speed);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {READ_SPEED_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={settings.speed === preset ? 'primary' : 'secondary'}
            onClick={() => {
              update.mutate({ speed: preset });
              applySpeech(settings.voiceId, preset);
            }}
          >
            {preset}×
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span>Speed reading</span>
          <Switch
            checked={speedReading}
            onCheckedChange={(next) => update.mutate({ speedReading: next })}
            aria-label="Speed reading"
          />
        </label>
      </div>
      {speedReading && phase !== 'idle' ? (
        <div className="grid min-h-48 place-items-center rounded-[12px] border border-line bg-sunken px-6 py-12">
          <p className="text-center text-4xl font-semibold tracking-tight text-ink">{word || (phase === 'loading' ? '…' : '')}</p>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste or type something to hear it."
          rows={10}
          className="w-full resize-y rounded-[12px] border border-line bg-surface px-4 py-3 text-base leading-relaxed outline-none focus:border-accent"
        />
      )}
      {speedReading && phase !== 'idle' && (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly
          rows={4}
          className="w-full resize-y rounded-[12px] border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted outline-none"
        />
      )}
      {needsServer && status && !serverReady && (status.tts.error || status.message) && (
        <VoiceErrorBox title="The server voice is not ready." detail={status.tts.error || status.message || ''} />
      )}
      {needsServer && status && !serverReady && !status.tts.error && !status.message && (
        <Notice>The server voice is still loading.</Notice>
      )}
      {engine === 'speech' && <Notice>Using this browser&apos;s built-in voice. You can switch in Settings.</Notice>}
      {progress && (
        <div className="grid gap-2">
          <Notice>
            Downloading the voice for this device… {percent}%
            {progress.file ? ` (${progress.file})` : ''}
          </Notice>
          <Progress value={percent} label="Voice download" />
        </div>
      )}
      {fallback && (
        <VoiceErrorBox
          tone="warning"
          title="This device could not load the on-device voice, so Inaudio is using the browser's built-in voice for now. Reload this page or try again to load Kokoro."
          detail={fallback}
          onRetry={showRetry ? retryOnDevice : undefined}
        />
      )}
      {error && (
        <VoiceErrorBox
          title="Could not read that aloud."
          detail={error}
          onRetry={showRetry ? retryOnDevice : undefined}
        />
      )}
      <IsolationNotice />
      <ReadAloudDiagLine />
      <div className="flex flex-wrap gap-2">
        {phase === 'idle' || phase === 'loading' ? (
          <Button variant="primary" onClick={() => void play()} disabled={!text.trim() || blocked || phase === 'loading'}>
            <Play /> {phase === 'loading' ? 'Preparing…' : 'Read aloud'}
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={togglePause}>
              {phase === 'playing' ? <Pause /> : <Play />}
              {phase === 'playing' ? 'Pause' : 'Resume'}
            </Button>
            <Button onClick={stop}>
              <Square /> Stop
            </Button>
          </>
        )}
        {showRetry && phase !== 'loading' && (
          <Button onClick={retryOnDevice} disabled={!text.trim()}>
            Try on-device voice again
          </Button>
        )}
      </div>
    </div>
  );
}
