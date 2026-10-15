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

/** the low drystone garden wall at the outer edge of each garden, by the pile; the rake leans on it */
export const WALL_STUB: Record<PlanId, { x0: number; x1: number; yBase: number; h: number }> = {
  minimum: { x0: -70, x1: 226, yBase: 556, h: 30 },
  fixed: { x0: 774, x1: 1070, yBase: 556, h: 30 },
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
}
export const TREES: TreeSpec[] = [
  { seed: 4101, x: 24, y: 350, cx: 22, cy: 178, rx: 112, ry: 96, trunk: 17, haze: 0, mix: [['crimson', 3], ['rust', 4], ['amber', 3], ['gold', 1]] },
  { seed: 5207, x: 992, y: 352, cx: 986, cy: 172, rx: 118, ry: 100, trunk: 18, haze: 0, mix: [['gold', 4], ['amber', 4], ['rust', 2], ['olive', 1]] },
  { seed: 6313, x: 500, y: 322, cx: 500, cy: 248, rx: 80, ry: 64, trunk: 10, haze: 0.2, mix: [['gold', 4], ['olive', 2], ['amber', 2]] },
];

/** the pile's lawn spot, for convenience */
export const pileAt = (id: PlanId): { x: number; y: number } => PILE[id];
