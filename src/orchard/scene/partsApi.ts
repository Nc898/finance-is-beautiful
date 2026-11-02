/**
 * The contracts between the scene's orchestrator (index.ts) and its two big parts (coordinator-owned): the young
 * orchards (orchard.ts) and the pickers with the fruit they handle (picker.ts). The orchestrator decides WHAT
 * happens every frame from the money; each part decides HOW to show it. The orchestrator never sets a pose, a
 * position or an apple directly, so nothing can jump.
 */
import type { PickerId, YoungTree } from '../types';
import type { Pt } from './geom';

/** Something drawn in depth order: the ground y it stands on, and how to draw it (the caller has set the
 *  world-unit transform). The orchestrator sorts every item of the frame by depth, far to near. */
export interface Item {
  depth: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

/* ------------------------------------------------------------------ the young orchards */

/**
 * One picker's orchard: a young apple tree at SLOTS[id][tree.index] for every tree planted so far. Golden-apple
 * trees (variety 'own') and red-apple trees ('match') are the same kind of tree in the same late-summer leaf; the
 * fruit tells them apart (and a small painted label on the red trees' stakes in the farmer's colours, so identity is
 * never by colour alone).
 *
 * Rules every tree keeps:
 * - Crown painted area proportional to `size` (TREE_MAX in geom.ts is size 1), the same scale on both plots. A tree
 *   never shrinks while time runs forward; scrubbing back simply shows the earlier size.
 * - A new tree comes up as a seedling where the basket was tipped (a shoot, two leaves, then a whip with a stake and
 *   a tie), growing smoothly; nothing pops into being. Fruit comes with age (from about two years), more as it grows.
 * - The same frame inputs give the same picture (determinism): each slot has its own seed for its shape.
 */
export interface OrchardView {
  readonly id: PickerId;
  /** Paint (or reuse) what the trees need at this pixel density (world units → device px), between frames:
   *  `tick` yields to the browser, `check` returns false when the work is stale (a new size). */
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** The trees as depth-sorted items for this frame (one item per tree, its depth the slot's y). `windMs` is the
   *  wall clock for a gentle stir of the leaves (0 in reduced motion). */
  items(trees: readonly YoungTree[], windMs: number): Item[];
}

/** Implemented in src/orchard/scene/orchard.ts */
export type CreateOrchardView = (id: PickerId) => OrchardView;

/* ------------------------------------------------------------------ the pickers */

/**
 * A picker and everything its hands touch: the basket and the apples in it, the free fruit ripening on its side's
 * low bough (BOUGH), the apples it picks, the apples nobody picks dropping into the grass (WINDFALL) and slowly
 * rotting there, and the apples tipped at the foot of the newest tree (they sink into the grass as the seedling
 * comes up). The scene draws the farmer's tree itself (trunk, boughs, crown and its high fruit); the picker part
 * draws the low fruit hanging from its bough.
 *
 * Continuity rules (as the brick's crew and the vine's gardener):
 * - Position, facing and pose are continuous in time. Changing the intent never snaps anything: the picker finishes
 *   or blends out of the current action, then walks (eased start and stop) to where the next one happens. Turning
 *   round is a short turn through a three-quarter view, never a mirror flip. Every transition blends over ≥ 0.25 s.
 * - The basket stays in its hands or on its arm; apples go from crate to basket, bough to hand to basket, basket to
 *   ground, each with a visible reach; nothing appears in or vanishes from a hand.
 * - Feet keep step with the ground speed (no sliding); nothing passes through a trunk, a crate or the other figure.
 * - In reduced motion there is no movement at all: everything is drawn settled for the intent (the picker by the
 *   bough with a basket of the right fill; the windfalls lying, no fruit falling).
 * - `place(intent)` puts it straight into the settled state for the intent (used when the timeline is scrubbed).
 */
export type PickerActivity =
  /**
   * The round, `pace` rounds per second: at FILL, fill the basket with golden apples from the crates (`basket.own`
   * of a full basket); walk the path to PICK and pick red apples from the bough, apple by apple, stepping along it,
   * until it has picked `picked` of what hangs there; walk into the orchard to the foot of slot `planting` (along
   * the path, then up between the columns of trees) and tip the basket out there; walk back to FILL. The bough
   * ripens `offer` of a full basket each round; what is left hanging when the picker turns away falls into the
   * grass, apple by apple, over the next moments (so on A's side, about half of every round's free fruit drops).
   * `basket`, `offer`, `picked` and `planting` are read as each step starts.
   */
  | 'work'
  /** the whole time has run: set the basket down by the crates, sit on the upturned crate (SEAT), take an apple,
   *  look up at the orchard; a slow breath now and then */
  | 'rest'
  /** stand easy by the crates, the empty basket on the arm (paused at month 0) */
  | 'idle';

export interface PickerIntent {
  activity: PickerActivity;
  basket: { own: number; match: number };
  offer: number;
  picked: number;
  /** the slot to tip at (SLOTS[id][planting]) or −1 (then it tips at the first slot) */
  planting: number;
  /** work: rounds per second wanted (about 0.12 at 1x, × speed, capped by a brisk walk); 0 finishes the round and
   *  waits at the crates. */
  pace: number;
  /** months passing per second (0 when paused): the low fruit ripens with the months, so the windfalls keep pace
   *  with the money even when the picker cannot. */
  monthsPerSecond: number;
}

export interface Picker {
  readonly id: PickerId;
  /** Paint (or reuse) the figure's parts at this pixel density, between frames (as OrchardView.prepare). */
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** Advance by dt seconds of the crew clock toward the intent; `tSec` is the wall clock (breathing, idle life). */
  update(dtSec: number, intent: PickerIntent, tSec: number, reduced: boolean): void;
  /** The depth-sorted items for this frame: the picker (with the basket), the low fruit on the bough (at the
   *  bough's depth), the windfalls and the tipped apples on the grass (each at its own depth, under anything
   *  standing nearer). */
  items(): Item[];
  /** Feet position (world units), for the shadow and the label. */
  feet(): Pt;
  place(intent: PickerIntent): void;
}

/** Implemented in src/orchard/scene/picker.ts */
export type CreatePicker = (id: PickerId) => Picker;
