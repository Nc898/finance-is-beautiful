/**
 * Crown-space tree model.
 *
 * generateTree(seed) draws EVERY random number the tree will ever need, once, in a fixed order; rendering is a
 * pure function of (model, maturity).
 *
 *  - The crown envelope is a function of maturity m ONLY: a dome whose base sits at 35 % of the tree height and
 *    whose width/height ratio goes from ~0.5 (young) to W/H (mature). Seeds only change lobe phases, gaps and
 *    clump variation; explicit extreme clumps pin the mature bounding box to exactly W x H for every seed.
 *  - Foliage clumps live in a unit dome (u,v), ordered by best-candidate sampling so any prefix covers the dome.
 *  - The skeleton is built hierarchically toward the clump anchors: trunk -> 2-3 scaffold limbs (Y-fork) -> nested
 *    secondary limbs born at varied heights at 25-50 deg -> short twigs into the foliage. Pipe-model radii.
 *    It is stored in mature coordinates and mapped by the SAME crown transform as the clumps.
 *  - A seeded root system (soil band, y < 0) leads the canopy: its growth clock is m^0.6.
 */
import { Rand, hashSeed, clamp, smoothstep } from './prng';
import { WORLD } from './types';
import type { SpriteKind } from './watercolor';
import { SPRITE_POOL } from './watercolor';

export const H = WORLD.matureHeight;
export const W = WORLD.matureSpread;
export const CROWN_BASE = 0.35;
export const YB0 = CROWN_BASE * H;
export const HC0 = H - YB0;
const RATIO_YOUNG = 0.5;
/** mature crown width: 95 % of matureSpread, so two mature crowns 400 apart never touch */
export const WE = 0.95 * W;
const RATIO_MAT = WE / H;
export const CLUMP_W0 = 71;
export const NTOT = 125;
const K_HALFW = 0.36;
const K_UP = 0.83;
const K_HR = 0.62;
const INX0 = K_HALFW * CLUMP_W0;
const INY0 = K_UP * K_HR * CLUMP_W0;
const SXD = WE / 2 - INX0;
const SYD = HC0 - INY0;
const RAMP = 0.025;
export const SOIL_DEPTH = 70;

const NTAB: Array<[number, number]> = [[0.03, 1], [0.08, 11], [0.2, 25], [0.45, 60], [1, NTOT]];

export function crownRatio(m: number): number {
  return RATIO_YOUNG + (RATIO_MAT - RATIO_YOUNG) * smoothstep((m - 0.1) / 0.9);
}
export function clumpCount(m: number): number {
  if (m <= NTAB[0]![0]) return Math.max(0.2, (m / NTAB[0]![0]) * NTAB[0]![1]);
  for (let i = 1; i < NTAB.length; i++) {
    const [m1, n1] = NTAB[i]!;
    const [m0, n0] = NTAB[i - 1]!;
    if (m <= m1) return n0 + ((m - m0) / (m1 - m0)) * (n1 - n0);
  }
  return NTOT;
}
function birthOfRank(i: number): number {
  const target = i + 1;
  for (let k = 1; k < NTAB.length; k++) {
    const [m0, n0] = NTAB[k - 1]!;
    const [m1, n1] = NTAB[k]!;
    if (target <= n1) return n1 === n0 ? m1 : m0 + ((target - n0) / (n1 - n0)) * (m1 - m0);
  }
  return 1;
}

export interface CrownMap {
  m: number;
  h: number;
  yb: number;
  wc: number;
  kx: number;
  ky: number;
  sf: number;
  wBar: number;
  tanLean: number;
}

export function crownMap(m: number, tanLean: number): CrownMap {
  const mm = Math.max(m, 0.004);
  const h = mm * H;
  const wc = h * crownRatio(mm);
  const F = clumpCount(mm) / NTOT;
  const sf = Math.sqrt(((wc / WE) * mm) / F);
  const wBar = Math.min(CLUMP_W0 * sf, 0.8 * wc);
  const inX = K_HALFW * wBar;
  const inY = K_UP * K_HR * wBar;
  const kx = Math.max(0.002, (wc / 2 - inX) / SXD);
  const ky = Math.max(0.004, (HC0 * mm - inY) / SYD);
  return { m: mm, h, yb: YB0 * mm, wc, kx, ky, sf, wBar, tanLean };
}
export function mapY(y: number, cm: CrownMap): number {
  return y <= YB0 ? y * cm.m : YB0 * cm.m + (y - YB0) * cm.ky;
}

export interface Branch {
  idx: number;
  parent: number;
  tAttach: number;
  depth: number;
  n: number;
  px: Float32Array;
  py: Float32Array;
  cum: Float32Array;
  len: number;
  rad: Float32Array;
  jitA: Float32Array;
  jitB: Float32Array;
  birth: number;
  end: number;
  lightSign: 1 | -1;
  /** [frac, off(-1..1 toward shadow), len, ang, kind(0 dark,1 light)] * k */
  hatch: Float32Array;
  /** [frac, off, size, colour] * k */
  blooms: Float32Array;
  /** [frac, off, size] * k */
  knots: Float32Array;
  /** per-point ink class on [lit side | shadow side]; 0 = gap */
  ink: Uint8Array;
  tone: number;
  isRoot: boolean;
  terminal: boolean;
  r0: number;
  thick: boolean;
}

/** Underground root (soil band). Coordinates relative to the trunk base, y <= 0. */
export interface RootBranch {
  n: number;
  px: Float32Array;
  py: Float32Array;
  cum: Float32Array;
  len: number;
  rad: Float32Array;
  birth: number;
  end: number;
  depth: number;
  parent: number;
}

export interface Clump {
  u: number;
  v: number;
  x0: number;
  y0: number;
  w0: number;
  hr: number;
  kind: SpriteKind;
  variant: number;
  rot: number;
  /** 0 back mass, 1 back clump (behind skeleton), 2 mid, 3 front */
  layer: 0 | 1 | 2 | 3;
  birth: number;
  phase: number;
  mass: boolean;
  /** interior clump (not on the silhouette): may cast a soft under-shadow onto what is behind it */
  inner: boolean;
}

export interface Speck {
  clump: number;
  dx: number;
  dy: number;
  len: number;
  ang: number;
  color: string;
  alpha: number;
  birth: number;
}

export interface TreeModel {
  seed: number;
  tanLean: number;
  branches: Branch[];
  clumps: Clump[];
  layers: [Int32Array, Int32Array, Int32Array, Int32Array];
  specks: Speck[];
  roots: RootBranch[];
  /** root index the contribution pulse travels along (tip -> base) */
  pulseRoot: number;
  apex: number;
  stats: { branches: number; clumps: number; warm: number; tips: number; gaps: number; roots: number };
}

export interface TreeState {
  m: number;
  g: Float32Array;
  kappa: Float32Array;
  clumpA: Float32Array;
  rootG: Float32Array;
}

function invSmooth(f: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (smoothstep(mid) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- dome (seeded lobes, same bounding size)
let lobeN = 4;
let lobePsi = 0;
let lobeB = 0;
let lobeC = 0;
let liftPhase = 0;
const VC = 0.42;
function baseDome(v: number): number {
  if (v <= 0 || v >= 1) return 0;
  if (v >= VC) {
    const t = (v - VC) / (1 - VC);
    return Math.pow(1 - Math.pow(t, 1.7), 1 / 1.7);
  }
  const t = (VC - v) / VC;
  return Math.pow(1 - Math.pow(t, 2.2), 1 / 2.2);
}
/** half width factor in unit space: lobes and indentations only ever REDUCE the base dome (<= 1). */
export function domeHalf(v: number, u = 0): number {
  const b = baseDome(v);
  if (b <= 0) return 0;
  const ang = Math.atan2((v - VC) * 1.15, u * 0.95);
  const l1 = (1 - Math.cos(lobeN * (ang - lobePsi))) / 2; // 0 on protruding lobes, 1 in notches
  const l2 = (1 + Math.sin(7.3 * ang + lobeB)) / 2;
  const lobe = 1 - 0.17 * l1 - 0.06 * l2 - 0.02 * Math.sin(2 * ang + lobeC);
  return b * clamp(lobe, 0.7, 1);
}
/** the lower crown edge lifts in places so limbs show underneath (ref 6) */
function lowerLift(u: number): number {
  const s = (1 + Math.sin(4.6 * u + liftPhase)) / 2;
  return 0.2 * Math.pow(s, 1.6) * (0.4 + 0.6 * Math.abs(u));
}

const LIGHT_X = -0.55;
const LIGHT_Y = 0.83;

interface Pt {
  x: number;
  y: number;
}

export function generateTree(seed: number): TreeModel {
  const rnd = new Rand(hashSeed(seed, 0xc20f));
  const tanLean = Math.tan((rnd.range(-3, 3) * Math.PI) / 180);
  lobeN = rnd.chance(0.5) ? 4 : 5;
  lobePsi = rnd.range(-0.35, 0.35);
  lobeB = rnd.range(0, 6.28);
  lobeC = rnd.range(0, 6.28);
  liftPhase = rnd.range(0, 6.28);

  // ------------------------------------------------------------------ gaps (limbs read through)
  const gaps: Array<{ x: number; y: number; r: number; x2: number; y2: number; r2: number }> = [];
  for (let i = 0; i < 5; i++) {
    for (let t = 0; t < 60; t++) {
      const u = rnd.range(-0.55, 0.55);
      const v = rnd.range(0.3, 0.7);
      if (Math.abs(u) > domeHalf(v, u) * 0.6) continue; // interior only: never a bite out of the silhouette
      const gx = u * SXD;
      const gy = YB0 + v * SYD;
      if (gaps.every((g) => Math.hypot(g.x - gx, g.y - gy) > 105)) {
        const r = rnd.range(15, 22);
        const a = rnd.range(0, 6.28);
        gaps.push({ x: gx, y: gy, r, x2: gx + Math.cos(a) * r * 1.1, y2: gy + Math.sin(a) * r * 0.9, r2: r * rnd.range(0.55, 0.8) });
        break;
      }
    }
  }
  const inGap = (x: number, y: number, extra: number) =>
    gaps.some((g) => Math.hypot(x - g.x, y - (g.y + 10)) < g.r + extra || Math.hypot(x - g.x2, y - (g.y2 + 10)) < g.r2 + extra);

  // ------------------------------------------------------------------ clumps: best-candidate ordering inside the dome
  const sampleDome = (): { u: number; v: number } => {
    for (let t = 0; t < 80; t++) {
      const u = rnd.range(-1, 1);
      const v = rnd.range(0, 1);
      if (Math.abs(u) <= domeHalf(v, u) && v >= lowerLift(u)) return { u, v };
    }
    return { u: 0, v: 0.55 };
  };
  const pts: Array<{ u: number; v: number; x: number; y: number; forced?: boolean }> = [];
  const apexU = rnd.range(0.08, 0.2) * rnd.sign();
  const forced: Array<{ u: number; v: number }> = [
    { u: rnd.range(-0.08, 0.08), v: 0.6 }, // 0: centre
    { u: -1, v: VC }, // 1: left extreme  -> mature width exactly W
    { u: 1, v: VC }, // 2: right extreme
    { u: apexU, v: 1 }, // 3: apex (slightly off-centre) -> mature height exactly H
  ];
  for (let i = 0; i < NTOT; i++) {
    let best: { u: number; v: number; x: number; y: number; forced?: boolean } | null = null;
    if (i < forced.length) {
      const f = forced[i]!;
      best = { u: f.u, v: f.v, x: f.u * SXD, y: YB0 + f.v * SYD, forced: true };
    } else {
      let bestD = -1;
      for (let k = 0; k < 12; k++) {
        let c = sampleDome();
        let guard = 0;
        while (inGap(c.u * SXD, YB0 + c.v * SYD, 20) && guard++ < 40) c = sampleDome();
        const x = c.u * SXD;
        const y = YB0 + c.v * SYD;
        let md = 1e9;
        for (const p of pts) md = Math.min(md, Math.hypot(p.x - x, (p.y - y) * 1.15));
        if (md > bestD) {
          bestD = md;
          best = { u: c.u, v: c.v, x, y };
        }
      }
    }
    pts.push(best!);
  }

  const clumps: Clump[] = [];
  const lightOf = (u: number, v: number) => (-0.6 * u + 0.8 * ((v - 0.45) / 0.55)) * 0.9 + rnd.gauss() * 0.18;
  for (let i = 0; i < NTOT; i++) {
    const p = pts[i]!;
    const L = lightOf(p.u, p.v);
    let kind: SpriteKind = L > 0.3 ? 'lit' : L < -0.3 ? 'shade' : 'mid';
    if (kind === 'lit' && rnd.chance(0.45)) kind = rnd.chance(0.7) ? 'gold' : 'coral';
    const variant = rnd.int(0, SPRITE_POOL[kind] - 1);
    const forcedPt = !!p.forced;
    const varW = forcedPt ? 1 : rnd.chance(0.2) ? rnd.range(1.15, 1.55) : rnd.range(0.7, 1.12);
    const backClump = !forcedPt && rnd.chance(0.2) && p.v > 0.15 && kind !== 'gold' && kind !== 'coral';
    const front = !backClump && (kind === 'lit' || kind === 'gold' || kind === 'coral' || rnd.chance(0.4));
    // varied aspect and tilt break up the horizontal "shelf" look
    const hr = forcedPt ? 0.62 : rnd.chance(0.3) ? rnd.range(0.82, 1.0) : rnd.range(0.55, 0.78);
    const rot = forcedPt ? rnd.range(-0.05, 0.05) : rnd.chance(0.3) ? rnd.range(-0.32, 0.32) : rnd.range(-0.12, 0.12);
    clumps.push({
      u: p.u, v: p.v, x0: p.x, y0: p.y, w0: CLUMP_W0 * varW, hr, kind, variant, rot,
      layer: backClump ? 1 : front ? 3 : 2, birth: birthOfRank(i), phase: rnd.range(0, 6.28), mass: false,
      inner: Math.abs(p.u) < domeHalf(p.v, p.u) * 0.72 && p.v > 0.22 && p.v < 0.82,
    });
  }
  const massBirths = [0.035, 0.06, 0.09, 0.12, 0.16, 0.21, 0.28, 0.38];
  for (let i = 0; i < massBirths.length; i++) {
    let u = 0;
    let v = 0.4;
    for (let t = 0; t < 30; t++) {
      u = rnd.range(-0.45, 0.5);
      v = rnd.range(0.2, 0.62);
      if (Math.abs(u) <= domeHalf(v, u) * 0.6 && !inGap(u * SXD, YB0 + v * SYD, 70)) break;
    }
    clumps.push({
      u, v, x0: u * SXD, y0: YB0 + v * SYD, w0: rnd.range(140, 190), hr: rnd.range(0.66, 0.8), kind: 'back',
      variant: rnd.int(0, SPRITE_POOL.back - 1), rot: rnd.range(-0.05, 0.05), layer: 0, birth: massBirths[i]!, phase: rnd.range(0, 6.28), mass: true, inner: false,
    });
  }

  // a deep back-wash sits behind each gap, so limbs read against emerald rather than bare paper
  gaps.forEach((g, gi) => {
    clumps.push({
      u: g.x / SXD, v: (g.y - YB0) / SYD, x0: g.x, y0: g.y - 14, w0: g.r * 5.2, hr: 0.8, kind: 'back',
      variant: rnd.int(0, SPRITE_POOL.back - 1), rot: rnd.range(-0.1, 0.1), layer: 0, birth: 0.1 + gi * 0.07, phase: rnd.range(0, 6.28), mass: true, inner: false,
    });
  });

  // ------------------------------------------------------------------ anchors for the skeleton
  const A: Pt[] = [];
  for (const c of clumps) if (!c.mass) A.push({ x: c.x0, y: c.y0 });
  for (const g of gaps) A.push({ x: g.x + rnd.range(-g.r * 0.5, g.r * 0.5), y: g.y + rnd.range(-g.r * 0.5, g.r * 0.5) });
  for (let k = 0; k < 18; k++) {
    const c = sampleDome();
    A.push({ x: c.u * SXD * 0.75, y: YB0 + c.v * SYD * 0.8 + 8 });
  }

  // ------------------------------------------------------------------ hierarchical limbs
  interface Limb {
    x: number[];
    y: number[];
    cum: number[];
    depth: number;
    parent: number;
    sAttach: number;
    children: Array<{ s: number; limb: number }>;
    r0: number;
    isTwig: boolean;
  }
  const limbs: Limb[] = [];
  const centroid = (S: number[]): Pt => {
    let x = 0;
    let y = 0;
    for (const i of S) {
      x += A[i]!.x;
      y += A[i]!.y;
    }
    return { x: x / S.length, y: y / S.length };
  };
  const splitGroups = (S: number[], k: number): number[][] => {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const i of S) {
      minX = Math.min(minX, A[i]!.x);
      maxX = Math.max(maxX, A[i]!.x);
      minY = Math.min(minY, A[i]!.y);
      maxY = Math.max(maxY, A[i]!.y);
    }
    const useX = (maxX - minX) * 1.0 >= (maxY - minY) * 0.9;
    const sorted = [...S].sort((a, b) => (useX ? A[a]!.x - A[b]!.x : A[a]!.y - A[b]!.y));
    const out: number[][] = [];
    if (k === 2) {
      const cut = clamp(Math.round(sorted.length * rnd.range(0.38, 0.62)), 1, sorted.length - 1);
      out.push(sorted.slice(0, cut), sorted.slice(cut));
    } else {
      const c1 = clamp(Math.round(sorted.length * rnd.range(0.28, 0.4)), 1, sorted.length - 2);
      const c2 = clamp(Math.round(sorted.length * rnd.range(0.62, 0.75)), c1 + 1, sorted.length - 1);
      out.push(sorted.slice(0, c1), sorted.slice(c1, c2), sorted.slice(c2));
    }
    return out;
  };
  /** Catmull-Rom through control points (first/last tangents from virtual points) sampled every ~5 units. */
  const spline = (ctrl: Pt[], startTan: Pt | null): { x: number[]; y: number[]; at: number[] } => {
    const xs: number[] = [];
    const ys: number[] = [];
    const at: number[] = [];
    const n = ctrl.length;
    const ext = (i: number): Pt => {
      if (i < 0) {
        const d = Math.hypot(ctrl[1]!.x - ctrl[0]!.x, ctrl[1]!.y - ctrl[0]!.y);
        const t = startTan ?? { x: ctrl[1]!.x - ctrl[0]!.x, y: ctrl[1]!.y - ctrl[0]!.y };
        const tl = Math.hypot(t.x, t.y) || 1;
        return { x: ctrl[0]!.x - (t.x / tl) * d * 0.9, y: ctrl[0]!.y - (t.y / tl) * d * 0.9 };
      }
      if (i >= n) {
        const a = ctrl[n - 1]!;
        const b = ctrl[n - 2]!;
        return { x: a.x + (a.x - b.x) * 0.5, y: a.y + (a.y - b.y) * 0.5 };
      }
      return ctrl[i]!;
    };
    for (let i = 0; i < n - 1; i++) {
      const p0 = ext(i - 1), p1 = ctrl[i]!, p2 = ctrl[i + 1]!, p3 = ext(i + 2);
      // centripetal Catmull-Rom (Barry-Goldman): no overshoot / kinks with uneven control spacing
      const t0 = 0;
      const t1 = t0 + Math.sqrt(Math.max(1e-6, Math.hypot(p1.x - p0.x, p1.y - p0.y)));
      const t2 = t1 + Math.sqrt(Math.max(1e-6, Math.hypot(p2.x - p1.x, p2.y - p1.y)));
      const t3 = t2 + Math.sqrt(Math.max(1e-6, Math.hypot(p3.x - p2.x, p3.y - p2.y)));
      const segs = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 5));
      at.push(xs.length);
      for (let q = 0; q < segs; q++) {
        const t = t1 + ((t2 - t1) * q) / segs;
        const lerp2 = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
          const f = (t - ta) / (tb - ta);
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        };
        const A1 = lerp2(p0, p1, t0, t1);
        const A2 = lerp2(p1, p2, t1, t2);
        const A3 = lerp2(p2, p3, t2, t3);
        const B1 = lerp2(A1, A2, t0, t2);
        const B2 = lerp2(A2, A3, t1, t3);
        const C = lerp2(B1, B2, t1, t2);
        xs.push(C.x);
        ys.push(C.y);
      }
    }
    at.push(xs.length);
    xs.push(ctrl[n - 1]!.x);
    ys.push(ctrl[n - 1]!.y);
    return { x: xs, y: ys, at };
  };
  const cumOf = (xs: number[], ys: number[]) => {
    const c = [0];
    for (let i = 1; i < xs.length; i++) c.push(c[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
    return c;
  };
  const rot = (t: Pt, a: number): Pt => ({ x: t.x * Math.cos(a) - t.y * Math.sin(a), y: t.x * Math.sin(a) + t.y * Math.cos(a) });
  const norm = (t: Pt): Pt => {
    const l = Math.hypot(t.x, t.y) || 1;
    return { x: t.x / l, y: t.y / l };
  };

  const buildLimb = (S: number[], start: Pt, tan: Pt, depth: number, parent: number, sAttach: number): number => {
    const idx = limbs.length;
    const limb: Limb = { x: [], y: [], cum: [], depth, parent, sAttach, children: [], r0: 0, isTwig: S.length === 1 };
    limbs.push(limb);
    const ctrl: Pt[] = [start];
    const sideGroups: Array<{ group: number[]; level: number }> = [];
    let cur = S;
    let guard = 0;
    while (cur.length > 3 && guard++ < 7) {
      const k = cur.length >= 9 && rnd.chance(0.3) ? 3 : 2;
      const groups = splitGroups(cur, k);
      let mi = 0;
      for (let g = 1; g < groups.length; g++) {
        const a = groups[g]!;
        const b = groups[mi]!;
        if (a.length > b.length || (a.length === b.length && centroid(a).y > centroid(b).y)) mi = g;
      }
      const main = groups[mi]!;
      const mc = centroid(main);
      // keep control points moving outward from the start
      const last = ctrl[ctrl.length - 1]!;
      if (Math.hypot(mc.x - start.x, mc.y - start.y) < Math.hypot(last.x - start.x, last.y - start.y) * 0.9 && ctrl.length > 1) ctrl.pop();
      ctrl.push(mc);
      groups.forEach((g, gi) => {
        if (gi !== mi) sideGroups.push({ group: g, level: ctrl.length - 1 });
      });
      cur = main;
    }
    // chain ends at the nearest remaining anchor; extra anchors get tiny twigs
    const lastC = ctrl[ctrl.length - 1]!;
    let ei = 0;
    let ed = 1e9;
    cur.forEach((ai, k) => {
      const d = Math.hypot(A[ai]!.x - lastC.x, A[ai]!.y - lastC.y);
      if (d < ed) {
        ed = d;
        ei = k;
      }
    });
    const endAnchor = cur[ei]!;
    if (ctrl.length === 1 || Math.hypot(A[endAnchor]!.x - lastC.x, A[endAnchor]!.y - lastC.y) > 6) ctrl.push({ x: A[endAnchor]!.x, y: A[endAnchor]!.y });
    else ctrl[ctrl.length - 1] = { x: A[endAnchor]!.x, y: A[endAnchor]!.y };
    // gnarl: perpendicular offsets on interior control points
    for (let i = 1; i < ctrl.length - 1; i++) {
      const d = norm({ x: ctrl[i + 1]!.x - ctrl[i - 1]!.x, y: ctrl[i + 1]!.y - ctrl[i - 1]!.y });
      const seg = Math.hypot(ctrl[i]!.x - ctrl[i - 1]!.x, ctrl[i]!.y - ctrl[i - 1]!.y);
      const off = rnd.gauss() * 0.09 * seg;
      ctrl[i] = { x: ctrl[i]!.x - d.y * off, y: ctrl[i]!.y + d.x * off };
    }
    if (ctrl.length === 2 && !limb.isTwig) {
      const mid = { x: (ctrl[0]!.x + ctrl[1]!.x) / 2, y: (ctrl[0]!.y + ctrl[1]!.y) / 2 };
      const d = norm({ x: ctrl[1]!.x - ctrl[0]!.x, y: ctrl[1]!.y - ctrl[0]!.y });
      const off = rnd.gauss() * 0.08 * Math.hypot(ctrl[1]!.x - ctrl[0]!.x, ctrl[1]!.y - ctrl[0]!.y);
      ctrl.splice(1, 0, { x: mid.x - d.y * off, y: mid.y + d.x * off });
    }
    const path = spline(ctrl, tan);
    limb.x = path.x;
    limb.y = path.y;
    limb.cum = cumOf(path.x, path.y);
    const total = limb.cum[limb.cum.length - 1]!;
    // side limbs: attached at varied heights between consecutive control points, leaving at 25-50 deg
    const used: number[] = [];
    for (const sg of sideGroups) {
      const lv = Math.min(sg.level, path.at.length - 1);
      const iA = path.at[Math.max(0, lv - 1)]!;
      const iB = path.at[lv]!;
      let sAt = limb.cum[iA]! + (limb.cum[iB]! - limb.cum[iA]!) * rnd.range(0.3, 0.7);
      for (let t = 0; t < 6 && used.some((u) => Math.abs(u - sAt) < 14); t++) sAt += 9;
      sAt = Math.min(sAt, total * 0.95);
      used.push(sAt);
      let j = 1;
      while (j < limb.cum.length - 1 && limb.cum[j]! < sAt) j++;
      const f = (sAt - limb.cum[j - 1]!) / Math.max(1e-6, limb.cum[j]! - limb.cum[j - 1]!);
      const P = { x: limb.x[j - 1]! + (limb.x[j]! - limb.x[j - 1]!) * f, y: limb.y[j - 1]! + (limb.y[j]! - limb.y[j - 1]!) * f };
      const T = norm({ x: limb.x[j]! - limb.x[j - 1]!, y: limb.y[j]! - limb.y[j - 1]! });
      const tc = centroid(sg.group);
      const to = norm({ x: tc.x - P.x, y: tc.y - P.y });
      const cross = T.x * to.y - T.y * to.x;
      const ang = Math.acos(clamp(T.x * to.x + T.y * to.y, -1, 1));
      const use = clamp(ang, 0.44, 0.87) * (cross >= 0 ? 1 : -1);
      const child = buildLimb(sg.group, P, rot(T, use), depth + 1, idx, sAt / total);
      limb.children.push({ s: sAt, limb: child });
    }
    // twigs for remaining anchors
    cur.forEach((ai) => {
      if (ai === endAnchor) return;
      const sAt = total * rnd.range(0.72, 0.95);
      let j = 1;
      while (j < limb.cum.length - 1 && limb.cum[j]! < sAt) j++;
      const P = { x: limb.x[j]!, y: limb.y[j]! };
      const T = norm({ x: limb.x[j]! - limb.x[j - 1]!, y: limb.y[j]! - limb.y[j - 1]! });
      const to = norm({ x: A[ai]!.x - P.x, y: A[ai]!.y - P.y });
      const cross = T.x * to.y - T.y * to.x;
      const ang = Math.acos(clamp(T.x * to.x + T.y * to.y, -1, 1));
      const child = buildLimb([ai], P, rot(T, clamp(ang, 0.4, 0.9) * (cross >= 0 ? 1 : -1)), depth + 1, idx, sAt / total);
      limb.children.push({ s: sAt, limb: child });
    });
    return idx;
  };

  const buildTrunk = (S: number[], pre: Pt[], k: number): number => {
    // like buildLimb, but the first split into k groups happens AT the fork and the chain keeps going through the main group
    const idx = limbs.length;
    const limb: Limb = { x: [], y: [], cum: [], depth: 0, parent: -1, sAttach: 0, children: [], r0: 0, isTwig: false };
    limbs.push(limb);
    const groups = splitGroups(S, k);
    let mi = 0;
    for (let g = 1; g < groups.length; g++) if (groups[g]!.length > groups[mi]!.length) mi = g;
    const mainSet = groups[mi]!;
    const ctrl: Pt[] = [...pre];
    const sideGroups: Array<{ group: number[]; level: number }> = [];
    let cur = mainSet;
    let guard = 0;
    while (cur.length > 3 && guard++ < 7) {
      const kk = cur.length >= 9 && rnd.chance(0.3) ? 3 : 2;
      const gs = splitGroups(cur, kk);
      let m2 = 0;
      for (let g = 1; g < gs.length; g++) {
        if (gs[g]!.length > gs[m2]!.length || (gs[g]!.length === gs[m2]!.length && centroid(gs[g]!).y > centroid(gs[m2]!).y)) m2 = g;
      }
      const mc = centroid(gs[m2]!);
      ctrl.push(mc);
      gs.forEach((g, gi) => {
        if (gi !== m2) sideGroups.push({ group: g, level: ctrl.length - 1 });
      });
      cur = gs[m2]!;
    }
    let ei = 0;
    let ed = 1e9;
    const lastC = ctrl[ctrl.length - 1]!;
    cur.forEach((ai, q) => {
      const d = Math.hypot(A[ai]!.x - lastC.x, A[ai]!.y - lastC.y);
      if (d < ed) {
        ed = d;
        ei = q;
      }
    });
    const endAnchor = cur[ei]!;
    ctrl.push({ x: A[endAnchor]!.x, y: A[endAnchor]!.y });
    for (let i = pre.length; i < ctrl.length - 1; i++) {
      const d = norm({ x: ctrl[i + 1]!.x - ctrl[i - 1]!.x, y: ctrl[i + 1]!.y - ctrl[i - 1]!.y });
      const seg = Math.hypot(ctrl[i]!.x - ctrl[i - 1]!.x, ctrl[i]!.y - ctrl[i - 1]!.y);
      const off = rnd.gauss() * 0.09 * seg;
      ctrl[i] = { x: ctrl[i]!.x - d.y * off, y: ctrl[i]!.y + d.x * off };
    }
    const path = spline(ctrl, null);
    limb.x = path.x;
    limb.y = path.y;
    limb.cum = cumOf(path.x, path.y);
    const total = limb.cum[limb.cum.length - 1]!;
    const attachAt = (sAt: number, target: Pt, group: number[], clampLo: number, clampHi: number) => {
      let j = 1;
      while (j < limb.cum.length - 1 && limb.cum[j]! < sAt) j++;
      const f = (sAt - limb.cum[j - 1]!) / Math.max(1e-6, limb.cum[j]! - limb.cum[j - 1]!);
      const P = { x: limb.x[j - 1]! + (limb.x[j]! - limb.x[j - 1]!) * f, y: limb.y[j - 1]! + (limb.y[j]! - limb.y[j - 1]!) * f };
      const T = norm({ x: limb.x[j]! - limb.x[j - 1]!, y: limb.y[j]! - limb.y[j - 1]! });
      const to = norm({ x: target.x - P.x, y: target.y - P.y });
      const cross = T.x * to.y - T.y * to.x;
      const ang = Math.acos(clamp(T.x * to.x + T.y * to.y, -1, 1));
      const use = clamp(ang, clampLo, clampHi) * (cross >= 0 ? 1 : -1);
      const child = buildLimb(group, P, rot(T, use), 1, idx, sAt / total);
      limb.children.push({ s: sAt, limb: child });
    };
    // the other scaffolds leave the trunk at the fork, widely splayed
    const sFork = limb.cum[path.at[pre.length - 1]!]!;
    groups.forEach((g, gi) => {
      if (gi === mi) return;
      attachAt(sFork + 2 + gi * 3, centroid(g), g, 0.5, 0.95);
    });
    // nested side limbs along the continuation, leaving at 25-50 deg
    const used: number[] = [];
    for (const sg of sideGroups) {
      const lv = Math.min(sg.level, path.at.length - 1);
      const iA = path.at[Math.max(0, lv - 1)]!;
      const iB = path.at[lv]!;
      let sAt = limb.cum[iA]! + (limb.cum[iB]! - limb.cum[iA]!) * rnd.range(0.3, 0.7);
      for (let t = 0; t < 6 && used.some((u) => Math.abs(u - sAt) < 14); t++) sAt += 9;
      sAt = Math.min(Math.max(sAt, sFork + 16), total * 0.95);
      used.push(sAt);
      attachAt(sAt, centroid(sg.group), sg.group, 0.44, 0.87);
    }
    cur.forEach((ai) => {
      if (ai === endAnchor) return;
      attachAt(total * rnd.range(0.82, 0.96), { x: A[ai]!.x, y: A[ai]!.y }, [ai], 0.4, 0.9);
    });
    return idx;
  };

  // trunk (limb 0): gentle S-curve up to the fork just below the crown base
  const trunkTop = YB0 - 42;
  const wob = rnd.range(0, 6.28);
  const wobA = rnd.range(7, 13);
  const tx: number[] = [];
  const ty: number[] = [];
  for (let y = 0; y <= trunkTop + 0.001; y += 5) {
    tx.push(wobA * Math.sin(y / 85 + wob) * smoothstep(y / 110) + wobA * 0.4 * Math.sin(y / 38 + wob * 2) * smoothstep(y / 150));
    ty.push(y);
  }
  // trunk + main scaffold form ONE chain; the other scaffolds leave it at the fork (Y-fork, ref 6)
  const preCtrl: Pt[] = [];
  for (let i = 0; i < tx.length; i += 6) preCtrl.push({ x: tx[i]!, y: ty[i]! });
  const lastT = { x: tx[tx.length - 1]!, y: ty[ty.length - 1]! };
  if (Math.hypot(preCtrl[preCtrl.length - 1]!.x - lastT.x, preCtrl[preCtrl.length - 1]!.y - lastT.y) > 8) preCtrl.push(lastT);
  else preCtrl[preCtrl.length - 1] = lastT;
  const nScaff = rnd.chance(0.4) ? 2 : 3;
  const allIdx = A.map((_, i) => i);
  buildTrunk(allIdx, preCtrl, nScaff);

  // ------------------------------------------------------------------ pipe-model radii
  const tip = 0.85;
  const solve = (p: number) => {
    for (let i = limbs.length - 1; i >= 0; i--) {
      const L = limbs[i]!;
      let s = Math.pow(tip, p);
      for (const c of L.children) s += Math.pow(limbs[c.limb]!.r0, p);
      L.r0 = Math.pow(s, 1 / p);
    }
    return limbs[0]!.r0;
  };
  let pLo = 1.3;
  let pHi = 3.0;
  for (let it = 0; it < 26; it++) {
    const pm = (pLo + pHi) / 2;
    if (solve(pm) > 15.5) pLo = pm;
    else pHi = pm;
  }
  const P_EXP = (pLo + pHi) / 2;
  solve(P_EXP);

  // ------------------------------------------------------------------ pack branches
  const branches: Branch[] = [];
  const packBranch = (
    xs: number[], ys: number[], profile: (i: number, s: number, len: number) => number, parent: number, tAttach: number, depth: number,
    isRoot: boolean, trunk: boolean,
  ): Branch => {
    const n = xs.length;
    const px = new Float32Array(xs);
    const py = new Float32Array(ys);
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!);
    const len = cum[n - 1]!;
    const rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let r = profile(i, cum[i]!, len);
      if (trunk) {
        r += 8 * Math.exp(-cum[i]! / 24) + 3.5 * Math.exp(-cum[i]! / 80);
      }
      rad[i] = Math.max(0.35, r);
    }
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n - 1; i++) rad[i] = (rad[i - 1]! + 2 * rad[i]! + rad[i + 1]!) / 4;
    const r0 = rad[0]!;
    const jitA = new Float32Array(n);
    const jitB = new Float32Array(n);
    let ja = 0;
    let jb = 0;
    for (let i = 0; i < n; i++) {
      ja = ja * 0.7 + rnd.gauss() * 0.06;
      jb = jb * 0.7 + rnd.gauss() * 0.05;
      jitA[i] = ja;
      jitB[i] = jb;
    }
    const dx = px[n - 1]! - px[0]!;
    const dy = py[n - 1]! - py[0]!;
    const nl = Math.hypot(dx, dy) || 1;
    const lit = (-dy / nl) * LIGHT_X + (dx / nl) * LIGHT_Y;
    const thick = r0 >= 2.5;
    const hatch: number[] = [];
    if (r0 >= 2.8) {
      const cnt = Math.min(150, Math.floor((len * r0) / 4.5));
      for (let i = 0; i < cnt; i++) {
        const light = rnd.chance(0.22);
        hatch.push(
          rnd.range(0.02, 0.97), light ? rnd.range(-0.85, -0.2) : rnd.range(0.2, 0.95),
          rnd.range(7, 42) * Math.min(1, r0 / 9 + 0.3), rnd.range(-0.1, 0.1), light ? 1 : 0,
        );
      }
    }
    const blooms: number[] = [];
    if (r0 >= 4) {
      const cnt = Math.min(14, Math.floor(len / 14));
      for (let i = 0; i < cnt; i++) blooms.push(rnd.range(0.03, 0.97), rnd.range(-0.8, 0.8), rnd.range(4, 9) * Math.min(1, r0 / 8), rnd.int(0, 2));
    }
    const knots: number[] = [];
    if (trunk) {
      const kn = rnd.int(1, 2);
      for (let i = 0; i < kn; i++) knots.push(rnd.range(0.08, 0.5), rnd.range(-0.4, 0.4), rnd.range(3.5, 5.5));
    }
    const ink = new Uint8Array(2 * n);
    for (let side = 0; side < 2; side++) {
      let i = 0;
      while (i < n) {
        const run = rnd.int(5, 13);
        const cls = rnd.int(1, 3);
        for (let q = 0; q < run && i < n; q++, i++) ink[side * n + i] = r0 >= 2 ? cls : 2;
        if (r0 >= 2) i += rnd.chance(side === 0 ? 0.6 : 0.3) ? rnd.int(1, 3) : 0;
      }
    }
    const b: Branch = {
      idx: branches.length, parent, tAttach, depth, n, px, py, cum, len, rad, jitA, jitB, birth: 0, end: 0,
      lightSign: lit >= 0 ? 1 : -1, hatch: new Float32Array(hatch), blooms: new Float32Array(blooms), knots: new Float32Array(knots), ink,
      tone: rnd.next(), isRoot, terminal: false, r0, thick,
    };
    branches.push(b);
    return b;
  };
  const timeAtFrac = (b: Branch, f: number) => b.birth + invSmooth(clamp(f, 0, 1)) * (b.end - b.birth);
  const branchOfLimb: number[] = [];
  let tips = 0;
  for (let li = 0; li < limbs.length; li++) {
    const L = limbs[li]!;
    const total = L.cum[L.cum.length - 1]!;
    const profile = (_i: number, s: number): number => {
      let sum = i0Pow(tip);
      for (const c of L.children) {
        const w = 1 - smoothstep((s - (c.s - 18)) / 36);
        sum += Math.pow(limbs[c.limb]!.r0, P_EXP) * w;
      }
      const r = Math.pow(sum, 1 / P_EXP);
      if (L.depth === 1) {
        // smooth fork collar: scaffolds leave the trunk top nearly as thick as the trunk, then taper
        const k = 1 - smoothstep(s / 34);
        return r + (limbs[0]!.r0 * 0.8 - r) * Math.max(0, k);
      }
      return r;
    };
    const i0Pow = (t: number) => Math.pow(t, P_EXP);
    const parentIdx = L.parent >= 0 ? branchOfLimb[L.parent]! : -1;
    const b = packBranch(L.x, L.y, profile, parentIdx, L.parent >= 0 ? L.sAttach : 0, L.depth, false, li === 0);
    branchOfLimb.push(b.idx);
    if (li === 0) {
      b.birth = 0;
      b.end = 0.001;
    } else {
      const pb = branches[parentIdx]!;
      const hf = clamp((b.py[b.n - 1]! - YB0) / HC0, 0, 1);
      const depthBase = [0, 0.02, 0.07, 0.15, 0.28, 0.42, 0.55, 0.66][Math.min(L.depth, 7)]!;
      let birth = L.depth === 1 ? depthBase + rnd.range(0, 0.03) : depthBase + rnd.range(0, 0.1) + 0.08 * hf;
      const parentReach = pb.end <= 0.002 ? 0 : timeAtFrac(pb, Math.min(L.sAttach, 0.96)) + 0.004;
      birth = Math.min(Math.max(birth, parentReach), 0.94);
      const span = L.depth === 1 ? rnd.range(0.09, 0.14) : L.depth <= 4 ? rnd.range(0.1, 0.17) : rnd.range(0.07, 0.12);
      b.birth = birth;
      b.end = Math.min(0.985, Math.max(birth + span, birth + 0.03));
    }
    if (L.children.length === 0) {
      b.terminal = true;
      tips++;
    }
    void total;
  }

  // surface roots (visible flare melting into the ground wash)
  const nSurf = 5;
  for (let k = 0; k < nSurf; k++) {
    const sd = k % 2 === 0 ? 1 : -1;
    const L = rnd.range(34, 64) * (k < 2 ? 1.1 : 0.85);
    const n = Math.ceil(L / 4) + 1;
    let th = (sd > 0 ? 0 : Math.PI) - sd * rnd.range(0.05, 0.25);
    let x = sd * rnd.range(3, 8);
    let y = rnd.range(5, 9);
    const xs: number[] = [];
    const ys: number[] = [];
    const r0 = rnd.range(6, 9.5) * (k < 2 ? 1 : 0.8);
    for (let i = 0; i < n; i++) {
      xs.push(x);
      ys.push(y);
      th += -sd * 0.015 + rnd.gauss() * 0.05;
      x += Math.cos(th) * 4;
      y += Math.sin(th) * 4 * (i > n * 0.5 ? 0.6 : 1);
      if (y < 0.5) y = 0.5;
    }
    const b = packBranch(xs, ys, (_i, s, len) => Math.max(0.5, r0 * Math.pow(1 - s / len, 1.3) + 0.5), 0, 0, 0, true, false);
    b.birth = 0;
    b.end = rnd.range(0.25, 0.45);
    b.terminal = true;
  }

  // open the parent's contour where a child limb departs
  for (const c of branches) {
    if (c.parent < 0 || c.isRoot || c.n < 3) continue;
    const pb = branches[c.parent]!;
    const j = Math.round(c.tAttach * (pb.n - 1));
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(pb.n - 1, j + 1);
    const tx2 = pb.px[j1]! - pb.px[j0]!;
    const ty2 = pb.py[j1]! - pb.py[j0]!;
    const kk = Math.min(c.n - 1, 3);
    const cx = c.px[kk]! - c.px[0]!;
    const cy = c.py[kk]! - c.py[0]!;
    const rightSide = tx2 * cy - ty2 * cx < 0 ? 1 : -1;
    const litS = -pb.lightSign;
    const side = rightSide === litS ? 0 : 1;
    const w = Math.ceil((c.r0 * 1.3) / 4.5) + 1;
    for (let i = Math.max(0, j - w); i <= Math.min(pb.n - 1, j + w); i++) pb.ink[side * pb.n + i] = 0;
  }

  // ------------------------------------------------------------------ root system (soil band)
  const roots: RootBranch[] = [];
  const packRoot = (xs: number[], ys: number[], r0: number, depth: number, parent: number, birth: number, span: number): number => {
    const n = xs.length;
    const px = new Float32Array(xs);
    const py = new Float32Array(ys);
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!);
    const len = cum[n - 1]!;
    const rad = new Float32Array(n);
    for (let i = 0; i < n; i++) rad[i] = Math.max(0.3, r0 * Math.pow(1 - cum[i]! / Math.max(1, len), 0.9) + 0.3);
    roots.push({ n, px, py, cum, len, rad, birth, end: Math.min(1, birth + span), depth, parent });
    return roots.length - 1;
  };
  const growRoot = (x0: number, y0: number, th0: number, L: number, r0: number, depth: number, parent: number, birth: number, span: number): number => {
    const xs = [x0];
    const ys = [y0];
    let th = th0;
    const n = Math.max(3, Math.ceil(L / 5));
    const k0 = rnd.gauss() * 0.01;
    for (let i = 1; i <= n; i++) {
      th += k0 + rnd.gauss() * 0.06 + 0.035 * Math.sin(i * 0.45 + depth + L * 0.1);
      const yc = ys[ys.length - 1]!;
      if (yc < -SOIL_DEPTH * 0.42) {
        // deep: relax toward horizontal so roots spread inside the soil band
        const target = Math.cos(th) >= 0 ? 0 : Math.PI;
        let d = target - th;
        d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        th += d * 0.07;
      }
      xs.push(xs[xs.length - 1]! + Math.cos(th) * 5);
      ys.push(Math.min(-1.5, Math.max(-SOIL_DEPTH * 0.9, ys[ys.length - 1]! + Math.sin(th) * 5)));
    }
    const me = packRoot(xs, ys, r0, depth, parent, birth, span);
    const R = roots[me]!;
    if (depth < 3) {
      const nk = depth === 0 ? rnd.int(1, 3) : depth === 1 ? rnd.int(1, 2) : rnd.int(0, 1);
      let prevT = 0.15;
      for (let k = 0; k < nk; k++) {
        const t = clamp(prevT + rnd.range(0.12, 0.28), 0.2, 0.88);
        prevT = t;
        const j = Math.min(R.n - 2, Math.round(t * (R.n - 1)));
        const tt = Math.atan2(R.py[j + 1]! - R.py[j]!, R.px[j + 1]! - R.px[j]!);
        const side = rnd.sign();
        const ang = tt + side * rnd.range(0.45, 0.95);
        const cl = L * rnd.range(0.32, 0.55) * (1 - t * 0.4);
        const b2 = depth === 0 ? rnd.range(0.2, 0.45) : rnd.range(0.4, 0.7);
        growRoot(R.px[j]!, R.py[j]!, ang, Math.max(18, cl), r0 * rnd.range(0.3, 0.5), depth + 1, me, Math.min(0.75, b2 + t * 0.15), depth === 0 ? 0.3 : 0.25);
      }
    }
    return me;
  };
  const nMain = 6;
  let pulseRoot = 0;
  let pulseLen = 0;
  for (let k = 0; k < nMain; k++) {
    const sd = k % 2 === 0 ? 1 : -1;
    const down = rnd.range(0.1, 0.42);
    const th = sd > 0 ? -down : -Math.PI + down;
    const L = rnd.range(120, 190);
    const me = growRoot(sd * rnd.range(2, 6), -3, th, L, rnd.range(4.4, 6), 0, -1, rnd.range(0, 0.04), 0.9);
    if (roots[me]!.len > pulseLen) {
      pulseLen = roots[me]!.len;
      pulseRoot = me;
    }
  }

  // ------------------------------------------------------------------ specks, draw-order layers
  const specks: Speck[] = [];
  const cand: number[] = [];
  clumps.forEach((c, i) => {
    if (c.layer >= 2 && (c.kind === 'lit' || c.kind === 'gold' || c.kind === 'coral' || c.kind === 'mid') && c.v > 0.3) cand.push(i);
  });
  for (let i = 0; i < 22 && cand.length; i++) {
    const ci = cand[rnd.int(0, cand.length - 1)]!;
    const c = clumps[ci]!;
    const ang = rnd.range(0.2, Math.PI - 0.2) + (rnd.chance(0.3) ? Math.PI : 0);
    const col = rnd.next();
    const color = col < 0.45 ? '#7DB343' : col < 0.58 ? '#1E7F5C' : col < 0.82 ? '#F0B429' : col < 0.94 ? '#EC7357' : '#4A9AD4';
    specks.push({
      clump: ci, dx: Math.cos(ang) * rnd.range(0.55, 0.85), dy: Math.sin(ang) * rnd.range(0.35, 0.6) * c.hr + 0.1,
      len: rnd.range(1.1, 3.2), ang, color, alpha: rnd.range(0.4, 0.7), birth: Math.min(0.99, c.birth + 0.02),
    });
  }
  const byY = (a: number, b: number) => clumps[b]!.y0 - clumps[a]!.y0;
  const layerList: number[][] = [[], [], [], []];
  clumps.forEach((c, i) => layerList[c.layer]!.push(i));
  for (const l of layerList) l.sort(byY);
  const layers: TreeModel['layers'] = [
    Int32Array.from(layerList[0]!), Int32Array.from(layerList[1]!), Int32Array.from(layerList[2]!), Int32Array.from(layerList[3]!),
  ];

  return {
    seed, tanLean, branches, clumps, layers, specks, roots, pulseRoot, apex: 3,
    stats: {
      branches: branches.length, clumps: clumps.length, tips, roots: roots.length,
      warm: clumps.filter((c) => c.kind === 'gold' || c.kind === 'coral').length, gaps: gaps.length,
    },
  };
}

export function branchG(b: Branch, m: number): number {
  const d = b.end - b.birth;
  if (b.end <= 0.002) return 1;
  return d <= 0 ? (m >= b.end ? 1 : 0) : smoothstep((m - b.birth) / d);
}
export function clumpRamp(c: Clump, m: number): number {
  return smoothstep((m - c.birth) / RAMP);
}
export function branchKappa(b: Branch, m: number): number {
  if (b.end <= 0.002) return 1;
  const a = clamp((m - b.birth) / Math.max(0.05, 1 - b.birth), 0, 1);
  return 0.62 + 0.38 * a;
}
/** roots lead the canopy: their growth clock is m^0.6 */
export function rootClock(m: number): number {
  return Math.pow(clamp(m, 0, 1), 0.6);
}
export function rootG(r: RootBranch, m: number): number {
  const c = rootClock(m);
  const d = r.end - r.birth;
  return d <= 0 ? (c >= r.end ? 1 : 0) : smoothstep((c - r.birth) / d);
}

export function createState(model: TreeModel): TreeState {
  return {
    m: 0, g: new Float32Array(model.branches.length), kappa: new Float32Array(model.branches.length),
    clumpA: new Float32Array(model.clumps.length), rootG: new Float32Array(model.roots.length),
  };
}
export function evalState(model: TreeModel, m: number, st: TreeState): void {
  st.m = m;
  for (let i = 0; i < model.branches.length; i++) {
    const b = model.branches[i]!;
    st.g[i] = branchG(b, m);
    st.kappa[i] = branchKappa(b, m);
  }
  for (let i = 0; i < model.clumps.length; i++) st.clumpA[i] = clumpRamp(model.clumps[i]!, m);
  for (let i = 0; i < model.roots.length; i++) st.rootG[i] = rootG(model.roots[i]!, m);
}
