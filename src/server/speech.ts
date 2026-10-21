import { randomUUID } from 'node:crypto';
import { MODEL_CATALOG, voiceSid, type ModelId } from '@shared/domain/models';
import { MAX_TRANSCRIPT_CHARS, type Transcript } from '@shared/domain/history';
import { joinPassage, type PassageCut } from '@shared/live/join';
import { applyReplacements } from '@shared/text/replacements';
import type { SttCleanup, SttResult, TtsResult } from '@shared/worker/protocol';
import type { WebLiveResult, WebModelProgress, WebStatus } from '@shared/web/api';
import { CleanupModels } from './cleanup';
import type { WebConfig } from './config';
import { JsonHistory } from './history';
import { NodeInferenceHost } from './inference-host';
import { ModelStore } from './model-store';
import { defaultSettings, SettingsStore } from './settings';

const CHUNK_MS = 6_000;
const MAX_SESSION_MS = 10 * 60_000;
const SESSION_TTL_MS = 15 * 60_000;

export interface SpeechBackend {
  transcribe(samples: Float32Array, sampleRate: number, cleanup?: SttCleanup): Promise<SttResult>;
  speak(text: string, sid: number, speed: number): Promise<TtsResult>;
  loadStt(modelId: ModelId, dir: string, threads: number): Promise<void>;
  loadTts(modelId: ModelId, dir: string, threads: number): Promise<void>;
  sttReady(modelId: ModelId): boolean;
  ttsReady(modelId: ModelId): boolean;
  close?(): Promise<void>;
}

class HostBackend implements SpeechBackend {
  constructor(private readonly host: NodeInferenceHost) {}

  transcribe(samples: Float32Array, sampleRate: number, cleanup?: SttCleanup): Promise<SttResult> {
    return this.host.transcribe(samples, sampleRate, cleanup);
  }

  speak(text: string, sid: number, speed: number): Promise<TtsResult> {
    return this.host.speak(text, sid, speed);
  }

  async loadStt(modelId: ModelId, dir: string, threads: number): Promise<void> {
    const layout = MODEL_CATALOG[modelId].layout;
    if (layout.kind !== 'stt') throw new Error('Not a speech-to-text model');
    await this.host.loadStt({ type: 'stt:load', modelId, dir, layout, threads });
  }

  async loadTts(modelId: ModelId, dir: string, threads: number): Promise<void> {
    const layout = MODEL_CATALOG[modelId].layout;
    if (layout.kind !== 'tts') throw new Error('Not a text-to-speech model');
    await this.host.loadTts({ type: 'tts:load', modelId, dir, layout, threads });
  }

  sttReady(modelId: ModelId): boolean {
    return this.host.isLoaded(modelId);
  }

  ttsReady(modelId: ModelId): boolean {
    return this.host.isLoaded(modelId);
  }

  close(): Promise<void> {
    return this.host.stop();
  }
}

/** Deterministic stand-in so HTTP tests can run without downloading 600 MB models. */
export class FakeSpeechBackend implements SpeechBackend {
  private stt?: ModelId;
  private tts?: ModelId;

  async transcribe(samples: Float32Array, sampleRate: number): Promise<SttResult> {
    const seconds = samples.length / sampleRate;
    return {
      text: seconds < 0.05 ? '' : 'hello from inaudio',
      language: 'en',
      inferenceMs: 1,
    };
  }

  async speak(): Promise<TtsResult> {
    const sampleRate = 16_000;
    const samples = new Float32Array(sampleRate / 10);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    return { samples, sampleRate, inferenceMs: 1 };
  }

  async loadStt(modelId: ModelId): Promise<void> {
    this.stt = modelId;
  }

  async loadTts(modelId: ModelId): Promise<void> {
    this.tts = modelId;
  }

  sttReady(modelId: ModelId): boolean {
    return this.stt === modelId;
  }

  ttsReady(modelId: ModelId): boolean {
    return this.tts === modelId;
  }
}

interface LiveSession {
  id: string;
  startedAt: number;
  sampleRate: number;
  pending: Float32Array[];
  pendingLength: number;
  text: string;
  lastCut: PassageCut | null;
  inferenceMs: number;
  durationMs: number;
}

export class SpeechService {
  readonly history: JsonHistory;
  readonly settings: SettingsStore;
  readonly models: ModelStore;
  readonly cleanup: CleanupModels;
  private readonly backend: SpeechBackend;
  private readonly sessions = new Map<string, LiveSession>();
  private sttLoading: Promise<void> | null = null;
  private ttsLoading: Promise<void> | null = null;
  private message?: string;

  constructor(
    private readonly config: WebConfig,
    backend?: SpeechBackend,
  ) {
    this.history = new JsonHistory(config.paths.history);
    this.settings = new SettingsStore(
      config.paths.settings,
      defaultSettings(config.sttModelId, config.ttsModelId),
    );
    this.models = new ModelStore(config.paths.models, config.paths.downloads);
    this.cleanup = new CleanupModels(`${config.paths.assets}/models`);
    this.backend = backend ?? (config.fakeSpeech ? new FakeSpeechBackend() : new HostBackend(new NodeInferenceHost()));
  }

  async start(): Promise<void> {
    await this.cleanup.verify();
    if (this.config.fakeSpeech || this.backend instanceof FakeSpeechBackend) {
      await this.backend.loadStt(this.settings.get().sttModelId, '', this.config.threads);
      await this.backend.loadTts(this.settings.get().ttsModelId, '', this.config.threads);
      return;
    }
    const sttId = this.settings.get().sttModelId;
    const ttsId = this.settings.get().ttsModelId;
    await this.models.discover(sttId);
    await this.models.discover(ttsId);
    if (this.config.downloadModels) {
      void this.prepare(sttId, 'stt').catch((error) => {
        this.message = error instanceof Error ? error.message : String(error);
      });
      void this.prepare(ttsId, 'tts').catch(() => undefined);
    }
  }

  status(authenticated: boolean): WebStatus {
    const settings = this.settings.get();
    return {
      ready: this.backend.sttReady(settings.sttModelId),
      authRequired: Boolean(this.config.password),
      authenticated,
      stt: this.modelProgress(settings.sttModelId, this.backend.sttReady(settings.sttModelId)),
      tts: this.modelProgress(settings.ttsModelId, this.backend.ttsReady(settings.ttsModelId)),
      ...(this.message ? { message: this.message } : {}),
    };
  }

  async transcribe(
    samples: Float32Array,
    sampleRate: number,
    options: { save: boolean; source?: Transcript['source'] } = { save: true },
  ): Promise<{ transcript: Transcript | null; text: string }> {
    const started = Date.now();
    await this.ensureStt();
    const settings = this.settings.get();
    const result = await this.backend.transcribe(samples, sampleRate, this.cleanupPaths(settings.speechCleanup));
    const text = applyReplacements(result.text, []).slice(0, MAX_TRANSCRIPT_CHARS);
    const durationMs = Math.round((samples.length / sampleRate) * 1000);
    if (!options.save || !settings.saveHistory || !text) {
      return { transcript: null, text };
    }
    const transcript: Transcript = {
      id: randomUUID(),
      text,
      modelId: settings.sttModelId,
      durationMs,
      inferenceMs: result.inferenceMs,
      language: result.language,
      createdAt: started,
      source: options.source ?? 'microphone',
      title: '',
      pinned: false,
    };
    this.history.add(transcript);
    return { transcript, text };
  }

  startLive(): { id: string } {
    this.sweepSessions();
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      startedAt: Date.now(),
      sampleRate: 16_000,
      pending: [],
      pendingLength: 0,
      text: '',
      lastCut: null,
      inferenceMs: 0,
      durationMs: 0,
    });
    return { id };
  }

  async liveChunk(id: string, samples: Float32Array, sampleRate: number): Promise<WebLiveResult> {
    const session = this.session(id);
    session.sampleRate = sampleRate;
    session.pending.push(samples);
    session.pendingLength += samples.length;
    session.durationMs = Date.now() - session.startedAt;
    if (session.durationMs > MAX_SESSION_MS) throw new Error('Dictation is longer than ten minutes');
    const pendingMs = (session.pendingLength / sampleRate) * 1000;
    if (pendingMs < CHUNK_MS) {
      return { text: session.text, provisional: '' };
    }
    const chunk = takePending(session);
    await this.appendPassage(session, chunk, sampleRate, 'limit');
    return { text: session.text, provisional: '' };
  }

  async stopLive(id: string): Promise<{ transcript: Transcript | null; text: string }> {
    const session = this.session(id);
    this.sessions.delete(id);
    if (session.pendingLength) {
      await this.appendPassage(session, takePending(session), session.sampleRate, 'end');
    }
    const text = session.text.slice(0, MAX_TRANSCRIPT_CHARS);
    const settings = this.settings.get();
    if (!settings.saveHistory || !text) return { transcript: null, text };
    const transcript: Transcript = {
      id: randomUUID(),
      text,
      modelId: settings.sttModelId,
      durationMs: session.durationMs,
      inferenceMs: session.inferenceMs,
      language: 'en',
      createdAt: session.startedAt,
      source: 'microphone',
      title: '',
      pinned: false,
    };
    this.history.add(transcript);
    return { transcript, text };
  }

  async speak(text: string, voiceId: string, speed: number): Promise<TtsResult> {
    await this.ensureTts();
    return this.backend.speak(text, voiceSid(voiceId), speed);
  }

  async close(): Promise<void> {
    this.history.close();
    await this.backend.close?.();
  }

  private modelProgress(id: ModelId, loaded: boolean): WebModelProgress {
    const model = MODEL_CATALOG[id];
    const progress = this.config.fakeSpeech || this.backend instanceof FakeSpeechBackend
      ? {
          id,
          state: 'installed' as const,
          bytesDone: 1,
          bytesTotal: 1,
          installed: true,
        }
      : this.models.progress(id);
    return {
      ...progress,
      name: model.name,
      kind: model.kind,
      loaded,
    };
  }

  private cleanupPaths(enabled: boolean): SttCleanup | undefined {
    if (!enabled) return undefined;
    const vad = this.cleanup.path('vad');
    const denoiser = this.cleanup.path('denoiser');
    if (!vad && !denoiser) return undefined;
    return { ...(vad ? { vad } : {}), ...(denoiser ? { denoiser } : {}) };
  }

  private async prepare(id: ModelId, kind: 'stt' | 'tts'): Promise<void> {
    this.message = undefined;
    await this.models.ensure(id);
    const dir = this.models.directory(id);
    if (kind === 'stt') await this.backend.loadStt(id, dir, this.config.threads);
    else await this.backend.loadTts(id, dir, this.config.threads);
  }

  private ensureStt(): Promise<void> {
    const id = this.settings.get().sttModelId;
    if (this.backend.sttReady(id)) return Promise.resolve();
    this.sttLoading ??= this.prepare(id, 'stt').finally(() => {
      this.sttLoading = null;
    });
    return this.sttLoading;
  }

  private ensureTts(): Promise<void> {
    const id = this.settings.get().ttsModelId;
    if (this.backend.ttsReady(id)) return Promise.resolve();
    this.ttsLoading ??= this.prepare(id, 'tts').finally(() => {
      this.ttsLoading = null;
    });
    return this.ttsLoading;
  }

  private session(id: string): LiveSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error('This dictation session is no longer active');
    return session;
  }

  private sweepSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.startedAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }

  private async appendPassage(
    session: LiveSession,
    samples: Float32Array,
    sampleRate: number,
    cut: PassageCut,
  ): Promise<void> {
    await this.ensureStt();
    const settings = this.settings.get();
    const result = await this.backend.transcribe(
      samples,
      sampleRate,
      this.cleanupPaths(settings.speechCleanup),
    );
    session.inferenceMs += result.inferenceMs;
    session.text = joinPassage(session.text, session.lastCut, applyReplacements(result.text, []), {
      cut,
      pauseBeforeMs: 0,
      overlapMs: 0,
    }, true);
    session.lastCut = cut;
  }
}

function takePending(session: LiveSession): Float32Array {
  const out = new Float32Array(session.pendingLength);
  let offset = 0;
  for (const chunk of session.pending) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  session.pending = [];
  session.pendingLength = 0;
  return out;
}
