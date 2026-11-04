/**
 * The props, each painted once into a small sprite (as Brick's props.ts), ink under watercolor, lit from the upper
 * left whichever side they stand on:
 * - each picker's stack of wooden apple crates at its outer front corner (CRATES): slatted boxes of weathered
 *   pine, stencilled with the picker's letter in its accent colour, the open ones heaped with golden apples;
 * - the upturned crate beside them (SEAT), where the picker sits at the end;
 * - the farmer's orchard ladder leaning on the old tree (LADDER): the kind that tapers to a point at the top, so it
 *   goes in among the branches.
 * Each throws a soft shadow long to the lower right.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { mix } from '../../river/scene/boatInk';
import { grassTuft } from '../../river/scene/paint';
import { ACCENT, APPLE, CRATES, LADDER, SEAT, depthScale } from './geom';
import { GRASS } from './ground';
import type { PickerId } from '../types';

const INK = '#3B2A22';
const WOOD = '#D2B488';

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

type P = [number, number];
const flat = (ps: P[]): number[] => ps.flatMap((p) => [p[0], p[1]]);

/** a soft shadow thrown to the lower right on the grass */
function castShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, len: number, rnd: Rand): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba('#5E5A72', 0.12);
    tracePoly(ctx, deform([x - 1, y - 1, x + w, y - 1.6, x + w + len, y + 2.6, x + len * 0.4, y + 3.4], rnd, 2, 0.06));
    ctx.fill();
  }
  ctx.restore();
}

/** a heap of apples filling a box's open top (the top face's corners, back-left first, clockwise) */
function heap(ctx: CanvasRenderingContext2D, rnd: Rand, top: P[], r: number, col: { light: string; mid: string; deep: string }): void {
  const [bl, br, fr, fl] = top as [P, P, P, P];
  const pts: Array<{ x: number; y: number }> = [];
  const nu = 6;
  const nv = 3;
  for (let v = 0; v <= nv; v++) {
    for (let u = 0; u <= nu; u++) {
      const s = (u + rnd.range(-0.25, 0.25)) / nu;
      const t = (v + rnd.range(-0.2, 0.2)) / nv;
      const x = (bl[0] + (br[0] - bl[0]) * s) * (1 - t) + (fl[0] + (fr[0] - fl[0]) * s) * t;
      const y = (bl[1] + (br[1] - bl[1]) * s) * (1 - t) + (fl[1] + (fr[1] - fl[1]) * s) * t;
      // heaped: higher in the middle
      const dome = Math.sin(Math.PI * Math.min(1, Math.max(0, s))) * r * 1.1;
      pts.push({ x, y: y - dome - r * 0.2 });
    }
  }
  pts.sort((a, b) => a.y - b.y);
  for (const p of pts) {
    ctx.fillStyle = rgba(rnd.pick([col.mid, col.light, col.mid]), 0.92);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(col.deep, 0.42);
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.3, p.y + r * 0.35, r * 0.62, r * 0.38, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (rnd.chance(0.3)) {
      ctx.fillStyle = rgba('#D8783A', 0.35);
      ctx.beginPath();
      ctx.ellipse(p.x - r * 0.15, p.y, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,248,226,0.7)';
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.35, p.y - r * 0.35, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** the picker's letter, stencilled: block capitals with the stencil's bridges, a little faded and patchy */
function stencil(ctx: CanvasRenderingContext2D, rnd: Rand, id: PickerId, x: number, y: number, h: number): void {
  const col = ACCENT[id];
  const w = h * 0.7;
  const s = h * 0.2;
  ctx.fillStyle = rgba(col, 0.78);
  if (id === 'a') {
    // an A: two legs and the bar, the bridge cutting the apex
    tracePoly(ctx, [x - w / 2, y, x - w / 2 + s, y, x - s * 0.3, y - h + s * 0.6, x - s * 0.3, y - h]);
    ctx.fill();
    tracePoly(ctx, [x + w / 2, y, x + w / 2 - s, y, x + s * 0.3, y - h + s * 0.6, x + s * 0.3, y - h]);
    ctx.fill();
    ctx.fillRect(x - w * 0.24, y - h * 0.42, w * 0.48, s * 0.8);
  } else {
    // a B: the stem, and the two bowls cut from it by the bridges
    ctx.fillRect(x - w / 2, y - h, s, h);
    for (const [y0, y1, bw] of [[y - h, y - h * 0.52, 0.9], [y - h * 0.48, y, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + s * 1.3, y0);
      ctx.lineTo(x - w / 2 + w * bw * 0.55, y0);
      ctx.quadraticCurveTo(x - w / 2 + w * bw, y0, x - w / 2 + w * bw, (y0 + y1) / 2);
      ctx.quadraticCurveTo(x - w / 2 + w * bw, y1, x - w / 2 + w * bw * 0.55, y1);
      ctx.lineTo(x - w / 2 + s * 1.3, y1);
      ctx.lineTo(x - w / 2 + s * 1.3, y1 - s);
      ctx.lineTo(x - w / 2 + w * bw * 0.5, y1 - s);
      ctx.quadraticCurveTo(x - w / 2 + w * bw - s, y1 - s, x - w / 2 + w * bw - s, (y0 + y1) / 2);
      ctx.quadraticCurveTo(x - w / 2 + w * bw - s, y0 + s, x - w / 2 + w * bw * 0.5, y0 + s);
      ctx.lineTo(x - w / 2 + s * 1.3, y0 + s);
      ctx.closePath();
      ctx.fill();
    }
  }
  // worn: the paint lifted where the boards have been rubbed
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd.range(0.2, 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(x + rnd.range(-w, w) * 0.5, y - rnd.range(0, h), rnd.range(0.3, 0.8), rnd.range(0.2, 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

interface Box {
  /** the front face's lower left corner, its size, the depth going back */
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
}

/** the depth vector: back into the picture is up the page and a little to the right (we see the right side) */
const back = (d: number): P => [d * 0.28, -d * 0.46];

/** a slatted crate; `open` heaps its top with apples, `upturned` shows its slatted bottom instead */
function crate(ctx: CanvasRenderingContext2D, rnd: Rand, b: Box, o: { id: PickerId; open: boolean; upturned?: boolean; letter?: boolean }): void {
  const dv = back(b.d);
  const A: P = [b.x, b.y];
  const B: P = [b.x + b.w, b.y];
  const C: P = [b.x + b.w, b.y - b.h];
  const D: P = [b.x, b.y - b.h];
  const add = (p: P, k = 1): P => [p[0] + dv[0] * k, p[1] + dv[1] * k];
  const wood = mix(WOOD, '#C8B49A', rnd.range(0, 0.4));
  // the right side, in shade, its slats and gaps
  const side = [B, add(B), add(C), C];
  ctx.fillStyle = rgba(mix(wood, '#7A6670', 0.38), 0.95);
  tracePoly(ctx, flat(side));
  ctx.fill();
  // the top: the open crate shows its far inner side and the heap; the upturned one, the bottom's boards
  const top: P[] = [add(D), add(C), C, D];
  if (o.upturned) {
    ctx.fillStyle = rgba(mix(wood, '#FFF4DC', 0.2), 0.96);
    tracePoly(ctx, flat(top));
    ctx.fill();
    ctx.strokeStyle = rgba('#6A5040', 0.45);
    ctx.lineWidth = 0.35;
    for (const t of [0.34, 0.67]) {
      ctx.beginPath();
      ctx.moveTo(D[0] + dv[0] * t, D[1] + dv[1] * t);
      ctx.lineTo(C[0] + dv[0] * t, C[1] + dv[1] * t);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = rgba(mix(wood, '#5A4A48', 0.45), 0.95);
    tracePoly(ctx, flat(top));
    ctx.fill();
    // the far inner side catching the light
    ctx.fillStyle = rgba(mix(wood, '#FFF0D0', 0.15), 0.9);
    tracePoly(ctx, flat([add(D), add(C), add(C, 0.8), add(D, 0.8)].map((p) => [p[0], p[1] + b.h * 0.18] as P)));
    ctx.fill();
    if (o.open) heap(ctx, rnd, top, Math.min(1.9, b.w * 0.075), APPLE.own);
  }
  // the front: three boards with dark gaps between, the corner posts
  ctx.fillStyle = rgba(wood, 0.96);
  tracePoly(ctx, flat([A, B, C, D]));
  ctx.fill();
  ctx.fillStyle = rgba('#4A3830', 0.55);
  for (const t of [0.33, 0.66]) ctx.fillRect(b.x + 1.4, b.y - b.h * t - 0.5, b.w - 2.8, 0.8);
  ctx.fillStyle = rgba(mix(wood, '#6A5040', 0.3), 0.9);
  ctx.fillRect(b.x, b.y - b.h, 1.4, b.h);
  ctx.fillRect(b.x + b.w - 1.4, b.y - b.h, 1.4, b.h);
  // the grain and the light: a warm glaze on the upper left, the boards darker toward their lower edge
  const g = ctx.createLinearGradient(b.x, b.y - b.h, b.x + b.w, b.y);
  g.addColorStop(0, 'rgba(255,240,206,0.3)');
  g.addColorStop(1, 'rgba(110,84,80,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y - b.h, b.w, b.h);
  ctx.strokeStyle = rgba('#8A6A4E', 0.3);
  ctx.lineWidth = 0.22;
  for (let k = 0; k < 5; k++) {
    const yy = b.y - rnd.range(0.05, 0.95) * b.h;
    ctx.beginPath();
    ctx.moveTo(b.x + 1.6, yy);
    ctx.bezierCurveTo(b.x + b.w * 0.3, yy + rnd.range(-0.4, 0.4), b.x + b.w * 0.6, yy + rnd.range(-0.4, 0.4), b.x + b.w - 1.6, yy);
    ctx.stroke();
  }
  // a hand hole cut in the end, nails at the posts
  ctx.fillStyle = rgba('#3A2C2A', 0.7);
  const hx = (B[0] + add(B)[0]) / 2;
  const hy = (C[1] + add(C)[1]) / 2 + b.h * 0.22;
  ctx.beginPath();
  ctx.ellipse(hx, hy, b.d * 0.12, b.h * 0.07, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#3A2C2A', 0.6);
  for (const t of [0.17, 0.5, 0.83]) {
    ctx.fillRect(b.x + 0.5, b.y - b.h * t, 0.5, 0.5);
    ctx.fillRect(b.x + b.w - 1, b.y - b.h * t, 0.5, 0.5);
  }
  if (o.letter) stencil(ctx, rnd, o.id, b.x + b.w / 2, b.y - b.h * 0.22, b.h * 0.56);
  // the pen: the front and the visible edges, broken; heavier away from the light
  ctx.strokeStyle = rgba(INK, 0.7);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(D[0], D[1]);
  ctx.lineTo(A[0], A[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(B[0], B[1]);
  ctx.lineTo(add(B)[0], add(B)[1]);
  ctx.lineTo(add(C)[0], add(C)[1]);
  ctx.lineTo(add(D)[0], add(D)[1]);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(D[0], D[1]);
  ctx.lineTo(C[0], C[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.moveTo(add(D)[0], add(D)[1]);
  ctx.lineTo(D[0], D[1]);
  ctx.stroke();
}

/** a crate's size at a depth (about 50 × 30 × 32 cm) */
const crateSize = (y: number) => {
  const k = depthScale(y);
  return { w: 19 * k, h: 11 * k, d: 12 * k };
};

/** the picker's stack of crates at its outer front corner: two side by side, one on top, one open at the front */
export function makeCrates(id: PickerId, q: number): Sprite {
  const c = CRATES[id];
  const rnd = new Rand(id === 'a' ? 6101 : 6113);
  const { sp, ctx } = sprite(c.x - 34, c.y - 44, 74, 54, q);
  const z = crateSize(c.y);
  // the stack stands on the trodden ground; on B's side it is the mirror image in plan (the open crate on the inner
  // side, toward the picker), lit from the same side
  const inward = id === 'a' ? 1 : -1;
  const x0 = c.x - z.w;
  castShadow(ctx, x0 + z.w * 0.2, c.y - 4, z.w * 2.1, 22, rnd);
  // the back pair, a little farther back, and the one on top of them
  const by = c.y - 7;
  crate(ctx, rnd, { x: x0 - z.w * 0.1 - 1.5, y: by, ...z }, { id, open: false });
  crate(ctx, rnd, { x: x0 + z.w * 0.9 - 1.5, y: by, ...z }, { id, open: false });
  crate(ctx, rnd, { x: x0 + z.w * 0.4 - 1.5, y: by - z.h, ...z }, { id, open: true, letter: true });
  // the front pair on the ground, the inner one open (where the picker takes the apples from)
  const fx = inward > 0 ? [x0 - 2, x0 + z.w + 1] : [x0 - 1, x0 + z.w + 2];
  crate(ctx, rnd, { x: fx[0]!, y: c.y, ...z }, { id, open: inward < 0, letter: inward > 0 });
  crate(ctx, rnd, { x: fx[1]!, y: c.y, ...z }, { id, open: inward > 0, letter: inward < 0 });
  // a stray apple or two in the grass, and the grass at the crates' feet
  for (let k = 0; k < 2; k++) {
    const ax = c.x + inward * rnd.range(22, 30);
    const ay = c.y + rnd.range(-1, 2);
    ctx.fillStyle = rgba(APPLE.own.mid, 0.9);
    ctx.beginPath();
    ctx.ellipse(ax, ay - 1.5, 1.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,226,0.6)';
    ctx.beginPath();
    ctx.ellipse(ax - 0.6, ay - 2.1, 0.5, 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let x = c.x - 34; x < c.x + 38; x += rnd.range(3, 6)) grassTuft(ctx, x, c.y + rnd.range(0, 2.5), rnd.range(2.2, 4.4), rnd, 0.8, GRASS);
  return sp;
}

/** the upturned crate the picker sits on at the end */
export function makeSeat(id: PickerId, q: number): Sprite {
  const s = SEAT[id];
  const rnd = new Rand(id === 'a' ? 6131 : 6137);
  const { sp, ctx } = sprite(s.x - 18, s.y - 20, 44, 28, q);
  const z = crateSize(s.y);
  castShadow(ctx, s.x - z.w * 0.4, s.y - 2, z.w, 14, rnd);
  crate(ctx, rnd, { x: s.x - z.w / 2, y: s.y, w: z.w, h: z.h * 0.95, d: z.d }, { id, open: false, upturned: true, letter: false });
  for (let x = s.x - 14; x < s.x + 16; x += rnd.range(3, 6)) grassTuft(ctx, x, s.y + rnd.range(0, 2), rnd.range(2, 4), rnd, 0.8, GRASS);
  return sp;
}

/** the farmer's orchard ladder: two stiles splayed at the foot and meeting in a point at the top, round rungs */
export function makeLadder(q: number): Sprite {
  const { foot, top } = LADDER;
  const rnd = new Rand(6151);
  const { sp, ctx } = sprite(foot.x - 20, top.y - 6, top.x - foot.x + 44, foot.y - top.y + 14, q);
  // its shadow thrown down the grass to the lower right
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = rgba('#5E5A72', 0.16);
  tracePoly(ctx, deform([foot.x - 7, foot.y, foot.x + 7, foot.y, foot.x + 30, foot.y + 6, foot.x + 22, foot.y + 6.5], rnd, 2, 0.05));
  ctx.fill();
  ctx.restore();
  const half0 = 8;
  const half1 = 1.6;
  const len = Math.hypot(top.x - foot.x, top.y - foot.y);
  const ux = (top.x - foot.x) / len;
  const uy = (top.y - foot.y) / len;
  const nx = -uy;
  const ny = ux;
  const at = (t: number, side: number): P => {
    const h = half0 + (half1 - half0) * t;
    return [foot.x + (top.x - foot.x) * t + nx * h * side, foot.y + (top.y - foot.y) * t + ny * h * side];
  };
  // the rungs first (the stiles are over their ends)
  const rungs = Math.round(len / 13);
  for (let k = 1; k < rungs; k++) {
    const t = k / rungs;
    const a = at(t, -1);
    const b = at(t, 1);
    ctx.strokeStyle = rgba('#B49A7A', 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1] - 0.5);
    ctx.lineTo(b[0], b[1] - 0.5);
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1] + 0.75);
    ctx.lineTo(b[0], b[1] + 0.75);
    ctx.stroke();
  }
  // the stiles: weathered silver-brown wood, lit on the left
  for (const side of [-1, 1]) {
    const pts: P[] = [];
    for (let t = 0; t <= 1.0001; t += 0.05) pts.push(at(t, side));
    const w = (t: number) => 2.2 - t * 0.9;
    const L: number[] = [];
    const R: number[] = [];
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1);
      L.push(p[0] + nx * w(t) * 0.5, p[1] + ny * w(t) * 0.5);
      R.push(p[0] - nx * w(t) * 0.5, p[1] - ny * w(t) * 0.5);
    });
    const poly = [...L];
    for (let i = R.length - 2; i >= 0; i -= 2) poly.push(R[i]!, R[i + 1]!);
    ctx.fillStyle = rgba(side < 0 ? '#C4AE8E' : '#A8907A', 0.97);
    tracePoly(ctx, poly);
    ctx.fill();
    // the lit edge (the left), the shaded edge in pen
    ctx.strokeStyle = 'rgba(255,240,212,0.55)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let i = 0; i < R.length; i += 2) ctx.lineTo(R[i]!, R[i + 1]!);
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.75);
    ctx.lineWidth = 0.5;
    let i = 0;
    while (i < L.length - 2) {
      const j = Math.min(L.length - 2, i + rnd.int(3, 6) * 2);
      ctx.beginPath();
      for (let k = i; k <= j; k += 2) ctx.lineTo(L[k]!, L[k + 1]!);
      ctx.stroke();
      i = j + (rnd.chance(0.3) ? 2 : 0);
    }
    // the grain
    ctx.strokeStyle = rgba('#6A5444', 0.35);
    ctx.lineWidth = 0.25;
    for (let k = 0; k < 6; k++) {
      const t0 = rnd.range(0, 0.9);
      const a = at(t0, side);
      const b = at(t0 + rnd.range(0.04, 0.1), side);
      ctx.beginPath();
      ctx.moveTo(a[0] + rnd.range(-0.3, 0.3), a[1]);
      ctx.lineTo(b[0] + rnd.range(-0.3, 0.3), b[1]);
      ctx.stroke();
    }
  }
  // the feet sunk a little in the grass
  for (const side of [-1, 1]) {
    const p = at(0, side);
    for (let k = 0; k < 3; k++) grassTuft(ctx, p[0] + rnd.range(-2, 2), p[1] + rnd.range(0, 1.5), rnd.range(2.6, 4), rnd, 0.8, GRASS);
  }
  return sp;
}
