import { MODEL_CATALOG, voiceSid, type ModelId } from '@shared/domain/models';
import { MAX_READ_ALOUD_CHARS } from '@shared/domain/read-aloud';
import { normalizeText, segmentText, type TextSegment } from '@shared/read-aloud/segment';
import type { TtsResult } from '@shared/worker/protocol';
import type { WebModelProgress, WebStatus } from '@shared/web/api';
import { BrowserTtsStore } from './browser-tts';
import type { WebConfig } from './config';
import { NodeInferenceHost } from './inference-host';
import { downloadProgressBucket, formatModelProgress, log } from './log';
import { ModelStore, type ModelProgress } from './model-store';
import { defaultSettings, SettingsStore } from './settings';

export interface SpeechBackend {
  speak(text: string, sid: number, speed: number): Promise<TtsResult>;
  loadTts(modelId: ModelId, dir: string, threads: number): Promise<void>;
  ttsReady(modelId: ModelId): boolean;
  close?(): Promise<void>;
}

class HostBackend implements SpeechBackend {
  constructor(private readonly host: NodeInferenceHost) {}

  speak(text: string, sid: number, speed: number): Promise<TtsResult> {
    return this.host.speak(text, sid, speed);
  }

  async loadTts(modelId: ModelId, dir: string, threads: number): Promise<void> {
    const layout = MODEL_CATALOG[modelId].layout;
    if (layout.kind !== 'tts') throw new Error('Not a text-to-speech model');
    await this.host.loadTts({ type: 'tts:load', modelId, dir, layout, threads });
  }

  ttsReady(modelId: ModelId): boolean {
    return this.host.isLoaded(modelId);
  }

  close(): Promise<void> {
    return this.host.stop();
  }
}

/** Deterministic stand-in so HTTP tests can run without downloading 300 MB models. */
export class FakeSpeechBackend implements SpeechBackend {
  private tts?: ModelId;

  async speak(): Promise<TtsResult> {
    const sampleRate = 16_000;
    const samples = new Float32Array(sampleRate / 10);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    return { samples, sampleRate, inferenceMs: 1 };
  }

  async loadTts(modelId: ModelId): Promise<void> {
    this.tts = modelId;
  }

  ttsReady(modelId: ModelId): boolean {
    return this.tts === modelId;
  }
}

export class SpeechService {
  readonly settings: SettingsStore;
  readonly models: ModelStore;
  readonly browserTts: BrowserTtsStore;
  private readonly backend: SpeechBackend;
  private readonly loadError: Partial<Record<'tts', string>> = {};
  private readonly downloadBucket = new Map<ModelId, number>();
  private ttsLoading: Promise<void> | null = null;
  private message?: string;

  constructor(
    private readonly config: WebConfig,
    backend?: SpeechBackend,
  ) {
    this.settings = new SettingsStore(config.paths.settings, defaultSettings(config.ttsModelId));
    this.models = new ModelStore(config.paths.models, config.paths.downloads);
    this.browserTts = new BrowserTtsStore(
      config.paths.browserTts,
      config.downloadModels && !config.fakeSpeech,
    );
    this.backend = backend ?? (config.fakeSpeech ? new FakeSpeechBackend() : new HostBackend(new NodeInferenceHost()));
    this.models.on('progress', (progress) => this.logModelProgress(progress));
  }

  async start(): Promise<void> {
    const ttsId = this.settings.get().ttsModelId;
    log.info(`Speech model: ${MODEL_CATALOG[ttsId].name} (TTS)`);
    if (this.config.fakeSpeech || this.backend instanceof FakeSpeechBackend) {
      await this.backend.loadTts(ttsId, '', this.config.threads);
      log.info('Fake speech engine is ready (INAUDIO_FAKE_SPEECH=1).');
      return;
    }
    void this.browserTts.ensure().catch((error) => {
      log.error('On-device voice is not ready; browsers can still use the built-in voice', error);
    });
    log.info(`Looking for models in ${this.config.paths.models}`);
    await this.models.discover(ttsId);
    await this.startModel(ttsId).catch((error) => {
      this.message = error instanceof Error ? error.message : String(error);
    });
  }

  private startModel(id: ModelId): Promise<void> {
    if (!this.models.isInstalled(id) && !this.config.downloadModels) {
      log.info(
        `${MODEL_CATALOG[id].name} is not installed. Download it into ${this.config.paths.models} or set INAUDIO_DOWNLOAD_MODELS=1.`,
      );
      return Promise.resolve();
    }
    return this.ensureTts();
  }

  status(authenticated: boolean): WebStatus {
    const settings = this.settings.get();
    return {
      ready: this.backend.ttsReady(settings.ttsModelId),
      authRequired: Boolean(this.config.password),
      authenticated,
      tts: this.modelProgress(settings.ttsModelId, this.backend.ttsReady(settings.ttsModelId)),
      browserTts: this.browserTts.status(),
      ...(this.message ? { message: this.message } : {}),
    };
  }

  async speak(text: string, voiceId: string, speed: number): Promise<TtsResult> {
    await this.ensureTts();
    return this.backend.speak(text, voiceSid(voiceId), speed);
  }

  planSpeak(text: string): TextSegment[] {
    return segmentText(normalizeText(text.slice(0, MAX_READ_ALOUD_CHARS)));
  }

  async *speakSegments(
    text: string,
    voiceId: string,
    speed: number,
  ): AsyncGenerator<{
    index: number;
    count: number;
    text: string;
    samples: Float32Array;
    sampleRate: number;
    inferenceMs: number;
    generateMs: number;
  }> {
    yield* this.speakPrepared(this.planSpeak(text), voiceId, speed);
  }

  async *speakPrepared(
    segments: TextSegment[],
    voiceId: string,
    speed: number,
  ): AsyncGenerator<{
    index: number;
    count: number;
    text: string;
    samples: Float32Array;
    sampleRate: number;
    inferenceMs: number;
    generateMs: number;
  }> {
    if (!segments.length) return;
    const ensureStarted = Date.now();
    await this.ensureTts();
    const ensureMs = Date.now() - ensureStarted;
    if (ensureMs > 20) log.info(`TTS was not ready; waited ${ensureMs}ms to load`);
    const sid = voiceSid(voiceId);
    log.info(`Reading aloud: ${segments.length} segment${segments.length === 1 ? '' : 's'}`);
    for (const [index, segment] of segments.entries()) {
      const started = Date.now();
      const spoken = await this.backend.speak(segment.text, sid, speed);
      const ms = Date.now() - started;
      log.info(
        `Segment ${index + 1}/${segments.length}: ${segment.text.length} chars in ${ms}ms (engine ${spoken.inferenceMs}ms)`,
      );
      yield {
        index,
        count: segments.length,
        text: segment.text,
        samples: spoken.samples,
        sampleRate: spoken.sampleRate,
        inferenceMs: spoken.inferenceMs,
        generateMs: ms,
      };
    }
  }

  async close(): Promise<void> {
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
      kind: 'tts',
      loaded,
      ...(this.loadError.tts ? { error: this.loadError.tts } : {}),
    };
  }

  private async prepare(id: ModelId): Promise<void> {
    const name = MODEL_CATALOG[id].name;
    this.message = undefined;
    log.info(`Preparing ${name} (tts)`);
    try {
      await this.models.ensure(id);
      const dir = this.models.directory(id);
      log.info(`Loading ${name} from ${dir}`);
      const loadStarted = Date.now();
      await this.backend.loadTts(id, dir, this.config.threads);
      log.info(`Loaded ${name} in ${Date.now() - loadStarted}ms`);
      const warmStarted = Date.now();
      await this.backend.speak('Hi.', voiceSid(this.settings.get().voiceId), 1);
      log.info(`Warmed ${name} in ${Date.now() - warmStarted}ms`);
      delete this.loadError.tts;
    } catch (error) {
      this.loadError.tts = error instanceof Error ? error.message : String(error);
      log.error(`Failed to load ${name}`, error);
      throw error;
    }
  }

  private logModelProgress(progress: ModelProgress): void {
    if (progress.state === 'downloading') {
      const bucket = downloadProgressBucket(progress);
      if (this.downloadBucket.get(progress.id) === bucket && bucket < 10) return;
      this.downloadBucket.set(progress.id, bucket);
    }
    const line = formatModelProgress(MODEL_CATALOG[progress.id]?.name ?? progress.id, progress);
    if (!line) return;
    if (progress.state === 'error') log.error(line);
    else log.info(line);
  }

  private ensureTts(): Promise<void> {
    const id = this.settings.get().ttsModelId;
    if (this.backend.ttsReady(id)) return Promise.resolve();
    this.ttsLoading ??= this.prepare(id).finally(() => {
      this.ttsLoading = null;
    });
    return this.ttsLoading;
  }
}
