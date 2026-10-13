import { useEffect, useMemo, useState } from 'react';
import type { CompanionPackage, CompanionState } from '@shared/domain/companion';
import lumenSprite from '@renderer/assets/companions/lumen.svg';
import mossSprite from '@renderer/assets/companions/moss.svg';
import emberSprite from '@renderer/assets/companions/ember.svg';
import novaSprite from '@renderer/assets/companions/nova.svg';

const SPRITES: Record<string, string> = {
  lumen: lumenSprite,
  moss: mossSprite,
  ember: emberSprite,
  nova: novaSprite,
};

const FALLBACK_ROWS: Record<CompanionState, number> = {
  idle: 0,
  listening: 1,
  transcribing: 2,
  thinking: 2,
  speaking: 3,
  ready: 0,
  error: 2,
  'model-unavailable': 2,
  sleeping: 0,
  attention: 1,
};

export function BuddySprite({
  companion,
  state = 'idle',
  size = 'large',
  paused = false,
}: {
  companion: CompanionPackage;
  state?: CompanionState;
  size?: 'small' | 'large';
  /** Holds the current frame, for a sprite nobody can see. */
  paused?: boolean;
}) {
  const [frame, setFrame] = useState(0);
  const animation = companion.animation.stateRows[state] ?? companion.animation.stateRows.idle;
  const row = animation?.row ?? FALLBACK_ROWS[state];
  const frameCount = animation?.frameCount ?? 4;
  const sprite = SPRITES[companion.id];

  useEffect(() => {
    setFrame(0);
    if (paused) return;
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % frameCount),
      companion.animation.frameDurationMs,
    );
    return () => window.clearInterval(timer);
  }, [companion.animation.frameDurationMs, frameCount, state, paused]);

  const backgroundPosition = useMemo(
    () => `${(frame / Math.max(1, companion.columns - 1)) * 100}% ${(row / Math.max(1, companion.rows - 1)) * 100}%`,
    [companion.columns, companion.rows, frame, row],
  );

  return (
    <span
      aria-hidden
      className={size === 'small' ? 'block size-16' : 'block size-32'}
      style={{
        backgroundImage: sprite ? `url(${sprite})` : undefined,
        backgroundPosition,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${companion.columns * 100}% ${companion.rows * 100}%`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
