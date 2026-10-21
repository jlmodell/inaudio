import fs from 'node:fs';
import { z } from 'zod';
import { sttModelIdSchema, ttsModelIdSchema, voiceIdSchema, type ModelId } from '@shared/domain/models';
import type { WebSettings, WebSettingsPatch } from '@shared/web/api';

const schema = z.object({
  sttModelId: sttModelIdSchema,
  ttsModelId: ttsModelIdSchema,
  voiceId: voiceIdSchema,
  speed: z.number().min(0.5).max(2),
  saveHistory: z.boolean(),
  speechCleanup: z.boolean(),
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
