import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { KOKORO_VOICES, type VoiceId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { Button } from '@renderer/components/ui/button';
import { Notice, PageHeader } from '@renderer/components/ui/layout';
import { Select } from '@renderer/components/ui/select';
import { Slider } from '@renderer/components/ui/slider';
import { useSettings, useStatus, useUpdateSettings } from '../queries';
import { SpeakQueue } from '../speak-queue';

export function ReadAloudPage() {
  const { data: settings } = useSettings();
  const { data: status } = useStatus();
  const update = useUpdateSettings();
  const voiceReady = !!status?.tts.loaded;
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<SpeakQueue | null>(null);

  useEffect(
    () => () => {
      queue.current?.stop();
    },
    [],
  );

  if (!settings) return null;

  const play = async () => {
    const clipped = text.trim().slice(0, MAX_READ_ALOUD_CHARS);
    if (!clipped) return;
    setError(null);
    setPhase('loading');
    const player = queue.current ?? new SpeakQueue();
    queue.current = player;
    await player.start(
      { text: clipped, voiceId: settings.voiceId, speed: settings.speed },
      {
        onPlaying: () => setPhase('playing'),
        onEnded: () => setPhase('idle'),
        onError: (caught) => {
          setPhase('idle');
          setError(caught.message);
        },
      },
    );
  };

  const togglePause = () => {
    const player = queue.current;
    if (!player) return;
    if (phase === 'playing') {
      player.pause();
      setPhase('paused');
    } else if (phase === 'paused') {
      player.resume();
      setPhase('playing');
    }
  };

  const stop = () => {
    queue.current?.stop();
    setPhase('idle');
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="Read aloud" description="Paste text and hear it on this computer. Nothing is sent to the internet." />
      <div className="flex flex-wrap items-center gap-4">
        <Select
          label="Voice"
          value={settings.voiceId}
          onValueChange={(voiceId: VoiceId) => update.mutate({ voiceId })}
          options={KOKORO_VOICES.map((voice) => ({
            value: voice.id,
            label: voice.name,
            hint: `${voice.accent}, ${voice.gender}`,
          }))}
        />
        <label className="grid min-w-48 flex-1 gap-1">
          <span className="text-xs text-muted">Speed {settings.speed.toFixed(1)}×</span>
          <Slider
            aria-label="Reading speed"
            min={0.5}
            max={2}
            step={0.1}
            value={[settings.speed]}
            onValueChange={([speed]) => speed !== undefined && update.mutate({ speed })}
          />
        </label>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste or type something to hear it."
        rows={10}
        className="w-full resize-y rounded-[12px] border border-line bg-surface px-4 py-3 text-base leading-relaxed outline-none focus:border-accent"
      />
      {status && !voiceReady && (status.tts.error || status.message) && (
        <Notice tone="danger">{status.tts.error || status.message}</Notice>
      )}
      {status && !voiceReady && !status.tts.error && !status.message && (
        <Notice>The voice model is still loading.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        {phase === 'idle' || phase === 'loading' ? (
          <Button variant="primary" onClick={() => void play()} disabled={!text.trim() || !voiceReady || phase === 'loading'}>
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
      </div>
    </div>
  );
}
