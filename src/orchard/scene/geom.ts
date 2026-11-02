/**
 * World geometry for "Low-Hanging Fruit" (coordinator-owned: the scene, the young orchards and the pickers all rely
 * on it). World units: x right, y DOWN, 1000 x 640 nominal view; wider screens see a little more on each side.
 *
 * A late-summer afternoon on a fruit farm. In the middle, in front, the farmer's old apple tree (the employer),
 * heavy with red apples, its low boughs reaching out over the grass to either side. Picker A works on the left,
 * picker B on the right, the mirror image in plan but lit from the same side (the sun is upper left, so shading is
 * never mirrored). Behind each picker's side of the path, its own young orchard: six rows of six slots, planted from
 * the back row forward, each row from the outer end inward, so the oldest (biggest) trees stand at the back and the
 * newest come up nearest us. At each outer front corner, the picker's crates of golden apples (its pay).
 *
 * The picker's round: fill the basket with its own golden apples at the crates, carry it along the path to the
 * farmer's tree and pick the red apples it has earned from the low bough, then carry the basket into its orchard to
 * the newest tree and tip it out at its foot, and back to the crates.
 *
 * The ground is a plane seen in oblique view, as in the vine and the brick: y is depth (farther = higher on the page
 * = smaller). A point `h` above the ground at depth y is drawn at screen y − h.
 */
import type { PickerId } from '../types';

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

const mirror = (p: Pt): Pt => ({ x: WORLD.width - p.x, y: p.y });
const both = (a: Pt): Record<PickerId, Pt> => ({ a, b: mirror(a) });
const bothRect = (r: Rect): Record<PickerId, Rect> => ({ a: r, b: { x0: WORLD.width - r.x1, x1: WORLD.width - r.x0, y0: r.y0, y1: r.y1 } });

/** the people's height (boots to hat top) at depth FIGURE_REF_Y, about 1.75 m; smaller with distance (depthScale) */
export const FIGURE_H = 64;
export const FIGURE_REF_Y = 500;
export const depthScale = (y: number): number => 1 + (y - FIGURE_REF_Y) * 0.0018;

/* ------------------------------------------------------------------ the farmer's tree (the employer) */

/** the foot of the old tree's trunk; its crown rises to about y 110 and spreads about ±200 */
export const FARM_TREE: Pt = { x: 500, y: 488 };

/**
 * The low bough on each side, where the free fruit hangs: a branch from the trunk out to the tip, the fruit hanging
 * from it between x0 and x1 (world x), at heights hLow … hHigh above the ground at depth y. A picker standing at PICK
 * reaches all of it without a ladder (that is the point: low-hanging fruit).
 */
export const BOUGH: Record<PickerId, { x0: number; x1: number; y: number; hLow: number; hHigh: number }> = {
  a: { x0: 396, x1: 458, y: 492, hLow: 44, hHigh: 92 },
  b: { x0: 542, x1: 604, y: 492, hLow: 44, hHigh: 92 },
};
/** where the picker stands to pick (feet), just in front of and outside the bough, facing in toward the trunk */
export const PICK = both({ x: 404, y: 510 });
/** the grass under each bough where the fruit nobody picks lands, lies and rots */
export const WINDFALL = bothRect({ x0: 384, x1: 470, y0: 486, y1: 518 });

/* ------------------------------------------------------------------ the pickers' own orchards */

export const ROWS = 6;
export const COLS = 6;
/** the depth of each row of slots, back (first planted) to front */
export const ROW_Y = [354, 374, 396, 420, 446, 474] as const;
/** the slots' x on A's side, outer to inner (odd rows are set half a gap inward, as orchards are planted) */
const COL_X = [70, 126, 182, 238, 294, 350] as const;
const STAGGER = 14;

/**
 * Every slot of each orchard in planting order: slot k is row ⌊k / COLS⌋ (from the back), column k mod COLS (from
 * the outer end). The point is the foot of the trunk. B's are A's mirrored. Slot k is where tree k (TreePlan.index)
 * comes up.
 */
export const SLOTS: Record<PickerId, Pt[]> = (() => {
  const a: Pt[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) a.push({ x: COL_X[c] + (r % 2 ? STAGGER : 0), y: ROW_Y[r] });
  return { a, b: a.map(mirror) };
})();

/**
 * The young trees' sizes: a tree of size 1 (the largest any tree reaches, YoungTree.size) stands TREE_MAX.h tall
 * (ground to crown top) with a crown TREE_MAX.w across, at depth FIGURE_REF_Y (scaled by depthScale). About 3.4 m:
 * an apple tree on a dwarfing rootstock in its prime. Crown area is proportional to size, so a size-0.25 tree is
 * half as tall and half as wide. The crowns of neighbours touch and overlap a little when grown, as in a real orchard.
 */
export const TREE_MAX = { h: 124, w: 92 } as const;

/** the path along the front of both orchards, where the pickers walk between the crates and the farmer's tree */
export const PATH = { y0: 498, y1: 530 } as const;
/** the picker's crates of golden apples (its pay), the front of the stack at ground level: where the basket is filled */
export const CRATES = both({ x: 74, y: 548 });
/** where the picker stands to fill the basket (facing the crates, outward) */
export const FILL = both({ x: 104, y: 546 });
/** where the picker sits at the end: on an upturned crate beside the stack, looking up at its orchard */
export const SEAT = both({ x: 132, y: 556 });
/** the farmer's ladder leaning against the old tree (a prop: nobody needs it for the low bough) */
export const LADDER = { foot: { x: 548, y: 496 }, top: { x: 584, y: 330 } } as const;

/** the farm track along the very front */
export const TRACK = { y0: 578, y1: 622 } as const;

/** identity accents (neckerchiefs, the basket's ribbon, the crates' stencil): the same blue and green as Brick */
export const ACCENT: Record<PickerId, string> = {
  a: '#3F5E86',
  b: '#5E7D38',
};

/** the two varieties: the picker's own trees bear golden apples, the farmer's (the match) red */
export const APPLE = {
  own: { light: '#F2D46A', mid: '#D9AE3A', deep: '#A97F22' },
  match: { light: '#E0644A', mid: '#B83A2C', deep: '#7E2420' },
} as const;
