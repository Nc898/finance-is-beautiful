/**
 * Small painting helpers shared by the shop's parts (world units; everything here is made once per size, never per
 * frame): wobbly pen lines, washes built from several deformed layers, mottled wet-in-wet fields, planks and the
 * paper's grain. The technique is the sister demos': a wash is many low-alpha layers of independently deformed
 * copies of one shape, so the edge builds up irregularly and overlaps deepen like pigment.
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { LAMPS } from './geom';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { applyTooth, blobPoly, paperTooth } from '../../river/scene/paint';

export { mix, ribbon, blobPoly };

export const INK = '#3E3236';
export const SHADE = '#4A3A52';
export const LIGHT = '#FFF1CF';

/** a line from a to b as a flat polyline with a hand's wander */
export function wander(x0: number, y0: number, x1: number, y1: number, rnd: Rand, amp = 0.35, seg = 5): number[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.round(len / seg));
  const nx = -(y1 - y0) / (len || 1);
  const ny = (x1 - x0) / (len || 1);
  const out: number[] = [];
  let off = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    off = off * 0.6 + rnd.gauss() * amp * 0.6;
    const e = i === 0 || i === n ? 0.3 : 1;
    out.push(x0 + (x1 - x0) * t + nx * off * e, y0 + (y1 - y0) * t + ny * off * e);
  }
  return out;
}

/** a pen line: a dry brush's, thin, swelling and thinning, lifting off the paper here and there (it is stated where the
 *  eye goes; the gaps let the washes carry the form) */
export function pen(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, col: string, a: number, rnd: Rand, amp = 0.35): void {
  const pts = wander(x0, y0, x1, y1, rnd, amp);
  const n = pts.length / 2;
  let i = 0;
  while (i < n - 1) {
    const run = Math.max(2, Math.round(rnd.range(3, 9)));
    const j = Math.min(n - 1, i + run);
    if (!rnd.chance(n > 6 ? 0.22 : 0.05)) {
      ctx.fillStyle = rgba(col, a * rnd.range(0.55, 1.05));
      ribbon(ctx, pts.slice(i * 2, j * 2 + 2), w * rnd.range(0.65, 1.3), 0.75);
    }
    i = j;
  }
}

/** a pen line along a polyline of points */
export function penPath(ctx: CanvasRenderingContext2D, pts: number[], w: number, col: string, a: number, rnd: Rand, amp = 0.25): void {
  for (let i = 0; i + 3 < pts.length; i += 2) pen(ctx, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, w, col, a, rnd, amp);
}

/** a slightly irregular rectangle as a polygon */
export function rectPoly(x0: number, y0: number, x1: number, y1: number, rnd: Rand, jit = 0.4): number[] {
  const j = () => rnd.range(-jit, jit);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return [x0 + j(), y0 + j(), mx + j(), y0 + j() * 0.6, x1 + j(), y0 + j(), x1 + j() * 0.6, my + j(), x1 + j(), y1 + j(), mx + j(), y1 + j() * 0.6, x0 + j(), y1 + j(), x0 + j() * 0.6, my + j()];
}

/** a wash laid in layers (each layer re-deformed, so the edge builds up irregularly) */
export function wash(ctx: CanvasRenderingContext2D, poly: number[], hex: string, a: number, rnd: Rand, layers = 3, amp = 0.035): void {
  // the deformation scales with each edge's length, so a long board would wander far: keep it to a hand's wobble
  let mx0 = Infinity;
  let mx1 = -Infinity;
  let my0 = Infinity;
  let my1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    mx0 = Math.min(mx0, poly[i]!);
    mx1 = Math.max(mx1, poly[i]!);
    my0 = Math.min(my0, poly[i + 1]!);
    my1 = Math.max(my1, poly[i + 1]!);
  }
  const ext = Math.max(1, mx1 - mx0, my1 - my0);
  amp *= Math.min(1, 90 / ext);
  // variegation: each layer drifts a little in hue and value (wet in wet), so the wash is never one flat colour
  const drift = ['#C8A070', '#7C92A4', '#B8806A', '#8E9A6A'];
  for (let i = 0; i < layers; i++) {
    const col = i === 0 ? hex : mix(hex, rnd.pick(drift), rnd.range(0.02, 0.14));
    ctx.fillStyle = rgba(col, a / (layers * 0.62));
    tracePoly(ctx, deform(poly, rnd, 2, amp));
    ctx.fill();
  }
  // the pigment that pooled where the wash dried: a thin darker rim, broken (only on edges long enough to read)
  if (ext > 5 && a > 0.3) {
    ctx.strokeStyle = rgba(mix(hex, SHADE, 0.3), Math.min(0.3, a * 0.2));
    ctx.lineWidth = 0.4 + Math.min(0.5, ext * 0.004);
    const rim = deform(poly, rnd, 2, amp * 0.8);
    const n = rim.length / 2;
    ctx.beginPath();
    let k = 0;
    while (k < n) {
      const run = rnd.int(2, 7);
      if (rnd.chance(0.65)) {
        ctx.moveTo(rim[(k % n) * 2]!, rim[(k % n) * 2 + 1]!);
        for (let j = 1; j <= run; j++) ctx.lineTo(rim[((k + j) % n) * 2]!, rim[((k + j) % n) * 2 + 1]!);
      }
      k += run + rnd.int(1, 3);
    }
    ctx.stroke();
  }
}

/** a wash with a darker pooled edge (the pigment that dried at the rim) */
export function washEdge(ctx: CanvasRenderingContext2D, poly: number[], hex: string, a: number, rnd: Rand, layers = 3, rim = 0.22): void {
  wash(ctx, poly, hex, a, rnd, layers);
  ctx.strokeStyle = rgba(mix(hex, SHADE, 0.35), a * rim);
  ctx.lineWidth = 0.55;
  tracePoly(ctx, deform(poly, rnd, 2, 0.03));
  ctx.stroke();
}

/** wet in wet: overlapping soft blobs of nearby colours across a rect (the caller clips if needed) */
export function mottle(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, cols: readonly string[], seed: number, a: number, cell = 60, stretch = 1): void {
  const rnd = new Rand(seed);
  const n = Math.ceil((((x1 - x0) * (y1 - y0)) / (cell * cell)) * 1.7);
  for (let i = 0; i < n; i++) {
    const rx = cell * rnd.range(0.55, 1.5) * stretch;
    const ry = cell * rnd.range(0.4, 1.1);
    const p = deform(blobPoly(rnd.range(x0, x1), rnd.range(y0, y1), rx, ry, rnd, 12, 0.25), rnd, 2, 0.12);
    ctx.fillStyle = rgba(rnd.pick(cols), a * rnd.range(0.6, 1.2));
    tracePoly(ctx, p);
    ctx.fill();
  }
}

/** the paper's grain over a region of the current clip: the wash thins on the peaks, pigment settles in the valleys */
export function grain(ctx: CanvasRenderingContext2D, pigment: string, x: number, y: number, w: number, h: number, lift: number, gran: number, seed = 517): void {
  const q = ctx.getTransform().a;
  applyTooth(ctx, paperTooth(pigment, 192, seed), x, y, w, h, Math.max(1, q * 1.1), lift, gran);
}

/** an offscreen picture of a region in world units: the transform puts world (box.x, box.y) at its corner */
export function spriteCtx(box: { x: number; y: number; w: number; h: number }, q: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(Math.ceil(box.w * q), Math.ceil(box.h * q));
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -box.x * q, -box.y * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { cv, ctx };
}

/** a board of wood: a wash of its colour, long grain lines, a knot now and then, a lit top edge and a dark lower one */
export function plank(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base: string, rnd: Rand, o: { grain?: number; edge?: number; knots?: number; vertical?: boolean } = {}): void {
  const w = x1 - x0;
  const h = y1 - y0;
  const vert = !!o.vertical;
  const poly = rectPoly(x0, y0, x1, y1, rnd, 0.3);
  const tone = mix(base, rnd.chance(0.5) ? '#7A4A2A' : '#B07C48', rnd.range(0.04, 0.22));
  wash(ctx, poly, tone, 0.8, rnd, 2, 0.012);
  const len = vert ? h : w;
  const thick = vert ? w : h;
  // the colour drifts along the board in long patches, wet into wet, and the pigment pools along its lower (or right)
  // edge where the wash dried
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let i = 0; i < Math.max(1, Math.round(len / 34)); i++) {
    const t = rnd.next();
    const pl = len * rnd.range(0.12, 0.3);
    const cx = vert ? x0 + w / 2 : x0 + t * w;
    const cy = vert ? y0 + t * h : y0 + h / 2;
    ctx.fillStyle = rgba(mix(tone, rnd.pick(['#C89058', '#4A2E18', '#8A7A60', '#A06A40']), rnd.range(0.3, 0.55)), rnd.range(0.14, 0.28));
    tracePoly(ctx, deform(blobPoly(cx, cy, vert ? thick * 0.7 : pl, vert ? pl : thick * 0.7, rnd, 10, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
  if (thick > 3) {
    const pg = vert ? ctx.createLinearGradient(x0, 0, x1, 0) : ctx.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0, rgba(mix(tone, '#2A160A', 0.5), 0));
    pg.addColorStop(0.55, rgba(mix(tone, '#2A160A', 0.5), 0));
    pg.addColorStop(1, rgba(mix(tone, '#2A160A', 0.5), 0.3));
    ctx.fillStyle = pg;
    ctx.fillRect(x0, y0, w, h);
  }
  ctx.restore();
  const gl = Math.max(3, Math.round(thick * 0.5 * (o.grain ?? 1)));
  for (let i = 0; i < gl; i++) {
    const off = rnd.range(0.1, 0.9) * thick;
    const a0 = rnd.range(0, len * 0.3);
    const a1 = rnd.range(len * 0.5, len);
    const bow = rnd.range(-0.5, 0.5);
    const pts: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = a0 + (a1 - a0) * (k / 6);
      const b = off + bow * Math.sin((k / 6) * Math.PI);
      pts.push(vert ? x0 + b : x0 + t, vert ? y0 + t : y0 + b);
    }
    ctx.fillStyle = rgba(mix(tone, '#3A2012', 0.55), rnd.range(0.07, 0.2));
    ribbon(ctx, pts, rnd.range(0.2, 0.55), 0.9);
  }
  const kn = o.knots ?? 0;
  for (let i = 0; i < kn; i++) {
    const kx = rnd.range(x0 + w * 0.15, x1 - w * 0.15);
    const ky = rnd.range(y0 + h * 0.25, y1 - h * 0.25);
    const r = Math.min(w, h) * rnd.range(0.12, 0.3);
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(mix(tone, '#2A160C', 0.6), 0.22 - k * 0.05);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * (1 + k * 0.7) * (vert ? 0.6 : 1.7), r * (1 + k * 0.7) * (vert ? 1.7 : 0.6), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = rgba('#2A160C', 0.28);
    ctx.beginPath();
    ctx.ellipse(kx, ky, r * 0.55 * (vert ? 0.6 : 1.5), r * 0.55 * (vert ? 1.5 : 0.6), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // lit top edge, dark lower edge (light upper left)
  const e = o.edge ?? 1;
  ctx.fillStyle = rgba(LIGHT, 0.3 * e);
  ribbon(ctx, vert ? [x0 + 0.5, y0 + 1, x0 + 0.5, y1 - 1] : [x0 + 1, y0 + 0.5, x1 - 1, y0 + 0.5], 0.7, 0.9);
  pen(ctx, vert ? x1 : x0, vert ? y0 : y1, x1, y1, 0.5, INK, 0.38 * e, rnd, 0.25);
}

/* ------------------------------------------------------------------ surfaces built as the sisters' are */

/** a broad, mottled colour field (wet in wet: the colours drift into each other), as housePaint.ts's washField */
export function washField(seed: number, cols: readonly string[], fx = 0.011, fy = 0.016): (x: number, y: number) => string {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 3);
  return (x, y) => {
    const a = n1(x * fx, y * fy);
    const b = n2(x * fx * 2.7, y * fy * 2.5);
    const t = clamp(a * 0.75 + b * 0.25, 0, 0.999) * (cols.length - 1);
    const i = Math.floor(t);
    return mix(cols[i]!, cols[i + 1]!, t - i);
  };
}

/** the light falling at a point of the room: the window's cool key from the upper left, and the warm pools under the
 *  two lamps (0 … 1 each) */
export function lightAt(x: number, y: number): { cool: number; warm: number } {
  const cool = clamp(1 - Math.hypot((x - 130) / 520, (y - 230) / 560), 0, 1) ** 1.3;
  let warm = 0;
  for (const L of LAMPS) warm = Math.max(warm, clamp(1 - Math.hypot((x - L.x) / 270, (y - (L.shadeY + 110)) / 330), 0, 1));
  return { cool, warm };
}

/** a colour nudged toward the light that falls there (cool by the window, amber under the lamps): only the hue; the
 *  values are the room's glaze's (light.ts), laid over everything once it is painted */
export function lit(col: string, x: number, y: number): string {
  const { cool, warm } = lightAt(x, y);
  let c = col;
  if (cool > 0) c = mix(c, '#A9BDD0', cool * 0.14);
  if (warm > 0) c = mix(c, '#F4C67C', warm * 0.12);
  return c;
}

/** a surface built from many small, varied, overlapping washes (never one fill): each patch takes its colour from the
 *  field at its place. The caller clips. */
export function patchWash(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, field: (x: number, y: number) => string, rnd: Rand, cell = 18, a = 0.5, passes = 2): void {
  for (let p = 0; p < passes; p++) {
    for (let y = y0 - cell * rnd.range(0, 0.8); y < y1; y += cell * rnd.range(0.7, 1.1)) {
      for (let x = x0 - cell * rnd.range(0, 0.8); x < x1; x += cell * rnd.range(0.7, 1.1)) {
        const w = cell * rnd.range(0.9, 1.7);
        const h = cell * rnd.range(0.8, 1.4);
        const poly = rectPoly(x, y, x + w, y + h, rnd, cell * 0.14);
        ctx.fillStyle = rgba(field(x + w / 2 + rnd.range(-3, 3), y + h / 2), a * rnd.range(0.7, 1.15) * (p === 0 ? 1 : 0.7));
        tracePoly(ctx, deform(poly, rnd, 2, 0.07));
        ctx.fill();
      }
    }
  }
}

/** a plane washed in its colour with the pigment pooling toward one edge (farm.ts's face) */
export function face(ctx: CanvasRenderingContext2D, rnd: Rand, pts: number[], col: string, a: number, pool: string, poolA: number, dir: [number, number]): void {
  ctx.fillStyle = rgba(col, a);
  tracePoly(ctx, deform(pts, rnd, 1, 0.012));
  ctx.fill();
  let cx = 0;
  let cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    cx += pts[i]!;
    cy += pts[i + 1]!;
  }
  cx /= n;
  cy /= n;
  let r = 0;
  for (let i = 0; i < pts.length; i += 2) r = Math.max(r, Math.hypot(pts[i]! - cx, pts[i + 1]! - cy));
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  const g = ctx.createLinearGradient(cx - dir[0] * r, cy - dir[1] * r, cx + dir[0] * r, cy + dir[1] * r);
  g.addColorStop(0, rgba(pool, 0));
  g.addColorStop(1, rgba(pool, poolA));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** a rectangle stated in ink: four broken lines of varying weight */
export function outline(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rnd: Rand, a = 0.55, w = 0.7): void {
  pen(ctx, x0, y0, x1, y0, w, INK, a, rnd, 0.3);
  pen(ctx, x0, y0, x0, y1, w, INK, a, rnd, 0.3);
  pen(ctx, x1, y0, x1, y1, w * 1.15, INK, a * 1.1, rnd, 0.3);
  pen(ctx, x0, y1, x1, y1, w * 1.15, INK, a * 1.1, rnd, 0.3);
}
