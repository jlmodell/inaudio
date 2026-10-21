import { Blobatar } from '@blobatar/react';
import {
  happy,
  idle,
  love,
  sad,
  shy,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink,
  type Expression,
} from 'blobatar/expression';
import 'blobatar/motion.css';
import 'blobatar/gaze.css';
import type {
  CompanionDefinition,
  CompanionPersonality,
  CompanionSettings,
  CompanionState,
} from '@shared/domain/companion';

/**
 * The face the companion wears for each state. `attention` (a click) reads the
 * personality: a playful companion beams, a quiet one looks away, a curious one
 * startles, and the rest wink.
 */
export function companionExpression(state: CompanionState, personality: CompanionPersonality): Expression {
  switch (state) {
    case 'thinking':
      return thinking;
    case 'speaking':
    case 'ready':
      return happy;
    case 'error':
      return sad;
    case 'model-unavailable':
      return unsure;
    case 'sleeping':
      return sleepy;
    case 'attention':
      if (personality === 'playful') return love;
      if (personality === 'quiet') return shy;
      if (personality === 'curious') return surprised;
      if (personality === 'energetic') return happy;
      if (personality === 'sleepy') return smug;
      return wink;
    default:
      return idle;
  }
}

/** Small faces an idle companion drifts through so it never looks frozen. */
export const IDLE_MOODS: Record<CompanionPersonality, readonly Expression[]> = {
  calm: [smug, shy],
  playful: [happy, wink, love, smug],
  curious: [unsure, surprised, smug],
  energetic: [happy, surprised, wink],
  sleepy: [sleepy, shy],
  quiet: [shy],
};

/** Hue of the app's accent color, so 'accent' companions match the current theme. */
function accentHue(): number | undefined {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)?.[1];
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(raw);
  const parts = hex
    ? [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((pair) => parseInt(pair, 16))
    : rgb
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : null;
  const [r, g, b] = parts ?? [];
  if (r === undefined || g === undefined || b === undefined || [r, g, b].some(Number.isNaN)) {
    return undefined;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return undefined;
  const hue =
    max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return Math.round((hue + 360) % 360);
}

export function CompanionAvatar({
  companion,
  settings,
  expression,
  size,
  gazeRef,
}: {
  companion: CompanionDefinition;
  settings: Pick<CompanionSettings, 'color' | 'hue' | 'backdrop'>;
  expression: Expression;
  size: number;
  /** Callback ref from `useGaze()` in `@blobatar/react/gaze`. */
  gazeRef?: (node: SVGSVGElement | HTMLImageElement | null) => void;
}) {
  const hue =
    settings.color === 'custom'
      ? settings.hue
      : settings.color === 'accent'
        ? accentHue()
        : companion.hue;
  return (
    <Blobatar
      ref={gazeRef}
      name={companion.seed}
      traits={{ shape: companion.shape }}
      {...(hue === undefined ? {} : { hue })}
      expression={expression}
      animate="always"
      background={settings.backdrop === 'none' ? false : settings.backdrop}
      title={companion.displayName}
      size={size}
    />
  );
}
