import { z } from 'zod';
import { liveSessionMinutesSchema, liveSourceSchema } from './capture';
import { sttModelIdSchema, ttsModelIdSchema, voiceIdSchema } from './models';
import { MAX_REPLACEMENT_CHARS, MAX_REPLACEMENTS } from '../text/replacements';
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

/** Overlay anchors, relative to the work area of the display it is shown on. */
export const OVERLAY_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export const overlayPositionSchema = z.enum(OVERLAY_POSITIONS);
export type OverlayPosition = z.infer<typeof overlayPositionSchema>;

/** Which display the overlay follows. Pixel coordinates are never persisted. */
export const overlayDisplaySchema = z.enum(['cursor', 'primary', 'window']);
export type OverlayDisplayMode = z.infer<typeof overlayDisplaySchema>;

export const OVERLAY_MIN_OPACITY = 0.4;

/** The floating live window carries text, so it never fades as far as the pill can. */
export const LIVE_WINDOW_MIN_OPACITY = 0.6;
/** Size limits for the floating live window, in DIPs. Only its size is ever persisted. */
export const LIVE_WINDOW_SIZE = { minWidth: 320, minHeight: 140, maxWidth: 720, maxHeight: 560 } as const;

/** Accent tones the stylesheet defines, in the order they are offered. */
export const ACCENT_TONES = ['blue', 'violet', 'green', 'amber', 'rose'] as const;
export const accentToneSchema = z.enum(ACCENT_TONES);
export type AccentTone = z.infer<typeof accentToneSchema>;

/** Device ids Chromium reports whatever hardware is attached, so they are always valid. */
export const RESERVED_DEVICE_IDS = ['default', 'communications'] as const;

/**
 * A MediaDeviceInfo.deviceId. Chromium emits a hashed token, so the charset is pinned to
 * what a hash or a base64url id can hold and nothing else ever reaches disk or a menu.
 */
/** One custom-words fix: what the engine writes, and what it should write instead. */
export const replacementSchema = z
  .object({
    from: z.string().trim().min(1).max(MAX_REPLACEMENT_CHARS),
    to: z.string().max(MAX_REPLACEMENT_CHARS),
  })
  .strict();

/** A fraction of the work area, 0 at the left or top edge and 1 at the right or bottom. */
const fractionSchema = z.number().min(0).max(1);

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
  dictation: z.object({
    mode: z.enum(['toggle', 'push-to-talk']),
    shortcut: acceleratorSchema,
    cancelShortcut: optionalAcceleratorSchema,
    insertMode: z.enum(['paste', 'clipboard', 'none']),
    restoreClipboard: z.boolean(),
    saveHistory: z.boolean(),
    playCues: z.boolean(),
    cueVolume: z.number().min(0).max(1),
  }),
  audio: z.object({
    inputDeviceId: deviceIdSchema,
    outputDeviceId: deviceIdSchema,
    inputGain: z.number().min(0).max(2),
    /** Chromium's WebRTC processing on microphone tracks, for dictation and the live mix. */
    noiseSuppression: z.boolean(),
    echoCancellation: z.boolean(),
    autoGainControl: z.boolean(),
    /** Applied only where `getSupportedConstraints()` reports it. */
    voiceIsolation: z.boolean(),
    /** Runs the bundled GTCRN speech-cleanup model before recognition. */
    speechCleanup: z.boolean(),
  }),
  stt: z.object({
    modelId: sttModelIdSchema,
    threads: z.number().int().min(1).max(16),
    /** Custom words, applied to dictation and live transcripts. */
    replacements: z.array(replacementSchema).max(MAX_REPLACEMENTS),
  }),
  tts: z.object({
    modelId: ttsModelIdSchema,
    voiceId: voiceIdSchema,
    speed: z.number().min(0.5).max(2),
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
    showInOverlay: z.boolean(),
    pauseOnDictation: z.boolean(),
    /** Highlight the sentence being read in the Read Aloud preview. */
    followAlong: z.boolean(),
  }),
  overlay: z.object({
    enabled: z.boolean(),
    visibility: z.enum(['while-active', 'always']),
    position: overlayPositionSchema,
    display: overlayDisplaySchema,
    opacity: z.number().min(OVERLAY_MIN_OPACITY).max(1),
    clickThrough: z.boolean(),
    showTimer: z.boolean(),
    showLevel: z.boolean(),
    showModel: z.boolean(),
    showLanguage: z.boolean(),
    toggleShortcut: optionalAcceleratorSchema,
    /** Show the latest words of a live transcript in the pill. */
    showCaption: z.boolean(),
    /**
     * Where the user dragged the pill, as fractions of the work area (its centre, and the
     * edge it grows from), or null to use `position`. Pixels are never stored.
     */
    customX: fractionSchema.nullable(),
    customY: fractionSchema.nullable(),
  }),
  tray: z.object({
    enabled: z.boolean(),
    reflectState: z.boolean(),
    leftClick: z.enum(['window', 'dictate']),
    showMicrophones: z.boolean(),
    notifications: z.boolean(),
  }),
  live: z.object({
    source: liveSourceSchema,
    systemGain: z.number().min(0.5).max(2),
    micGain: z.number().min(0).max(2),
    /** Pause Read Aloud when a session starts, so Inaudio's own voice is not transcribed. */
    pauseReadAloud: z.boolean(),
    /** The user has read the notice about recording other people and asked not to see it again. */
    consentAcknowledged: z.boolean(),
    shortcut: optionalAcceleratorSchema,
    /** The input the `device` source records, such as a virtual cable. */
    deviceId: deviceIdSchema,
    /** Drop stretches the bundled voice detector finds no speech in. */
    skipNonSpeech: z.boolean(),
    /** Show a provisional line while someone is still speaking. */
    preview: z.boolean(),
    saveHistory: z.boolean(),
    maxMinutes: liveSessionMinutesSchema,
    /** Join passages into sentences: no false full stops at cuts, no repeated words. */
    smartJoin: z.boolean(),
    /** Re-punctuate each passage with the bundled English punctuation model. */
    restorePunctuation: z.boolean(),
  }),
  liveWindow: z.object({
    openOnStart: z.boolean(),
    alwaysOnTop: z.boolean(),
    /** Excludes the window from screen capture where the OS allows it. */
    hideFromCapture: z.boolean(),
    textSize: z.enum(['sm', 'md', 'lg']),
    opacity: z.number().min(LIVE_WINDOW_MIN_OPACITY).max(1),
    /** The corner it opens in. A dragged position lasts until the window is closed. */
    position: overlayPositionSchema,
    width: z.number().int().min(LIVE_WINDOW_SIZE.minWidth).max(LIVE_WINDOW_SIZE.maxWidth),
    height: z.number().int().min(LIVE_WINDOW_SIZE.minHeight).max(LIVE_WINDOW_SIZE.maxHeight),
    shortcut: optionalAcceleratorSchema,
  }),
  system: z.object({
    launchAtLogin: z.boolean(),
    closeToTray: z.boolean(),
    autoUnload: z.boolean(),
    idleMinutes: z.number().int().min(1).max(60),
  }),
  updates: z.object({
    checkAutomatically: z.boolean(),
    downloadAutomatically: z.boolean(),
  }),
  companion: companionSettingsSchema,
});

export type Settings = z.infer<typeof settingsSchema>;

/** Every group in `settingsSchema`, used to salvage a partially invalid settings file. */
const GROUP_KEYS = [
  'appearance',
  'dictation',
  'audio',
  'stt',
  'tts',
  'overlay',
  'tray',
  'live',
  'liveWindow',
  'system',
  'updates',
  'companion',
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
  dictation: {
    mode: 'toggle',
    shortcut: 'CommandOrControl+Shift+Space',
    cancelShortcut: '',
    insertMode: 'paste',
    restoreClipboard: true,
    saveHistory: true,
    playCues: true,
    cueVolume: 0.8,
  },
  audio: {
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    inputGain: 1,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    voiceIsolation: false,
    speechCleanup: false,
  },
  stt: { modelId: 'parakeet-tdt-0.6b-v2-int8', threads: 4, replacements: [] },
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
    showInOverlay: true,
    pauseOnDictation: true,
    followAlong: true,
  },
  overlay: {
    enabled: true,
    visibility: 'while-active',
    position: 'bottom',
    display: 'cursor',
    opacity: 1,
    clickThrough: true,
    showTimer: true,
    showLevel: true,
    showModel: false,
    showLanguage: false,
    toggleShortcut: '',
    showCaption: true,
    customX: null,
    customY: null,
  },
  tray: {
    enabled: true,
    reflectState: true,
    leftClick: 'window',
    showMicrophones: true,
    notifications: false,
  },
  live: {
    source: 'system',
    systemGain: 1,
    micGain: 1,
    pauseReadAloud: true,
    consentAcknowledged: false,
    shortcut: '',
    deviceId: 'default',
    skipNonSpeech: true,
    preview: true,
    saveHistory: true,
    maxMinutes: 180,
    smartJoin: true,
    restorePunctuation: false,
  },
  liveWindow: {
    openOnStart: true,
    alwaysOnTop: true,
    hideFromCapture: true,
    textSize: 'md',
    opacity: 1,
    position: 'bottom-right',
    width: 420,
    height: 300,
    shortcut: '',
  },
  system: { launchAtLogin: false, closeToTray: true, autoUnload: true, idleMinutes: 10 },
  updates: { checkAutomatically: true, downloadAutomatically: true },
  companion: DEFAULT_COMPANION_SETTINGS,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type SettingsPatch = DeepPartial<Omit<Settings, 'version'>>;

export const settingsPatchSchema = z
  .object({
    onboardingComplete: settingsSchema.shape.onboardingComplete.optional(),
    appearance: settingsSchema.shape.appearance.partial().strict().optional(),
    dictation: settingsSchema.shape.dictation.partial().strict().optional(),
    audio: settingsSchema.shape.audio.partial().strict().optional(),
    stt: settingsSchema.shape.stt.partial().strict().optional(),
    tts: settingsSchema.shape.tts.partial().strict().optional(),
    overlay: settingsSchema.shape.overlay.partial().strict().optional(),
    tray: settingsSchema.shape.tray.partial().strict().optional(),
    live: settingsSchema.shape.live.partial().strict().optional(),
    liveWindow: settingsSchema.shape.liveWindow.partial().strict().optional(),
    system: settingsSchema.shape.system.partial().strict().optional(),
    updates: settingsSchema.shape.updates.partial().strict().optional(),
    companion: companionSettingsPatchSchema.optional(),
  })
  .strict();

export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return settingsSchema.parse({
    ...base,
    ...(patch.onboardingComplete === undefined
      ? {}
      : { onboardingComplete: patch.onboardingComplete }),
    appearance: { ...base.appearance, ...patch.appearance },
    dictation: { ...base.dictation, ...patch.dictation },
    audio: { ...base.audio, ...patch.audio },
    stt: { ...base.stt, ...patch.stt },
    tts: { ...base.tts, ...patch.tts },
    overlay: { ...base.overlay, ...patch.overlay },
    tray: { ...base.tray, ...patch.tray },
    live: { ...base.live, ...patch.live },
    liveWindow: { ...base.liveWindow, ...patch.liveWindow },
    system: { ...base.system, ...patch.system },
    updates: { ...base.updates, ...patch.updates },
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
 * no key from the input is ever used as a property name or evaluated.
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
