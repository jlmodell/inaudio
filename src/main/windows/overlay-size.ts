import type { Settings } from '@shared/domain/settings';
import type { DictationPhase } from '@shared/domain/system';

/** Transparent room around the pill so its CSS drop shadow is not clipped. */
export const OVERLAY_PAD = 16;
/** Height of the pill itself; matches the overlay stylesheet. */
export const OVERLAY_PILL_HEIGHT = 44;
/** Extra height granted while a dropdown or popover is open. */
export const OVERLAY_MENU_SPACE = 248;
/** Distance from the edge of the work area. */
export const OVERLAY_MARGIN = 24;
/**
 * Extra width granted while an error line is shown. A configuration small enough to fit
 * "Ready" has no room for a sentence, and a truncated failure reason is no use at all.
 */
export const OVERLAY_MESSAGE_SPACE = 184;

/**
 * Widths of what the pill draws, in px, each including the 10px flex gap in front of it.
 * They match pill.tsx and round up, so the pill (sized to its content) always fits and any
 * slack lands in the transparent margin rather than inside the pill.
 */
const CHROME = 30; // 1px border and 14px padding on each side
const ICON = 16;
const GAP = 10;
const LABEL: Record<DictationPhase | 'reading', number> = {
  idle: 42,
  listening: 64,
  transcribing: 86,
  inserting: 64,
  error: 120,
  reading: 66,
};
const TIMER = 50;
const LEVEL = 38;
const DIVIDER = 11;
const MODEL_CHIP = 150;
const MODEL_PICKER_EXTRA = 16;
const LANGUAGE_CHIP = 52;
const BUTTON = 38;
const READING_COUNT = 56;
const READING_PROGRESS = 64;

/** What the reading readout shows; null when nothing is being read. */
export interface OverlayReadingContent {
  /** Pause, resume and stop buttons are drawn once the pill is armed. */
  controls: boolean;
}

/** Everything that decides what the pill draws right now, beyond the settings. */
export interface OverlayContent {
  phase: DictationPhase;
  /** The pointer or an open menu has armed the pill, so it shows controls. */
  armed: boolean;
  /** An error line is shown and has to be readable rather than clipped. */
  message: boolean;
  /** A dropdown or popover is open and the panel has to fit inside the window. */
  menuOpen: boolean;
  /** Microphones the overlay may offer; the picker only appears for more than one. */
  devices: number;
  /** The active model has a language label, so the language chip can appear. */
  language: boolean;
  /** A read-aloud session the pill shows while dictation is idle. */
  reading: OverlayReadingContent | null;
}

/**
 * Pill width for what it shows in this phase. Sections are only counted while drawn: the
 * timer and level only while listening, controls only while armed. A configuration-wide sum
 * left an empty stretch inside the pill whenever a section was hidden.
 */
export function overlayPillWidth(overlay: Settings['overlay'], content: OverlayContent): number {
  const { phase } = content;
  const failed = phase === 'error';
  const armed = content.armed && !failed;

  if (phase === 'idle' && content.reading) {
    let width = CHROME + ICON + GAP + LABEL.reading + READING_COUNT + READING_PROGRESS;
    if (armed) width += DIVIDER + BUTTON * 3;
    return width;
  }

  let width = CHROME + ICON + GAP + LABEL[phase];
  if (failed && content.message) width += OVERLAY_MESSAGE_SPACE;
  const recording = phase === 'listening';
  if (overlay.showTimer && recording) width += TIMER;
  if (overlay.showLevel && recording && !armed) width += LEVEL;
  const showModel = overlay.showModel && !failed;
  const showLanguage = overlay.showLanguage && !failed && content.language && !armed;
  if (armed || failed || showModel || showLanguage) width += DIVIDER;
  if (showModel) width += MODEL_CHIP + (armed ? MODEL_PICKER_EXTRA : 0);
  if (showLanguage) width += LANGUAGE_CHIP;
  if (armed) width += BUTTON * (3 + (content.devices > 1 ? 1 : 0));
  if (failed) width += BUTTON;
  return width;
}

export function overlaySize(
  overlay: Settings['overlay'],
  content: OverlayContent,
): { width: number; height: number } {
  return {
    width: overlayPillWidth(overlay, content) + OVERLAY_PAD * 2,
    height: OVERLAY_PILL_HEIGHT + OVERLAY_PAD * 2 + (content.menuOpen ? OVERLAY_MENU_SPACE : 0),
  };
}

/** The horizontal edge the pill holds inside its window, from the configured position. */
export function overlayAlign(position: Settings['overlay']['position']): 'left' | 'center' | 'right' {
  if (position.endsWith('left')) return 'left';
  if (position.endsWith('right')) return 'right';
  return 'center';
}
