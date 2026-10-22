import { clipboard, Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { MODEL_CATALOG, type ModelId } from '@shared/domain/models';
import {
  IDLE_READ_ALOUD,
  MAX_READ_ALOUD_CHARS,
  READ_ALOUD_KEEP_BEHIND,
  readAloudActive,
  type ReadAloudChunk,
  type ReadAloudControl,
  type ReadAloudReport,
  type ReadAloudSession,
  type ReadAloudSource,
  type ReadAloudStart,
  type ReadAloudState,
} from '@shared/domain/read-aloud';
import type { Settings } from '@shared/domain/settings';
import { EVENTS } from '@shared/ipc/channels';
import type { TtsResult } from '@shared/worker/protocol';
import { aheadEnd, clampAhead } from '@shared/read-aloud/ahead';
import { dropBufferedFrom, retakeFromCurrent } from '@shared/read-aloud/retake';
import { normalizeText, segmentText } from '@shared/read-aloud/segment';
import { float32Samples, ttsSpeakRequest } from '@shared/read-aloud/tts-request';
import { appIcon } from '../../app/assets';
import { SelectionProvider, type SelectionResult } from './selection-provider';

interface ReadAloudOptions {
  settings(): Settings;
  isInstalled(id: ModelId): boolean;
  /** Runs one synthesis through the speech model's own queue, loading it first if needed. */
  speak(modelId: ModelId, text: string, sid: number, speed: number): Promise<TtsResult>;
  /** Sends to the main window, the only renderer that plays audio. */
  send(channel: string, payload: unknown): void;
  /** Opens the main window if it is gone. Only called once the text is already captured. */
  ensureWindow(): void;
  tray: { setReading(reading: 'idle' | 'playing' | 'paused'): void };
  companion: { react(event: 'tts.started' | 'tts.completed', state: 'speaking' | 'ready'): void; setReading(active: boolean): void };
}

const CAPTURE_MESSAGE: Record<Extract<SelectionResult, { ok: false }>['reason'], string> = {
  empty: 'No text is selected.',
  protected: 'That field is protected, so it is not read.',
  permission: 'Allow Inaudio under Privacy & Security > Accessibility to read selected text.',
  unsupported: 'This app does not share its selection. Paste the text into Read Aloud instead.',
};
/**
 * The single authority over Read Aloud. Shortcuts, the tray and the page all ask this
 * controller, which captures the text, splits it, synthesizes a few segments ahead in the
 * speech worker, and tells the main window what to play. The window reports back when a
 * segment ends. Text is never logged.
 */
export class ReadAloudController {
  private readonly selection: SelectionProvider;
  private session: ReadAloudSession | null = null;
  private state: ReadAloudState = { ...IDLE_READ_ALOUD };
  /** Segments of the current take the window holds, mirroring its eviction rule. */
  private delivered = new Set<number>();
  /** The synthesis in flight; a newer session or take simply ignores its result. */
  private inflight: { index: number } | null = null;
  private capturing = 0;
  /** A pause asked for while the selection was still being read; the new session begins paused. */
  private deferredPause = false;
  private errorTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: ReadAloudOptions) {
    this.selection = new SelectionProvider(() => options.settings().tts);
  }

  /** Starts the platform helper in the background so the first shortcut does not wait for it. */
  warm(): void {
    this.selection.warm();
  }

  snapshot(): { session: ReadAloudSession | null; state: ReadAloudState } {
    return { session: this.session, state: this.state };
  }

  /** The Read Aloud shortcut: reads the selection, or stops whatever it started — a capture included. */
  toggleSelection(): void {
    if (readAloudActive(this.state.status)) this.stop();
    else void this.startFromSelection();
  }

  togglePause(): void {
    if (this.state.status === 'paused') this.resume();
    else this.pause();
  }

  async start(input: ReadAloudStart): Promise<{ sessionId: string | null }> {
    if (input.source === 'manual') this.begin('manual', input.text);
    else if (input.source === 'clipboard') await this.startFromClipboard();
    else await this.startFromSelection();
    return { sessionId: this.state.sessionId };
  }

  control(input: ReadAloudControl): void {
    if (input.sessionId !== this.state.sessionId) return;
    if (input.action === 'seek') this.seek(input.index);
    else if (input.action === 'pause') this.pause();
    else if (input.action === 'resume') this.resume();
    else if (input.action === 'stop') this.stop();
    else this.seek(0);
  }

  report(report: ReadAloudReport): void {
    if (report.sessionId !== this.state.sessionId || !this.session) return;
    if (report.type === 'error') {
      this.fail(report.message || 'Playback failed.');
      return;
    }
    if (report.index !== this.state.index || report.seek !== this.state.seek) return;
    if (report.index + 1 >= this.state.count) {
      this.finish();
      return;
    }
    this.state = { ...this.state, index: report.index + 1, waiting: !this.delivered.has(report.index + 1) };
    this.evict();
    this.publish();
    this.pump();
  }

  pause(): void {
    if (this.state.status === 'capturing') {
      this.deferredPause = true;
      return;
    }
    if (this.state.status !== 'playing' && this.state.status !== 'preparing') return;
    this.state = { ...this.state, status: 'paused' };
    this.publish();
    this.options.companion.react('tts.completed', 'ready');
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state = { ...this.state, status: 'playing' };
    this.publish();
    this.options.companion.react('tts.started', 'speaking');
    this.pump();
  }

  stop(): void {
    if (!readAloudActive(this.state.status) && this.state.status !== 'error') return;
    this.capturing++;
    this.deferredPause = false;
    const speaking = this.state.sessionId !== null && readAloudActive(this.state.status);
    this.state = { ...this.state, status: this.state.sessionId ? 'stopped' : 'idle', waiting: false };
    this.publish();
    if (speaking) this.options.companion.react('tts.completed', 'ready');
  }

  /** A new voice or speed stops the current sentence and reads it again with the new settings. */
  onSettings(next: Settings, previous: Settings): void {
    if (!this.session) return;
    const voiceOrSpeed = next.tts.voiceId !== previous.tts.voiceId || next.tts.speed !== previous.tts.speed;
    if (voiceOrSpeed) {
      let request;
      try {
        request = ttsSpeakRequest(next.tts);
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
        return;
      }
      this.delivered = dropBufferedFrom(this.delivered, this.state.index);
      this.inflight = null;
      this.state = retakeFromCurrent(this.state, request.voiceId, request.speed);
      this.publish();
    }
    if (voiceOrSpeed || next.tts.readAloudBuffer !== previous.tts.readAloudBuffer) this.pump();
  }

  /** The main window (re)loaded and holds no audio, so everything is synthesized again. */
  rendererReset(): void {
    if (!this.session) return;
    this.delivered.clear();
    this.state = { ...this.state, take: this.state.take + 1, waiting: true, durations: this.state.durations.map(() => 0) };
    this.publish();
    this.pump();
  }

  dispose(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.capturing++;
    this.selection.dispose();
  }

  private async startFromSelection(): Promise<void> {
    // One capture at a time: a second start would race the same helper and clipboard.
    if (this.state.status === 'capturing') return;
    if (readAloudActive(this.state.status)) this.stop();
    const token = ++this.capturing;
    this.state = { ...this.state, status: 'capturing', message: '' };
    this.publish();
    let result: SelectionResult;
    try {
      result = await this.selection.capture();
    } catch {
      result = { ok: false, reason: 'unsupported' };
    }
    if (token !== this.capturing) return;
    if (!result.ok) this.fail(CAPTURE_MESSAGE[result.reason]);
    else this.begin('selection', result.text);
  }

  private async startFromClipboard(): Promise<void> {
    if (readAloudActive(this.state.status)) this.stop();
    const text = await this.clipboardText();
    if (!text.trim()) this.fail('The clipboard has no text.');
    else this.begin('clipboard', text);
  }

  /** Electron's clipboard.readText() is a string; await it anyway so either shape works. */
  private async clipboardText(): Promise<string> {
    try {
      return String((await clipboard.readText()) ?? '');
    } catch {
      return '';
    }
  }

  private begin(source: ReadAloudSource, raw: string): void {
    this.capturing++;
    let request;
    try {
      request = ttsSpeakRequest(this.options.settings().tts);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    const model = MODEL_CATALOG[request.modelId];
    if (!this.options.isInstalled(request.modelId)) {
      this.fail(`${model.name} is not downloaded yet. Open Models to download it.`);
      return;
    }
    // Normalization only shrinks whitespace, so capping the input at 4x still answers whether
    // the text fits while keeping a huge clipboard off the main thread.
    const normalized = normalizeText(raw.slice(0, MAX_READ_ALOUD_CHARS * 4));
    const truncated = normalized.length > MAX_READ_ALOUD_CHARS || raw.length > MAX_READ_ALOUD_CHARS * 4;
    const text = truncated ? normalized.slice(0, MAX_READ_ALOUD_CHARS) : normalized;
    const segments = segmentText(text);
    if (!segments.length) {
      this.fail('There is no text to read.');
      return;
    }
    const paused = this.deferredPause;
    this.deferredPause = false;
    const sessionId = randomUUID();
    this.session = { sessionId, source, text, segments, truncated };
    this.delivered.clear();
    this.inflight = null;
    this.state = {
      sessionId,
      status: paused ? 'paused' : 'preparing',
      index: 0,
      count: segments.length,
      seek: 0,
      take: 0,
      durations: segments.map(() => 0),
      waiting: true,
      voiceId: request.voiceId,
      speed: request.speed,
      message: '',
    };
    this.options.ensureWindow();
    this.options.send(EVENTS.readAloudSession, this.session);
    this.publish();
    if (!paused) this.options.companion.react('tts.started', 'speaking');
    this.pump();
  }

  private seek(index: number): void {
    if (!this.session) return;
    const target = Math.max(0, Math.min(index, this.state.count - 1));
    const restarting = !readAloudActive(this.state.status);
    this.state = {
      ...this.state,
      status: this.state.status === 'preparing' ? 'preparing' : 'playing',
      index: target,
      seek: this.state.seek + 1,
      waiting: !this.delivered.has(target),
      message: '',
    };
    this.evict();
    this.publish();
    if (restarting) this.options.companion.react('tts.started', 'speaking');
    this.pump();
  }

  private finish(): void {
    this.state = { ...this.state, status: 'stopped', waiting: false };
    this.publish();
    this.options.companion.react('tts.completed', 'ready');
  }

  /** Drops what the window drops: segments far behind the one playing. */
  private evict(): void {
    for (const index of this.delivered) {
      if (index < this.state.index - READ_ALOUD_KEEP_BEHIND) this.delivered.delete(index);
    }
  }

  /** True once the current sentence is ready, and, at the start, once the sentence buffer is full. */
  private startReady(): boolean {
    if (!this.delivered.has(this.state.index)) return false;
    if (this.state.status !== 'preparing') return true;
    const need = aheadEnd(this.state.index, this.state.count, this.buffer()) - this.state.index;
    let have = 0;
    for (let i = this.state.index; i < this.state.index + need; i++) {
      if (this.delivered.has(i)) have += 1;
    }
    return have >= need;
  }

  private buffer(): number {
    return clampAhead(this.options.settings().tts.readAloudBuffer);
  }

  /** Synthesizes the next missing segment within the prefetch window, one at a time. */
  private pump(): void {
    const session = this.session;
    if (!session || this.inflight || !readAloudActive(this.state.status)) return;
    const { sessionId } = session;
    const { index, count, take } = this.state;
    let request;
    try {
      request = ttsSpeakRequest(this.options.settings().tts);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    let next = -1;
    for (let i = index; i < aheadEnd(index, count, request.buffer); i++) {
      if (!this.delivered.has(i)) {
        next = i;
        break;
      }
    }
    const segment = session.segments[next];
    if (!segment) return;
    const job = { index: next };
    this.inflight = job;
    void this.options
      .speak(request.modelId, segment.text, request.sid, request.speed)
      .then((result) => {
        if (sessionId !== this.state.sessionId || take !== this.state.take) return;
        if (result.sampleRate !== request.sampleRate) {
          this.fail(`The voice produced ${result.sampleRate} Hz audio; ${request.sampleRate} Hz was expected.`);
          return;
        }
        const samples = float32Samples(result.samples);
        this.delivered.add(next);
        const durations = [...this.state.durations];
        durations[next] = Math.round((samples.length / request.sampleRate) * 1000);
        const chunk: ReadAloudChunk = { sessionId, index: next, take, samples, sampleRate: request.sampleRate };
        this.options.send(EVENTS.readAloudChunk, chunk);
        const ready = this.startReady();
        this.state = {
          ...this.state,
          durations,
          waiting: !ready,
          status: ready && this.state.status === 'preparing' ? 'playing' : this.state.status,
        };
        this.publish();
      })
      .catch((error: unknown) => {
        if (sessionId !== this.state.sessionId || !readAloudActive(this.state.status)) return;
        this.fail(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (this.inflight === job) this.inflight = null;
        this.pump();
      });
  }

  private fail(message: string): void {
    this.deferredPause = false;
    const wasSpeaking = this.state.sessionId !== null && readAloudActive(this.state.status);
    this.state = { ...this.state, status: 'error', waiting: false, message };
    this.publish();
    if (wasSpeaking) this.options.companion.react('tts.completed', 'ready');
    const settings = this.options.settings();
    if (settings.tray.notifications && Notification.isSupported()) {
      new Notification({ title: 'Read Aloud', body: message, silent: true, icon: appIcon() }).show();
    }
  }

  private publish(): void {
    this.options.send(EVENTS.readAloudState, this.state);
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = null;
    const { status } = this.state;
    this.options.tray.setReading(status === 'paused' ? 'paused' : readAloudActive(status) && status !== 'capturing' ? 'playing' : 'idle');
    this.options.companion.setReading(status === 'playing' || status === 'preparing');
  }
}
