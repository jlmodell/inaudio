import { z } from 'zod';

export const COMPANION_STATES = [
  'idle',
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
]);
export type CompanionPosition = z.infer<typeof companionPositionSchema>;
export const companionMotionSchema = z.enum(['full', 'reduced', 'off']);
export const companionPersonalitySchema = z.enum(['calm', 'playful', 'curious', 'energetic', 'sleepy', 'quiet']);
export type CompanionPersonality = z.infer<typeof companionPersonalitySchema>;

export const COMPANION_IDS = ['lumen', 'moss', 'alain', 'bean', 'nimbus', 'drip', 'nova', 'ember'] as const;
export type CompanionId = (typeof COMPANION_IDS)[number];

/**
 * A built-in Blobatar. `seed` is the name the face is hashed from; `shape` pins the
 * silhouette as a 0–1 position in blobatar's shape bands (styles/blob.ts):
 * round <.22, organic <.48, boxy <.60, capsule <.70, nub <.79, cloud <.86,
 * droplet <.915, hexagon <.95, sun <.98, triangle <1.
 */
export interface CompanionDefinition {
  id: CompanionId;
  displayName: string;
  description: string;
  seed: string;
  shape: number;
  /** Body hue in degrees. Omitted means the seed picks the colour. */
  hue?: number;
}

export const COMPANIONS: readonly CompanionDefinition[] = [
  { id: 'lumen', displayName: 'Lumen', description: 'Round and steady. Stays close while you read.', seed: 'lumen', shape: 0.11, hue: 215 },
  { id: 'moss', displayName: 'Moss', description: 'A lopsided pebble for quiet focus.', seed: 'moss', shape: 0.35, hue: 145 },
  { id: 'alain', displayName: 'Alain', description: 'Boxy and a little stubborn about getting every word.', seed: 'alain00', shape: 0.54 },
  { id: 'bean', displayName: 'Bean', description: 'A capsule that perks up when reading starts.', seed: 'bean', shape: 0.65, hue: 28 },
  { id: 'nimbus', displayName: 'Nimbus', description: 'A soft cloud that drifts above your work.', seed: 'nimbus', shape: 0.825, hue: 200 },
  { id: 'drip', displayName: 'Drip', description: 'A droplet that watches each line land.', seed: 'drip', shape: 0.8875, hue: 185 },
  { id: 'nova', displayName: 'Nova', description: 'A hexagon that notices every change.', seed: 'nova', shape: 0.9325, hue: 265 },
  { id: 'ember', displayName: 'Ember', description: 'A small sun that celebrates each finished thought.', seed: 'ember', shape: 0.965, hue: 40 },
];

/** Where the companion's eyes should point, in its own window's client coordinates. */
export type CompanionGaze = { x: number; y: number } | 'rest' | null;

export interface CompanionSnapshot {
  companion: CompanionDefinition;
  settings: CompanionSettings;
  state: CompanionState;
  event?: CompanionEvent;
  revision: number;
}

export function companionBubbleText(state: CompanionState): string {
  if (state === 'speaking') return 'Speaking…';
  if (state === 'thinking') return 'Thinking…';
  if (state === 'error') return 'Needs attention';
  if (state === 'model-unavailable') return 'Model needed';
  if (state === 'attention') return 'I’m here';
  if (state === 'sleeping') return 'Taking a pause';
  return 'Ready';
}

const reactionsSchema = z.record(z.enum(COMPANION_EVENTS), z.boolean());

export const companionSettingsSchema = z.object({
  activeId: z.enum(COMPANION_IDS),
  visible: z.boolean(),
  scale: z.number().min(0.5).max(2),
  position: companionPositionSchema,
  edgeMargin: z.number().int().min(24).max(160),
  keepAwayFromText: z.boolean(),
  showBubble: z.boolean(),
  motion: companionMotionSchema,
  clickThrough: z.boolean(),
  idleSleepMinutes: z.number().int().min(1).max(120),
  personality: companionPersonalitySchema,
  voiceEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  eyesFollow: z.boolean(),
  color: z.enum(['own', 'accent', 'custom']),
  hue: z.number().int().min(0).max(359),
  idleMoods: z.boolean(),
  backdrop: z.enum(['none', 'circle', 'squircle']),
  /** Which application events the companion reacts to. */
  reactions: reactionsSchema,
});
export type CompanionSettings = z.infer<typeof companionSettingsSchema>;

/** A settings patch may name any subset of reactions. */
export const companionSettingsPatchSchema = companionSettingsSchema
  .extend({ reactions: z.partialRecord(z.enum(COMPANION_EVENTS), z.boolean()) })
  .partial()
  .strict();

export const DEFAULT_COMPANION_REACTIONS = Object.fromEntries(
  COMPANION_EVENTS.map((event) => [event, true]),
) as Record<CompanionEvent, boolean>;

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  activeId: 'lumen',
  visible: true,
  scale: 1,
  position: 'bottom-right',
  edgeMargin: 56,
  keepAwayFromText: true,
  showBubble: true,
  motion: 'full',
  clickThrough: true,
  idleSleepMinutes: 20,
  personality: 'calm',
  voiceEnabled: false,
  soundEnabled: false,
  soundVolume: 0.5,
  eyesFollow: true,
  color: 'own',
  hue: 215,
  idleMoods: true,
  backdrop: 'none',
  reactions: DEFAULT_COMPANION_REACTIONS,
};

/**
 * Rewrites companion settings saved before Blobatar: `bubble` became `showBubble`, and each
 * reaction was `{ enabled, state }` before it became a boolean. Anything else is passed on
 * for field-by-field validation.
 */
export function migrateLegacyCompanion(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  if (!('showBubble' in raw) && typeof raw.bubble === 'string') next.showBubble = raw.bubble !== 'hidden';
  delete next.bubble;
  const reactions: Record<string, boolean> = { ...DEFAULT_COMPANION_REACTIONS };
  if (raw.reactions && typeof raw.reactions === 'object' && !Array.isArray(raw.reactions)) {
    for (const event of COMPANION_EVENTS) {
      const value: unknown = (raw.reactions as Record<string, unknown>)[event];
      if (typeof value === 'boolean') reactions[event] = value;
      else if (value && typeof value === 'object' && typeof (value as { enabled?: unknown }).enabled === 'boolean') {
        reactions[event] = (value as { enabled: boolean }).enabled;
      }
    }
  }
  next.reactions = reactions;
  return next;
}
