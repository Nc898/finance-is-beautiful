/**
 * The props, each painted once into a small sprite: the white picket fence along the front of both gardens with the
 * two gates standing open (the gap where the road comes through left open), the pallet of new bricks inside each
 * gate, the garden benches, a heap of sand with a shovel in it, and the chalk tally slate on each gate post (its
 * marks drawn per frame: one per cart of interest, in fives).
 */
import { Rand } from '../../scene/prng';
import { makeCanvas, rgba, tracePoly, deform } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { blobPoly } from '../../river/scene/paint';
import { BENCH, FENCE_Y, GATE, HOUSE, JUNCTION, STACK, TALLY, type Pt } from './geom';
import { roadHalf } from './ground';
import type { LoanId } from '../types';

const INK = '#3B2A22';

export interface Sprite {
  cv: HTMLCanvasElement;
  /** world rect */
  x: number;
  y: number;
  w: number;
  h: number;
}

function sprite(x: number, y: number, w: number, h: number, q: number): { sp: Sprite; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(Math.ceil(w * q), Math.ceil(h * q));
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -x * q, -y * q);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { sp: { cv, x, y, w, h }, ctx };
}

export function blit(ctx: CanvasRenderingContext2D, s: Sprite): void {
  ctx.drawImage(s.cv, s.x, s.y, s.w, s.h);
}

/* ------------------------------------------------------------------ the fence */

/** where the fence runs (x ranges), leaving the gates and the road open */
function fenceRuns(x0: number, x1: number): Array<[number, number]> {
  const gaps: Array<[number, number]> = [
    [GATE.a.x0, GATE.a.x1],
    [GATE.b.x0, GATE.b.x1],
    [JUNCTION.x - roadHalf(FENCE_Y) - 4, JUNCTION.x + roadHalf(FENCE_Y) + 4],
  ].sort((p, q) => p[0] - q[0]) as Array<[number, number]>;
  const runs: Array<[number, number]> = [];
  let cur = x0;
  for (const [a, b] of gaps) {
    if (a > cur) runs.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < x1) runs.push([cur, x1]);
  return runs;
}

function picket(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number, w: number): void {
  const poly = [x - w / 2, y, x - w / 2, y - h + w * 0.7, x, y - h, x + w / 2, y - h + w * 0.7, x + w / 2, y];
  ctx.fillStyle = rgba(mix('#F6F0E2', '#E2DACA', rnd.next() * 0.5), 0.96);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = 'rgba(130,128,150,0.32)';
  tracePoly(ctx, [x + w * 0.1, y, x + w * 0.1, y - h + w * 0.8, x + w / 2, y - h + w * 0.7, x + w / 2, y]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.38);
  ctx.lineWidth = 0.3;
  tracePoly(ctx, poly);
  ctx.stroke();
}

const PICKET_H = 15;

export function makeFence(q: number, x0: number, x1: number): Sprite {
  const { sp, ctx } = sprite(x0 - 10, FENCE_Y - 46, x1 - x0 + 20, 52, q);
  const rnd = new Rand(7707);
  const y = FENCE_Y;
  for (const [a, b] of fenceRuns(x0, x1)) {
    // two rails behind the pickets
    for (const ry of [y - 4, y - 11]) {
      ctx.fillStyle = rgba('#E6DECC', 0.95);
      ctx.fillRect(a, ry - 1, b - a, 2);
      ctx.fillStyle = 'rgba(120,118,140,0.3)';
      ctx.fillRect(a, ry + 0.6, b - a, 0.6);
    }
    for (let x = a + 3; x < b - 1; x += 6.2) picket(ctx, rnd, x + rnd.range(-0.2, 0.2), y + 1, PICKET_H + rnd.range(-0.6, 0.6), 3.6);
    // a stout post at each end
    for (const px of [a + 1.5, b - 1.5]) {
      ctx.fillStyle = rgba('#EEE6D4', 0.98);
      ctx.fillRect(px - 2.2, y - PICKET_H - 3, 4.4, PICKET_H + 4);
      ctx.fillStyle = 'rgba(120,118,140,0.36)';
      ctx.fillRect(px + 0.4, y - PICKET_H - 3, 1.8, PICKET_H + 4);
      ctx.strokeStyle = rgba(INK, 0.4);
      ctx.lineWidth = 0.35;
      ctx.strokeRect(px - 2.2, y - PICKET_H - 3, 4.4, PICKET_H + 4);
    }
  }
  // the gates stand open, swung back inside the garden against the fence
  for (const id of ['a', 'b'] as LoanId[]) {
    const g = GATE[id];
    const hinge = id === 'a' ? g.x1 : g.x0;
    const dir = id === 'a' ? -1 : 1;
    // seen swung in: a gate leaf at an angle, foreshortened, its far edge higher (farther away)
    const len = g.x1 - g.x0 - 2;
    const fx = hinge + dir * len * 0.38;
    const fy = y - len * 0.5;
    ctx.fillStyle = rgba('#EEE6D4', 0.95);
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const px = hinge + (fx - hinge) * t;
      const py = y + 1 + (fy - y) * t;
      picket(ctx, rnd, px, py, PICKET_H - t * 4, 3 - t * 0.8);
    }
    ctx.strokeStyle = rgba('#E2DACA', 0.95);
    ctx.lineWidth = 1.6;
    for (const off of [4, 11]) {
      ctx.beginPath();
      ctx.moveTo(hinge, y - off);
      ctx.lineTo(fx, fy - off * 0.8);
      ctx.stroke();
    }
  }
  return sp;
}

/* ------------------------------------------------------------------ the pallet, the bench, the sand */

export function makePallet(id: LoanId, q: number): Sprite {
  const p = STACK[id];
  const { sp, ctx } = sprite(p.x - 20, p.y - 22, 40, 26, q);
  const rnd = new Rand(id === 'a' ? 3301 : 3307);
  // the pallet's slats
  ctx.fillStyle = rgba('#C49E6A', 0.92);
  ctx.fillRect(p.x - 15, p.y - 3, 30, 3);
  ctx.fillStyle = 'rgba(90,64,44,0.45)';
  for (const dx of [-12, -1, 10]) ctx.fillRect(p.x + dx, p.y - 3, 2.4, 3);
  // the bricks, stacked in a cube (front face and the top seen from a little above)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const bx = p.x - 13 + c * 6.6 + (r % 2) * 1.2;
      const by = p.y - 3 - (r + 1) * 2.9;
      ctx.fillStyle = rgba(rnd.pick(['#B4533B', '#BF6142', '#A94B37', '#C46B46', '#9F4535']), 0.94);
      ctx.fillRect(bx, by, 6.1, 2.6);
      ctx.fillStyle = 'rgba(60,30,30,0.25)';
      ctx.fillRect(bx, by + 2.1, 6.1, 0.5);
    }
  }
  const top = p.y - 3 - 5 * 2.9;
  ctx.fillStyle = rgba('#C77A58', 0.9);
  tracePoly(ctx, [p.x - 13, top, p.x + 14.6, top, p.x + 12.6, top - 3.4, p.x - 11, top - 3.4]);
  ctx.fill();
  ctx.fillStyle = 'rgba(70,40,50,0.22)';
  ctx.fillRect(p.x + 7, top, 7.6, 14.5);
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 0.4;
  ctx.strokeRect(p.x - 13, top, 27.6, 14.5);
  return sp;
}

/** the seat's height above the ground and its front edge (the crew sit here) */
export const SEAT_H = 12;

export function makeBench(id: LoanId, q: number): Sprite {
  const b = BENCH[id];
  const { sp, ctx } = sprite(b.x - 26, b.y - 30, 52, 34, q);
  const rnd = new Rand(id === 'a' ? 3401 : 3409);
  const wood = '#B88A5A';
  // the back rest (farther, higher), the legs, the seat slats
  for (const [y0, h] of [[b.y - 26, 2.4], [b.y - 21, 2.4]] as const) {
    ctx.fillStyle = rgba(mix(wood, '#F2D8AA', rnd.range(0, 0.3)), 0.94);
    ctx.fillRect(b.x - 22, y0, 44, h);
  }
  ctx.fillStyle = rgba('#6E4E34', 0.9);
  for (const dx of [-20, 18]) {
    ctx.fillRect(b.x + dx, b.y - 26, 2.2, 14);
    ctx.fillRect(b.x + dx, b.y - SEAT_H, 2.2, SEAT_H);
    ctx.fillRect(b.x + dx - 1, b.y - SEAT_H - 3, 2.2, SEAT_H + 1);
  }
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba(mix(wood, '#F4DCAE', 0.2 + k * 0.1), 0.95);
    ctx.fillRect(b.x - 23, b.y - SEAT_H - 3 + k * 1.3, 46, 1.4);
  }
  ctx.fillStyle = 'rgba(70,50,40,0.35)';
  ctx.fillRect(b.x - 23, b.y - SEAT_H + 0.8, 46, 0.8);
  ctx.strokeStyle = rgba(INK, 0.4);
  ctx.lineWidth = 0.35;
  ctx.strokeRect(b.x - 23, b.y - SEAT_H - 3, 46, 4.6);
  // its shadow on the grass
  ctx.fillStyle = 'rgba(60,70,60,0.16)';
  ctx.beginPath();
  ctx.ellipse(b.x + 4, b.y + 0.5, 25, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  return sp;
}

/** a heap of building sand with a shovel stuck in it, and a few planks, at the inner end of the house front */
export function makeSand(id: LoanId, q: number): Sprite {
  const H = HOUSE[id];
  const x = H.outer === 1 ? H.wall.x1 - 4 : H.wall.x0 + 4;
  const y = 504;
  const { sp, ctx } = sprite(x - 26, y - 26, 52, 30, q);
  const rnd = new Rand(id === 'a' ? 3501 : 3511);
  const heap = blobPoly(x, y - 5, 18, 7, rnd, 18, 0.12).map((v, i) => (i % 2 === 1 && v > y ? y : v));
  for (const [c, a] of [['#E2C68E', 0.85], ['#D2B27A', 0.4], ['#EED8A8', 0.4]] as const) {
    ctx.fillStyle = rgba(c, a);
    tracePoly(ctx, deform(heap, rnd, 2, 0.04));
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(150,110,70,0.3)';
  tracePoly(ctx, [x + 2, y - 11, x + 18, y - 2, x + 16, y, x + 3, y]);
  ctx.fill();
  for (let k = 0; k < 30; k++) {
    ctx.fillStyle = rgba('#9C7E52', 0.35);
    ctx.fillRect(x + rnd.range(-14, 14), y - rnd.range(1, 9), 0.4, 0.4);
  }
  // the shovel: a handle leaning out of the heap, its blade buried
  ctx.fillStyle = rgba('#9A7048', 0.95);
  ribbon(ctx, [x - 3, y - 7, x - 9, y - 18, x - 12, y - 24], 1.1, 0.1);
  ctx.strokeStyle = rgba('#7A5838', 0.95);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 24.5);
  ctx.lineTo(x - 10, y - 23.5);
  ctx.stroke();
  return sp;
}

/* ------------------------------------------------------------------ the tally slate */

const SLATE = { w: 22, h: 16 };

/** the slate on the gate post (static) */
export function makeSlate(id: LoanId, q: number): Sprite {
  const t = TALLY[id];
  const { sp, ctx } = sprite(t.x - 14, t.y - 14, 28, 24, q);
  ctx.fillStyle = rgba('#3E4148', 0.95);
  ctx.fillRect(t.x - SLATE.w / 2, t.y - SLATE.h / 2 - 1, SLATE.w, SLATE.h);
  ctx.strokeStyle = rgba('#A07850', 0.95);
  ctx.lineWidth = 1.1;
  ctx.strokeRect(t.x - SLATE.w / 2, t.y - SLATE.h / 2 - 1, SLATE.w, SLATE.h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(t.x - SLATE.w / 2 + 0.6, t.y - SLATE.h / 2 - 0.4, SLATE.w * 0.5, SLATE.h - 1.2);
  return sp;
}

/**
 * The chalk marks for `n` full carts (and a short mark for a part cart, when `part`), in gates of five, up to 15
 * a row, three rows; more than that are written as a number.
 */
export function drawTally(ctx: CanvasRenderingContext2D, id: LoanId, n: number, part: boolean): void {
  const t = TALLY[id];
  const x0 = t.x - SLATE.w / 2 + 1.4;
  const y0 = t.y - SLATE.h / 2;
  const rnd = new Rand(id === 'a' ? 3701 : 3709);
  ctx.strokeStyle = 'rgba(244,242,232,0.92)';
  ctx.lineWidth = 0.6;
  ctx.lineCap = 'round';
  if (n > 15) {
    ctx.fillStyle = 'rgba(244,242,232,0.92)';
    ctx.font = '9px serif';
    ctx.fillText(String(n), x0 + 3, y0 + 10);
    return;
  }
  for (let i = 0; i < n + (part ? 1 : 0); i++) {
    const row = Math.floor(i / 5) >= 2 ? 1 : 0;
    const g = Math.floor(i / 5);
    const k = i % 5;
    const gx = x0 + 0.6 + (g % 2) * 9.5;
    const gy = y0 + 1.6 + row * 7;
    const isPart = part && i === n;
    if (k < 4) {
      const x = gx + k * 1.9 + rnd.range(-0.1, 0.1);
      ctx.beginPath();
      ctx.moveTo(x, gy + (isPart ? 3 : 0));
      ctx.lineTo(x + 0.2, gy + 5.4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(gx - 0.8, gy + 4.6);
      ctx.lineTo(gx + 6.6, gy + 0.8);
      ctx.stroke();
    }
  }
}

/** the depth each prop sorts at */
export const PROP_DEPTH = {
  pallet: (id: LoanId): number => STACK[id].y,
  bench: (id: LoanId): number => BENCH[id].y,
  fence: FENCE_Y,
} as const;

export type { Pt };
