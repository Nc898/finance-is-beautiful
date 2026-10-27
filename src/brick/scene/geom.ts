/**
 * World geometry for "Brick by Brick" (coordinator-owned: the scene, the crew and the carters all rely on it).
 * World units: x right, y DOWN, 1000 x 640 nominal view; wider screens see a little more on each side.
 *
 * Two plots side by side at the edge of a village in spring, the same two-storey brick house going up on each:
 * loan A (default 30 years) on the left, loan B (default 15 years) on the right, the mirror image in plan but lit
 * from the same side (the sun is upper left, so shading is never mirrored). A blossom tree stands between the plots,
 * where a road comes down from the village to the lane that runs along the front of both gardens.
 *
 * Each house has a scaffold along its front wall (lifts at fixed heights, ladders at the inner end, a gin-wheel
 * hoist at the outer end) and a pallet of bricks just inside its garden gate. The builder wheels a barrow from the
 * pallet out of the gate to the lender's cart waiting in the lane, tips the interest share into it, wheels the rest
 * to the foot of the hoist and hauls it up; the bricklayer lays on the wall from the scaffold. The lender's carts
 * come down the road from the village, turn along the lane to wait at the gate, and when full are pulled on out of
 * the picture at the outer edge.
 *
 * The ground is a plane seen in oblique view, as in the vine: y is depth (farther = higher on the page = smaller).
 * A point `h` above the ground at depth y is drawn at screen y − h.
 */
import type { LoanId } from '../types';

export const WORLD = {
  width: 1000,
  height: 640,
  /** where the distant hills meet the sky */
  horizon: 300,
} as const;

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** the foot of the house walls (where the front wall meets the ground) */
export const GROUND_Y = 462;
/** the front wall's height (two storeys) and the courses it is laid in */
export const WALL_H = 200;
export const COURSE_H = 6.25;
export const COURSES = 32;
/** a brick's length on the wall (with its mortar joint); courses are laid in stretcher bond (half-bond offset) */
export const BRICK_L = 18;

/**
 * How `built` (0 … 1, principal paid / amount) is spent: the wall course by course from the foot up (each course
 * left to right from the hoist end on A, the mirror on B, so the bricklayer works away from the hoist), skipping
 * the window and door openings; then the roof, row by row of tiles from the eaves up; then the chimney. Within each
 * stage the painted area is proportional to `built`.
 */
export const BUILD = {
  wall: [0, 0.8],
  roof: [0.8, 0.97],
  chimney: [0.97, 1],
} as const;

export interface HouseGeom {
  /** the front wall (screen rect at the wall's depth GROUND_Y) */
  wall: Rect;
  /** the roof: eaves across the front at the top of the wall, rising to the ridge (with a little overhang) */
  roof: { eaveY: number; ridgeY: number; x0: number; x1: number; ridgeX0: number; ridgeX1: number };
  /** the chimney stack on the outer end of the roof (its top includes the pots) */
  chimney: Rect;
  door: Rect;
  /** ground floor then first floor, in the order the courses reach them (screen rects) */
  windows: Rect[];
  /** +1 when the house's outer end (hoist, chimney, gate) is on the left (A), −1 when on the right (B) */
  outer: 1 | -1;
}

const house = (x0: number, mirror: boolean): HouseGeom => {
  const w = 270;
  const x1 = x0 + w;
  const at = (dx: number) => (mirror ? x1 - dx : x0 + dx);
  const span = (a: number, b: number) => (mirror ? { x0: at(b), x1: at(a) } : { x0: at(a), x1: at(b) });
  const g = GROUND_Y;
  return {
    wall: { x0, x1, y0: g - WALL_H, y1: g },
    roof: { eaveY: g - WALL_H, ridgeY: 180, x0: x0 - 10, x1: x1 + 10, ridgeX0: x0 + 24, ridgeX1: x1 - 24 },
    chimney: { ...span(26, 56), y0: 146, y1: 214 },
    door: { ...span(120, 158), y0: g - 96, y1: g },
    windows: [
      { ...span(30, 80), y0: g - 96, y1: g - 34 },
      { ...span(190, 240), y0: g - 96, y1: g - 34 },
      { ...span(30, 80), y0: g - 186, y1: g - 128 },
      { ...span(110, 160), y0: g - 186, y1: g - 128 },
      { ...span(190, 240), y0: g - 186, y1: g - 128 },
    ],
    outer: mirror ? -1 : 1,
  };
};

export const HOUSE: Record<LoanId, HouseGeom> = {
  a: house(110, false),
  b: house(620, true),
};

const mirror = (p: Pt): Pt => ({ x: WORLD.width - p.x, y: p.y });
const both = (a: Pt): Record<LoanId, Pt> => ({ a, b: mirror(a) });

/**
 * The scaffold along each front wall: standards on the ground at depth SCAFFOLD.y (just in front of the wall), boards
 * at the lift heights (above the ground; the first, 0, is the ground itself), from x0 to x1. Ladders between lifts at
 * the inner end (`ladderX`); a roof ladder lies up the roof from the top lift to the ridge at `roofLadderX`.
 */
export const SCAFFOLD = {
  y: 476,
  lifts: [0, 66, 132, 198] as const,
  /** the bricklayer's comfortable reach above its feet (it works between these heights) */
  reach: { low: 18, high: 78 },
};
export const SCAFFOLD_X: Record<LoanId, { x0: number; x1: number; ladderX: number; roofLadderX: number }> = {
  a: { x0: 98, x1: 392, ladderX: 386, roofLadderX: 300 },
  b: { x0: 608, x1: 902, ladderX: 614, roofLadderX: 700 },
};

/** The gin-wheel hoist at the scaffold's outer end: the wheel's height above SCAFFOLD.y, and where the builder stands
 *  to haul the rope (on the ground). The bucket hangs under the wheel and rises to the lift being worked. */
export const HOIST: Record<LoanId, { x: number; wheelH: number; haul: Pt }> = {
  a: { x: 104, wheelH: 236, haul: { x: 92, y: 490 } },
  b: { x: 896, wheelH: 236, haul: { x: 908, y: 490 } },
};

/** the pallet of bricks just inside the gate (its centre at ground level): where the builder loads the barrow */
export const STACK = both({ x: 128, y: 512 });
/** the garden fence along the front and the gap of each gate (x0 … x1) */
export const FENCE_Y = 530;
export const GATE: Record<LoanId, { x0: number; x1: number }> = {
  a: { x0: 150, x1: 186 },
  b: { x0: 814, x1: 850 },
};
/** the bench in each front garden (the seat's front edge, centre), facing us: where the crew rests at the end */
export const BENCH = both({ x: 318, y: 514 });
/** the chalk tally slate on the gate's outer post (one mark per full cart), its centre */
export const TALLY = both({ x: 140, y: 516 });

/** the lane along the front of both gardens */
export const LANE = { y0: 548, y1: 612 };
/**
 * The lender's carts. They come down the road from the village (ROAD_FAR, appearing from behind the hedge by the
 * blossom tree) to the junction with the lane, turn along it toward their house, wait at NEXT, move up to CART when
 * the cart ahead leaves, fill there, and are pulled on out of the picture at EXIT. Always pulled forward, never
 * reversed. Points are the cart's axle on the ground; the carter walks ahead of it between the shafts.
 */
export const ROAD_FAR: Pt = { x: 500, y: 404 };
export const JUNCTION: Pt = { x: 500, y: 572 };
export const CART = both({ x: 172, y: 576 });
export const NEXT = both({ x: 262, y: 576 });
export const EXIT = both({ x: -130, y: 580 });

/** the blossom tree between the plots (the foot of its trunk) */
export const BLOSSOM: Pt = { x: 500, y: 470 };

/** the crew's height (boots to cap top) at depth CREW_REF_Y; smaller with distance (depthScale) */
export const CREW_H = 92;
export const CREW_REF_Y = 500;
export const depthScale = (y: number): number => 1 + (y - CREW_REF_Y) * 0.0018;

/** identity accents (scarves, doors, the carts' lettering is the lender's own, not these) */
export const ACCENT: Record<LoanId, string> = {
  a: '#3F5E86',
  b: '#5E7D38',
};
