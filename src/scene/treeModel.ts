/**
 * Crown-space tree model.
 *
 * generateTree(seed) draws EVERY random number the tree will ever need, once, in a fixed order; rendering is a
 * pure function of (model, maturity).
 *
 * Structure
 *  - The crown envelope is a function of maturity m ONLY (same for every seed): a dome whose base sits at 35 %
 *    of the tree height, whose width/height ratio goes from ~0.5 (young) to W/H (mature).
 *  - Foliage clumps live in a unit dome (u,v). They are ordered by best-candidate (farthest-point) sampling so
 *    that ANY prefix covers the whole dome evenly; clump i is born at the maturity where the target clump count
 *    N(m) reaches i. World position = crownMap(m)(u,v), continuous in m. Clump size follows from the count so the
 *    born set always fills the current crown.
 *  - The skeleton is grown once in mature coordinates by space colonisation toward the clump anchors, with a
 *    pipe-model radius assignment, then mapped by the SAME crownMap, so limbs stay inside the foliage as the tree
 *    grows. Depth unlocks with m (leader + scaffold limbs first, finer branches later).
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
const RATIO_MAT = W / H;
export const CLUMP_W0 = 71;
export const NTOT = 125;
/** relative visible clump extents about the sprite pivot */
const K_HALFW = 0.36;
const K_UP = 0.83;
const K_HR = 0.62;
const INX0 = K_HALFW * CLUMP_W0;
const INY0 = K_UP * K_HR * CLUMP_W0;
const SXD = W / 2 - INX0;
const SYD = HC0 - INY0;
const RAMP = 0.025;

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
  /** crown width at this maturity */
  wc: number;
  kx: number;
  ky: number;
  /** clump size factor and mean world width */
  sf: number;
  wBar: number;
  tanLean: number;
}

export function crownMap(m: number, tanLean: number): CrownMap {
  const mm = Math.max(m, 0.004);
  const h = mm * H;
  const wc = h * crownRatio(mm);
  const F = clumpCount(mm) / NTOT;
  const sf = Math.sqrt(((wc / W) * mm) / F);
  const wBar = Math.min(CLUMP_W0 * sf, 0.8 * wc);
  const inX = K_HALFW * wBar;
  const inY = K_UP * K_HR * wBar;
  const kx = Math.max(0.01, (wc / 2 - inX) / SXD);
  const ky = Math.max(0.05, (HC0 * mm - inY) / SYD);
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
  /** clump indices per layer, in draw order */
  layers: [Int32Array, Int32Array, Int32Array, Int32Array];
  specks: Speck[];
  stats: { branches: number; clumps: number; warm: number; tips: number; gaps: number };
}

export interface TreeState {
  m: number;
  g: Float32Array;
  kappa: Float32Array;
  clumpA: Float32Array;
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

let lobeA = 0, lobeB = 0, lobeC = 0, lobeAsym = 0;
const lobe = (v: number, u: number) => 1 + 0.1 * Math.sin(9.2 * v + lobeA) + 0.07 * Math.sin(5.1 * v * (u < 0 ? 1 : -1) + lobeB) + 0.06 * Math.sin(3.3 * u + lobeC) + 0.07 * lobeAsym * u;
export function domeHalf(v: number, u = 0): number {
  if (v <= 0 || v >= 1) return 0;
  const VC = 0.45;
  if (v >= VC) {
    const t = (v - VC) / (1 - VC);
    return Math.pow(1 - Math.pow(t, 1.85), 1 / 1.85) * lobe(v, u);
  }
  const t = (VC - v) / VC;
  return Math.pow(1 - Math.pow(t, 2.1), 1 / 2.1) * lobe(v, u);
}

const LIGHT_X = -0.55;
const LIGHT_Y = 0.83;

export function generateTree(seed: number): TreeModel {
  const rnd = new Rand(hashSeed(seed, 0xc20f));
  const tanLean = Math.tan((rnd.range(-3, 3) * Math.PI) / 180);
  lobeA = rnd.range(0, 6.28);
  lobeB = rnd.range(0, 6.28);
  lobeC = rnd.range(0, 6.28);
  lobeAsym = rnd.range(-1, 1);

  // ------------------------------------------------------------------ gaps (limbs read through)
  const gaps: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < 5; i++) {
    for (let t = 0; t < 40; t++) {
      const u = rnd.range(-0.6, 0.6);
      const v = rnd.range(0.2, 0.75);
      const gx = u * SXD;
      const gy = YB0 + v * SYD;
      if (gaps.every((g) => Math.hypot(g.x - gx, g.y - gy) > 115)) {
        gaps.push({ x: gx, y: gy, r: rnd.range(19, 29) });
        break;
      }
    }
  }
  const inGap = (x: number, y: number, extra: number) => gaps.some((g) => Math.hypot(x - g.x, y - (g.y + 10)) < g.r + extra);

  // ------------------------------------------------------------------ clumps: best-candidate ordering inside the dome
  const sampleDome = (): { u: number; v: number } => {
    for (let t = 0; t < 60; t++) {
      const u = rnd.range(-1, 1);
      const v = rnd.range(0, 1);
      if (Math.abs(u) <= domeHalf(v, u)) return { u, v };
    }
    return { u: 0, v: 0.5 };
  };
  const pts: Array<{ u: number; v: number; x: number; y: number }> = [];
  for (let i = 0; i < NTOT; i++) {
    let best: { u: number; v: number; x: number; y: number } | null = null;
    let bestD = -1;
    const K = i === 0 ? 1 : 12;
    for (let k = 0; k < K; k++) {
      let c = i === 0 ? { u: rnd.range(-0.1, 0.1), v: 0.6 } : sampleDome();
      let guard = 0;
      while (inGap(c.u * SXD, YB0 + c.v * SYD, 20) && guard++ < 40) c = sampleDome();
      const x = c.u * SXD;
      const y = YB0 + c.v * SYD;
      let md = 1e9;
      for (const p of pts) md = Math.min(md, Math.hypot(p.x - x, (p.y - y) * 1.15));
      // mild preference for the dome interior early on so the sapling reads as a rounded mass
      if (md > bestD) {
        bestD = md;
        best = { u: c.u, v: c.v, x, y };
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
    const varW = rnd.chance(0.18) ? rnd.range(1.15, 1.5) : rnd.range(0.78, 1.12);
    const backClump = rnd.chance(0.2) && p.v > 0.15 && kind !== 'gold' && kind !== 'coral';
    const front = !backClump && (kind === 'lit' || kind === 'gold' || kind === 'coral' || rnd.chance(0.4));
    clumps.push({
      u: p.u, v: p.v, x0: p.x, y0: p.y, w0: CLUMP_W0 * varW, hr: rnd.range(0.62, 0.74), kind, variant,
      rot: rnd.range(-0.09, 0.09), layer: backClump ? 1 : front ? 3 : 2, birth: birthOfRank(i), phase: rnd.range(0, 6.28), mass: false,
    });
  }
  // back masses: large deep washes in the interior and lower right
  const massBirths = [0.035, 0.06, 0.09, 0.12, 0.16, 0.21, 0.28, 0.38];
  for (let i = 0; i < massBirths.length; i++) {
    let u = 0;
    let v = 0.4;
    for (let t = 0; t < 30; t++) {
      u = rnd.range(-0.45, 0.5);
      v = rnd.range(0.15, 0.62);
      if (Math.abs(u) <= domeHalf(v, u) * 0.6 && !inGap(u * SXD, YB0 + v * SYD, 70)) break;
    }
    clumps.push({
      u, v, x0: u * SXD, y0: YB0 + v * SYD, w0: rnd.range(140, 190), hr: rnd.range(0.66, 0.8), kind: 'back',
      variant: rnd.int(0, SPRITE_POOL.back - 1), rot: rnd.range(-0.05, 0.05), layer: 0, birth: massBirths[i]!, phase: rnd.range(0, 6.28), mass: true,
    });
  }

  // ------------------------------------------------------------------ skeleton: space colonisation toward clump anchors
  const D = 9;
  const DI = 90;
  const DK = 11;
  const nx: number[] = [];
  const ny: number[] = [];
  const par: number[] = [];
  const frozen: boolean[] = [];
  const wob = rnd.range(0, 6.28);
  const wobA = rnd.range(9, 16);
  nx.push(0);
  ny.push(0);
  par.push(-1);
  frozen.push(true);
  while (ny[ny.length - 1]! < YB0 - 45) {
    const y = ny[ny.length - 1]! + D;
    nx.push(wobA * Math.sin(y / 70 + wob) * smoothstep(y / 120));
    ny.push(y);
    par.push(nx.length - 2);
    frozen.push(true);
  }
  const T = nx.length - 1;
  frozen[T] = false;
  const sideA = rnd.sign();
  const dirs = [rnd.range(-0.12, 0.12), -sideA * rnd.range(0.5, 0.75), (rnd.chance(0.75) ? sideA : -sideA) * rnd.range(0.5, 0.8)];
  for (const a of dirs) {
    nx.push(nx[T]! + Math.sin(a) * D);
    ny.push(ny[T]! + Math.cos(a) * D);
    par.push(T);
    frozen.push(false);
  }
  // attractors
  const ax: number[] = [];
  const ay: number[] = [];
  for (const c of clumps) {
    if (c.mass) continue;
    ax.push(c.x0);
    ay.push(c.y0);
  }
  for (const g of gaps) {
    for (let k = 0; k < 2; k++) {
      ax.push(g.x + rnd.range(-g.r * 0.6, g.r * 0.6));
      ay.push(g.y + rnd.range(-g.r * 0.6, g.r * 0.6));
    }
  }
  for (let k = 0; k < 34; k++) {
    const c = sampleDome();
    ax.push(c.u * SXD * 0.8);
    ay.push(YB0 + c.v * SYD * 0.85 + 6);
  }
  const alive = new Uint8Array(ax.length).fill(1);
  for (let iter = 0; iter < 400 && nx.length < 1100; iter++) {
    const N = nx.length;
    const sxL = new Float32Array(N), syL = new Float32Array(N), cL = new Int32Array(N);
    const sxR = new Float32Array(N), syR = new Float32Array(N), cR = new Int32Array(N);
    let any = false;
    for (let a = 0; a < ax.length; a++) {
      if (!alive[a]) continue;
      let bi = -1;
      let bd = DI * DI;
      for (let i = 0; i < N; i++) {
        if (frozen[i]) continue;
        const dx = ax[a]! - nx[i]!;
        const dy = ay[a]! - ny[i]!;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          bi = i;
        }
      }
      if (bi < 0) continue;
      if (bd < DK * DK) {
        alive[a] = 0;
        continue;
      }
      const d = Math.sqrt(bd);
      const ux = (ax[a]! - nx[bi]!) / d;
      const uy = (ay[a]! - ny[bi]!) / d;
      // which side of the node's heading is the attractor on?
      const pi = par[bi]!;
      const hx = nx[bi]! - nx[pi]!;
      const hy = ny[bi]! - ny[pi]!;
      if (hx * uy - hy * ux >= 0) {
        sxL[bi]! += ux;
        syL[bi]! += uy;
        cL[bi]!++;
      } else {
        sxR[bi]! += ux;
        syR[bi]! += uy;
        cR[bi]!++;
      }
      any = true;
    }
    if (!any) break;
    let grew = false;
    for (let i = 0; i < N; i++) {
      for (let side = 0; side < 2; side++) {
        const c = side === 0 ? cL[i]! : cR[i]!;
        if (!c) continue;
        let dx = (side === 0 ? sxL[i]! : sxR[i]!) / c;
        let dy = (side === 0 ? syL[i]! : syR[i]!) / c;
        dx += rnd.gauss() * 0.12;
        dy += rnd.gauss() * 0.12 + 0.1;
        const l = Math.hypot(dx, dy) || 1;
        nx.push(nx[i]! + (dx / l) * D);
        ny.push(ny[i]! + (dy / l) * D);
        par.push(i);
        frozen.push(false);
        grew = true;
      }
    }
    if (!grew) break;
  }
  // prune single-node spurs hanging off a fork
  const NN0 = nx.length;
  const childCount = new Int32Array(NN0);
  for (let i = 1; i < NN0; i++) childCount[par[i]!]!++;
  const removed = new Uint8Array(NN0);
  for (let i = NN0 - 1; i > T; i--) {
    if (childCount[i] === 0 && childCount[par[i]!]! >= 2 && par[i]! > T) {
      removed[i] = 1;
      childCount[par[i]!]!--;
    }
  }
  const kids: number[][] = Array.from({ length: NN0 }, () => []);
  for (let i = 1; i < NN0; i++) if (!removed[i]) kids[par[i]!]!.push(i);
  const desc = new Int32Array(NN0);
  for (let i = NN0 - 1; i >= 0; i--) {
    if (removed[i]) continue;
    desc[i]! += 1;
    if (par[i]! >= 0) desc[par[i]!]! += desc[i]!;
  }
  // pipe-model radii: r_parent^p = sum r_child^p, tips = rt; p solved so the trunk reaches ~15.5
  const rNode = new Float32Array(NN0);
  const solveRadii = (p: number) => {
    for (let i = NN0 - 1; i >= 0; i--) {
      if (removed[i]) continue;
      if (kids[i]!.length === 0) rNode[i] = 0.85;
      else {
        let s = 0;
        for (const c of kids[i]!) s += Math.pow(rNode[c]!, p);
        rNode[i] = Math.pow(s, 1 / p);
      }
    }
    return rNode[0]!;
  };
  let pLo = 1.3;
  let pHi = 2.4;
  for (let it = 0; it < 24; it++) {
    const pm = (pLo + pHi) / 2;
    if (solveRadii(pm) > 15.5) pLo = pm;
    else pHi = pm;
  }
  solveRadii((pLo + pHi) / 2);

  // ------------------------------------------------------------------ chains -> branches
  interface Chain {
    nodes: number[];
    parentChain: number;
    attachNode: number;
    depth: number;
  }
  const chains: Chain[] = [];
  const queue: Chain[] = [{ nodes: [0], parentChain: -1, attachNode: -1, depth: 0 }];
  while (queue.length) {
    const ch = queue.shift()!;
    const ci = chains.length;
    chains.push(ch);
    let cur = ch.nodes[ch.nodes.length - 1]!;
    for (;;) {
      const ks = kids[cur]!;
      if (ks.length === 0) break;
      let h = ks[0]!;
      for (const c of ks) if (desc[c]! > desc[h]!) h = c;
      for (const c of ks) {
        if (c !== h) queue.push({ nodes: [cur, c], parentChain: ci, attachNode: cur, depth: ch.depth + 1 });
      }
      ch.nodes.push(h);
      cur = h;
    }
  }
  const chainOfNodeIdx = new Map<number, number>(); // node -> polyline index within its (own) chain
  const rawBranches: Array<{
    ch: Chain; xs: number[]; ys: number[]; rs: number[]; nodeAt: Map<number, number>;
  }> = [];
  for (const ch of chains) {
    const ids = ch.nodes;
    const k = ids.length;
    const xs: number[] = [];
    const ys: number[] = [];
    const rs: number[] = [];
    const nodeAt = new Map<number, number>();
    const P = (j: number) => ids[clamp(j, 0, k - 1)]!;
    for (let j = 0; j < k - 1; j++) {
      nodeAt.set(ids[j]!, xs.length);
      xs.push(nx[ids[j]!]!);
      ys.push(ny[ids[j]!]!);
      rs.push(rNode[j === 0 && ch.parentChain >= 0 ? ids[1]! : ids[j]!]!);
      const a = P(j - 1), b = P(j), c = P(j + 1), d = P(j + 2);
      xs.push((-nx[a]! + 9 * nx[b]! + 9 * nx[c]! - nx[d]!) / 16);
      ys.push((-ny[a]! + 9 * ny[b]! + 9 * ny[c]! - ny[d]!) / 16);
      rs.push((rNode[b]! + rNode[c]!) / 2);
    }
    nodeAt.set(ids[k - 1]!, xs.length);
    xs.push(nx[ids[k - 1]!]!);
    ys.push(ny[ids[k - 1]!]!);
    rs.push(rNode[ids[k - 1]!]!);
    rawBranches.push({ ch, xs, ys, rs, nodeAt });
  }
  void chainOfNodeIdx;

  // ------------------------------------------------------------------ pack branches with timing and decorations
  const branches: Branch[] = [];
  const packBranch = (
    xs: number[], ys: number[], rs: number[], parent: number, tAttach: number, depth: number, isRoot: boolean, trunk: boolean,
  ): Branch => {
    const n = xs.length;
    const px = new Float32Array(xs);
    const py = new Float32Array(ys);
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!);
    const len = cum[n - 1]!;
    const rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let r = rs[i]!;
      if (trunk) {
        const s = cum[i]!;
        r += 12 * Math.exp(-s / 26) + 4 * Math.exp(-s / 90);
      }
      rad[i] = Math.max(0.35, r);
    }
    const r0 = rad[0]!;
    // smooth radius a little (nodes carry stepwise pipe radii)
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) rad[i] = (rad[i - 1]! + 2 * rad[i]! + rad[i + 1]!) / 4;
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
    // decorations (only for substantial limbs)
    const hatch: number[] = [];
    if (r0 >= 2.8) {
      const cnt = Math.min(95, Math.floor((len * r0) / 6));
      for (let i = 0; i < cnt; i++) {
        const light = rnd.chance(0.25);
        hatch.push(
          rnd.range(0.02, 0.96), light ? rnd.range(-0.9, -0.15) : rnd.range(0.05, 0.95),
          rnd.range(6, 26) * Math.min(1, r0 / 9 + 0.3), rnd.range(-0.12, 0.12), light ? 1 : 0,
        );
      }
    }
    const blooms: number[] = [];
    if (r0 >= 4) {
      const cnt = Math.min(14, Math.floor(len / 14));
      for (let i = 0; i < cnt; i++) blooms.push(rnd.range(0.03, 0.97), rnd.range(-0.8, 0.8), rnd.range(4, 9) * Math.min(1, r0 / 8), rnd.int(0, 2));
    }
    const knots: number[] = [];
    if (trunk) for (let i = 0; i < 3; i++) knots.push(rnd.range(0.06, 0.4), rnd.range(-0.5, 0.5), rnd.range(3.5, 5.5));
    // broken dry-brush ink: runs of widths 1..3 separated by gaps (more breaks on the lit side)
    const ink = new Uint8Array(2 * n);
    for (let side = 0; side < 2; side++) {
      let i = 0;
      while (i < n) {
        const run = rnd.int(4, 12);
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

  const branchOfChain: number[] = [];
  let tips = 0;
  for (let ci = 0; ci < chains.length; ci++) {
    const rb = rawBranches[ci]!;
    const ch = rb.ch;
    let parentIdx = -1;
    let tAttach = 0;
    if (ch.parentChain >= 0) {
      parentIdx = branchOfChain[ch.parentChain]!;
      const pr = rawBranches[ch.parentChain]!;
      const pj = pr.nodeAt.get(ch.attachNode) ?? 0;
      const pb = branches[parentIdx]!;
      tAttach = pb.len > 0 ? pb.cum[pj]! / pb.len : 0;
    }
    const b = packBranch(rb.xs, rb.ys, rb.rs, parentIdx, tAttach, ch.depth, false, ci === 0);
    branchOfChain.push(b.idx);
    // timing
    if (ci === 0) {
      b.birth = 0;
      b.end = 0.001; // trunk + leader: whole axis present, scales with the crown map
    } else {
      const pb = branches[parentIdx]!;
      const tipY = b.py[b.n - 1]!;
      const hf = clamp((tipY - YB0) / HC0, 0, 1);
      const depthBase = [0, 0.02, 0.07, 0.15, 0.28, 0.44, 0.58, 0.7][Math.min(ch.depth, 7)]!;
      let birth = ch.depth === 1 ? depthBase + rnd.range(0, 0.03) : depthBase + rnd.range(0, 0.1) + 0.08 * hf;
      const parentReach = pb.end <= 0.002 ? 0 : timeAtFrac(pb, Math.min(tAttach, 0.96)) + 0.004;
      birth = Math.max(birth, parentReach);
      birth = Math.min(birth, 0.94);
      const span = ch.depth === 1 ? rnd.range(0.09, 0.14) : ch.depth <= 4 ? rnd.range(0.1, 0.17) : rnd.range(0.07, 0.12);
      b.birth = birth;
      b.end = Math.min(0.985, Math.max(birth + span, birth + 0.03));
    }
    if (kids[ch.nodes[ch.nodes.length - 1]!]!.length === 0) {
      b.terminal = true;
      tips++;
    }
  }
  // the trunk axis: treat "birth 0, end 0.001" as always fully grown
  // surface roots (visible flare melting into the ground wash)
  const nRoots = 5;
  for (let k = 0; k < nRoots; k++) {
    const sd = k % 2 === 0 ? 1 : -1;
    const L = rnd.range(30, 56) * (k < 2 ? 1.1 : 0.85);
    const n = Math.ceil(L / 4) + 1;
    let th = (sd > 0 ? 0 : Math.PI) - sd * rnd.range(0.08, 0.3);
    let x = sd * rnd.range(2, 6);
    let y = rnd.range(5, 9);
    const xs: number[] = [];
    const ys: number[] = [];
    const rs: number[] = [];
    const r0 = rnd.range(5.5, 8.5) * (k < 2 ? 1 : 0.8);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      xs.push(x);
      ys.push(y);
      rs.push(Math.max(0.5, r0 * Math.pow(1 - t, 1.4) + 0.5));
      th += -sd * 0.02 + rnd.gauss() * 0.05;
      x += Math.cos(th) * 4;
      y += Math.sin(th) * 4 * (i > n * 0.5 ? 0.6 : 1);
      if (y < 0.5) y = 0.5;
    }
    const b = packBranch(xs, ys, rs, 0, 0, 0, true, false);
    b.birth = 0;
    b.end = rnd.range(0.25, 0.45);
    b.terminal = true;
  }

  // open the parent's contour where a child limb departs (Y-forks read as forks, not as crossed lines)
  for (const c of branches) {
    if (c.parent < 0 || c.isRoot || c.n < 3) continue;
    const pb = branches[c.parent]!;
    const j = Math.round(c.tAttach * (pb.n - 1));
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(pb.n - 1, j + 1);
    const tx = pb.px[j1]! - pb.px[j0]!;
    const ty = pb.py[j1]! - pb.py[j0]!;
    const kk = Math.min(c.n - 1, 3);
    const cx = c.px[kk]! - c.px[0]!;
    const cy = c.py[kk]! - c.py[0]!;
    const rightSide = tx * cy - ty * cx < 0 ? 1 : -1; // +1: child leaves on the right of travel (world, y up)
    const litS = -pb.lightSign;
    const side = rightSide === litS ? 0 : 1;
    const w = Math.ceil((c.r0 * 1.3) / 4.5) + 1;
    for (let i = Math.max(0, j - w); i <= Math.min(pb.n - 1, j + w); i++) pb.ink[side * pb.n + i] = 0;
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
    seed, tanLean, branches, clumps, layers, specks,
    stats: {
      branches: branches.length, clumps: clumps.length, tips,
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

export function createState(model: TreeModel): TreeState {
  return { m: 0, g: new Float32Array(model.branches.length), kappa: new Float32Array(model.branches.length), clumpA: new Float32Array(model.clumps.length) };
}

export function evalState(model: TreeModel, m: number, st: TreeState): void {
  st.m = m;
  for (let i = 0; i < model.branches.length; i++) {
    const b = model.branches[i]!;
    st.g[i] = branchG(b, m);
    st.kappa[i] = branchKappa(b, m);
  }
  for (let i = 0; i < model.clumps.length; i++) st.clumpA[i] = clumpRamp(model.clumps[i]!, m);
}
