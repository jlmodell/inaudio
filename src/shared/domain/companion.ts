import { z } from 'zod';

export const COMPANION_STATES = [
  'idle',
  'listening',
  'transcribing',
  'speaking',
  'thinking',
  'ready',
  'error',
  'model-unavailable',
  'sleeping',
  'attention',
] as const;
export type CompanionState = (typeof COMPANION_STATES)[number];

export const COMPANION_EVENTS = [
  'dictation.started',
  'dictation.stopped',
  'transcription.completed',
  'tts.started',
  'tts.completed',
  'model.loading',
  'model.loaded',
  'model.missing',
  'app.idle',
  'app.error',
  'companion.clicked',
  'system.resume',
] as const;
export type CompanionEvent = (typeof COMPANION_EVENTS)[number];

export const companionPositionSchema = z.enum([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'near-microphone',
  'focus-area',
]);
export type CompanionPosition = z.infer<typeof companionPositionSchema>;
export const companionMotionSchema = z.enum(['full', 'reduced', 'off']);
export const companionBubbleSchema = z.enum(['auto', 'above', 'hidden']);

export const companionPackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  displayName: z.string().min(1).max(80),
  description: z.string().max(400),
  spritesheetPath: z.string().max(256),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  animation: z.object({
    frameDurationMs: z.number().int().min(40).max(1000),
    stateRows: z.partialRecord(
      z.enum(COMPANION_STATES),
      z.object({
        row: z.number().int().min(0).max(31),
        frameCount: z.number().int().min(1).max(32),
      }),
    ),
  }),
  frameWidth: z.number().int().min(1).max(1024),
  frameHeight: z.number().int().min(1).max(1024),
  columns: z.number().int().min(1).max(32),
  rows: z.number().int().min(1).max(32),
  frameCount: z.number().int().min(1).max(256),
});
export type CompanionPackage = z.infer<typeof companionPackageSchema>;

export interface CompanionSnapshot {
  companion: CompanionPackage;
  settings: CompanionSettings;
  state: CompanionState;
  event?: CompanionEvent;
  revision: number;
  /** A recording or its transcription is in flight; spoken lines wait until it ends. */
  dictating: boolean;
}

export function companionBubbleText(state: CompanionState, focusArea = false): string {
  if (focusArea && state === 'transcribing') return 'I’m writing…';
  if (state === 'listening') return 'Listening…';
  if (state === 'transcribing') return 'Transcribing…';
  if (state === 'speaking') return 'Speaking…';
  if (state === 'thinking') return 'Thinking…';
  if (state === 'error') return 'Needs attention';
  if (state === 'model-unavailable') return 'Model needed';
  if (state === 'attention') return 'I’m here';
  if (state === 'sleeping') return 'Taking a pause';
  return 'Ready';
}

export const companionReactionSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(COMPANION_STATES),
});
export type CompanionReaction = z.infer<typeof companionReactionSchema>;

export const companionSettingsSchema = z.object({
  version: z.literal(1),
  activeId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  visible: z.boolean(),
  scale: z.number().min(0.5).max(2),
  position: companionPositionSchema,
  edgeMargin: z.number().int().min(24).max(160),
  keepAwayFromText: z.boolean(),
  bubble: companionBubbleSchema,
  motion: companionMotionSchema,
  clickThrough: z.boolean(),
  idleSleepMinutes: z.number().int().min(1).max(120),
  personality: z.enum(['calm', 'playful', 'curious', 'energetic', 'sleepy', 'quiet']),
  voiceEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  reactions: z.record(z.enum(COMPANION_EVENTS), companionReactionSchema),
});
export type CompanionSettings = z.infer<typeof companionSettingsSchema>;

export const BUILT_IN_COMPANIONS: CompanionPackage[] = [
  {
    id: 'lumen',
    displayName: 'Lumen',
    description: 'A warm little light that stays close to your voice workflow.',
    spritesheetPath: 'lumen.svg',
    animation: {
      frameDurationMs: 150,
      stateRows: {
        idle: { row: 0, frameCount: 4 },
        listening: { row: 1, frameCount: 4 },
        thinking: { row: 2, frameCount: 4 },
        speaking: { row: 3, frameCount: 4 },
      },
    },
    color: '#5b8cff',
    secondaryColor: '#b7d4ff',
    frameWidth: 96,
    frameHeight: 96,
    columns: 4,
    rows: 4,
    frameCount: 16,
  },
  {
    id: 'moss',
    displayName: 'Moss',
    description: 'A calm, leafy companion for quiet focus.',
    spritesheetPath: 'moss.svg',
    animation: {
      frameDurationMs: 160,
      stateRows: {
        idle: { row: 0, frameCount: 4 },
        listening: { row: 1, frameCount: 4 },
        thinking: { row: 2, frameCount: 4 },
        speaking: { row: 3, frameCount: 4 },
      },
    },
    color: '#58b889',
    secondaryColor: '#b9efd3',
    frameWidth: 96,
    frameHeight: 96,
    columns: 4,
    rows: 4,
    frameCount: 16,
  },
  {
    id: 'ember',
    displayName: 'Ember',
    description: 'A bright spark that celebrates each finished thought.',
    spritesheetPath: 'ember.svg',
    animation: {
      frameDurationMs: 110,
      stateRows: {
        idle: { row: 0, frameCount: 4 },
        listening: { row: 1, frameCount: 4 },
        thinking: { row: 2, frameCount: 4 },
        speaking: { row: 3, frameCount: 4 },
      },
    },
    color: '#f28b59',
    secondaryColor: '#ffd0ad',
    frameWidth: 96,
    frameHeight: 96,
    columns: 4,
    rows: 4,
    frameCount: 16,
  },
  {
    id: 'nova',
    displayName: 'Nova',
    description: 'A curious ring that notices each change in your voice workspace.',
    spritesheetPath: 'nova.svg',
    animation: {
      frameDurationMs: 140,
      stateRows: {
        idle: { row: 0, frameCount: 4 },
        listening: { row: 1, frameCount: 4 },
        thinking: { row: 2, frameCount: 4 },
        speaking: { row: 3, frameCount: 4 },
      },
    },
    color: '#8d6be8',
    secondaryColor: '#e2d7ff',
    frameWidth: 96,
    frameHeight: 96,
    columns: 4,
    rows: 4,
    frameCount: 16,
  },
];

export const DEFAULT_COMPANION_REACTIONS = Object.fromEntries(
  COMPANION_EVENTS.map((event) => [
    event,
    {
      enabled: true,
      state:
        event === 'dictation.started'
          ? 'listening'
          : event === 'model.loading'
            ? 'thinking'
            : event === 'model.missing'
              ? 'model-unavailable'
            : event === 'app.error'
              ? 'error'
              : event === 'companion.clicked'
                ? 'attention'
                : event === 'tts.started'
                  ? 'speaking'
                  : 'ready',
    },
  ]),
) as Record<CompanionEvent, CompanionReaction>;

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  version: 1,
  activeId: BUILT_IN_COMPANIONS[0]?.id ?? 'lumen',
  visible: true,
  scale: 1,
  position: 'bottom-right',
  edgeMargin: 56,
  keepAwayFromText: true,
  bubble: 'auto',
  motion: 'full',
  clickThrough: true,
  idleSleepMinutes: 20,
  personality: 'calm',
  voiceEnabled: false,
  soundEnabled: false,
  soundVolume: 0.5,
  reactions: DEFAULT_COMPANION_REACTIONS,
};
