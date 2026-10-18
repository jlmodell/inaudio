import type { OverlayPosition } from '@shared/domain/settings';

/** Distance from the edge of the work area, the same as the overlay pill. */
export const LIVE_WINDOW_MARGIN = 24;
/**
 * Transparent room around the panel. It carries the 6px corners' shadow and is where the
 * edges are grabbed to resize, since a transparent window has no native frame.
 */
export const LIVE_WINDOW_PAD = 8;
/** The header alone, with its padding: the collapsed window is one caption line. */
export const LIVE_WINDOW_COLLAPSED_HEIGHT = 44 + LIVE_WINDOW_PAD * 2;

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * The window's bounds after its `edge` has been dragged by (dx, dy): the opposite edge
 * stays put, the size stays within its limits, and the window stays inside the work area.
 */
export function resizedBounds(
  start: Area,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  limits: { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number },
  area: Area,
): Area {
  let { x, y, width, height } = start;
  if (edge.includes('e')) width = clamp(start.width + dx, limits.minWidth, Math.min(limits.maxWidth, area.x + area.width - start.x));
  if (edge.includes('s')) height = clamp(start.height + dy, limits.minHeight, Math.min(limits.maxHeight, area.y + area.height - start.y));
  if (edge.includes('w')) {
    const right = start.x + start.width;
    width = clamp(start.width - dx, limits.minWidth, Math.min(limits.maxWidth, right - area.x));
    x = right - width;
  }
  if (edge.includes('n')) {
    const bottom = start.y + start.height;
    height = clamp(start.height - dy, limits.minHeight, Math.min(limits.maxHeight, bottom - area.y));
    y = bottom - height;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Where the floating live window opens: in the chosen corner (or edge centre) of the work
 * area, inside the margin, and never larger than the area itself. Only type imports, so the
 * script tests can load this file directly.
 */
export function liveWindowBounds(
  area: Area,
  position: OverlayPosition,
  size: { width: number; height: number },
  collapsed: boolean,
): Area {
  const room = { width: Math.max(1, area.width - LIVE_WINDOW_MARGIN * 2), height: Math.max(1, area.height - LIVE_WINDOW_MARGIN * 2) };
  const width = Math.min(size.width, room.width);
  const height = Math.min(collapsed ? LIVE_WINDOW_COLLAPSED_HEIGHT : size.height, room.height);
  let x: number;
  if (position.endsWith('left')) x = area.x + LIVE_WINDOW_MARGIN;
  else if (position.endsWith('right')) x = area.x + area.width - width - LIVE_WINDOW_MARGIN;
  else x = area.x + Math.round((area.width - width) / 2);
  const y = position.startsWith('top') ? area.y + LIVE_WINDOW_MARGIN : area.y + area.height - height - LIVE_WINDOW_MARGIN;
  return {
    x: clamp(Math.round(x), area.x, area.x + Math.max(0, area.width - width)),
    y: clamp(Math.round(y), area.y, area.y + Math.max(0, area.height - height)),
    width,
    height,
  };
}

/**
 * Keeps a window the user dragged on screen after a display change: it stays where it is
 * if it still fits, and is pulled back inside the nearest work area otherwise.
 */
export function keepInside(bounds: Area, area: Area): Area {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
    width,
    height,
  };
}
