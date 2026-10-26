/**
 * Winter birds in the pines: chickadees and a pair of cardinals that sit on the spire tops and bough tips, look
 * about, and now and then fly to another perch (often a nearby tree, sometimes a hop along their own).
 *
 * Size follows depth, as everything in the scene does: a bird's length is its real length times depthScale of the
 * tree it sits on (the tree's trunk foot), and in flight its depth moves smoothly from the tree it left to the tree it
 * is going to, so a bird flying from the far wood to a near pine grows as it comes toward us. Its place on the page
 * (high on a tall near pine, or low on a far one) says nothing about its size by itself.
 *
 * Flight is a small bird's: a burst of wingbeats and a glide with the wings tucked (so the path rises and dips a
 * little), along an arc that climbs off the perch and comes down onto the next from above; it eases out of the
 * take-off and into the landing, where it flares (wings up, tail fanned, feet reaching) and settles. Leaving or
 * landing on a bough shakes down a little snow. Decorative, on the wall clock; still in reduced motion.
 */
import { Rand, clamp } from '../../scene/prng';
import { depthScale } from './geom';
import type { Perch } from './world';
import type { BirdArt, BirdFrame, Species } from './birdArt';

/** each kind's length (world units at depth scale 1; the climber is 122 tall) */
const LEN: Record<Species, number> = { chickadee: 13, cardinal: 18 };
/** flying speed (world units per second at depth scale 1) and wingbeats per second */
const SPEED: Record<Species, number> = { chickadee: 190, cardinal: 170 };
const FLAP_HZ: Record<Species, number> = { chickadee: 9, cardinal: 7 };
/** the rise and dip of bounding flight (world units at scale 1), and its period (s) */
const BOUND: Record<Species, number> = { chickadee: 3, cardinal: 1.6 };
const BOUND_T = 0.5;
/** the landing flare: the last part of a flight (s) */
const FLARE = 0.24;
/** perches on trees standing nearer than the crest wood (the valley stand and the edges) */
const NEAR_DEPTH = 318;

interface Flight {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  d0: number;
  d1: number;
  T: number;
  t: number;
}

interface Bird {
  sp: Species;
  perch: number;
  /** -1 facing left, 1 right */
  face: number;
  fly: Flight | null;
  /** seconds left on this perch */
  wait: number;
  /** the perched pose (0 upright, 1 looking down, 2 tail flick) and how long it is held */
  pose: number;
  poseT: number;
  /** a hop-turn in progress (0 .. 1), or -1 */
  hop: number;
  flapPh: number;
  boundPh: number;
  /** settling after touchdown (1 → 0) */
  settle: number;
  // this frame
  x: number;
  y: number;
  d: number;
  frame: BirdFrame | null;
  tilt: number;
}

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  d: number;
}

const bez = (a: number, b: number, c: number, d: number, u: number): number => {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
};

export class Birds {
  private readonly birds: Bird[] = [];
  private readonly taken = new Set<number>();
  private readonly rnd = new Rand(5099);
  private readonly grains: Grain[] = [];

  constructor(
    private readonly perches: Perch[],
    private readonly art: Record<Species, BirdArt>,
    private readonly flake: HTMLCanvasElement,
  ) {
    if (perches.length < 4) return;
    const kinds: Species[] = ['chickadee', 'chickadee', 'cardinal', 'chickadee', 'chickadee', 'cardinal', 'chickadee'];
    for (const sp of kinds) {
      // most start in the nearer pines (the valley stand and the edges), a few in the far wood
      const near = this.rnd.chance(0.75);
      let p = -1;
      for (let tries = 0; tries < 80 && p < 0; tries++) {
        const i = this.rnd.int(0, perches.length - 1);
        if (!this.taken.has(i) && (tries > 60 || near === perches[i]!.depth > NEAR_DEPTH)) p = i;
      }
      if (p < 0) break;
      this.taken.add(p);
      const q = perches[p]!;
      this.birds.push({
        sp,
        perch: p,
        face: this.rnd.chance(0.5) ? 1 : -1,
        fly: null,
        wait: this.rnd.range(1.5, 9),
        pose: 0,
        poseT: this.rnd.range(0.5, 2),
        hop: -1,
        flapPh: this.rnd.range(0, 1),
        boundPh: this.rnd.range(0, 1),
        settle: 0,
        x: q.x,
        y: q.y,
        d: q.depth,
        frame: null,
        tilt: 0,
      });
    }
  }

  /** where to go next: a free perch a short flight away, nearer ones likelier; now and then a hop along the same tree */
  private nextPerch(b: Bird): number {
    const from = this.perches[b.perch]!;
    const same = this.rnd.chance(0.25);
    let best = -1;
    let bestW = 0;
    for (let k = 0; k < 60; k++) {
      const i = this.rnd.int(0, this.perches.length - 1);
      if (i === b.perch || this.taken.has(i)) continue;
      const p = this.perches[i]!;
      if (same !== (p.tree === from.tree)) continue;
      const dist = Math.hypot(p.x - from.x, p.y - from.y);
      if (dist < 8 || dist > 340) continue;
      // a bird does not cross the whole valley in one go; it likes a tree top a little more than a bough
      // (and the nearer pines, where there are fewer perches than in the wood, as much as the wood)
      const w = Math.exp(-dist / 160) * (p.top ? 1.3 : 1) * (p.depth > NEAR_DEPTH ? 3 : 1) * this.rnd.range(0.6, 1.4);
      if (w > bestW) {
        bestW = w;
        best = i;
      }
    }
    return best;
  }

  private takeOff(b: Bird, to: number): void {
    const a = this.perches[b.perch]!;
    const c = this.perches[to]!;
    this.taken.delete(b.perch);
    this.taken.add(to);
    const dx = c.x - a.x;
    const dist = Math.hypot(dx, c.y - a.y);
    const S = depthScale((a.depth + c.depth) / 2);
    const h = 8 + 0.16 * dist;
    b.face = dx >= 0 ? 1 : -1;
    b.fly = {
      p0: { x: a.x, y: a.y },
      // up off the perch, then down onto the next from above
      p1: { x: a.x + dx * 0.28, y: Math.min(a.y, c.y) - h - 4 * S },
      p2: { x: c.x - dx * 0.22, y: c.y - h * 0.75 },
      p3: { x: c.x, y: c.y },
      d0: a.depth,
      d1: c.depth,
      T: Math.max(0.55, (dist + h) / (SPEED[b.sp] * S)),
      t: 0,
    };
    b.perch = to;
    b.pose = 0;
    b.hop = -1;
    if (!a.top) this.shake(a, 4);
  }

  /** a little snow shaken from a bough */
  private shake(p: Perch, n: number): void {
    const S = depthScale(p.depth);
    for (let i = 0; i < n; i++) {
      this.grains.push({
        x: p.x + this.rnd.range(-3, 3) * S,
        y: p.y + this.rnd.range(0, 2) * S,
        vx: this.rnd.range(-6, 6) * S,
        vy: this.rnd.range(0, 8) * S,
        age: 0,
        life: this.rnd.range(0.7, 1.3),
        r: this.rnd.range(0.5, 1.1) * S,
        d: p.depth,
      });
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (const b of this.birds) {
      if (b.fly) this.flyStep(b, dt);
      else this.perchStep(b, dt);
    }
    for (const g of this.grains) {
      g.age += dt;
      g.vy += 40 * dt * depthScale(g.d);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
    for (let i = this.grains.length - 1; i >= 0; i--) if (this.grains[i]!.age > this.grains[i]!.life) this.grains.splice(i, 1);
  }

  private perchStep(b: Bird, dt: number): void {
    const p = this.perches[b.perch]!;
    b.d = p.depth;
    b.x = p.x;
    b.y = p.y;
    b.tilt = 0;
    b.settle = Math.max(0, b.settle - dt / 0.3);
    // a hop-turn: a little jump, facing the other way at the top of it
    if (b.hop >= 0) {
      const was = b.hop;
      b.hop += dt / 0.2;
      if (was < 0.5 && b.hop >= 0.5) b.face = -b.face;
      if (b.hop >= 1) b.hop = -1;
      else b.y -= Math.sin(Math.PI * b.hop) * 2.2 * depthScale(p.depth);
    }
    // looking about: down at the bough, a flick of the tail, a turn
    b.poseT -= dt;
    if (b.poseT <= 0) {
      const r = this.rnd.next();
      if (b.pose !== 0) {
        b.pose = 0;
        b.poseT = this.rnd.range(0.6, 2.2);
      } else if (r < 0.35) {
        b.pose = 1;
        b.poseT = this.rnd.range(0.4, 1.1);
      } else if (r < 0.6) {
        b.pose = 2;
        b.poseT = 0.16;
      } else if (r < 0.85) {
        b.hop = 0;
        b.poseT = this.rnd.range(0.8, 2);
      } else b.poseT = this.rnd.range(0.5, 1.5);
    }
    b.frame = this.art[b.sp].perch[b.pose as 0 | 1 | 2];
    // and now and then, off to another perch
    b.wait -= dt;
    if (b.wait <= 0 && b.hop < 0) {
      const to = this.nextPerch(b);
      if (to >= 0) this.takeOff(b, to);
      b.wait = this.rnd.range(3, 11);
    }
  }

  private flyStep(b: Bird, dt: number): void {
    const f = b.fly!;
    f.t += dt;
    const tau = clamp(f.t / f.T, 0, 1);
    // eased out of the take-off and into the landing
    const u = tau * tau * (3 - 2 * tau) * 0.55 + tau * 0.45;
    const x = bez(f.p0.x, f.p1.x, f.p2.x, f.p3.x, u);
    let y = bez(f.p0.y, f.p1.y, f.p2.y, f.p3.y, u);
    b.d = f.d0 + (f.d1 - f.d0) * u;
    const S = depthScale(b.d);
    // bounding: rising on the wingbeats, dipping in the glide (faded out at both ends)
    b.boundPh = (b.boundPh + dt / BOUND_T) % 1;
    const env = Math.sin(Math.PI * tau);
    y -= Math.sin(2 * Math.PI * b.boundPh) * BOUND[b.sp] * S * env;
    const flapping = Math.cos(2 * Math.PI * b.boundPh) > -0.2 || tau < 0.2 || b.sp === 'cardinal';
    const left = f.T - f.t;
    const art = this.art[b.sp];
    // the heading tips the body: nose up climbing, down descending
    const u2 = Math.min(1, u + 0.02);
    const vx = bez(f.p0.x, f.p1.x, f.p2.x, f.p3.x, u2) - x;
    const vy = bez(f.p0.y, f.p1.y, f.p2.y, f.p3.y, u2) - bez(f.p0.y, f.p1.y, f.p2.y, f.p3.y, u);
    b.tilt = clamp(Math.atan2(vy, Math.abs(vx) + 1e-6) * 0.45, -0.45, 0.45);
    if (left < FLARE) {
      b.frame = art.flare;
      b.tilt = 0;
    } else if (flapping) {
      b.flapPh = (b.flapPh + dt * FLAP_HZ[b.sp]) % 1;
      b.frame = art.fly[Math.floor(b.flapPh * art.fly.length) % art.fly.length]!;
    } else b.frame = art.glide;
    b.x = x;
    b.y = y;
    if (f.t >= f.T) {
      b.fly = null;
      b.settle = 1;
      b.poseT = this.rnd.range(0.6, 1.6);
      b.wait = this.rnd.range(2.5, 9);
      const p = this.perches[b.perch]!;
      if (!p.top) this.shake(p, 3);
      this.perchStep(b, 0);
    }
  }

  /** settle into the perched pose without any motion (reduced motion) */
  still(): void {
    for (const b of this.birds) {
      const p = this.perches[b.perch]!;
      b.x = p.x;
      b.y = p.y;
      b.d = p.depth;
      b.tilt = 0;
      b.frame = this.art[b.sp].perch[0];
    }
  }

  /** what to draw, keyed by depth (each bird just in front of the tree it is at, or at its depth in flight) */
  items(ctx: CanvasRenderingContext2D): Array<{ y: number; draw: () => void }> {
    const out: Array<{ y: number; draw: () => void }> = [];
    for (const b of this.birds) {
      if (!b.frame) continue;
      out.push({ y: b.d + 0.3, draw: () => this.drawBird(ctx, b) });
    }
    for (const g of this.grains) {
      out.push({
        y: g.d + 0.2,
        draw: () => {
          const a = clamp(1 - g.age / g.life, 0, 1) * 0.9;
          ctx.globalAlpha = a;
          ctx.drawImage(this.flake, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
          ctx.globalAlpha = 1;
        },
      });
    }
    return out;
  }

  private drawBird(ctx: CanvasRenderingContext2D, b: Bird): void {
    const fr = b.frame!;
    const S = depthScale(b.d);
    const k = (LEN[b.sp] * S) / fr.len;
    // touching down: a small dip of the body on the legs as it settles
    const dip = b.settle > 0 ? Math.sin(Math.PI * b.settle) * 0.6 * S : 0;
    ctx.save();
    ctx.translate(b.x, b.y + dip);
    ctx.scale(b.face * k, k);
    if (b.tilt) ctx.rotate(b.tilt);
    ctx.drawImage(fr.cv, -fr.ax, -fr.ay);
    ctx.restore();
  }
}
