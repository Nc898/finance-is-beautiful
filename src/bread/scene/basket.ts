/**
 * The basket on the counter: the six items, painted to the shop's finish (ink under watercolor washes, lit on the
 * left, shaded on the right, glazed with the counter top's lamplight from light.ts), and where each lies by quantity
 * (BASKET_SLOTS in geom.ts, BASKET_LIMITS in types.ts):
 * - bread: a loaf a pound, side by side, two at the front and two behind (tin loaves and bloomers, each its own);
 * - eggs: a carton a dozen, stacked;
 * - coffee: a tin or a paper bag a pound (two at the front, a third behind);
 * - bananas: a bunch of up to 3 lb, a second bunch beside it from 4 lb;
 * - chicken: one bird in butcher's paper up to 3 lb (its size by weight), a second from 4 lb;
 * - flour: a sack of up to 5 lb (its size by weight), a second from 6 lb.
 * Every piece has a fixed place (its key and its index), so a change of quantity never moves the others: pieces are
 * only added or taken away, one at a time, by the grocer's hand. A piece whose size changes (a 2 lb bunch becoming a
 * 3 lb one) is taken away and its replacement brought. Each piece is painted once per size and quality, with a seed
 * of its own, so no two loaves or cartons are clones.
 */
import type { ItemKey } from '../types';
import { BASKET_LIMITS, ITEM_KEYS } from '../types';
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { BASKET_SLOTS } from './geom';
import { glazeSprite } from './light';
import { INK, LIGHT, SHADE, blobPoly, mix, pen, ribbon, wash } from './paint';

/** one piece on the counter: an item's index-th unit (a loaf, a carton, a bunch, a bird, a sack) of `size` pounds or
 *  dozens, with its place (base centre, screen world units) and its size */
export interface PieceSpec {
  id: string;
  key: ItemKey;
  idx: number;
  size: number;
  x: number;
  base: number;
  w: number;
  h: number;
  /** where a hand takes it, above its base (world units) */
  gripH: number;
}

/** how high each piece stands on the one below (eggs stack) */
const CARTON_H = 11;

/** the pieces of one item for a quantity, each with its fixed place */
export function piecesFor(key: ItemKey, q: number): PieceSpec[] {
  const n = Math.max(0, Math.min(BASKET_LIMITS[key].max, Math.round(q)));
  const s = BASKET_SLOTS[key];
  const out: PieceSpec[] = [];
  const add = (idx: number, size: number, x: number, base: number, w: number, h: number, gripH = h * 0.8) =>
    out.push({ id: `${key}:${idx}:${size}`, key, idx, size, x, base, w, h, gripH });
  switch (key) {
    case 'bread': {
      const at: [number, number][] = [[-17, 0], [17, 0], [-9, -7], [24, -7]];
      for (let i = 0; i < n; i++) add(i, 1, s.x + at[i]![0], s.y + at[i]![1], 34, 18.5);
      break;
    }
    case 'eggs':
      for (let i = 0; i < n; i++) add(i, 1, s.x + (i % 2 ? 1.2 : -0.8), s.y - i * CARTON_H, 44, CARTON_H + 1, CARTON_H * 0.7);
      break;
    case 'coffee': {
      const at: [number, number][] = [[-10, 0], [11, 0], [0, -7]];
      for (let i = 0; i < n; i++) add(i, 1, s.x + at[i]![0], s.y + at[i]![1], i === 1 ? 20 : 19, i === 1 ? 29 : 25);
      break;
    }
    case 'bananas': {
      const a = Math.min(n, 3);
      const b = n - a;
      if (a > 0) add(0, a, s.x - 13, s.y, 24 + 6 * a, 11 + 2.2 * a, 6 + 2 * a);
      if (b > 0) add(1, b, s.x + 21, s.y - 3, 24 + 6 * b, 11 + 2.2 * b, 6 + 2 * b);
      break;
    }
    case 'chicken': {
      const a = Math.min(n, 3);
      const b = n - a;
      if (a > 0) add(0, a, s.x - 14, s.y, 26 + 6 * a, 14 + 3 * a);
      if (b > 0) add(1, b, s.x + 21, s.y - 4, 26 + 6 * b, 14 + 3 * b);
      break;
    }
    case 'flour': {
      const a = Math.min(n, 5);
      const b = n - a;
      if (a > 0) add(0, a, s.x - 11, s.y, 15 + 3.4 * a, 17 + 3.8 * a);
      if (b > 0) add(1, b, s.x + 19, s.y - 4, 15 + 3.4 * b, 17 + 3.8 * b);
      break;
    }
  }
  return out;
}

/** every piece for a basket, back to front (the order they are drawn in) */
export function layoutBasket(qty: Record<ItemKey, number>): PieceSpec[] {
  const all: PieceSpec[] = [];
  for (const k of ITEM_KEYS) all.push(...piecesFor(k, qty[k]));
  return sortPieces(all);
}

export function sortPieces(ps: PieceSpec[]): PieceSpec[] {
  // back to front; a stack bottom up
  return ps.slice().sort((a, b) => b.base + (b.key === 'eggs' ? b.idx * CARTON_H : 0) - (a.base + (a.key === 'eggs' ? a.idx * CARTON_H : 0)) || a.x - b.x || a.idx - b.idx);
}

/* ------------------------------------------------------------------ painting */

/** an opaque solid: a wash laid thick, the ink stated on its shaded side and its foot */
function solid(ctx: CanvasRenderingContext2D, poly: number[], col: string, rnd: Rand, layers = 3): void {
  ctx.fillStyle = rgba(col, 0.9);
  tracePoly(ctx, poly);
  ctx.fill();
  wash(ctx, poly, col, 0.6, rnd, layers, 0.02);
}

/** the light from the upper left across a shape (lit stripe left, shade right, a pool of shade at the foot) */
function shapeLight(ctx: CanvasRenderingContext2D, poly: number[], x0: number, y0: number, w: number, h: number, lit = 0.3, shade = 0.34): void {
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h * 0.6);
  g.addColorStop(0, rgba(LIGHT, lit));
  g.addColorStop(0.42, rgba(LIGHT, 0));
  g.addColorStop(0.7, rgba(SHADE, shade * 0.5));
  g.addColorStop(1, rgba(SHADE, shade));
  ctx.fillStyle = g;
  ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
  const f = ctx.createLinearGradient(0, y0 + h * 0.7, 0, y0 + h);
  f.addColorStop(0, rgba(SHADE, 0));
  f.addColorStop(1, rgba(SHADE, shade * 0.6));
  ctx.fillStyle = f;
  ctx.fillRect(x0 - 2, y0 + h * 0.7, w + 4, h * 0.3 + 2);
  ctx.restore();
}

/** a broken ink contour round a polygon, heavier on the shaded right and the foot */
function inkRound(ctx: CanvasRenderingContext2D, poly: number[], rnd: Rand, cx: number, a = 0.6): void {
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    if (rnd.chance(0.16)) continue;
    const x0 = poly[i * 2]!;
    const y0 = poly[i * 2 + 1]!;
    const x1 = poly[((i + 1) % n) * 2]!;
    const y1 = poly[((i + 1) % n) * 2 + 1]!;
    const right = (x0 + x1) / 2 > cx;
    pen(ctx, x0, y0, x1, y1, right ? 0.6 : 0.42, INK, a * (right ? 1 : 0.7), rnd, 0.12);
  }
}

/** a contact shadow on the counter under a piece */
function foot(ctx: CanvasRenderingContext2D, w: number): void {
  const g = ctx.createRadialGradient(1.5, 0, 0, 1.5, 0, w * 0.55);
  g.addColorStop(0, 'rgba(46,26,22,0.32)');
  g.addColorStop(1, 'rgba(46,26,22,0)');
  ctx.save();
  ctx.scale(1, 0.22);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(1.5, 0, w * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** a loaf: a tin loaf (straight sides baked pale, a domed crust spilling over) or a bloomer (a long oval slashed across
 *  the top), dusted with flour now and then */
function loaf(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand): void {
  const tin = rnd.chance(0.55);
  const crust = mix(rnd.pick(['#B5702E', '#A86428', '#C07A36', '#9C5A24']), '#7A3E1A', rnd.range(0, 0.2));
  if (tin) {
    const sh = h * rnd.range(0.48, 0.56);
    const side = [-w * 0.44, 0, -w * 0.46, -sh, w * 0.46, -sh, w * 0.44, 0];
    solid(ctx, side, mix(crust, '#E8B878', 0.45), rnd);
    // the dome, a little wider than the tin, with the split along its top
    const dome: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = Math.PI * (1 - t);
      dome.push([Math.cos(a) * w * 0.5, -sh - Math.sin(a) * (h - sh) * (0.9 + 0.1 * Math.sin(t * 9 + rnd.next()))]);
    }
    dome.push([w * 0.47, -sh + 1.4], [-w * 0.47, -sh + 1.4]);
    const dp = deform(dome.flat(), rnd, 1, 0.02);
    solid(ctx, dp, crust, rnd);
    shapeLight(ctx, dp, -w / 2, -h, w, h - sh + 2, 0.34, 0.3);
    ctx.fillStyle = rgba('#F2D2A0', 0.45);
    ribbon(ctx, [-w * 0.3, -h * 0.9, -w * 0.05, -h * 0.98, w * 0.22, -h * 0.92], 1.4, 0.8, 0.3);
    pen(ctx, -w * 0.28, -h * 0.86, w * 0.26, -h * 0.88, 0.5, '#5A2E12', 0.55, rnd, 0.3);
    shapeLight(ctx, side, -w / 2, -sh, w, sh, 0.22, 0.34);
    inkRound(ctx, dp, rnd, 0);
    inkRound(ctx, side, rnd, 0, 0.45);
  } else {
    const pts: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = 1 + 0.03 * Math.sin(a * 3 + rnd.next() * 6);
      pts.push([Math.cos(a) * w * 0.5 * r, -h * 0.5 - Math.sin(a) * h * 0.5 * r * (Math.sin(a) > 0 ? 1 : 0.86)]);
    }
    const p = pts.flat();
    solid(ctx, p, crust, rnd);
    shapeLight(ctx, p, -w / 2, -h, w, h, 0.34, 0.34);
    // the slashes, opened pale in the oven
    const n = rnd.int(3, 5);
    for (let i = 0; i < n; i++) {
      const x = -w * 0.32 + (w * 0.64 * (i + 0.5)) / n;
      ctx.fillStyle = rgba('#EAC08A', 0.85);
      ribbon(ctx, [x - 2.2, -h * 0.62, x, -h * 0.85, x + 2.2, -h * 0.96], 1.3, 0.85);
      pen(ctx, x - 2.4, -h * 0.6, x + 2.2, -h * 0.98, 0.4, '#5A2E12', 0.5, rnd, 0.1);
    }
    inkRound(ctx, p, rnd, 0);
  }
  if (rnd.chance(0.5)) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rgba('#F8F0E0', rnd.range(0.2, 0.55));
      ctx.fillRect(rnd.range(-w * 0.35, w * 0.3), -h + rnd.range(0, h * 0.4), rnd.range(0.3, 0.9), rnd.range(0.3, 0.7));
    }
  }
}

/** a dozen eggs in a pressed-pulp carton, closed: the lid's ridges, the cups' scallops at the foot, a paper label */
function carton(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand, idx: number): void {
  const pulp = rnd.pick(['#BFC2B6', '#C9C4B0', '#B4BAB2', '#D2CCB6']);
  const body: number[] = [-w / 2 + 0.6, 0];
  // the cups' scallops along the foot
  for (let i = 0; i <= 6; i++) {
    const x = -w / 2 + 1 + ((w - 2) * i) / 6;
    body.push(x, -0.2 - 0.8 * Math.abs(Math.sin(i * 1.3)));
    if (i < 6) body.push(x + (w - 2) / 12, -1.6);
  }
  body.push(w / 2 - 0.6, 0, w / 2, -h * 0.55, w / 2 - 1, -h + 0.6, -w / 2 + 1, -h + 0.6, -w / 2, -h * 0.55);
  solid(ctx, body, pulp, rnd);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  // the lid line, the ridges over each pair of eggs, the pulp's fibre
  pen(ctx, -w / 2, -h * 0.5, w / 2, -h * 0.52, 0.4, mix(pulp, INK, 0.5), 0.6, rnd, 0.1);
  for (let i = 1; i < 6; i++) {
    const x = -w / 2 + (w * i) / 6;
    ctx.fillStyle = rgba(SHADE, 0.18);
    ctx.fillRect(x - 0.6, -h + 1, 1.2, h * 0.45);
    ctx.fillStyle = rgba(LIGHT, 0.3);
    ctx.fillRect(x - 2.4, -h + 1.2, 1, h * 0.4);
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#8A8A80' : '#F4F2EA', 0.25);
    ctx.fillRect(rnd.range(-w / 2, w / 2), rnd.range(-h, 0), rnd.range(0.3, 0.8), 0.25);
  }
  // the label: a printed band with a hen and the grade, stated with a few strokes
  const lx = -w * 0.18 + rnd.range(-2, 2);
  const lw = w * 0.36;
  ctx.fillStyle = rgba(rnd.pick(['#F2E6C2', '#EADCB4', '#F4EAD0']), 0.95);
  ctx.fillRect(lx, -h + 1.6, lw, h * 0.36);
  ctx.fillStyle = rgba(idx % 2 ? '#B5483A' : '#3E5F8C', 0.75);
  ctx.fillRect(lx, -h + 1.6, lw, 1);
  for (let i = 0; i < 3; i++) pen(ctx, lx + 2 + i * 4, -h + 4, lx + 4.5 + i * 4, -h + 4, 0.35, INK, 0.5, rnd, 0.05);
  ctx.restore();
  shapeLight(ctx, body, -w / 2, -h, w, h, 0.3, 0.3);
  inkRound(ctx, body, rnd, 0, 0.55);
}

/** a pound of ground coffee: a tin with its livery and a silvered rim, or a kraft paper bag rolled at the top */
function coffee(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand, bag: boolean): void {
  if (bag) {
    const kraft = rnd.pick(['#A87E52', '#B48A5C', '#9C744A']);
    const p = [-w / 2, 0, -w / 2 + 0.6, -h * 0.78, -w / 2 + 1.4, -h, w / 2 - 1.2, -h, w / 2 - 0.4, -h * 0.78, w / 2, 0];
    solid(ctx, p, kraft, rnd);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    // the rolled top with its tin tie, the gusset's fold, a printed label
    ctx.fillStyle = rgba('#6E4A2A', 0.35);
    ctx.fillRect(-w / 2, -h, w, h * 0.16);
    ctx.fillStyle = rgba('#C8C2B4', 0.95);
    ctx.fillRect(-w / 2, -h * 0.9, w, 1.1);
    pen(ctx, -w * 0.32, -h * 0.75, -w * 0.36, -2, 0.4, '#5A3A1E', 0.45, rnd, 0.2);
    ctx.fillStyle = rgba('#EFE2C2', 0.95);
    ctx.fillRect(-w * 0.28, -h * 0.6, w * 0.56, h * 0.3);
    ctx.fillStyle = rgba('#7A2E26', 0.8);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.5, 1.6, 2.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    pen(ctx, 0.8, -h * 0.58, -0.6, -h * 0.42, 0.25, '#F2E6C8', 0.8, rnd, 0.02);
    for (let i = 0; i < 2; i++) pen(ctx, -w * 0.2, -h * 0.38 + i * 1.6, w * 0.2, -h * 0.38 + i * 1.6, 0.3, INK, 0.45, rnd, 0.05);
    ctx.restore();
    shapeLight(ctx, p, -w / 2, -h, w, h, 0.28, 0.36);
    inkRound(ctx, p, rnd, 0, 0.55);
    return;
  }
  const col = rnd.pick(['#8E2A24', '#6A2A1E', '#2E4A3C', '#B5483A']);
  const p = [-w / 2, 0, -w / 2, -h + 1.6, w / 2, -h + 1.6, w / 2, 0];
  solid(ctx, p, col, rnd);
  ctx.save();
  tracePoly(ctx, p);
  ctx.clip();
  const band = rnd.pick(['#E8D49A', '#F0E6CC', '#C9A04A']);
  ctx.fillStyle = rgba(band, 0.95);
  ctx.fillRect(-w / 2, -h * 0.66, w, h * 0.34);
  ctx.fillStyle = rgba('#3A2018', 0.85);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.5, 2, 2.6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  pen(ctx, 0.9, -h * 0.6, -0.8, -h * 0.4, 0.3, band, 0.9, rnd, 0.02);
  for (let i = 0; i < 2; i++) pen(ctx, -w * 0.34, -h * 0.22 + i * 1.8, w * 0.34, -h * 0.22 + i * 1.8, 0.35, mix(band, INK, 0.2), 0.6, rnd, 0.05);
  ctx.restore();
  shapeLight(ctx, p, -w / 2, -h, w, h, 0.3, 0.38);
  // the lid: silvered tin, lit on the left, its ellipse
  ctx.fillStyle = rgba('#B8B2A2', 0.95);
  ribbon(ctx, [-w / 2 + 0.3, -h + 1.8, 0, -h + 2, w / 2 - 0.3, -h + 1.8], 2.4, 0.8);
  ctx.fillStyle = rgba('#E8E2CE', 0.9);
  ctx.beginPath();
  ctx.ellipse(0, -h + 1.2, w / 2 - 0.2, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.45;
  ctx.stroke();
  pen(ctx, -w / 2, -h + 1.4, -w / 2, 0, 0.45, INK, 0.45, rnd, 0.1);
  pen(ctx, w / 2, -h + 1.4, w / 2, 0, 0.65, INK, 0.65, rnd, 0.1);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 1.6, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
}

/** a bunch of bananas: three to a pound, curved fingers fanning from the crown, yellow with green toward the stem and
 *  a few brown freckles */
function bananas(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand, lb: number): void {
  const n = Math.max(2, Math.round(lb * 3 + rnd.range(-0.4, 0.4)));
  const crown: [number, number] = [-w * 0.42, -h * 0.55];
  const yellow = rnd.pick(['#E8C24A', '#F0CC56', '#E2B844']);
  for (let i = 0; i < n; i++) {
    // back fingers first: the further ones a little higher and paler
    const u = n === 1 ? 0.5 : i / (n - 1);
    const lift = (1 - u) * h * 0.38;
    const len = w * rnd.range(0.82, 0.96);
    const bend = h * rnd.range(0.42, 0.6);
    const thick = 4 + rnd.range(-0.4, 0.6) + lb * 0.25;
    const pts: number[] = [];
    const top: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const x = crown[0] + 1.5 + t * len;
      const yc = crown[1] - lift + 1.2 + Math.sin(t * Math.PI) * bend * 0.55 - t * t * bend * 0.5 + u * h * 0.1;
      const th = thick * Math.sin(Math.PI * (0.06 + t * 0.88)) ** 0.6;
      pts.push(x, yc + th / 2);
      top.push(x, yc - th / 2);
    }
    const under: number[] = [];
    for (let j = pts.length - 2; j >= 0; j -= 2) under.push(pts[j]!, pts[j + 1]!);
    const poly = [...top, ...under];
    const col = mix(yellow, '#C8B868', (1 - u) * 0.18);
    solid(ctx, poly, col, rnd, 2);
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // green toward the stem, the ridge along the finger, freckles
    const g = ctx.createLinearGradient(crown[0], 0, crown[0] + len * 0.4, 0);
    g.addColorStop(0, rgba('#7A9A3A', 0.6));
    g.addColorStop(1, rgba('#7A9A3A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(crown[0], -h * 1.5, len * 0.5, h * 2);
    ctx.fillStyle = rgba('#FFF2C0', 0.4);
    ribbon(ctx, top.map((v, j) => (j % 2 ? v + 1 : v)), 0.8, 0.8);
    ctx.fillStyle = rgba(SHADE, 0.28);
    ribbon(ctx, top.map((v, j) => (j % 2 ? v + thick * 0.75 : v)), 1.2, 0.8);
    for (let k = 0; k < 6 + lb * 2; k++) {
      ctx.fillStyle = rgba('#6A4020', rnd.range(0.25, 0.55));
      ctx.beginPath();
      ctx.arc(crown[0] + rnd.range(0.3, 0.95) * len, top[11 + 2 * rnd.int(0, 4)]! + rnd.range(0.8, thick - 0.6), rnd.range(0.2, 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    inkRound(ctx, poly, rnd, crown[0] + len * 0.6, 0.5);
    // the dark tip
    const tx = top[20]!;
    const ty = top[21]!;
    ctx.fillStyle = rgba('#3A2A1A', 0.8);
    ctx.beginPath();
    ctx.ellipse(tx + 0.4, ty + thick * 0.2, 0.9, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the crown and its stalk
  const st = [crown[0] - 2.6, crown[1] - 1.6, crown[0] + 2.2, crown[1] - 2.4, crown[0] + 2.6, crown[1] + 2.4, crown[0] - 2.2, crown[1] + 2.8];
  solid(ctx, st, '#6E7A3A', rnd, 2);
  ctx.fillStyle = rgba('#3A3018', 0.8);
  ctx.fillRect(crown[0] - 3.2, crown[1] - 1.6, 1.2, 3.6);
}

/** a whole chicken in butcher's paper: the paper folded round it and tied with string, open at the top on the bird's
 *  pale breast, the drumsticks' knuckles poking out */
function chicken(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand): void {
  const skin = rnd.pick(['#EBC9A0', '#E6C092', '#F0D0AA']);
  // the bird, seen over the paper
  const bird: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    bird.push(-Math.cos(a) * w * 0.4, -h * 0.45 - Math.sin(a) * h * 0.55 * (1 + 0.06 * Math.sin(a * 3)));
  }
  solid(ctx, bird, skin, rnd);
  shapeLight(ctx, bird, -w * 0.4, -h, w * 0.8, h * 0.6, 0.4, 0.28);
  ctx.fillStyle = rgba('#D8A27A', 0.4);
  ribbon(ctx, [-w * 0.05, -h * 0.98, 0, -h * 0.75, w * 0.04, -h * 0.5], 0.8, 0.8);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = rgba('#C89068', 0.25);
    ctx.fillRect(rnd.range(-w * 0.3, w * 0.3), rnd.range(-h * 0.95, -h * 0.5), 0.4, 0.4);
  }
  inkRound(ctx, bird, rnd, 0, 0.45);
  // the drumsticks' knuckles at the right end
  for (const dy of [-h * 0.72, -h * 0.6]) {
    ctx.fillStyle = rgba('#F2DCC0', 0.95);
    ctx.beginPath();
    ctx.ellipse(w * 0.43, dy, 2.2, 1.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  // the paper: folded up round the bird, its edges crisp and its creases
  const paper = rnd.pick(['#EEE6D6', '#F2E8DC', '#E8DCCA']);
  const pp = [-w / 2, 0, -w * 0.5, -h * 0.5, -w * 0.32, -h * 0.62, -w * 0.08, -h * 0.5, w * 0.16, -h * 0.6, w * 0.4, -h * 0.5, w / 2, -h * 0.55, w / 2, 0];
  solid(ctx, pp, paper, rnd);
  ctx.save();
  tracePoly(ctx, pp);
  ctx.clip();
  for (let i = 0; i < 4; i++) {
    const x = rnd.range(-w * 0.4, w * 0.4);
    pen(ctx, x, -h * 0.55, x + rnd.range(-4, 4), -0.5, 0.35, '#9A8A76', 0.35, rnd, 0.3);
  }
  // a butcher's pink blot where the paper touched the bird, and his pencilled weight
  ctx.fillStyle = rgba('#D8A0A0', 0.2);
  tracePoly(ctx, deform(blobPoly(w * 0.05, -h * 0.4, w * 0.2, h * 0.08, rnd, 10, 0.3), rnd, 2, 0.1));
  ctx.fill();
  pen(ctx, -w * 0.3, -h * 0.25, -w * 0.18, -h * 0.25, 0.35, '#3A3A44', 0.55, rnd, 0.05);
  pen(ctx, -w * 0.15, -h * 0.27, -w * 0.08, -h * 0.22, 0.35, '#3A3A44', 0.55, rnd, 0.05);
  ctx.restore();
  shapeLight(ctx, pp, -w / 2, -h * 0.6, w, h * 0.6, 0.3, 0.34);
  inkRound(ctx, pp, rnd, 0, 0.55);
  // the string, round the parcel
  pen(ctx, -w * 0.12, -h * 0.56, -w * 0.1, 0, 0.55, '#B89A6A', 0.95, rnd, 0.1);
  pen(ctx, -w * 0.5, -h * 0.28, w * 0.5, -h * 0.3, 0.55, '#B89A6A', 0.9, rnd, 0.1);
}

/** a paper sack of flour, tied at the neck, printed with a band and a wheat sheaf; its size by weight; a dust of flour
 *  at its foot */
function flourSack(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rand): void {
  const cloth = rnd.pick(['#EDE6D4', '#E6DCC4', '#F0EADC']);
  const mx = 0;
  const pinch = w * rnd.range(0.14, 0.2);
  const sh = h * rnd.range(0.24, 0.3);
  const x = -w / 2;
  const y0 = -h;
  const poly = [mx - pinch, y0, mx - pinch * 0.8, y0 + sh * 0.5, x + w * 0.05, y0 + sh * 1.15, x - 0.5, y0 + h * 0.62, x + w * 0.04, -2, x + w * 0.2, 0, x + w * 0.8, 0, x + w * 0.96, -2, x + w + 0.5, y0 + h * 0.62, x + w * 0.95, y0 + sh * 1.15, mx + pinch * 0.8, y0 + sh * 0.5, mx + pinch, y0];
  solid(ctx, poly, cloth, rnd);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let yy = y0; yy < 0; yy += 1.2) {
    ctx.fillStyle = rgba('#8A7A5A', 0.08);
    ctx.fillRect(x - 1, yy, w + 2, 0.3);
  }
  const band = rnd.pick(['#3E5F8C', '#B5483A', '#4F7A5A']);
  ctx.fillStyle = rgba(band, 0.8);
  ctx.fillRect(x, y0 + h * 0.56, w, h * 0.12);
  // the wheat sheaf: a few strokes fanning up
  const cy = y0 + h * 0.42;
  for (let i = -2; i <= 2; i++) pen(ctx, mx, cy + 3.2, mx + i * 1.4, cy - 2.4, 0.35, '#B88A2A', 0.8, rnd, 0.05);
  ctx.fillStyle = rgba('#D9B55A', 0.6);
  ctx.beginPath();
  ctx.ellipse(mx, cy - 2.2, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  pen(ctx, x + w * 0.24, y0 + h * 0.78, x + w * 0.76, y0 + h * 0.78, 0.35, INK, 0.45, rnd, 0.05);
  ctx.restore();
  shapeLight(ctx, poly, x, y0, w, h, 0.26, 0.36);
  ctx.fillStyle = rgba(SHADE, 0.2);
  ribbon(ctx, [mx - 1, y0 + sh * 0.7, mx - w * 0.1, y0 + h * 0.5, mx - w * 0.08, -2], 1.2, 0.9);
  inkRound(ctx, poly, rnd, 0, 0.55);
  // the tie
  pen(ctx, mx - pinch, y0 + 1.5, mx + pinch, y0 + 2.2, 0.8, '#8A6A3A', 0.8, rnd, 0.1);
  solid(ctx, [mx - pinch - 0.5, y0, mx - pinch * 2, y0 - 2.5, mx - pinch * 0.4, y0 - 1.6, mx, y0 - 3.4, mx + pinch * 0.6, y0 - 1.6, mx + pinch * 2, y0 - 2.8, mx + pinch + 0.5, y0], cloth, rnd);
  // flour that has puffed out at the foot
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = rgba('#FBF6EA', rnd.range(0.2, 0.5));
    ctx.beginPath();
    ctx.ellipse(rnd.range(-w * 0.6, w * 0.6), rnd.range(-1.2, 0.6), rnd.range(0.4, 1.4), rnd.range(0.2, 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ the sprites */

export interface PieceSprite {
  cv: HTMLCanvasElement;
  /** the base centre inside the canvas (world units) and the canvas's size in world units */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/**
 * The pieces' paintings, made once per piece and quality and glazed with the counter top's lamplight at the piece's
 * own place (an item carried in the hand keeps the light of where it lies: across a reach the difference does not
 * show).
 */
export class BasketArt {
  private q = 0;
  private readonly cache = new Map<string, PieceSprite>();

  setQuality(q: number): void {
    if (Math.abs(q - this.q) / Math.max(1e-6, this.q) < 0.03) return;
    this.q = q;
    this.cache.clear();
  }

  sprite(p: PieceSpec): PieceSprite {
    let s = this.cache.get(p.id);
    if (s) return s;
    const q = this.q || 1;
    const pad = 6;
    const W = p.w + pad * 2 + 8;
    const H = p.h + pad * 2 + 6;
    const cv = makeCanvas(Math.ceil(W * q), Math.ceil(H * q));
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const ox = W / 2;
    const oy = H - pad;
    ctx.setTransform(q, 0, 0, q, ox * q, oy * q);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const KS: Record<ItemKey, number> = { bread: 1, eggs: 2, coffee: 3, bananas: 4, chicken: 5, flour: 6 };
    const rnd = new Rand(77000 + KS[p.key] * 1000 + p.idx * 37 + p.size * 7);
    foot(ctx, p.w);
    switch (p.key) {
      case 'bread':
        loaf(ctx, p.w, p.h, rnd);
        break;
      case 'eggs':
        carton(ctx, p.w, p.h - 1, rnd, p.idx);
        break;
      case 'coffee':
        coffee(ctx, p.w, p.h, rnd, p.idx === 1);
        break;
      case 'bananas':
        bananas(ctx, p.w, p.h, rnd, p.size);
        break;
      case 'chicken':
        chicken(ctx, p.w, p.h, rnd);
        break;
      case 'flour':
        flourSack(ctx, p.w, p.h, rnd);
        break;
    }
    // the counter's lamplight over it, as over the counter itself
    glazeSprite(cv, { x: p.x - ox, y: p.base - oy, w: W, h: H }, q, () => 'top', 61 + KS[p.key], () => 0.12, 0.18, 0.25);
    s = { cv, ox, oy, w: W, h: H };
    this.cache.set(p.id, s);
    return s;
  }

  /** draw a piece with its base centre at (x, base) */
  draw(ctx: CanvasRenderingContext2D, p: PieceSpec, x = p.x, base = p.base): void {
    const s = this.sprite(p);
    ctx.drawImage(s.cv, x - s.ox, base - s.oy, s.w, s.h);
  }
}
