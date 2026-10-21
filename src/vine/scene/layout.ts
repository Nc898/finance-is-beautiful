/**
 * Where the scene's own things stand (the coordinator's geom.ts fixes the cottages, piles, benches and the
 * gardeners' reach; this file fixes everything else we paint on the lawn). World units.
 */
import type { PlanId } from '../types';
import { COTTAGE, GROUND_Y, PILE } from './geom';

/** the low picket fence that closes the side yard between the cottages, with a gate in the middle */
export const FENCE = { y: 489, x0: 420, x1: 580, gate0: 485, gate1: 515, h: 24 } as const;
/** the centre of the flagstone path through the gate, going back into the side yard and forward to the viewer */
export const LANE = { x: 500, yBack: 322 } as const;

/**
 * The low drystone garden wall at the outer edge of each garden. It ends just behind the leaf pile: the leaves fall
 * at the cottage, behind the wall's line, and are raked forward to the pile, so a longer wall would stand across
 * the gardener's way (and the raked leaves') to the pile, the rake and the bench. Its outer end runs far past the
 * edge of the widest view (the side panel can be collapsed on a wide screen).
 */
export const WALL_STUB: Record<PlanId, { x0: number; x1: number; yBase: number; h: number }> = {
  minimum: { x0: -1100, x1: 80, yBase: 556, h: 30 },
  fixed: { x0: 920, x1: 2100, yBase: 556, h: 30 },
};

/** where the rake leans when nobody is using it: foot on the ground, top against the garden wall (world units) */
export const RAKE_LEAN: Record<PlanId, { foot: { x: number; y: number }; top: { x: number; y: number } }> = {
  minimum: { foot: { x: 66, y: 562 }, top: { x: 52, y: 502 } },
  fixed: { foot: { x: 934, y: 562 }, top: { x: 948, y: 502 } },
};

/** x of the door walk (centre of the door) */
export const doorX = (id: PlanId): number => (COTTAGE[id].door.x0 + COTTAGE[id].door.x1) / 2;

/** the half width of the central flagstone path at y (it narrows into the side yard, widens toward us) */
export const laneHalf = (y: number): number => (y >= FENCE.y ? 17 + (y - FENCE.y) * 0.105 : 6 + (y - LANE.yBack) * 0.06);
/** the half width of a door walk at y */
export const doorWalkHalf = (y: number): number => 19 + Math.max(0, y - GROUND_Y) * 0.09;

/** centres of the big trees (trunk foot, crown centre and radii) used for the scene and the falling leaves */
export interface TreeSpec {
  seed: number;
  x: number;
  y: number;
  /** crown centre and radii */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  trunk: number;
  mix: ReadonlyArray<readonly [string, number]>;
  haze: number;
  /** how the tree is painted (trees.ts): world units per tree unit, maturity, foliage kit, mirrored */
  look?: { k: number; m: number; kit: 'maple' | 'gold' | 'mixed'; flip?: boolean };
}
/**
 * The crowns are Time to Grow's trees in autumn dress: a mature one is 560 tree units tall with its dome from
 * 35 % up, so with k world units per tree unit the crown centre is 378 k above the foot, its half width 190 k and
 * its half height 182 k. The two big ones stand just outside the cottages (their crowns spill into the sky
 * over the corners); the third stands at the far end of the side yard, seen between the roofs.
 */
export const TREES: TreeSpec[] = [
  { seed: 4101, x: -4, y: 470, cx: -2, cy: 175, rx: 146, ry: 140, trunk: 20, haze: 0, mix: [['crimson', 3], ['rust', 4], ['amber', 3], ['gold', 1]], look: { k: 0.78, m: 1, kit: 'maple' } },
  { seed: 5207, x: 1004, y: 474, cx: 1004, cy: 172, rx: 150, ry: 144, trunk: 20, haze: 0, mix: [['gold', 4], ['amber', 4], ['rust', 2], ['olive', 1]], look: { k: 0.8, m: 1, kit: 'gold', flip: true } },
  { seed: 6313, x: 520, y: 320, cx: 520, cy: 169, rx: 76, ry: 73, trunk: 10, haze: 0.14, mix: [['gold', 4], ['olive', 2], ['amber', 2]], look: { k: 0.4, m: 1, kit: 'mixed' } },
  { seed: 3307, x: 462, y: 326, cx: 462, cy: 213, rx: 57, ry: 55, trunk: 8, haze: 0.2, mix: [['gold', 3], ['amber', 2]], look: { k: 0.3, m: 1, kit: 'gold' } },
  { seed: 7733, x: 574, y: 330, cx: 574, cy: 228, rx: 51, ry: 49, trunk: 8, haze: 0.22, mix: [['rust', 2], ['amber', 2], ['crimson', 1]], look: { k: 0.27, m: 1, kit: 'maple', flip: true } },
];

/** the pile's lawn spot, for convenience */
export const pileAt = (id: PlanId): { x: number; y: number } => PILE[id];
