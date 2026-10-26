/**
 * One snowball and everything that belongs to its lane: the ball itself (cached painted bodies, with packed-snow
 * marks that turn as it rolls: rotation = distance / radius), its soft shadow, the pressed track above it, the
 * clumps that break off its back and lie in that track, the flakes that settle on it, and, once its debt is cleared,
 * the crumble into the snowbank, the mound and the little flag.
 *
 * Place and size come only from the frame (progress, size). The track, the clumps' places and the ball's turn are
 * pure functions of progress, so scrubbing shows the same track; clumps are seen falling only while playing.
 */
import { Rand, clamp } from '../../scene/prng';
import { BALL_R_MAX, LANES, ballRadius, depthScale, lanePoint } from './geom';
import type { BallVisual, DebtId, StrategyId } from '../types';
import { DEBT_SEED, makeBody, makeClumps, makeFlagCloth, makeFlake, makeMound, makePowder, makeShadow, type Spr } from './snowArt';

export interface BallArt {
  bodies: Record<DebtId, Spr[]>;
  shadow: HTMLCanvasElement;
  flake: HTMLCanvasElement;
  powder: HTMLCanvasElement;
  clumps: HTMLCanvasElement[];
  mound: ReturnType<typeof makeMound>;
  flags: Record<StrategyId, HTMLCanvasElement>;
}

export const HILL_FLAG: Record<StrategyId, string> = { snowball: '#2a6a94', avalanche: '#a8352c' };
const LODS = [56, 22, 8];

export function buildBallArt(q: number): BallArt {
  const bodies = {} as Record<DebtId, Spr[]>;
  for (const d of ['medical', 'car', 'card'] as DebtId[]) {
    bodies[d] = LODS.map((R0, i) => makeBody(DEBT_SEED[d] * 10 + i, R0, Math.min(5, q * (i === 0 ? 1 : i === 1 ? 1.5 : 2.6)), i === 0 ? 0.8 : i === 1 ? 0.55 : 0.34));
  }
  return {
    bodies,
    shadow: makeShadow(),
    flake: makeFlake(),
    powder: makePowder(),
    clumps: makeClumps(Math.min(6, q * 1.6)),
    mound: makeMound(Math.min(6, q * 1.4)),
    flags: { snowball: makeFlagCloth(HILL_FLAG.snowball, Math.min(6, q * 1.6)), avalanche: makeFlagCloth(HILL_FLAG.avalanche, Math.min(6, q * 1.6)) },
  };
}

/** the camera's elevation for the marks on the sphere (rolling is seen from above and in front) */
const E = (30 * Math.PI) / 180;
const SIN_E = Math.sin(E);
const COS_E = Math.cos(E);
/** the light, in view space (x right, y up, z toward us) */
const LV = (() => {
  const l = Math.hypot(-0.45, 0.62, 0.64);
  return [-0.45 / l, 0.62 / l, 0.64 / l] as const;
})();

const hash = (...n: number[]): number => {
  let h = 2166136261 >>> 0;
  for (const v of n) {
    h ^= v | 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** kinds of mark on a ball */
const SPECK = 0;
const GRIT = 1;
const TWIG = 2;
const NEEDLE = 3;
const LEAF = 4;
const DENT = 5;

interface Marks {
  n: number;
  kind: Uint8Array;
  p: Float32Array; // unit vectors, 3 per mark
  t: Float32Array; // tangents, 3 per mark
  size: Float32Array;
  arcs: Float32Array[]; // each a run of 8 unit vectors
}

function makeMarks(seed: number): Marks {
  const rnd = new Rand(seed);
  const spec: Array<[number, number]> = [
    [DENT, 10],
    [SPECK, 34],
    [GRIT, 9],
    [TWIG, 5],
    [NEEDLE, 4],
    [LEAF, 3],
  ];
  const n = spec.reduce((a, s) => a + s[1], 0);
  const m: Marks = { n, kind: new Uint8Array(n), p: new Float32Array(n * 3), t: new Float32Array(n * 3), size: new Float32Array(n), arcs: [] };
  let i = 0;
  const unit = (): [number, number, number] => {
    const z = rnd.range(-1, 1);
    const a = rnd.range(0, 6.2832);
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  };
  for (const [kind, count] of spec) {
    for (let k = 0; k < count; k++, i++) {
      const [x, y, z] = unit();
      m.kind[i] = kind;
      m.p[3 * i] = x;
      m.p[3 * i + 1] = y;
      m.p[3 * i + 2] = z;
      // a tangent: any vector not along p, made perpendicular to it
      let [tx, ty, tz] = unit();
      const d = tx * x + ty * y + tz * z;
      tx -= d * x;
      ty -= d * y;
      tz -= d * z;
      const l = Math.hypot(tx, ty, tz) || 1;
      m.t[3 * i] = tx / l;
      m.t[3 * i + 1] = ty / l;
      m.t[3 * i + 2] = tz / l;
      m.size[i] = kind === DENT ? rnd.range(0.13, 0.26) : kind === SPECK ? rnd.range(0.014, 0.036) : kind === GRIT ? rnd.range(0.01, 0.02) : kind === TWIG ? rnd.range(0.12, 0.2) : kind === NEEDLE ? rnd.range(0.05, 0.085) : rnd.range(0.035, 0.05);
    }
  }
  // pressed ridges: great-circle arcs
  for (let k = 0; k < 6; k++) {
    const [ax, ay, az] = unit();
    let [bx, by, bz] = unit();
    const d = ax * bx + ay * by + az * bz;
    bx -= d * ax;
    by -= d * ay;
    bz -= d * az;
    const l = Math.hypot(bx, by, bz) || 1;
    bx /= l;
    by /= l;
    bz /= l;
    const a0 = rnd.range(0, 6.28);
    const span = rnd.range(0.7, 1.3);
    const arc = new Float32Array(24);
    for (let s = 0; s < 8; s++) {
      const a = a0 + (s / 7) * span;
      arc[3 * s] = ax * Math.cos(a) + bx * Math.sin(a);
      arc[3 * s + 1] = ay * Math.cos(a) + by * Math.sin(a);
      arc[3 * s + 2] = az * Math.cos(a) + bz * Math.sin(a);
    }
    m.arcs.push(arc);
  }
  return m;
}

interface Falling {
  i: number;
  age: number;
  dur: number;
  x0: number;
  y0: number;
  h0: number;
  spin: number;
}
interface Flake {
  u: number;
  z: number;
  age: number;
  life: number;
  ph: number;
  fall: number;
}
interface Powder {
  p: [number, number, number];
  born: number;
  size: number;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}

const N_CLUMPS = 16;
const FLAKE_CAP = 22;

export class BallView {
  readonly lane;
  /** the starting size (fraction of the largest debt): size / (1 − progress), learned from the frame */
  s0: number;
  progress = 0;
  size = 0;
  paidOff = false;
  r = 3;
  contact = { x: 0, y: 0 };
  cx = 0;
  cy = 0;
  theta = 0;
  private readonly marks: Marks;
  /** where the ball breaks up: the foot of its lane, or the top for a debt its minimums cleared while it waited */
  private end: { x: number; y: number };
  private readonly back: number;
  private readonly pRest: Float32Array;
  private readonly lat: Float32Array;
  private readonly rc: Float32Array;
  private readonly variant: Uint8Array;
  private readonly rot: Float32Array;
  private readonly yJit: Float32Array;
  private falling: Falling[] = [];
  private flakes: Flake[] = [];
  private powder: Powder[] = [];
  private puffs: Puff[] = [];
  private acc = 0;
  private rnd: Rand;
  /** the mound and flag: 0 none .. 1 whole */
  private moundT = 0;
  private moundK = 0;
  private chunks: Array<{ dx: number; dy: number; r: number; v: number; vx: number }> = [];
  private first = true;
  private rate = 0;
  private lastR = 3;

  constructor(
    readonly hill: StrategyId,
    readonly debt: DebtId,
    public art: BallArt,
  ) {
    this.lane = LANES[hill][debt];
    const h = hash(hill === 'snowball' ? 1 : 2, debt === 'medical' ? 1 : debt === 'car' ? 2 : 3);
    this.rnd = new Rand(h);
    this.marks = makeMarks(h);
    this.s0 = debt === 'card' ? 1 : debt === 'car' ? 0.5 : 0.083;
    this.end = lanePoint(hill, debt, 1);
    this.back = 15 / Math.abs(this.lane.end.y - this.lane.start.y);
    const rr = new Rand(h + 99);
    this.pRest = new Float32Array(N_CLUMPS);
    this.lat = new Float32Array(N_CLUMPS);
    this.rc = new Float32Array(N_CLUMPS);
    this.variant = new Uint8Array(N_CLUMPS);
    this.rot = new Float32Array(N_CLUMPS);
    this.yJit = new Float32Array(N_CLUMPS);
    for (let i = 0; i < N_CLUMPS; i++) {
      this.pRest[i] = ((i + 0.3 + rr.range(0, 0.55)) / N_CLUMPS) * 0.93 + 0.02;
      this.lat[i] = rr.sign() * rr.range(0.3, 1.05);
      this.rc[i] = rr.range(0.15, 0.3);
      this.variant[i] = rr.int(0, 5);
      this.rot[i] = rr.range(0, 6.28);
      this.yJit[i] = rr.range(-2, 2);
    }
  }

  get hasMound(): boolean {
    return this.moundK > 0.002;
  }

  /** half the width of the track at lane position p (the ball's own radius there) */
  private halfWidth(p: number): number {
    const y = this.lane.start.y + (this.lane.end.y - this.lane.start.y) * p;
    return Math.max(1.2, ballRadius(Math.max(0, 1 - p) * this.s0, y) * 0.95);
  }

  private clumpPos(i: number): { x: number; y: number; r: number } {
    const p = this.pRest[i]!;
    const q = lanePoint(this.hill, this.debt, p);
    const hw = this.halfWidth(p);
    return { x: q.x + this.lat[i]! * hw, y: q.y + this.yJit[i]!, r: Math.max(1.1, hw * this.rc[i]!) };
  }

  /**
   * Advance: place the ball from the frame, learn its starting size, turn it, let clumps break off (while playing),
   * settle flakes on it, and run the crumble when its debt is cleared. `dt` is wall seconds (scaled by the caller).
   */
  update(dt: number, b: BallVisual, o: { scrub: boolean; playing: boolean; reduced: boolean; t: number; mps: number }): void {
    const prev = this.progress;
    const wasPaid = this.paidOff;
    this.progress = clamp(b.progress, 0, 1);
    this.size = Math.max(0, b.size);
    this.paidOff = b.paidOff;
    if (this.progress < 0.96 && this.size > 1e-4) this.s0 = this.size / Math.max(0.04, 1 - this.progress);
    const c = lanePoint(this.hill, this.debt, this.progress);
    this.contact = c;
    const r = this.paidOff ? this.lastR : Math.max(2 * depthScale(c.y), ballRadius(this.size, c.y));
    this.r = r;
    this.lastR = r;
    this.cx = c.x;
    this.cy = c.y - r;
    // rotation = distance / radius, integrated down the lane: d(theta) = G dp / r(p), with r(p) ~ sqrt(1 - p)
    const dx = this.lane.end.x - this.lane.start.x;
    const dy = this.lane.end.y - this.lane.start.y;
    const G = Math.hypot(dx, dy / SIN_E);
    const dsAvg = depthScale((this.lane.start.y + this.lane.end.y) / 2);
    this.theta = ((G / (BALL_R_MAX * Math.sqrt(Math.max(1e-4, this.s0)) * dsAvg)) * 2 * (1 - Math.sqrt(1 - this.progress)));
    const first = this.first;
    this.first = false;
    // ---- clumps breaking off
    if (o.scrub || o.reduced || first) {
      this.falling = [];
    } else if (o.playing && !this.paidOff) {
      for (let i = 0; i < N_CLUMPS; i++) {
        const thr = this.pRest[i]! + this.back;
        if (prev < thr && this.progress >= thr) {
          const rest = this.clumpPos(i);
          const sx = this.cx + this.lat[i]! * r * 0.35;
          const sy = c.y - r * 0.35;
          this.falling.push({ i, age: -this.rnd.range(0, 0.12), dur: 0.62 + this.rnd.range(0, 0.25) + r * 0.004, x0: sx, y0: sy, h0: r * 1.25 + rest.r, spin: this.rnd.range(-5, 5) });
        }
      }
    }
    for (const f of this.falling) f.age += dt;
    this.falling = this.falling.filter((f) => f.age < f.dur && this.progress >= this.pRest[f.i]! + this.back);
    // ---- the crumble at the snowbank (or at the top, where a debt its minimums cleared was waiting)
    if (this.paidOff) this.end = { x: c.x, y: c.y };
    if (this.paidOff) {
      if (!wasPaid) {
        if (!o.scrub && !o.reduced && !first && o.playing) {
          this.moundT = 0;
          this.moundK = 0;
          this.crumble();
        } else {
          this.moundT = 3;
          this.moundK = 1;
          this.puffs = [];
          this.chunks = [];
        }
      } else if (o.scrub || o.reduced) {
        this.moundT = Math.max(this.moundT, 3);
        this.moundK = 1;
      }
      this.moundT += dt;
      this.moundK = Math.max(this.moundK, smooth(this.moundT / 1.1));
    } else {
      this.moundK = Math.max(0, this.moundK - dt * 5);
      this.moundT = 0;
      this.chunks = [];
      this.puffs = [];
    }
    for (const p of this.puffs) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.4;
      p.vy = p.vy * (1 - dt * 1.4) + 6 * dt;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    // ---- flakes settling on the ball, at a rate set by this month's interest (none at 0%)
    if (o.reduced || o.scrub || this.paidOff || dt <= 0) {
      if (o.reduced || this.paidOff) {
        this.flakes = [];
      }
    } else {
      const meff = o.mps > 0 ? Math.min(o.mps, 3) + 0.3 : 0.5;
      this.rate = b.snowfall * 150 * meff;
      this.acc += this.rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.flakes.length >= FLAKE_CAP) continue;
        const u = this.rnd.range(-0.78, 0.78);
        this.flakes.push({ u, z: this.rnd.range(-0.55, 0.7) * Math.sqrt(1 - u * u), age: 0, life: 2.4 + this.rnd.range(0, 1.2), ph: this.rnd.range(0, 6.28), fall: 38 });
      }
    }
    // time moves flakes on; one lands: a lump of powder on the ball, turning with it
    if (!o.reduced) {
      const R = this.rot3();
      const keep: Flake[] = [];
      for (const f of this.flakes) {
        f.age += dt;
        if (f.age >= f.life) {
          const py = Math.sqrt(Math.max(0, 1 - f.u * f.u - f.z * f.z));
          // back into the ball's own frame (the transpose of the rotation)
          const x = R[0] * f.u + R[3] * py + R[6] * f.z;
          const y = R[1] * f.u + R[4] * py + R[7] * f.z;
          const z = R[2] * f.u + R[5] * py + R[8] * f.z;
          this.powder.push({ p: [x, y, z], born: o.t, size: this.rnd.range(0.14, 0.22) });
          if (this.powder.length > 20) this.powder.shift();
        } else keep.push(f);
      }
      this.flakes = keep;
      this.powder = this.powder.filter((p) => o.t - p.born < 22 || o.t < p.born);
    }
  }

  /** the rotation about the horizontal axis across the lane, as a 3x3 (row-major) */
  private rot3(): number[] {
    const dx = this.lane.end.x - this.lane.start.x;
    const dy = (this.lane.end.y - this.lane.start.y) / SIN_E;
    const l = Math.hypot(dx, dy) || 1;
    const gx = dx / l;
    const gz = dy / l;
    // axis = up x direction = (gz, 0, -gx)
    const ax = gz;
    const az = -gx;
    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const k = 1 - c;
    return [
      c + ax * ax * k, -az * s, ax * az * k,
      az * s, c, -ax * s,
      ax * az * k, ax * s, c + az * az * k,
    ];
  }

  private crumble(): void {
    const e = this.end;
    const ds = depthScale(e.y);
    for (let i = 0; i < 6; i++) {
      this.chunks.push({ dx: (i - 2.5) * 3.4 * ds + this.rnd.range(-1.2, 1.2), dy: this.rnd.range(-1.5, 3), r: this.rnd.range(1.2, 2.2) * ds, v: this.rnd.range(0, 0.1), vx: this.rnd.range(-1, 1) });
    }
    for (let i = 0; i < 14; i++) {
      const a = this.rnd.range(-Math.PI, 0);
      const sp = this.rnd.range(6, 22);
      this.puffs.push({ x: e.x + this.rnd.range(-3, 3), y: e.y - 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: -this.rnd.range(0, 0.1), life: 0.9 + this.rnd.range(0, 0.8), r: this.rnd.range(1.4, 3.2) * ds });
    }
  }

  /* ---------------------------------------------------------------- drawing */

  /** the pressed track above the ball and the clumps in it (the ground layer, under everything standing) */
  drawGround(ctx: CanvasRenderingContext2D): void {
    const P = this.progress;
    if (P > 0.035) this.drawTrack(ctx, P);
    // clumps lying in the track, farthest first
    const lying: number[] = [];
    for (let i = 0; i < N_CLUMPS; i++) {
      if (P >= this.pRest[i]! + this.back && !this.falling.some((f) => f.i === i && f.age < f.dur)) lying.push(i);
    }
    for (const i of lying) {
      const c = this.clumpPos(i);
      this.drawClump(ctx, i, c.x, c.y, c.r, 1, 0);
    }
    for (const f of this.falling) {
      if (f.age < 0) continue;
      const e = clamp(f.age / f.dur, 0, 1);
      const rest = this.clumpPos(f.i);
      const x = f.x0 + (rest.x - f.x0) * e;
      const yg = f.y0 + (rest.y - f.y0) * e;
      const h = f.h0 * (1 - e * e) + Math.sin(Math.PI * e) * rest.r * 1.4;
      this.drawClump(ctx, f.i, x, yg - h, rest.r, 0.7 + 0.3 * e, f.spin * f.age);
    }
  }

  private drawClump(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, r: number, k: number, spin: number): void {
    const spr = this.art.clumps[this.variant[i]!]!;
    const S = r * 2.9 * k;
    // soft contact shadow where it lies
    if (spin === 0) {
      ctx.fillStyle = 'rgba(86,94,170,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.5, y + r * 0.55, r * 1.2, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rot[i]! + spin);
    ctx.drawImage(spr, -S / 2, -S / 2, S, S);
    ctx.restore();
  }

  /**
   * The pressed track: a soft channel, not ruled lines. A cool wash for the pressed floor laid in a few passes that
   * narrow inward (so its edges are soft), a deeper shade in the wall inside the left edge (the light is from the
   * left), a lit lip of crumbled snow along both edges in irregular lumps, and a pencil line that comes and goes.
   * Everything is placed by lane position, so the track is the same whenever the ball is at the same place.
   */
  private drawTrack(ctx: CanvasRenderingContext2D, P: number): void {
    const n = Math.max(3, Math.ceil(P / 0.03));
    const C: number[] = [];
    for (let k = 0; k <= n; k++) {
      const p = (P * k) / n;
      const q = lanePoint(this.hill, this.debt, p);
      const w = this.halfWidth(p) * (0.12 + 0.88 * smooth(p / 0.13));
      C.push(q.x + Math.sin(p * 37 + this.s0 * 9) * 0.6, q.y, w);
    }
    // a band between offsets a and b of the half width (-1 left edge … 1 right edge)
    const band = (a: number, b: number): void => {
      ctx.beginPath();
      for (let i = 0; i < C.length; i += 3) ctx[i ? 'lineTo' : 'moveTo'](C[i]! + a * C[i + 2]!, C[i + 1]!);
      for (let i = C.length - 3; i >= 0; i -= 3) ctx.lineTo(C[i]! + b * C[i + 2]!, C[i + 1]!);
      ctx.closePath();
      ctx.fill();
    };
    // the pressed floor, duller and cooler than fresh snow, soft at its edges
    ctx.fillStyle = 'rgba(176,186,232,0.07)';
    band(-1.02, 1.02);
    band(-0.86, 0.9);
    band(-0.66, 0.74);
    // the shaded wall inside the left edge, fading into the floor
    ctx.fillStyle = 'rgba(98,106,186,0.1)';
    band(-1, -0.72);
    band(-0.98, -0.84);
    band(-0.97, -0.91);
    // the lit lip: crumbled snow heaped along both edges in lumps (paper white over a faint violet underside), built
    // into two paths only when the track has grown by a lump, so each frame is two fills, not hundreds
    const lumps = Math.floor(P / 0.012);
    const lipKey = `${lumps}|${this.s0.toFixed(4)}`;
    if (lipKey !== this.lipN) {
      this.lipN = lipKey;
      this.lipShade = new Path2D();
      this.lipLit = new Path2D();
      this.buildLip(lumps);
    }
    ctx.fillStyle = 'rgba(112,120,196,0.16)';
    ctx.fill(this.lipShade!);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill(this.lipLit!);
    this.drawTrackPencil(ctx, C);
  }

  private lipN = '';
  private lipShade: Path2D | null = null;
  private lipLit: Path2D | null = null;

  private buildLip(lumps: number): void {
    for (let k = 1; k < lumps; k++) {
      const p = k * 0.012;
      const h = Math.sin(k * 12.9898 + this.s0 * 78.233) * 43758.5453;
      const u = h - Math.floor(h);
      if (u < 0.35) continue;
      const q = lanePoint(this.hill, this.debt, p);
      const w = this.halfWidth(p) * (0.12 + 0.88 * smooth(p / 0.13));
      const side = u < 0.68 ? -1 : 1;
      const x = q.x + side * (w + 0.6 + u * 0.8);
      const r = Math.max(0.6, w * (0.12 + u * 0.1));
      this.lipShade!.moveTo(x + r * 0.25 + r * 1.25, q.y + r * 0.3);
      this.lipShade!.ellipse(x + r * 0.25, q.y + r * 0.3, r * 1.25, r * 0.45, 0, 0, Math.PI * 2);
      this.lipLit!.moveTo(x + r * 1.1, q.y);
      this.lipLit!.ellipse(x, q.y, r * 1.1, r * 0.42, 0, 0, Math.PI * 2);
    }
  }

  private drawTrackPencil(ctx: CanvasRenderingContext2D, C: number[]): void {
    // a pencil line along the shaded edge that comes and goes (and wavers), never ruled
    ctx.strokeStyle = 'rgba(66,74,150,0.22)';
    ctx.lineWidth = 0.45;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < C.length; i += 3) {
      const k = i / 3;
      const h = Math.sin(k * 7.13 + this.s0 * 31.7) * 9973.1;
      const draw = h - Math.floor(h) > 0.4;
      const x = C[i]! - C[i + 2]! * 0.99 + Math.sin(k * 2.3) * 0.25;
      if (draw && on) ctx.lineTo(x, C[i + 1]!);
      else ctx.moveTo(x, C[i + 1]!);
      on = draw;
    }
    ctx.stroke();
  }

  /** the ball: its shadow, its painted body, the marks that turn with it, the powder that has settled, the flakes coming down */
  drawBall(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.paidOff) return;
    const { r, cx, cy, contact } = this;
    // shadow on the snow, to the lower right
    const sw = r * 2.9 + 3;
    const sh = r * 0.95 + 1.6;
    ctx.drawImage(this.art.shadow, contact.x + r * 0.42 - sw / 2, contact.y + r * 0.08 - sh / 2, sw, sh);
    const lods = this.art.bodies[this.debt];
    const lod = lods[r >= 22 ? 0 : r >= 8.5 ? 1 : 2]!;
    const k = r / lod.r0;
    const D = lod.half * 2 * k;
    ctx.drawImage(lod.cv, cx - D / 2, cy - D / 2, D, D);
    if (r > 4) this.drawMarks(ctx, t);
  }

  private drawMarks(ctx: CanvasRenderingContext2D, t: number): void {
    const { r, cx, cy } = this;
    const m = this.marks;
    const R = this.rot3();
    const count = Math.min(m.n, Math.round(12 + r * 1.0));
    const px = (p: ArrayLike<number>, o: number): [number, number, number] => [R[0] * p[o]! + R[1] * p[o + 1]! + R[2] * p[o + 2]!, R[3] * p[o]! + R[4] * p[o + 1]! + R[5] * p[o + 2]!, R[6] * p[o]! + R[7] * p[o + 1]! + R[8] * p[o + 2]!];
    // pressed ridges (a great-circle arc turning with the ball), faint
    ctx.strokeStyle = 'rgba(92,102,186,0.3)';
    ctx.lineWidth = Math.max(0.4, r * 0.026);
    ctx.lineCap = 'round';
    for (const arc of m.arcs) {
      ctx.beginPath();
      let pen = false;
      for (let s = 0; s < 8; s++) {
        const [x, y, z] = px(arc, 3 * s);
        const yv = y * COS_E - z * SIN_E;
        const vis = y * SIN_E + z * COS_E;
        if (vis < 0.06) {
          pen = false;
          continue;
        }
        const sx = cx + x * r;
        const sy = cy - yv * r;
        if (!pen) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
        pen = true;
      }
      ctx.stroke();
    }
    for (let i = 0; i < count; i++) {
      const [x, y, z] = px(m.p, 3 * i);
      const vis = y * SIN_E + z * COS_E;
      if (vis < 0.1) continue;
      const yv = y * COS_E - z * SIN_E;
      const sx = cx + x * r;
      const sy = cy - yv * r;
      const lit = x * LV[0] + yv * LV[1] + vis * LV[2];
      const sz = m.size[i]! * r;
      const kind = m.kind[i]!;
      const ang = Math.atan2(-yv, x);
      const fore = 0.3 + 0.7 * vis;
      if (kind === DENT) {
        // a packed lump: its hollow shaded on the side away from the light, its lip lit toward it
        const sh = 1 - clamp(lit + 0.3, 0, 1);
        ctx.fillStyle = `rgba(110,120,192,${(0.12 + 0.14 * sh) * vis})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sz * fore, sz, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.55 * vis * (1 - sh * 0.5)})`;
        ctx.beginPath();
        ctx.ellipse(sx - LV[0] * sz * 0.35, sy + LV[1] * sz * 0.35, sz * fore * 0.72, sz * 0.62, ang, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === SPECK) {
        ctx.fillStyle = lit > 0.3 ? 'rgba(84,92,150,0.42)' : 'rgba(58,66,126,0.5)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, Math.max(0.25, sz * fore), Math.max(0.25, sz), ang, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === GRIT) {
        ctx.fillStyle = lit > 0.3 ? 'rgba(138,112,84,0.6)' : 'rgba(92,72,62,0.62)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, Math.max(0.25, sz * fore), Math.max(0.25, sz), ang, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === LEAF) {
        ctx.fillStyle = lit > 0.3 ? 'rgba(176,128,62,0.8)' : 'rgba(112,78,48,0.8)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, Math.max(0.4, sz * 1.6 * fore), Math.max(0.3, sz * 0.8), ang + 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // twigs and pine needles: a short line along the surface
        const len = m.size[i]! * 0.5;
        const a: number[] = [m.p[3 * i]! + m.t[3 * i]! * len, m.p[3 * i + 1]! + m.t[3 * i + 1]! * len, m.p[3 * i + 2]! + m.t[3 * i + 2]! * len];
        const b: number[] = [m.p[3 * i]! - m.t[3 * i]! * len, m.p[3 * i + 1]! - m.t[3 * i + 1]! * len, m.p[3 * i + 2]! - m.t[3 * i + 2]! * len];
        const na = Math.hypot(a[0]!, a[1]!, a[2]!);
        const nb = Math.hypot(b[0]!, b[1]!, b[2]!);
        const A = px(a.map((v) => v / na), 0);
        const B = px(b.map((v) => v / nb), 0);
        if (A[1] * SIN_E + A[2] * COS_E < 0.05 || B[1] * SIN_E + B[2] * COS_E < 0.05) continue;
        ctx.strokeStyle = kind === TWIG ? (lit > 0.3 ? 'rgba(112,84,58,0.85)' : 'rgba(70,52,44,0.85)') : lit > 0.3 ? 'rgba(52,104,76,0.85)' : 'rgba(30,66,56,0.85)';
        ctx.lineWidth = Math.max(0.3, r * (kind === TWIG ? 0.016 : 0.012));
        ctx.beginPath();
        ctx.moveTo(cx + A[0] * r, cy - (A[1] * COS_E - A[2] * SIN_E) * r);
        ctx.lineTo(cx + B[0] * r, cy - (B[1] * COS_E - B[2] * SIN_E) * r);
        ctx.stroke();
      }
    }
    // fresh powder that has settled (turning with the ball), and the flakes still coming down onto it
    for (const pw of this.powder) {
      const [x, y, z] = px(pw.p, 0);
      const vis = y * SIN_E + z * COS_E;
      if (vis < 0.12) continue;
      const age = t - pw.born;
      const a = clamp(age / 0.5, 0, 1) * (1 - clamp((age - 14) / 8, 0, 1)) * Math.min(1, vis * 2);
      if (a <= 0.01) continue;
      const yv = y * COS_E - z * SIN_E;
      const S = pw.size * r * 2;
      ctx.globalAlpha = a;
      ctx.drawImage(this.art.powder, cx + x * r - S / 2, cy - yv * r - S * 0.375, S, S * 0.75);
    }
    ctx.globalAlpha = 1;
    for (const f of this.flakes) {
      const e = clamp(f.age / f.life, 0, 1);
      const py = Math.sqrt(Math.max(0, 1 - f.u * f.u - f.z * f.z));
      const yv = py * COS_E - f.z * SIN_E;
      const lx = cx + f.u * r + Math.sin(f.age * 2.2 + f.ph) * 1.1 * (1 - e);
      const ly = cy - yv * r - (1 - e) * (f.fall + r * 0.3);
      const a = Math.min(1, e * 8) * (1 - clamp((e - 0.88) / 0.12, 0, 1) * 0.9);
      const S = Math.max(2.4, r * 0.07 + 1.6);
      ctx.globalAlpha = a * 0.95;
      ctx.drawImage(this.art.flake, lx - S, ly - S, S * 2, S * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** the mound and flag (a thing standing at the foot of the lane, depth-sorted with the climbers), with the crumble's chunks and puff */
  drawMound(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.moundK <= 0.002) return;
    const e = this.end;
    const ds = depthScale(e.y);
    const T = this.moundT;
    const mk = this.moundK;
    const grow = 0.38 + 0.62 * mk;
    const m = this.art.mound;
    const W = m.w * ds * 0.62 * grow;
    const H = m.h * ds * 0.62 * grow;
    ctx.globalAlpha = Math.min(1, mk * 2.2);
    ctx.drawImage(m.cv, e.x - m.px * ds * 0.62 * grow, e.y - m.py * ds * 0.62 * grow, W, H);
    ctx.globalAlpha = 1;
    // chunks of the crumbled ball tumbling to rest around the mound (then lying there)
    const clump = this.art.clumps;
    for (let i = 0; i < Math.max(this.chunks.length, 0); i++) {
      const c = this.chunks[i]!;
      const a = clamp((T - c.v) / 0.6, 0, 1);
      const x = e.x + c.dx * smooth(a) * 1.3;
      const y = e.y + c.dy * a - Math.sin(Math.PI * a) * 5 * ds - (1 - a * a) * 4 * ds;
      const S = c.r * 2.9;
      ctx.drawImage(clump[(i * 2 + 1) % 6]!, x - S / 2, y - S / 2, S, S);
    }
    if (!this.chunks.length) {
      // settled chunks around the mound's foot
      for (let i = 0; i < 6; i++) {
        const dx = (i - 2.5) * 3.9 * ds * Math.min(1, mk * 3);
        const S = (1.2 + ((i * 7) % 5) * 0.2) * 2.9 * ds;
        const y = e.y + 1.6 * ds + ((i * 5) % 3) * 0.7;
        ctx.globalAlpha = Math.min(1, mk * 2);
        ctx.drawImage(clump[(i * 2 + 1) % 6]!, e.x + dx - S / 2, y - S / 2, S, S);
      }
      ctx.globalAlpha = 1;
    }
    // the flag: the pole grows out of the mound, then the pennant unfurls
    const fk = smooth((T - 0.55) / 0.9);
    const fkEff = this.chunks.length ? fk : Math.min(1, mk);
    if (fkEff > 0.01) {
      const baseX = e.x + 1.2 * ds;
      const baseY = e.y - 4.5 * ds;
      const hgt = 30 * ds * fkEff;
      ctx.strokeStyle = 'rgba(58,44,36,0.95)';
      ctx.lineWidth = 1.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + 0.9 * fkEff, baseY - hgt);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,168,130,0.5)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(baseX - 0.3, baseY - 1);
      ctx.lineTo(baseX + 0.5 * fkEff, baseY - hgt + 1);
      ctx.stroke();
      const flap = Math.sin(t * 2.6 + this.hill.length) * 0.5 + Math.sin(t * 4.1) * 0.25;
      const cw = 15 * ds * 0.78 * smooth((T - 0.7) / 0.7 + (this.chunks.length ? 0 : 1));
      if (cw > 0.5) {
        ctx.save();
        ctx.translate(baseX + 0.9 * fkEff, baseY - hgt + 0.4);
        ctx.transform(1, flap * 0.07, 0, 1, 0, 0);
        ctx.drawImage(this.art.flags[this.hill], 0, 0, cw * (1 + flap * 0.05), 9 * ds * 0.78 * (cw / (15 * ds * 0.78)));
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(58,44,36,0.95)';
      ctx.beginPath();
      ctx.arc(baseX + 0.9 * fkEff, baseY - hgt - 0.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // the puff of powder as the ball goes
    for (const p of this.puffs) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      const S = p.r * (1.4 + 3 * k);
      ctx.globalAlpha = (1 - k) * 0.85 * Math.min(1, p.age * 8);
      ctx.drawImage(this.art.flake, p.x - S, p.y - S, S * 2, S * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** the depth of the mound and flag, for sorting with the climbers */
  get moundY(): number {
    return this.end.y;
  }

  /** where the name tag sits: just above the ball, or above the flag once cleared */
  anchorPoint(): { x: number; y: number } {
    if (this.paidOff) {
      const ds = depthScale(this.end.y);
      return { x: this.end.x, y: this.end.y - 38 * ds * Math.max(0.5, this.moundK) };
    }
    return { x: this.cx, y: this.contact.y - this.r * 2 - 6 };
  }
}
