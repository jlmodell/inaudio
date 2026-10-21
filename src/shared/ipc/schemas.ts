import { z } from 'zod';
import { modelIdSchema, voiceIdSchema } from '../domain/models';
import { settingsPatchSchema } from '../domain/settings';
import { COMPANION_IDS } from '../domain/companion';
import { MAX_READ_ALOUD_CHARS } from '../domain/read-aloud';
import type { AppMenuCommand, WindowAction } from '../domain/system';

export const MAX_TTS_CHARS = 5_000;
export const MAX_STATE_MESSAGE_CHARS = 200;

export const EXTERNAL_LINKS = {
  kokoro: 'https://huggingface.co/hexgrad/Kokoro-82M',
  sherpaOnnx: 'https://github.com/k2-fsa/sherpa-onnx',
  releases: 'https://github.com/shikki841/inaudio/releases',
} as const;
export type ExternalLinkId = keyof typeof EXTERNAL_LINKS;

export const schemas = {
  openLink: z.enum(Object.keys(EXTERNAL_LINKS) as [ExternalLinkId, ...ExternalLinkId[]]),
  settingsPatch: settingsPatchSchema,
  modelId: modelIdSchema,
  text: z.string().min(1).max(MAX_READ_ALOUD_CHARS),
  speak: z.object({
    text: z.string().trim().min(1).max(MAX_TTS_CHARS),
    voiceId: voiceIdSchema.optional(),
    speed: z.number().min(0.5).max(3).optional(),
  }),
  readAloudStart: z.discriminatedUnion('source', [
    z.object({ source: z.enum(['selection', 'clipboard']) }).strict(),
    z.object({ source: z.literal('manual'), text: z.string().min(1).max(MAX_READ_ALOUD_CHARS) }).strict(),
  ]),
  readAloudControl: z.discriminatedUnion('action', [
    z.object({ sessionId: z.string().uuid(), action: z.enum(['pause', 'resume', 'stop', 'replay']) }).strict(),
    z.object({ sessionId: z.string().uuid(), action: z.literal('seek'), index: z.number().int().min(0) }).strict(),
  ]),
  readAloudReport: z.discriminatedUnion('type', [
    z
      .object({
        sessionId: z.string().uuid(),
        type: z.literal('ended'),
        index: z.number().int().min(0),
        seek: z.number().int().min(0),
      })
      .strict(),
    z
      .object({
        sessionId: z.string().uuid(),
        type: z.literal('error'),
        message: z.string().max(MAX_STATE_MESSAGE_CHARS),
      })
      .strict(),
  ]),
  releaseNotes: z.object({ force: z.boolean() }).strict(),
  windowAction: z.enum(['minimize', 'maximize-toggle', 'close'] as [WindowAction, ...WindowAction[]]),
  menuCommand: z.enum([
    'file.open-models-folder',
    'file.run-setup',
    'file.quit',
    'view.read-aloud',
    'view.models',
    'view.settings',
    'view.companion',
  ] as [AppMenuCommand, ...AppMenuCommand[]]),
  companionId: z.enum(COMPANION_IDS),
  companionVisibility: z.boolean(),
  companionHover: z.boolean(),
};
