/**
 * World geometry for "Against the Current". World units: x right, y DOWN (screen-like), 1000 x 640 nominal view.
 * The river runs left (upstream) to right (downstream), widening a little downstream. Everything is a pure
 * function of x so any canvas width (wide screens see beyond the nominal 1000) is covered.
 */
import type { BoatId } from '../types';

export const WORLD = {
  width: 1000,
  height: 640,
  /** x of u = 0 (the dock) */
  dockX: 500,
  /** world units per unit of u (u = +1 is 420 units upstream = left) */
  perU: 420,
  /** y of the hills' base wash (distant bank) */
  horizon: 172,
} as const;

export const xOfU = (u: number): number => WORLD.dockX - WORLD.perU * u;
export const uOfX = (x: number): number => (WORLD.dockX - x) / WORLD.perU;

/** far (top) water edge */
export const farEdge = (x: number): number =>
  184 - 0.014 * x + 3.2 * Math.sin(x / 130 + 1) + 1.8 * Math.sin(x / 47 + 2);
/** near (bottom) water edge, at the foot of the soil lip */
export const nearEdge = (x: number): number =>
  492 + 0.022 * x + 4 * Math.sin(x / 150 + 2) + 2 * Math.sin(x / 53);

/** y of the river's centre line at x */
export const midY = (x: number): number => (farEdge(x) + nearEdge(x)) / 2;

export const LANE_Y: Record<BoatId, number> = { invest: 268, savings: 346, cash: 424 };
export const LANE_DEPTH: Record<BoatId, number> = { invest: 0.82, savings: 1, cash: 1.18 };

/** the pier: a plank strip running from the near bank out to the far lane, just downstream of the moored boats */
export const PIER = { x0: WORLD.dockX + 120, x1: WORLD.dockX + 160, yTip: 300 };

/** y where a boat's stern line meets the pier: each boat ties to a piling at (or beyond) its lane */
export const mooringY = (id: BoatId): number => (id === 'invest' ? PIER.yTip + 8 : LANE_Y[id] + 2);

/** milepost standing y on the near meadow (foot), as a function of x */
export const postFootY = (x: number): number => nearEdge(x) + 40;
export const POST_H = 52;
/** boats are drawn at this scale in world units (one hull = 120 local units) */
export const BOAT_SCALE = 1.55;

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
  /** world width the camera fits (nominal 1000, narrower on portrait screens) */
  viewW: number;
}

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  // portrait / narrow: show a narrower slice of the river (centred on the dock) rather than shrinking everything
  const aspect = availW / availH;
  const viewW = aspect >= 1.3 ? WORLD.width : Math.max(560, (WORLD.width * aspect) / 1.3);
  const s = Math.min(availW / viewW, availH / WORLD.height);
  const ox = (cssW - viewW * s) / 2 - (WORLD.width - viewW) * 0.5 * s;
  const oy = insets.top + (availH - WORLD.height * s) / 2;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy, viewW };
}

/** zoom about a focus, as in Time to Grow: screen' = F + (screen - F) z + (C - F)(1 - 1/z) */
export interface ZoomXf {
  a: number;
  bx: number;
  by: number;
}
export function zoomTransform(c: Camera, insets: Insets, zoom: number, focusU: number): ZoomXf {
  const z = Math.max(1, zoom);
  if (z <= 1.0005) return { a: 1, bx: 0, by: 0 };
  const Fx = c.ox + xOfU(focusU) * c.s;
  const Fy = c.oy + 322 * c.s;
  const Cx = c.cssW / 2;
  const Cy = insets.top + (c.cssH - insets.top - insets.bottom) * 0.56;
  const k = 1 - 1 / z;
  return { a: z, bx: Fx * (1 - z) + (Cx - Fx) * k, by: Fy * (1 - z) + (Cy - Fy) * k };
}
