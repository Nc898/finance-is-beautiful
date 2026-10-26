/**
 * The climber contract (coordinator-owned). The scene (index.ts) decides WHAT each climber is doing every frame;
 * the climber (climber.ts) decides HOW to move there, smoothly and believably. The scene never sets a pose or a
 * position directly, so the climber can never jump. (The same contract as the vine's gardener, whose skeleton,
 * measured walk and turning the climber builds on.)
 *
 * Continuity rules the climber guarantees:
 * - Position, facing and pose are continuous in time. Changing the intent never snaps anything: the climber
 *   finishes or blends out of the current action, then walks (eased start and stop) to where the new one happens.
 *   Turning round is a short turn through a three-quarter view, never a mirror flip.
 * - While pushing, both mittens stay on the ball's uphill side (they never sink into it or float off it), the body
 *   leans into the push, and the feet keep step with the ball's speed (no sliding, no running in place).
 * - The climber never walks through a ball: to reach the uphill side of a ball it walks round it.
 * - In reduced motion there is no movement at all: the climber is drawn in the settled pose for the intent.
 */
import type { StrategyId } from '../types';

export type ClimberActivity =
  /**
   * push the target ball down its lane: walk to stand on its uphill side (behind it, `dir` points downhill),
   * put both mittens on it at about its widest, lean in, and follow it as it moves, stepping at its speed.
   * `target` is the ball's ground contact point and `radius` its radius this frame (both change every frame).
   */
  | 'push'
  /** a debt just broke up in the snowbank: a short, glad moment where the climber stands (arms up, or a fist and a
   *  nod), about 1.2 s, then on to the next intent. The scene holds this intent for that long. */
  | 'cheer'
  /** every debt is cleared: walk to the sledge (REST), sit on it, rest (a slow breath, a look round, mittens on knees) */
  | 'rest'
  /** stand easy where you are (the story's opening, or paused before the first month) */
  | 'idle';

export interface ClimberIntent {
  activity: ClimberActivity;
  /** push: the target ball's ground contact point (world units). Ignored otherwise. */
  target: { x: number; y: number } | null;
  /** push: the unit vector down the ball's lane (toward the snowbank). */
  dir: { x: number; y: number } | null;
  /** push: the ball's radius this frame (world units), for where the mittens go and how far behind to stand. */
  radius: number;
}

export interface Climber {
  readonly id: StrategyId;
  /**
   * Advance by dt seconds toward the intent. `tSec` is the wall clock (for breathing and other idle motion).
   * With `reduced`, settle immediately into the intent's still pose (no walking).
   */
  update(dtSec: number, intent: ClimberIntent, tSec: number, reduced: boolean): void;
  /** Paint at the current pose. The caller has set the world-unit transform. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** True while both mittens are on the target ball (pushing): the scene sheds snow from the ball's back then. */
  readonly pushing: boolean;
  /** Feet position (world units), for the scene's shadow and depth sorting. */
  feet(): { x: number; y: number };
  /**
   * Put the climber straight into the settled pose for this intent, where it happens (no walking): used when the
   * timeline is scrubbed, so the climber matches the moment shown. Normal motion carries on from there.
   */
  place(intent: ClimberIntent): void;
}

/** Implemented in src/snow/scene/climber.ts */
export type CreateClimber = (id: StrategyId, spriteQ: number) => Climber;
