import fs from 'node:fs';
import { z } from 'zod';
import { sttModelIdSchema, ttsModelIdSchema, voiceIdSchema, type ModelId } from '@shared/domain/models';
import { clampAhead, DEFAULT_READ_ALOUD_BUFFER } from '@shared/read-aloud/ahead';
import {
  DEFAULT_READ_ALOUD_ENGINE,
  MAX_READ_SPEED,
  MIN_READ_SPEED,
  READ_ALOUD_ENGINES,
} from '@shared/web/read-aloud-engine';
import type { WebSettings, WebSettingsPatch } from '@shared/web/api';

const schema = z.object({
  sttModelId: sttModelIdSchema,
  ttsModelId: ttsModelIdSchema,
  voiceId: voiceIdSchema,
  speed: z.number().min(MIN_READ_SPEED).max(MAX_READ_SPEED),
  saveHistory: z.boolean(),
  speechCleanup: z.boolean(),
  readAloudEngine: z.enum(READ_ALOUD_ENGINES),
  speedReading: z.boolean(),
  readAloudBuffer: z.number().transform((value) => clampAhead(value)),
});

const patchSchema = schema.partial().strict();

export function defaultSettings(sttModelId: ModelId, ttsModelId: ModelId): WebSettings {
  return {
    sttModelId,
    ttsModelId,
    voiceId: '00',
    speed: 1,
    saveHistory: true,
    speechCleanup: false,
    readAloudEngine: DEFAULT_READ_ALOUD_ENGINE,
    speedReading: false,
    readAloudBuffer: DEFAULT_READ_ALOUD_BUFFER,
  };
}

export class SettingsStore {
  private value: WebSettings;

  constructor(
    private readonly file: string,
    defaults: WebSettings,
  ) {
    this.value = this.read(defaults);
  }

  get(): WebSettings {
    return this.value;
  }

  update(patch: WebSettingsPatch): WebSettings {
    const next = schema.parse({ ...this.value, ...patchSchema.parse(patch) }) as WebSettings;
    this.value = next;
    this.write();
    return next;
  }

  private read(defaults: WebSettings): WebSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      const parsed = schema.safeParse({ ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) });
      return parsed.success ? (parsed.data as WebSettings) : defaults;
    } catch {
      return defaults;
    }
  }

  private write(): void {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.value), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
