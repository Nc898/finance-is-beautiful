/**
 * The crew contract (coordinator-owned): the builder, the bricklayer and the lender's carters. The scene (index.ts)
 * decides WHAT each figure is doing every frame; the figure decides HOW to move there, smoothly and believably. The
 * scene never sets a pose or a position directly, so nobody can jump. (The same contract as the vine's gardener and
 * the snow's climber, whose skeleton, measured walk and turning these figures build on.)
 *
 * Continuity rules every figure guarantees:
 * - Position, facing and pose are continuous in time. Changing the intent never snaps anything: the figure finishes
 *   or blends out of the current action, then walks (eased start and stop) to where the new one happens. Turning
 *   round is a short turn through a three-quarter view, never a mirror flip.
 * - What it carries or pulls stays in its hands: the barrow's handles, the trowel, a brick, the cart's shafts. Things
 *   are put down and picked up with a visible reach; nothing appears in or vanishes from a hand.
 * - Feet keep step with the ground speed (no sliding, no running in place); on a ladder, hands and feet move rung by
 *   rung. Nothing passes through a body, a wall, a scaffold board, the fence, a cart or the barrow.
 * - In reduced motion there is no movement at all: the figure is drawn in the settled pose for the intent.
 * - `place(intent)` puts it straight into the settled pose for the intent, where it happens (no walking): used when
 *   the timeline is scrubbed, so the figure matches the moment shown. Normal motion carries on from there.
 */
import type { LoanId } from '../types';
import type { Pt } from './geom';

/* ------------------------------------------------------------------ the builder (ground, barrow and hoist) */

export type BuilderActivity =
  /**
   * The working loop, `pace` round trips per second: load the barrow at the pallet (STACK), wheel it out of the gate
   * to the side of the lender's cart (`cart`, its tipping point), tip the interest share (`split` of the load) into
   * it, wheel the rest back in to the hoist (HOIST.haul), load the bucket and haul the rope hand over hand until the
   * bucket reaches `lift`, tie off, and go back to the pallet. With no cart at the gate (`cart` null) it waits by the
   * gate with the barrow set down until one is there. `split` and `lift` are read as each step starts.
   */
  | 'haul'
  /** every payment made: set the barrow down by the pallet, walk to the bench (BENCH), sit, rest (a slow breath,
   *  a look up at the finished house) */
  | 'rest'
  /** stand easy by the pallet, hands on the barrow's handles (paused at month 0) */
  | 'idle';

export interface BuilderIntent {
  activity: BuilderActivity;
  /** haul: the share of each load for the lender's cart (0 … 1). */
  split: number;
  /** haul: round trips per second wanted (about 0.25 at 1x, × speed, capped by a brisk walk); 0 finishes the
   *  current trip and waits at the pallet. */
  pace: number;
  /** haul: the current cart's tipping point (world), from Carter.tipPoint(), or null when no cart waits at the gate. */
  cart: Pt | null;
  /** haul: the height (above SCAFFOLD.y) of the lift the bucket goes up to: the bricklayer's lift. */
  lift: number;
}

export interface Builder {
  readonly id: LoanId;
  /** Advance by dt seconds of wall clock toward the intent; `tSec` is the wall clock (breathing, idle life). */
  update(dtSec: number, intent: BuilderIntent, tSec: number, reduced: boolean): void;
  /**
   * Paint the builder, the barrow and its load, the bricks tumbling from it while tipping (they come to rest in the
   * cart, whose heap the carter draws from the money), and the hoist's rope and bucket (the scene draws the scaffold
   * and the gin wheel; the rope runs from the wheel to the bucket and down to the builder's hands or the tie-off
   * cleat on the outer standard). The caller has set the world-unit transform.
   */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Feet position (world units), for the scene's shadow and depth sorting. */
  feet(): Pt;
  place(intent: BuilderIntent): void;
}

/** Implemented in src/brick/scene/builder.ts */
export type CreateBuilder = (id: LoanId, spriteQ: number) => Builder;

/* ------------------------------------------------------------------ the bricklayer (on the scaffold) */

export type BricklayerActivity =
  /**
   * Lay at `target` (the next brick's or tile's place on the wall or roof, a point at the wall's face: x, and h, the
   * height above GROUND_Y), `pace` bricks per second: stand on the lift whose reach covers h (SCAFFOLD.reach),
   * facing the wall, take a brick from the stack on the boards beside it, butter it with the trowel, set it and tap
   * it down. When `target` moves along the course it steps along the boards; when it needs another lift it walks to
   * the ladder (SCAFFOLD_X.ladderX) and climbs rung by rung. Above the top lift's reach (the upper roof and the
   * chimney) it climbs the roof ladder (roofLadderX) and works from it. The scene places the bricks themselves from
   * the money; the bricklayer's hands show it happening.
   */
  | 'lay'
  /** every payment made: climb down, walk out to the bench and sit beside the builder (the outer end of it) */
  | 'rest'
  /** stand easy on the ground by the foot of the ladder, trowel in hand (paused at month 0) */
  | 'idle';

export interface BricklayerIntent {
  activity: BricklayerActivity;
  /** lay: the place being laid now: x (world) and h (height above GROUND_Y at the wall's face), or null. */
  target: { x: number; h: number } | null;
  /** lay: bricks per second wanted (0 … 3); 0 stands ready at the target. */
  pace: number;
}

export interface Bricklayer {
  readonly id: LoanId;
  update(dtSec: number, intent: BricklayerIntent, tSec: number, reduced: boolean): void;
  /** Paint the bricklayer (and the brick and trowel in hand). The caller has set the world-unit transform. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Feet position: x and the depth y on the ground (SCAFFOLD.y while on the boards), and h, the height of the
   *  boards or rung it stands on (0 on the ground), for the scene's layering between the scaffold's back and front. */
  feet(): { x: number; y: number; h: number };
  place(intent: BricklayerIntent): void;
}

/** Implemented in src/brick/scene/bricklayer.ts */
export type CreateBricklayer = (id: LoanId, spriteQ: number) => Bricklayer;

/* ------------------------------------------------------------------ the lender's carter and cart */

export type CarterActivity =
  /** pull the (empty) cart from where it is along the route (ROAD_FAR → JUNCTION → along the lane) to `spot` and
   *  stop there, the cart's axle on the spot, facing on toward the exit */
  | 'arrive'
  /** stand by the shafts at `spot` while the cart fills: easy, a look at a pocket watch now and then */
  | 'wait'
  /** take up the shafts and pull the cart on out of the picture at EXIT; then `gone` is true */
  | 'leave';

export interface CarterIntent {
  activity: CarterActivity;
  /** arrive / wait: where the cart's axle stops (CART or NEXT in geom.ts). */
  spot: Pt | null;
  /** How full the cart is (0 … 1): the heap of bricks in it, painted area proportional. */
  fill: number;
}

export interface Carter {
  readonly id: LoanId;
  update(dtSec: number, intent: CarterIntent, tSec: number, reduced: boolean): void;
  /** Paint the carter and the cart with its heap. The caller has set the world-unit transform. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** The cart's axle point (world), for depth sorting, and the point on its bed where the builder tips (the side
   *  facing the gate, at the bed's height). */
  feet(): Pt;
  tipPoint(): Pt;
  /** Pulled out of the picture: the scene drops this carter. */
  readonly gone: boolean;
  place(intent: CarterIntent): void;
}

/**
 * Implemented in src/brick/scene/carter.ts. `start` is where it first appears: ROAD_FAR for a cart sent for, or the
 * spot itself for the carts already waiting when the scene is placed (scrub, first frame).
 */
export type CreateCarter = (id: LoanId, start: Pt, spriteQ: number) => Carter;
