/**
 * The two single-storey stone cottages, each painted once into a hi-res sprite in the house watercolor style:
 * rubble stone laid stone by stone with dressed quoins, a slate (left) or thatch (right) roof that overhangs the
 * wall and shades it, a chimney with clay pots, a plank door (a different colour on each) with its step, stone
 * lintels and sills, deep-set windows with a warm glow, and the lived-in details (a gutter and downpipe, a
 * lantern, a wreath, a plaque, window boxes, a pot of mums, a stack of logs). The right cottage is the mirror image
 * in plan but lit from the same side (the sun is upper left, so shading is never mirrored).
 *
 * The split: cottageWall (stones, quoins, eave shadow), cottageRoof, cottageWindow, cottageDoor, cottageChimney,
 * cottagePaint (shared washes and ink).
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, rgba } from '../../scene/watercolor';
import { granulate, ribbon } from '../../river/scene/boatInk';
import { COTTAGE, GROUND_Y } from './geom';
import { lump, softWash, type Paint } from './cottagePaint';
import { eaveShadow, paintWall } from './cottageWall';
import { paintThatchRoof, roofPoly, thatchEaveFn } from './cottageRoof';
import { paintGutter, paintSlateRoof, slateEave } from './cottageSlate';
import { paintWindow } from './cottageWindow';
import { paintDoor, paintLantern, paintLogs, paintMat, paintMumsPot, paintPlaque, paintPumpkins, paintWreath } from './cottageDoor';
import { CHIMNEY_TOP, paintChimney } from './cottageChimney';
import type { PlanId } from '../types';

export interface CottageSprite {
  cv: HTMLCanvasElement;
  /** world rect the sprite covers */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CottageInfo {
  sprite: CottageSprite;
  /** top of the chimney (where the smoke starts), world */
  chimney: { x: number; y: number };
}

export function cottageRoofY(id: PlanId, x: number): number {
  const c = COTTAGE[id];
  const x0 = c.wall.x0;
  const x1 = c.wall.x1;
  const ridgeA = x0 + 52;
  const ridgeB = x1 - 52;
  if (x <= ridgeA) return 332 + ((x - (x0 - 18)) / (ridgeA - (x0 - 18))) * (206 - 332);
  if (x >= ridgeB) return 206 + ((x - ridgeB) / (x1 + 18 - ridgeB)) * (332 - 206);
  return 206;
}

export function buildCottage(id: PlanId, q: number): CottageInfo {
  const c = COTTAGE[id];
  const thatch = id === 'fixed';
  const rnd = new Rand(id === 'minimum' ? 9001 : 9107);
  const x0 = c.wall.x0;
  const x1 = c.wall.x1;
  const SX = x0 - 40;
  const SY = 146;
  const W = x1 - x0 + 80;
  const H = GROUND_Y + 22 - SY;
  const work = makeCanvas(W * q, H * q);
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(q, 0, 0, q, -SX * q, -SY * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const P: Paint = { ctx, rnd, q, id, c, thatch };

  const eave = thatch ? thatchEaveFn(P) : slateEave;
  const lintelH = thatch ? 6.4 : 8.6;

  // wall, then the roof's shadow on it, then what is set into the wall
  paintWall(P);
  eaveShadow(P, eave);
  c.windows.forEach((win, i) =>
    paintWindow(P, win, i, {
      lintelH,
      curtain: i === 0 ? (thatch ? '#8A4A5E' : '#B24C34') : thatch ? '#A8643A' : '#7A4A62',
      box: thatch ? (i === 0 ? 'wood' : undefined) : i === 1 ? 'terracotta' : undefined,
    }),
  );
  paintDoor(P, lintelH);
  const d = c.door;
  paintMat(P, d.x0 - 2, d.x1 + 2, GROUND_Y + 12.4);
  if (thatch) {
    paintWreath(P, (d.x0 + d.x1) / 2, d.y0 + 52);
    paintPlaque(P, d.x1 + 17, d.y0 + 10);
    paintPumpkins(P, d.x1 + 10, GROUND_Y + 4);
    paintLogs(P, d.x0 - 44, GROUND_Y + 5);
  } else {
    paintLantern(P, d.x1 + 22, d.y0 + 10);
    paintMumsPot(P, d.x1 + 20, GROUND_Y + 5);
  }

  // the roof over everything at the top, with its gutter and downpipe (slate) or its low eaves (thatch)
  if (thatch) paintThatchRoof(P, eave);
  else {
    paintSlateRoof(P);
    paintGutter(P);
  }

  // the chimney on the ridge
  const chX = id === 'minimum' ? x0 + 280 : x1 - 70;
  paintChimney(P, chX, roofPoly(P, eave), 226);

  // the foot of the wall: soil where the vine roots, autumn tufts
  {
    const rx = c.root.x;
    softWash(ctx, lump(rx, GROUND_Y + 1, 26, 5.4, rnd, 14, 0.2), '#5A4130', 0.7, rnd, 4, 0.55);
    softWash(ctx, lump(rx - 5, GROUND_Y - 1.4, 14, 2.6, rnd, 12, 0.2), '#7A5A40', 0.45, rnd, 3, 0.6);
  }
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7C8A3C'];
  for (let xx = c.wall.x0 - 4; xx < c.wall.x1 + 4; xx += rnd.range(2.6, 6)) {
    if (xx > d.x0 - 12 && xx < d.x1 + (thatch ? 34 : 12)) continue;
    const h = rnd.range(3, 8.5);
    const n = rnd.int(3, 5);
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = rgba(rnd.pick(pal), rnd.range(0.55, 0.9));
      const bx = xx + rnd.range(-1.5, 1.5);
      ribbon(ctx, [bx, GROUND_Y + 2, bx + rnd.range(-0.4, 0.4) * h * 0.5, GROUND_Y - h * 0.5, bx + rnd.range(-1, 1) * h * 0.6, GROUND_Y - h], rnd.range(0.5, 0.9), 0.95);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  granulate(work, id === 'minimum' ? 41 : 43, q, 0.75);
  // painted on a CPU canvas (many small ops and a read-back for the grain are far cheaper there), then moved
  // once onto the canvas the scene draws every frame
  const cv = makeCanvas(W * q, H * q);
  cv.getContext('2d')!.drawImage(work, 0, 0);
  work.width = 1;
  work.height = 1;
  return { sprite: { cv, x: SX, y: SY, w: W, h: H }, chimney: { x: chX, y: CHIMNEY_TOP - 12 } };
}
