/**
 * Small ink-and-wash painting helpers shared by the river's static and sprite art. All coordinates are in
 * whatever space the caller has set on the context (usually world units with a scale transform), so line
 * widths are in those units too.
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';

export type Pt = [number, number];

/** flat [x,y,...] from points */
export const flat = (pts: Pt[]): number[] => {
  const o: number[] = [];
  for (const p of pts) o.push(p[0], p[1]);
  return o;
};

/** resample a closed or open point list with a Catmull-Rom spline into a flat polygon */
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

/** Layered watercolor wash of a polygon: n re-deformed copies at low alpha, so the edge builds up irregularly. */
export function wash(
  ctx: CanvasRenderingContext2D,
  poly: number[],
  color: string,
  alpha: number,
  rnd: Rand,
  n = 4,
  amp = 0.05,
  levels = 2,
): void {
  ctx.fillStyle = rgba(color, alpha);
  for (let i = 0; i < n; i++) {
    tracePoly(ctx, deform(poly, rnd, levels, amp));
    ctx.fill();
  }
}

/** Broken ink contour (dry pen): a dashed stroke with a slightly wandering line */
export function inkLine(
  ctx: CanvasRenderingContext2D,
  poly: number[],
  u: number,
  opts: { color?: string; alpha?: number; width?: number; dash?: number[]; closed?: boolean } = {},
): void {
  ctx.save();
  ctx.setLineDash((opts.dash ?? [14, 2.5, 6, 2]).map((d) => d * u));
  ctx.strokeStyle = rgba(opts.color ?? '#2F2A22', opts.alpha ?? 0.6);
  ctx.lineWidth = (opts.width ?? 0.5) * u;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(poly[0]!, poly[1]!);
  for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i]!, poly[i + 1]!);
  if (opts.closed !== false) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * A fully painted shape: wash layers, directional shading (lit from the upper left), edge darkening and a
 * broken ink contour. `bounds` is used for the shading gradient.
 */
export function paintShape(
  ctx: CanvasRenderingContext2D,
  poly: number[],
  base: string,
  rnd: Rand,
  o: {
    shade?: string;
    light?: string;
    ink?: string;
    inkAlpha?: number;
    inkW?: number;
    layers?: number;
    amp?: number;
    alpha?: number;
    dash?: number[];
  } = {},
): void {
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
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const u = Math.max(0.5, Math.min(w, h) / 14);
  const layers = o.layers ?? 3;
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // wash
  ctx.fillStyle = rgba(base, (o.alpha ?? 0.55) / Math.max(1, layers * 0.55));
  for (let i = 0; i < layers; i++) {
    tracePoly(ctx, deform(poly, rnd, 2, o.amp ?? 0.025));
    ctx.fill();
  }
  ctx.fillStyle = rgba(base, 0.5);
  tracePoly(ctx, poly);
  ctx.fill();
  // light from the upper left, shade to the lower right
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(o.light ?? '#FFF6DC', 0.34));
  g.addColorStop(0.45, rgba(o.light ?? '#FFF6DC', 0));
  g.addColorStop(0.7, rgba(o.shade ?? '#3A2A20', 0.1));
  g.addColorStop(1, rgba(o.shade ?? '#3A2A20', 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
  // pooled pigment at the edge
  ctx.strokeStyle = rgba(o.shade ?? '#3A2A20', 0.2);
  ctx.lineWidth = 1.6 * u;
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.restore();
  inkLine(ctx, poly, u, { color: o.ink ?? '#2F2A22', alpha: o.inkAlpha ?? 0.6, width: o.inkW ?? 0.55, dash: o.dash });
}

/** grain strokes along a direction inside a clip: thin warm lines like wood grain */
export function grain(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  color: string,
  alpha: number,
  lw: number,
  vertical = false,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    if (vertical) {
      const gx = x + rnd.range(0.05, 0.95) * w;
      const gy = y + rnd.range(0, 0.6) * h;
      const l = rnd.range(0.25, 0.7) * h;
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + rnd.range(-0.04, 0.04) * w, gy + l * 0.5, gx + rnd.range(-0.03, 0.03) * w, gy + l);
    } else {
      const gy = y + rnd.range(0.08, 0.92) * h;
      const gx = x + rnd.range(0, 0.6) * w;
      const l = rnd.range(0.25, 0.7) * w;
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + l * 0.5, gy + rnd.range(-0.06, 0.06) * h, gx + l, gy + rnd.range(-0.04, 0.04) * h);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export const smooth01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
