/**
 * Shared watercolor pieces for the props: soft contact shadows, painted planks and stones, straw and leaf strokes.
 * Everything runs at sprite build time; coordinates are the sprite's world units (y down, light from the upper left).
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly, xform } from '../../scene/watercolor';
import { feather, inkDashes, mix, paintForm, ribbon, speckle, bounds, type Pt, type FormOpts } from '../../river/scene/boatInk';
import { currentLeafSet, paintLeafInto } from './leaves';
import { cpuTwin } from './propSprite';

/** a soft contact shadow: layered, feathered violet-brown washes offset to the lower right (the sun is upper left) */
export function softShadow(ctx: CanvasRenderingContext2D, rnd: Rand, cx: number, cy: number, rx: number, ry: number, a = 0.2): void {
  const pts: number[] = [];
  const n = 20;
  const ph = rnd.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const j = 1 + 0.07 * Math.sin(t * 3 + ph) + rnd.range(-0.03, 0.03);
    pts.push(cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j);
  }
  feather(ctx, pts, '#3C2E42', a, rnd, 7, 1, 0.42, 0.05);
  // a darker, tighter core right under the object
  const core: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    core.push(cx - rx * 0.12 + Math.cos(t) * rx * 0.62, cy - ry * 0.12 + Math.sin(t) * ry * 0.5);
  }
  feather(ctx, core, '#2A2030', a * 0.8, rnd, 4, 1, 0.5, 0.05);
}

/** tint helper: a hex colour, lighter or darker by blending */
export const lighter = (c: string, t = 0.4): string => mix(c, '#FFF4D8', t);
export const darker = (c: string, t = 0.4): string => mix(c, '#2C1E30', t);

/** wood palettes */
export const WOOD = ['#C99A66', '#BE8E5C', '#D2A672', '#B8885A', '#C4925E'] as const;

/** a closed quad (flat) from four points */
export const quad = (a: Pt, b: Pt, c: Pt, d: Pt): number[] => [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]];

/** streaks along an axis (angle 0 = along x) inside a polygon: dry-brush wood grain / straw */
export function grainIn(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  poly: number[],
  n: number,
  color: string,
  alpha: number,
  o: { vertical?: boolean; w?: number; len?: [number, number]; ang?: number } = {},
): void {
  const b = bounds(poly);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const vert = o.vertical ?? b.h > b.w * 1.4;
  const along = vert ? b.h : b.w;
  const across = vert ? b.w : b.h;
  const [l0, l1] = o.len ?? [0.25, 0.8];
  for (let i = 0; i < n; i++) {
    const len = along * rnd.range(l0, l1);
    const s = rnd.range(-0.05, 1 - len / along + 0.05) * along;
    const r = rnd.range(0.05, 0.95) * across;
    const w = (o.w ?? 0.34) * rnd.range(0.55, 1.35);
    const wob = rnd.gauss() * 0.22;
    const pts: number[] = [];
    const steps = Math.max(3, Math.round(len / 2));
    for (let k = 0; k <= steps; k++) {
      const u = s + (len * k) / steps;
      const v = r + wob * Math.sin(k * 0.9 + i) + (o.ang ?? 0) * (u - s);
      pts.push(vert ? b.x0 + v : b.x0 + u, vert ? b.y0 + u : b.y0 + v);
    }
    ctx.fillStyle = rgba(color, alpha * rnd.range(0.55, 1.1));
    ribbon(ctx, pts, w, 0.95);
  }
  ctx.restore();
}

/** one painted wooden member (a quad or any polygon): glazes, light, shade, pooled edge, grain, a knot, a broken contour */
export function plank(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  poly: number[],
  base: string,
  o: { grain?: number; shade?: number; light?: number; ink?: number; knots?: number; vertical?: boolean; ink0?: boolean; form?: FormOpts } = {},
): void {
  const b = bounds(poly);
  const area = b.w * b.h;
  paintForm(ctx, deform(poly, rnd, 1, 0.01), base, rnd, {
    alpha: 0.96,
    layers: 2,
    amp: 0.012,
    light: lighter(base, 0.55),
    shade: darker(base, 0.5),
    lightA: o.light ?? 0.22,
    shadeA: o.shade ?? 0.2,
    speck: Math.round(area * 0.25),
    inkA: o.ink ?? 0.55,
    inkW: 0.42,
    ink0: o.ink0,
    dash: [4, 14],
    ...o.form,
  });
  const g = o.grain ?? Math.max(2, Math.round(Math.max(b.w, b.h) / 5));
  grainIn(ctx, rnd, poly, g, darker(base, 0.6), 0.34, { vertical: o.vertical, w: 0.3 });
  grainIn(ctx, rnd, poly, Math.round(g * 0.6), lighter(base, 0.65), 0.3, { vertical: o.vertical, w: 0.26 });
  // a knot or two, as a small dark swirl
  for (let i = 0; i < (o.knots ?? 0); i++) {
    const kx = b.x0 + b.w * rnd.range(0.15, 0.85);
    const ky = b.y0 + b.h * rnd.range(0.3, 0.7);
    ctx.fillStyle = rgba(darker(base, 0.65), 0.45);
    ctx.beginPath();
    ctx.ellipse(kx, ky, Math.min(1.5, b.h * 0.3 + 0.4), Math.min(0.9, b.h * 0.2 + 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(darker(base, 0.6), 0.28);
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.ellipse(kx, ky, Math.min(2.6, b.h * 0.5 + 0.8), Math.min(1.4, b.h * 0.32 + 0.5), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** a stone block: chamfered corners and slightly uneven faces, so it reads as cut and weathered rather than pill-shaped */
export function stonePoly(x: number, y: number, w: number, h: number, rnd: Rand): number[] {
  const m = Math.min(w, h);
  const c = (a: number): number => m * (a + rnd.range(-0.06, 0.06));
  const j = (a: number): number => rnd.range(-a, a);
  const pts: number[] = [
    x + c(0.26), y + j(h * 0.04),
    x + w * 0.5 + j(w * 0.08), y - h * 0.02 + j(h * 0.03),
    x + w - c(0.22), y + j(h * 0.05),
    x + w + j(w * 0.015), y + c(0.28),
    x + w + j(w * 0.02), y + h - c(0.28),
    x + w - c(0.2), y + h + j(h * 0.04),
    x + w * 0.5 + j(w * 0.1), y + h + j(h * 0.03),
    x + c(0.24), y + h + j(h * 0.04),
    x + j(w * 0.015), y + h - c(0.26),
    x + j(w * 0.02), y + c(0.3),
  ];
  return deform(pts, rnd, 1, 0.012);
}

/** a few lifted-paper and pigment grains over a box */
export function grains(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, w: number, h: number, dark: string, n: number): void {
  speckle(ctx, rnd, x, y, w, h, n, dark, 0.22, '#FFF4DC', 0.3, 0.2);
}

/** a leaf (any shape and colour) painted into the current context at a place, turned `rot` and scaled `s` (flat < 1 lays it down) */
export function dropLeaf(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, rot: number, s: number, tone: number, flat = 1, group?: number): void {
  const w = [0.14, 0.14, 0.26, 0.1, 0.2, 0.16];
  let r = rnd.next();
  let g = 2;
  if (group !== undefined) g = group;
  else
    for (let i = 0; i < w.length; i++) {
      r -= w[i]!;
      if (r <= 0) {
        g = i;
        break;
      }
    }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s * flat);
  const set = currentLeafSet();
  if (set) {
    const sp = set.spr[g]![tone]![rnd.int(0, 2)]!;
    ctx.drawImage(cpuTwin(sp), -sp.px, -sp.py, sp.w, sp.h);
  } else paintLeafInto(ctx, rnd, rnd.int(0, 2), g, tone, 0);
  ctx.restore();
}

/** scatter leaves on the ground around a place (lying flat, mostly foot-level) */
export function strew(ctx: CanvasRenderingContext2D, rnd: Rand, n: number, x0: number, x1: number, y0: number, y1: number, s = 0.5): void {
  for (let i = 0; i < n; i++) dropLeaf(ctx, rnd, rnd.range(x0, x1), rnd.range(y0, y1), rnd.range(0, 6.28), s * rnd.range(0.8, 1.15), rnd.chance(0.5) ? 1 : rnd.chance(0.5) ? 0 : 2, 0.55);
}

/** the sun on the upper left and the shade low on the right of everything already painted, over its own alpha */
export function sunAndShade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lightA = 0.2, shadeA = 0.2): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const lg = ctx.createLinearGradient(x, y, x + w * 0.7, y + h * 0.8);
  lg.addColorStop(0, `rgba(255,236,184,${lightA})`);
  lg.addColorStop(0.55, 'rgba(255,236,184,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(x, y, w, h);
  const sg = ctx.createLinearGradient(x + w * 0.35, y + h * 0.2, x + w, y + h);
  sg.addColorStop(0, 'rgba(70,40,70,0)');
  sg.addColorStop(1, `rgba(70,40,70,${shadeA})`);
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export { inkDashes };

/**
 * A cheaper painted form for the many small stones: two glazes, a lit bloom and a shade bloom as offset smaller
 * copies of the outline, pooled pigment inside the edge, grains and a broken contour.
 */
export function quickForm(ctx: CanvasRenderingContext2D, poly: number[], base: string, rnd: Rand, o: { light?: string; shade?: string; lightA?: number; shadeA?: number; speck?: number; ink?: number } = {}): void {
  const b = bounds(poly);
  const light = o.light ?? lighter(base, 0.6);
  const shade = o.shade ?? darker(base, 0.5);
  ctx.fillStyle = rgba(base, 0.72);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(base, 0.26);
  tracePoly(ctx, deform(poly, rnd, 1, 0.02));
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba(light, (o.lightA ?? 0.3) * 0.5);
    tracePoly(ctx, xform(poly, b.cx, b.cy, 0.92 - k * 0.14, 0.86 - k * 0.14, -b.w * (0.1 + k * 0.03), -b.h * (0.14 + k * 0.03)));
    ctx.fill();
    ctx.fillStyle = rgba(shade, (o.shadeA ?? 0.28) * 0.5);
    tracePoly(ctx, xform(poly, b.cx, b.cy, 0.95 - k * 0.14, 0.9 - k * 0.14, b.w * (0.12 + k * 0.03), b.h * (0.18 + k * 0.03)));
    ctx.fill();
  }
  ctx.strokeStyle = rgba(shade, 0.14);
  for (let i = 0; i < 2; i++) {
    ctx.lineWidth = 0.7 + i * 0.7;
    tracePoly(ctx, poly);
    ctx.stroke();
  }
  speckle(ctx, rnd, b.x0, b.y0, b.w, b.h, o.speck ?? Math.round(b.w * b.h * 0.4), shade, 0.22, '#FFF4DC', 0.3, 0.2);
  ctx.restore();
  inkDashes(ctx, poly, rnd, { color: '#3A2A20', alpha: o.ink ?? 0.55, w: 0.46, dash: [4, 11], gap: [0.6, 2.4], center: [b.cx, b.cy] });
}
