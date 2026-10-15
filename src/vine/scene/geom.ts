/**
 * World geometry for "Nip It in the Bud" (coordinator-owned: the scene and the gardener both rely on it).
 * World units: x right, y DOWN, 1000 x 640 nominal view; wider screens see a little more on each side.
 *
 * Two single-storey stone cottages stand side by side on a lawn, the minimum-payment cottage on the left and
 * the fixed-payment cottage on the right, with a low fence and a path between their gardens. Each gardener
 * prunes from the path along the foot of the wall, rakes clippings onto a pile at the outer front corner of
 * the garden, and rests on a bench on its own lawn once the vine is cleared.
 */
import type { PlanId } from '../types';

export const WORLD = {
  width: 1000,
  height: 640,
  /** where the distant hills meet the sky */
  horizon: 268,
} as const;

/** the foot of the cottage walls (where the wall meets the ground) */
export const GROUND_Y = 478;
/** the gardener's feet while pruning: on the path just in front of the wall */
export const PATH_Y = 500;

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface CottageGeom {
  /** the front wall */
  wall: Rect;
  /** the roof ridge (top of the gable) */
  ridge: { x: number; y: number };
  door: Rect;
  windows: Rect[];
  /** where the vine is rooted (at the foot of the wall), and the part of the wall it may cover at full size */
  root: { x: number; y: number };
  vine: Rect;
}

const cottage = (x0: number, mirror: boolean): CottageGeom => {
  const w = 350;
  const x1 = x0 + w;
  const at = (dx: number) => (mirror ? x1 - dx : x0 + dx);
  const span = (a: number, b: number) => (mirror ? { x0: at(b), x1: at(a) } : { x0: at(a), x1: at(b) });
  return {
    wall: { x0, x1, y0: 318, y1: GROUND_Y },
    ridge: { x: x0 + w / 2, y: 206 },
    // the door off-centre toward the middle path, a window either side
    door: { ...span(206, 258), y0: 382, y1: GROUND_Y },
    windows: [
      { ...span(48, 120), y0: 358, y1: 420 },
      { ...span(284, 334), y0: 358, y1: 420 },
    ],
    root: { x: at(178), y: GROUND_Y },
    vine: { x0: x0 + 12, x1: x1 - 12, y0: 334, y1: GROUND_Y },
  };
};

export const COTTAGE: Record<PlanId, CottageGeom> = {
  minimum: cottage(70, false),
  fixed: cottage(580, true),
};

/** the clippings pile (its centre at ground level) and the bench (the seat's front edge, centre) */
export const PILE: Record<PlanId, { x: number; y: number }> = {
  minimum: { x: 118, y: 574 },
  fixed: { x: 882, y: 574 },
};
export const BENCH: Record<PlanId, { x: number; y: number }> = {
  minimum: { x: 240, y: 566 },
  fixed: { x: 760, y: 566 },
};

/** the gardener's height (boots to hat top) at the path, and the highest point the shears can reach from it */
export const GARDENER_H = 122;
export const REACH_TOP = PATH_Y - 170;
/** how far left or right of the feet the shears can reach comfortably at full stretch */
export const REACH_SIDE = 46;

/** nearer things (lower on the lawn) are drawn a little larger */
export const depthScale = (y: number): number => 1 + (y - PATH_Y) * 0.0014;

/* ---------------------------------------------------------------- camera (as in the river) */

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
  const s = Math.min(availW / WORLD.width, availH / WORLD.height);
  const ox = (cssW - WORLD.width * s) / 2;
  const oy = insets.top + (availH - WORLD.height * s) / 2;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy };
}

/** the world point a camera focus zooms about */
export function focusPoint(focus: PlanId | 'both'): { x: number; y: number } {
  if (focus === 'both') return { x: WORLD.width / 2, y: 420 };
  const c = COTTAGE[focus];
  return { x: c.root.x, y: 420 };
}

/** zoom about a focus, as in Time to Grow: screen' = F + (screen - F) z + (C - F)(1 - 1/z) */
export interface ZoomXf {
  a: number;
  bx: number;
  by: number;
}
export function zoomTransform(c: Camera, insets: Insets, zoom: number, focus: PlanId | 'both'): ZoomXf {
  const z = Math.max(1, zoom);
  if (z <= 1.0005) return { a: 1, bx: 0, by: 0 };
  const f = focusPoint(focus);
  const Fx = c.ox + f.x * c.s;
  const Fy = c.oy + f.y * c.s;
  const Cx = c.cssW / 2;
  const Cy = insets.top + (c.cssH - insets.top - insets.bottom) * 0.56;
  const k = 1 - 1 / z;
  return { a: z, bx: Fx * (1 - z) + (Cx - Fx) * k, by: Fy * (1 - z) + (Cy - Fy) * k };
}
