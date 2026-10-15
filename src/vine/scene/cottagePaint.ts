/**
 * Shared watercolor helpers for painting the cottages: the paint context, a painted stone / dressed block, wash
 * polygons, broken ink edges and soft shadows. House style as in the river's boats (see river/scene/boatInk.ts):
 * a few low-alpha re-deformed glazes, a bloom toward the light (upper left), pigment pooled on the shaded lower
 * right edge, granulation, and a broken tapering ink line that is heavier away from the light.
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { inkDashes, mix, ribbon } from '../../river/scene/boatInk';
import type { CottageGeom } from './geom';
import type { PlanId } from '../types';

export type Pt = [number, number];

export interface Paint {
  ctx: CanvasRenderingContext2D;
  rnd: Rand;
  q: number;
  id: PlanId;
  c: CottageGeom;
  /** thatch (right) or slate (left) */
  thatch: boolean;
}

export const INKC = '#3B2A22';
export const LIGHT_WASH = '#FFF3D6';
export const SHADE_WASH = '#3E2F46';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** a rounded rectangle as a flat clockwise polygon (corner arcs of 3 segments), jittered a little */
export function rrPoly(x: number, y: number, w: number, h: number, r: number, rnd: Rand, jit = 0.5): number[] {
  const rr = Math.max(0.05, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const out: number[] = [];
  const corners: Array<[number, number, number]> = [
    [x + w - rr, y + rr, -Math.PI / 2],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, Math.PI / 2],
    [x + rr, y + rr, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * rr + rnd.range(-jit, jit) * 0.5, cy + Math.sin(a) * rr + rnd.range(-jit, jit) * 0.5);
    }
  }
  return out;
}

export function shift(poly: number[], dx: number, dy: number): number[] {
  const o = new Array<number>(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    o[i] = poly[i]! + dx;
    o[i + 1] = poly[i + 1]! + dy;
  }
  return o;
}

export function fillPoly(ctx: CanvasRenderingContext2D, poly: number[], color: string, a: number): void {
  ctx.fillStyle = rgba(color, a);
  tracePoly(ctx, poly);
  ctx.fill();
}

/** a soft wash: a few progressively shrunk, re-deformed copies so the edge feathers like wet pigment */
export function softWash(ctx: CanvasRenderingContext2D, poly: number[], color: string, a: number, rnd: Rand, n = 4, s1 = 0.55, amp = 0.07): void {
  let cx = 0;
  let cy = 0;
  const m = poly.length / 2;
  for (let i = 0; i < poly.length; i += 2) {
    cx += poly[i]!;
    cy += poly[i + 1]!;
  }
  cx /= m;
  cy /= m;
  ctx.fillStyle = rgba(color, a / Math.max(1, n * 0.55));
  for (let k = 0; k < n; k++) {
    const s = 1 + (s1 - 1) * (n === 1 ? 0 : k / (n - 1));
    const p = new Array<number>(poly.length);
    for (let i = 0; i < poly.length; i += 2) {
      p[i] = cx + (poly[i]! - cx) * s;
      p[i + 1] = cy + (poly[i + 1]! - cy) * s;
    }
    tracePoly(ctx, deform(p, rnd, 2, amp));
    ctx.fill();
  }
}

/** a lumpy oval as a flat polygon */
export function lump(cx: number, cy: number, rx: number, ry: number, rnd: Rand, n = 12, jit = 0.2, rot = 0): number[] {
  const o: number[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + rnd.range(-jit, jit);
    const px = Math.cos(a) * rx * j;
    const py = Math.sin(a) * ry * j;
    o.push(cx + px * cr - py * sr, cy + px * sr + py * cr);
  }
  return o;
}

/** a broken, tapering ink edge along an open path (points jittered so it does not look ruled) */
export function edgeInk(P: Paint, pts: number[], w = 0.42, alpha = 0.5, o: { dash?: [number, number]; gap?: [number, number]; color?: string } = {}): void {
  inkDashes(P.ctx, pts, P.rnd, { closed: false, w, alpha, color: o.color ?? INKC, dash: o.dash ?? [2.5, 8], gap: o.gap ?? [0.3, 1.8] });
}

/** a short hand-drawn line (slightly bowed) as an ink ribbon */
export function inkLine(P: Paint, x0: number, y0: number, x1: number, y1: number, w = 0.45, alpha = 0.55, color = INKC): void {
  const { ctx, rnd } = P;
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2.5));
  const bx = (y1 - y0) * rnd.range(-0.02, 0.02);
  const by = (x0 - x1) * rnd.range(-0.02, 0.02);
  const pts: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const bow = Math.sin(t * Math.PI);
    pts.push(lerp(x0, x1, t) + bx * bow, lerp(y0, y1, t) + by * bow);
  }
  ctx.fillStyle = rgba(color, alpha * rnd.range(0.75, 1.05));
  ribbon(ctx, pts, w, 0.85);
}

export interface StoneOpts {
  round?: number;
  /** 0 rough, 1 chiselled */
  dressed?: boolean;
  /** relief shadow strength on what is below */
  shadow?: number;
  ink?: number;
  lichen?: number;
  /** extra light (lintels, quoins catch more) */
  lit?: number;
  speck?: number;
}

/**
 * One stone as a painted wash: a drop shadow on the mortar to its lower right, two glazes, a bloom toward the
 * upper left, deeper pigment pooled on the lower right edge, granulation, a hint of lichen and a few broken ink
 * dashes along the bottom and right (the sun is upper left) — never a closed outline.
 */
export function paintStone(P: Paint, x: number, y: number, w: number, h: number, base: string, o: StoneOpts = {}): number[] {
  const { ctx, rnd } = P;
  const dressed = o.dressed === true;
  if (w < 2.4 || h < 2.4) {
    const t = rrPoly(x, y, Math.max(0.5, w), Math.max(0.5, h), 0.3, rnd, 0.1);
    fillPoly(ctx, t, base, 0.9);
    return t;
  }
  const r = o.round ?? Math.min(w, h) * (dressed ? 0.1 : 0.24);
  const poly = deform(rrPoly(x, y, w, h, r, rnd, dressed ? 0.5 : 0.9), rnd, 2, dressed ? 0.02 : 0.034);
  const sh = o.shadow ?? 1;
  // relief shadow on the mortar / stones below
  fillPoly(ctx, shift(poly, 0.55, 0.95), '#3E2E34', 0.2 * sh);
  fillPoly(ctx, shift(poly, 1.0, 1.7), '#3E2E34', 0.09 * sh);
  // the glazes
  fillPoly(ctx, poly, base, 0.9);
  fillPoly(ctx, deform(poly, rnd, 1, 0.03), mix(base, rnd.pick(['#F0E0C0', '#948A82', '#C9AE86', '#B6B7B2']), 0.5), 0.3);
  // bloom to the light, shadow sinking to the lower right (gradient fills of the stone's own outline: no clipping)
  const g = ctx.createLinearGradient(x, y, x + w * 0.65, y + h * 1.05);
  g.addColorStop(0, rgba(LIGHT_WASH, 0.22 + (o.lit ?? 0) * 0.3));
  g.addColorStop(0.45, rgba(LIGHT_WASH, 0));
  g.addColorStop(1, rgba(mix(base, SHADE_WASH, 0.7), 0.4));
  ctx.fillStyle = g;
  tracePoly(ctx, poly);
  ctx.fill();
  // pigment pooled under the lower edge, a thin pale rim catching the light at the top left
  const pg = ctx.createLinearGradient(0, y + h * 0.62, 0, y + h);
  pg.addColorStop(0, rgba(mix(base, SHADE_WASH, 0.6), 0));
  pg.addColorStop(1, rgba(mix(base, SHADE_WASH, 0.6), 0.26));
  ctx.fillStyle = pg;
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(LIGHT_WASH, 0.5 + (o.lit ?? 0) * 0.2);
  ribbon(ctx, [x + r * 0.9, y + 0.7, x + w * 0.5, y + 0.55, x + w - r * 1.3, y + 0.8], 0.55, 0.9);
  ribbon(ctx, [x + 0.7, y + h - r * 1.2, x + 0.6, y + h * 0.5, x + r * 0.8, y + 0.9], 0.45, 0.9);
  // granulation: grains of pigment and lifted paper, kept inside the stone
  const ns = Math.round(w * h * (o.speck ?? 0.3) * 0.45);
  const dk = rgba(mix(base, SHADE_WASH, 0.7), 0.3);
  const lt = 'rgba(251,246,234,0.3)';
  for (let i = 0; i < ns; i++) {
    ctx.fillStyle = rnd.chance(0.35) ? lt : dk;
    const sz = rnd.range(0.2, 0.5);
    ctx.fillRect(x + r * 0.5 + rnd.next() * (w - r), y + r * 0.5 + rnd.next() * (h - r), sz * 1.4, sz);
  }
  if ((o.lichen ?? 0) > 0 && rnd.chance(o.lichen!)) {
    const lc = rnd.pick(['#9BA454', '#C8C27C', '#7E9060', '#D6D2A8']);
    ctx.fillStyle = rgba(lc, 0.3);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x + w * rnd.range(0.25, 0.75), y + h * rnd.range(0.3, 0.7), w * rnd.range(0.06, 0.15), h * rnd.range(0.08, 0.18), rnd.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // broken ink on the shaded edges
  const ink = o.ink ?? 0.65;
  if (rnd.chance(ink) && w > 5 && h > 4) {
    const p = 0.5;
    const jx = () => rnd.range(-0.35, 0.35);
    edgeInk(P, [x + w * 0.62 + jx(), y + p, x + w - p + jx(), y + h * 0.28, x + w - p + jx(), y + h * 0.7, x + w - r * 0.7, y + h - p, x + w * 0.55 + jx(), y + h - p + jx() * 0.5, x + w * 0.3 + jx(), y + h - p, x + r * 0.9, y + h - p], 0.42, 0.5);
    if (rnd.chance(0.3)) edgeInk(P, [x + p, y + h * 0.75, x + p + jx(), y + h * 0.35, x + r * 0.9, y + p + 0.2, x + w * 0.35, y + p], 0.3, 0.22);
  }
  return poly;
}

/**
 * A hand-drawn, broken, tapering line: runs along a polyline in dashes of random length with small gaps, each
 * dash wobbling a little and tapering at both ends (so edges never read as a solid vector stroke).
 */
export function brokenLine(P: Paint, pts: number[], w: number, color: string, alpha: number, o: { seg?: [number, number]; gap?: [number, number]; wob?: number; skip?: number } = {}): void {
  const { ctx, rnd } = P;
  const [s0, s1] = o.seg ?? [6, 20];
  const [g0, g1] = o.gap ?? [0.6, 3];
  const wob = o.wob ?? 0.25;
  // cumulative length
  const L: number[] = [0];
  for (let i = 2; i < pts.length; i += 2) L.push(L[L.length - 1]! + Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!));
  const total = L[L.length - 1]!;
  const at = (d: number): [number, number] => {
    let k = 1;
    while (k < L.length - 1 && L[k]! < d) k++;
    const t = (d - L[k - 1]!) / Math.max(1e-6, L[k]! - L[k - 1]!);
    return [lerp(pts[2 * (k - 1)]!, pts[2 * k]!, t), lerp(pts[2 * (k - 1) + 1]!, pts[2 * k + 1]!, t)];
  };
  let d = rnd.range(0, g1);
  while (d < total) {
    const len = Math.min(total - d, rnd.range(s0, s1));
    if (!rnd.chance(o.skip ?? 0)) {
      const n = Math.max(3, Math.round(len / 2));
      const seg: number[] = [];
      for (let k = 0; k <= n; k++) {
        const [x, y] = at(d + (len * k) / n);
        seg.push(x + rnd.range(-wob, wob) * 0.6, y + rnd.range(-wob, wob) * 0.6);
      }
      ctx.fillStyle = rgba(color, alpha * rnd.range(0.6, 1.1));
      ribbon(ctx, seg, w * rnd.range(0.75, 1.25), 0.9);
    }
    d += len + rnd.range(g0, g1);
  }
}

/** flecks of paper showing through along a lit edge (path points flat) */
export function paperLift(P: Paint, pts: number[], alpha = 0.4, density = 0.8): void {
  const { ctx, rnd } = P;
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2]!;
    const y0 = pts[i - 1]!;
    const x1 = pts[i]!;
    const y1 = pts[i + 1]!;
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) * density);
    for (let k = 0; k < n; k++) {
      const t = rnd.next();
      ctx.fillStyle = rgba('#FBF6EA', alpha * rnd.range(0.4, 1));
      ctx.beginPath();
      ctx.ellipse(lerp(x0, x1, t) + rnd.range(-0.25, 0.25), lerp(y0, y1, t) + rnd.range(-0.25, 0.25), rnd.range(0.25, 0.9), rnd.range(0.14, 0.36), Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** a polygon with a wandering outline: dense points along its sides, each nudged */
export function wander(poly: number[], rnd: Rand, step = 3, amp = 0.25): number[] {
  const out: number[] = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[2 * i]!;
    const y0 = poly[2 * i + 1]!;
    const x1 = poly[2 * j]!;
    const y1 = poly[2 * j + 1]!;
    const m = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      out.push(lerp(x0, x1, t) + rnd.range(-amp, amp), lerp(y0, y1, t) + rnd.range(-amp, amp));
    }
  }
  return out;
}
