import { z } from 'zod';
import { modelIdSchema, voiceIdSchema } from '../domain/models';
import { CHUNK_CUTS, LIVE_MAX_CHUNK_SAMPLES, liveSourceSchema } from '../domain/capture';
import {
  EXPORT_FORMATS,
  HISTORY_KINDS,
  historyQuerySchema,
  historyUpdateSchema,
  MAX_EXPORT_ITEMS,
  MAX_SESSION_TRANSCRIPT_CHARS,
} from '../domain/history';
import { deviceIdSchema, settingsPatchSchema } from '../domain/settings';
import { COMPANION_IDS } from '../domain/companion';
import { MAX_READ_ALOUD_CHARS } from '../domain/read-aloud';
import type { AppMenuCommand, LiveWindowAction, WindowAction } from '../domain/system';

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
    z.object({
      type: z.enum([
        'start',
        'stop',
        'cancel',
        'hide',
        'open-app',
        'open-audio',
        'read-pause',
        'read-resume',
        'read-stop',
        'live-stop',
        'live-cancel',
        'live-window',
        'open-latest',
        'open-history',
        'reset-position',
      ]),
    }),
    z.object({ type: z.literal('select-microphone'), id: deviceIdSchema }),
    z.object({ type: z.literal('select-model'), id: modelIdSchema }),
  ]),
  overlayHover: z.boolean(),
  // Pointer positions in screen DIPs while the pill is dragged by its handle.
  overlayDrag: z
    .object({
      phase: z.enum(['start', 'move', 'end']),
      x: z.number().int().min(-100_000).max(100_000),
      y: z.number().int().min(-100_000).max(100_000),
    })
    .strict(),
  liveWindowResize: z
    .object({
      phase: z.enum(['start', 'move', 'end']),
      edge: z.enum(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']),
      x: z.number().int().min(-100_000).max(100_000),
      y: z.number().int().min(-100_000).max(100_000),
    })
    .strict(),
  overlayMenu: z.boolean(),
  // A saved live session can be copied or typed from History, so this takes the session cap.
  text: z.string().min(1).max(MAX_SESSION_TRANSCRIPT_CHARS),
  liveStart: z.object({ source: liveSourceSchema, acknowledged: z.boolean() }).strict(),
  liveChunk: z
    .object({
      sessionId: z.string().uuid(),
      seq: z.number().int().min(0).max(1_000_000),
      samples: z
        .instanceof(Float32Array)
        .refine((a) => a.length > 0 && a.length <= LIVE_MAX_CHUNK_SAMPLES, 'Chunk length out of range'),
      cut: z.enum(CHUNK_CUTS),
      pauseBeforeMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
      overlapMs: z.number().int().min(0).max(5_000),
    })
    .strict(),
  // The same shape as a chunk: it is the unfinished stretch the next chunk will hold.
  livePreview: z
    .object({
      sessionId: z.string().uuid(),
      seq: z.number().int().min(0).max(1_000_000),
      samples: z
        .instanceof(Float32Array)
        .refine((a) => a.length > 0 && a.length <= LIVE_MAX_CHUNK_SAMPLES, 'Preview length out of range'),
    })
    .strict(),
  liveWindowAction: z.enum([
    'start',
    'stop',
    'cancel',
    'copy',
    'open-app',
    'open-audio',
    'hide',
    'pin',
    'collapse',
    'expand',
    'source-system',
    'source-system+mic',
    'source-device',
  ] as [LiveWindowAction, ...LiveWindowAction[]]),
  liveReport: z.discriminatedUnion('type', [
    z.object({ type: z.literal('capturing'), sessionId: z.string().uuid(), ownAudioFiltered: z.boolean() }).strict(),
    z.object({ type: z.literal('level'), sessionId: z.string().uuid(), level: z.number().min(0).max(1) }).strict(),
    z
      .object({ type: z.literal('ended'), sessionId: z.string().uuid(), reason: z.enum(['stopped', 'track-ended']) })
      .strict(),
    z
      .object({ type: z.literal('error'), sessionId: z.string().uuid(), message: z.string().max(MAX_STATE_MESSAGE_CHARS) })
      .strict(),
  ]),
  speak: z.object({
    text: z.string().trim().min(1).max(MAX_TTS_CHARS),
    voiceId: voiceIdSchema.optional(),
    speed: z.number().min(0.5).max(2).optional(),
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
      .object({ sessionId: z.string().uuid(), type: z.literal('error'), message: z.string().max(MAX_STATE_MESSAGE_CHARS) })
      .strict(),
  ]),
  historyQuery: historyQuerySchema,
  historyId: z.string().uuid(),
  historyUpdate: z.object({ id: z.string().uuid(), patch: historyUpdateSchema }).strict(),
  // Ids, or a whole view. Never a path: the user picks the file in the native save dialog.
  historyExport: z
    .object({
      ids: z.array(z.string().uuid()).min(1).max(MAX_EXPORT_ITEMS).optional(),
      kind: z.enum(HISTORY_KINDS).default('all'),
      format: z.enum(EXPORT_FORMATS),
    })
    .strict(),
  windowAction: z.enum(['minimize', 'maximize-toggle', 'close'] as [
    WindowAction,
    ...WindowAction[],
  ]),
  menuCommand: z.enum([
    'file.open-models-folder',
    'file.run-setup',
    'file.quit',
    'view.dictation',
    'view.live',
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
