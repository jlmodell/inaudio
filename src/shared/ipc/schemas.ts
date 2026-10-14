import { z } from 'zod';
import { modelIdSchema, voiceIdSchema } from '../domain/models';
import { historyQuerySchema, MAX_TRANSCRIPT_CHARS } from '../domain/history';
import { deviceIdSchema, settingsPatchSchema } from '../domain/settings';
import { COMPANION_IDS } from '../domain/companion';
import type { AppMenuCommand, WindowAction } from '../domain/system';

/** 16 kHz mono float32 for at most 10 minutes. */
export const MAX_AUDIO_SAMPLES = 16_000 * 60 * 10;
export const MAX_TTS_CHARS = 5_000;
/** Matches MAX_RECORDING_MS in the capture store, with slack for clock drift. */
const MAX_RECORDING_MS = 11 * 60 * 1000;
export const MAX_STATE_MESSAGE_CHARS = 200;
/** A device label is shown verbatim in a native menu, so its length is capped. */
export const MAX_DEVICE_LABEL_CHARS = 200;
export const MAX_AUDIO_DEVICES = 64;

export const EXTERNAL_LINKS = {
  parakeetV2: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2',
  parakeetV3: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3',
  nemotron: 'https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b',
  kokoro: 'https://huggingface.co/hexgrad/Kokoro-82M',
  sherpaOnnx: 'https://github.com/k2-fsa/sherpa-onnx',
} as const;
export type ExternalLinkId = keyof typeof EXTERNAL_LINKS;

export const schemas = {
  openLink: z.enum(Object.keys(EXTERNAL_LINKS) as [ExternalLinkId, ...ExternalLinkId[]]),
  settingsPatch: settingsPatchSchema,
  modelId: modelIdSchema,
  transcribe: z.object({
    samples: z
      .instanceof(Float32Array)
      .refine((a) => a.length > 0 && a.length <= MAX_AUDIO_SAMPLES, 'Audio length out of range'),
    sampleRate: z.literal(16000),
    insert: z.boolean(),
  }),
  dictationState: z.object({
    phase: z.enum(['idle', 'listening', 'transcribing', 'inserting', 'error']),
    startedAt: z
      .number()
      .int()
      .min(0)
      .refine((at) => at === 0 || Math.abs(Date.now() - at) <= MAX_RECORDING_MS, 'Stale timestamp'),
    level: z.number().min(0).max(1),
    message: z.string().max(MAX_STATE_MESSAGE_CHARS),
  }),
  audioDevices: z
    .array(
      z.object({
        id: deviceIdSchema,
        label: z.string().max(MAX_DEVICE_LABEL_CHARS),
      }),
    )
    .max(MAX_AUDIO_DEVICES),
  /**
   * A discriminated union rather than a bare enum: the two selecting actions carry the id
   * they want, and the main process only honours one it is already offering in the state
   * it pushed. The overlay can never name a device or model of its own invention.
   */
  overlayAction: z.discriminatedUnion('type', [
    z.object({ type: z.enum(['start', 'stop', 'cancel', 'hide', 'open-app', 'open-audio']) }),
    z.object({ type: z.literal('select-microphone'), id: deviceIdSchema }),
    z.object({ type: z.literal('select-model'), id: modelIdSchema }),
  ]),
  overlayHover: z.boolean(),
  overlayMenu: z.boolean(),
  text: z.string().min(1).max(MAX_TRANSCRIPT_CHARS),
  speak: z.object({
    text: z.string().trim().min(1).max(MAX_TTS_CHARS),
    voiceId: voiceIdSchema.optional(),
    speed: z.number().min(0.5).max(2).optional(),
  }),
  historyQuery: historyQuerySchema,
  historyId: z.string().uuid(),
  windowAction: z.enum(['minimize', 'maximize-toggle', 'close'] as [
    WindowAction,
    ...WindowAction[],
  ]),
  menuCommand: z.enum([
    'file.open-models-folder',
    'file.run-setup',
    'file.quit',
    'view.dictation',
    'view.history',
    'view.read-aloud',
    'view.models',
    'view.audio',
    'view.settings',
    'view.companion',
  ] as [AppMenuCommand, ...AppMenuCommand[]]),
  companionId: z.enum(COMPANION_IDS),
  companionVisibility: z.boolean(),
  companionHover: z.boolean(),
};
