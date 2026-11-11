/**
 * The scene's own camera (as Brick's layout.ts): fit VIEW between the header band and the label band, never zoom.
 * Wider screens see more of the walls at each side and taller ones more ceiling, so the room is painted past
 * 0 … 1000 and above VIEW.y0; the floor runs on under the label band.
 */
import { VIEW, WORLD } from './geom';

export interface Insets {
  top: number;
  bottom: number;
  side?: number;
}

export interface Camera {
  cssW: number;
  cssH: number;
  dpr: number;
  /** css px per world unit */
  s: number;
  /** screen position of world (0,0) */
  ox: number;
  oy: number;
}

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  const vw = VIEW.x1 - VIEW.x0;
  const vh = VIEW.y1 - VIEW.y0;
  const s = Math.min(availW / vw, availH / vh);
  // centred on the whole stage (the canvas slides left by half the panel when it opens), the front edge of the floor
  // on the label band; extra height goes to the ceiling
  const ox = (cssW - WORLD.width * s) / 2;
  const oy = insets.top + availH - VIEW.y1 * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy };
}

/** the world x range the camera sees (with a margin) */
export function viewX(c: Camera, margin = 40): { x0: number; x1: number } {
  return { x0: -c.ox / c.s - margin, x1: (c.cssW - c.ox) / c.s + margin };
}
/** the world y range the camera sees */
export function viewY(c: Camera, margin = 20): { y0: number; y1: number } {
  return { y0: -c.oy / c.s - margin, y1: (c.cssH - c.oy) / c.s + margin };
}
