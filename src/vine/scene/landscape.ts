/**
 * The static world behind and around the cottages, painted once per size into one cached layer (zoomed with the
 * camera): hazy blue-violet hills, nearer hills with autumn woods and a few dark evergreens, stubble-gold
 * fields and hedgerows, a hedge along the back of the garden, the lawn (green going gold) thick with fallen
 * leaves, the big autumn trees with their cast shadows, the flagstone paths, the low fence and its gate, and
 * the cottages' shadows. Everything is translucent washes lit from the upper left, with paper tooth and a few
 * broken ink lines, in the house style of the river and Time to Grow.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, bloom, grassTuft, paperTooth } from '../../river/scene/paint';
import { COTTAGE, GROUND_Y, PATH_Y, PILE, type Camera } from './geom';
import { FENCE, LANE, TREES, WALL_STUB, doorWalkHalf, doorX, laneHalf, type TreeSpec } from './layout';
import { FOLIAGE, INK, PAPER, grain, makeAutumnClump, tick, type FoliageKind } from './art';
import { PLANS } from '../types';

export interface WorldLayer {
  cv: HTMLCanvasElement;
  /** device px per css px of the layer */
  gd: number;
  xmin: number;
  xmax: number;
  ymax: number;
}

export interface View {
  xmin: number;
  xmax: number;
  ymax: number;
}
export function viewOf(c: Camera, margin = 50): View {
  return { xmin: -c.ox / c.s - margin, xmax: (c.cssW - c.ox) / c.s + margin, ymax: (c.cssH - c.oy) / c.s + margin * 0.4 };
}

const xs = (a: number, b: number, step: number): number[] => {
  const o: number[] = [];
  for (let x = a; x <= b + step; x += step) o.push(x);
  return o;
};

/* ------------------------------------------------------------------ ridges */

export const ridgeFar = (x: number): number => 224 + 16 * Math.sin(x / 170 + 0.3) + 8 * Math.sin(x / 71 + 1.9) + 3 * Math.sin(x / 33);
export const ridgeMid = (x: number): number => 247 + 9 * Math.sin(x / 130 + 1.1) + 5 * Math.sin(x / 59 + 0.2) + 2 * Math.sin(x / 27);
export const ridgeNear = (x: number): number => 266 + 6 * Math.sin(x / 110 + 2.2) + 4 * Math.sin(x / 47 + 0.4) + 2 * Math.sin(x / 23);
const HEDGE_Y = 306;

/** lifts the bottom of whatever is already painted on the canvas toward the paper (atmospheric haze) */
function haze(ctx: CanvasRenderingContext2D, v: View, y0: number, y1: number, a: number, top = 0): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(PAPER, top));
  g.addColorStop(1, rgba(PAPER, a));
  ctx.fillStyle = g;
  ctx.fillRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
  ctx.restore();
}

/* ------------------------------------------------------------------ foliage pool */

interface Clump {
  cv: HTMLCanvasElement;
  /** body width (world) the sprite was designed for is 0.66 of the sprite width */
  aspect: number;
}
type Pool = Record<FoliageKind, Clump[]>;

async function buildPool(ppu: number, check: () => boolean): Promise<Pool> {
  const W = Math.round(clamp(52 * ppu, 70, 170));
  const H = Math.round(W * 0.58);
  const pool = {} as Pool;
  let k = 0;
  for (const kind of ['gold', 'amber', 'rust', 'crimson', 'olive', 'ever'] as const) {
    pool[kind] = [];
    for (let v = 0; v < (kind === 'ever' ? 2 : 3); v++) {
      pool[kind].push({ cv: makeAutumnClump(7100 + k * 131 + v * 17, W, H, kind), aspect: H / W });
      await tick();
      if (!check()) return pool;
    }
    k++;
  }
  return pool;
}

function drawClump(ctx: CanvasRenderingContext2D, c: Clump, cx: number, by: number, bodyW: number): void {
  const sw = bodyW / 0.66;
  const sh = sw * c.aspect;
  ctx.drawImage(c.cv, cx - sw / 2, by - sh * 0.82, sw, sh);
}

/** a small conifer: stacked drooping tiers of deep green wash, lit on the left */
function makeConifer(seed: number, w: number, h: number, q: number): HTMLCanvasElement {
  const rnd = new Rand(seed);
  const cv = makeCanvas(w * q, h * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, (w / 2) * q, h * q);
  const pal = FOLIAGE.ever!;
  const tiers = 6;
  for (let t = 0; t < tiers; t++) {
    const f0 = t / tiers;
    const y = -h * (0.12 + 0.86 * (1 - f0 * 0.0) * (t / tiers) * 1.0);
    const ww = (w / 2) * (0.28 + 0.72 * (1 - Math.pow(1 - (t + 1) / tiers, 1.1)));
    const yb = -h * 0.06 - (h * 0.88 * (tiers - 1 - t)) / tiers;
    void y;
    const pts: number[] = [];
    pts.push(0, yb - h * 0.2);
    pts.push(ww * 0.55, yb - h * 0.07);
    pts.push(ww, yb + h * 0.02);
    pts.push(ww * 0.4, yb - h * 0.03);
    pts.push(0, yb + h * 0.03);
    pts.push(-ww * 0.4, yb - h * 0.03);
    pts.push(-ww, yb + h * 0.02);
    pts.push(-ww * 0.55, yb - h * 0.07);
    const poly = deform(pts, rnd, 2, 0.05);
    ctx.fillStyle = rgba(pal.base, 0.34);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(pal.mid, 0.3);
    tracePoly(ctx, deform(poly, rnd, 2, 0.05));
    ctx.fill();
    ctx.fillStyle = rgba(pal.deep, 0.22);
    tracePoly(ctx, deform(pts.map((v, i) => (i % 2 === 0 ? v * 0.8 + ww * 0.14 : v + h * 0.02)), rnd, 2, 0.06));
    ctx.fill();
    ctx.fillStyle = rgba(pal.light, 0.22);
    tracePoly(ctx, deform(pts.map((v, i) => (i % 2 === 0 ? v * 0.5 - ww * 0.2 : v - h * 0.01)), rnd, 2, 0.08));
    ctx.fill();
  }
  grain(cv, seed + 3, 1);
  return cv;
}

/* ------------------------------------------------------------------ build */

export async function buildWorld(cam: Camera, tile: CanvasImageSource, check: () => boolean): Promise<WorldLayer | null> {
  void tile;
  const v = viewOf(cam);
  const px = cam.dpr * Math.min(1.5, Math.sqrt(11e6 / (cam.cssW * cam.cssH * cam.dpr * cam.dpr)));
  const gd = Math.max(0.75, px);
  const cv = makeCanvas(cam.cssW * gd, cam.cssH * gd);
  const ctx = cv.getContext('2d')!;
  const A = gd * cam.s;
  ctx.setTransform(A, 0, 0, A, gd * cam.ox, gd * cam.oy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rnd = new Rand(31337);
  const ppu = A;
  const T0 = performance.now();
  const lg = (m: string) => console.log('[world]', m, Math.round(performance.now() - T0));
  const pool = await buildPool(ppu, check);
  lg('pool');
  if (!check()) return null;
  const conifers = [makeConifer(11, 16, 38, Math.max(2, ppu * 1.1)), makeConifer(12, 14, 34, Math.max(2, ppu * 1.1))];

  // ---- hills
  paintHills(ctx, rnd, v);
  lg('hills');
  await tick();
  if (!check()) return null;
  // ---- woods on the far and near ridges, hazed with distance
  paintWoods(ctx, cv, rnd, v, pool, conifers, A, gd);
  lg('woods');
  await tick();
  if (!check()) return null;
  // ---- fields and hedgerows, the back hedge
  paintFields(ctx, rnd, v);
  paintHedge(ctx, rnd, v, pool);
  lg('fields');
  await tick();
  if (!check()) return null;
  // ---- the lawn
  paintLawn(ctx, rnd, v, cam, gd);
  lg('lawn');
  await tick();
  if (!check()) return null;
  // ---- shadows (trees, cottages), then the paths and fence, then the leaf scatter
  paintShadows(ctx, rnd, v);
  paintPaths(ctx, rnd);
  paintFence(ctx, rnd);
  lg('paths');
  await tick();
  if (!check()) return null;
  // ---- the big trees (behind the cottages, in front of the hedge)
  for (const t of TREES) {
    paintTree(ctx, new Rand(t.seed), t, pool, v);
    await tick();
    if (!check()) return null;
  }
  paintLeafScatter(ctx, new Rand(777), v);
  lg('done');
  return { cv, gd, xmin: v.xmin, xmax: v.xmax, ymax: v.ymax };
}

/* ------------------------------------------------------------------ hills */

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 150;
  const y1 = 340;
  const X = xs(v.xmin, v.xmax, 20);
  const soft = new SoftLayer(v.xmin, y0, v.xmax - v.xmin, y1 - y0, 0.45);
  const range = (ridge: (x: number) => number, base: number, color: string, a: number, o: { crisp: number; fade: number; pool: number }) => {
    const pts: number[] = [];
    for (const x of X) pts.push(x, ridge(x));
    for (let i = X.length - 1; i >= 0; i--) pts.push(X[i]!, base);
    const top = Math.min(...X.map(ridge));
    soft.ctx.clearRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
    const g = soft.ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, rgba(color, a * 0.95));
    g.addColorStop(0.5, rgba(color, a * 0.78));
    g.addColorStop(1, rgba(color, a * 0.4));
    soft.ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      tracePoly(soft.ctx, deform(pts, rnd, 2, 0.012));
      soft.ctx.fill();
    }
    soft.draw(ctx, 1, 'multiply');
    ctx.globalCompositeOperation = 'multiply';
    const g2 = ctx.createLinearGradient(0, top, 0, base);
    g2.addColorStop(0, rgba(color, a * o.crisp));
    g2.addColorStop(o.fade, rgba(color, a * o.crisp * 0.55));
    g2.addColorStop(1, rgba(color, a * o.crisp * 0.2));
    ctx.fillStyle = g2;
    for (let i = 0; i < 2; i++) {
      tracePoly(ctx, deform(pts, rnd, 3, 0.02 + 0.008 * i));
      ctx.fill();
    }
    ctx.strokeStyle = rgba(color, o.pool);
    ctx.lineWidth = 0.9;
    ctx.setLineDash([40, 6, 18, 4]);
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 0.8 + rnd.range(-0.3, 0.3)) : ctx.moveTo(x, ridge(x) + 0.8)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  };
  const blooms = (ridge: (x: number) => number, n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], dy: [number, number]) => {
    soft.ctx.clearRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
    for (let i = 0; i < n; i++) {
      const x = rnd.range(v.xmin, v.xmax);
      bloom(soft.ctx, x, ridge(x) + rnd.range(dy[0], dy[1]), rnd.range(rx[0], rx[1]), rnd.range(ry[0], ry[1]), rnd.pick(cols), a, rnd, 4);
    }
    soft.draw(ctx, 1, 'multiply');
  };
  // farthest: hazy blue-violet, bleeding into the sky
  range(ridgeFar, y1, '#A8A6D2', 0.3, { crisp: 0.55, fade: 0.4, pool: 0.09 });
  blooms(ridgeFar, 10, ['#C0A8D2', '#9DB0DA', '#B6B6DA', '#D3A8B8'], 0.14, [50, 140], [7, 15], [8, 26]);
  haze(ctx, v, y0 + 70, y1 - 45, 0.36, 0);
  // middle: blue-violet with tawny distant woods
  range(ridgeMid, y1, '#9A9CC6', 0.3, { crisp: 0.62, fade: 0.38, pool: 0.1 });
  blooms(ridgeMid, 14, ['#D1A66C', '#C58E64', '#B9A35E', '#A9A4C8', '#C9915A'], 0.14, [40, 110], [6, 12], [6, 22]);
  haze(ctx, v, y0 + 82, y1 - 38, 0.3, 0);
  // nearer rolling hills: sun-warmed ochre and sage under the autumn woods
  range(ridgeNear, y1, '#A9A878', 0.32, { crisp: 0.7, fade: 0.34, pool: 0.12 });
  blooms(ridgeNear, 16, ['#D8B86A', '#C98F57', '#B99C58', '#C9A65E', '#9FA574'], 0.16, [36, 110], [5, 11], [4, 18]);
}

function paintWoods(ctx: CanvasRenderingContext2D, main: HTMLCanvasElement, rnd: Rand, v: View, pool: Pool, conifers: HTMLCanvasElement[], A: number, gd: number): void {
  const mk = (): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } => {
    const cv = makeCanvas(main.width, main.height);
    const c = cv.getContext('2d')!;
    c.setTransform(ctx.getTransform());
    return { cv, c };
  };
  const kinds: FoliageKind[] = ['gold', 'amber', 'rust', 'crimson', 'olive', 'amber', 'gold', 'rust'];
  // far woods along the middle ridge: small, pale, tawny
  {
    const { cv, c } = mk();
    for (let x = v.xmin; x < v.xmax; x += rnd.range(14, 26)) {
      const patch = Math.sin(x / 90 + 0.6) + 0.5 * Math.sin(x / 33);
      if (patch < -0.2) continue;
      const kind = kinds[Math.floor(Math.abs(Math.sin(x / 61 + 2.2)) * kinds.length) % kinds.length]!;
      const p = pool[kind];
      drawClump(c, p[rnd.int(0, p.length - 1)]!, x, ridgeMid(x) + rnd.range(3, 9), rnd.range(15, 24));
    }
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = rgba(PAPER, 0.5);
    c.fillRect(v.xmin, 150, v.xmax - v.xmin, 200);
    c.fillStyle = rgba('#9AA6D2', 0.18);
    c.fillRect(v.xmin, 150, v.xmax - v.xmin, 200);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
  // near woods along the front ridge
  {
    const { cv, c } = mk();
    const row = (dy: number, size: [number, number], dense: number, ys: number) => {
      for (let x = v.xmin; x < v.xmax; x += rnd.range(10, 22) / dense) {
        const patch = Math.sin(x / 74 + 1.7) + 0.55 * Math.sin(x / 29 + 0.3) + 0.3;
        if (patch < -0.15) continue;
        // a few dark evergreens among the broadleaves
        if (rnd.chance(0.12) && patch > 0.4) {
          const cvv = conifers[rnd.int(0, 1)]!;
          const h = rnd.range(26, 36);
          const w = (h * cvv.width) / cvv.height;
          c.drawImage(cvv, x - w / 2, ridgeNear(x) + dy + ys - h, w, h);
          continue;
        }
        const pick = Math.abs(Math.sin(x / 47 + 0.9 + dy));
        const kind = kinds[Math.floor(pick * kinds.length) % kinds.length]!;
        const p = pool[kind];
        drawClump(c, p[rnd.int(0, p.length - 1)]!, x, ridgeNear(x) + dy + ys + rnd.range(-2, 3), rnd.range(size[0], size[1]));
      }
    };
    row(2, [24, 36], 1, 4);
    row(10, [28, 42], 1.1, 8);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = rgba(PAPER, 0.24);
    c.fillRect(v.xmin, 150, v.xmax - v.xmin, 220);
    c.fillStyle = rgba('#98A4D0', 0.08);
    c.fillRect(v.xmin, 150, v.xmax - v.xmin, 220);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
  void A;
  void gd;
}

/* ------------------------------------------------------------------ fields, hedge */

function paintFields(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const y0 = 262;
  const y1 = HEDGE_Y + 6;
  const soft = new SoftLayer(v.xmin, y0, v.xmax - v.xmin, y1 - y0, 0.5);
  const g = soft.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(214,196,120,0.0)');
  g.addColorStop(0.3, 'rgba(218,196,116,0.62)');
  g.addColorStop(1, 'rgba(196,174,92,0.72)');
  soft.ctx.fillStyle = g;
  const poly: number[] = [];
  for (const x of xs(v.xmin, v.xmax, 16)) poly.push(x, ridgeNear(x) + 5 + 2 * Math.sin(x / 19));
  poly.push(v.xmax + 20, y1, v.xmin - 20, y1);
  tracePoly(soft.ctx, deform(poly, rnd, 2, 0.01));
  soft.ctx.fill();
  for (let i = 0; i < 20; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    bloom(soft.ctx, x, rnd.range(y0 + 14, y1 - 6), rnd.range(30, 90), rnd.range(3, 8), rnd.pick(['#E6D08A', '#D5B65C', '#C99A52', '#B9B466', '#E2C070']), 0.22, rnd, 3);
  }
  soft.draw(ctx, 1, 'multiply');
  // field patchwork and hedgerow lines
  for (let i = 0; i < 46; i++) {
    const x = rnd.range(v.xmin, v.xmax);
    const y = rnd.range(ridgeNear(x) + 7, y1 - 6);
    const w = rnd.range(22, 80);
    const h = rnd.range(2.4, 6.5);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(rnd.pick(['#DCC272', '#C9A458', '#E8D28C', '#B9A858', '#D2A867']), rnd.range(0.1, 0.2));
    tracePoly(ctx, deform([x, y, x + w * 0.5, y - h * 0.4, x + w, y - 0.3 * h, x + w * 0.95, y + h, x + w * 0.5, y + h * 1.15, x + w * 0.05, y + h * 1.05], rnd, 2, 0.07));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // stubble: a few short strokes along the field
    ctx.strokeStyle = rgba('#8A6A38', 0.16);
    ctx.lineWidth = 0.35;
    for (let k = 0; k < 6; k++) {
      const sx = x + rnd.range(0, w);
      ctx.beginPath();
      ctx.moveTo(sx, y + rnd.range(0, h));
      ctx.lineTo(sx + rnd.range(-1, 1.5), y + rnd.range(0, h) + 1.2);
      ctx.stroke();
    }
    if (rnd.chance(0.45)) {
      ctx.strokeStyle = rgba('#6B6A3E', rnd.range(0.16, 0.26));
      ctx.lineWidth = rnd.range(0.4, 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.2 + rnd.range(-1, 1), x + w, y + h * 1.05);
      ctx.stroke();
    }
  }
  haze(ctx, v, y0, y1, 0.14, 0);
}

function paintHedge(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, pool: Pool): void {
  // an understory strip, then clumps along the back of the garden
  const top: number[] = [];
  const bot: number[] = [];
  for (let x = v.xmin; x <= v.xmax + 4; x += 3) {
    const bump = 3.6 + 2.4 * Math.abs(Math.sin(x / 4.3 + 1)) + 1.4 * Math.abs(Math.sin(x / 8.1));
    top.push(x, HEDGE_Y - bump);
    bot.unshift(x, HEDGE_Y + 5);
  }
  const poly = [...top, ...bot];
  ctx.globalCompositeOperation = 'multiply';
  for (const [c, a] of [['#9A9A4E', 0.3], ['#7A7440', 0.26], ['#5F5A38', 0.18]] as const) {
    ctx.fillStyle = rgba(c, a);
    for (let k = 0; k < 2; k++) {
      tracePoly(ctx, deform(poly, rnd, 2, 0.012));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const kinds: FoliageKind[] = ['olive', 'gold', 'amber', 'rust', 'olive', 'ever'];
  for (let x = v.xmin; x < v.xmax; x += rnd.range(18, 34)) {
    const kind = kinds[rnd.int(0, kinds.length - 1)]!;
    const p = pool[kind];
    ctx.globalAlpha = 0.9;
    drawClump(ctx, p[rnd.int(0, p.length - 1)]!, x, HEDGE_Y + rnd.range(0, 4), rnd.range(26, 40));
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ lawn */

function paintLawn(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, cam: Camera, gd: number): void {
  const y0 = HEDGE_Y - 4;
  const y1 = v.ymax + 10;
  const soft = new SoftLayer(v.xmin, y0, v.xmax - v.xmin, y1 - y0, 0.5);
  const g = soft.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(204,194,100,0.8)');
  g.addColorStop(0.3, 'rgba(186,184,84,0.86)');
  g.addColorStop(1, 'rgba(158,162,66,0.92)');
  soft.ctx.fillStyle = g;
  soft.ctx.fillRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
  // wet-in-wet: gold, worn amber-brown, and deeper greens
  const bl = (n: number, cols: string[], a: number, rx: [number, number], ry: [number, number]) => {
    for (let i = 0; i < n; i++) {
      const y = y0 + (y1 - y0) * Math.pow(rnd.next(), 0.85);
      bloom(soft.ctx, rnd.range(v.xmin, v.xmax), y, rnd.range(rx[0], rx[1]), rnd.range(ry[0], ry[1]), rnd.pick(cols), a, rnd, 4);
    }
  };
  bl(40, ['#E4C45A', '#DCB04E', '#EBD072', '#D8A444'], 0.34, [60, 160], [12, 30]);
  bl(20, ['#C9915A', '#B9854E', '#C07A48'], 0.26, [50, 120], [10, 22]);
  bl(12, ['#7FA050', '#6F9448', '#8DAA58'], 0.2, [50, 140], [12, 28]);
  soft.draw(ctx, 1, 'multiply');
  // mowing stripes: a faint paler band every so often
  ctx.globalCompositeOperation = 'source-over';
  for (let y = y0 + 14; y < y1; y += 30 + (y - y0) * 0.06) {
    const h = 9 + (y - y0) * 0.035;
    ctx.fillStyle = 'rgba(255,248,214,0.07)';
    tracePoly(ctx, deform([v.xmin, y, v.xmax, y - 2, v.xmax, y + h, v.xmin, y + h + 1], rnd, 3, 0.01));
    ctx.fill();
  }
  // paper tooth over the lawn wash
  const t = paperTooth('#6A7A38', 160, 411);
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
  ctx.clip();
  applyTooth(ctx, t, v.xmin, y0, v.xmax - v.xmin, y1 - y0, gd * 0.9, 0.0, 0.34);
  ctx.restore();
  void cam;
  // autumn grass: tufts and dry blades, larger toward the viewer
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444'];
  for (let i = 0; i < 1500; i++) {
    const y = y0 + 12 + (y1 - y0 - 12) * Math.pow(rnd.next(), 0.9);
    const x = rnd.range(v.xmin, v.xmax);
    const k = 0.5 + (y - y0) / 260;
    grassTuft(ctx, x, y, rnd.range(2.6, 6.5) * k, rnd, 0.9 * k, pal);
  }
}

/* ------------------------------------------------------------------ shadows */

function paintShadows(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const soft = new SoftLayer(v.xmin, 280, v.xmax - v.xmin, v.ymax - 280, 0.5);
  const sh = (x: number, y: number, rx: number, ry: number, a: number, col = '#4B5238') => bloom(soft.ctx, x, y, rx, ry, col, a, rnd, 5);
  // the big trees' shadows fall to the right and toward us (the sun is upper left)
  for (const t of TREES) sh(t.x + t.rx * 0.5, t.y + 18, t.rx * 0.95, 15 + t.ry * 0.12, 0.34);
  // each cottage's shadow: along the foot of the wall and to its right, softer under the eaves
  for (const id of PLANS) {
    const c = COTTAGE[id];
    const right = id === 'minimum';
    const x = right ? c.wall.x1 : c.wall.x0;
    const dir = right ? 1 : -1;
    // the sun is left of centre, so only the cottage on the left throws a long shadow into the lane
    const len = right ? 50 : 22;
    sh(x + dir * len * 0.5, GROUND_Y + 8, len * 0.85, 12, right ? 0.36 : 0.22);
    sh((c.wall.x0 + c.wall.x1) / 2, GROUND_Y + 4, 168, 6.5, 0.26);
  }
  soft.draw(ctx, 1, 'multiply');
}

/* ------------------------------------------------------------------ flagstones */

interface Region {
  /** centre line x at y and half width at y, for y in [ya, yb] */
  ya: number;
  yb: number;
  cx: (y: number) => number;
  hw: (y: number) => number;
}

function layStones(ctx: CanvasRenderingContext2D, rnd: Rand, r: Region, scale = 1): void {
  // mortar bed first: darker earth under the stones, ragged edges
  const left: number[] = [];
  const right: number[] = [];
  for (let y = r.ya; y <= r.yb; y += 6) {
    left.push(r.cx(y) - r.hw(y) - 1.5 + rnd.range(-0.8, 0.8), y);
    right.unshift(r.cx(y) + r.hw(y) + 1.5 + rnd.range(-0.8, 0.8), y);
  }
  const rn = right.length / 2;
  const rr: number[] = [];
  for (let i = rn - 1; i >= 0; i--) rr.push(right[2 * i]!, right[2 * i + 1]!);
  ctx.fillStyle = rgba('#6E5E46', 0.3);
  tracePoly(ctx, deform([...left, ...rr], rnd, 2, 0.01));
  ctx.fill();
  let y = r.ya;
  let row = 0;
  while (y < r.yb) {
    const h = (8.5 + (y - 320) * 0.04) * scale * rnd.range(0.85, 1.2);
    const yc = y + h / 2;
    const half = r.hw(yc);
    const cxm = r.cx(yc);
    let x = cxm - half + rnd.range(0, 3);
    while (x < cxm + half - 2) {
      const w = h * rnd.range(1.15, 2.1);
      const sx = x + w / 2;
      if (sx < cxm + half) paintStone(ctx, rnd, sx, yc + rnd.range(-0.6, 0.6), Math.min(w, cxm + half - x) / 2 - 0.5, h / 2 - 0.4);
      x += w + rnd.range(0.7, 1.5);
    }
    y += h + rnd.range(0.7, 1.4);
    row++;
  }
  void row;
}

const STONE_COLS = ['#BDB29A', '#B0A38C', '#C8BCA2', '#A99D8A', '#BFB39C', '#B9AC96'];

export function paintStone(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, rx: number, ry: number, ink = true): void {
  if (rx < 0.8) return;
  const n = rnd.int(6, 8);
  const pts: number[] = [];
  const a0 = rnd.range(0, 0.6);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rnd.range(-0.18, 0.18);
    const k = rnd.range(0.82, 1.1);
    const sq = 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 3.2) + Math.pow(Math.abs(Math.sin(a)), 3.2), 1 / 3.2);
    pts.push(x + Math.cos(a) * rx * k * sq * 0.94, y + Math.sin(a) * ry * k * sq * 0.94);
  }
  ctx.fillStyle = rgba(rnd.pick(STONE_COLS), 0.8);
  tracePoly(ctx, pts);
  ctx.fill();
  ctx.fillStyle = rgba('#C9BFA6', 0.3);
  tracePoly(ctx, deform(pts, rnd, 1, 0.05));
  ctx.fill();
  // lit upper-left, shaded lower-right
  ctx.fillStyle = 'rgba(255,248,226,0.34)';
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.55, ry * 0.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(70,56,44,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.35, y + ry * 0.3, rx * 0.6, ry * 0.42, 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (rnd.chance(0.14)) {
    ctx.fillStyle = rgba(rnd.pick(['#8FA050', '#B9A044', '#A0803E']), 0.3);
    ctx.beginPath();
    ctx.ellipse(x + rnd.range(-rx, rx) * 0.4, y + ry * 0.2, rx * 0.3, ry * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ink && rx > 2) {
    ctx.strokeStyle = rgba(INK, 0.42);
    ctx.lineWidth = 0.34;
    ctx.setLineDash([rx * 1.3, rx * 0.35, rx * 0.6, rx * 0.3]);
    tracePoly(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function paintPaths(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // the strip along the foot of each wall where the gardeners walk (flagstones set in worn grass)
  for (const id of PLANS) {
    const c = COTTAGE[id];
    const xa = id === 'minimum' ? -90 : c.wall.x0 - 6;
    const xb = id === 'minimum' ? c.wall.x1 + 6 : 1090;
    layStones(ctx, rnd, { ya: PATH_Y - 13, yb: PATH_Y + 13, cx: () => (xa + xb) / 2, hw: () => (xb - xa) / 2 }, 1);
    // the door walk leading to the front
    const dx = doorX(id);
    const sgn = id === 'minimum' ? 1 : -1;
    layStones(ctx, rnd, { ya: GROUND_Y + 4, yb: 668, cx: (y) => dx + sgn * (y - GROUND_Y) * 0.05, hw: doorWalkHalf }, 1);
  }
  // the central path: through the gate into the side yard, and forward to us
  layStones(ctx, rnd, { ya: LANE.yBack, yb: FENCE.y - 2, cx: () => LANE.x, hw: laneHalf }, 0.7);
  layStones(ctx, rnd, { ya: FENCE.y + 6, yb: 668, cx: () => LANE.x, hw: laneHalf }, 1);
}

/* ------------------------------------------------------------------ the picket fence and gate */

function paintFence(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const base = FENCE.y;
  const pickets: Array<{ x: number; h: number }> = [];
  for (let x = FENCE.x0 + 3; x < FENCE.x1 - 2; x += 8.2) {
    if (x > FENCE.gate0 - 5 && x < FENCE.gate1 + 5) continue;
    pickets.push({ x: x + rnd.range(-0.5, 0.5), h: FENCE.h + rnd.range(-1.5, 1.2) });
  }
  const WOOD = ['#E0C890', '#D6BC84', '#E8D4A0', '#DCC08A'];
  // two rails behind the pickets
  for (const [dy, th] of [[-6, 3.4], [-15, 3.4]] as const) {
    for (const seg of [[FENCE.x0, FENCE.gate0 - 2], [FENCE.gate1 + 2, FENCE.x1]] as const) {
      const g = ctx.createLinearGradient(0, base + dy - th, 0, base + dy + th);
      g.addColorStop(0, 'rgba(200,164,116,0.95)');
      g.addColorStop(1, 'rgba(142,106,74,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(seg[0], base + dy - th / 2, seg[1] - seg[0], th);
      ctx.strokeStyle = rgba(INK, 0.4);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(seg[0], base + dy + th / 2);
      ctx.lineTo(seg[1], base + dy + th / 2);
      ctx.stroke();
    }
  }
  for (const p of pickets) {
    const w = 5.2;
    const top = base - p.h;
    const poly = [p.x - w / 2, base, p.x - w / 2, top + 2.4, p.x, top - 0.8, p.x + w / 2, top + 2.4, p.x + w / 2, base];
    ctx.fillStyle = rgba(rnd.pick(WOOD), 0.96);
    tracePoly(ctx, poly);
    ctx.fill();
    // shaded right side, lit left
    ctx.fillStyle = 'rgba(120,88,60,0.28)';
    ctx.fillRect(p.x + w * 0.12, top + 1, w * 0.38, p.h - 1);
    ctx.fillStyle = 'rgba(255,250,230,0.34)';
    ctx.fillRect(p.x - w / 2, top + 2.4, w * 0.22, p.h - 2.4);
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.42;
    ctx.setLineDash([5, 1, 3, 1]);
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // gate posts, a little taller, with a cap
  for (const gx of [FENCE.gate0 - 3, FENCE.gate1 + 3]) {
    const w = 7;
    const top = base - FENCE.h - 8;
    ctx.fillStyle = 'rgba(176,138,98,0.98)';
    ctx.fillRect(gx - w / 2, top, w, FENCE.h + 8);
    ctx.fillStyle = 'rgba(255,248,226,0.3)';
    ctx.fillRect(gx - w / 2, top, w * 0.3, FENCE.h + 8);
    ctx.fillStyle = 'rgba(90,64,44,0.28)';
    ctx.fillRect(gx + w * 0.1, top, w * 0.4, FENCE.h + 8);
    ctx.fillStyle = 'rgba(150,112,78,0.98)';
    tracePoly(ctx, [gx - w * 0.7, top + 1, gx, top - 3, gx + w * 0.7, top + 1]);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(gx - w / 2, top, w, FENCE.h + 8);
  }
  // grass tufts hiding the foot of the fence
  for (let x = FENCE.x0; x < FENCE.x1; x += 5) {
    if (x > FENCE.gate0 && x < FENCE.gate1) continue;
    grassTuft(ctx, x + rnd.range(-2, 2), base + rnd.range(0, 2), rnd.range(3, 6), rnd, 1, ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A']);
  }
}

/* ------------------------------------------------------------------ trees */

function paintTree(ctx: CanvasRenderingContext2D, rnd: Rand, t: TreeSpec, pool: Pool, v: View): void {
  if (t.x + t.rx < v.xmin - 20 || t.x - t.rx > v.xmax + 20) return;
  // trunk: a tapering, slightly leaning column that forks into the crown
  const lean = (t.cx - t.x) * 0.25;
  const top = t.cy + t.ry * 0.45;
  const trunk = (w0: number, w1: number, x0: number, y0: number, x1: number, y1: number) => {
    const n = 10;
    const L: number[] = [];
    const R: number[] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = x0 + (x1 - x0) * f + Math.sin(f * 3 + t.seed) * 1.2;
      const y = y0 + (y1 - y0) * f;
      const w = (w0 + (w1 - w0) * f) / 2 * (1 + (i === 0 ? 0.35 : 0) * (1 - f * 4 > 0 ? 1 - f * 4 : 0));
      L.push(x - w, y);
      R.unshift(x + w, y);
    }
    const poly = [...L, ...R];
    const d = deform(poly, rnd, 2, 0.02);
    const g = ctx.createLinearGradient(Math.min(x0, x1) - w0, 0, Math.max(x0, x1) + w0, 0);
    g.addColorStop(0, 'rgba(160,120,84,0.96)');
    g.addColorStop(0.45, 'rgba(112,80,56,0.96)');
    g.addColorStop(1, 'rgba(70,50,40,0.96)');
    ctx.fillStyle = g;
    tracePoly(ctx, d);
    ctx.fill();
    ctx.strokeStyle = rgba('#3A2A20', 0.34);
    ctx.lineWidth = 0.5;
    for (let k = 0; k < 7; k++) {
      const off = rnd.range(-0.8, 0.8) * w0 * 0.5;
      const a = rnd.range(0.1, 0.5);
      const b = rnd.range(a + 0.2, 1);
      ctx.beginPath();
      ctx.moveTo(x0 + (x1 - x0) * a + off, y0 + (y1 - y0) * a);
      ctx.lineTo(x0 + (x1 - x0) * b + off + rnd.range(-1, 1), y0 + (y1 - y0) * b);
      ctx.stroke();
    }
    ctx.setLineDash([9, 2, 5, 2]);
    ctx.strokeStyle = rgba('#2F2218', 0.55);
    ctx.lineWidth = 0.7;
    tracePoly(ctx, d);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  trunk(t.trunk, t.trunk * 0.5, t.x, t.y, t.x + lean, top);
  trunk(t.trunk * 0.5, t.trunk * 0.22, t.x + lean, top + 6, t.cx - t.rx * 0.36, t.cy + t.ry * 0.06);
  trunk(t.trunk * 0.5, t.trunk * 0.22, t.x + lean, top + 6, t.cx + t.rx * 0.34, t.cy + t.ry * 0.12);
  // the crown: clumps scattered through an ellipse, lower clumps painted last
  const clumps: Array<{ x: number; y: number; w: number; kind: FoliageKind }> = [];
  const total = t.mix.reduce((s, m) => s + m[1], 0);
  const pickKind = (l: number): FoliageKind => {
    // lit upper-left clumps lean golden, the shade lower-right leans rust
    let r = rnd.next() * total;
    let kind = t.mix[0]![0] as FoliageKind;
    for (const m of t.mix) {
      r -= m[1];
      if (r <= 0) {
        kind = m[0] as FoliageKind;
        break;
      }
    }
    if (l > 0.66 && rnd.chance(0.45)) kind = rnd.chance(0.6) ? 'gold' : 'amber';
    if (l < 0.28 && rnd.chance(0.5)) kind = rnd.chance(0.55) ? 'rust' : 'crimson';
    return kind;
  };
  const N = Math.round((t.rx * t.ry) / 105);
  for (let i = 0; i < N * 4 && clumps.length < N; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = Math.sqrt(rnd.next());
    const nx = Math.cos(a) * r;
    const ny = Math.sin(a) * r;
    // a flatter underside
    if (ny > 0.62) continue;
    const x = t.cx + nx * t.rx;
    const y = t.cy + ny * t.ry;
    const l = clamp(0.5 - 0.34 * nx - 0.5 * ny, 0, 1);
    clumps.push({ x, y, w: rnd.range(0.3, 0.44) * t.rx * (1 - 0.2 * Math.abs(ny)), kind: pickKind(l) });
  }
  clumps.sort((a, b) => a.y - b.y);
  const cvv = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const c2 = cvv.getContext('2d')!;
  c2.setTransform(ctx.getTransform());
  for (const c of clumps) {
    const p = pool[c.kind];
    drawClump(c2, p[rnd.int(0, p.length - 1)]!, c.x, c.y + c.w * 0.3, c.w * 1.05);
  }
  if (t.haze > 0) {
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = rgba(PAPER, t.haze);
    c2.fillRect(t.cx - t.rx * 1.5, t.cy - t.ry * 1.5, t.rx * 3, t.ry * 3);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cvv, 0, 0);
  ctx.restore();
}

/* ------------------------------------------------------------------ leaf scatter */

const LEAF_COLS = ['#D9A03C', '#C8683A', '#B8483A', '#E4B64E', '#A8522E', '#CC8A32', '#8E3A2E', '#E0C25A', '#BA7430'];

function paintLeafScatter(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const trees = TREES.map((t) => ({ x: t.x + t.rx * 0.3, y: t.y }));
  const calm = (x: number, y: number): number => {
    // the label spots above each pile stay quiet; paths carry fewer leaves
    let k = 1;
    for (const id of PLANS) {
      const p = PILE[id];
      const dx = (x - p.x) / 92;
      const dy = (y - (p.y - 38)) / 44;
      const d = Math.hypot(dx, dy);
      if (d < 1) k *= 0.18 + 0.82 * d * d;
    }
    for (const id of PLANS) {
      const dx = doorX(id);
      if (y > GROUND_Y && Math.abs(x - dx - (id === 'minimum' ? 1 : -1) * (y - GROUND_Y) * 0.05) < doorWalkHalf(y)) k *= 0.5;
    }
    if (Math.abs(x - LANE.x) < laneHalf(y)) k *= 0.5;
    return k;
  };
  const N = 6200;
  for (let i = 0; i < N; i++) {
    const y = 316 + (v.ymax - 316) * Math.pow(rnd.next(), 0.8);
    const x = rnd.range(v.xmin, v.xmax);
    // thicker near the trees and the foot of the walls
    let dens = 0.35;
    for (const t of trees) dens += 0.9 * Math.exp(-(((x - t.x) / 160) ** 2 + ((y - t.y - 70) / 100) ** 2));
    for (const id of PLANS) {
      const c = COTTAGE[id];
      if (x > c.wall.x0 - 30 && x < c.wall.x1 + 30) dens += 0.5 * Math.exp(-(((y - (GROUND_Y + 14)) / 26) ** 2));
    }
    if (!rnd.chance(Math.min(1, dens * 0.55) * calm(x, y))) continue;
    // not over the cottage footprints
    let inside = false;
    for (const id of PLANS) {
      const c = COTTAGE[id].wall;
      if (x > c.x0 - 4 && x < c.x1 + 4 && y < GROUND_Y + 2) inside = true;
    }
    if (inside) continue;
    const k = 0.6 + (y - 300) / 300;
    const L = rnd.range(2.8, 5.4) * k;
    ctx.fillStyle = rgba(rnd.pick(LEAF_COLS), rnd.range(0.55, 0.92));
    almond(ctx, x, y, rnd.range(0, Math.PI), L, L * rnd.range(0.38, 0.55), rnd.gauss() * 0.3);
    ctx.fill();
    if (L > 3.6 && rnd.chance(0.35)) {
      ctx.strokeStyle = 'rgba(70,40,24,0.26)';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(x - L * 0.35, y);
      ctx.lineTo(x + L * 0.35, y);
      ctx.stroke();
    }
  }
  // drifts of leaves along the garden walls and the fence
  for (let i = 0; i < 120; i++) {
    const side = PLANS[rnd.int(0, 1)]!;
    const w = WALL_STUB[side];
    const x = rnd.range(w.x0 - 10, w.x1 + 10);
    const y = w.yBase + rnd.range(2, 9);
    const L = rnd.range(3, 5.4);
    ctx.fillStyle = rgba(rnd.pick(LEAF_COLS), rnd.range(0.6, 0.95));
    almond(ctx, x, y, rnd.range(0, Math.PI), L, L * 0.44, 0);
    ctx.fill();
  }
}
