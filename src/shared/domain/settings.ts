import { z } from 'zod';
import { ttsModelIdSchema, voiceIdSchema } from './models';
import {
  DEFAULT_COMPANION_SETTINGS,
  companionSettingsPatchSchema,
  companionSettingsSchema,
  migrateLegacyCompanion,
} from './companion';

/** Accelerator tokens Electron accepts, split into modifiers and keys. */
const MODIFIER_TOKENS = [
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
] as const;

const NAMED_KEY_TOKENS = [
  'Plus',
  'Space',
  'Tab',
  'Capslock',
  'Numlock',
  'Scrolllock',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'PrintScreen',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'MediaPlayPause',
  'numdec',
  'numadd',
  'numsub',
  'nummult',
  'numdiv',
] as const;

const MODIFIERS = new Set<string>(MODIFIER_TOKENS);
const KEYS = new Set<string>([
  ...NAMED_KEY_TOKENS,
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `num${i}`),
  ...'0123456789',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  // Punctuation Electron names literally. A literal "+" is written "Plus".
  ...'~!@#$%^&*()_-=[]{}\\|;:\'",<.>/?`',
]);

/**
 * True for an accelerator built from known tokens only: distinct modifiers followed by
 * exactly one key. Everything else is refused before it reaches globalShortcut.register.
 */
export function isAccelerator(value: string): boolean {
  const parts = value.split('+');
  if (parts.length > 5) return false;
  const key = parts[parts.length - 1];
  if (!key || !KEYS.has(key)) return false;
  const seen = new Set<string>();
  for (const part of parts.slice(0, -1)) {
    if (!MODIFIERS.has(part) || seen.has(part)) return false;
    seen.add(part);
  }
  return true;
}

/** Electron accelerator, e.g. "CommandOrControl+Shift+Space". */
export const acceleratorSchema = z
  .string()
  .max(64)
  .refine(isAccelerator, 'Use modifiers joined with "+" and one key');

/** An accelerator, or "" when the shortcut is turned off. */
export const optionalAcceleratorSchema = z.union([z.literal(''), acceleratorSchema]);

/** Accent tones the stylesheet defines, in the order they are offered. */
export const ACCENT_TONES = ['blue', 'violet', 'green', 'amber', 'rose'] as const;
export const accentToneSchema = z.enum(ACCENT_TONES);
export type AccentTone = z.infer<typeof accentToneSchema>;

/**
 * A MediaDeviceInfo.deviceId. Chromium emits a hashed token, so the charset is pinned to
 * what a hash or a base64url id can hold and nothing else ever reaches disk or a menu.
 */
export const deviceIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9+/=_-]+$/, 'Not a device identifier');

export const settingsSchema = z.object({
  version: z.literal(1),
  onboardingComplete: z.boolean(),
  appearance: z.object({
    theme: z.enum(['system', 'light', 'dark']),
    sidebarCollapsed: z.boolean(),
    fontSize: z.enum(['sm', 'md', 'lg']),
    fontFamily: z.enum(['inter', 'system']),
    animations: z.enum(['full', 'reduced', 'off']),
    contentWidth: z.enum(['compact', 'default', 'wide']),
    accentTone: accentToneSchema,
  }),
  audio: z.object({
    outputDeviceId: deviceIdSchema,
  }),
  tts: z.object({
    modelId: ttsModelIdSchema,
    voiceId: voiceIdSchema,
    speed: z.number().min(0.5).max(3),
    /** Reads the selection in the focused app; pressed again while reading, it stops. */
    shortcut: acceleratorSchema,
    pauseShortcut: optionalAcceleratorSchema,
    stopShortcut: optionalAcceleratorSchema,
    volume: z.number().min(0).max(1),
    /** Ask the focused app for its selection through the OS accessibility API first. */
    useAccessibility: z.boolean(),
    /** Fall back to sending Copy and reading the clipboard when that gives nothing. */
    copyFallback: z.boolean(),
    /** Put back what was on the clipboard after a copy fallback. */
    restoreClipboard: z.boolean(),
    /** Highlight the sentence being read in the Read Aloud preview. */
    followAlong: z.boolean(),
    /** Show one word at a time, timed to the sentence that is playing. */
    speedReading: z.boolean(),
    /** Sentences to generate before playback starts, then keep that many ahead. */
    readAloudBuffer: z.number().int().min(1).max(8),
    /** CPU threads the synthesis worker may use. */
    threads: z.number().int().min(1).max(16),
  }),
  tray: z.object({
    enabled: z.boolean(),
    reflectState: z.boolean(),
    notifications: z.boolean(),
  }),
  system: z.object({
    launchAtLogin: z.boolean(),
    launchMinimized: z.boolean(),
    closeToTray: z.boolean(),
    autoUnload: z.boolean(),
    idleMinutes: z.number().int().min(1).max(60),
  }),
  updates: z.object({
    checkAutomatically: z.boolean(),
    downloadAutomatically: z.boolean(),
  }),
  companion: companionSettingsSchema,
  announcements: z.object({
    /** Show the what's-new billboard once after an update. */
    whatsNew: z.boolean(),
    /** The version whose what's-new was last seen; empty before the first one. */
    seenVersion: z.string().max(32).regex(/^$|^\d+\.\d+\.\d+[\w.+-]*$/),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Every group in `settingsSchema`, used to salvage a partially invalid settings file. */
const GROUP_KEYS = [
  'appearance',
  'audio',
  'tts',
  'tray',
  'system',
  'updates',
  'companion',
  'announcements',
] as const;
type GroupKey = (typeof GROUP_KEYS)[number];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboardingComplete: false,
  appearance: {
    theme: 'system',
    sidebarCollapsed: false,
    fontSize: 'md',
    fontFamily: 'inter',
    animations: 'full',
    contentWidth: 'default',
    accentTone: 'blue',
  },
  audio: {
    outputDeviceId: 'default',
  },
  tts: {
    modelId: 'kokoro-en-v0_19',
    voiceId: '00',
    speed: 1,
    shortcut: 'CommandOrControl+Shift+R',
    pauseShortcut: '',
    stopShortcut: '',
    volume: 1,
    useAccessibility: true,
    copyFallback: true,
    restoreClipboard: true,
    followAlong: true,
    speedReading: false,
    readAloudBuffer: 3,
    threads: 4,
  },
  tray: {
    enabled: true,
    reflectState: true,
    notifications: false,
  },
  system: {
    launchAtLogin: false,
    launchMinimized: false,
    closeToTray: true,
    autoUnload: true,
    idleMinutes: 10,
  },
  updates: { checkAutomatically: true, downloadAutomatically: true },
  companion: DEFAULT_COMPANION_SETTINGS,
  announcements: { whatsNew: true, seenVersion: '' },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type SettingsPatch = DeepPartial<Omit<Settings, 'version'>>;

export const settingsPatchSchema = z
  .object({
    onboardingComplete: settingsSchema.shape.onboardingComplete.optional(),
    appearance: settingsSchema.shape.appearance.partial().strict().optional(),
    audio: settingsSchema.shape.audio.partial().strict().optional(),
    tts: settingsSchema.shape.tts.partial().strict().optional(),
    tray: settingsSchema.shape.tray.partial().strict().optional(),
    system: settingsSchema.shape.system.partial().strict().optional(),
    updates: settingsSchema.shape.updates.partial().strict().optional(),
    companion: companionSettingsPatchSchema.optional(),
    announcements: settingsSchema.shape.announcements.partial().strict().optional(),
  })
  .strict();

export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return settingsSchema.parse({
    ...base,
    ...(patch.onboardingComplete === undefined
      ? {}
      : { onboardingComplete: patch.onboardingComplete }),
    appearance: { ...base.appearance, ...patch.appearance },
    audio: { ...base.audio, ...patch.audio },
    tts: { ...base.tts, ...patch.tts },
    tray: { ...base.tray, ...patch.tray },
    system: { ...base.system, ...patch.system },
    updates: { ...base.updates, ...patch.updates },
    announcements: { ...base.announcements, ...patch.announcements },
    companion: {
      ...base.companion,
      ...patch.companion,
      reactions: { ...base.companion.reactions, ...patch.companion?.reactions },
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupShape(key: GroupKey): Record<string, z.ZodType> {
  return (settingsSchema.shape[key] as z.ZodObject<Record<string, z.ZodType>>).shape;
}

/**
 * Reads untrusted settings data. Each field is validated on its own, invalid values are
 * discarded, and anything missing falls back to the default. Only JSON values are read:
 * no key from the input is ever used as a property name or evaluated. Unknown groups
 * from older files (dictation, stt, overlay, live) are ignored.
 */
export function coerceSettings(input: unknown): Settings {
  const raw =
    isRecord(input) && isRecord(input.companion)
      ? { ...input, companion: migrateLegacyCompanion(input.companion) }
      : input;
  const direct = settingsSchema.safeParse(raw);
  if (direct.success) return direct.data;

  const next = structuredClone(DEFAULT_SETTINGS);
  if (!isRecord(raw)) return next;
  if (typeof raw.onboardingComplete === 'boolean') next.onboardingComplete = raw.onboardingComplete;

  for (const key of GROUP_KEYS) {
    const group = raw[key];
    if (!isRecord(group)) continue;
    const target = next[key] as Record<string, unknown>;
    for (const [field, schema] of Object.entries(groupShape(key))) {
      const value = schema.safeParse(group[field]);
      if (value.success) target[field] = value.data;
    }
  }
  return settingsSchema.parse(next);
}
