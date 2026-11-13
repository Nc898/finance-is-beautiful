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
 *   5. the produce stands on the floor at each side of the counter (PRODUCE_STANDS), drawn with the room, behind the
 *      grocer and the counter's ends;
 *   6. the foreground: crates of produce at the bottom corners (CRATES) and the floor at the front.
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

/* ------------------------------------------------------------------ the price board */

/** the dark board inside its frame, on the back wall to the right of the shelves (the frame is drawn outside it: a
 *  side member FRAME wide, and the painted top rail above, which carries the title) */
export const BOARD: Rect = { x0: 728, x1: 962, y0: 96, y1: 404 };
export const BOARD_FRAME = { side: 13, rail: 30 } as const;

/** a size of flap cell (world units): the face, and the gap to its neighbour */
export interface FlapSize {
  w: number;
  h: number;
  gap: number;
}

/**
 * The split flaps. Every price is PRICE_CELLS cells, right-aligned to priceRight (unused cells blank); the year is
 * YEAR_CELLS digit cells centred on the board; the six rows run down from rowTops (ITEM_KEYS order), then the painted
 * rule and the total. The item's name is painted on an enamel strip from nameX to the first cell of its row.
 */
export const PRICE_CELLS = 8;
export const YEAR_CELLS = 4;
export const BOARD_FLAPS = {
  year: { w: 18, h: 30, gap: 1.8 } as FlapSize,
  row: { w: 14.6, h: 25, gap: 1.2 } as FlapSize,
  total: { w: 15.6, h: 28, gap: 1.3 } as FlapSize,
  /** top y of the year cells, of each item's row (ITEM_KEYS order) and of the total's */
  yearTop: 107,
  rowTops: [150, 183, 216, 249, 282, 315] as readonly number[],
  totalTop: 360,
  /** the painted rule between the rows and the total */
  ruleY: 352,
  /** right edge of the last price cell, and the left edge of the name strips */
  priceRight: 952,
  nameX: 748,
} as const;

/** (kept for the grocer's old reach to the board until its rewrite lands) each line's baseline and the columns */
export const BOARD_LINES: Record<'title' | 'year' | ItemKey | 'total', number> = {
  title: 128,
  year: 137,
  bread: 175,
  eggs: 208,
  coffee: 241,
  bananas: 274,
  chicken: 307,
  flour: 340,
  total: 388,
};
export const BOARD_COLUMNS = { nameX: BOARD_FLAPS.nameX, priceX: BOARD_FLAPS.priceRight, ruleY: BOARD_FLAPS.ruleY } as const;

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

/**
 * Stepped wooden produce stands on the floor at each side of the counter, in front of the back wall at about the
 * counter's depth (x: centre, y: where the feet stand, w: width at the foot, h: height with the produce heaped on it,
 * about chest high on the grocer). The left one stands clear of the window's glass (its top is below the sill) and the
 * counter's end; the right one fills the floor between the counter and the greens crate, its top under the board's
 * bottom frame (BOARD.y1 + BOARD_FRAME.side). The foreground crates stand in front of both.
 */
export interface ProduceStand {
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'left' | 'right';
}
export const PRODUCE_STANDS: ProduceStand[] = [
  { x: 37, y: 557, w: 118, h: 146, side: 'left' },
  { x: 801, y: 577, w: 158, h: 146, side: 'right' },
];

/** The view the camera fits (as Brick's layout.ts): the whole shop, never zoomed in. */
export const VIEW: Rect = { x0: 0, x1: 1000, y0: 30, y1: 640 };
