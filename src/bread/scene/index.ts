/**
 * "Bread and Butter" scene (Canvas 2D). Implements BreadSceneAPI from ../types.
 *
 * An interior, so the layers are fixed (geom.ts), not depth-sorted. Painted once per size: the room (paper, plaster,
 * window and street, shelves and goods, lamps, floor, the light; shop.ts), the counter with the till, scale and bags
 * (counter.ts), the produce stands at each side of it (produce.ts) and the foreground crates. Per frame, back to front: the room; the street's life and the rain on the
 * glass (street.ts, ambient.ts); the price board (board.ts: split flaps that click over to each month's prices with
 * the labels); the steam; the produce stands; the grocer; the counter; whatever lies or is held on it (the basket, the scale's pan and
 * needle, the till's moving parts); the crates; the dust in the lamplight.
 */
import type { BreadFrame, BreadLabel, BreadSceneAPI, BreadScreenPoint } from '../types';
import { ensurePaperTile } from '../../scene/sprites';
import { fitCamera, type Camera, type Insets } from './layout';
import { CUP, paintBack } from './shop';
import { paintCounter, paintCrates, type Sprite } from './counter';
import { paintProduce } from './produce';
import { GlassRain } from './street';
import { Ambient } from './ambient';
import { createBoard } from './board';
import { createGrocer } from './grocer';
import type { Board, Grocer, GrocerIntent } from './partsApi';

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** the labels' places in the bottom band, as world x (basket left, the minutes between, the pay right) */
const LABEL_X: Record<BreadLabel, number> = { basket: 215, minutes: 445, pay: 680 };

export function createBreadScene(canvas: HTMLCanvasElement): BreadSceneAPI {
  const ctx = canvas.getContext('2d')!;
  let insets: Insets = { top: 0, bottom: 0, side: 0 };
  let size = { w: 0, h: 0, ratio: 1 };
  let cam: Camera | null = null;
  let back: HTMLCanvasElement | null = null;
  let counter: Sprite | null = null;
  let crates: Sprite[] = [];
  let stands: Sprite[] = [];
  let ambient: Ambient | null = null;
  const rain = new GlassRain();
  const board: Board = createBoard();
  const grocer: Grocer = createGrocer();
  let last: BreadFrame | null = null;
  let lastMs = -1;
  let placed = false;
  let destroyed = false;
  let gen = 0;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyDone = false;
  // dev harness: hold the board (drive its flips by hand) without the frame setting it
  const dev = { board, manual: false };
  if (import.meta.env.DEV) (window as unknown as { __breadScene: unknown }).__breadScene = dev;

  const layout = () => {
    if (size.w <= 0 || size.h <= 0) return;
    const c = fitCamera(size.w, size.h, size.ratio, insets);
    const my = ++gen;
    const alive = () => !destroyed && my === gen;
    void (async () => {
      const tile = await ensurePaperTile();
      if (!alive()) return;
      await tick();
      const b = await paintBack(c, tile, tick, alive);
      if (!b || !alive()) return;
      // every painting is made at about the density it is drawn at
      const q = Math.min(3, c.s * c.dpr * 1.25);
      const cn = paintCounter(q);
      await tick();
      const cr = paintCrates(q);
      await tick();
      const pr = paintProduce(q);
      await tick();
      if (!alive()) return;
      await board.prepare(q, tick, alive);
      await grocer.prepare(q, tick, alive);
      if (!alive()) return;
      const am = new Ambient(q);
      cam = c;
      canvas.width = Math.round(c.cssW * c.dpr);
      canvas.height = Math.round(c.cssH * c.dpr);
      canvas.style.width = `${c.cssW}px`;
      canvas.style.height = `${c.cssH}px`;
      back = b.cv;
      counter = cn;
      crates = cr.sprites;
      stands = pr.sprites;
      ambient = am;
      if (!readyDone) {
        readyDone = true;
        resolveReady();
      }
      if (last) api.render(last);
    })().catch((e) => console.error('bread scene build failed', e));
  };

  const api: BreadSceneAPI = {
    get ready() {
      return ready;
    },
    resize(w, h, ratio) {
      size = { w, h, ratio };
      layout();
    },
    setInsets(i) {
      insets = { top: Math.max(0, i.top), bottom: Math.max(0, i.bottom), side: Math.max(0, i.side ?? 0) };
      layout();
    },
    render(frame) {
      last = frame;
      if (destroyed || !cam || !back || !counter || !ambient) return;
      const c = cam;
      const dt = lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (frame.timeMs - lastMs) / 1000));
      lastMs = frame.timeMs;
      const reduced = frame.reducedMotion;
      const tSec = frame.timeMs / 1000;
      const playing = frame.monthsPerSecond > 0 && !reduced;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(c.dpr * c.s, 0, 0, c.dpr * c.s, c.dpr * c.ox, c.dpr * c.oy);
      ctx.imageSmoothingQuality = 'low';

      // the street's life and the glass (rain, drips and the passer-by are off in reduced motion; the drops sit still)
      if (!reduced) ambient.drawStreet(ctx, tSec);
      rain.draw(ctx, tSec, reduced);

      // the board follows the month (its flaps click over with the labels); the grocer rings up the basket while the
      // timeline plays. A jump of the timeline or reduced motion places everything settled
      const intent: GrocerIntent = {
        activity: playing ? 'serve' : 'idle',
        basket: frame.basket,
        pace: playing ? Math.max(0.1, frame.speed) : 0,
      };
      if (frame.scrubbed || reduced || !placed) {
        grocer.place(intent);
        if (!dev.manual) board.set(frame.board);
        placed = true;
      } else {
        grocer.update(dt, intent, tSec, false);
        if (!dev.manual) board.update(dt, frame.board);
      }

      board.draw(ctx);
      if (!reduced) ambient.drawRoom(ctx, tSec, CUP);
      // the produce stands stand on the floor behind the grocer's counter, in front of the wall
      for (const s of stands) ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
      grocer.drawFigure(ctx);
      ctx.drawImage(counter.cv, counter.x, counter.y, counter.w, counter.h);
      grocer.drawCounterTop(ctx);
      for (const s of crates) ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    labelAnchor(label: BreadLabel): BreadScreenPoint {
      const c = cam ?? fitCamera(Math.max(1, size.w), Math.max(1, size.h), 1, insets);
      return { x: c.ox + LABEL_X[label] * c.s, y: c.cssH - insets.bottom + 6 };
    },
    destroy() {
      destroyed = true;
    },
  };
  return api;
}
