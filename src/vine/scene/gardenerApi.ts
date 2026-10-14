/**
 * The gardener contract (coordinator-owned). The scene (index.ts) decides WHAT each gardener is doing every
 * frame; the gardener (gardener.ts) decides HOW to move there, smoothly and believably. The scene never sets a
 * pose or a position directly, so the gardener can never jump.
 *
 * Continuity rules the gardener guarantees:
 * - Position, facing and pose are continuous in time. Changing the intent never snaps anything: the gardener
 *   finishes or blends out of the current action, then walks (eased start and stop) to where the new one
 *   happens. Turning round is a short turn through a three-quarter view, never a mirror flip.
 * - Tools are always held (or set down / picked up with a visible reach). The shears open and close only in a
 *   hand; the rake only moves in both hands.
 * - Snips happen only while standing in reach of the target; the scene removes vine only at a snip.
 * - In reduced motion there is no movement at all: the gardener is drawn in the settled pose for the intent.
 */
import type { PlanId } from '../types';

export type GardenerActivity =
  /** walk to stand in reach of `target` on the wall and cut there, `pace` snips per second */
  | 'prune'
  /** walk to the pile and rake clippings onto it, `pace` strokes per second */
  | 'rake'
  /** the vine is cleared: put the shears in the apron, walk to the bench, sit, rest (a slow breath, a look round) */
  | 'rest'
  /** stand easy where you are, shears in hand (the story's opening, or paused before the first month) */
  | 'idle';

export interface GardenerIntent {
  activity: GardenerActivity;
  /** prune: the point on the wall to cut at (world units). The gardener stands on the path in reach of it. */
  target: { x: number; y: number } | null;
  /** prune: snips per second wanted (0 … 3); rake: strokes per second (0 … 1.5). Ignored otherwise. */
  pace: number;
}

export interface Gardener {
  readonly id: PlanId;
  /**
   * Advance by dt seconds of wall clock toward the intent. `tSec` is the wall clock (for breathing and other
   * idle motion). With `reduced`, settle immediately into the intent's still pose (no walking).
   */
  update(dtSec: number, intent: GardenerIntent, tSec: number, reduced: boolean): void;
  /** Paint at the current pose. The caller has set the world-unit transform. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** The shears' blade tip this frame (world units): where a snipped piece of vine falls from. */
  shears(): { x: number; y: number };
  /** Snips completed since creation; the scene drops a clipping at `shears()` each time this goes up. */
  readonly snips: number;
  /** Rake strokes completed since creation; the scene pushes fallen clippings onto the pile each time. */
  readonly strokes: number;
  /** True while standing in reach of the current prune target with the shears up (cutting can happen). */
  readonly working: boolean;
  /** Feet position (world units), for the scene's shadow and depth sorting. */
  feet(): { x: number; y: number };
}

/** Implemented in src/vine/scene/gardener.ts */
export type CreateGardener = (id: PlanId, spriteQ: number) => Gardener;
