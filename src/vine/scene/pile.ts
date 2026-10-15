/**
 * The clippings pile: a heap of red and brown leaves whose volume tracks `pile` (interest paid so far over the
 * starting balance; both cottages share one scale). Leaves sit on the surface of a mound in a fixed seeded
 * arrangement; the heap's width, height and leaf count follow the volume continuously, and each leaf scales in
 * as the heap reaches it, so growth is smooth. The picture is cached and repainted only when the volume has
 * moved enough to show. Past a volume of 3 the first heap stops growing and a second one starts beside it.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { PlanId } from '../types';
import { LEAF_GROUPS, type LeafSet } from './leaves';

export const HEAP_MAX = 3;
/** half width and height of one heap of volume v */
export const heapR = (v: number): number => 46 * Math.sqrt(Math.max(0, v));
export const heapH = (v: number): number => 30 * Math.pow(Math.max(0, v), 0.45);

const NMAX = 460;
const RM = heapR(HEAP_MAX) + 16;
const HM = heapH(HEAP_MAX) + 14;
const DEPTH = 0.17;

interface HLeaf {
  x: number;
  z: number;
  rot: number;
  group: number;
  shape: number;
  rank: number;
  tone: number;
  hh: number;
  sy: number;
}

export class PileView {
  private readonly leaves: HLeaf[] = [];
  private readonly cache: HTMLCanvasElement[] = [];
  private readonly cv: Array<{ v: number }> = [{ v: -1 }, { v: -1 }];
  private q: number;
  private spr: LeafSet | null = null;
  /** the displayed volume (smoothed) */
  v = 0;
  readonly dir: 1 | -1;

  constructor(readonly id: PlanId, q: number) {
    this.q = q;
    this.dir = id === 'minimum' ? 1 : -1;
    const rnd = new Rand(id === 'minimum' ? 12011 : 12037);
    const w = [0.22, 0.18, 0.26, 0.2, 0.14];
    const pickGroup = () => {
      let r = rnd.next();
      for (let g = 0; g < w.length; g++) {
        r -= w[g]!;
        if (r <= 0) return g;
      }
      return 2;
    };
    // a seeded scatter over the mound's footprint; rank decides when each leaf is reached by the growing heap
    const raw: Array<Omit<HLeaf, 'rank'>> = [];
    for (let i = 0; i < NMAX; i++) {
      const rr = Math.sqrt(rnd.next()) * 0.98;
      const th = rnd.range(0, Math.PI * 2);
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      const hh = Math.max(0, 1 - x * x - z * z);
      const lit = x < -0.1 && hh > 0.35;
      const shade = x > 0.38 || z > 0.45;
      let tone = lit ? 0 : shade ? 2 : 1;
      if (rnd.chance(0.2)) tone = clamp(tone + (rnd.chance(0.5) ? 1 : -1), 0, 2);
      raw.push({ x, z, rot: rnd.range(0, Math.PI * 2), group: pickGroup(), shape: rnd.int(0, 2), tone, hh: Math.pow(hh, 0.8), sy: 0 });
    }
    // reach order: the centre first, the rim last (a growing heap fills outward and upward)
    const reach = raw.map((l, i) => ({ i, k: Math.hypot(l.x, l.z) * 0.8 + rnd.next() * 0.35 }));
    reach.sort((a, b) => a.k - b.k);
    const rankOf = new Array<number>(NMAX);
    reach.forEach((r, n) => (rankOf[r.i] = n));
    const withRank = raw.map((l, i) => ({ ...l, rank: rankOf[i]!, sy: l.z * DEPTH - l.hh }));
    // paint order: back and high first, front and low last
    withRank.sort((a, b) => a.sy - b.sy);
    this.leaves = withRank;
  }

  setSprites(spr: LeafSet, q: number): void {
    this.spr = spr;
    this.q = q;
    this.cv[0]!.v = -1;
    this.cv[1]!.v = -1;
  }

  /** advance the displayed volume toward the target (smooth growth) */
  update(target: number, dt: number, reduced: boolean): void {
    const t = Math.max(0, target);
    if (reduced || dt <= 0) this.v = t;
    else this.v += (t - this.v) * (1 - Math.exp(-dt * 4.5));
    if (Math.abs(this.v - t) < 1e-4) this.v = t;
  }

  /** half width and height of everything on the lawn now (world units), for sweeping clippings and the label */
  dims(): { w: number; h: number; cx: number } {
    const a = Math.min(this.v, HEAP_MAX);
    const b = clamp(this.v - HEAP_MAX, 0, HEAP_MAX);
    const w1 = heapR(a);
    const w2 = heapR(b);
    const off = b > 0 ? w1 * 0.9 + w2 * 0.3 : 0;
    const w = b > 0 ? Math.max(w1, off + w2) : w1;
    return { w, h: Math.max(heapH(a), b > 0 ? heapH(b) : 0), cx: (this.dir * (off + w2 - w1)) / 2 };
  }

  private paintHeap(k: number, v: number): void {
    if (!this.spr) return;
    const q = this.q;
    const W = (RM * 2 + 8) * q;
    const H = (HM + RM * DEPTH + 18) * q;
    let cv = this.cache[k];
    if (!cv) {
      cv = makeCanvas(W, H);
      this.cache[k] = cv;
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    this.cv[k]!.v = v;
    if (v < 0.004) return;
    const ox = RM + 4;
    const oy = HM + 4;
    ctx.setTransform(q, 0, 0, q, ox * q, oy * q);
    const R = heapR(v);
    const Hh = heapH(v);
    const rnd = new Rand(900 + k);
    // contact shadow, to the lower right
    ctx.save();
    ctx.translate(R * 0.16, R * 0.05);
    ctx.scale(1, DEPTH + 0.05);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.18);
    g.addColorStop(0, 'rgba(54,40,44,0.46)');
    g.addColorStop(0.7, 'rgba(54,40,44,0.28)');
    g.addColorStop(1, 'rgba(54,40,44,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the dark mass under the leaves so no gap shows paper
    const poly: number[] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      poly.push(Math.cos(a) * R * 0.97, -Math.pow(Math.sin(a), 0.85) * Hh * 0.94 + R * DEPTH * 0.45);
    }
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * Math.PI;
      poly.push(Math.cos(a) * R * 0.95, R * DEPTH * (0.55 + 0.45 * Math.sin(a)));
    }
    ctx.fillStyle = rgba('#5A2E24', 0.96);
    tracePoly(ctx, deform(poly, rnd, 1, 0.01));
    ctx.fill();
    // the leaves reached so far; the one at the frontier scales in
    const area = 1.4 * 1.57 * R * Hh;
    const sz = 0.78 + 0.22 * Math.sqrt(v);
    const nLeaves = clamp((3.2 * area) / (this.spr.size * sz * 0.62 * this.spr.size * sz * 0.5), 0, NMAX);
    const size = this.spr.size;
    for (const l of this.leaves) {
      const vis = clamp((nLeaves - l.rank) / 2, 0, 1);
      if (vis <= 0.01) continue;
      const px = l.x * R;
      const py = l.z * R * DEPTH - l.hh * Hh;
      const sp = this.spr.spr[l.group]![l.tone]![l.shape]!;
      const s = (size / sp.w) * (sp.w / 14) * sz * (0.35 + 0.65 * vis);
      const co = Math.cos(l.rot) * s;
      const si = Math.sin(l.rot) * s;
      ctx.setTransform(q * co, q * si, -q * si * 0.78, q * co * 0.78, (ox + px) * q, (oy + py) * q);
      ctx.drawImage(sp.cv, -sp.px, -sp.py, sp.w, sp.h);
    }
    ctx.setTransform(q, 0, 0, q, ox * q, oy * q);
    // the sun on the upper left of the heap, a little shade low on the right
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const lg = ctx.createRadialGradient(-R * 0.35, -Hh * 0.85, 0, -R * 0.35, -Hh * 0.85, R * 1.1);
    lg.addColorStop(0, 'rgba(255,230,170,0.24)');
    lg.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-R * 1.3, -Hh * 1.4, R * 2.6, Hh * 1.8 + R * DEPTH * 2);
    const sg = ctx.createLinearGradient(R * 0.2, -Hh, R * 0.9, R * DEPTH);
    sg.addColorStop(0, 'rgba(60,24,40,0)');
    sg.addColorStop(1, 'rgba(60,24,40,0.3)');
    ctx.fillStyle = sg;
    ctx.fillRect(-R * 1.3, -Hh * 1.4, R * 2.6, Hh * 1.8 + R * DEPTH * 2);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** draw the pile with its centre at ground point (x, y); world transform already set */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.spr || this.v < 0.004) return;
    const a = Math.min(this.v, HEAP_MAX);
    const b = clamp(this.v - HEAP_MAX, 0, HEAP_MAX);
    const parts: Array<{ k: number; v: number; dx: number; dy: number }> = [];
    if (b > 0.004) {
      const off = heapR(a) * 0.9 + heapR(b) * 0.3;
      parts.push({ k: 1, v: b, dx: this.dir * off, dy: -7 });
    }
    parts.push({ k: 0, v: a, dx: 0, dy: 0 });
    for (const p of parts) {
      const last = this.cv[p.k]!.v;
      // repaint only when the change would show (about half a screen pixel of growth)
      if (last < 0 || Math.abs(p.v - last) > 0.0035 * Math.max(0.3, p.v)) this.paintHeap(p.k, p.v);
      const cv = this.cache[p.k];
      if (!cv) continue;
      ctx.drawImage(cv, x + p.dx - (RM + 4), y + p.dy - (HM + 4), cv.width / this.q, cv.height / this.q);
    }
  }
}

void LEAF_GROUPS;
