/**
 * The river's static art, painted once per size into cached layers:
 *   paper  – ivory paper + watercolor sky (never zoomed, like Time to Grow's sky)
 *   world  – hazed hills, far bank, the river's layered washes with reflected hills and trees, near bank,
 *            soil edge, meadow, stones (zoomed with the camera, cached at 1.5x density)
 *   dock   – the wooden jetty, painted separately at a higher density so the opening close-up stays crisp
 */
import { Rand } from '../../scene/prng';
import { PAL, deform, makeCanvas, paintPaperBackdrop, paintSky, rgba, tracePoly } from '../../scene/watercolor';
import { PIER, WORLD, farEdge, midY, mooringY, nearEdge, type Camera, type Insets } from './geom';
import { flat, grain, inkLine, paintShape, smooth01, smoothPoly, wash, type Pt } from './ink';
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

/* ------------------------------------------------------------------ far bank */

const ridgeFar = (x: number): number => 120 + 15 * Math.sin(x / 190 + 0.3) + 9 * Math.sin(x / 83 + 1.9) + 4 * Math.sin(x / 37);
const ridgeNear = (x: number): number => 146 + 10 * Math.sin(x / 140 + 2.2) + 6 * Math.sin(x / 61 + 0.4) + 3 * Math.sin(x / 29);

/** bush positions along the far bank, shared with the tree placement */
export function farBankX(xmin: number, xmax: number): number[] {
  const r = new Rand(901);
  const o: number[] = [];
  for (let x = xmin + 20; x < xmax; x += r.range(55, 120)) o.push(x);
  return o;
}

function paintHills(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number): void {
  const X = xs(xmin, xmax, 22);
  const range = (ridge: (x: number) => number, base: number, color: string, a: number, n: number, soft: number) => {
    const pts: Pt[] = [];
    for (const x of X) pts.push([x, ridge(x)]);
    for (let i = X.length - 1; i >= 0; i--) pts.push([X[i]!, base]);
    const poly = flat(pts);
    const top = Math.min(...X.map(ridge));
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, rgba(color, 0));
      g.addColorStop(soft, rgba(color, a));
      g.addColorStop(1, rgba(color, a * 1.5));
      ctx.fillStyle = g;
      tracePoly(ctx, deform(poly, rnd, 2, 0.02 + 0.01 * i));
      ctx.fill();
    }
  };
  ctx.globalCompositeOperation = 'multiply';
  // the farthest range: cool blue-grey, very pale
  range(ridgeFar, 176, '#9DB9D2', 0.13, 4, 0.34);
  range((x) => ridgeFar(x + 140) + 6, 176, '#B3C2DA', 0.1, 2, 0.4);
  // nearer rolling hills: sage, hazed
  range(ridgeNear, 178, '#A0BDA4', 0.13, 4, 0.3);
  range((x) => ridgeNear(x * 1.1 + 90) + 4, 178, '#B4CA95', 0.11, 2, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  // a soft lifted haze between the ranges so they recede
  const hz = ctx.createLinearGradient(0, 128, 0, 178);
  hz.addColorStop(0, 'rgba(251,246,234,0)');
  hz.addColorStop(0.7, 'rgba(251,246,234,0.28)');
  hz.addColorStop(1, 'rgba(251,246,234,0.1)');
  ctx.fillStyle = hz;
  ctx.fillRect(xmin, 128, xmax - xmin, 50);
  // faint field patchwork on the nearer hills
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(xmin, xmax);
    const y = ridgeNear(x) + rnd.range(6, 22);
    const w = rnd.range(30, 90);
    const h = rnd.range(3, 7);
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#C8CF8A' : '#9DB98B', rnd.range(0.06, 0.12));
    tracePoly(ctx, deform([x, y, x + w, y - h * 0.3, x + w * 0.9, y + h, x + w * 0.1, y + h * 1.1], rnd, 2, 0.08));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function paintFarBank(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number): void {
  const X = xs(xmin, xmax, 14);
  // meadow strip rising from the water
  const pts: Pt[] = [];
  for (const x of X) pts.push([x, farEdge(x) - 11 + 2.5 * Math.sin(x / 31)]);
  for (let i = X.length - 1; i >= 0; i--) pts.push([X[i]!, farEdge(X[i]!) + 1.5]);
  const poly = flat(pts);
  ctx.globalCompositeOperation = 'multiply';
  for (const [c, a] of [
    ['#C6D58A', 0.22],
    ['#9DBD76', 0.2],
    ['#7BA066', 0.16],
  ] as const) {
    for (let i = 0; i < 3; i++) {
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
  // little tufts and a few pale flowers
  ctx.lineCap = 'round';
  for (let i = 0; i < 360; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) + rnd.range(-7, 0.5);
    ctx.strokeStyle = rgba(rnd.chance(0.35) ? '#9DBB6A' : '#5F8A55', rnd.range(0.25, 0.5));
    ctx.lineWidth = rnd.range(0.35, 0.7);
    const h = rnd.range(2, 5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rnd.range(-0.6, 0.6), y - h * 0.6, x + rnd.range(-1.6, 1.6), y - h);
    ctx.stroke();
  }
  // shrubs and hedgerow: lumpy clusters of puffs in hazed sage and olive, lit from the upper left
  for (const x of farBankX(xmin, xmax)) {
    if (rnd.chance(0.3)) continue;
    const n = rnd.int(3, 5);
    const r0 = rnd.range(4.5, 8.5);
    const yb = farEdge(x) + 0.5;
    const puffs: Array<{ px: number; py: number; r: number }> = [];
    for (let k = 0; k < n; k++) puffs.push({ px: x + (k - (n - 1) / 2) * r0 * 0.9 + rnd.range(-2, 2), py: yb - r0 * rnd.range(0.35, 0.8), r: r0 * rnd.range(0.7, 1.15) });
    const lump = (p: { px: number; py: number; r: number }, dx: number, dy: number, s: number): number[] => {
      const pts: number[] = [];
      for (let j = 0; j < 12; j++) {
        const t = (j / 12) * Math.PI * 2;
        pts.push(p.px + dx + Math.cos(t) * p.r * s * 1.1, p.py + dy + Math.sin(t) * p.r * s * 0.82);
      }
      return deform(pts, rnd, 3, 0.16);
    };
    ctx.globalCompositeOperation = 'multiply';
    for (const p of puffs) {
      ctx.fillStyle = rgba(rnd.pick(['#86A678', '#789C6C', '#93AE7A']), 0.17);
      for (let k = 0; k < 3; k++) {
        tracePoly(ctx, lump(p, 0, 0, 1 - k * 0.04));
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of puffs) {
      ctx.fillStyle = 'rgba(214,228,160,0.3)';
      tracePoly(ctx, lump(p, -p.r * 0.28, -p.r * 0.3, 0.5));
      ctx.fill();
      ctx.fillStyle = 'rgba(70,106,84,0.2)';
      tracePoly(ctx, lump(p, p.r * 0.3, p.r * 0.34, 0.55));
      ctx.fill();
    }
  }
  // pooled pigment where the bank meets the water
  ctx.fillStyle = 'rgba(70,108,90,0.28)';
  ctx.beginPath();
  ctx.moveTo(xmin, farEdge(xmin));
  for (const x of X) ctx.lineTo(x, farEdge(x) + 0.5 + 0.6 * Math.sin(x / 9));
  for (let i = X.length - 1; i >= 0; i--) ctx.lineTo(X[i]!, farEdge(X[i]!) - 1.4);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ water */

function paintWater(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, reflect: { cv: HTMLCanvasElement; q: number } | null, reflOrigin: { x: number; y: number }): void {
  const clip = waterPolyPath(xmin, xmax);
  ctx.save();
  ctx.clip(clip);
  const y0 = 160;
  const y1 = 520;
  // 1. broad graded wash: sky blue by the far bank, teal channel, warm shallows by the near bank
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0.0, 'rgba(160,200,226,0.8)');
  g.addColorStop(0.12, 'rgba(126,182,214,0.66)');
  g.addColorStop(0.36, 'rgba(62,146,184,0.72)');
  g.addColorStop(0.58, 'rgba(36,118,152,0.78)');
  g.addColorStop(0.8, 'rgba(60,144,164,0.7)');
  g.addColorStop(0.93, 'rgba(142,190,184,0.5)');
  g.addColorStop(1.0, 'rgba(170,200,176,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(xmin, y0, xmax - xmin, y1 - y0);

  // 2. variegated blooms of blue / teal / a breath of green, drawn very soft at low resolution
  {
    const q = 6;
    const w = Math.ceil((xmax - xmin) / q);
    const h = Math.ceil((y1 - y0) / q);
    const b = makeCanvas(w, h);
    const bc = b.getContext('2d')!;
    const tints = ['rgba(34,108,150,0.26)', 'rgba(70,150,176,0.24)', 'rgba(110,170,150,0.2)', 'rgba(60,120,170,0.24)'];
    for (let i = 0; i < 34; i++) {
      const x = rnd.range(0, w);
      const y = rnd.range(0.12, 0.92) * h;
      const rx = rnd.range(0.06, 0.2) * w;
      const ry = rx * rnd.range(0.08, 0.2);
      bc.save();
      bc.translate(x, y);
      bc.scale(1, ry / rx);
      const gg = bc.createRadialGradient(0, 0, 0, 0, 0, rx);
      gg.addColorStop(0, tints[i % 4]!);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      bc.fillStyle = gg;
      bc.fillRect(-rx, -rx, rx * 2, rx * 2);
      bc.restore();
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b, xmin, y0, xmax - xmin, y1 - y0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 3. long horizontal brush bands of deeper channel colour (the current's grain)
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 46; i++) {
    const cx = rnd.range(xmin, xmax);
    const len = rnd.range(160, 520);
    const f = rnd.range(0.22, 0.82);
    const cy = farEdge(cx) + (nearEdge(cx) - farEdge(cx)) * f;
    const th = rnd.range(5, 17) * (0.8 + 0.5 * f);
    const pts: Pt[] = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push([cx - len / 2 + len * t, cy - th * Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(t * 7 + i)) + Math.sin(t * 5 + i) * 2]);
    }
    for (let k = n; k >= 0; k--) {
      const t = k / n;
      pts.push([cx - len / 2 + len * t, cy + th * 0.7 * Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(t * 6 + i * 2)) + Math.sin(t * 5 + i) * 2]);
    }
    wash(ctx, smoothPoly(pts, 3), i % 3 === 0 ? '#2C8190' : '#2F7BA0', 0.085, rnd, 3, 0.03);
  }
  ctx.globalCompositeOperation = 'source-over';

  // 4. reflected hills, trees and bank (built from the far-bank layer, flipped and rippled)
  if (reflect) {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(reflect.cv, reflOrigin.x, reflOrigin.y, reflect.cv.width / reflect.q, reflect.cv.height / reflect.q);
    ctx.globalAlpha = 1;
  }

  // 5. lifted lights: pale sky-coloured strokes and reflected cloud shapes in the upper water
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) + rnd.range(14, 90);
    const w = rnd.range(60, 190);
    const h = rnd.range(4, 11);
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#F6F4E8' : '#DDEBF1', rnd.range(0.06, 0.12));
    for (let k = 0; k < 2; k++) {
      {
        const e: number[] = [];
        for (let j = 0; j < 20; j++) {
          const a = (j / 20) * Math.PI * 2;
          e.push(x + w / 2 + Math.cos(a) * (w / 2), y + Math.sin(a) * h * (0.6 + 0.4 * Math.abs(Math.cos(a))));
        }
        tracePoly(ctx, deform(e, rnd, 2, 0.05));
        ctx.fill();
      }
    }
  }
  // long light strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0.02, 0.98);
    const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * f;
    const len = rnd.range(14, 70) * (0.7 + 0.6 * f);
    ctx.strokeStyle = rgba(rnd.chance(0.6) ? '#F6F8F0' : '#CFE6EE', rnd.range(0.18, 0.4));
    ctx.lineWidth = rnd.range(0.5, 1.5) * (0.7 + 0.6 * f);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + rnd.range(-1, 1), x + len, y + rnd.range(-0.5, 0.5));
    ctx.stroke();
  }
  // and short dark ones, as ripples' shadow sides
  for (let i = 0; i < 120; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0.05, 0.96);
    const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * f;
    const len = rnd.range(8, 36) * (0.7 + 0.6 * f);
    ctx.strokeStyle = rgba('#235F7D', rnd.range(0.1, 0.24));
    ctx.lineWidth = rnd.range(0.5, 1.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + rnd.range(-0.8, 0.8), x + len, y);
    ctx.stroke();
  }

  // 6. granulation: pigment settling into the paper's tooth, denser in the deep channel
  for (let i = 0; i < 6500; i++) {
    const x = rnd.range(xmin, xmax);
    const f = rnd.range(0, 1);
    const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * f;
    const deep = Math.exp(-Math.pow((f - 0.55) / 0.3, 2));
    ctx.fillStyle = rnd.chance(0.78) ? `rgba(36,92,120,${0.05 + 0.1 * deep * rnd.next()})` : `rgba(255,252,240,${rnd.range(0.12, 0.3)})`;
    const s = rnd.range(0.5, 1.2);
    ctx.fillRect(x, y, s, s);
  }

  // 7. shade where the banks darken the water: a green-teal shadow under the far bank, the near lip
  {
    const sh = ctx.createLinearGradient(0, 160, 0, 215);
    sh.addColorStop(0, 'rgba(46,96,92,0.34)');
    sh.addColorStop(0.35, 'rgba(60,112,112,0.14)');
    sh.addColorStop(1, 'rgba(60,112,112,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(xmin, 160, xmax - xmin, 55);
    const nh = ctx.createLinearGradient(0, 455, 0, 520);
    nh.addColorStop(0, 'rgba(70,120,100,0)');
    nh.addColorStop(0.7, 'rgba(70,118,96,0.2)');
    nh.addColorStop(1, 'rgba(56,96,76,0.4)');
    ctx.fillStyle = nh;
    ctx.fillRect(xmin, 455, xmax - xmin, 70);
  }
  // sun-warmed lightness on the upper left of the water
  {
    const sg = ctx.createRadialGradient(150, 260, 10, 150, 260, 420);
    sg.addColorStop(0, 'rgba(255,250,228,0.3)');
    sg.addColorStop(1, 'rgba(255,250,228,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(xmin, y0, xmax - xmin, y1 - y0);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ near bank */

function paintNearBank(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, ymax: number): void {
  const X = xs(xmin, xmax, 12);
  // 1. the soil edge: a warm cut-away strip where the meadow meets the water (as in Time to Grow)
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (const x of X) {
      top.push([x, nearEdge(x) - 1.2 + 0.8 * Math.sin(x / 7)]);
      bot.push([x, nearEdge(x) + 10 + 2.2 * Math.sin(x / 23 + 1) + 1.2 * Math.sin(x / 9)]);
    }
    const poly = flat([...top, ...bot.reverse()]);
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 480, 0, 520);
    g.addColorStop(0, '#94704C');
    g.addColorStop(0.5, '#AC835A');
    g.addColorStop(1, '#CBA878');
    ctx.fillStyle = g;
    ctx.fillRect(xmin, 470, xmax - xmin, 70);
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a] of [
      ['#7B5636', 0.2],
      ['#B08658', 0.16],
      ['#6A4A30', 0.14],
    ] as const)
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = rgba(c, a);
        tracePoly(ctx, deform(poly, rnd, 2, 0.015));
        ctx.fill();
      }
    ctx.globalCompositeOperation = 'source-over';
    // stratified streaks, pebbles, tiny roots
    ctx.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) + rnd.range(1, 12);
      ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#5A3E28' : '#D6B88A', rnd.range(0.25, 0.5));
      ctx.lineWidth = rnd.range(0.3, 0.7);
      const l = rnd.range(3, 12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + l * 0.5, y + rnd.range(-0.9, 0.9), x + l, y + rnd.range(-0.5, 0.5));
      ctx.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd.range(xmin, xmax);
      const y = nearEdge(x) + rnd.range(2, 11);
      const r = rnd.range(0.6, 1.8);
      ctx.fillStyle = rgba(rnd.chance(0.5) ? '#CBB596' : '#4C3523', rnd.range(0.4, 0.7));
      tracePoly(ctx, deform([x - r, y, x, y - r * 0.8, x + r, y, x + r * 0.2, y + r * 0.6], rnd, 1, 0.2));
      ctx.fill();
    }
    // roots hanging from the overhanging turf
    ctx.strokeStyle = 'rgba(86,58,36,0.6)';
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
    ctx.restore();
    // ink edge at the bottom of the soil (the waterline)
    inkLine(ctx, flat(top), 1, { alpha: 0.35, width: 0.5, closed: false, dash: [26, 3, 9, 2] });
    // dark pooled pigment line along the water side
    ctx.strokeStyle = 'rgba(52,36,24,0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(top[0]![0], top[0]![1] - 1);
    for (const p of top) ctx.lineTo(p[0], p[1] - 1);
    ctx.stroke();
  }

  // 2. meadow: layered greens from the soil edge to the bottom of the canvas
  {
    const top: Pt[] = [];
    const bot: Pt[] = [];
    for (const x of X) {
      top.push([x, nearEdge(x) + 5 + 2.2 * Math.sin(x / 19) + 1.4 * Math.sin(x / 8 + 2)]);
      bot.push([x, ymax]);
    }
    const poly = flat([...top, ...bot.reverse()]);
    ctx.globalCompositeOperation = 'multiply';
    for (const [c, a, n] of [
      ['#CBDC88', 0.24, 3],
      ['#A6C46B', 0.2, 3],
      ['#7FA656', 0.14, 3],
      ['#5E8C4A', 0.07, 2],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const g = ctx.createLinearGradient(0, 495, 0, ymax);
        g.addColorStop(0, rgba(c, a * 0.6));
        g.addColorStop(0.25, rgba(c, a));
        g.addColorStop(1, rgba(c, a * 1.15));
        ctx.fillStyle = g;
        // only the top edge wobbles; the bottom stays off-canvas
        const d = deform(poly.slice(0, 2 * top.length).concat(poly.slice(2 * top.length)), rnd, 1, 0.004);
        tracePoly(ctx, d);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // broad brush variation: lighter and darker drifts across the meadow
    for (let i = 0; i < 26; i++) {
      const x = rnd.range(xmin, xmax);
      const y = rnd.range(512, ymax);
      const w = rnd.range(60, 220);
      const h = rnd.range(10, 30);
      ctx.fillStyle = rgba(rnd.chance(0.5) ? '#D6E58C' : '#4E7D44', rnd.range(0.07, 0.14));
      tracePoly(ctx, deform([x, y, x + w * 0.5, y - h * 0.5, x + w, y, x + w * 0.5, y + h * 0.5], rnd, 3, 0.1));
      ctx.fill();
    }
    // grass blades, longer toward the viewer
    ctx.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const x = rnd.range(xmin, xmax);
      const y = rnd.range(nearEdge(x) + 11, ymax);
      const k = 0.7 + 0.8 * Math.min(1, (y - 500) / 120);
      ctx.strokeStyle = rgba(rnd.chance(0.3) ? '#9DBF5C' : rnd.chance(0.5) ? '#4F7E3E' : '#6E9A48', rnd.range(0.35, 0.65));
      ctx.lineWidth = rnd.range(0.35, 0.8) * k;
      const h = rnd.range(3, 8.5) * k;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + rnd.range(-0.8, 1.6), y - h * 0.6, x + rnd.range(-2.4, 3), y - h);
      ctx.stroke();
    }
    // darker, bolder tufts toward the viewer: fans of blades with a lit side
    for (let i = 0; i < 230; i++) {
      const x = rnd.range(xmin, xmax);
      const y = rnd.range(nearEdge(x) + 22, ymax);
      const k = 0.7 + 1.1 * Math.min(1, (y - 505) / 130);
      const n = rnd.int(5, 9);
      const hh = rnd.range(6, 12) * k;
      for (let j = 0; j < n; j++) {
        const f = (j / (n - 1) - 0.5) * 2;
        const tipx = x + f * rnd.range(3, 7) * k + rnd.range(-1, 1);
        const tipy = y - hh * rnd.range(0.65, 1);
        ctx.strokeStyle = rgba(j % 3 === 0 ? '#9DBF5C' : j % 3 === 1 ? '#4B7A3A' : '#6E9A48', rnd.range(0.55, 0.85));
        ctx.lineWidth = rnd.range(0.5, 0.95) * k;
        ctx.beginPath();
        ctx.moveTo(x + f * 0.8, y);
        ctx.quadraticCurveTo(x + f * 2 * k, y - hh * 0.55, tipx, tipy);
        ctx.stroke();
      }
    }
    // wildflower clusters: daisies, buttercups, a few coral and lilac
    for (let i = 0; i < 26; i++) {
      const cx = rnd.range(xmin, xmax);
      const cy = rnd.range(nearEdge(cx) + 26, ymax - 6);
      const k = 0.8 + 0.8 * Math.min(1, (cy - 505) / 130);
      const kind = rnd.pick(['daisy', 'daisy', 'butter', 'coral', 'lilac']);
      const n = rnd.int(4, 9);
      for (let j = 0; j < n; j++) {
        const fx = cx + rnd.range(-12, 12) * k;
        const fy = cy + rnd.range(-5, 5) * k;
        const r = rnd.range(1, 1.6) * k;
        // stem
        ctx.strokeStyle = 'rgba(80,120,60,0.7)';
        ctx.lineWidth = 0.35 * k;
        ctx.beginPath();
        ctx.moveTo(fx, fy + r * 2.4);
        ctx.lineTo(fx + rnd.range(-0.5, 0.5), fy);
        ctx.stroke();
        if (kind === 'daisy') {
          ctx.fillStyle = 'rgba(255,253,244,0.95)';
          for (let p = 0; p < 6; p++) {
            const ang = (p / 6) * Math.PI * 2 + j;
            ctx.beginPath();
            ctx.ellipse(fx + Math.cos(ang) * r * 0.9, fy + Math.sin(ang) * r * 0.7, r * 0.55, r * 0.32, ang, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(244,196,64,0.98)';
          ctx.beginPath();
          ctx.arc(fx, fy, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = kind === 'butter' ? 'rgba(246,208,70,0.95)' : kind === 'coral' ? 'rgba(236,115,87,0.92)' : 'rgba(190,150,214,0.92)';
          ctx.beginPath();
          ctx.ellipse(fx, fy, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,248,214,0.55)';
          ctx.beginPath();
          ctx.arc(fx - r * 0.25, fy - r * 0.25, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function paintStones(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number): void {
  const stone = (x: number, y: number, r: number) => {
    // wet ring where the stone meets the water
    ctx.strokeStyle = 'rgba(248,252,246,0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.1, y + r * 0.35, r * 1.35, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // the stone's shadow on the water, to the lower right
    ctx.fillStyle = 'rgba(30,70,86,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.55, y + r * 0.45, r * 1.15, r * 0.34, 0.1, 0, Math.PI * 2);
    ctx.fill();
    const pts: Pt[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const rr = r * rnd.range(0.82, 1.1);
      pts.push([x + Math.cos(t) * rr * 1.15, y - Math.abs(Math.sin(t)) * rr * (Math.sin(t) < 0 ? 0.85 : 0.18) + (Math.sin(t) > 0 ? 0 : 0)]);
    }
    const poly = smoothPoly(pts, 4);
    paintShape(ctx, poly, rnd.pick(['#B7AA94', '#A89A86', '#C2B49A']), rnd, { shade: '#4A3F36', light: '#FFF9E8', alpha: 0.9, inkW: 0.5, dash: [8, 1.5, 4, 1.5] });
  };
  // near-bank shallows: a scattered line of stones just off the soil edge
  for (let i = 0; i < 26; i++) {
    const x = rnd.range(xmin, xmax);
    if (Math.abs(x - WORLD.dockX) < 150 && rnd.chance(0.8)) continue; // keep the dock approach clear
    const y = nearEdge(x) - rnd.range(3, 12);
    stone(x, y, rnd.range(2.2, 5.5));
  }
  // far-bank stones, smaller and paler
  for (let i = 0; i < 14; i++) {
    const x = rnd.range(xmin, xmax);
    const y = farEdge(x) + rnd.range(2, 7);
    ctx.globalAlpha = 0.7;
    stone(x, y, rnd.range(1.4, 3.2));
    ctx.globalAlpha = 1;
  }
  // a few rocks standing out in the shallows
  for (const [x, f, r] of [
    [140, 0.9, 7],
    [820, 0.92, 6.4],
    [905, 0.1, 4.2],
    [250, 0.12, 4],
  ] as const) {
    const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * f;
    stone(x, y, r);
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
    ctx.fillStyle = 'rgba(24,62,78,0.05)';
    for (let i = 0; i < 4; i++) {
      tracePoly(ctx, deform(flat(shadow), rnd, 2, 0.02));
      ctx.fill();
    }
    ctx.restore();
  }

  // pilings (the legs the deck stands on), drawn first so the deck overlaps their tops
  const postYs = [mooringY('invest'), mooringY('savings'), mooringY('cash'), 478];
  const piling = (px: number, foot: number, up: number, left: boolean) => {
    // wet ring + dark reflection under the post
    ctx.strokeStyle = 'rgba(244,250,244,0.7)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(px + 0.4, foot + 0.3, 5.2, 1.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,52,60,0.3)';
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(px + Math.sin(k) * 0.7, foot + 2 + k * 5);
      ctx.quadraticCurveTo(px + 1.4 * (k % 2 ? 1 : -1), foot + 4 + k * 5, px + Math.sin(k + 2) * 0.8, foot + 6 + k * 5);
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
    g.addColorStop(0, '#CDB08A');
    g.addColorStop(0.45, '#9B7650');
    g.addColorStop(1, '#5E4330');
    ctx.fillStyle = g;
    ctx.fill(path);
    // wet dark band at the waterline
    ctx.save();
    ctx.clip(path);
    const wg = ctx.createLinearGradient(0, foot - 5, 0, foot);
    wg.addColorStop(0, 'rgba(40,40,34,0)');
    wg.addColorStop(1, 'rgba(40,52,50,0.55)');
    ctx.fillStyle = wg;
    ctx.fillRect(px - w, foot - 5, w * 2, 5);
    grain(ctx, rnd, px - w / 2, foot - up, w, up, 4, '#3E2C20', 0.4, 0.35, true);
    ctx.restore();
    inkLine(ctx, poly, 1, { alpha: 0.6, width: 0.5, dash: [9, 1.5, 4, 1.5] });
    // the rope cap
    ctx.strokeStyle = 'rgba(214,190,140,0.95)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(px - w / 2 - 0.2, foot - up + 1.4);
    ctx.quadraticCurveTo(px, foot - up + 3.2, px + w / 2 + 0.2, foot - up + 1.4);
    ctx.stroke();
    void left;
  };
  for (const yy of postYs) {
    piling(xl(yy) - 1.6, yy, 14, true);
    piling(xr(yy) + 1.6, yy, 14, false);
  }

  // deck stringers visible on the left face (the side facing us), then the planks
  {
    const faceL: Pt[] = [];
    for (let yy = yTipDeck; yy <= yBaseDeck; yy += 12) faceL.push([xl(yy), yy]);
    const faceR: Pt[] = faceL.map((p): Pt => [p[0] - 0.6, p[1] + deckLift * 0.55]).reverse();
    const poly = flat([...faceL, ...faceR]);
    ctx.fillStyle = '#6C4D36';
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
  const woods = ['#C6A57A', '#B8946A', '#D0B088', '#A98560', '#BE9C72', '#CDB187'];
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
    ctx.fillStyle = col;
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // soft top-light, lower shade, from the upper left
    const g = ctx.createLinearGradient(xl(ya), ya, xr(ya), yb2);
    g.addColorStop(0, 'rgba(255,244,216,0.35)');
    g.addColorStop(1, 'rgba(70,46,30,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(xl(ya) - 2, ya - 1, xr(ya) - xl(ya) + 4, yb2 - ya + 2);
    grain(ctx, rnd, xl(ya), ya, xr(ya) - xl(ya), yb2 - ya, 2, '#5A3E2C', 0.4, 0.28);
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
  inkLine(ctx, flat(leftEdge), 1, { alpha: 0.7, width: 0.7, closed: false, dash: [30, 3, 11, 2] });
  inkLine(ctx, flat(rightEdge), 1, { alpha: 0.6, width: 0.6, closed: false, dash: [26, 3, 9, 2] });
  inkLine(ctx, [xl(yTipDeck), yTipDeck, xr(yTipDeck), yTipDeck], 1, { alpha: 0.7, width: 0.7, closed: false, dash: [30, 2] });
  // the end board's face (the little edge of the tip)
  ctx.fillStyle = 'rgba(88,62,44,0.8)';
  ctx.fillRect(xl(yTipDeck), yTipDeck - 2.2, xr(yTipDeck) - xl(yTipDeck), 2.4);
  inkLine(ctx, [xl(yTipDeck), yTipDeck - 2.2, xr(yTipDeck), yTipDeck - 2.2], 1, { alpha: 0.6, width: 0.5, closed: false });
  // grass at the foot of the deck where it meets the bank
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const gx = rnd.range(xl(yBaseDeck) - 6, xr(yBaseDeck) + 6);
    const gy = yBaseDeck + rnd.range(-1, 6);
    ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#5E8A45' : '#8DB155', 0.85);
    ctx.lineWidth = rnd.range(0.4, 0.8);
    const l = rnd.range(3, 8);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + rnd.range(-1, 1), gy - l * 0.6, gx + rnd.range(-2, 2.4), gy - l);
    ctx.stroke();
  }
  return { cv, x, y, w, h };
}

/* ------------------------------------------------------------------ build */

export async function buildStatic(
  cam: Camera,
  _insets: Insets,
  tile: CanvasImageSource,
  trees: TreeSprite[],
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
  const FAR_Y0 = 70;
  const FAR_Y1 = 200;
  const farCv = makeCanvas((xmax - xmin) * q, (FAR_Y1 - FAR_Y0) * q);
  const fctx = farCv.getContext('2d')!;
  fctx.setTransform(q, 0, 0, q, -xmin * q, -FAR_Y0 * q);
  paintHills(fctx, rnd, xmin, xmax);
  await tick();
  paintFarBank(fctx, rnd, xmin, xmax);
  if (isCancelled()) return null;
  await tick();

  // reflection: hills + bank + trees, flipped about the shoreline in vertical slices, rippled and cooled
  const refl = makeCanvas((xmax - xmin) * q, 130 * q);
  const rc = refl.getContext('2d')!;
  {
    const src = makeCanvas(farCv.width, farCv.height);
    const sc = src.getContext('2d')!;
    sc.drawImage(farCv, 0, 0);
    sc.setTransform(q, 0, 0, q, -xmin * q, -FAR_Y0 * q);
    for (const t of trees) sc.drawImage(t.cv, t.x - t.ox, t.y - t.oy, t.w, t.h);
    const slice = 18;
    const rowH = 1.6;
    for (let sx = xmin; sx < xmax; sx += slice) {
      const axis = farEdge(sx + slice / 2) + 0.5;
      for (let d = 0; d < 74; d += rowH) {
        const fade = Math.pow(1 - d / 74, 1.25);
        const wob = 1.1 * Math.sin(d * 0.55 + sx * 0.07) * (0.35 + d / 60) + 0.6 * Math.sin(d * 1.3 + sx * 0.2);
        rc.globalAlpha = 0.85 * fade;
        // source row d above the axis -> destination row d below it
        rc.drawImage(
          src,
          (sx - xmin) * q,
          (axis - d - rowH - FAR_Y0) * q,
          slice * q + 1,
          rowH * q,
          (sx - xmin + wob) * q,
          (axis + d - 140) * q,
          slice * q + 1,
          rowH * q,
        );
      }
    }
    rc.globalAlpha = 1;
    rc.globalCompositeOperation = 'source-atop';
    rc.fillStyle = 'rgba(40,104,138,0.34)';
    rc.fillRect(0, 0, refl.width, refl.height);
    rc.fillStyle = 'rgba(251,246,234,0.1)';
    rc.fillRect(0, 0, refl.width, refl.height);
  }
    await tick();
  if (isCancelled()) return null;

  // the far strip goes onto the world canvas, then the water over it (water clips to its own shape)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(farCv, (xmin * q + cam.ox * gd), (FAR_Y0 * q + cam.oy * gd));
  ctx.restore();
  paintWater(ctx, rnd, xmin, xmax, { cv: refl, q }, { x: xmin, y: 140 });
  await tick();
  if (isCancelled()) return null;
  paintNearBank(ctx, rnd, xmin, xmax, ymax);
  await tick();
  paintStones(ctx, rnd, xmin, xmax);
  if (isCancelled()) return null;
  const dock = paintDock(cam, Math.min(cam.s * cam.dpr * 3.2, 4.5));
  void PAL;
  return { paper, world, gd, dock, xmin, xmax, ymax };
}

export { midY };
