/**
 * World geometry for "Bread and Butter" (coordinator-owned: the shop, the board, the basket and the grocer all rely
 * on it). World units: x right, y DOWN, 1000 × 640 nominal view; wider screens see a little more of the walls at each
 * side (paint the room past 0 and 1000).
 *
 * Inside a small corner grocery on a rainy morning, looking at the counter. Back to front, the layers are FIXED
 * (an interior, not an open ground, so there is no general depth sort):
 *   1. the back wall: the shelves (SHELVES) in the middle, the chalkboard (BOARD) on the right, the window and the
 *      street (WINDOW) on the left, the lamps (LAMPS) hanging from the ceiling;
 *   2. the grocer, standing on the floor behind the counter (GROCER_FLOOR_Y), and, when he steps past the counter's
 *      end to reach the board, in front of the board;
 *   3. the counter (COUNTER), which hides his legs while he is behind it;
 *   4. the basket on the counter top (BASKET_SLOTS), the scale and the till, and whatever is in his hands when he
 *      reaches over the counter (drawn after the counter);
 *   5. the foreground: crates of produce at the bottom corners (CRATES) and the floor at the front.
 *
 * The light: warm pendant lamps over the counter, cool daylight from the window on the left. The house rule (light
 * from the upper left) holds: the window is the key light's side.
 */
import type { ItemKey } from '../types';

export const WORLD = {
  width: 1000,
  height: 640,
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

/* ------------------------------------------------------------------ the room */

/** where the back wall meets the floor (behind the counter; mostly hidden by it) */
export const WALL_FOOT_Y = 548;
/** the shop window and the street seen through it (rain on the glass) */
export const WINDOW: Rect = { x0: 26, x1: 252, y0: 64, y1: 470 };
/** the wooden shelves on the back wall (tins, jars, packets, sacks) */
export const SHELVES: Rect = { x0: 282, x1: 700, y0: 52, y1: 420 };
/** the pendant lamps: where each hangs and where its shade is */
export const LAMPS: { x: number; shadeY: number }[] = [
  { x: 330, shadeY: 92 },
  { x: 590, shadeY: 92 },
];

/* ------------------------------------------------------------------ the chalkboard */

/** the slate inside its frame, on the back wall to the right of the shelves */
export const BOARD: Rect = { x0: 728, x1: 962, y0: 96, y1: 404 };

/** the board's lines (world y of each line's baseline) and its columns (the item's name from nameX; the price right-
 *  aligned to priceX; the year centred on the board). 'title' is painted once ("This week's basket"), never re-chalked. */
export const BOARD_LINES: Record<'title' | 'year' | ItemKey | 'total', number> = {
  title: 128,
  year: 168,
  bread: 206,
  eggs: 236,
  coffee: 266,
  bananas: 296,
  chicken: 326,
  flour: 356,
  total: 392,
};
export const BOARD_COLUMNS = { nameX: 748, priceX: 944, ruleY: 372 } as const;
/** chalk cap height (world units): the item lines, the year (larger) and the total */
export const CHALK_SIZE = { line: 17, year: 26, total: 19 } as const;

/* ------------------------------------------------------------------ the counter and what is on it */

/** the counter: its top surface from the back edge (topBack) to the front edge (topFront), its front face down to
 *  the floor (floorFront) */
export const COUNTER = { x0: 104, x1: 690, topBack: 428, topFront: 458, floorFront: 604 } as const;
/** the old till at the left end of the counter, and the brass scale at the right end (both on the counter top) */
export const TILL: Pt = { x: 160, y: 444 };
export const SCALE: Pt = { x: 640, y: 446 };

/**
 * Where each item of the basket lies on the counter top (the base centre of its group) and how wide its group may
 * spread. BASKET_LIMITS in types.ts never asks for more than fits: loaves side by side; egg cartons stacked; a coffee
 * tin or bag per pound; bananas in bunches (a 3 lb bunch, a second bunch beside it); a whole chicken in butcher's
 * paper (one bird up to 3 lb, a second from 4 lb); a 5 lb flour sack (a second sack from 6 lb).
 */
export const BASKET_SLOTS: Record<ItemKey, Pt & { width: number }> = {
  bread: { x: 232, y: 446, width: 70 },
  eggs: { x: 304, y: 448, width: 46 },
  coffee: { x: 360, y: 446, width: 40 },
  bananas: { x: 424, y: 448, width: 66 },
  chicken: { x: 498, y: 448, width: 70 },
  flour: { x: 574, y: 446, width: 58 },
};

/* ------------------------------------------------------------------ the grocer */

/** his height, boots to the top of his head (about 1.75 m); the counter top comes to about his hip */
export const GROCER_H = 300;
/** the floor he stands on behind the counter (his feet's y) */
export const GROCER_FLOOR_Y = 540;
/**
 * Where he stands (feet x, on GROCER_FLOOR_Y): at the counter's middle to tidy the basket; at its left end by the
 * till; and at the board, past the counter's right end (his legs show there), facing it in a three-quarter view with
 * the chalk in his right hand. Every line is in reach from there: the year by reaching up, the total by stooping a
 * little.
 */
export const GROCER_SPOTS = {
  counter: 420,
  till: 196,
  board: 712,
} as const;
/** his easy shop pace (world units per second), for the walk's cadence */
export const GROCER_WALK_SPEED = 120;

/* ------------------------------------------------------------------ the foreground */

/** crates of produce framing the bottom corners, in front of the counter */
export const CRATES: { x: number; y: number; kind: 'apples' | 'potatoes' | 'greens' }[] = [
  { x: 40, y: 600, kind: 'potatoes' },
  { x: 118, y: 628, kind: 'apples' },
  { x: 900, y: 610, kind: 'greens' },
  { x: 968, y: 632, kind: 'apples' },
];

/** The view the camera fits (as Brick's layout.ts): the whole shop, never zoomed in. */
export const VIEW: Rect = { x0: 0, x1: 1000, y0: 30, y1: 640 };
