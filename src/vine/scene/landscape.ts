/**
 * The static world behind and around the cottages, painted once per size into one cached layer (zoomed with the
 * camera): hazy blue-violet hills, nearer hills with autumn woods and a few dark evergreens, stubble-gold
 * fields and hedgerows, a hedge along the back of the garden, the lawn (green going gold), the flagstone
 * paths, the picket fence and its gate, the cottages' and trees' soft shadows, drifts of fallen leaves, the big
 * autumn trees (Time to Grow's trees in autumn dress), and an autumn border framing the bottom edge. Everything
 * is translucent washes lit from the upper left, with paper tooth and a few broken ink lines, in the house
 * style of the river and Time to Grow. The cottages, props, piles, gardeners and vines are drawn over it.
 *
 * The parts live in trees*.ts (the trees, woods and hedge) and ground*.ts (lawn, paths, fence, border).
 */
import { Rand } from '../../scene/prng';
import { bucketFor } from '../../scene/sprites';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, bloom } from '../../river/scene/paint';
import { type Camera } from './geom';
import { TREES } from './layout';
import { PAPER, tick } from './art';
import { dressFoot, layTree, renderTree, type TreePlan } from './trees';
import { buildWoodsParts, drawClumpSpr, drawFarTree, loadKits, pickClump, type Kits, type WoodsParts } from './treesWoods';
import { HEDGE_Y, paintCastShadows, paintLawn, paintLeaves } from './groundLawn';
import { paintPaths } from './groundPaths';
import { paintPicketFence } from './groundFence';
import { paintBorder } from './groundBorder';

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
  const T0 = performance.now();
  const lg = (m: string) => console.log('[world]', m, Math.round(performance.now() - T0));
  // the trees and woods share one set of autumn foliage sprites, sized for the biggest tree
  const sdTree = bucketFor(A * 0.78);
  const kits = await loadKits(sdTree, tick, check);
  if (!kits || !check()) return null;
  lg('kits');
  const parts = await buildWoodsParts(A, sdTree, tick, check);
  if (!check()) return null;
  lg('far trees');

  // ---- hills, woods, fields, the back hedge
  paintHills(ctx, rnd, v);
  lg('hills');
  await tick();
  if (!check()) return null;
  paintWoods(ctx, cv, rnd, v, kits, parts);
  lg('woods');
  await tick();
  if (!check()) return null;
  paintFields(ctx, rnd, v);
  paintHedge(ctx, rnd, v, kits);
  lg('fields');
  await tick();
  if (!check()) return null;

  // ---- the lawn, the paths and fence laid on it, then the light and shade, then the fallen leaves
  paintLawn(ctx, rnd, v, gd);
  lg('lawn');
  await tick();
  if (!check()) return null;
  const { field } = paintPaths(ctx, rnd, v.xmin, v.xmax, v.ymax);
  lg('paths');
  await tick();
  if (!check()) return null;
  paintPicketFence(ctx, rnd);
  paintCastShadows(ctx, rnd, v);
  paintLeaves(ctx, rnd, v, field);
  lg('fence, shadows, leaves');
  await tick();
  if (!check()) return null;

  // ---- the trees (behind the cottages, in front of the hedge), the far ones first
  for (const t of [...TREES].sort((a, b) => a.y - b.y)) {
    if (!t.look || t.x + t.rx < v.xmin - 20 || t.x - t.rx > v.xmax + 20) continue;
    const plan: TreePlan = { seed: t.seed, x: t.x, y: t.y, k: t.look.k, m: t.look.m, kit: t.look.kit, haze: t.haze, flip: t.look.flip };
    const r = await renderTree(plan, A, sdTree, tick, check);
    if (!r) return null;
    layTree(ctx, plan, r, A);
    dressFoot(ctx, new Rand(t.seed + 9), t.x, t.y, t.trunk * 0.5);
    lg('tree');
  }

  // ---- the autumn border along the bottom edge
  paintBorder(ctx, new Rand(4242), v, gd);
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
    // the ridge catches the sun: a pale rim just under the line
    ctx.strokeStyle = 'rgba(255,248,226,0.16)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 2.4) : ctx.moveTo(x, ridge(x) + 2.4)));
    ctx.stroke();
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

/** a layer covering the world band y0..y1 at the main canvas's own scale, aligned to its pixels (no resampling) */
function band(main: HTMLCanvasElement, ctx: CanvasRenderingContext2D, y0: number, y1: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D; dy: number } {
  const m = ctx.getTransform();
  const dy = Math.max(0, Math.floor(m.d * y0 + m.f));
  const dh = Math.min(main.height, Math.ceil(m.d * y1 + m.f)) - dy;
  const cv = makeCanvas(main.width, Math.max(2, dh));
  const c = cv.getContext('2d')!;
  c.setTransform(m.a, 0, 0, m.d, m.e, m.f - dy);
  c.imageSmoothingQuality = 'high';
  return { cv, c, dy };
}

function paintWoods(ctx: CanvasRenderingContext2D, main: HTMLCanvasElement, rnd: Rand, v: View, kits: Kits, parts: WoodsParts): void {
  const lay = (b: { cv: HTMLCanvasElement; dy: number }) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(b.cv, 0, b.dy);
    ctx.restore();
  };
  const veil = (c: CanvasRenderingContext2D, y0: number, y1: number, paper: number, blue: number) => {
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = rgba(PAPER, paper);
    c.fillRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
    c.fillStyle = rgba('#98A8D6', blue);
    c.fillRect(v.xmin, y0, v.xmax - v.xmin, y1 - y0);
    c.globalCompositeOperation = 'source-over';
  };
  // far woods along the middle ridge: small, pale, tawny
  {
    const b = band(main, ctx, 180, 300);
    for (let x = v.xmin; x < v.xmax; x += rnd.range(12, 22)) {
      const patch = Math.sin(x / 90 + 0.6) + 0.5 * Math.sin(x / 33);
      if (patch < -0.2) continue;
      const s = pickClump(kits, rnd, ['lit', 'mid', 'gold', 'shade'], [1, 1.2, 0.8]);
      drawClumpSpr(b.c, s, x, ridgeMid(x) + rnd.range(3, 9), rnd.range(15, 25), rnd.chance(0.5));
    }
    veil(b.c, 180, 300, 0.5, 0.2);
    lay(b);
  }
  // near woods along the front ridge: two rows of small clumps, whole small trees, a few evergreens
  {
    const b = band(main, ctx, 200, 330);
    const row = (dy: number, size: [number, number], dense: number, ys: number, trees: boolean) => {
      for (let x = v.xmin; x < v.xmax; x += rnd.range(10, 22) / dense) {
        const patch = Math.sin(x / 74 + 1.7) + 0.55 * Math.sin(x / 29 + 0.3) + 0.3;
        if (patch < -0.15) continue;
        const base = ridgeNear(x) + dy + ys;
        if (rnd.chance(0.12) && patch > 0.4) {
          const cvv = parts.conifers[rnd.int(0, parts.conifers.length - 1)]!;
          const h = rnd.range(26, 38);
          const w = (h * cvv.width) / cvv.height;
          b.c.drawImage(cvv, x - w / 2, base - h, w, h);
          continue;
        }
        if (trees && parts.trees.length && rnd.chance(0.35)) {
          drawFarTree(b.c, parts.trees[rnd.int(0, parts.trees.length - 1)]!, x, base + rnd.range(-1, 2), rnd.range(0.85, 1.25), rnd.chance(0.5));
          continue;
        }
        const s = pickClump(kits, rnd, ['lit', 'mid', 'shade', 'gold', 'coral'], [1, 1, 0.7]);
        drawClumpSpr(b.c, s, x, base + rnd.range(-2, 3), rnd.range(size[0], size[1]), rnd.chance(0.5));
      }
    };
    row(2, [22, 34], 1, 4, true);
    row(10, [26, 40], 1.1, 8, true);
    veil(b.c, 200, 330, 0.22, 0.08);
    lay(b);
  }
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

function paintHedge(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, kits: Kits): void {
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
  for (let x = v.xmin; x < v.xmax; x += rnd.range(16, 30)) {
    const s = pickClump(kits, rnd, ['mid', 'shade', 'back', 'lit'], [0.8, 1, 1.4]);
    ctx.globalAlpha = 0.92;
    drawClumpSpr(ctx, s, x, HEDGE_Y + rnd.range(0, 4), rnd.range(24, 38), rnd.chance(0.5));
  }
  ctx.globalAlpha = 1;
}
