/**
 * Watercolor painting helpers for the boats, rowers and oars. Everything runs at sprite build time (never per
 * frame). Coordinates are in whatever space the caller set on the context (boat-local units with a q scale), so
 * widths and radii are in those units.
 *
 * The house style is the one in src/scene/watercolor.ts: a form is a handful of low-alpha, independently
 * re-deformed glazes (so the edge builds up irregularly), a wet-in-wet bloom toward the light, a shadow wash on
 * the far side, pigment pooled just inside the edge, granulation, and a broken sepia contour whose weight varies
 * with the light (heavier away from it, tapering in and out of gaps).
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, hexToRgb, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';

export type Pt = [number, number];

export const flat = (pts: Pt[]): number[] => {
  const o: number[] = [];
  for (const p of pts) o.push(p[0], p[1]);
  return o;
};

/** Catmull-Rom resample of a point list into a flat polygon */
export function smoothPoly(pts: Pt[], seg = 6, closed = true): number[] {
  const n = pts.length;
  const out: number[] = [];
  const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      );
    }
  }
  if (!closed) out.push(pts[n - 1]![0], pts[n - 1]![1]);
  return out;
}

/** blend two #rrggbb colours into a #rrggbb colour */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const h = (i: number) => Math.round(A[i]! + (B[i]! - A[i]!) * t).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}

/** light comes from the upper left: this is the unit vector pointing TO the light */
export const TO_LIGHT: Pt = [-0.58, -0.81];

export const PAPER = '#FBF6EA';
export const SEPIA = '#33261C';

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}
export function bounds(poly: number[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]!);
    x1 = Math.max(x1, poly[i]!);
    y0 = Math.min(y0, poly[i + 1]!);
    y1 = Math.max(y1, poly[i + 1]!);
  }
  return { x0, y0, x1, y1, w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** resample a polyline (flat) at an even arc-length step; returns points and the cumulative length */
function resample(pts: number[], step: number, closed: boolean): { p: number[]; len: number } {
  const src = pts.slice();
  if (closed) src.push(pts[0]!, pts[1]!);
  const out: number[] = [src[0]!, src[1]!];
  let acc = 0;
  let total = 0;
  for (let i = 2; i < src.length; i += 2) {
    let x0 = src[i - 2]!;
    let y0 = src[i - 1]!;
    const x1 = src[i]!;
    const y1 = src[i + 1]!;
    let seg = Math.hypot(x1 - x0, y1 - y0);
    total += seg;
    while (acc + seg >= step) {
      const f = (step - acc) / seg;
      x0 += (x1 - x0) * f;
      y0 += (y1 - y0) * f;
      out.push(x0, y0);
      seg = Math.hypot(x1 - x0, y1 - y0);
      acc = 0;
    }
    acc += seg;
  }
  return { p: out, len: total };
}

/** a tapered brush ribbon along a polyline (points [x,y,...]); width profile = taper * variation */
export function ribbon(ctx: CanvasRenderingContext2D, pts: number[], w: number, taper = 0.8, wob = 0): void {
  const n = pts.length / 2;
  if (n < 2) return;
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = pts[2 * b]! - pts[2 * a]!;
    let dy = pts[2 * b + 1]! - pts[2 * a + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const t = n === 1 ? 0.5 : i / (n - 1);
    const prof = taper > 0 ? Math.pow(Math.sin(Math.PI * t), 0.55) * taper + (1 - taper) : 1;
    const hw = (w / 2) * Math.max(0.12, prof) * (1 + wob * Math.sin(i * 1.7 + w * 9));
    L.push(pts[2 * i]! - dy * hw, pts[2 * i + 1]! + dx * hw);
    R.push(pts[2 * i]! + dy * hw, pts[2 * i + 1]! - dx * hw);
  }
  ctx.beginPath();
  ctx.moveTo(L[0]!, L[1]!);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i]!, L[i + 1]!);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i]!, R[i + 1]!);
  ctx.closePath();
  ctx.fill();
}

/** one brush stroke between points (Catmull-Rom smoothed), tapered at both ends */
export function brush(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, color: string, alpha: number, taper = 0.85): void {
  if (pts.length < 2) return;
  const sm = pts.length > 2 ? smoothPoly(pts, 4, false) : flat(pts);
  const rs = resample(sm, Math.max(0.25, w * 0.6), false).p;
  ctx.fillStyle = rgba(color, alpha);
  ribbon(ctx, rs, w, taper);
}

/**
 * Dry-brush streaks following a curve y = f(x): thin tapered strokes of varied length and alpha, with small
 * wanders, so wood grain follows the form instead of being ruled lines.
 */
export function streaks(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  f: (x: number, r: number) => number,
  xa: number,
  xb: number,
  n: number,
  o: { color: string; alpha: number; w?: number; len?: [number, number]; r?: [number, number]; wob?: number },
): void {
  const [l0, l1] = o.len ?? [10, 40];
  const [r0, r1] = o.r ?? [0.1, 0.9];
  for (let i = 0; i < n; i++) {
    const r = rnd.range(r0, r1);
    const len = rnd.range(l0, l1);
    const xs = rnd.range(xa, Math.max(xa + 1, xb - len));
    const w = (o.w ?? 0.4) * rnd.range(0.55, 1.3);
    const wob = (o.wob ?? 0.25) * rnd.gauss();
    const pts: number[] = [];
    const steps = Math.max(3, Math.round(len / 2.2));
    for (let k = 0; k <= steps; k++) {
      const x = xs + (len * k) / steps;
      pts.push(x, f(x, r) + wob * Math.sin(k * 0.9 + i));
    }
    ctx.fillStyle = rgba(o.color, o.alpha * rnd.range(0.55, 1.1));
    ribbon(ctx, pts, w, 0.95);
  }
}

/**
 * Broken ink contour made of tapered pen dashes, each fading in and out, with the weight varying with the
 * light: heavier on the side facing away from it. `center` supplies the outward direction for closed shapes.
 */
export function inkDashes(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  rnd: Rand,
  o: {
    color?: string;
    alpha?: number;
    w?: number;
    dash?: [number, number];
    gap?: [number, number];
    closed?: boolean;
    center?: Pt;
    bias?: number;
    /** the sprite is painted in a mirrored rig: the light's x is flipped */
    flip?: boolean;
  } = {},
): void {
  const closed = o.closed !== false;
  const w = o.w ?? 0.5;
  const [d0, d1] = o.dash ?? [5, 15];
  const [g0, g1] = o.gap ?? [0.5, 2.2];
  const step = Math.max(0.25, w * 0.7);
  const rs = resample(pts, step, closed);
  const P = rs.p;
  const n = P.length / 2;
  const cx = o.center?.[0];
  const cy = o.center?.[1];
  const bias = o.bias ?? 0.55;
  const col = o.color ?? SEPIA;
  let i = 0;
  // start inside a random point of a gap so closed shapes are not all aligned
  i += Math.floor(rnd.range(0, 2) / step);
  while (i < n - 2) {
    const len = Math.round(rnd.range(d0, d1) / step);
    const j = Math.min(n - 1, i + Math.max(3, len));
    const seg: number[] = [];
    let wsum = 0;
    for (let k = i; k <= j; k++) seg.push(P[2 * k]!, P[2 * k + 1]!);
    // outward normal weight at the dash middle
    if (cx !== undefined && cy !== undefined) {
      const m = (i + j) >> 1;
      let nx = P[2 * m]! - cx;
      let ny = P[2 * m + 1]! - cy;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      wsum = -(nx * (o.flip ? -TO_LIGHT[0] : TO_LIGHT[0]) + ny * TO_LIGHT[1]); // +1 facing away from the light
    }
    const wt = 1 + bias * wsum;
    ctx.fillStyle = rgba(col, clamp((o.alpha ?? 0.6) * rnd.range(0.7, 1.1) * (0.85 + 0.25 * wsum), 0.05, 1));
    ribbon(ctx, seg, w * wt * rnd.range(0.8, 1.2), 0.9);
    i = j + Math.max(1, Math.round(rnd.range(g0, g1) / step));
  }
}

/** a soft-edged wash: n progressively smaller re-deformed copies of a polygon, so the edge feathers out like wet pigment */
export function feather(ctx: CanvasRenderingContext2D, poly: number[], color: string, alpha: number, rnd: Rand, n = 5, s0 = 1, s1 = 0.45, amp = 0.08): void {
  const b = bounds(poly);
  ctx.fillStyle = rgba(color, alpha / Math.max(1, n * 0.55));
  for (let k = 0; k < n; k++) {
    const s = s0 + (s1 - s0) * (n === 1 ? 0 : k / (n - 1));
    const p = new Array<number>(poly.length);
    for (let i = 0; i < poly.length; i += 2) {
      p[i] = b.cx + (poly[i]! - b.cx) * s;
      p[i + 1] = b.cy + (poly[i + 1]! - b.cy) * s;
    }
    tracePoly(ctx, deform(p, rnd, 3, amp));
    ctx.fill();
  }
}

/** grains of pigment (dark) and lifted paper (light) sprinkled over a region; clip first */
export function speckle(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  dark: string,
  darkA: number,
  light: string | null = PAPER,
  lightA = 0.3,
  r = 0.22,
): void {
  for (let i = 0; i < n; i++) {
    const px = x + rnd.next() * w;
    const py = y + rnd.next() * h;
    const rr = r * rnd.range(0.4, 1.3);
    const isLight = light !== null && rnd.chance(0.35);
    ctx.fillStyle = isLight ? rgba(light!, lightA * rnd.range(0.5, 1)) : rgba(dark, darkA * rnd.range(0.5, 1));
    ctx.beginPath();
    ctx.ellipse(px, py, rr * rnd.range(0.8, 1.6), rr, rnd.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface FormOpts {
  light?: string;
  shade?: string;
  /** overall coverage 0…1 (1 = nearly opaque, painted over something) */
  alpha?: number;
  layers?: number;
  amp?: number;
  lightA?: number;
  shadeA?: number;
  pool?: number;
  ink?: string;
  inkA?: number;
  inkW?: number;
  /** 0 = unbroken, 1 = mostly gaps */
  ink0?: boolean;
  speck?: number;
  /** wood grain streaks along x (count) */
  grain?: number;
  grainColor?: string;
  dash?: [number, number];
  /** painted in the mirrored rig (rower and oars): the light comes from the other x */
  flip?: boolean;
}

/**
 * A fully painted shape: glazes, a wet-in-wet bloom toward the light, a shadow wash on the far side, pooled
 * edge pigment, grain and speckle, and a broken contour. Draws unclipped glazes (so the edge wanders) and
 * clips the interior work.
 */
export function paintForm(ctx: CanvasRenderingContext2D, poly: number[], base: string, rnd: Rand, o: FormOpts = {}): void {
  const b = bounds(poly);
  const u = Math.max(0.45, Math.min(b.w, b.h) / 12);
  const light = o.light ?? mix(base, '#FFF3D6', 0.6);
  const shade = o.shade ?? mix(base, '#2A2038', 0.55);
  const a = o.alpha ?? 0.92;
  const LX = o.flip ? -TO_LIGHT[0] : TO_LIGHT[0];
  const LY = TO_LIGHT[1];
  const layers = o.layers ?? 3;
  const amp = o.amp ?? 0.03;
  ctx.save();
  // 1. the glazes
  ctx.fillStyle = rgba(base, 0.7 * a);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(base, (0.32 * a) / Math.max(1, layers * 0.5));
  for (let i = 0; i < layers; i++) {
    tracePoly(ctx, deform(poly, rnd, 2, amp));
    ctx.fill();
  }
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // 2. wet-in-wet bloom: lighter pigment lifted toward the light, deeper pigment sunk the other way
  const toward = (s: number, dx: number, dy: number) => {
    const p = new Array<number>(poly.length);
    for (let i = 0; i < poly.length; i += 2) {
      p[i] = b.cx + (poly[i]! - b.cx) * s + dx * b.w;
      p[i + 1] = b.cy + (poly[i + 1]! - b.cy) * s + dy * b.h;
    }
    return p;
  };
  feather(ctx, toward(1.0, LX * 0.2, LY * 0.2), light, (o.lightA ?? 0.26) * 1.7, rnd, 6, 0.95, 0.4, 0.1);
  feather(ctx, toward(1.0, -LX * 0.3, -LY * 0.3), shade, (o.shadeA ?? 0.22) * 1.6, rnd, 6, 0.9, 0.45, 0.1);
  // 3. a soft directional glaze across the whole form
  const g = ctx.createLinearGradient(b.cx + LX * b.w * 0.6, b.cy + LY * b.h * 0.6, b.cx - LX * b.w * 0.6, b.cy - LY * b.h * 0.6);
  g.addColorStop(0, rgba(light, 0.22));
  g.addColorStop(0.5, rgba(light, 0));
  g.addColorStop(0.75, rgba(shade, 0.08));
  g.addColorStop(1, rgba(shade, 0.2));
  ctx.fillStyle = g;
  ctx.fillRect(b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2);
  // 4. pigment pooled just inside the edge
  const pool = o.pool ?? 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(shade, 0.12 * pool);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (0.5 + i * 0.55) * u * 1.4;
    tracePoly(ctx, deform(poly, rnd, 1, 0.015));
    ctx.stroke();
  }
  // 5. wood grain / speckle
  if (o.grain) {
    streaks(ctx, rnd, (_x, r) => b.y0 + b.h * r, b.x0, b.x1, o.grain, {
      color: o.grainColor ?? shade,
      alpha: 0.3,
      w: Math.max(0.22, 0.045 * b.h),
      len: [b.w * 0.25, b.w * 0.8],
    });
  }
  const sp = o.speck ?? Math.round(b.w * b.h * 0.6);
  speckle(ctx, rnd, b.x0, b.y0, b.w, b.h, sp, shade, 0.2, PAPER, 0.28, Math.max(0.1, 0.017 * Math.min(b.w, b.h)) + 0.06);
  ctx.restore();
  // 6. the contour
  if (!o.ink0) {
    inkDashes(ctx, poly, rnd, {
      color: o.ink ?? SEPIA,
      alpha: o.inkA ?? 0.62,
      w: o.inkW ?? 0.5,
      dash: o.dash ?? [4 * u, 12 * u],
      gap: [0.5 * u, 2.2 * u],
      center: [b.cx, b.cy],
      flip: o.flip,
    });
  }
  ctx.restore();
}

/**
 * Paper tooth over a finished sprite: fine and coarse noise modulate alpha and value, like pigment settling in
 * the grain of the paper. `q` is the sprite's pixels per unit, so the coarse grain keeps the same unit size.
 */
export function granulate(cv: HTMLCanvasElement, seed: number, q: number, amt = 1, rect?: [number, number, number, number]): void {
  const ctx = cv.getContext('2d')!;
  // optional pixel rect [x, y, w, h] so big sprites with a small painted area stay cheap
  const [rx, ry, W, H] = rect ?? [0, 0, cv.width, cv.height];
  const img = ctx.getImageData(rx, ry, W, H);
  const d = img.data;
  const cell = Math.max(1, Math.round(q * 0.45));
  const hsh = (x: number, y: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < H; y++) {
    const cy = Math.floor(y / cell) + 3;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const al = d[i + 3]!;
      if (al === 0) continue;
      const lo = hsh(Math.floor(x / cell) + 7, cy);
      const hi = hsh(x, y);
      const nn = lo * 0.55 + hi * 0.45;
      const gr = nn - 0.5;
      d[i + 3] = clamp(al * (1 + gr * 0.42 * amt) - (nn < 0.2 ? 8 * amt : 0), 0, 255);
      const sh = 1 - gr * 0.12 * amt;
      d[i] = clamp(d[i]! * sh, 0, 255);
      d[i + 1] = clamp(d[i + 1]! * sh, 0, 255);
      d[i + 2] = clamp(d[i + 2]! * sh, 0, 255);
    }
  }
  ctx.putImageData(img, rx, ry);
}

/** a fresh sprite canvas + context with a unit transform (q px per unit, origin at (ox, oy) units) */
export function spriteCtx(wUnits: number, hUnits: number, q: number, ox: number, oy: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(wUnits * q, hUnits * q);
  const ctx = cv.getContext('2d', { willReadFrequently: false })!;
  ctx.setTransform(q, 0, 0, q, ox * q, oy * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { cv, ctx };
}
