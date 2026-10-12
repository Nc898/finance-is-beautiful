/**
 * The river's static art, painted once per size into cached layers (watercolor variant):
 *   paper  – ivory paper + watercolor sky (never zoomed, like Time to Grow's sky)
 *   world  – layered hills, far bank (meadow, hedge clumps, reeds), the river's wet-in-wet washes with sky and
 *            bank reflections, the near bank with its soil edge, towpath and meadow, stones
 *            (zoomed with the camera, cached at 1.5x density)
 *   dock   – the wooden jetty, painted separately at a higher density so the opening close-up stays crisp
 * Everything is painted as translucent washes (multiply glazes over soft, low-resolution wet layers, then
 * crisp wobbly edges, bristle marks, paper tooth and a few broken ink lines), lit from the upper left.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, paintPaperBackdrop, paintSky, rgba, tracePoly } from '../../scene/watercolor';
import type { Sprites, Spr } from '../../scene/sprites';
import { PIER, WORLD, farEdge, mooringY, nearEdge, type Camera, type Insets } from './geom';
import { flat, grain, inkLine, paintShape, smooth01, smoothPoly, wash, type Pt } from './ink';
import { SoftLayer, applyTooth, archLine, blobPoly, bloom, brushBand, flowerDab, grassTuft, paintStone, paperTooth, strokePoly } from './paint';
import type { TreeSprite } from './farTrees';

export interface DockLayer {
  cv: HTMLCanvasElement;
  /** world rect the canvas covers */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StaticLayers {
  paper: HTMLCanvasElement;
  world: HTMLCanvasElement;
  /** device px per css px of the world canvas */
  gd: number;
  dock: DockLayer;
  /** visible world extent with a margin */
  xmin: number;
  xmax: number;
  ymax: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** world x range covered by the canvas, with a margin */
export function visibleX(c: Camera, margin = 60): { xmin: number; xmax: number; ymax: number } {
  return { xmin: -c.ox / c.s - margin, xmax: (c.cssW - c.ox) / c.s + margin, ymax: (c.cssH - c.oy) / c.s + margin };
}

function xs(xmin: number, xmax: number, step: number): number[] {
  const o: number[] = [];
  for (let x = xmin; x <= xmax + step; x += step) o.push(x);
  return o;
}

/** path of the water between the two banks */
export function waterPolyPath(xmin: number, xmax: number, inset = 0): Path2D {
  const p = new Path2D();
  const X = xs(xmin, xmax, 10);
  p.moveTo(X[0]!, farEdge(X[0]!) + inset);
  for (const x of X) p.lineTo(x, farEdge(x) + inset);
  for (let i = X.length - 1; i >= 0; i--) p.lineTo(X[i]!, nearEdge(X[i]!) - inset);
  p.closePath();
  return p;
}

/* ------------------------------------------------------------------ sky + paper */

export function paintPaperAndSky(cam: Camera, tile: CanvasImageSource): HTMLCanvasElement {
  const Wd = Math.round(cam.cssW * cam.dpr);
  const Hd = Math.round(cam.cssH * cam.dpr);
  const paper = makeCanvas(Wd, Hd);
  const pctx = paper.getContext('2d')!;
  paintPaperBackdrop(pctx, Wd, Hd, tile, cam.dpr);
  // sky wash down to a little below the hills; clouds sit in the open sky above them
  paintSky(pctx, Wd, Hd, cam.oy + 188 * cam.s, cam.dpr);
  return paper;
}


/** dry-brush ticks: short, slightly curved strokes that make a flat wash read as brushed */
function scumble(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, yAt: (x: number) => number, yh: (x: number) => number, n: number, cols: readonly string[], len: [number, number], wid: [number, number], alpha: [number, number], lean = 0.12): void {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rnd.range(xmin, xmax);
    const y = yAt(x) + rnd.next() * yh(x);
    const l = rnd.range(len[0], len[1]);
    ctx.strokeStyle = rgba(rnd.pick(cols), rnd.range(alpha[0], alpha[1]));
    ctx.lineWidth = rnd.range(wid[0], wid[1]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + l * 0.5, y - l * lean + rnd.range(-0.6, 0.6), x + l, y + rnd.range(-0.8, 0.8));
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ hills */

const ridgeFar = (x: number): number => 118 + 15 * Math.sin(x / 190 + 0.3) + 9 * Math.sin(x / 83 + 1.9) + 4 * Math.sin(x / 37);
const ridgeMid = (x: number): number => 134 + 11 * Math.sin(x / 150 + 1.1) + 6 * Math.sin(x / 71 + 0.2) + 2.5 * Math.sin(x / 31);
const ridgeNear = (x: number): number => 147 + 9 * Math.sin(x / 140 + 2.2) + 5 * Math.sin(x / 61 + 0.4) + 2.5 * Math.sin(x / 29);

/** bush positions along the far bank, shared with the tree placement */
export function farBankX(xmin: number, xmax: number): number[] {
  const r = new Rand(901);
  const o: number[] = [];
  for (let x = xmin + 20; x < xmax; x += r.range(55, 120)) o.push(x);
  return o;
}

const PAPER = '#FBF6EA';

/** lifts the bottom of whatever is already painted on the canvas toward the paper (atmospheric haze) */
function hazeBand(ctx: CanvasRenderingContext2D, xmin: number, xmax: number, y0: number, y1: number, a: number, top = 0): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(PAPER, top));
  g.addColorStop(1, rgba(PAPER, a));
  ctx.fillStyle = g;
  ctx.fillRect(xmin, y0, xmax - xmin, y1 - y0);
  ctx.restore();
}

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, y0: number, y1: number): void {
  const X = xs(xmin, xmax, 20);
  const soft = new SoftLayer(xmin, y0, xmax - xmin, y1 - y0, 0.45);
  const range = (ridge: (x: number) => number, base: number, color: string, a: number, o: { crisp: number; fade: number; pool: number }) => {
    const pts: Pt[] = [];
    for (const x of X) pts.push([x, ridge(x)]);
    for (let i = X.length - 1; i >= 0; i--) pts.push([X[i]!, base]);
    const poly = flat(pts);
    const top = Math.min(...X.map(ridge));
    // 1. the wet body: soft-edged, pigment pooling toward the ridge and thinning down
    soft.ctx.clearRect(xmin, y0, xmax - xmin, y1 - y0);
    const g = soft.ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, rgba(color, a * 0.9));
    g.addColorStop(0.5, rgba(color, a * 0.75));
    g.addColorStop(1, rgba(color, a * 0.35));
    soft.ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      tracePoly(soft.ctx, deform(poly, rnd, 2, 0.012));
      soft.ctx.fill();
    }
    soft.draw(ctx, 1, 'multiply');
    // 2. a crisper, wobblier ridge edge laid over it
    ctx.globalCompositeOperation = 'multiply';
    const g2 = ctx.createLinearGradient(0, top, 0, base);
    g2.addColorStop(0, rgba(color, a * o.crisp));
    g2.addColorStop(o.fade, rgba(color, a * o.crisp * 0.55));
    g2.addColorStop(1, rgba(color, a * o.crisp * 0.2));
    ctx.fillStyle = g2;
    for (let i = 0; i < 2; i++) {
      tracePoly(ctx, deform(poly, rnd, 3, 0.02 + 0.008 * i));
      ctx.fill();
    }
    // 3. pooled pigment along the ridge: a thin broken line a little below the crest
    ctx.strokeStyle = rgba(color, o.pool);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.setLineDash([40, 6, 18, 4]);
    ctx.beginPath();
    X.forEach((x, i) => (i ? ctx.lineTo(x, ridge(x) + 0.8 + rnd.range(-0.3, 0.3)) : ctx.moveTo(x, ridge(x) + 0.8)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  };

  // farthest range: cool lilac-blue, very pale, bleeding into the sky
  range(ridgeFar, y1, '#A9B7D6', 0.2, { crisp: 0.5, fade: 0.4, pool: 0.07 });
  // soft blooms of warmer lilac and bluer tone within it (wet-in-wet)
  soft.ctx.clearRect(xmin, y0, xmax - xmin, y1 - y0);
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(xmin, xmax);
    bloom(soft.ctx, x, ridgeFar(x) + rnd.range(8, 24), rnd.range(50, 130), rnd.range(7, 14), rnd.pick(['#C3B2D4', '#9FB6D8', '#B7B9D8']), 0.13, rnd, 4);
  }
  soft.draw(ctx, 1, 'multiply');
  hazeBand(ctx, xmin, xmax, y0 + 40, y1 - 15, 0.34, 0);
  // middle range: blue-green grey
  range(ridgeMid, y1, '#93B2BE', 0.22, { crisp: 0.6, fade: 0.38, pool: 0.09 });
  soft.ctx.clearRect(xmin, y0, xmax - xmin, y1 - y0);
  for (let i = 0; i < 10; i++) {
    const x = rnd.range(xmin, xmax);
    bloom(soft.ctx, x, ridgeMid(x) + rnd.range(6, 22), rnd.range(40, 110), rnd.range(6, 12), rnd.pick(['#8DB0A2', '#A5BCA0', '#8AA9C4']), 0.12, rnd, 4);
  }
  soft.draw(ctx, 1, 'multiply');
  hazeBand(ctx, xmin, xmax, y0 + 52, y1 - 12, 0.3, 0);
  // nearer rolling hills: sage, with sun-warmed patches and a woodland fringe
  range(ridgeNear, y1, '#9DBA8A', 0.26, { crisp: 0.7, fade: 0.34, pool: 0.12 });
  soft.ctx.clearRect(xmin, y0, xmax - xmin, y1 - y0);
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(xmin, xmax);
    bloom(soft.ctx, x, ridgeNear(x) + rnd.range(5, 20), rnd.range(40, 120), rnd.range(5, 11), rnd.pick(['#D2D488', '#B4CC84', '#86AE82', '#C5CE8A']), 0.14, rnd, 4);
  }
  soft.draw(ctx, 1, 'multiply');

  // field patchwork and hedgerow lines following the slope
  for (let i = 0; i < 34; i++) {
    const x = rnd.range(xmin, xmax);
    const y = ridgeNear(x) + rnd.range(5, 24);
    const w = rnd.range(26, 88);
    const h = rnd.range(2.5, 6);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(rnd.pick(['#D6D68C', '#A8C586', '#C9D49A', '#9DB98B', '#E2D498']), rnd.range(0.07, 0.15));
    tracePoly(ctx, deform([x, y, x + w * 0.5, y - h * 0.4, x + w, y - 0.3 * h, x + w * 0.95, y + h, x + w * 0.5, y + h * 1.15, x + w * 0.05, y + h * 1.05], rnd, 2, 0.07));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (rnd.chance(0.5)) {
      ctx.strokeStyle = rgba('#5F8A5E', rnd.range(0.12, 0.22));
      ctx.lineWidth = rnd.range(0.4, 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.2 + rnd.range(-1, 1), x + w, y + h * 1.05);
      ctx.stroke();
    }
  }
  // the woodland fringe along the near ridge: a bumpy dark-sage treeline growing out of the crest
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    let ph = 0;
    for (let x = xmin; x <= xmax + 4; x += 3) {
      ph += rnd.range(-0.3, 0.3);
      const patch = Math.max(0, Math.sin(x / 83 + 1.3) + 0.25 * Math.sin(x / 31));
      const bump = patch * (2.2 + 2.6 * Math.abs(Math.sin(x / 5.7 + ph)) + 1.4 * Math.abs(Math.sin(x / 2.9 + 2 * ph)));
      top.push([x, ridgeNear(x) - bump]);
      bot.push([x, ridgeNear(x) + 5 + patch * 3]);
    }
    const poly = flat([...top, ...bot.reverse()]);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba('#7FA67E', 0.1);
    for (let k = 0; k < 3; k++) {
      tracePoly(ctx, deform(poly, rnd, 1, 0.01));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  hazeBand(ctx, xmin, xmax, y0 + 70, y1 - 10, 0.34, 0);
}

/* ------------------------------------------------------------------ far bank */

function paintFarBank(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, y0: number, y1: number, spr: Sprites, q: number): void {
  const X = xs(xmin, xmax, 14);
  const W = xmax - xmin;
  // 1. the low meadow strip rising from the water: wet-in-wet yellow-green, sap and blue-green
  const top = (x: number) => farEdge(x) - 12 + 2.5 * Math.sin(x / 31) + 1.4 * Math.sin(x / 11 + 1);
  const pts: Pt[] = [];
  for (const x of X) pts.push([x, top(x)]);
  for (let i = X.length - 1; i >= 0; i--) pts.push([X[i]!, farEdge(X[i]!) + 1.8]);
  const poly = flat(pts);
  const soft = new SoftLayer(xmin, y0, W, y1 - y0, 0.5);
  {
    const g = soft.ctx.createLinearGradient(0, 160, 0, 190);
    g.addColorStop(0, 'rgba(200,214,130,0.0)');
    g.addColorStop(0.4, 'rgba(176,200,112,0.42)');
    g.addColorStop(1, 'rgba(120,164,96,0.5)');
    soft.ctx.fillStyle = g;
    tracePoly(soft.ctx, deform(poly, rnd, 2, 0.02));
    soft.ctx.fill();
    for (let i = 0; i < 14; i++) {
      const x = rnd.range(xmin, xmax);
      bloom(soft.ctx, x, farEdge(x) - rnd.range(1, 7), rnd.range(25, 80), rnd.range(2.5, 5), rnd.pick(['#E0DE8E', '#8FBA6C', '#6FA580', '#C6D676']), 0.2, rnd, 3);
    }
  }
  soft.draw(ctx, 1, 'multiply');
  ctx.globalCompositeOperation = 'multiply';
  for (const [c, a] of [
    ['#C6D58A', 0.18],
    ['#8FB86E', 0.16],
    ['#6C9A62', 0.12],
  ] as const) {
    for (let i = 0; i < 2; i++) {
      const g = ctx.createLinearGradient(0, 160, 0, 190);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(0.45, rgba(c, a));
      g.addColorStop(1, rgba(c, a * 1.3));
      ctx.fillStyle = g;
      tracePoly(ctx, deform(poly, rnd, 2, 0.03));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // 2. hedgerow: a bumpy olive understory, then real house foliage clumps along the bank, hazed with distance
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (let x = xmin; x <= xmax + 4; x += 3) {
      const patch = Math.max(0, 0.55 + Math.sin(x / 61 + 0.7) * 0.6 + 0.3 * Math.sin(x / 23));
      const bump = patch * (3.2 + 2.2 * Math.abs(Math.sin(x / 4.1 + 1)) + 1.2 * Math.abs(Math.sin(x / 7.7)));
      top.push([x, farEdge(x) - 1.5 - bump]);
      bot.push([x, farEdge(x) + 1.4]);
    }
    const poly = flat([...top, ...bot.reverse()]);
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a2] of [
      ['#7FA668', 0.22],
      ['#5D8A62', 0.2],
      ['#4A7A5A', 0.14],
    ] as const) {
      ctx.fillStyle = rgba(c, a2);
      for (let k = 0; k < 2; k++) {
        tracePoly(ctx, deform(poly, rnd, 2, 0.012));
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const bush = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const bctx = bush.getContext('2d')!;
  bctx.setTransform(ctx.getTransform());
  const draw = (s: Spr, cx: number, by: number, bw: number) => {
    const sw = bw / 0.72;
    const sh = sw * (s.sh / s.sw);
    bctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, cx - sw / 2, by - sh * 0.82, sw, sh);
  };
  void q;
  const kinds = ['back', 'mid', 'lit', 'mid', 'back', 'shade'] as const;
  for (const x of farBankX(xmin, xmax)) {
    if (rnd.chance(0.12)) continue;
    const n = rnd.int(2, 4);
    const r0 = rnd.range(12, 24);
    const yb = farEdge(x) + 0.5;
    for (let k = 0; k < n; k++) {
      const kind = kinds[rnd.int(0, kinds.length - 1)]!;
      const pool = spr.kinds[kind];
      if (!pool.length) continue;
      const s = pool[rnd.int(0, pool.length - 1)]!;
      const bw = r0 * rnd.range(0.8, 1.25);
      draw(s, x + (k - (n - 1) / 2) * r0 * 0.62 + rnd.range(-2, 2), yb - rnd.range(0, 2.2), bw);
    }
  }
  // the hedge sits back in the haze: veil of paper and a breath of cool blue over the clumps only
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = 'source-atop';
  bctx.fillStyle = 'rgba(251,246,234,0.2)';
  bctx.fillRect(0, 0, bush.width, bush.height);
  bctx.fillStyle = 'rgba(112,160,200,0.11)';
  bctx.fillRect(0, 0, bush.width, bush.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.92;
  ctx.drawImage(bush, 0, 0);
  ctx.restore();

  // 3. grasses and reeds standing at the water's edge: tapered brush blades, lit from the upper left
  ctx.lineCap = 'round';
  for (let i = 0; i < 300; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) + rnd.range(-3, 1);
    const h = rnd.range(2.5, 7);
    const lean = rnd.range(-1.6, 1.6);
    ctx.strokeStyle = rgba(rnd.chance(0.3) ? '#A9C46C' : rnd.chance(0.5) ? '#5F8F58' : '#7FA45E', rnd.range(0.35, 0.65));
    ctx.lineWidth = rnd.range(0.4, 0.85);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
  }
  // a few pale flowers and cow-parsley heads in the grass
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) - rnd.range(1.5, 8);
    flowerDab(ctx, x, y, rnd.range(0.7, 1.3), rnd.pick(['#F4EEDC', '#F2D470', '#E9A5A0', '#F6F2E8']), rnd, false);
  }
  // 4. where the bank meets the water: pooled pigment (darker, a drying edge) and a lifted line below it
  ctx.fillStyle = 'rgba(62,102,84,0.3)';
  ctx.beginPath();
  ctx.moveTo(xmin, farEdge(xmin));
  for (const x of X) ctx.lineTo(x, farEdge(x) + 0.6 + 0.7 * Math.sin(x / 9));
  for (let i = X.length - 1; i >= 0; i--) ctx.lineTo(X[i]!, farEdge(X[i]!) - 1.6 + 0.4 * Math.sin(X[i]! / 5));
  ctx.closePath();
  ctx.fill();
  hazeBand(ctx, xmin, xmax, 150, y1, 0.0, 0.0);
}

/* ------------------------------------------------------------------ water */

interface Refl {
  cv: HTMLCanvasElement;
  /** device px per world unit of cv */
  q: number;
  x: number;
  y: number;
}

/** the far bank, its hills and trees reflected: flipped in vertical slices, rippled, cooled, and soft */
function buildBankReflection(farCv: HTMLCanvasElement, trees: TreeSprite[], q: number, xmin: number, xmax: number, farY0: number): Refl {
  const qr = q * 0.55;
  const D = 78; // depth of the reflection below the shore, world units
  const refl = makeCanvas((xmax - xmin) * qr, (D + 8) * qr);
  const rc = refl.getContext('2d')!;
  const src = makeCanvas(farCv.width, farCv.height);
  const sc = src.getContext('2d')!;
  sc.drawImage(farCv, 0, 0);
  sc.setTransform(q, 0, 0, q, -xmin * q, -farY0 * q);
  for (const t of trees) sc.drawImage(t.cv, t.x - t.ox, t.y - t.oy, t.w, t.h);
  const rowH = 1.7;
  const ry0 = 140; // world y the reflection canvas starts at
  // rows of the flipped bank, each shifted sideways by a small ripple: whole rows, so no seams
  for (let d = 0; d < D; d += rowH) {
    const fade = Math.pow(1 - d / D, 1.4);
    const wob = 1.5 * Math.sin(d * 0.5) * (0.35 + d / 55) + 0.8 * Math.sin(d * 1.3 + 1.7);
    rc.globalAlpha = 0.8 * fade;
    // the shoreline is not level: sample each row along a gently sloping axis using 4 bands
    const bands = 6;
    const bw = (xmax - xmin) / bands;
    for (let bi = 0; bi < bands; bi++) {
      const sx = xmin + bi * bw;
      const axis = farEdge(sx + bw / 2) + 0.6;
      rc.drawImage(src, bi * bw * q, (axis - d - rowH - farY0) * q, bw * q, rowH * q, (bi * bw + wob) * qr, (axis + d - ry0) * qr, bw * qr, rowH * qr);
    }
  }
  rc.globalAlpha = 1;
  rc.globalCompositeOperation = 'source-atop';
  rc.fillStyle = 'rgba(44,112,146,0.34)';
  rc.fillRect(0, 0, refl.width, refl.height);
  rc.fillStyle = 'rgba(251,246,234,0.08)';
  rc.fillRect(0, 0, refl.width, refl.height);
  return { cv: refl, q: qr, x: xmin, y: ry0 };
}

/** the sky mirrored in the water (clouds and all), compressed and rippled; strongest in the far water */
function buildSkyReflection(paper: HTMLCanvasElement, cam: Camera, q: number, xmin: number, xmax: number): Refl {
  const qr = q * 0.4;
  const y0 = 176;
  const Dm = 250;
  const cv = makeCanvas((xmax - xmin) * qr, Dm * qr);
  const c = cv.getContext('2d')!;
  const k = 0.86;
  const shoreS = cam.oy + 184 * cam.s;
  const rowH = 2.2;
  const px0 = (cam.ox + xmin * cam.s) * cam.dpr;
  const sw = (xmax - xmin) * cam.s * cam.dpr;
  for (let d = 0; d < Dm - 8; d += rowH) {
    const sy = shoreS - (d + 8) * cam.s * k;
    if (sy < 0) break;
    const wob = 2.2 * Math.sin(d * 0.37) + 1.3 * Math.sin(d * 0.9 + 1);
    c.drawImage(paper, px0, sy * cam.dpr, sw, rowH * cam.s * k * cam.dpr + 1, wob * qr, d * qr, (xmax - xmin) * qr, rowH * qr + 0.5);
  }
  // fade with depth
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.65)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, cv.width, cv.height);
  return { cv, q: qr, x: xmin, y: y0 };
}

function paintWater(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  xmin: number,
  xmax: number,
  bank: Refl,
  sky: Refl,
  q: number,
): void {
  const clip = waterPolyPath(xmin, xmax);
  ctx.save();
  ctx.clip(clip);
  const y0 = 158;
  const y1 = 522;
  const W = xmax - xmin;
  const H = y1 - y0;
  const fAt = (x: number, f: number) => farEdge(x) + (nearEdge(x) - farEdge(x)) * f;

  // 1. the broad graded wash: pale reflected sky by the far bank, teal channel, warm sap-green shallows
  {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0.0, 'rgba(160,200,224,0.7)');
    g.addColorStop(0.12, 'rgba(120,180,210,0.66)');
    g.addColorStop(0.36, 'rgba(52,142,180,0.7)');
    g.addColorStop(0.58, 'rgba(30,118,154,0.76)');
    g.addColorStop(0.8, 'rgba(58,142,162,0.68)');
    g.addColorStop(0.93, 'rgba(150,196,168,0.55)');
    g.addColorStop(1.0, 'rgba(192,204,150,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(xmin, y0, W, H);
  }

  // 2. wet-in-wet blooms of blue / teal / viridian / sap, in a low-resolution layer so every edge bleeds
  {
    const soft = new SoftLayer(xmin, y0, W, H, 0.5);
    const hues: Array<[string, number, number]> = [
      // colour, alpha, preferred depth centre (0 far .. 1 near)
      ['#2B7FA0', 0.36, 0.55],
      ['#235F90', 0.3, 0.48],
      ['#2F6E9A', 0.3, 0.4],
      ['#1F6C86', 0.34, 0.62],
      ['#3C97A6', 0.32, 0.62],
      ['#5AA8A0', 0.24, 0.78],
      ['#7FB4C0', 0.26, 0.2],
      ['#9CC2C8', 0.24, 0.1],
      ['#A9C58C', 0.3, 0.92],
      ['#D2C88C', 0.2, 0.96],
      ['#4A8CAE', 0.24, 0.3],
    ];
    for (let i = 0; i < 84; i++) {
      const [c, a, fc] = hues[i % hues.length]!;
      const f = Math.min(0.97, Math.max(0.03, fc + rnd.range(-0.14, 0.14)));
      const x = rnd.range(xmin - 60, xmax);
      bloom(soft.ctx, x, fAt(x, f), rnd.range(50, 230), rnd.range(4, 17), c, a, rnd, 4);
    }
    soft.draw(ctx, 1, 'multiply');
    // and lifted passages where the paper is nearly clean (blotted wet washes)
    soft.ctx.clearRect(xmin, y0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = rnd.range(xmin, xmax);
      const f = rnd.range(0.06, 0.9);
      bloom(soft.ctx, x, fAt(x, f), rnd.range(40, 150), rnd.range(3, 9), rnd.pick(['#FBF6EA', '#F4F6EC', '#EAF2F0']), 0.2, rnd, 3);
    }
    soft.draw(ctx, 1, 'source-over');
  }

  // 3. the sky mirrored in the water: reflected cloud shapes drift pale across the far channel
  ctx.globalAlpha = 0.3;
  ctx.drawImage(sky.cv, sky.x, sky.y, sky.cv.width / sky.q, sky.cv.height / sky.q);
  ctx.globalAlpha = 1;

  // 4. long horizontal brush bands of deeper channel colour: the current's grain, with bristle marks
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 34; i++) {
    const cx = rnd.range(xmin - 80, xmax);
    const len = rnd.range(180, 560);
    const f = rnd.range(0.2, 0.84);
    const cy = fAt(cx, f);
    const th = rnd.range(5, 17) * (0.8 + 0.5 * f);
    const line = archLine(cx, cy, len, rnd.range(-1.5, 3), rnd.range(0.4, 1.8), i, 14);
    brushBand(ctx, line, (t) => th * Math.pow(Math.sin(Math.PI * t), 0.75) * (0.75 + 0.25 * Math.sin(t * 7 + i)), rnd.pick(['#2C8190', '#2F7BA0', '#3A88A8', '#2D7AA6']), 0.15, rnd, {
      layers: 2,
      bristles: 4,
      bristleColor: '#1E6485',
      bristleAlpha: 0.1,
    });
  }
  // a few darker strokes in the deep channel, laid on once the washes are dry (hard top edge)
  for (let i = 0; i < 10; i++) {
    const cx = rnd.range(xmin, xmax);
    const len = rnd.range(110, 300);
    const cy = fAt(cx, rnd.range(0.4, 0.7));
    const line = archLine(cx, cy, len, rnd.range(0, 2), 1, i * 2, 10);
    brushBand(ctx, line, (t) => rnd.range(0, 0) + 6 * Math.pow(Math.sin(Math.PI * t), 0.6), '#1F6A86', 0.13, rnd, { layers: 2, bristles: 4, bristleAlpha: 0.12 });
  }
  ctx.globalCompositeOperation = 'source-over';

  // 5. the far bank, hills and trees reflected (vertically smeared, cool and soft)
  ctx.globalAlpha = 0.9;
  ctx.drawImage(bank.cv, bank.x, bank.y, bank.cv.width / bank.q, bank.cv.height / bank.q);
  ctx.globalAlpha = 1;

  // 5b. backruns: where fresh water crept back into a drying wash, leaving a paler cauliflower shape with a
  // darker pooled rim (kept low-contrast and away from the shores)
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0.22, 0.78);
    const rx = rnd.range(22, 60);
    const ry = rx * rnd.range(0.1, 0.2);
    const poly = deform(blobPoly(x, fAt(x, f), rx, ry, rnd, 14, 0.22), rnd, 3, 0.1);
    ctx.fillStyle = 'rgba(236,246,244,0.2)';
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,98,130,0.16)';
    ctx.lineWidth = 0.8;
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,116,150,0.06)';
    tracePoly(ctx, deform(poly, rnd, 2, 0.05));
    ctx.fill();
  }
  // a broken pale line just under the far shore where the bank catches the light on the water
  ctx.strokeStyle = 'rgba(250,250,238,0.4)';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.setLineDash([34, 9, 14, 7]);
  ctx.beginPath();
  for (const x of xs(xmin, xmax, 10)) (x === xmin ? ctx.moveTo(x, farEdge(x) + 3.6) : ctx.lineTo(x, farEdge(x) + 3.6 + 0.5 * Math.sin(x / 8)));
  ctx.stroke();
  ctx.setLineDash([]);

  // 6. lifted lights: soft pale strokes, as if the pigment was blotted out with a damp brush
  ctx.lineCap = 'round';
  for (let i = 0; i < 56; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0.04, 0.96);
    const y = fAt(x, f);
    const len = rnd.range(30, 110) * (0.7 + 0.6 * f);
    const th = rnd.range(1.2, 3.2) * (0.7 + 0.6 * f);
    const line = archLine(x, y, len, rnd.range(-0.5, 0.8), 0.5, i, 7);
    ctx.fillStyle = rgba(rnd.chance(0.65) ? '#FBF8EC' : '#E3F0F2', rnd.range(0.16, 0.3));
    const p = strokePoly(line, (t) => th * Math.pow(Math.sin(Math.PI * t), 0.7));
    tracePoly(ctx, deform(p, rnd, 2, 0.04));
    ctx.fill();
  }
  // short darker marks where small ripples shadow their lee side
  for (let i = 0; i < 50; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0.05, 0.95);
    const y = fAt(x, f);
    const len = rnd.range(8, 26) * (0.7 + 0.6 * f);
    ctx.strokeStyle = rgba('#235F7D', rnd.range(0.08, 0.18));
    ctx.lineWidth = rnd.range(0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + rnd.range(-0.7, 0.7), x + len, y);
    ctx.stroke();
  }

  // 7. shallows by the near bank: warm, sunlit, with pale pebbles seen through the water
  {
    const soft = new SoftLayer(xmin, 440, W, 90, 0.5);
    for (let i = 0; i < 18; i++) {
      const x = rnd.range(xmin, xmax);
      bloom(soft.ctx, x, nearEdge(x) - rnd.range(3, 22), rnd.range(40, 150), rnd.range(3, 8), rnd.pick(['#D8CC90', '#B8CC8C', '#CFC08A']), 0.2, rnd, 3);
    }
    soft.draw(ctx, 1, 'multiply');
    for (let i = 0; i < 90; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) - rnd.range(2, 20);
      const r = rnd.range(0.7, 2.1);
      ctx.fillStyle = rgba(rnd.pick(['#E6DCC0', '#CDBF9E', '#B8AE92', '#F2EAD2']), rnd.range(0.2, 0.42));
      tracePoly(ctx, deform(blobPoly(x, y, r * 1.2, r * 0.7, rnd, 7, 0.2), rnd, 1, 0.12));
      ctx.fill();
    }
  }

  // 8. shade where the banks darken the water: green-teal under the far bank, the near lip's shadow
  {
    const sh = ctx.createLinearGradient(0, 160, 0, 214);
    sh.addColorStop(0, 'rgba(50,100,92,0.3)');
    sh.addColorStop(0.35, 'rgba(60,112,112,0.12)');
    sh.addColorStop(1, 'rgba(60,112,112,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(xmin, 160, W, 54);
    const nh = ctx.createLinearGradient(0, 470, 0, 524);
    nh.addColorStop(0, 'rgba(70,120,100,0)');
    nh.addColorStop(0.7, 'rgba(66,112,84,0.16)');
    nh.addColorStop(1, 'rgba(54,92,66,0.34)');
    ctx.fillStyle = nh;
    ctx.fillRect(xmin, 470, W, 60);
  }
  // sun-warmed lightness on the upper left of the water
  {
    const sg = ctx.createRadialGradient(150, 250, 10, 150, 250, 430);
    sg.addColorStop(0, 'rgba(255,250,228,0.26)');
    sg.addColorStop(1, 'rgba(255,250,228,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(xmin, y0, W, H);
  }

  // 9. paper tooth: pigment settles into the valleys (granulation, denser in the channel), and the paper's
  // peaks show through the wash
  {
    const px = q * 0.9;
    applyTooth(ctx, paperTooth('#1E5878', 192, 311), xmin, y0, W, H, px, 0, 0.14);
  }
  // 10. wet edges where the washes stopped: a thin darker, firmer line at each shore
  ctx.strokeStyle = 'rgba(40,98,100,0.34)';
  ctx.lineWidth = 0.9;
  ctx.setLineDash([60, 5, 22, 4]);
  ctx.beginPath();
  for (const x of xs(xmin, xmax, 8)) (x === xmin ? ctx.moveTo(x, farEdge(x) + 0.8) : ctx.lineTo(x, farEdge(x) + 0.8 + 0.4 * Math.sin(x / 6)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ------------------------------------------------------------------ near bank */

function paintNearBank(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, ymax: number, _spr: Sprites, q: number): void {
  const X = xs(xmin, xmax, 12);
  const W = xmax - xmin;

  // ---- 1. the meadow: layered greens from the soil edge to the bottom of the canvas
  const mTop = (x: number) => nearEdge(x) + 5 + 2.2 * Math.sin(x / 19) + 1.4 * Math.sin(x / 8 + 2);
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (const x of X) {
      top.push([x, mTop(x)]);
      bot.push([x, ymax + 4]);
    }
    const poly = flat([...top, ...bot.reverse()]);
    // soft wet-in-wet blooms across the whole meadow (big, low-res)
    const soft = new SoftLayer(xmin, 470, W, ymax - 470, 0.34);
    {
      const sc = soft.ctx;
      const g = sc.createLinearGradient(0, 495, 0, ymax);
      g.addColorStop(0, 'rgba(196,216,124,0.4)');
      g.addColorStop(0.25, 'rgba(162,196,106,0.4)');
      g.addColorStop(1, 'rgba(126,168,92,0.38)');
      sc.fillStyle = g;
      tracePoly(sc, poly);
      sc.fill();
      const hues: Array<[string, number]> = [
        ['#DCE48E', 0.3],
        ['#8DBB54', 0.22],
        ['#6FA77A', 0.2],
        ['#EAD890', 0.24],
        ['#4F8650', 0.17],
        ['#B6CE78', 0.24],
      ];
      for (let i = 0; i < 40; i++) {
        const [c, a] = hues[i % hues.length]!;
        const x = rnd.range(xmin - 80, xmax);
        const y = rnd.range(520, ymax);
        bloom(sc, x, y, rnd.range(70, 280), rnd.range(8, 30), c, a, rnd, 4);
      }
    }
    soft.draw(ctx, 1, 'multiply');
    // a few lifted, nearly clean passages where the paper breathes through
    {
      const lift = new SoftLayer(xmin, 500, W, ymax - 500, 0.34);
      for (let i = 0; i < 16; i++) bloom(lift.ctx, rnd.range(xmin, xmax), rnd.range(540, ymax), rnd.range(60, 220), rnd.range(6, 18), rnd.pick(['#FBF6EA', '#F6F1DA']), 0.26, rnd, 3);
      lift.draw(ctx, 1, 'source-over');
    }
    // crisp wobbly top edge with layered glazes
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a, n] of [
      ['#CBDC88', 0.2, 1],
      ['#A6C46B', 0.15, 1],
      ['#7FA656', 0.09, 1],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const g = ctx.createLinearGradient(0, 495, 0, ymax);
        g.addColorStop(0, rgba(c, a * 0.6));
        g.addColorStop(0.25, rgba(c, a));
        g.addColorStop(1, rgba(c, a * 1.1));
        ctx.fillStyle = g;
        const d = deform(poly, rnd, 1, 0.003);
        tracePoly(ctx, d);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 2. the towpath: a warm, worn earth wash along the bank where the mileposts stand
  const pc = (x: number) => nearEdge(x) + 44 + 2.4 * Math.sin(x / 90 + 1) + 1.2 * Math.sin(x / 33);
  const flare = (x: number) => 9 * Math.exp(-Math.pow((x - (PIER.x0 + PIER.x1) / 2) / 38, 2));
  const phw = (x: number) => 11.5 + 2.4 * Math.sin(x / 57 + 2) + 1.4 * Math.sin(x / 23) + flare(x);
  const pTop = (x: number) => pc(x) - phw(x) - flare(x) * 0.9;
  const pBot = (x: number) => pc(x) + phw(x);
  {
    const Xp = xs(xmin, xmax, 8);
    const top: Pt[] = Xp.map((x): Pt => [x, pTop(x)]);
    const bot: Pt[] = Xp.map((x): Pt => [x, pBot(x)]);
    const poly = flat([...top, ...bot.slice().reverse()]);
    const soft = new SoftLayer(xmin, 480, W, 110, 0.5);
    soft.ctx.fillStyle = 'rgba(222,194,140,0.55)';
    tracePoly(soft.ctx, deform(poly, rnd, 2, 0.006));
    soft.ctx.fill();
    for (let i = 0; i < 22; i++) {
      const x = rnd.range(xmin, xmax);
      bloom(soft.ctx, x, pc(x) + rnd.range(-5, 5), rnd.range(30, 100), rnd.range(2, 4.5), rnd.pick(['#D9B880', '#C79E68', '#E6CC96', '#BC9A6C']), 0.3, rnd, 3);
    }
    // the path's body is cut out of the meadow: lift the greens under it first, leaving a wobbly hard edge
    ctx.save();
    const cut = deform(poly, rnd, 3, 0.006);
    tracePoly(ctx, cut);
    ctx.clip();
    ctx.clearRect(xmin, 480, W, 110);
    ctx.fillStyle = 'rgba(247,238,214,0.5)';
    ctx.fillRect(xmin, 480, W, 110);
    ctx.restore();
    soft.draw(ctx, 1, 'multiply');
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a, n] of [
      ['#E3C998', 0.16, 2],
      ['#C9A370', 0.12, 2],
      ['#B58C5C', 0.07, 2],
    ] as const)
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rgba(c, a);
        tracePoly(ctx, deform(poly, rnd, 3, 0.007));
        ctx.fill();
      }
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // a pale worn centre where feet and hooves have polished it
    for (let k = 0; k < 2; k++) {
      const c: Pt[] = Xp.map((x): Pt => [x, pc(x) - 1.2 + Math.sin(x / 17 + k) * 0.8]);
      const p = strokePoly(c, (t) => 7 + 3 * Math.sin(t * 90 + k * 2) * 0.3 + 2 * Math.sin(t * 37));
      ctx.fillStyle = 'rgba(246,236,208,0.12)';
      tracePoly(ctx, deform(p, rnd, 2, 0.02));
      ctx.fill();
    }
    // faint cart ruts: two thin darker lines that break and resume
    ctx.lineCap = 'round';
    for (const off of [-3.8, 3.4]) {
      ctx.strokeStyle = 'rgba(122,88,56,0.13)';
      ctx.lineWidth = 0.8;
      let on = false;
      ctx.beginPath();
      for (const x of Xp) {
        if (rnd.chance(0.04)) on = !on;
        const y = pc(x) + off + 0.8 * Math.sin(x / 13 + off);
        if (on) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // flecks of dried mud and dust in the surface
    for (let i = 0; i < 380; i++) {
      const x = rnd.range(xmin, xmax);
      const y = rnd.range(pTop(x), pBot(x));
      const r = rnd.range(0.3, 1.0);
      ctx.fillStyle = rgba(rnd.chance(0.5) ? '#8A6A47' : '#F6EBCB', rnd.range(0.1, 0.28));
      ctx.fillRect(x, y, r * 1.4, r);
    }
    ctx.restore();
    // pebbles in and beside the path
    for (let i = 0; i < 46; i++) {
      const x = rnd.range(xmin, xmax);
      const y = rnd.range(pTop(x) + 2, pBot(x) - 1);
      paintStone(ctx, x, y, rnd.range(0.7, 1.9), rnd, { alpha: 0.9 });
    }
    // pooled pigment along the lower edge of the path (the wash dried there) and a softer upper edge
    ctx.strokeStyle = 'rgba(150,108,66,0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([46, 6, 20, 5]);
    ctx.beginPath();
    Xp.forEach((x, i) => (i ? ctx.lineTo(x, pBot(x) + 0.4 * Math.sin(x / 5)) : ctx.moveTo(x, pBot(x))));
    ctx.stroke();
    ctx.setLineDash([]);
    // grass creeping in from both edges, and the odd weed in the middle
    for (let i = 0; i < 230; i++) {
      const x = rnd.range(xmin, xmax);
      const edge = rnd.chance(0.5);
      const y = edge ? pTop(x) + rnd.range(-1, 3.5) : pBot(x) + rnd.range(-3.5, 2);
      grassTuft(ctx, x, y, rnd.range(2.2, 5.5), rnd, 0.55, ['#8DB155', '#5E8A45', '#A6C25C', '#6E9A48']);
    }
    for (let i = 0; i < 36; i++) {
      const x = rnd.range(xmin, xmax);
      grassTuft(ctx, x, pc(x) + rnd.range(-5, 6), rnd.range(2, 4.5), rnd, 0.5);
    }
  }

  // ---- 3. the soil edge: a warm cut-away strip where the meadow meets the water (as in Time to Grow)
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (const x of X) {
      top.push([x, nearEdge(x) - 1.2 + 0.8 * Math.sin(x / 7)]);
      bot.push([x, nearEdge(x) + 10 + 2.2 * Math.sin(x / 23 + 1) + 1.2 * Math.sin(x / 9)]);
    }
    const poly = flat([...top, ...bot.slice().reverse()]);
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 480, 0, 520);
    g.addColorStop(0, '#B08C62');
    g.addColorStop(0.5, '#C29B6C');
    g.addColorStop(1, '#DABB8C');
    ctx.fillStyle = rgba('#B38A5E', 0.0);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(xmin, 470, W, 70);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a] of [
      ['#E1C28E', 0.12],
      ['#CDA570', 0.12],
      ['#B98F58', 0.08],
      ['#9A7048', 0.04],
    ] as const)
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = rgba(c, a);
        tracePoly(ctx, deform(poly, rnd, 2, 0.015));
        ctx.fill();
      }
    // shadow under the overhanging turf, lit lower body
    const sh = ctx.createLinearGradient(0, 480, 0, 506);
    sh.addColorStop(0, 'rgba(76,52,32,0.22)');
    sh.addColorStop(0.5, 'rgba(76,52,32,0.06)');
    sh.addColorStop(1, 'rgba(76,52,32,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(xmin, 470, W, 50);
    ctx.globalCompositeOperation = 'source-over';
    // strata, pebbles and tiny roots
    ctx.lineCap = 'round';
    for (let i = 0; i < 200; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) + rnd.range(1, 12);
      ctx.strokeStyle = rgba(rnd.chance(0.4) ? '#6A4C32' : '#E8D2A6', rnd.range(0.18, 0.4));
      ctx.lineWidth = rnd.range(0.3, 0.7);
      const l = rnd.range(3, 12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + l * 0.5, y + rnd.range(-0.9, 0.9), x + l, y + rnd.range(-0.5, 0.5));
      ctx.stroke();
    }
    for (let i = 0; i < 110; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) + rnd.range(2, 11);
      const r = rnd.range(0.6, 1.8);
      ctx.fillStyle = rgba(rnd.chance(0.5) ? '#CBB596' : '#4C3523', rnd.range(0.4, 0.7));
      tracePoly(ctx, deform([x - r, y, x, y - r * 0.8, x + r, y, x + r * 0.2, y + r * 0.6], rnd, 1, 0.2));
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(86,58,36,0.55)';
    for (let i = 0; i < 70; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) + rnd.range(-0.5, 3);
      const l = rnd.range(3, 9);
      ctx.lineWidth = rnd.range(0.3, 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + rnd.range(-2, 2), y + l * 0.5, x + rnd.range(-3, 3), y + l);
      ctx.stroke();
    }
    applyTooth(ctx, paperTooth('#5A3E28', 160, 77), xmin, 470, W, 70, q * 0.8, 0.0, 0.5);
    ctx.restore();
    // ink edge at the waterline, and the dark pooled pigment line along the water side
    inkLine(ctx, flat(top), 1, { alpha: 0.32, width: 0.5, closed: false, dash: [26, 3, 9, 2] });
    ctx.strokeStyle = 'rgba(52,36,24,0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(top[0]![0], top[0]![1] - 1);
    for (const p of top) ctx.lineTo(p[0], p[1] - 1);
    ctx.stroke();
    // the turf lip: tufts of grass hanging over the edge
    for (let x = xmin; x < xmax; x += rnd.range(6, 12)) {
      const y = nearEdge(x) + 0.2 + 0.8 * Math.sin(x / 7);
      grassTuft(ctx, x, y + rnd.range(1.5, 3), rnd.range(3, 6.5), rnd, 0.7, ['#6E9A48', '#4B7A3A', '#8DB155']);
    }
  }

  // ---- 4. meadow detail: brush ticks, grass blades, bold tufts toward the viewer, flowers, stones and low bushes
  {
    const yAt = (x: number) => mTop(x) + 4;
    const yh = (x: number) => ymax - yAt(x);
    scumble(ctx, rnd, xmin, xmax, yAt, yh, 1100, ['#C4D77C', '#9CC25E', '#E4DE8E', '#B8D070'], [8, 26], [1.6, 3.8], [0.07, 0.15], 0.1);
    scumble(ctx, rnd, xmin, xmax, yAt, yh, 800, ['#5F9650', '#4A8553', '#6E9E5E', '#3F7A55'], [8, 28], [1.6, 3.8], [0.06, 0.12], 0.12);
  }
  // broad horizontal brush passes in the meadow, with bristle marks (glazed greens, yellow-greens)
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 24; i++) {
    const cx = rnd.range(xmin - 100, xmax);
    const len = rnd.range(160, 420);
    const cy = rnd.range(mTop(cx) + 20, ymax);
    const k = 0.8 + 0.8 * Math.min(1, (cy - 505) / 130);
    const th = rnd.range(7, 20) * k;
    const line = archLine(cx, cy, len, rnd.range(-1.5, 2.5), 1, i, 12);
    brushBand(ctx, line, (t) => th * Math.pow(Math.sin(Math.PI * t), 0.7), rnd.pick(['#9CC25E', '#6FA55E', '#B8CE74', '#5F9650']), 0.09, rnd, { layers: 2, bristles: 4, bristleAlpha: 0.1 });
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  for (let i = 0; i < 1000; i++) {
    const x = rnd.range(xmin, xmax);
    const y = rnd.range(mTop(x) + 6, ymax);
    if (y > pTop(x) - 1 && y < pBot(x) + 1 && rnd.chance(0.85)) continue;
    const k = 0.7 + 0.8 * Math.min(1, (y - 500) / 120);
    ctx.strokeStyle = rgba(rnd.chance(0.3) ? '#9DBF5C' : rnd.chance(0.5) ? '#4F7E3E' : '#6E9A48', rnd.range(0.28, 0.55));
    ctx.lineWidth = rnd.range(0.35, 0.8) * k;
    const h = rnd.range(3, 8.5) * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rnd.range(-0.8, 1.6), y - h * 0.6, x + rnd.range(-2.4, 3), y - h);
    ctx.stroke();
  }
  // bold tufts toward the viewer, grown in small clumps (a big blade fan with smaller ones around it)
  for (let i = 0; i < 70; i++) {
    const cx = rnd.range(xmin, xmax);
    const cy = rnd.range(mTop(cx) + 14, ymax);
    if (cy > pTop(cx) - 3 && cy < pBot(cx) + 3) continue;
    const k = 0.7 + 1.1 * Math.min(1, (cy - 505) / 130);
    const n = rnd.int(2, 4);
    for (let j = 0; j < n; j++) {
      const dx = j === 0 ? 0 : rnd.range(-9, 9) * k;
      const dy = j === 0 ? 0 : rnd.range(-2.5, 3) * k;
      grassTuft(ctx, cx + dx, cy + dy, rnd.range(5.5, 12) * k * (j === 0 ? 1 : 0.75), rnd, k);
    }
  }
  // wildflower clusters: daisies, buttercups, a few coral, lilac and blue, as soft pigment dabs
  const bloomCols = ['#FBF6E8', '#FBF6E8', '#F3CF58', '#EE8B72', '#BFA2D8', '#8FB2E0'];
  for (let i = 0; i < 36; i++) {
    const cx = rnd.range(xmin, xmax);
    const cy = rnd.range(mTop(cx) + 22, ymax - 6);
    if (cy > pTop(cx) - 4 && cy < pBot(cx) + 4) continue;
    const k = 0.8 + 0.8 * Math.min(1, (cy - 505) / 130);
    const col = rnd.pick(bloomCols);
    const n = rnd.int(4, 7);
    for (let j = 0; j < n; j++) {
      flowerDab(ctx, cx + rnd.range(-13, 13) * k, cy + rnd.range(-5, 5) * k, rnd.range(0.9, 1.5) * k, col, rnd);
    }
  }
  // stones scattered in the grass
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(xmin, xmax);
    const y = rnd.range(mTop(x) + 30, ymax - 4);
    if (y > pTop(x) - 3 && y < pBot(x) + 3) continue;
    const k = 0.9 + 1.0 * Math.min(1, (y - 505) / 130);
    paintStone(ctx, x, y, rnd.range(1.2, 2.8) * k, rnd);
    for (let j = 0; j < 3; j++) grassTuft(ctx, x + rnd.range(-3, 4) * k, y + rnd.range(0, 1.5), rnd.range(3, 6) * k, rnd, 0.8);
  }
  // the foreground settles a little darker and greener toward the bottom of the page
  {
    const vg = ctx.createLinearGradient(0, ymax - 150, 0, ymax);
    vg.addColorStop(0, 'rgba(96,140,84,0)');
    vg.addColorStop(1, 'rgba(84,128,78,0.2)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = vg;
    ctx.fillRect(xmin, ymax - 150, W, 154);
    ctx.globalCompositeOperation = 'source-over';
  }
  // paper tooth over the meadow
  ctx.save();
  tracePoly(ctx, flat(X.map((x): Pt => [x, mTop(x)]).concat(X.slice().reverse().map((x): Pt => [x, ymax + 4]))));
  ctx.clip();
  applyTooth(ctx, paperTooth('#4F7A3A', 192, 53), xmin, 480, W, ymax - 480, q * 0.9, 0, 0.26);
  ctx.restore();
}

function paintStones(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number): void {
  // near-bank shallows: a scattered line of stones just off the soil edge
  for (let i = 0; i < 28; i++) {
    const x = rnd.range(xmin, xmax);
    if (Math.abs(x - WORLD.dockX) < 150 && rnd.chance(0.8)) continue; // keep the dock approach clear
    const y = nearEdge(x) - rnd.range(3, 12);
    paintStone(ctx, x, y, rnd.range(2.2, 5.5), rnd, { wet: true });
  }
  // a few lily pads drifting in the near shallows, away from the dock approach
  for (let i = 0; i < 7; i++) {
    const x = rnd.range(xmin, xmax);
    if (Math.abs(x - WORLD.dockX) < 190) continue;
    const y = nearEdge(x) - rnd.range(9, 26);
    const r = rnd.range(3.2, 5.4);
    for (let k = 0; k < rnd.int(1, 3); k++) {
      const px = x + k * rnd.range(5, 9);
      const py = y + rnd.range(-3, 3);
      const rr = r * rnd.range(0.7, 1);
      ctx.fillStyle = 'rgba(30,70,70,0.14)';
      ctx.beginPath();
      ctx.ellipse(px + 1.2, py + 1.2, rr * 1.15, rr * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      const pad = [] as number[];
      const gap = rnd.range(0, Math.PI * 2);
      for (let j = 0; j <= 14; j++) {
        const a = gap + 0.25 + (j / 14) * (Math.PI * 2 - 0.5);
        pad.push(px + Math.cos(a) * rr * 1.2, py + Math.sin(a) * rr * 0.42);
      }
      pad.push(px, py);
      ctx.fillStyle = 'rgba(120,164,84,0.62)';
      tracePoly(ctx, pad);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,118,70,0.3)';
      tracePoly(ctx, deform(pad, rnd, 1, 0.03));
      ctx.fill();
      ctx.fillStyle = 'rgba(226,238,160,0.4)';
      ctx.beginPath();
      ctx.ellipse(px - rr * 0.35, py - rr * 0.1, rr * 0.4, rr * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,74,48,0.4)';
      ctx.lineWidth = 0.35;
      tracePoly(ctx, pad);
      ctx.stroke();
    }
    if (rnd.chance(0.5)) flowerDab(ctx, x + r * 0.4, y - 1.2, 1.3, '#F6EEDC', rnd, false);
  }
  // far-bank stones, smaller and paler
  for (let i = 0; i < 14; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) + rnd.range(2, 7);
    paintStone(ctx, x, y, rnd.range(1.4, 3.2), rnd, { wet: true, alpha: 0.7 });
  }
  // a few rocks standing out in the shallows
  for (const [x, f, r] of [
    [140, 0.9, 7],
    [820, 0.92, 6.4],
    [905, 0.1, 4.2],
    [250, 0.12, 4],
  ] as const) {
    const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * f;
    paintStone(ctx, x, y, r, rnd, { wet: true });
  }
}

/* ------------------------------------------------------------------ the dock */

/** the jetty, painted at its own density */
export function paintDock(cam: Camera, density: number): DockLayer {
  const x = PIER.x0 - 40;
  const y = PIER.yTip - 34;
  const w = PIER.x1 - PIER.x0 + 80;
  const yb = nearEdge(PIER.x0) + 42;
  const h = yb - y;
  const q = density;
  const cv = makeCanvas(w * q, h * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -x * q, -y * q);
  const rnd = new Rand(3301);
  void cam;

  const pc = (PIER.x0 + PIER.x1) / 2;
  const hw = (yy: number) => 13 + 8 * smooth01((yy - PIER.yTip) / 230); // wider toward us (perspective)
  const xl = (yy: number) => pc - hw(yy);
  const xr = (yy: number) => pc + hw(yy);
  const deckLift = 9; // deck above the water
  const yTipDeck = PIER.yTip;
  const yBaseDeck = nearEdge(PIER.x0) + 24;

  // water shadow of the whole pier, falling to the lower right (light from the upper left)
  {
    const shadow: Pt[] = [];
    for (let yy = yTipDeck + deckLift; yy <= nearEdge(PIER.x0) + 4; yy += 14) shadow.push([xr(yy) + 2, yy + deckLift * 0.2]);
    for (let yy = nearEdge(PIER.x0) + 4; yy >= yTipDeck + deckLift; yy -= 14) shadow.push([xr(yy) + 9, yy + deckLift * 0.6]);
    ctx.save();
    ctx.clip(waterPolyPath(PIER.x0 - 200, PIER.x1 + 200));
    ctx.fillStyle = 'rgba(22,62,80,0.06)';
    for (let i = 0; i < 5; i++) {
      tracePoly(ctx, deform(flat(shadow), rnd, 2, 0.025));
      ctx.fill();
    }
    ctx.restore();
  }

  // pilings (the legs the deck stands on), drawn first so the deck overlaps their tops
  const postYs = [mooringY('cash'), PIER.yTip + 30];
  const piling = (px: number, foot: number, up: number) => {
    // wet ring and the piling's dark, rippled reflection (soft, vertically smeared strokes)
    ctx.strokeStyle = 'rgba(244,250,244,0.6)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(px + 0.4, foot + 0.3, 5.2, 1.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(52,64,64,${0.2 - k * 0.035})`;
      ctx.lineWidth = 3 - k * 0.4;
      ctx.beginPath();
      ctx.moveTo(px + Math.sin(k) * 0.7, foot + 2 + k * 4.5);
      ctx.quadraticCurveTo(px + 1.6 * (k % 2 ? 1 : -1), foot + 4 + k * 4.5, px + Math.sin(k + 2) * 0.9, foot + 6 + k * 4.5);
      ctx.stroke();
    }
    const w = 5.4;
    const pts: Pt[] = [
      [px - w / 2, foot],
      [px - w / 2 + 0.2, foot - up * 0.5],
      [px - w / 2 + 0.1, foot - up],
      [px, foot - up - 1.3],
      [px + w / 2 - 0.1, foot - up],
      [px + w / 2, foot - up * 0.5],
      [px + w / 2 - 0.2, foot],
    ];
    const poly = smoothPoly(pts, 3, true);
    const path = new Path2D();
    path.moveTo(poly[0]!, poly[1]!);
    for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i]!, poly[i + 1]!);
    path.closePath();
    const g = ctx.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
    g.addColorStop(0, 'rgba(210,180,136,0.97)');
    g.addColorStop(0.45, 'rgba(160,122,84,0.97)');
    g.addColorStop(1, 'rgba(100,72,52,0.97)');
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    // wet dark band at the waterline, then green weed above it
    const wg = ctx.createLinearGradient(0, foot - 6, 0, foot);
    wg.addColorStop(0, 'rgba(40,50,34,0)');
    wg.addColorStop(1, 'rgba(36,58,50,0.6)');
    ctx.fillStyle = wg;
    ctx.fillRect(px - w, foot - 6, w * 2, 6);
    grain(ctx, rnd, px - w / 2, foot - up, w, up, 5, '#4E3626', 0.4, 0.3, true);
    ctx.restore();
    inkLine(ctx, poly, 1, { color: '#2E221A', alpha: 0.6, width: 0.5, dash: [9, 1.5, 4, 1.5] });
    // the rope cap
    ctx.strokeStyle = 'rgba(222,198,148,0.95)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(px - w / 2 - 0.2, foot - up + 1.4);
    ctx.quadraticCurveTo(px, foot - up + 3.2, px + w / 2 + 0.2, foot - up + 1.4);
    ctx.stroke();
  };
  for (const yy of postYs) {
    piling(xl(yy) - 1.6, yy, 14);
    piling(xr(yy) + 1.6, yy, 14);
  }

  // deck stringers visible on the left face (the side facing us), then the planks
  {
    const faceL: Pt[] = [];
    for (let yy = yTipDeck; yy <= yBaseDeck; yy += 12) faceL.push([xl(yy), yy]);
    const faceR: Pt[] = faceL.map((p): Pt => [p[0] - 0.6, p[1] + deckLift * 0.55]).reverse();
    const poly = flat([...faceL, ...faceR]);
    ctx.fillStyle = '#76563C';
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,28,20,0.3)';
    tracePoly(ctx, deform(poly, rnd, 1, 0.01));
    ctx.fill();
  }
  // planks: rows from the tip toward us, perspective-spaced, each its own warm tone
  const rows: number[] = [];
  {
    let yy = yTipDeck;
    let hgt = 3.9;
    while (yy < yBaseDeck) {
      rows.push(yy);
      yy += hgt;
      hgt *= 1.016;
    }
    rows.push(yy);
  }
  const woods = ['#CBA97E', '#BC986C', '#D3B48C', '#AD8963', '#C29F75', '#D0B58A'];
  ctx.save();
  for (let i = 0; i < rows.length - 1; i++) {
    const ya = rows[i]!;
    const yb2 = rows[i + 1]! - 0.55;
    const pts: Pt[] = [
      [xl(ya) + rnd.range(-0.25, 0.25), ya],
      [(xl(ya) + xr(ya)) / 2, ya + rnd.range(-0.15, 0.15)],
      [xr(ya) + rnd.range(-0.25, 0.25), ya],
      [xr(yb2) + rnd.range(-0.25, 0.25), yb2],
      [(xl(yb2) + xr(yb2)) / 2, yb2 + rnd.range(-0.12, 0.12)],
      [xl(yb2) + rnd.range(-0.25, 0.25), yb2],
    ];
    const poly = flat(pts);
    const col = woods[i % woods.length]!;
    // a wash of the plank colour, built from translucent layers so the edges are uneven
    ctx.fillStyle = rgba(col, 0.5);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(col, 0.28);
    for (let k = 0; k < 2; k++) {
      tracePoly(ctx, deform(poly, rnd, 2, 0.012));
      ctx.fill();
    }
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // soft top-light, lower shade, from the upper left
    const g = ctx.createLinearGradient(xl(ya), ya, xr(ya), yb2);
    g.addColorStop(0, 'rgba(255,244,216,0.4)');
    g.addColorStop(1, 'rgba(70,46,30,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(xl(ya) - 2, ya - 1, xr(ya) - xl(ya) + 4, yb2 - ya + 2);
    grain(ctx, rnd, xl(ya), ya, xr(ya) - xl(ya), yb2 - ya, 3, '#5A3E2C', 0.38, 0.26);
    // weathering: a streak of darker, damper wood now and then
    if (rnd.chance(0.35)) {
      ctx.fillStyle = 'rgba(70,52,40,0.13)';
      ctx.fillRect(rnd.range(xl(ya), xr(ya) - 10), ya, rnd.range(6, 16), yb2 - ya);
    }
    ctx.restore();
    // dark gap and broken ink at the lower edge
    ctx.strokeStyle = 'rgba(54,36,26,0.7)';
    ctx.lineWidth = 0.55;
    ctx.setLineDash([9, 1.6, 4, 1.3]);
    ctx.beginPath();
    ctx.moveTo(xl(yb2), yb2);
    ctx.lineTo(xr(yb2), yb2);
    ctx.stroke();
    ctx.setLineDash([]);
    // nails
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(52,40,34,0.7)';
      ctx.beginPath();
      ctx.arc(xl(ya) + 2.4, (ya + yb2) / 2, 0.45, 0, Math.PI * 2);
      ctx.arc(xr(ya) - 2.4, (ya + yb2) / 2, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // long ink edges of the deck
  const leftEdge: Pt[] = [];
  const rightEdge: Pt[] = [];
  for (let yy = yTipDeck; yy <= yBaseDeck; yy += 8) {
    leftEdge.push([xl(yy), yy]);
    rightEdge.push([xr(yy), yy]);
  }
  inkLine(ctx, flat(leftEdge), 1, { color: '#2E221A', alpha: 0.7, width: 0.7, closed: false, dash: [30, 3, 11, 2] });
  inkLine(ctx, flat(rightEdge), 1, { color: '#2E221A', alpha: 0.6, width: 0.6, closed: false, dash: [26, 3, 9, 2] });
  inkLine(ctx, [xl(yTipDeck), yTipDeck, xr(yTipDeck), yTipDeck], 1, { color: '#2E221A', alpha: 0.7, width: 0.7, closed: false, dash: [30, 2] });
  // the end board's face (the little edge of the tip)
  ctx.fillStyle = 'rgba(96,68,48,0.85)';
  ctx.fillRect(xl(yTipDeck), yTipDeck - 2.2, xr(yTipDeck) - xl(yTipDeck), 2.4);
  inkLine(ctx, [xl(yTipDeck), yTipDeck - 2.2, xr(yTipDeck), yTipDeck - 2.2], 1, { color: '#2E221A', alpha: 0.6, width: 0.5, closed: false });
  // grass at the foot of the deck where it meets the bank
  for (let i = 0; i < 30; i++) {
    grassTuft(ctx, rnd.range(xl(yBaseDeck) - 6, xr(yBaseDeck) + 6), yBaseDeck + rnd.range(-1, 6), rnd.range(3.5, 8), rnd, 0.9, ['#5E8A45', '#8DB155', '#6E9A48']);
  }
  void wash;
  void paintShape;
  void brushBand;
  return { cv, x, y, w, h };
}

/* ------------------------------------------------------------------ build */

export async function buildStatic(
  cam: Camera,
  _insets: Insets,
  tile: CanvasImageSource,
  trees: TreeSprite[],
  spr: Sprites,
  isCancelled: () => boolean,
): Promise<StaticLayers | null> {
  const { xmin, xmax, ymax } = visibleX(cam);
  const paper = paintPaperAndSky(cam, tile);
  await tick();
  if (isCancelled()) return null;

  // device density of the world canvas: 1.5x, but bounded so the canvas stays a sensible size
  let gd = cam.dpr * 1.5;
  const maxPx = 12e6;
  while (cam.cssW * gd * cam.cssH * gd > maxPx && gd > cam.dpr) gd *= 0.92;
  const world = makeCanvas(cam.cssW * gd, cam.cssH * gd);
  const ctx = world.getContext('2d')!;
  const q = cam.s * gd;
  ctx.setTransform(q, 0, 0, q, cam.ox * gd, cam.oy * gd);
  const rnd = new Rand(5051);

  // far bank pieces go in their own strip canvas first (it is also the source of the reflection)
  const FAR_Y0 = 60;
  const FAR_Y1 = 205;
  const farCv = makeCanvas((xmax - xmin) * q, (FAR_Y1 - FAR_Y0) * q);
  const fctx = farCv.getContext('2d')!;
  fctx.setTransform(q, 0, 0, q, -xmin * q, -FAR_Y0 * q);
  paintHills(fctx, rnd, xmin, xmax, FAR_Y0, FAR_Y1);
  await tick();
  paintFarBank(fctx, rnd, xmin, xmax, FAR_Y0, FAR_Y1, spr, q);
  if (isCancelled()) return null;
  await tick();

  const bank = buildBankReflection(farCv, trees, q, xmin, xmax, FAR_Y0);
  const sky = buildSkyReflection(paper, cam, q, xmin, xmax);
  await tick();
  if (isCancelled()) return null;

  // the far strip goes onto the world canvas, then the water over it (water clips to its own shape)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(farCv, xmin * q + cam.ox * gd, FAR_Y0 * q + cam.oy * gd);
  ctx.restore();
  paintWater(ctx, rnd, xmin, xmax, bank, sky, q);
  await tick();
  if (isCancelled()) return null;
  paintNearBank(ctx, rnd, xmin, xmax, ymax, spr, q);
  await tick();
  paintStones(ctx, rnd, xmin, xmax);
  if (isCancelled()) return null;
  const dock = paintDock(cam, Math.min(cam.s * cam.dpr * 3.2, 4.5));
  return { paper, world, gd, dock, xmin, xmax, ymax };
}
