/** The scene's camera (as the orchard's): fits VIEW between the header band and the label band; never zooms. */
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
  s: number;
  ox: number;
  oy: number;
}

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  const s = Math.min(availW / (VIEW.x1 - VIEW.x0), availH / (VIEW.y1 - VIEW.y0));
  const ox = (cssW - WORLD.width * s) / 2;
  // the front of the meadow sits on the label band; extra height goes to the sky
  const oy = insets.top + availH - VIEW.y1 * s;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy };
}

export function viewX(c: Camera, margin = 40): { x0: number; x1: number } {
  return { x0: -c.ox / c.s - margin, x1: (c.cssW - c.ox) / c.s + margin };
}
export function viewY(c: Camera, margin = 20): { y0: number; y1: number } {
  return { y0: -c.oy / c.s - margin, y1: (c.cssH - c.oy) / c.s + margin };
}
