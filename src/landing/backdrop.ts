/**
 * Hero backdrop, painted once per size: textured paper, soft watercolor sky blooms behind the type,
 * a few pigment specks, the meadow wash and the soil cut-away down to the bottom of the hero.
 */
import { Rand } from '../scene/prng';
import { SOIL_DEPTH } from '../scene/treeModel';
import { ensurePaperTile } from '../scene/sprites';
import { PAL, deform, makeCanvas, makeDeepSoil, makeGroundSprite, paintPaperBackdrop, rgba, tracePoly } from '../scene/watercolor';

/** world units the far horizon stands above the main ground line */
export const HORIZON_UP = 21;

export interface HeroGeometry {
  w: number;
  h: number;
  dpr: number;
  /** css px per world unit (one shared scale for every tree) */
  s: number;
  /** screen y of the ground line */
  groundY: number;
}

/** `crownTop`: where the tallest crown may reach, as a fraction of the height (the landing hero leaves the top
 *  third to its title; a strip of trees with no title above can let them stand taller) */
export function heroGeometry(w: number, h: number, dpr: number, crownTop = 0.372): HeroGeometry {
  const groundY = h * 0.835;
  const crownTopY = h * crownTop;
  const s = (groundY - crownTopY) / 585;
  return { w, h, dpr: Math.min(2, dpr || 1), s, groundY };
}

function bloom(ctx: CanvasRenderingContext2D, d: number, cx: number, cy: number, rx: number, ry: number, hex: string, alpha: number, seed: number): void {
  const rnd = new Rand(seed);
  const base: number[] = [];
  const N = 22;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const j = 0.78 + 0.4 * rnd.next();
    base.push(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * (0.85 + 0.3 * rnd.next()));
  }
  // blur only a canvas the size of this wash (a filter on the full page canvas costs seconds)
  const blurPx = Math.max(1.5, Math.round(ry * 0.022));
  const pad = Math.ceil(blurPx * 3 + Math.max(rx, ry) * 0.35);
  const x0 = Math.floor(cx - rx * 1.25 - pad);
  const y0 = Math.floor(cy - ry * 1.25 - pad);
  const off = makeCanvas(Math.ceil(rx * 2.5 + pad * 2), Math.ceil(ry * 2.5 + pad * 2));
  const octx = off.getContext('2d')!;
  octx.translate(-x0, -y0);
  octx.filter = `blur(${blurPx}px)`;
  const layers = 8;
  for (let i = 0; i < layers; i++) {
    const k = 1 - i * 0.075;
    const p = deform(
      base.map((v, j) => (j % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * (k * 0.96))),
      rnd,
      4,
      0.2,
    );
    octx.fillStyle = rgba(hex, alpha / 3.6);
    tracePoly(octx, p);
    octx.fill();
  }
  ctx.save();
  ctx.drawImage(off, x0, y0);
  // a faint pooled edge where pigment dried
  ctx.filter = 'none';
  ctx.strokeStyle = rgba(hex, alpha * 0.22);
  ctx.lineWidth = 1.1 * d;
  tracePoly(ctx, deform(base, rnd, 3, 0.07));
  ctx.stroke();
  ctx.restore();
}

function speck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hex: string, alpha: number, rnd: Rand): void {
  const poly: number[] = [];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    poly.push(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 0.85);
  }
  ctx.fillStyle = rgba(hex, alpha);
  tracePoly(ctx, deform(poly, rnd, 2, 0.14));
  ctx.fill();
  ctx.strokeStyle = rgba(hex, alpha * 0.7);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

export async function applyHeroBackdrop(canvas: HTMLCanvasElement, g: HeroGeometry): Promise<HTMLCanvasElement> {
  const tile = await ensurePaperTile();
  const d = g.dpr;
  const Wd = Math.round(g.w * d);
  const Hd = Math.round(g.h * d);
  const bg = makeCanvas(Wd, Hd);
  const ctx = bg.getContext('2d')!;
  paintPaperBackdrop(ctx, Wd, Hd, tile, d);

  // sky blooms: pale, irregular washes behind and around the headline
  ctx.globalCompositeOperation = 'multiply';
  const b = (fx: number, fy: number, fr: number, fry: number, hex: string, a: number, seed: number) =>
    bloom(ctx, d, fx * Wd, fy * Hd, fr * Wd, fry * Hd, hex, a, seed);
  // mostly gold and coral, blue only as an accent; many small washes with paper showing between
  b(0.17, 0.12, 0.12, 0.055, PAL.gold, 0.2, 21);
  b(0.5, 0.045, 0.13, 0.03, PAL.gold, 0.15, 22);
  b(0.64, 0.31, 0.14, 0.035, PAL.gold, 0.15, 23);
  b(0.9, 0.19, 0.08, 0.055, PAL.gold, 0.17, 24);
  b(0.34, 0.31, 0.07, 0.03, PAL.coral, 0.14, 25);
  b(0.8, 0.095, 0.065, 0.04, PAL.coral, 0.13, 26);
  b(0.06, 0.26, 0.055, 0.04, PAL.coral, 0.11, 27);
  b(0.97, 0.36, 0.04, 0.025, PAL.coral, 0.1, 28);
  b(0.12, 0.135, 0.1, 0.05, PAL.coral, 0.12, 35);
  b(0.58, 0.07, 0.1, 0.035, PAL.coral, 0.1, 36);
  b(0.86, 0.22, 0.1, 0.05, PAL.coral, 0.1, 37);
  b(0.1, 0.2, 0.085, 0.045, PAL.sky, 0.13, 29);
  b(0.4, 0.065, 0.085, 0.03, PAL.sky, 0.1, 30);
  b(0.84, 0.27, 0.09, 0.04, PAL.sky, 0.11, 31);
  b(0.3, 0.04, 0.06, 0.025, PAL.sky, 0.09, 32);
  b(0.7, 0.05, 0.07, 0.03, PAL.sky, 0.09, 33);
  b(0.5, 0.345, 0.07, 0.022, PAL.sky, 0.09, 34);
  ctx.globalCompositeOperation = 'source-over';

  // restrained pigment specks between the type and the grove
  const rnd = new Rand(2026);
  const cols = [PAL.gold, PAL.coral, PAL.sky, PAL.gold, PAL.sky];
  for (let i = 0; i < 34; i++) {
    const x = rnd.range(0.03, 0.97) * Wd;
    const y = rnd.range(0.12, 0.76) * Hd;
    const r = rnd.range(1.4, 3.6) * d;
    speck(ctx, x, y, r, rnd.pick(cols), rnd.range(0.28, 0.55), rnd);
  }

  // soil cut-away to the bottom of the hero, then the meadow wash across the full width
  const gy = g.groundY * d;
  const soilH = Math.round(SOIL_DEPTH * 1.2 * g.s * d);
  const soilTop = Math.round(gy - 6 * g.s * d);
  const soil = makeDeepSoil(53, Wd, Math.round(Math.max(soilH, Hd - soilTop) * 1.6), (g.s * d) / 1.2, soilH);
  ctx.drawImage(soil, 0, soilTop);
  const gh = Math.round(78 * g.s * d);
  const far = makeGroundSprite(19, Wd, gh, (g.s * d) / 1.2);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(far, 0, Math.round(gy - HORIZON_UP * g.s * d - gh * 0.42));
  ctx.globalAlpha = 1;
  const ground = makeGroundSprite(31, Wd, gh, (g.s * d) / 1.2);
  ctx.drawImage(ground, 0, Math.round(gy - gh * 0.42));

  // shown as its own canvas layer behind the grove (no encode, no GPU readback)
  void canvas;
  return bg;
}
