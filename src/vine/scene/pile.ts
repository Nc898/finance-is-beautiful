/**
 * The clippings pile: a raked heap of autumn leaves whose volume tracks `pile` (interest paid so far over the
 * starting balance; both cottages share one scale). The heap is built from hundreds of individual painted leaves
 * laid over a lumpy dome: each leaf lies on the surface (foreshortened by the slope it sits on, turned a little
 * downhill), is lit by the sun on the upper left (light, middle or shaded tone), and casts a small shadow on the
 * ones under it. The leaves are a fixed, evenly spread sequence, so at any volume the visible prefix covers the
 * whole dome and the heap grows smoothly as leaves are added and the dome swells. A few leaves have tumbled off
 * the foot. The picture is cached and repainted only when the volume has moved enough to show. Past a volume of 3
 * the first heap stops growing and a second one starts beside it.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { feather } from '../../river/scene/boatInk';
import type { PlanId } from '../types';
import { LEAF_GROUPS, LEAF_LEN, type LeafSet } from './leaves';

export const HEAP_MAX = 3;
/** half width and height of one heap of volume v */
export const heapR = (v: number): number => 46 * Math.sqrt(Math.max(0, v));
export const heapH = (v: number): number => 34 * Math.pow(Math.max(0, v), 0.48);

const GN = 1500;
const GROUND_SHARE = 0.15;
const RM = heapR(HEAP_MAX) * 1.34 + 14;
const HM = heapH(HEAP_MAX) + 26;
const DEPTH = 0.24;
/** the camera looks down on the lawn at about this elevation (sets how much a flat leaf is squashed) */
const ELEV = (30 * Math.PI) / 180;
const VV = [0, Math.sin(ELEV), Math.cos(ELEV)] as const;
const UU = [0, Math.cos(ELEV), -Math.sin(ELEV)] as const;
const LIGHT = norm3(-0.62, 0.7, 0.34);

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

interface HLeaf {
  /** footprint position, -1…1 (ground leaves reach beyond 1) */
  x: number;
  z: number;
  /** height of the dome there, 0…1 */
  hh: number;
  /** the way the tip points (radians, in the leaf's own plane) */
  rot: number;
  group: number;
  shape: number;
  tone: number;
  /** the compression of the leaf as seen: direction (radians) and ratio */
  phi: number;
  cc: number;
  rank: number;
  ground: boolean;
  size: number;
  sy: number;
}

/** the heap's radial profile, 0…1 */
const prof = (r: number): number => Math.pow(Math.max(0, 1 - Math.pow(r, 2.3)), 0.6);
/** inverse of the surface-area distribution over the footprint radius, so leaves lie evenly over the SURFACE of the dome */
const AREA_CDF: number[] = (() => {
  const N = 160;
  const c = [0];
  for (let i = 1; i <= N; i++) {
    const r = (i - 0.5) / N;
    const d = ((prof(Math.min(0.9995, r + 0.004)) - prof(Math.max(0, r - 0.004))) / 0.008) * 0.74;
    c.push(c[i - 1]! + r * Math.sqrt(1 + d * d) / N);
  }
  const t = c[N]!;
  return c.map((v) => v / t);
})();
function radiusAt(u: number): number {
  let lo = 0;
  let hi = AREA_CDF.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (AREA_CDF[m]! < u) lo = m;
    else hi = m;
  }
  const a = AREA_CDF[lo]!;
  const b = AREA_CDF[hi]!;
  return (lo + (b > a ? (u - a) / (b - a) : 0)) / (AREA_CDF.length - 1);
}

/** the dome's height at a footprint point, 0…1, a lumpy heap that leans a little toward the upper left */
function dome(x: number, z: number): number {
  const rr = Math.hypot(x, z);
  if (rr >= 1) return 0;
  const lump = 1 + 0.1 * Math.sin(3.1 * x + 1.0) * Math.cos(2.3 * z + 0.4) + 0.06 * Math.sin(5.2 * (x + z) + 2.0);
  const lean = 1 + 0.12 * (-x * 0.7 - z * 0.3);
  return prof(rr) * lump * lean;
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
    const w = [0.14, 0.18, 0.26, 0.06, 0.24, 0.12];
    const pickGroup = () => {
      let r = rnd.next();
      for (let g = 0; g < w.length; g++) {
        r -= w[g]!;
        if (r <= 0) return g;
      }
      return 2;
    };
    // colour patches: neighbouring leaves tend to share a colour, as a raked heap does
    const patchOrder = [2, 4, 1, 2, 0, 5, 4, 3].map((g) => g);
    const ph1 = rnd.range(0, 6.28);
    const ph2 = rnd.range(0, 6.28);
    const patch = (x: number, z: number): number => {
      const f = Math.sin(2.3 * x + ph1) + Math.sin(2.9 * z - ph2) + 0.7 * Math.sin(3.8 * (x + z) + ph1 * 1.7);
      return patchOrder[clamp(Math.floor(((f + 2.7) / 5.4) * patchOrder.length), 0, patchOrder.length - 1)]!;
    };
    const hRatio = 0.74;
    const dh = 0.02;
    const build = (i: number, ground: boolean): HLeaf => {
      // a low-discrepancy sequence: every prefix is spread evenly over the disc
      const u = (0.5 + i * 0.7548776662466927 + rnd.range(-0.02, 0.02)) % 1;
      const wv = (0.5 + i * 0.5698402909980532 + rnd.range(-0.02, 0.02)) % 1;
      const rr = ground ? (i % 5 < 3 ? 0.9 + 0.12 * u : 1.03 + 0.3 * u) : radiusAt(u) * 0.99;
      const th = wv * Math.PI * 2;
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      const hh = dome(x, z);
      // the slope normal (world), for the light and the foreshortening
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (!ground || rr < 1.0) {
        const gx = ((dome(x + dh, z) - dome(x - dh, z)) / (2 * dh)) * hRatio;
        const gz = ((dome(x, z + dh) - dome(x, z - dh)) / (2 * dh)) * hRatio;
        [nx, ny, nz] = norm3(-gx, 1, -gz);
      }
      const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      let tone = d > 0.7 ? 0 : d > 0.1 ? 1 : 2;
      if (tone === 2 && rnd.chance(0.4)) tone = 1;
      if (rnd.chance(0.16)) tone = clamp(tone + (rnd.chance(0.5) ? 1 : -1), 0, 2);
      if (ground && rr >= 1.0) tone = rnd.chance(0.6) ? 1 : 0;
      const nv = nx * VV[0] + ny * VV[1] + nz * VV[2];
      const nu = nx * UU[0] + ny * UU[1] + nz * UU[2];
      const cc = clamp(Math.abs(nv), 0.28, 1);
      const phi = Math.atan2(-nu, nx);
      const outA = Math.atan2(x, -(z * DEPTH * 3 - hh * 0.3 + 0.001));
      const rot = rnd.chance(ground ? 0.2 : 0.3) ? outA + rnd.gauss() * 0.7 : rnd.range(0, Math.PI * 2);
      const group = rnd.chance(0.5) ? patch(x, z) : pickGroup();
      return {
        x,
        z,
        hh,
        rot,
        group,
        shape: rnd.int(0, 2),
        tone,
        phi,
        cc: ground && rr >= 1.0 ? 0.5 : cc,
        rank: i,
        ground,
        size: rnd.range(0.84, 1.14),
        sy: z * DEPTH * 46 - hh * 34,
      };
    };
    const list: HLeaf[] = [];
    const nG = Math.round(GN * GROUND_SHARE);
    for (let i = 0; i < GN - nG; i++) list.push(build(i, false));
    for (let i = 0; i < nG; i++) list.push(build(i + 5, true));
    // paint order: back and high first, front and low last
    list.sort((a, b) => a.sy - b.sy);
    this.leaves = list;
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
    // the dome's under-wash, a warm brown seen between the leaves (lighter high up and on the left, deep at the foot)
    const poly: number[] = [];
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const u = -1 + (2 * i) / n;
      poly.push(u * R * 0.97, -dome(u * 0.97, 0) * Hh * 0.96 + R * DEPTH * 0.1);
    }
    for (let i = n; i >= 0; i--) {
      const u = -1 + (2 * i) / n;
      poly.push(u * R * 0.95, R * DEPTH * Math.sqrt(Math.max(0, 1 - u * u)) * 0.62);
    }
    const under = deform(poly, rnd, 1, 0.012);
    const ug = ctx.createLinearGradient(-R * 0.4, -Hh, R * 0.3, R * DEPTH);
    ug.addColorStop(0, '#CC8446');
    ug.addColorStop(0.6, '#B0663A');
    ug.addColorStop(1, '#84483A');
    ctx.fillStyle = ug;
    tracePoly(ctx, under);
    ctx.fill();
    // the leaves reached so far; each one scales in as the heap reaches it
    const size = this.spr.size;
    const len = 10.5 * (0.82 + 0.18 * Math.sqrt(v));
    const area = 1.57 * (R * Hh * 0.85 + R * R * DEPTH);
    const nLeaves = clamp((3.3 * area) / (0.27 * len * len), 0, GN * (1 - GROUND_SHARE));
    const nGround = nLeaves * GROUND_SHARE * 1.1;
    const sc = len / size;
    for (const l of this.leaves) {
      const vis = clamp(((l.ground ? nGround : nLeaves) - l.rank) / 2.5, 0, 1);
      if (vis <= 0.01) continue;
      const px = l.x * R;
      const py = l.z * R * DEPTH - l.hh * Hh;
      const sp = this.spr.spr[l.group]![l.tone]![l.shape]!;
      const s = sc * l.size * (0.4 + 0.6 * vis) * (l.ground ? 0.9 : 1);
      // the compression of the leaf along the direction of its surface's tilt, then its turn about its own axis
      const cp = Math.cos(l.phi);
      const sp2 = Math.sin(l.phi);
      const m00 = cp * cp + l.cc * sp2 * sp2;
      const m01 = (1 - l.cc) * sp2 * cp;
      const m11 = sp2 * sp2 + l.cc * cp * cp;
      const co = Math.cos(l.rot) * s;
      const si = Math.sin(l.rot) * s;
      const a = m00 * co + m01 * si;
      const b = m01 * co + m11 * si;
      const c = -m00 * si + m01 * co;
      const d = -m01 * si + m11 * co;
      // a small shadow under the leaf, on the ones below it
      ctx.setTransform(q, 0, 0, q, (ox + px) * q, (oy + py) * q);
      ctx.fillStyle = l.ground ? 'rgba(44,28,44,0.16)' : `rgba(52,22,30,${0.13 + 0.05 * l.tone})`;
      ctx.beginPath();
      ctx.ellipse(1.1 * s * 1.2, 1.5 * s * 1.1, 4.3 * s, 2.6 * s, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.setTransform(q * a, q * b, q * c, q * d, (ox + px) * q, (oy + py) * q);
      ctx.drawImage(sp.cv, -sp.px, -sp.py, sp.w, sp.h);
    }
    ctx.setTransform(q, 0, 0, q, ox * q, oy * q);
    // the sun on the upper left of the heap and the shade low on the right, as washes over the finished leaves
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const lg = ctx.createRadialGradient(-R * 0.38, -Hh * 0.95, 0, -R * 0.38, -Hh * 0.95, R * 1.0);
    lg.addColorStop(0, 'rgba(255,232,170,0.26)');
    lg.addColorStop(1, 'rgba(255,232,170,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-R * 1.5, -Hh * 1.4, R * 3, Hh * 1.8 + R * DEPTH * 2);
    const sg = ctx.createLinearGradient(R * 0.1, -Hh, R * 0.95, R * DEPTH);
    sg.addColorStop(0, 'rgba(70,28,50,0)');
    sg.addColorStop(1, 'rgba(70,28,50,0.2)');
    ctx.fillStyle = sg;
    ctx.fillRect(-R * 1.5, -Hh * 1.4, R * 3, Hh * 1.8 + R * DEPTH * 2);
    // the foot of the heap is darker, tucked in shadow
    const fg = ctx.createLinearGradient(0, -Hh * 0.3, 0, R * DEPTH * 0.9);
    fg.addColorStop(0, 'rgba(60,24,40,0)');
    fg.addColorStop(1, 'rgba(60,24,40,0.17)');
    ctx.fillStyle = fg;
    ctx.fillRect(-R * 1.5, -Hh * 0.3, R * 3, Hh * 0.3 + R * DEPTH * 1.2);
    ctx.restore();
    // the contact shadow, behind everything, to the lower right
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    const sp: number[] = [];
    for (let i = 0; i < 22; i++) {
      const t = (i / 22) * Math.PI * 2;
      const j = 1 + 0.06 * Math.sin(t * 3 + k);
      sp.push(R * 0.2 + Math.cos(t) * R * 1.12 * j, R * DEPTH * 0.18 + Math.sin(t) * R * DEPTH * 0.95 * j);
    }
    feather(ctx, sp, '#3C2A40', 0.44, rnd, 7, 1, 0.45, 0.04);
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
void LEAF_LEN;
void rgba;
