/**
 * The vine's branching model and its growth state.
 *
 * The model is a seeded, precomputed tree grown by space colonisation inside the part of the wall the vine may
 * cover (geom.ts COTTAGE.vine, never the door, windows only partly), in cottage-local coordinates: u across the
 * wall from the root (positive toward the door), v up from the foot of the wall. The same model serves both
 * cottages; the right one is mirrored when it is painted. Each node is a short stem segment with its leaves.
 * The state is one growth number g per node (0 = absent, 1 = fully grown). A node may grow only once its parent
 * is complete, so new shoots always extend from existing growth; cutting sets a node (and so everything beyond
 * it) back to nothing, leaving a short stub that can sprout again.
 */
import { Rand, clamp } from '../../scene/prng';

export interface VNode {
  parent: number;
  /** start (the parent's end), end and the quadratic control point, local (u, v) */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  cx: number;
  cy: number;
  len: number;
  /** stem width in world units and its class (0 thick … 3 twig) */
  w: number;
  cls: number;
  /** this node's own mass (stem plus its leaves) */
  mass: number;
  children: number[];
  leaves: number[];
  berry: boolean;
}

export interface VLeaf {
  node: number;
  /** unit direction of the leaf's axis in local (u, v) */
  du: number;
  dv: number;
  size: number;
  color: number;
  shape: number;
  ph: number;
}

export interface VineModel {
  nodes: VNode[];
  leaves: VLeaf[];
  /** leaf draw order: higher leaves first, so lower ones overlap them like shingles */
  order: number[];
  total: number;
}

/** the region the vine may cover, in local coordinates */
export const REGION = { u0: -166, u1: 160, v0: 2, v1: 146 } as const;
/** the door, with a margin (the vine never covers it) */
const DOOR = { u0: 20, u1: 88, v0: -2, v1: 106 };
const WINDOWS = [
  { u0: -132, u1: -56, v0: 56, v1: 124 },
  { u0: 104, u1: 158, v0: 56, v1: 124 },
];

const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const vTop = (u: number): number => 141 + 5 * Math.sin(u * 0.045 + 1) + 4 * Math.sin(u * 0.11);
const inDoor = (u: number, v: number): boolean => u > DOOR.u0 && u < DOOR.u1 && v < DOOR.v1;
const cover = (u: number, v: number): number => {
  const fx = smooth((u - REGION.u0) / 30) * smooth((REGION.u1 - u) / 30);
  const ft = smooth((vTop(u) - v) / 26);
  let p = 0.1 + 0.9 * fx * ft;
  for (const w of WINDOWS) if (u > w.u0 && u < w.u1 && v > w.v0 && v < w.v1) p *= 0.5;
  return p;
};

let cached: VineModel | null = null;

export function vineModel(): VineModel {
  if (cached) return cached;
  cached = buildModel(20260612);
  return cached;
}

function buildModel(seed: number): VineModel {
  const rnd = new Rand(seed);
  // ---- attractors: Poisson-disc dart throwing, thinned by the coverage field
  const SP = 7.6;
  const att: Array<[number, number]> = [];
  const cell = SP / Math.SQRT2;
  const gw = Math.ceil((REGION.u1 - REGION.u0) / cell) + 1;
  const gh = Math.ceil(REGION.v1 / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  for (let i = 0; i < 9000; i++) {
    const u = rnd.range(REGION.u0, REGION.u1);
    const v = rnd.range(REGION.v0, REGION.v1);
    if (inDoor(u, v) || !rnd.chance(cover(u, v))) continue;
    const gx = Math.floor((u - REGION.u0) / cell);
    const gy = Math.floor(v / cell);
    let ok = true;
    for (let y = Math.max(0, gy - 2); y <= Math.min(gh - 1, gy + 2) && ok; y++) {
      for (let x = Math.max(0, gx - 2); x <= Math.min(gw - 1, gx + 2); x++) {
        const k = grid[y * gw + x]!;
        if (k >= 0 && Math.hypot(att[k]![0] - u, att[k]![1] - v) < SP) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    grid[gy * gw + gx] = att.length;
    att.push([u, v]);
  }
  // ---- space colonisation
  const STEP = 7.4;
  const DI = 38;
  const DK = 9.6;
  interface N {
    x: number;
    y: number;
    parent: number;
    dx: number;
    dy: number;
  }
  const nodes: N[] = [{ x: 0, y: 0, parent: -1, dx: 0, dy: 1 }];
  const alive = new Uint8Array(att.length).fill(1);
  for (let it = 0; it < 400; it++) {
    const pull = new Map<number, [number, number, number]>();
    let any = false;
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      const [au, av] = att[a]!;
      let best = -1;
      let bd = DI;
      for (let n = 0; n < nodes.length; n++) {
        const d = Math.hypot(nodes[n]!.x - au, nodes[n]!.y - av);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (best < 0) continue;
      any = true;
      const nd = nodes[best]!;
      const p = pull.get(best) ?? [0, 0, 0];
      const l = Math.hypot(au - nd.x, av - nd.y) || 1;
      p[0] += (au - nd.x) / l;
      p[1] += (av - nd.y) / l;
      p[2]++;
      pull.set(best, p);
    }
    if (!any) break;
    let grew = false;
    const born: N[] = [];
    for (const [ni, p] of pull) {
      const nd = nodes[ni]!;
      let dx = p[0] / p[2];
      let dy = p[1] / p[2];
      const l0 = Math.hypot(dx, dy);
      if (l0 < 0.05) {
        dx = nd.dx;
        dy = nd.dy;
      }
      // inertia (smooth stems), a climbing bias, a little wander
      dx = dx * 0.62 + nd.dx * 0.38 + rnd.range(-0.12, 0.12);
      dy = dy * 0.62 + nd.dy * 0.38 + 0.1 + rnd.range(-0.12, 0.12);
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const x = nd.x + dx * STEP;
      const y = nd.y + dy * STEP;
      if (y < 1 || y > REGION.v1 + 2 || x < REGION.u0 - 4 || x > REGION.u1 + 4 || inDoor(x, y)) continue;
      // not on top of another node
      let near = false;
      for (const o of nodes) {
        if (Math.hypot(o.x - x, o.y - y) < STEP * 0.62) {
          near = true;
          break;
        }
      }
      if (near) continue;
      for (const o of born) {
        if (Math.hypot(o.x - x, o.y - y) < STEP * 0.62) {
          near = true;
          break;
        }
      }
      if (near) continue;
      born.push({ x, y, parent: ni, dx, dy });
      grew = true;
    }
    for (const b of born) nodes.push(b);
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      for (const b of born) {
        if (Math.hypot(b.x - att[a]![0], b.y - att[a]![1]) < DK) {
          alive[a] = 0;
          break;
        }
      }
    }
    if (!grew) break;
  }
  // ---- stems: control points for tangent-continuous curves, subtree sizes, widths
  const count = nodes.length;
  const children: number[][] = nodes.map(() => []);
  for (let i = 1; i < count; i++) children[nodes[i]!.parent]!.push(i);
  const sub = new Array<number>(count).fill(1);
  for (let i = count - 1; i >= 1; i--) sub[nodes[i]!.parent]! += sub[i]!;
  const out: VNode[] = [];
  for (let i = 0; i < count; i++) {
    const n = nodes[i]!;
    const p = n.parent >= 0 ? nodes[n.parent]! : { x: 0, y: -5 };
    const sx = p.x;
    const sy = p.y;
    const pd = n.parent >= 0 ? nodes[n.parent]! : { dx: 0, dy: 1 };
    const len = Math.hypot(n.x - sx, n.y - sy);
    // control point along the parent's heading, so a branch leaves its parent smoothly
    const cx = sx + pd.dx * len * 0.5 + rnd.range(-0.5, 0.5);
    const cy = sy + pd.dy * len * 0.5 + rnd.range(-0.5, 0.5);
    const w = 0.62 + 2.7 * Math.sqrt(sub[i]! / count);
    out.push({ parent: n.parent, sx, sy, ex: n.x, ey: n.y, cx, cy, len, w, cls: w >= 2.3 ? 0 : w >= 1.5 ? 1 : w >= 1.0 ? 2 : 3, mass: 0.35, children: children[i]!, leaves: [], berry: false });
  }
  // ---- leaves
  const leaves: VLeaf[] = [];
  const colorAt = (u: number, v: number, r: Rand): number => {
    // patches of colour: neighbouring leaves share a hue more often than not
    const f = Math.sin(u * 0.05 + 1.3) * 0.5 + Math.sin(v * 0.07 + u * 0.021) * 0.5;
    const x = r.next();
    if (x < 0.03) return 6;
    if (x < 0.07) return 5;
    const k = f * 0.25 + r.next() * 0.75;
    return k < 0.2 ? 2 : k < 0.42 ? 0 : k < 0.62 ? 1 : k < 0.8 ? 4 : 3;
  };
  for (let i = 0; i < count; i++) {
    const n = out[i]!;
    if (n.ey < 12) continue;
    const terminal = n.children.length === 0;
    let nl = terminal ? 2 : rnd.chance(0.62) ? 1 : 0;
    if (!terminal && n.children.length >= 2 && rnd.chance(0.3)) nl++;
    for (let k = 0; k < nl; k++) {
      const hx = n.ex - n.sx;
      const hy = n.ey - n.sy;
      const hl = Math.hypot(hx, hy) || 1;
      const base = Math.atan2(hy / hl, hx / hl);
      const side = (k === 0 ? 1 : -1) * (rnd.chance(0.5) ? 1 : -1);
      let a = base + side * rnd.range(0.5, 1.6) + (terminal && k === 0 ? rnd.range(-0.3, 0.3) - side * 0.5 : 0);
      let du = Math.cos(a);
      let dv = Math.sin(a) - 0.5; // leaves hang a little
      const l = Math.hypot(du, dv) || 1;
      du /= l;
      dv /= l;
      a = Math.atan2(dv, du);
      void a;
      const size = rnd.range(0.84, 1.18) * (0.9 + 0.2 * (1 - n.ey / REGION.v1));
      leaves.push({ node: i, du, dv, size, color: colorAt(n.ex, n.ey, rnd), shape: rnd.int(0, 2), ph: rnd.range(0, Math.PI * 2) });
      n.leaves.push(leaves.length - 1);
      n.mass += 1;
    }
  }
  // a few clusters of dark berries on high, free twigs
  const tips = out.map((n, i) => ({ n, i })).filter(({ n }) => n.children.length === 0 && n.ey > 70 && n.ey < 132);
  for (let k = 0; k < 9 && tips.length; k++) {
    const j = rnd.int(0, tips.length - 1);
    tips[j]!.n.berry = true;
    tips[j]!.n.mass += 0.2;
    tips.splice(j, 1);
  }
  const order = leaves.map((_, i) => i).sort((a, b) => out[leaves[b]!.node]!.ey - out[leaves[a]!.node]!.ey);
  let total = 0;
  for (const n of out) total += n.mass;
  return { nodes: out, leaves, order, total };
}

/* ------------------------------------------------------------------ growth state */

export const STUB = 0.35;

export interface RemovedNode {
  i: number;
  /** growth at the moment of the cut */
  g: number;
  /** the fraction of the stem still on the wall (the stub): 0 for everything beyond the cut node */
  keep: number;
}

export class VineState {
  readonly m: VineModel;
  readonly g: Float32Array;
  /** scratch: subtree mass of every node */
  private sub: Float32Array;
  constructor(m: VineModel) {
    this.m = m;
    this.g = new Float32Array(m.nodes.length).fill(1);
    this.sub = new Float32Array(m.nodes.length);
  }

  setFull(): void {
    this.g.fill(1);
  }
  setEmpty(): void {
    this.g.fill(0);
  }

  /** the vine on the wall as a fraction of the full vine (0…1) */
  mass(): number {
    const nodes = this.m.nodes;
    let s = 0;
    for (let i = 0; i < nodes.length; i++) s += this.g[i]! * nodes[i]!.mass;
    return s / this.m.total;
  }

  /** grow new shoots from existing growth, spending up to `budget` (a fraction of the full vine); `rate` caps how fast one stem extends (growth per second) */
  grow(budget: number, dt: number, rate: number): number {
    const nodes = this.m.nodes;
    const total = this.m.total;
    let left = budget;
    const cap = rate * dt;
    for (let i = 0; i < nodes.length && left > 1e-9; i++) {
      const gi = this.g[i]!;
      if (gi >= 1) continue;
      const p = nodes[i]!.parent;
      if (p >= 0 && this.g[p]! < 0.999) continue;
      const need = (1 - gi) * (nodes[i]!.mass / total);
      const dg = Math.min(cap, 1 - gi, left / (nodes[i]!.mass / total));
      void need;
      this.g[i] = gi + dg;
      left -= dg * (nodes[i]!.mass / total);
    }
    return budget - left;
  }

  /** peel back the newest, outermost growth by `amount` (a fraction of the full vine) with no cut: used when the picture is set directly */
  retract(amount: number, rate: number, dt: number): number {
    const nodes = this.m.nodes;
    const total = this.m.total;
    let left = amount;
    const cap = rate * dt;
    for (let i = nodes.length - 1; i >= 0 && left > 1e-9; i--) {
      const gi = this.g[i]!;
      if (gi <= 0) continue;
      const mi = nodes[i]!.mass / total;
      const dg = Math.min(cap, gi, left / mi);
      this.g[i] = gi - dg;
      left -= dg * mi;
    }
    return amount - left;
  }

  /** recompute the subtree masses (fractions of the full vine) of what is on the wall */
  private subtrees(): Float32Array {
    const nodes = this.m.nodes;
    const total = this.m.total;
    const sub = this.sub;
    for (let i = nodes.length - 1; i >= 0; i--) {
      let s = (this.g[i]! * nodes[i]!.mass) / total;
      for (const c of nodes[i]!.children) s += sub[c]!;
      sub[i] = s;
    }
    return sub;
  }

  /** a snapshot of the cut candidates: the point where a cut at each complete node would be made, and the mass it would remove */
  candidates(): Array<{ i: number; u: number; v: number; mass: number }> {
    const nodes = this.m.nodes;
    const sub = this.subtrees();
    const out: Array<{ i: number; u: number; v: number; mass: number }> = [];
    for (let i = 1; i < nodes.length; i++) {
      if (this.g[i]! < 0.999) continue;
      const n = nodes[i]!;
      out.push({ i, u: n.sx + (n.ex - n.sx) * STUB, v: n.sy + (n.ey - n.sy) * STUB, mass: sub[i]! });
    }
    return out;
  }

  /**
   * Cut at node i: it keeps a short stub (so it can sprout again), everything beyond it goes. Returns the removed
   * pieces (what falls). With `whole`, the node is removed entirely (the final cut at the root).
   */
  cutNode(i: number, whole = false): RemovedNode[] {
    const nodes = this.m.nodes;
    const out: RemovedNode[] = [];
    const walk = (k: number, keep: number) => {
      const gk = this.g[k]!;
      if (gk > 0) out.push({ i: k, g: gk, keep });
      this.g[k] = keep > 0 ? Math.min(gk, keep) : 0;
      for (const c of nodes[k]!.children) walk(c, 0);
    };
    walk(i, whole ? 0 : STUB);
    return out;
  }

  /** the outermost nodes still on the wall, nearest first to (u, v) */
  nearestPresent(u: number, v: number): number {
    const nodes = this.m.nodes;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (this.g[i]! < 0.5) continue;
      const d = Math.hypot(nodes[i]!.ex - u, nodes[i]!.ey - v);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
}

/** the growth of a leaf as it unfolds with its node's growth */
export const leafOpen = (g: number): number => smooth((g - 0.3) / 0.7);
