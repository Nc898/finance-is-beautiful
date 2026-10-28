/**
 * The static world, painted once per size into one cached layer: hazy blue-violet hills, nearer hills of spring
 * fields and hedgerows with copses in fresh leaf and white blossom trees dotted about, the village behind the plots
 * (red tile and grey slate roofs, chimneys, a church tower with a weathervane), the hedge along the back of the
 * gardens with a gap where the road comes through, the two plots of new grass and trodden earth, the garden paths,
 * the road down from the village, the lane with its ruts and puddles, and the verges with daffodils and primroses.
 * Translucent washes lit from the upper left, paper tooth, a few broken ink lines. The two houses are reserved
 * (left as paper) so their pencil drawings sit on clean paper.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, bloom, blobPoly, flowerDab, grassTuft } from '../../river/scene/paint';
import { mix, ribbon } from '../../river/scene/boatInk';
import { FENCE_Y, GATE, GROUND_Y, HEDGE_Y, HOUSE, JUNCTION, LANE, ROAD_FAR, SIDE_BLOSSOMS } from './geom';
import { silhouette, PAPER } from './housePaint';
import { drawClump, laySpringTree, renderSpringTree, springSprites, type SpringTree } from './springArt';
import { daffodil, paintBeds, paintForeground } from './flowers';
import type { Camera } from './layout';
import { LOANS } from '../types';
import type { Sprites } from '../../scene/sprites';
import type { SpriteKind } from '../../scene/watercolor';

export interface WorldLayer {
  cv: HTMLCanvasElement;
  /** device px per css px of the layer */
  gd: number;
}

interface View {
  x0: number;
  x1: number;
  y1: number;
}

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** the blossom trees beside the houses (behind the houses' fronts: a house's outline hides any crown it overlaps) */
const SIDE_TREES: SpringTree[] = SIDE_BLOSSOMS.map((p, i) => ({ seed: [5203, 5309][i]!, x: p.x, y: p.y, k: 0.33, m: 1, kit: 'blossom' as const, haze: 0, flip: i === 1 }));

export const ridgeFar = (x: number): number => 246 + 14 * Math.sin(x / 160 + 0.8) + 7 * Math.sin(x / 67 + 2.1) + 3 * Math.sin(x / 31);
export const ridgeMid = (x: number): number => 276 + 9 * Math.sin(x / 120 + 2.4) + 5 * Math.sin(x / 53 + 0.4) + 2 * Math.sin(x / 26);
export const ridgeNear = (x: number): number => 312 + 7 * Math.sin(x / 105 + 0.6) + 4 * Math.sin(x / 44 + 1.8) + 2 * Math.sin(x / 21);

const xs = (a: number, b: number, step: number): number[] => {
  const o: number[] = [];
  for (let x = a; x <= b + step; x += step) o.push(x);
  return o;
};

/** half the road's width at depth y (it widens toward us) */
export const roadHalf = (y: number): number => 7 + (y - ROAD_FAR.y) * 0.1;

function haze(ctx: CanvasRenderingContext2D, v: View, y0: number, y1: number, a: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(PAPER, 0));
  g.addColorStop(1, rgba(PAPER, a));
  ctx.fillStyle = g;
  ctx.fillRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
  ctx.restore();
}

export async function buildWorld(cam: Camera, check: () => boolean): Promise<WorldLayer | null> {
  const v: View = { x0: -cam.ox / cam.s - 40, x1: (cam.cssW - cam.ox) / cam.s + 40, y1: (cam.cssH - cam.oy) / cam.s + 20 };
  const gd = Math.max(0.75, cam.dpr * Math.min(1.5, Math.sqrt(11e6 / (cam.cssW * cam.cssH * cam.dpr * cam.dpr))));
  const cv = makeCanvas(cam.cssW * gd, cam.cssH * gd);
  const ctx = cv.getContext('2d')!;
  const A = gd * cam.s;
  ctx.setTransform(A, 0, 0, A, gd * cam.ox, gd * cam.oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rnd = new Rand(40441);
  const sd = A > 1.6 ? 1 : 0.7;
  const leaf = await springSprites('leaf', sd, tick, check);
  if (!check()) return null;
  const blossom = await springSprites('blossom', sd, tick, check);
  if (!check()) return null;

  paintHills(ctx, rnd, v);
  await tick();
  if (!check()) return null;
  paintFields(ctx, rnd, v);
  paintCopses(ctx, rnd, v, leaf, blossom);
  await tick();
  if (!check()) return null;
  paintVillage(ctx, rnd);
  paintHedge(ctx, rnd, v, leaf, blossom);
  await tick();
  if (!check()) return null;
  paintPlots(ctx, rnd, v);
  // a blossom tree beside each house, framing the street (behind the houses: their outlines are reserved)
  for (const t of SIDE_TREES) {
    const r = await renderSpringTree(t, A, A > 1.6 ? 1.4 : 1, tick, check);
    if (!r || !check()) return null;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(80,80,70,0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 10, t.y + 2, 34, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    laySpringTree(ctx, t, r, A);
  }
  paintBeds(ctx, new Rand(51515));
  paintRoad(ctx, rnd);
  paintLane(ctx, rnd, v);
  await tick();
  if (!check()) return null;
  paintVerges(ctx, rnd, v);
  paintForeground(ctx, new Rand(61616), v.x0, v.x1, v.y1);
  paintShadows(ctx);

  // the houses are reserved: their outlines are left as paper for the pencil drawings
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const id of LOANS) for (const poly of silhouette(id)) {
    tracePoly(ctx, poly);
    ctx.fill();
  }
  ctx.restore();
  return { cv, gd };
}

/* ------------------------------------------------------------------ hills */

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 200;
  const y1 = HEDGE_Y + 10;
  const X = xs(v.x0, v.x1, 18);
  const soft = new SoftLayer(v.x0, y0, v.x1 - v.x0, y1 - y0, 0.45);
  const range = (ridge: (x: number) => number, base: number, color: string, a: number, crisp: number) => {
    const pts: number[] = [];
    for (const x of X) pts.push(x, ridge(x));
    for (let i = X.length - 1; i >= 0; i--) pts.push(X[i]!, base);
    const top = Math.min(...X.map(ridge));
    soft.ctx.clearRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
    const g = soft.ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.6, rgba(color, a * 0.7));
    g.addColorStop(1, rgba(color, a * 0.25));
    soft.ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      tracePoly(soft.ctx, deform(pts, rnd, 2, 0.012));
      soft.ctx.fill();
    }
    soft.draw(ctx, 1, 'multiply');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(color, a * crisp * 0.5);
    tracePoly(ctx, deform(pts, rnd, 3, 0.02));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(mix(color, '#3A3A5A', 0.4), 0.12 + crisp * 0.06);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([36, 6, 14, 4]);
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 0.6) : ctx.moveTo(x, ridge(x) + 0.6)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,250,228,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 2.2) : ctx.moveTo(x, ridge(x) + 2.2)));
    ctx.stroke();
  };
  const blooms = (ridge: (x: number) => number, n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], dy: [number, number]) => {
    soft.ctx.clearRect(v.x0, y0, v.x1 - v.x0, y1 - y0);
    for (let i = 0; i < n; i++) {
      const x = rnd.range(v.x0, v.x1);
      bloom(soft.ctx, x, ridge(x) + rnd.range(dy[0], dy[1]), rnd.range(rx[0], rx[1]), rnd.range(ry[0], ry[1]), rnd.pick(cols), a, rnd, 4);
    }
    soft.draw(ctx, 1, 'multiply');
  };
  range(ridgeFar, y1, '#A9AED6', 0.3, 0.55);
  blooms(ridgeFar, 10, ['#B8B4DC', '#A2B6DA', '#C2C8E0'], 0.12, [50, 140], [6, 14], [8, 24]);
  haze(ctx, v, y0 + 60, y1, 0.3);
  range(ridgeMid, y1, '#96B0B4', 0.3, 0.6);
  blooms(ridgeMid, 14, ['#A8C08C', '#B4C894', '#9CB4B8', '#C2CC96'], 0.14, [40, 110], [6, 12], [6, 20]);
  haze(ctx, v, y0 + 80, y1, 0.26);
  range(ridgeNear, y1, '#A2BE7E', 0.34, 0.7);
  blooms(ridgeNear, 16, ['#B8D284', '#9CBA6E', '#C8D88E', '#A8C27A', '#D2D68C'], 0.16, [36, 110], [5, 11], [4, 18]);
}

/* ------------------------------------------------------------------ fields and copses */

function paintFields(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  // a patchwork on the nearer slope: fresh grass, young corn, a ploughed field or two, the hedgerows between
  for (let i = 0; i < 54; i++) {
    const x = rnd.range(v.x0, v.x1);
    const y = rnd.range(ridgeNear(x) + 6, HEDGE_Y - 8);
    const w = rnd.range(30, 90);
    const h = rnd.range(3, 8);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(rnd.pick(['#C8DC8C', '#B2CE78', '#D8E2A0', '#A6C474', '#C9B48C', '#BEC88A']), rnd.range(0.12, 0.24));
    tracePoly(ctx, deform([x, y, x + w * 0.5, y - h * 0.35, x + w, y - h * 0.2, x + w * 0.95, y + h, x + w * 0.5, y + h * 1.1, x + w * 0.05, y + h], rnd, 2, 0.06));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (rnd.chance(0.5)) {
      ctx.strokeStyle = rgba('#5E7A44', rnd.range(0.16, 0.28));
      ctx.lineWidth = rnd.range(0.5, 1);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.2 + rnd.range(-1, 1), x + w, y + h * 1.05);
      ctx.stroke();
    }
  }
  haze(ctx, v, ridgeNear(500) - 10, HEDGE_Y, 0.08);
}

function pick(sp: Sprites, rnd: Rand, tones: SpriteKind[]) {
  const list = sp.kinds[rnd.pick(tones)]!;
  return list[rnd.int(0, list.length - 1)]!;
}

function paintCopses(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites, blossom: Sprites): void {
  // far: a band of small pale clumps along the middle ridge, veiled
  const band = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const b = band.getContext('2d')!;
  b.setTransform(ctx.getTransform());
  for (let x = v.x0; x < v.x1; x += rnd.range(12, 24)) {
    if (Math.sin(x / 80 + 1.2) + 0.5 * Math.sin(x / 29) < -0.25) continue;
    const bl = rnd.chance(0.12);
    drawClump(b, pick(bl ? blossom : leaf, rnd, ['lit', 'mid', 'gold', 'shade']), x, ridgeMid(x) + rnd.range(3, 9), rnd.range(14, 22), rnd.chance(0.5));
  }
  b.save();
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba(PAPER, 0.5);
  b.fillRect(0, 0, band.width, band.height);
  b.fillStyle = 'rgba(152,168,214,0.18)';
  b.fillRect(0, 0, band.width, band.height);
  b.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();
  // near: copses along the front ridge, a white blossom tree here and there
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, band.width, band.height);
  b.setTransform(ctx.getTransform());
  for (let x = v.x0; x < v.x1; x += rnd.range(10, 20)) {
    const patch = Math.sin(x / 70 + 0.4) + 0.55 * Math.sin(x / 27 + 2.3) + 0.25;
    if (patch < -0.1) continue;
    const bl = rnd.chance(0.16);
    const base = ridgeNear(x) + rnd.range(2, 10);
    drawClump(b, pick(bl ? blossom : leaf, rnd, bl ? ['lit', 'gold', 'mid'] : ['lit', 'mid', 'shade', 'gold']), x, base, rnd.range(22, 36), rnd.chance(0.5));
  }
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = rgba(PAPER, 0.22);
  b.fillRect(0, 0, band.width, band.height);
  b.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, 0);
  ctx.restore();
}

/* ------------------------------------------------------------------ the village */

interface Cottage {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: number;
  slate: boolean;
}

function paintVillage(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // a cluster of roofs on the rising ground behind the plots, the church tower among them; farther = smaller, paler
  const homes: Cottage[] = [];
  for (let i = 0; i < 16; i++) {
    const y = rnd.range(338, 392);
    const k = 0.5 + (y - 338) / 120;
    const x = rnd.range(330, 700);
    homes.push({ x, y, w: rnd.range(26, 44) * k, h: rnd.range(10, 16) * k, roof: rnd.range(9, 15) * k, slate: rnd.chance(0.35) });
  }
  homes.sort((a, b) => a.y - b.y);
  // the church: a squat stone tower with a pyramid cap and a weathervane, set a little back
  const church = { x: 586, y: 352 };
  let churchDone = false;
  for (const h of homes) {
    if (!churchDone && h.y > church.y) {
      paintChurch(ctx, rnd, church.x, church.y);
      churchDone = true;
    }
    const fade = 0.35 - (h.y - 338) / 260;
    const wall = mix(rnd.pick(['#E8DCC4', '#E2D2B6', '#D9C6A6', '#EAE0CC']), PAPER, fade);
    const roofC = mix(h.slate ? rnd.pick(['#8A90A2', '#7E8496', '#9498AA']) : rnd.pick(['#C27A5C', '#B86E52', '#CC8664', '#B07458']), PAPER, fade);
    const x0 = h.x - h.w / 2;
    const x1 = h.x + h.w / 2;
    // the wall in light, its right end in shade
    ctx.fillStyle = rgba(wall, 0.9);
    tracePoly(ctx, deform([x0, h.y, x0, h.y - h.h, x1, h.y - h.h, x1, h.y], rnd, 1, 0.02));
    ctx.fill();
    ctx.fillStyle = rgba('#6A5A70', 0.16);
    ctx.fillRect(x1 - h.w * 0.22, h.y - h.h, h.w * 0.22, h.h);
    // a window or two, a door
    ctx.fillStyle = rgba('#5A5468', 0.45 - fade * 0.5);
    for (let k = 0; k < 2; k++) ctx.fillRect(x0 + h.w * (0.18 + k * 0.42), h.y - h.h * 0.72, h.w * 0.1, h.h * 0.3);
    // the roof: a hipped or gabled shape, lit on the left
    const rp = [x0 - 1.2, h.y - h.h, x0 + h.w * 0.16, h.y - h.h - h.roof, x1 - h.w * 0.16, h.y - h.h - h.roof, x1 + 1.2, h.y - h.h];
    ctx.fillStyle = rgba(roofC, 0.92);
    tracePoly(ctx, deform(rp, rnd, 1, 0.02));
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,214,0.18)';
    tracePoly(ctx, [rp[0]!, rp[1]!, rp[2]!, rp[3]!, rp[2]! + h.w * 0.25, rp[3]!, x0 + h.w * 0.2, h.y - h.h]);
    ctx.fill();
    ctx.strokeStyle = rgba('#3E3440', 0.3 - fade * 0.3);
    ctx.lineWidth = 0.4;
    tracePoly(ctx, rp);
    ctx.stroke();
    // a chimney
    if (rnd.chance(0.75)) {
      const cx = rnd.chance(0.5) ? x0 + h.w * 0.25 : x1 - h.w * 0.25;
      ctx.fillStyle = rgba(mix('#A65A44', PAPER, fade), 0.9);
      ctx.fillRect(cx - 1.4, h.y - h.h - h.roof - 3.5, 2.8, 5);
    }
  }
  if (!churchDone) paintChurch(ctx, rnd, church.x, church.y);
  // the village sits in the haze: a soft veil at its feet where the hedge will be
  const g = ctx.createLinearGradient(0, 360, 0, HEDGE_Y);
  g.addColorStop(0, rgba(PAPER, 0));
  g.addColorStop(1, rgba(PAPER, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(300, 360, 440, HEDGE_Y - 360);
}

function paintChurch(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number): void {
  const w = 22;
  const h = 46;
  const stone = mix('#C9BEA6', PAPER, 0.25);
  ctx.fillStyle = rgba(stone, 0.95);
  tracePoly(ctx, deform([x - w / 2, y, x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y], rnd, 1, 0.015));
  ctx.fill();
  ctx.fillStyle = 'rgba(96,86,110,0.2)';
  ctx.fillRect(x + w * 0.18, y - h, w * 0.32, h);
  // the coursed stone, a belfry louvre, the battlement-less pyramid cap, the vane
  ctx.strokeStyle = 'rgba(110,100,96,0.2)';
  ctx.lineWidth = 0.3;
  for (let yy = y - 4; yy > y - h; yy -= 4) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, yy);
    ctx.lineTo(x + w / 2, yy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70,62,80,0.5)';
  tracePoly(ctx, [x - 3, y - h + 16, x - 3, y - h + 8, x, y - h + 5, x + 3, y - h + 8, x + 3, y - h + 16]);
  ctx.fill();
  ctx.fillStyle = rgba(mix('#7E8494', PAPER, 0.2), 0.95);
  tracePoly(ctx, [x - w / 2 - 1, y - h, x, y - h - 14, x + w / 2 + 1, y - h]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,244,220,0.2)';
  tracePoly(ctx, [x - w / 2 - 1, y - h, x, y - h - 14, x - 2, y - h]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,50,56,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y - h - 14);
  ctx.lineTo(x, y - h - 22);
  ctx.moveTo(x - 3.5, y - h - 19);
  ctx.lineTo(x + 3.5, y - h - 19);
  ctx.stroke();
  // the cockerel on the vane
  ctx.fillStyle = 'rgba(58,50,56,0.7)';
  tracePoly(ctx, [x - 2.4, y - h - 22, x + 0.5, y - h - 24.6, x + 2.6, y - h - 22.4, x + 0.6, y - h - 21.6]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,50,56,0.5)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x - w / 2, y - h, w, h);
}

/* ------------------------------------------------------------------ the back hedge */

function paintHedge(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, leaf: Sprites, blossom: Sprites): void {
  const gap0 = ROAD_FAR.x - roadHalf(ROAD_FAR.y) - 7;
  const gap1 = ROAD_FAR.x + roadHalf(ROAD_FAR.y) + 7;
  const strip = (x0: number, x1: number) => {
    const top: number[] = [];
    const bot: number[] = [];
    for (let x = x0; x <= x1 + 2; x += 3) {
      const bump = 4 + 2.4 * Math.abs(Math.sin(x / 4.1 + 1)) + 1.6 * Math.abs(Math.sin(x / 7.7));
      top.push(x, HEDGE_Y - bump);
      bot.unshift(x, HEDGE_Y + 5);
    }
    const poly = [...top, ...bot];
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a] of [['#8EB25A', 0.3], ['#5E8A44', 0.24], ['#3E6638', 0.16]] as const) {
      ctx.fillStyle = rgba(c, a);
      tracePoly(ctx, deform(poly, rnd, 2, 0.012));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let x = x0 + 6; x < x1 - 4; x += rnd.range(14, 26)) {
      const bl = rnd.chance(0.1);
      drawClump(ctx, pick(bl ? blossom : leaf, rnd, ['mid', 'shade', 'back', 'lit']), x, HEDGE_Y + rnd.range(0, 4), rnd.range(22, 34), rnd.chance(0.5));
    }
  };
  strip(v.x0, gap0);
  strip(gap1, v.x1);
}

/* ------------------------------------------------------------------ the plots, the road, the lane */

function grassWash(ctx: CanvasRenderingContext2D, rnd: Rand, poly: number[], cols: string[], a: number): void {
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba(cols[i % cols.length]!, a);
    tracePoly(ctx, deform(poly, rnd, 2, 0.008));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function paintPlots(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  // new grass from the hedge to the lane
  grassWash(ctx, rnd, [v.x0, HEDGE_Y + 2, v.x1, HEDGE_Y + 2, v.x1, LANE.y0 + 4, v.x0, LANE.y0 + 4], ['#C4DC86', '#B2D078', '#D2E296'], 0.3);
  const soft = new SoftLayer(v.x0, HEDGE_Y, v.x1 - v.x0, LANE.y0 - HEDGE_Y + 10, 0.5);
  for (let i = 0; i < 40; i++) {
    bloom(soft.ctx, rnd.range(v.x0, v.x1), rnd.range(HEDGE_Y + 6, LANE.y0), rnd.range(20, 70), rnd.range(4, 10), rnd.pick(['#A8C870', '#C2D884', '#94B862', '#D6E09A']), 0.18, rnd, 3);
  }
  soft.draw(ctx, 1, 'multiply');
  // the building site: trodden earth and sand along the front of each house, scuffed into the grass
  for (const id of LOANS) {
    const W = HOUSE[id].wall;
    const earth = blobPoly((W.x0 + W.x1) / 2, GROUND_Y + 16, (W.x1 - W.x0) / 2 + 30, 20, rnd, 22, 0.12);
    for (const [c, a] of [['#E2CDA6', 0.5], ['#D4B88E', 0.3], ['#EAD8B6', 0.3]] as const) {
      ctx.fillStyle = rgba(c, a);
      tracePoly(ctx, deform(earth, rnd, 3, 0.05));
      ctx.fill();
    }
    // the earth is darker and damper close under the wall
    ctx.fillStyle = rgba('#A88A66', 0.16);
    tracePoly(ctx, deform(blobPoly((W.x0 + W.x1) / 2, GROUND_Y + 6, (W.x1 - W.x0) / 2 + 12, 7, rnd, 18, 0.1), rnd, 2, 0.04));
    ctx.fill();
    // footprints and barrow ruts in the earth
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = rgba('#7A5A3E', rnd.range(0.08, 0.2));
      ctx.beginPath();
      ctx.ellipse(rnd.range(W.x0 - 30, W.x1 + 30), rnd.range(GROUND_Y + 4, GROUND_Y + 44), rnd.range(1, 2.6), rnd.range(0.4, 0.9), rnd.range(-0.4, 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    // the path from the gate to the door: packed earth, a little worn edge
    const door = HOUSE[id].door;
    const gate = GATE[id];
    const dx = (door.x0 + door.x1) / 2;
    const gx = (gate.x0 + gate.x1) / 2;
    const path: number[] = [];
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const y = GROUND_Y + 8 + (FENCE_Y - GROUND_Y - 8) * t;
      const x = dx + (gx - dx) * (t * t * (3 - 2 * t));
      path.push(x - 10 - t * 4, y);
    }
    for (let k = n; k >= 0; k--) {
      const t = k / n;
      const y = GROUND_Y + 8 + (FENCE_Y - GROUND_Y - 8) * t;
      const x = dx + (gx - dx) * (t * t * (3 - 2 * t));
      path.push(x + 10 + t * 4, y);
    }
    ctx.fillStyle = rgba('#E6D4B0', 0.55);
    tracePoly(ctx, deform(path, rnd, 2, 0.03));
    ctx.fill();
    ctx.fillStyle = rgba('#C8AE86', 0.18);
    tracePoly(ctx, deform(path, rnd, 2, 0.05));
    ctx.fill();
  }
  // tufts of new grass over the plots (fewer on the earth)
  for (let i = 0; i < 260; i++) {
    const x = rnd.range(v.x0, v.x1);
    const y = rnd.range(HEDGE_Y + 8, LANE.y0 - 2);
    const onEarth = LOANS.some((id) => x > HOUSE[id].wall.x0 - 34 && x < HOUSE[id].wall.x1 + 34 && y < GROUND_Y + 40);
    if (onEarth && rnd.chance(0.85)) continue;
    grassTuft(ctx, x, y, rnd.range(2.4, 5) * (0.6 + (y - HEDGE_Y) / 300), rnd, 0.7, ['#9DC25C', '#6E9A48', '#B6D26A', '#82AE4E']);
  }
}

function paintRoad(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // the road comes down from the village through the hedge gap and meets the lane, widening toward us
  const left: number[] = [];
  const right: number[] = [];
  for (let y = ROAD_FAR.y - 6; y <= JUNCTION.y; y += 6) {
    const h = roadHalf(y);
    const wob = Math.sin(y / 23) * 1.2;
    left.push(ROAD_FAR.x - h + wob, y);
    right.unshift(ROAD_FAR.x + h + wob, y);
  }
  const poly = [...left, ...right];
  for (const [c, a] of [['#E4D2AC', 0.6], ['#D2BA90', 0.3], ['#EADCBC', 0.3]] as const) {
    ctx.fillStyle = rgba(c, a);
    tracePoly(ctx, deform(poly, rnd, 2, 0.02));
    ctx.fill();
  }
  // two cart ruts and a grass crown between them
  for (const side of [-1, 1]) {
    const pts: number[] = [];
    for (let y = ROAD_FAR.y; y <= JUNCTION.y; y += 5) pts.push(ROAD_FAR.x + side * roadHalf(y) * 0.45 + Math.sin(y / 23) * 1.2 + rnd.range(-0.3, 0.3), y);
    ctx.fillStyle = rgba('#9E8260', 0.2);
    ribbon(ctx, pts, 1.2, 0.4);
  }
  for (let y = ROAD_FAR.y + 6; y < JUNCTION.y - 8; y += rnd.range(5, 10)) {
    grassTuft(ctx, ROAD_FAR.x + Math.sin(y / 23) * 1.2 + rnd.range(-1, 1), y, rnd.range(2, 4) * (0.6 + (y - ROAD_FAR.y) / 200), rnd, 0.6, ['#9DC25C', '#82AE4E']);
  }
}

function paintLane(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = LANE.y0;
  const y1 = LANE.y1;
  const top: number[] = [];
  const bot: number[] = [];
  for (let x = v.x0; x <= v.x1 + 10; x += 10) {
    top.push(x, y0 + Math.sin(x / 61) * 1.5 + rnd.range(-0.4, 0.4));
    bot.unshift(x, y1 + Math.sin(x / 47 + 1) * 1.8 + rnd.range(-0.4, 0.4));
  }
  const poly = [...top, ...bot];
  for (const [c, a] of [['#E2CEA6', 0.62], ['#D0B68C', 0.3], ['#ECDCBA', 0.3]] as const) {
    ctx.fillStyle = rgba(c, a);
    tracePoly(ctx, deform(poly, rnd, 2, 0.006));
    ctx.fill();
  }
  // the light falls from the upper left: the far edge of the lane is in the verge's shade
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 10);
  g.addColorStop(0, 'rgba(90,80,70,0.14)');
  g.addColorStop(1, 'rgba(90,80,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(v.x0, y0, v.x1 - v.x0, 10);
  // the ruts of the carts that come and go
  for (const ry of [CART_RUT_A, CART_RUT_B]) {
    const pts: number[] = [];
    for (let x = v.x0; x <= v.x1; x += 8) pts.push(x, ry + Math.sin(x / 37) * 0.8 + rnd.range(-0.3, 0.3));
    ctx.fillStyle = rgba('#8A6C4C', 0.2);
    ribbon(ctx, pts, 2, 0.3);
    ctx.fillStyle = rgba('#FFF4DC', 0.16);
    ribbon(ctx, pts.map((p, i) => (i % 2 ? p - 1.6 : p)), 0.8, 0.3);
  }
  // puddles holding the sky
  for (const p of [{ x: 96, y: 596, w: 26 }, { x: 352, y: 590, w: 18 }, { x: 690, y: 598, w: 30 }, { x: 948, y: 588, w: 16 }]) {
    const poly2 = blobPoly(p.x, p.y, p.w, p.w * 0.22, rnd, 16, 0.18);
    ctx.fillStyle = 'rgba(150,180,214,0.5)';
    tracePoly(ctx, poly2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,240,0.4)';
    ribbon(ctx, [p.x - p.w * 0.5, p.y - p.w * 0.05, p.x, p.y - p.w * 0.09, p.x + p.w * 0.35, p.y - p.w * 0.04], 0.9, 0.6);
    ctx.strokeStyle = 'rgba(90,76,62,0.3)';
    ctx.lineWidth = 0.5;
    tracePoly(ctx, poly2);
    ctx.stroke();
  }
  // pebbles
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#8E8478', '#A89A86', '#6E6458']), rnd.range(0.3, 0.6));
    ctx.beginPath();
    ctx.ellipse(rnd.range(v.x0, v.x1), rnd.range(y0 + 4, y1 - 2), rnd.range(0.5, 1.4), rnd.range(0.3, 0.8), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** the two ruts along the lane (the carts' wheels run in them) */
export const CART_RUT_A = 568;
export const CART_RUT_B = 586;

function paintVerges(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  // the near verge below the lane, to the bottom of the picture
  const ny0 = LANE.y1;
  grassWash(ctx, rnd, [v.x0, ny0 - 2, v.x1, ny0 - 2, v.x1, v.y1, v.x0, v.y1], ['#B6D47A', '#A2C66C', '#C8DC8A'], 0.34);
  // the front verge between the fence and the lane
  grassWash(ctx, rnd, [v.x0, FENCE_Y - 4, v.x1, FENCE_Y - 4, v.x1, LANE.y0 + 2, v.x0, LANE.y0 + 2], ['#B2D076', '#C4DA88'], 0.2);
  for (let i = 0; i < 160; i++) {
    const x = rnd.range(v.x0, v.x1);
    const y = rnd.range(ny0 + 2, v.y1);
    grassTuft(ctx, x, y, rnd.range(4, 9), rnd, 1, ['#9DC25C', '#6E9A48', '#B6D26A', '#4E7E3A']);
  }
  for (let i = 0; i < 60; i++) grassTuft(ctx, rnd.range(v.x0, v.x1), rnd.range(FENCE_Y + 2, LANE.y0 + 2), rnd.range(3, 6), rnd, 0.8);
  // daffodils in drifts along both verges (never where the road comes through), primroses among them
  const drift = (cx: number, cy: number, n: number, spread: number, h: number) => {
    for (let k = 0; k < n; k++) {
      const x = cx + rnd.gauss() * spread;
      if (Math.abs(x - JUNCTION.x) < 34) continue;
      daffodil(ctx, rnd, x, cy + rnd.range(-3, 3), h * rnd.range(0.8, 1.15));
    }
    for (let k = 0; k < n * 0.6; k++) {
      const x = cx + rnd.gauss() * spread * 1.2;
      if (Math.abs(x - JUNCTION.x) < 34) continue;
      flowerDab(ctx, x, cy + rnd.range(-2, 4), h * 0.12, rnd.pick(['#F4EAA0', '#F0E08C', '#FAF2C0']), rnd, false);
    }
  };
  for (const [x, n] of [[40, 7], [250, 6], [430, 8], [640, 6], [860, 7], [1000, 5]] as const) drift(x, ny0 + 16, n, 18, 13);
  for (const [x, n] of [[60, 4], [300, 5], [410, 4], [600, 5], [720, 4], [940, 4]] as const) drift(x, FENCE_Y + 10, n, 12, 9);
}

function paintShadows(ctx: CanvasRenderingContext2D): void {
  // each house throws a soft shadow onto the earth at its foot, toward the right (the sun is upper left)
  ctx.globalCompositeOperation = 'multiply';
  for (const id of LOANS) {
    const W = HOUSE[id].wall;
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 12);
    g.addColorStop(0, 'rgba(90,80,96,0.3)');
    g.addColorStop(1, 'rgba(90,80,96,0)');
    ctx.fillStyle = g;
    tracePoly(ctx, [W.x0, GROUND_Y, W.x1, GROUND_Y, W.x1 + 18, GROUND_Y + 12, W.x0 + 10, GROUND_Y + 10]);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
