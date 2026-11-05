/**
 * World geometry for A Little Off the Top (world 1000 × 640; x right, y down; the ground at the trees is GROUND_Y).
 * Light from the upper left, as in every demonstration of the collection.
 */
import type { FundId } from '../types';

export const WORLD = { width: 1000, height: 640 } as const;

/** the camera always shows this (both trees at their full no-fee size, both woodpiles, the front of the meadow) */
export const VIEW = { x0: 40, x1: 960, y0: 150, y1: 600 } as const;

/** the horizon (the far hills sit on it) and the wood's edge behind the clearing */
export const HORIZON = 352;
export const WOOD_EDGE = 392;

/** the two trees: trunk foot in world units; k = world units per tree unit (a mature tree is 560 tree units tall) */
export const TREES: Record<FundId, { x: number; y: number }> = { a: { x: 328, y: 532 }, b: { x: 672, y: 532 } };
export const TREE_K = 0.66;
/** both funds are the same tree (the same seed), so they compare directly */
export const TREE_SEED = 90731;

/** the woodpiles: the centre of each stack's foot */
export const PILES: Record<FundId, { x: number; y: number }> = { a: { x: 118, y: 556 }, b: { x: 882, y: 556 } };
/** the stack: logs per row and rows (cols × rows = LOGS_AT_END) and the radius of a log end */
export const PILE = { cols: 11, rows: 5, r: 6.6 } as const;
