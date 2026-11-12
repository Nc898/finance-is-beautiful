/**
 * The contracts between the scene's orchestrator (index.ts) and its two living parts (coordinator-owned): the price
 * board (board.ts) and the grocer with the basket he handles (grocer.ts, basket.ts, and the till's and the scale's
 * moving parts). The orchestrator decides WHAT the board and the counter should show from the month and the reader's
 * basket.
 *
 * The board keeps time with the labels: it is a split-flap price board, a mechanism on the wall, and its flaps
 * click over to each month's prices as the timeline moves, so the board and the numbers under the scene always say
 * the same thing. The grocer no longer touches it: his work is the basket on the counter.
 */
import type { BasketInputs, BoardContent } from '../types';

/* ------------------------------------------------------------------ the price board */

/**
 * A split-flap price board in its wooden frame (BOARD in geom.ts), headed "This week's basket" (painted on the
 * frame's top rail, never flips). Below it: the year in four flap cells, then six rows (the item's name painted on a
 * fixed enamel strip at the left; its price in flap cells at the right) and, under a painted rule, the total.
 *
 * Each price is right-aligned in a fixed row of cells wide enough for the longest it can be ("~$123.45"); unused
 * cells show a blank flap. A cell's flaps carry, in order: blank, "$", "~", ".", "0" … "9"; the year's cells, and
 * the price's dollar-units and two cents cells, carry only the digits (with the full drum a one-cent drop would cost
 * a lap of thirteen flaps, and the board would never rest at 1×). A cell that must change flips through its flaps in that order, one flap after another (the top
 * half falls over the bottom, with its shadow), until it shows the target, so a change takes longer the further the
 * target is round the drum, as a real board does. Cells start their flips a few hundredths of a second apart, left
 * to right, so a row ripples. A new target that arrives mid-flip is simply flipped on to (no restart).
 *
 * The painting is the collection's: ink under watercolor, a wooden frame and a dark painted board, cream flaps with
 * hand-painted numerals (not a font), each cell a little different; nothing vector-flat or cloned.
 */
export interface Board {
  /** Paint (or reuse) the frame, the strips and the flap glyphs at this pixel density, between frames. */
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** what the cells show now, once settled (the target until the flips arrive there) */
  shown(): BoardContent;
  /** advance the flaps toward `content` by dtSec of wall time (the flips run at their own mechanical pace, not the
   *  playback speed) */
  update(dtSec: number, content: BoardContent): void;
  /** settled at once on `content`, no flips (scrubbing, reduced motion, the first paint) */
  set(content: BoardContent): void;
  /** draw the board (layer 1 in geom.ts) */
  draw(ctx: CanvasRenderingContext2D): void;
}

/** Implemented in src/bread/scene/board.ts */
export type CreateBoard = () => Board;

/* ------------------------------------------------------------------ the grocer and the basket */

export type GrocerActivity =
  /**
   * The timeline is playing: he rings up the week's basket, round after round. Along the counter from the bread to
   * the flour, he takes up each item in turn (one piece of it is enough: a loaf, a carton, the tin, a bunch, the
   * chicken, a sack); the weighed ones (bananas, chicken, flour) he sets on the brass scale's pan (SCALE), the needle
   * swinging round and settling, then lifts off again; he sets each piece back in its place and keys it into the
   * till (TILL: a press or two of its keys, the price flags popping up). After the flour he turns the till's crank:
   * the drawer runs out with its ring and he shuts it. Then a breath (a wipe of the counter, a look out at the rain)
   * and round again. Whenever the counter differs from `basket`, he first adds or takes away pieces one at a time
   * (from the shelf under the counter, where taken pieces go back), as before.
   */
  | 'serve'
  /** paused: he finishes what is in his hands (sets a piece down, lets go of the crank), then stands at the counter,
   *  wipes it down, looks out at the rain now and then. A change to the basket while paused is still seen to. */
  | 'idle';

export interface GrocerIntent {
  activity: GrocerActivity;
  basket: BasketInputs;
  /** How fast he works: 1 at 1× (a person's own pace; a round of the basket takes as long as it takes at that pace,
   *  about half a minute, since nothing on it has to match the timeline), × the playback speed, capped at a brisk
   *  pace; his walks stay a person's walks. 0 when paused. */
  pace: number;
}

/**
 * Continuity rules (as the orchard's pickers and the brick's crew):
 * - Position, facing and pose are continuous in time; every transition blends over ≥ 0.25 s; turning is through a
 *   three-quarter view, never a mirror flip. Steps keep pace with the floor (no sliding: the CMU-fitted walk).
 * - He stays behind the counter, between the till and the scale; he never stands in front of the board.
 * - Items on the counter, the scale's pan, the till's keys and crank and its drawer move only under his hands; the
 *   needle swings only while something is on the pan (and back to zero when it is lifted).
 * - Nothing passes through the counter, the shelves or the till.
 * - Reduced motion: no movement at all; everything drawn settled (the basket complete, the needle at zero, the till
 *   shut, the grocer at the counter).
 */
export interface Grocer {
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** advance by dt seconds toward the intent; tSec is the wall clock (breathing, idle life) */
  update(dtSec: number, intent: GrocerIntent, tSec: number, reduced: boolean): void;
  /** layer 2: the grocer himself (behind the counter) */
  drawFigure(ctx: CanvasRenderingContext2D): void;
  /** layer 4: the basket on the counter top, the scale's pan and needle, the till's moving parts, and whatever he
   *  holds over them (drawn after the counter) */
  drawCounterTop(ctx: CanvasRenderingContext2D): void;
  /** the settled state for the intent: the basket complete, the till shut, the needle at zero, him at the counter */
  place(intent: GrocerIntent): void;
}

/** Implemented in src/bread/scene/grocer.ts (the basket's art in basket.ts) */
export type CreateGrocer = () => Grocer;
