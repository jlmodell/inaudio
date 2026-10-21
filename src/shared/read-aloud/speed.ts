export const MIN_READ_SPEED = 0.5;
export const MAX_READ_SPEED = 3;
export const READ_SPEED_PRESETS = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export function clampReadSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_READ_SPEED, Math.max(MIN_READ_SPEED, Math.round(speed * 20) / 20));
}
