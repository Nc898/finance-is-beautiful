/**
 * Painterly helpers for the watercolor variant of the river: soft low-resolution "wet" layers, tapered
 * brush strokes with bristle marks, paper-tooth grain (erosion of pigment on the peaks, granulation in the
 * valleys), little painted stones / tufts / flowers. Everything is built once into cached canvases; nothing
 * here runs per frame. All randomness comes from `Rand`.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';

export type Pt = [number, number];

/* ------------------------------------------------------------------ geometry */

/** a lumpy closed blob (flat polygon) */
export function blobPoly(cx: number, cy: number, rx: number, ry: number, rnd: Rand, n = 14, jit = 0.22): number[] {
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + (rnd.next() - 0.5) * 2 * jit;
    o.push(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j);
  }
  return o;
}

/** closed polygon around a centre line, with a width profile w(t) (full width, units) */
export function strokePoly(pts: Pt[], w: (t: number) => number): number[] {
  const n = pts.length;
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const hw = w(t) / 2;
    L.push(pts[i]![0] - dy * hw, pts[i]![1] + dx * hw);
    R.push(pts[i]![0] + dy * hw, pts[i]![1] - dx * hw);
  }
  const o = L.slice();
  for (let i = n - 1; i >= 0; i--) o.push(R[2 * i]!, R[2 * i + 1]!);
  return o;
}

/** a gently arched centre line from (x0,y0) to (x0+len, y0) */
export function archLine(x0: number, y0: number, len: number, bow: number, wob: number, ph: number, n = 12): Pt[] {
  const o: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    o.push([x0 + len * t, y0 - bow * Math.sin(Math.PI * t) + wob * Math.sin(t * 5 + ph)]);
  }
  return o;
}

/** profile that swells fast and tapers to a point: a loaded brush dragged and lifted */
export const brushProfile = (peak: number, head = 0.18) => (t: number): number => {
  const a = t < head ? Math.sin((t / head) * Math.PI * 0.5) : Math.pow(Math.max(0, 1 - (t - head) / (1 - head)), 0.8);
  return peak * Math.max(0, a);
};

/* ------------------------------------------------------------------ soft (wet) layers */

/**
 * A low-resolution canvas covering a world rectangle. Paint into `ctx` in world units, then `draw` it
 * upscaled with smoothing: every shape comes out soft-edged, like paint bleeding into a wet surface.
 */
export class SoftLayer {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly w: number,
    readonly h: number,
    readonly res: number,
  ) {
    this.cv = makeCanvas(Math.ceil(w * res), Math.ceil(h * res));
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
  }
  /** composite into a target whose current transform maps world units */
  draw(target: CanvasRenderingContext2D, alpha = 1, comp: GlobalCompositeOperation = 'source-over'): void {
    target.save();
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'low';
    target.globalAlpha = alpha;
    target.globalCompositeOperation = comp;
    target.drawImage(this.cv, this.x0, this.y0, this.w, this.h);
    target.restore();
  }
}

/** a soft elliptical bloom: stacked, re-deformed translucent blobs (wet pigment spreading) */
export function bloom(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, alpha: number, rnd: Rand, n = 5): void {
  ctx.fillStyle = rgba(color, alpha / Math.max(1, n * 0.6));
  const base = blobPoly(cx, cy, rx, ry, rnd, 16, 0.2);
  for (let i = 0; i < n; i++) {
    const k = 1 - i * 0.13;
    const p = base.map((v, j) => (j % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * k));
    tracePoly(ctx, deform(p, rnd, 3, 0.1));
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ paper tooth */

interface Tooth {
  /** alpha = where the paper's peaks show through the wash (use destination-out) */
  peaks: HTMLCanvasElement;
  /** dark pigment settled in the valleys (multiply / source-over) */
  valleys: HTMLCanvasElement;
  size: number;
}
const toothCache = new Map<string, Tooth>();

/** a seamless tooth pair for a given pigment colour */
export function paperTooth(pigment: string, size = 192, seed = 311): Tooth {
  const key = `${pigment}|${size}|${seed}`;
  const hit = toothCache.get(key);
  if (hit) return hit;
  const lattice = (cells: number, sd: number) => {
    const r = new Rand(sd);
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r.next();
    return (x: number, y: number) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const x0 = ((ix % cells) + cells) % cells;
      const y0 = ((iy % cells) + cells) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const a = g[y0 * cells + x0]!;
      const b = g[y0 * cells + x1]!;
      const c = g[y1 * cells + x0]!;
      const d = g[y1 * cells + x1]!;
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  };
  const nA = lattice(96, seed);
  const nB = lattice(160, seed + 5);
  const nC = lattice(32, seed + 9);
  const peaks = makeCanvas(size, size);
  const valleys = makeCanvas(size, size);
  const pc = peaks.getContext('2d')!;
  const vc = valleys.getContext('2d')!;
  const pi = pc.createImageData(size, size);
  const vi = vc.createImageData(size, size);
  const m = /^#?([0-9a-f]{6})$/i.exec(pigment)!;
  const n = parseInt(m[1]!, 16);
  const [pr, pg, pb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // fine tooth, modulated by a slow blotchiness so the grain clusters like real paper
      const f = nA(u * 96, v * 96) * 0.4 + nB(u * 160, v * 160) * 0.4 + nC(u * 32, v * 32) * 0.2;
      const i = (y * size + x) * 4;
      const peak = Math.max(0, (f - 0.56) * 3);
      const valley = Math.max(0, (0.44 - f) * 3);
      pi.data[i] = 255;
      pi.data[i + 1] = 255;
      pi.data[i + 2] = 255;
      pi.data[i + 3] = Math.min(255, peak * 255);
      vi.data[i] = pr;
      vi.data[i + 1] = pg;
      vi.data[i + 2] = pb;
      vi.data[i + 3] = Math.min(255, valley * 255);
    }
  }
  pc.putImageData(pi, 0, 0);
  vc.putImageData(vi, 0, 0);
  const t = { peaks, valleys, size };
  toothCache.set(key, t);
  return t;
}

/**
 * Lay paper tooth over a region of the CURRENT clip: the wash thins where the paper's peaks are
 * (`lift`, 0..1) and pigment collects in the valleys (`gran`, 0..1). `px` = device pixels per tooth pixel.
 * The context transform is untouched; the pattern is placed in device space.
 */
export function applyTooth(ctx: CanvasRenderingContext2D, t: Tooth, x: number, y: number, w: number, h: number, px: number, lift: number, gran: number): void {
  const m = ctx.getTransform();
  const mk = (cv: HTMLCanvasElement): CanvasPattern => {
    const p = ctx.createPattern(cv, 'repeat')!;
    p.setTransform(new DOMMatrix().scale(px / m.a, px / m.d));
    return p;
  };
  ctx.save();
  if (gran > 0) {
    ctx.globalAlpha = gran;
    ctx.fillStyle = mk(t.valleys);
    ctx.fillRect(x, y, w, h);
  }
  if (lift > 0) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = lift;
    ctx.fillStyle = mk(t.peaks);
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ marks */

/**
 * A brush stroke painted as a body (layered, deformed) with bristle marks along its length (dry-brush
 * streaks that stop short), used for water bands and sprite streaks.
 */
export function brushBand(
  ctx: CanvasRenderingContext2D,
  centre: Pt[],
  width: (t: number) => number,
  color: string,
  alpha: number,
  rnd: Rand,
  o: { layers?: number; bristles?: number; bristleColor?: string; bristleAlpha?: number; amp?: number } = {},
): void {
  const poly = strokePoly(centre, width);
  const layers = o.layers ?? 3;
  ctx.fillStyle = rgba(color, alpha / Math.max(1, layers * 0.6));
  for (let i = 0; i < layers; i++) {
    tracePoly(ctx, deform(poly, rnd, 2, o.amp ?? 0.035));
    ctx.fill();
  }
  const nb = o.bristles ?? 0;
  if (nb > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < nb; k++) {
      const off = rnd.range(-0.42, 0.42);
      const a0 = rnd.range(0, 0.45);
      const a1 = rnd.range(a0 + 0.2, 1);
      ctx.strokeStyle = rgba(o.bristleColor ?? color, (o.bristleAlpha ?? alpha * 0.7) * rnd.range(0.5, 1));
      ctx.lineWidth = rnd.range(0.25, 0.6);
      ctx.beginPath();
      let first = true;
      const n = centre.length;
      for (let i = Math.floor(a0 * (n - 1)); i <= Math.ceil(a1 * (n - 1)); i++) {
        const t = i / (n - 1);
        const a = centre[Math.max(0, i - 1)]!;
        const b = centre[Math.min(n - 1, i + 1)]!;
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        const hw = (width(t) / 2) * off * 2;
        const x = centre[i]![0] - dy * hw;
        const y = centre[i]![1] + dx * hw;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** a small painted stone: wash with a lit upper-left, a shade lower-right and (when big enough) a broken contour */
export function paintStone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: Rand, o: { wet?: boolean; alpha?: number } = {}): void {
  const a = o.alpha ?? 1;
  ctx.save();
  ctx.globalAlpha = a;
  if (o.wet) {
    // wet ring where the stone meets the water, and its shadow to the lower right
    ctx.strokeStyle = 'rgba(250,252,246,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.1, y + r * 0.35, r * 1.4, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(28,66,84,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.55, y + r * 0.42, r * 1.2, r * 0.34, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const pts: number[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * rnd.range(0.86, 1.08);
    const s = Math.sin(t);
    pts.push(x + Math.cos(t) * rr * 1.2, y + (s < 0 ? s * rr * 0.85 : s * rr * 0.22));
  }
  ctx.fillStyle = rgba(rnd.pick(['#BDB09A', '#AEA08C', '#C6B89E', '#B2A8A0']), 0.55);
  tracePoly(ctx, pts);
  ctx.fill();
  ctx.fillStyle = rgba('#B2A48E', 0.3);
  tracePoly(ctx, deform(pts, rnd, 1, 0.05));
  ctx.fill();
  // lit upper left, shaded lower right
  ctx.fillStyle = 'rgba(255,248,226,0.4)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.35, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,48,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y - r * 0.05, r * 0.5, r * 0.3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (r > 2.2) {
    ctx.strokeStyle = 'rgba(66,52,42,0.45)';
    ctx.lineWidth = Math.max(0.3, r * 0.1);
    ctx.setLineDash([r * 1.4, r * 0.35, r * 0.7, r * 0.3]);
    tracePoly(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** a fan of grass blades: tapered painted blades, lighter on the lit (left) side, with a darker thread down the middle */
export function grassTuft(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, rnd: Rand, k = 1, pal: readonly string[] = ['#9DBF5C', '#4B7A3A', '#6E9A48', '#B6CE6A']): void {
  const n = rnd.int(4, 7);
  ctx.lineCap = 'round';
  for (let j = 0; j < n; j++) {
    const f = (j / (n - 1) - 0.5) * 2;
    const hh = h * rnd.range(0.6, 1);
    const bx = x + f * 0.6 * k;
    const tipx = x + f * rnd.range(0.25, 0.6) * h + rnd.range(-0.6, 0.6) * k;
    const tipy = y - hh;
    const cx = x + f * 0.2 * h;
    const cy = y - hh * 0.55;
    const w = rnd.range(0.35, 0.7) * k + h * 0.035;
    // base left/right, tip: a thin curved leaf
    ctx.fillStyle = rgba(pal[(j + (f < 0 ? 0 : 1)) % pal.length]!, rnd.range(0.55, 0.85));
    ctx.beginPath();
    ctx.moveTo(bx - w, y);
    ctx.quadraticCurveTo(cx - w * 0.7, cy, tipx, tipy);
    ctx.quadraticCurveTo(cx + w * 0.7, cy, bx + w, y);
    ctx.closePath();
    ctx.fill();
    if (h > 7) {
      ctx.strokeStyle = 'rgba(40,72,40,0.22)';
      ctx.lineWidth = 0.25 * k + 0.1;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.quadraticCurveTo(cx, cy, tipx, tipy);
      ctx.stroke();
    }
  }
}

/** a wildflower dab: a soft blob of pigment with a tiny darker heart and a paper-white lift */
export function flowerDab(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rnd: Rand, stem = true): void {
  if (stem) {
    ctx.strokeStyle = 'rgba(86,124,62,0.6)';
    ctx.lineWidth = Math.max(0.3, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y + r * 2.8);
    ctx.quadraticCurveTo(x + rnd.range(-0.8, 0.8), y + r * 1.4, x + rnd.range(-0.4, 0.4), y);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(color, 0.4);
  for (let i = 0; i < 2; i++) {
    tracePoly(ctx, deform(blobPoly(x, y, r * 1.05, r * 0.85, rnd, 8, 0.12), rnd, 1, 0.08));
    ctx.fill();
  }
  ctx.fillStyle = rgba(color, 0.55);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y + r * 0.1, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,232,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
}
