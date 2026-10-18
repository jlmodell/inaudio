import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  IDLE_LIVE,
  LIVE_BACKLOG_WARN_MS,
  LIVE_MAX_SESSION_MS,
  LIVE_SAMPLE_RATE,
  liveActive,
  type LiveChunk,
  type LiveCommand,
  type LiveReport,
  type LiveStartInput,
  type LiveState,
  type SystemAudioSupport,
} from '@shared/domain/capture';
import { MAX_SESSION_TRANSCRIPT_CHARS, type Transcript } from '@shared/domain/history';
import { MODEL_CATALOG, type ModelId } from '@shared/domain/models';
import type { Settings } from '@shared/domain/settings';
import type { OverlayLive } from '@shared/domain/system';
import { EVENTS } from '@shared/ipc/channels';
import type { SttResult } from '@shared/worker/protocol';
import { armCapture, disarmCapture } from '../security/capture-grant';

interface LiveOptions {
  settings(): Settings;
  support(): SystemAudioSupport;
  isInstalled(id: ModelId): boolean;
  /** Warms the recognizer while capture starts, so the first chunk does not wait for a load. */
  preload(id: ModelId): void;
  /** Runs one chunk through the speech queue, behind any dictation. */
  transcribe(id: ModelId, samples: Float32Array): Promise<SttResult>;
  save(transcript: Transcript): void;
  /** The app window, opened if needed: capture runs in its renderer. */
  window(): BrowserWindow | null;
  ensureWindow(): void;
  showWindow(): void;
  send(channel: string, payload: unknown): void;
  overlay: { setLive(live: OverlayLive | null): void; setLiveLevel(level: number): void };
  tray: { setLive(active: boolean): void };
  companion: { setLive(active: boolean): void };
  readAloud: { pause(): void };
}

/** How long the window may take to deliver a live stream. macOS waits on its own picker. */
const START_TIMEOUT_MS = process.platform === 'darwin' ? 90_000 : 20_000;
/** A track that ends this soon, with nothing transcribed, was blocked rather than stopped. */
const BLOCKED_WITHIN_MS = 1_500;

/**
 * The single authority over live transcripts. The page, the tray, the overlay and the shortcut
 * all ask this controller. It arms the one-shot capture grant, tells the app window to capture,
 * transcribes each chunk it receives, and keeps the transcript. Audio never touches the disk
 * and transcript text is never logged.
 */
export class LiveCaptureController {
  private state: LiveState = { ...IDLE_LIVE };
  private texts = new Map<number, string>();
  private lastSeq = -1;
  private inflight = 0;
  private ended = false;
  /** The start command has reached the window. */
  private delivered = false;
  private modelId: ModelId | null = null;
  private language = '';
  private inferenceMs = 0;
  private level = 0;
  private startTimer: NodeJS.Timeout | null = null;
  private limitTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: LiveOptions) {}

  snapshot(): LiveState {
    return this.state;
  }

  active(): boolean {
    return liveActive(this.state.phase);
  }

  capturing(): boolean {
    return this.state.phase === 'capturing';
  }

  /** The shortcut and the tray: stop a running session, or start one with the saved source. */
  toggle(): void {
    if (this.active()) this.stop();
    else void this.start({ source: this.options.settings().live.source, acknowledged: false });
  }

  async start({ source, acknowledged }: LiveStartInput): Promise<void> {
    if (this.active()) return;
    const settings = this.options.settings();
    if (!acknowledged && !settings.live.consentAcknowledged) {
      // The notice is shown by the page, which then starts with `acknowledged`.
      this.options.showWindow();
      this.options.send(EVENTS.command, 'navigate:live');
      this.command({ type: 'consent', source });
      return;
    }
    const support = this.options.support();
    if (!support.available) {
      this.fail(support.reason);
      return;
    }
    const modelId = settings.stt.modelId;
    if (!this.options.isInstalled(modelId)) {
      this.fail(`${MODEL_CATALOG[modelId].name} is not downloaded yet. Open Models to download it.`);
      return;
    }
    this.options.ensureWindow();
    const win = this.options.window();
    if (!win || win.isDestroyed()) {
      this.fail('The Inaudio window is not available.');
      return;
    }

    const sessionId = randomUUID();
    this.reset();
    this.modelId = modelId;
    this.state = { ...IDLE_LIVE, phase: 'starting', sessionId, source, savedId: null };
    this.publish();
    this.options.preload(modelId);
    if (settings.live.pauseReadAloud) this.options.readAloud.pause();

    armCapture(win.webContents.id);
    // getDisplayMedia needs transient user activation, which a shortcut or the tray never
    // gives. A constant expression run with userGesture=true in the preload's isolated world
    // grants it to the frame and exposes nothing.
    await win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: '0' }], true).catch(() => undefined);
    if (this.state.sessionId !== sessionId) return;
    this.command({
      type: 'start',
      sessionId,
      source,
      micDeviceId: settings.audio.inputDeviceId,
      micGain: settings.live.micGain,
      systemGain: settings.live.systemGain,
    });
    this.delivered = true;
    this.startTimer = setTimeout(() => {
      if (this.state.sessionId === sessionId && this.state.phase === 'starting') {
        this.command({ type: 'cancel', sessionId });
        this.fail('System audio did not start. Try again.');
      }
    }, START_TIMEOUT_MS);
    this.startTimer.unref();
  }

  stop(): void {
    const { sessionId, phase } = this.state;
    if (!sessionId) return;
    if (phase === 'starting') {
      this.cancel();
      return;
    }
    if (phase !== 'capturing') return;
    this.state = { ...this.state, phase: 'finishing' };
    this.clearTimers();
    this.publish();
    this.command({ type: 'stop', sessionId });
  }

  /** Ends the session and drops everything it heard. */
  cancel(): void {
    const { sessionId } = this.state;
    if (!sessionId || !this.active()) return;
    this.command({ type: 'cancel', sessionId });
    this.reset();
    this.state = { ...IDLE_LIVE, source: this.state.source };
    this.publish();
  }

  /** The machine is going to sleep: keep what was transcribed and stop. */
  interrupt(): void {
    if (this.state.phase === 'starting') this.cancel();
    else this.stop();
  }

  /**
   * The app window reloaded, crashed or closed, taking the stream with it. What was already
   * transcribed is kept and saved; nothing more can arrive.
   */
  rendererGone(): void {
    if (!this.active()) return;
    if (this.state.phase === 'starting') {
      // A window opened for this start finishes loading before the command goes out.
      if (this.delivered) this.fail('The Inaudio window closed before system audio started.');
      return;
    }
    this.clearTimers();
    this.state = { ...this.state, phase: 'finishing', message: 'The Inaudio window closed, so the session ended.' };
    this.ended = true;
    this.publish();
    this.maybeFinish();
  }

  /** The capturing window reporting what it is actually doing. */
  report(report: LiveReport): void {
    if (report.sessionId !== this.state.sessionId) return;
    if (report.type === 'level') {
      if (this.state.phase !== 'capturing') return;
      this.level = report.level;
      this.options.overlay.setLiveLevel(report.level);
      return;
    }
    if (report.type === 'capturing') {
      if (this.state.phase !== 'starting') return;
      disarmCapture();
      if (this.startTimer) clearTimeout(this.startTimer);
      this.startTimer = null;
      this.state = { ...this.state, phase: 'capturing', startedAt: Date.now(), ownAudioFiltered: report.ownAudioFiltered };
      this.limitTimer = setTimeout(() => this.stop(), LIVE_MAX_SESSION_MS);
      this.limitTimer.unref();
      this.publish();
      return;
    }
    if (report.type === 'error') {
      this.fail(report.message || 'System audio stopped unexpectedly.');
      return;
    }
    // Ended: either after our stop, or because the track itself ended.
    if (this.state.phase === 'capturing') {
      const trackEnded = report.reason === 'track-ended';
      const blocked = trackEnded && Date.now() - this.state.startedAt < BLOCKED_WITHIN_MS && this.state.parts === 0 && this.inflight === 0;
      if (blocked) {
        this.fail(this.blockedMessage());
        return;
      }
      this.state = { ...this.state, phase: 'finishing', message: trackEnded ? 'System audio stopped, so the session ended.' : this.state.message };
      this.clearTimers();
      this.publish();
    }
    this.ended = true;
    this.maybeFinish();
  }

  /** One chunk from the capturing window. Resolves once it is transcribed. */
  async chunk({ sessionId, seq, samples }: LiveChunk): Promise<void> {
    const { phase } = this.state;
    if (sessionId !== this.state.sessionId || (phase !== 'capturing' && phase !== 'finishing') || this.ended) {
      throw new Error('This live session has ended.');
    }
    if (seq <= this.lastSeq) throw new Error('Chunk out of order');
    this.lastSeq = seq;
    const modelId = this.modelId;
    if (!modelId) throw new Error('This live session has ended.');
    const ms = Math.round((samples.length / LIVE_SAMPLE_RATE) * 1000);
    this.inflight++;
    this.setPending(this.state.pendingMs + ms);
    try {
      const result = await this.options.transcribe(modelId, samples);
      if (sessionId !== this.state.sessionId) return;
      this.inferenceMs += result.inferenceMs;
      if (result.language) this.language = result.language.slice(0, 16);
      const text = result.text.trim();
      if (text) this.texts.set(seq, text);
      const joined = this.joined();
      const full = joined.length >= MAX_SESSION_TRANSCRIPT_CHARS;
      this.state = {
        ...this.state,
        text: full ? joined.slice(0, MAX_SESSION_TRANSCRIPT_CHARS) : joined,
        parts: this.state.parts + (text ? 1 : 0),
        durationMs: this.state.durationMs + ms,
      };
      if (full && this.state.phase === 'capturing') {
        this.state = { ...this.state, message: 'The transcript reached its length limit, so the session ended.' };
        this.stop();
      }
    } catch (error) {
      if (sessionId !== this.state.sessionId) return;
      // One failed chunk loses that stretch of audio, not the session.
      this.state = { ...this.state, message: `Part of the audio could not be transcribed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) };
    } finally {
      if (sessionId === this.state.sessionId) {
        this.inflight--;
        this.setPending(Math.max(0, this.state.pendingMs - ms));
        this.maybeFinish();
      }
    }
  }

  dispose(): void {
    this.clearTimers();
    disarmCapture();
  }

  private setPending(pendingMs: number): void {
    this.state = { ...this.state, pendingMs, behind: pendingMs > LIVE_BACKLOG_WARN_MS };
    this.publish();
  }

  private joined(): string {
    return [...this.texts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text)
      .join('\n\n');
  }

  /** Once the window has stopped and every chunk is back, the session is saved and closed. */
  private maybeFinish(): void {
    if (!this.ended || this.inflight > 0 || this.state.phase !== 'finishing') return;
    const settings = this.options.settings();
    const text = this.state.text.trim();
    let savedId: string | null = null;
    if (text && this.modelId && settings.dictation.saveHistory) {
      savedId = randomUUID();
      try {
        this.options.save({
          id: savedId,
          text,
          modelId: this.modelId,
          durationMs: this.state.durationMs,
          inferenceMs: Math.round(this.inferenceMs),
          language: this.language,
          createdAt: this.state.startedAt || Date.now(),
          source: this.state.source,
        });
      } catch (error) {
        savedId = null;
        this.state = { ...this.state, message: `The transcript could not be saved: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) };
      }
    }
    const { source, message, durationMs, parts, ownAudioFiltered } = this.state;
    this.reset();
    this.state = { ...IDLE_LIVE, source, text, message, durationMs, parts, ownAudioFiltered, savedId };
    this.publish();
  }

  private blockedMessage(): string {
    if (process.platform === 'darwin') {
      return 'No system audio came through. Allow Inaudio under Privacy & Security > Screen & System Audio Recording, then try again.';
    }
    if (process.platform === 'linux') {
      return 'No system audio came through. On Linux this needs PulseAudio, or PipeWire with its PulseAudio server.';
    }
    return 'No system audio came through. Check that an output device is connected, then try again.';
  }

  private fail(message: string): void {
    const { sessionId } = this.state;
    if (sessionId && this.active()) this.command({ type: 'cancel', sessionId });
    const { source } = this.state;
    this.reset();
    this.state = { ...IDLE_LIVE, phase: 'error', source, message: message.slice(0, 200) };
    this.publish();
  }

  private reset(): void {
    this.clearTimers();
    disarmCapture();
    this.texts.clear();
    this.lastSeq = -1;
    this.inflight = 0;
    this.ended = false;
    this.delivered = false;
    this.modelId = null;
    this.language = '';
    this.inferenceMs = 0;
    this.level = 0;
  }

  private clearTimers(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.startTimer = null;
    this.limitTimer = null;
  }

  private command(command: LiveCommand): void {
    this.options.send(EVENTS.liveCommand, command);
  }

  private publish(): void {
    this.options.send(EVENTS.liveState, this.state);
    const capturing = this.state.phase === 'capturing';
    this.options.overlay.setLive(capturing ? { source: this.state.source, startedAt: this.state.startedAt, level: this.level } : null);
    this.options.tray.setLive(capturing);
    this.options.companion.setLive(this.active());
  }
}
