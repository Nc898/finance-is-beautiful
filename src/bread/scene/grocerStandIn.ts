/**
 * TEMPORARY stand-in for the Grocer contract (partsApi.ts): draws nothing, and keeps the board true by setting it
 * straight from the intent. The coordinator replaces it with the real grocer (scene/grocer.ts); index.ts imports
 * `createGrocer` from here in exactly one place, so the swap is one line.
 */
import type { Board, Grocer, GrocerIntent } from './partsApi';

export function createGrocer(): Grocer {
  return {
    async prepare() {},
    update(_dt: number, intent: GrocerIntent, board: Board) {
      board.set(intent.board);
    },
    drawFigure() {},
    drawCounterTop() {},
    place(intent: GrocerIntent, board: Board) {
      board.set(intent.board);
    },
  };
}
