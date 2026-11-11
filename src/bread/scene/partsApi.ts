/**
 * The contracts between the scene's orchestrator (index.ts) and its two living parts (coordinator-owned): the
 * chalkboard (board.ts, built with the shop) and the grocer with the basket he handles (grocer.ts, basket.ts). The
 * orchestrator decides WHAT the board and the counter should show from the month and the reader's basket; the grocer
 * decides HOW and WHEN to get them there. Nothing on the board or the counter ever changes except under his hand.
 */
import type { BasketInputs, BoardContent, ItemKey } from '../types';
import type { Pt } from './geom';

/* ------------------------------------------------------------------ the chalkboard */

/** A line of the board the grocer re-chalks ('title' is painted once and never changes). */
export type BoardLine = 'year' | ItemKey | 'total';
export const BOARD_LINE_ORDER: readonly BoardLine[] = ['year', 'bread', 'eggs', 'coffee', 'bananas', 'chicken', 'flour', 'total'];

/**
 * The slate and its chalk. It keeps what is written on each line and draws two kinds of change, both driven by the
 * grocer's hand so they happen only under it:
 * - wiping: the cloth sweeps along the line's price (on the year line, the whole year); the chalk fades under the
 *   cloth's path and leaves a soft smear of dust, never vanishing all at once;
 * - writing: the new text appears stroke by stroke along a hand-written path. `writeTip(line, text, t)` gives the
 *   chalk tip's position at progress t (0 … 1) so the hand can sit exactly on it, and `write(line, text, t)` shows
 *   the text up to that progress.
 * The handwriting is the grocer's own: a consistent, slightly old-fashioned chalk script (a small hand-made set of
 * strokes for the digits, "$", "." and the item names, not a font), with natural variation per glyph so repeated
 * digits are not clones; deterministic for the same text.
 */
export interface Board {
  /** Paint (or reuse) the slate, frame and glyph strokes at this pixel density, between frames. */
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** what each line says now (the last text written there; '' once wiped) */
  shown(): BoardContent;
  /** the cloth's position along a line at wiping progress t (0 … 1), for the grocer's left hand */
  wipeTip(line: BoardLine, t: number): Pt;
  /** wipe the line's text up to progress t (monotonic within one wipe; t = 1 leaves the line clear) */
  wipe(line: BoardLine, t: number): void;
  /** the chalk tip's position at progress t while writing `text` on `line`, for the grocer's right hand */
  writeTip(line: BoardLine, text: string, t: number): Pt;
  /** write `text` on the (clear) line up to progress t (t = 1: written, and it is then the line's text) */
  write(line: BoardLine, text: string, t: number): void;
  /** settled: every line says exactly `content` (scrubbing, reduced motion, the first paint) */
  set(content: BoardContent): void;
  /** draw the slate, the frame, the title and the chalk (layer 1 in geom.ts) */
  draw(ctx: CanvasRenderingContext2D): void;
}

/** Implemented in src/bread/scene/board.ts */
export type CreateBoard = () => Board;

/* ------------------------------------------------------------------ the grocer and the basket */

export type GrocerActivity =
  /**
   * Keep the board and the counter true. Whenever a line of the board differs from `board`, go to the board (walk
   * past the counter's end) and re-chalk the lines that differ, top to bottom in BOARD_LINE_ORDER: wipe each (the
   * cloth in his left hand, along wipeTip), then write the new text (the chalk in his right hand, along writeTip);
   * the total last. A line's target is read as he starts that line, so at high speeds he writes the latest figure
   * and skips the months between. Whenever the counter differs from `basket`, go to the counter and add or take away
   * items one at a time (from under the counter or the shelf behind him; taken items go back there), with a visible
   * reach for each. The board comes first, unless the basket changed and the board is already true.
   */
  | 'work'
  /** nothing to change (paused, or all true): stand at the counter, wipe it down, look out at the rain now and then */
  | 'idle';

export interface GrocerIntent {
  activity: GrocerActivity;
  board: BoardContent;
  basket: BasketInputs;
  /** How fast he works: 1 at 1× (a line wiped in about a quarter of a second and written in about half a second; a
   *  full pass of the board in about two seconds, a year of the timeline), × the playback speed, capped at a brisk
   *  pace. 0 (paused) lets him finish the stroke he is on, then idle. */
  pace: number;
}

/**
 * Continuity rules (as the orchard's pickers and the brick's crew):
 * - Position, facing and pose are continuous in time; every transition blends over ≥ 0.25 s; turning is through a
 *   three-quarter view, never a mirror flip. Steps keep pace with the floor (no sliding: the orchard pickers'
 *   CMU-fitted walk, over a shop's short distances).
 * - The chalk is in his right hand and the cloth in his left (over his shoulder when not in use); the chalk touches
 *   the board exactly at writeTip and the cloth at wipeTip. Items on the counter move only in his hands.
 * - Nothing passes through the counter, the board, the shelves or the till.
 * - Reduced motion: no movement at all; everything drawn settled (the board true, the basket complete, the grocer at
 *   the counter).
 */
export interface Grocer {
  prepare(pxPerUnit: number, tick: () => Promise<void>, check: () => boolean): Promise<void>;
  /** advance by dt seconds toward the intent, driving the board's wipe and write; tSec is the wall clock (breathing,
   *  idle life) */
  update(dtSec: number, intent: GrocerIntent, board: Board, tSec: number, reduced: boolean): void;
  /** layer 2: the grocer himself (behind the counter, or in front of the board) */
  drawFigure(ctx: CanvasRenderingContext2D): void;
  /** layer 4: the basket on the counter top, and whatever he holds over it (drawn after the counter) */
  drawCounterTop(ctx: CanvasRenderingContext2D): void;
  /** the settled state for the intent: the board set true, the basket complete, the grocer at the counter */
  place(intent: GrocerIntent, board: Board): void;
}

/** Implemented in src/bread/scene/grocer.ts (the basket's art in basket.ts) */
export type CreateGrocer = () => Grocer;
