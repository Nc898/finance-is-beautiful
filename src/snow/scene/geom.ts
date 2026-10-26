/**
 * World geometry for "On a Roll" (coordinator-owned: the scene and the climber both rely on it).
 * World units: x right, y DOWN, 1000 x 640 nominal view; wider screens see a little more on each side.
 *
 * Two snowy hillsides side by side, the Snowball hill on the left and the Avalanche hill on the right (mirrored),
 * with a frozen creek in the valley between them and snow-laden pines all round. Each hill carries the same three
 * snowballs in three lanes running down the slope toward us: lane 0 (the medical bill) outermost, lane 2 (the
 * card) innermost, nearest the creek. A ball starts at the top of its lane (far away, higher on the page) and is
 * rolled down toward us; when its debt is cleared it reaches the snowbank at the foot of the lane and breaks up.
 * The climber pushes from the uphill side (behind the ball), so it walks toward us while it works; when every debt
 * is cleared it sits on its sledge at the foot of its hill (REST).
 *
 * The ground is a plane seen in oblique view, as in the vine: y is depth (farther = higher on the page = smaller).
 * The slope is painted, not modelled: walking down a lane is walking toward us on the plane.
 */
import type { DebtId, StrategyId } from '../types';

export const WORLD = {
  width: 1000,
  height: 640,
  /** where the far mountains meet the sky */
  horizon: 240,
} as const;

/** the crest of each hill, where its pine wood stands (the lanes start just below it) */
export const CREST_Y = 296;
/** the foot of the hills: the snowbank the lanes end in */
export const FOOT_Y = 600;

export interface Pt {
  x: number;
  y: number;
}

export interface Lane {
  /** where the ball starts (at the top, far away) and where it ends (in the snowbank at the foot) */
  start: Pt;
  end: Pt;
}

/** each hill's extent and the middle of its crest (labels sit above it) */
export interface HillGeom {
  x0: number;
  x1: number;
  crest: Pt;
}

const leftLanes: Record<DebtId, Lane> = {
  medical: { start: { x: 120, y: 330 }, end: { x: 172, y: 588 } },
  car: { start: { x: 246, y: 318 }, end: { x: 290, y: 591 } },
  card: { start: { x: 372, y: 306 }, end: { x: 405, y: 594 } },
};
const mirror = (p: Pt): Pt => ({ x: WORLD.width - p.x, y: p.y });

export const LANES: Record<StrategyId, Record<DebtId, Lane>> = {
  snowball: leftLanes,
  avalanche: {
    medical: { start: mirror(leftLanes.medical.start), end: mirror(leftLanes.medical.end) },
    car: { start: mirror(leftLanes.car.start), end: mirror(leftLanes.car.end) },
    card: { start: mirror(leftLanes.card.start), end: mirror(leftLanes.card.end) },
  },
};

export const HILL: Record<StrategyId, HillGeom> = {
  snowball: { x0: 30, x1: 470, crest: { x: 250, y: CREST_Y } },
  avalanche: { x0: 530, x1: 970, crest: { x: 750, y: CREST_Y } },
};

/** where each climber rests when its hill is clear: sitting on a sledge at the outer foot of the hill */
export const REST: Record<StrategyId, Pt> = {
  snowball: { x: 66, y: 604 },
  avalanche: { x: 934, y: 604 },
};

/** the climber's height (boots to hat top) at depth PATH_Y: small beside the pines (a person to a tree) */
export const CLIMBER_H = 80;
export const PATH_Y = 500;
/** nearer things (lower on the page) are drawn larger: the top of the hill reads as far up the slope */
export const depthScale = (y: number): number => 1 + (y - PATH_Y) * 0.0018;

/** the radius of a ball whose `size` is 1 (the largest starting debt), at depth PATH_Y: about the climber's height across */
export const BALL_R_MAX = 38;

/** a ball's radius (world units): its painted area is proportional to `size`, then perspective by depth */
export const ballRadius = (size: number, y: number): number => BALL_R_MAX * Math.sqrt(Math.max(0, size)) * depthScale(y);

/** where a ball touches the ground at `progress` (0 = the top of its lane, 1 = the snowbank): straight down the
 *  lane, so the distance rolled is the share of the debt paid */
export function lanePoint(id: StrategyId, debt: DebtId, progress: number): Pt {
  const l = LANES[id][debt];
  const t = Math.max(0, Math.min(1, progress));
  return { x: l.start.x + (l.end.x - l.start.x) * t, y: l.start.y + (l.end.y - l.start.y) * t };
}

/** the unit vector down a lane (toward us), for the climber's pushing direction */
export function laneDir(id: StrategyId, debt: DebtId): Pt {
  const l = LANES[id][debt];
  const dx = l.end.x - l.start.x;
  const dy = l.end.y - l.start.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/* ---------------------------------------------------------------- camera (as in the vine) */

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

/** the narrowest slice of the world a camera fits: both hills and their sledges, the far sides cropped */
export const PORTRAIT_VIEW_W = 900;

export function fitCamera(cssW: number, cssH: number, dpr: number, insets: Insets): Camera {
  const availH = Math.max(80, cssH - insets.top - insets.bottom);
  const availW = Math.max(120, cssW - (insets.side ?? 0));
  // portrait / narrow: fit the two hills alone, not the whole valley
  const viewW = Math.max(PORTRAIT_VIEW_W, Math.min(WORLD.width, (WORLD.width * availW) / availH / 1.3));
  const s = Math.min(availW / viewW, availH / WORLD.height);
  const ox = (cssW - WORLD.width * s) / 2;
  const oy = insets.top + (availH - WORLD.height * s) / 2;
  return { cssW, cssH, dpr: Math.min(2, dpr || 1), s, ox, oy };
}

/** the world point a camera focus zooms about: the tops of the lanes, where the balls start */
export function focusPoint(focus: StrategyId | 'both'): Pt {
  if (focus === 'both') return { x: WORLD.width / 2, y: 340 };
  return { x: HILL[focus].crest.x, y: 340 };
}

/** zoom about a focus, as in Time to Grow: screen' = F + (screen - F) z + (C - F)(1 - 1/z) */
export interface ZoomXf {
  a: number;
  bx: number;
  by: number;
}
export function zoomTransform(c: Camera, insets: Insets, zoom: number, focus: StrategyId | 'both'): ZoomXf {
  const z = Math.max(1, zoom);
  if (z <= 1.0005) return { a: 1, bx: 0, by: 0 };
  const f = focusPoint(focus);
  const Fx = c.ox + f.x * c.s;
  const Fy = c.oy + f.y * c.s;
  const Cx = c.cssW / 2;
  const Cy = insets.top + (c.cssH - insets.top - insets.bottom) * 0.5;
  const k = 1 - 1 / z;
  return { a: z, bx: Fx * (1 - z) + (Cx - Fx) * k, by: Fy * (1 - z) + (Cy - Fy) * k };
}
