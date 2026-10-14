import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useGaze } from '@blobatar/react/gaze';
import { idle, surprised, type Expression } from 'blobatar/expression';
import {
  companionBubbleText,
  type CompanionEvent,
  type CompanionSnapshot,
} from '@shared/domain/companion';
import type { VoiceId } from '@shared/domain/models';
import { api } from './lib/api';
import './styles/index.css';
import { CompanionAvatar, companionExpression, IDLE_MOODS } from './features/companion/companion-avatar';
import { playCue } from './features/dictation/audio/cues';
import { PcmPlayer } from './lib/audio-player';

/** The face renders at this many px before `settings.scale`. */
const FACE_SIZE = 128;
/** An idle companion cycles a small mood every this many ms. */
const MOOD_EVERY_MS = 14_000;
const MOOD_HOLD_MS = 3_500;
/** A wake from sleep startles the face for this long, then it settles to idle. */
const RESUME_FLASH_MS = 2_000;

/**
 * Never spoken: dictation and speech events would talk over the user or over Inaudio, and
 * idle and model events fire too often to be worth a synthesized line.
 */
const SILENT_EVENTS: readonly CompanionEvent[] = [
  'dictation.started',
  'dictation.stopped',
  'tts.started',
  'tts.completed',
  'app.idle',
  'model.loading',
  'model.loaded',
];

function Companion() {
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [outputDeviceId, setOutputDeviceId] = useState('default');
  const [tts, setTts] = useState<{ voiceId?: VoiceId; speed?: number }>({});
  const previousState = useRef<CompanionSnapshot['state'] | null>(null);
  const spokenRevision = useRef(0);
  const pendingLine = useRef<string | null>(null);
  const wasDictating = useRef(false);
  const speech = useRef(new PcmPlayer());
  const speechJob = useRef(0);
  const [mood, setMood] = useState<Expression | null>(null);
  const [resumeFlash, setResumeFlash] = useState(false);
  // `travel` is the eye excursion in units of the 100-unit face; unset it stays 0.
  const gaze = useGaze({ travel: 3 });

  useEffect(() => {
    let mounted = true;
    const player = speech.current;
    void api.companions.get().then((value) => {
      if (mounted) setSnapshot(value);
    });
    void api.settings.get().then((value) => {
      if (mounted) setOutputDeviceId(value.audio.outputDeviceId);
      if (mounted) setTts({ voiceId: value.tts.voiceId as VoiceId, speed: value.tts.speed });
    });
    const off = api.events.onCompanionState((value) => setSnapshot(value));
    const offGaze = api.events.onCompanionGaze((target) => gaze.lookAt(target));
    const offSettings = api.events.onSettingsChanged((value) => {
      setOutputDeviceId(value.audio.outputDeviceId);
      setTts({ voiceId: value.tts.voiceId as VoiceId, speed: value.tts.speed });
    });
    return () => {
      mounted = false;
      off();
      offGaze();
      offSettings();
      player.stop();
    };
    // gaze.lookAt is stable; the hook object identity is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaze.lookAt]);

  useEffect(() => {
    if (!snapshot) return;
    const previous = previousState.current;
    previousState.current = snapshot.state;
    if (!snapshot.settings.soundEnabled || previous === null || previous === snapshot.state) return;
    const cue =
      snapshot.state === 'listening'
        ? 'start'
        : snapshot.state === 'speaking'
          ? 'ready'
          : snapshot.state === 'error' || snapshot.state === 'model-unavailable'
            ? 'error'
            : snapshot.state === 'attention'
              ? 'attention'
              : snapshot.state === 'ready'
                ? 'stop'
                : null;
    if (cue) void playCue(cue, { volume: snapshot.settings.soundVolume, outputDeviceId });
  }, [outputDeviceId, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const { settings } = snapshot;
    // A new dictation silences the companion and drops whatever it was about to say.
    if (snapshot.dictating && !wasDictating.current) {
      pendingLine.current = null;
      speechJob.current += 1;
      speech.current.stop();
    }
    wasDictating.current = snapshot.dictating;
    if (snapshot.event && !SILENT_EVENTS.includes(snapshot.event) && snapshot.revision !== spokenRevision.current) {
      spokenRevision.current = snapshot.revision;
      pendingLine.current =
        settings.voiceEnabled && settings.soundEnabled
          ? companionBubbleText(snapshot.state, settings.position === 'focus-area')
          : null;
    }
    // Lines raised during a recording or its transcription wait until it is over.
    const text = pendingLine.current;
    if (snapshot.dictating || !text) return;
    pendingLine.current = null;
    const job = ++speechJob.current;
    speech.current.stop();
    void api.tts.speak({ text, ...tts })
      .then((result) => {
        if (job === speechJob.current) {
          return speech.current.play(
            result.samples,
            result.sampleRate,
            outputDeviceId,
            () => undefined,
            snapshot.settings.soundVolume,
          );
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [outputDeviceId, snapshot, tts]);

  // While idle and allowed moods, the face occasionally drifts somewhere small and back.
  const idleMoodOn =
    !!snapshot &&
    snapshot.state === 'idle' &&
    snapshot.settings.visible &&
    snapshot.settings.idleMoods &&
    snapshot.settings.motion === 'full';
  const personality = snapshot?.settings.personality ?? 'calm';
  useEffect(() => {
    if (!idleMoodOn) {
      setMood(null);
      return;
    }
    let hold: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      const pool = IDLE_MOODS[personality];
      setMood(pool[Math.floor(Math.random() * pool.length)] ?? null);
      if (hold) clearTimeout(hold);
      hold = setTimeout(() => setMood(null), MOOD_HOLD_MS);
    }, MOOD_EVERY_MS);
    return () => {
      clearInterval(cycle);
      if (hold) clearTimeout(hold);
    };
  }, [idleMoodOn, personality]);

  // Waking from sleep startles the face, then it settles to idle.
  const isResume = snapshot?.event === 'system.resume';
  const revision = snapshot?.revision ?? 0;
  useEffect(() => {
    if (!isResume) return;
    setResumeFlash(true);
    const timer = setTimeout(() => setResumeFlash(false), RESUME_FLASH_MS);
    return () => clearTimeout(timer);
  }, [revision, isResume]);

  if (!snapshot) return null;
  const { companion, settings, state } = snapshot;
  const bubble = companionBubbleText(state, settings.position === 'focus-area');
  const expression =
    isResume && state === 'ready' ? (resumeFlash ? surprised : idle) : companionExpression(state, settings.personality);
  const face = Math.round(FACE_SIZE * settings.scale);
  document.body.dataset.surface = 'companion';
  // The window never throttles (it must react while hidden), so a hidden companion stops
  // its own animations instead of compositing frames nobody can see.
  document.body.dataset.motion = settings.visible ? settings.motion : 'off';
  return (
    <button
      type="button"
      aria-label={`${companion.displayName}, ${state}`}
      className={`companion-stage companion-stage-${state} group grid size-full place-items-center border-0 bg-transparent p-0 outline-none`}
      onMouseEnter={() => api.companions.hover(true)}
      onMouseLeave={() => api.companions.hover(false)}
      onClick={() => void api.companions.click().catch(() => undefined)}
    >
      {settings.showBubble && <span className="companion-bubble" role="status">{bubble}</span>}
      <span className="companion-face">
        <CompanionAvatar
          companion={companion}
          settings={settings}
          expression={mood ?? expression}
          size={face}
          gazeRef={gaze.ref}
        />
      </span>
    </button>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<Companion />);
