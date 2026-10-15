/**
 * Things that fall: the clippings a snip lets go of (vine leaves and bits of stem tumbling and fluttering from
 * the shears to the foot of the wall, where they lie until raked toward the pile), and autumn leaves drifting
 * down on the breeze from the big trees. Everything is a cached sprite moved per frame: no painting here.
 *
 * Motion is continuous: a piece starts at rest where it hung, accelerates, reaches a gentle terminal speed and
 * flutters (sideways sway and a slow spin that settles as it lands). Pieces fade in and out; nothing pops.
 */
import { Rand, clamp } from '../../scene/prng';
import type { Sprite } from './art';
import { wind } from './art';
import { GROUND_Y } from './geom';
import type { PlanId } from '../types';

/** a clipping: a vine leaf or a twig, falling or lying */
interface Piece {
  spr: Sprite | null;
  /** twig: length and colour, when spr is null */
  len: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  ph: number;
  /** where it lands */
  floor: number;
  /** 0 falling, 1 lying, 2 being raked */
  state: 0 | 1 | 2;
  t: number;
  /** raked: from, to */
  rx0: number;
  ry0: number;
  rx1: number;
  ry1: number;
  alpha: number;
}

const G = 70;
const TERMINAL = 34;

export class Clippings {
  private pieces: Piece[] = [];
  private rnd: Rand;
  constructor(
    readonly id: PlanId,
    seed: number,
  ) {
    this.rnd = new Rand(seed);
  }

  /** how many lie at the foot of the wall waiting for the rake */
  get lying(): number {
    let n = 0;
    for (const p of this.pieces) if (p.state === 1) n++;
    return n;
  }
  get busy(): boolean {
    return this.pieces.some((p) => p.state !== 1);
  }

  /** a leaf let go at (x, y), already turned `rot`, at `size` (scale of the sprite) */
  dropLeaf(spr: Sprite, x: number, y: number, rot: number, size: number): void {
    this.add({ spr, len: 0, x, y, rot, size });
  }

  /** a bit of stem let go at (x, y) */
  dropTwig(x: number, y: number, len: number, rot: number): void {
    this.add({ spr: null, len, x, y, rot, size: 1 });
  }

  private add(o: { spr: Sprite | null; len: number; x: number; y: number; rot: number; size: number }): void {
    const r = this.rnd;
    this.pieces.push({
      ...o,
      vx: r.range(-4, 4),
      vy: r.range(-2, 3),
      spin: r.range(-2.4, 2.4),
      ph: r.range(0, 6.28),
      floor: GROUND_Y + r.range(3, 17),
      state: 0,
      t: 0,
      rx0: 0,
      ry0: 0,
      rx1: 0,
      ry1: 0,
      alpha: 1,
    });
    // never let the ground carpet grow without bound: the oldest lying pieces wither into the grass
    let lying = 0;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (p.state !== 1) continue;
      lying++;
      if (lying > 90) p.alpha = Math.min(p.alpha, 0.99);
    }
  }

  /** a rake stroke: up to `n` lying pieces slide off toward the pile and fade into it */
  rake(n: number, pile: { x: number; y: number }): void {
    const r = this.rnd;
    let k = 0;
    for (const p of this.pieces) {
      if (p.state !== 1 || k >= n) continue;
      p.state = 2;
      p.t = 0;
      p.rx0 = p.x;
      p.ry0 = p.y;
      p.rx1 = pile.x + r.range(-16, 16);
      p.ry1 = pile.y + r.range(-8, 4);
      k++;
    }
  }

  /** remove everything at once (a jump of the timeline) */
  clear(): void {
    this.pieces.length = 0;
  }

  update(dt: number, t: number): void {
    const w = wind(t);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (p.state === 0) {
        p.t += dt;
        // gravity to a gentle terminal speed, a flutter sideways and a breeze to the right
        p.vy = Math.min(TERMINAL, p.vy + G * dt);
        const flutter = Math.sin(p.t * 5.2 + p.ph) * 9 * clamp(p.t * 2, 0, 1);
        p.vx += ((w * 6 + flutter) - p.vx) * (1 - Math.exp(-dt * 3));
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt * (0.6 + 0.4 * Math.sin(p.t * 3 + p.ph));
        if (p.y >= p.floor) {
          p.y = p.floor;
          p.state = 1;
          p.t = 0;
        }
      } else if (p.state === 1) {
        p.t += dt;
        // pieces past the carpet's limit wither away slowly
        if (p.alpha < 1) {
          p.alpha -= dt * 0.25;
          if (p.alpha <= 0) this.pieces.splice(i, 1);
        }
      } else {
        p.t += dt;
        const u = clamp(p.t / 0.7, 0, 1);
        const e = u * u * (3 - 2 * u);
        p.x = p.rx0 + (p.rx1 - p.rx0) * e;
        p.y = p.ry0 + (p.ry1 - p.ry0) * e - Math.sin(Math.PI * u) * 5;
        p.rot += dt * 2;
        p.alpha = 1 - clamp((u - 0.6) / 0.4, 0, 1);
        if (u >= 1) this.pieces.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const m0 = ctx.getTransform();
    for (const p of this.pieces) {
      if (p.alpha <= 0.01) continue;
      ctx.globalAlpha = p.alpha;
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      // lying pieces lie flat: squash toward the ground
      const flat = p.state === 1 ? 0.55 : 1;
      ctx.setTransform(m0.a * c * p.size, m0.a * s * p.size * flat, -m0.a * s * p.size, m0.a * c * p.size * flat, m0.e + m0.a * p.x, m0.f + m0.a * p.y);
      if (p.spr) ctx.drawImage(p.spr.cv, -p.spr.px, -p.spr.py, p.spr.w, p.spr.h);
      else {
        ctx.strokeStyle = '#6A4A3A';
        ctx.lineWidth = 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.len / 2, 0);
        ctx.quadraticCurveTo(0, -0.8, p.len / 2, 0);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(m0);
  }
}

/* ---------------------------------------------------------------- leaves drifting down from the trees */

interface Drift {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  ph: number;
  floor: number;
  /** 0 falling, 1 settled */
  state: 0 | 1;
  t: number;
  life: number;
  spr: Sprite;
  size: number;
}

export interface Crown {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * A steady few leaves falling from the big trees' crowns. Each fades in just under the crown, drifts down on
 * the breeze with a flutter and a spin, settles on the lawn, rests a moment and fades out; then another starts.
 */
export class Drifting {
  private leaves: Drift[] = [];
  private rnd = new Rand(31337);
  constructor(
    private crowns: Crown[],
    private sprites: Sprite[],
    n: number,
  ) {
    for (let i = 0; i < n; i++) {
      const d = this.spawn();
      // spread them through their fall so the first frames already have leaves in the air
      const pre = this.rnd.range(0, 6);
      for (let k = 0; k < pre * 20; k++) this.step(d, 0.05, k * 0.05);
      this.leaves.push(d);
    }
  }

  private spawn(): Drift {
    const r = this.rnd;
    const c = this.crowns[r.int(0, this.crowns.length - 1)]!;
    const a = r.range(0, Math.PI * 2);
    const rr = Math.sqrt(r.next()) * 0.85;
    return {
      x: c.cx + Math.cos(a) * c.rx * rr,
      y: c.cy + Math.abs(Math.sin(a)) * c.ry * rr * 0.6,
      vx: 0,
      vy: 0,
      rot: r.range(0, 6.28),
      spin: r.range(-1.8, 1.8),
      ph: r.range(0, 6.28),
      floor: r.range(GROUND_Y + 30, 630),
      state: 0,
      t: 0,
      life: 0,
      spr: this.sprites[r.int(0, this.sprites.length - 1)]!,
      size: r.range(0.75, 1.15),
    };
  }

  private step(d: Drift, dt: number, t: number): void {
    d.life += dt;
    if (d.state === 0) {
      d.t += dt;
      d.vy = Math.min(22, d.vy + 40 * dt);
      const flutter = Math.sin(d.t * 2.6 + d.ph) * 14;
      d.vx += ((wind(t) * 10 + 6 + flutter) - d.vx) * (1 - Math.exp(-dt * 2));
      d.x += d.vx * dt;
      d.y += d.vy * dt * (0.75 + 0.25 * Math.sin(d.t * 2.6 + d.ph + 1.2));
      d.rot += d.spin * dt;
      if (d.y >= d.floor) {
        d.state = 1;
        d.t = 0;
      }
    } else d.t += dt;
  }

  update(dt: number, t: number): void {
    for (let i = 0; i < this.leaves.length; i++) {
      const d = this.leaves[i]!;
      this.step(d, dt, t);
      if (d.state === 1 && d.t > 3.5) this.leaves[i] = this.spawn();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const m0 = ctx.getTransform();
    for (const d of this.leaves) {
      // fade in under the crown, fade out after resting a moment on the lawn
      const a = clamp(d.life / 0.8, 0, 1) * (d.state === 1 ? clamp(1 - (d.t - 2) / 1.5, 0, 1) : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const c = Math.cos(d.rot);
      const s = Math.sin(d.rot);
      // falling leaves tumble: their width breathes as they turn over
      const turn = d.state === 0 ? 0.45 + 0.55 * Math.abs(Math.cos(d.t * 2.1 + d.ph)) : 0.6;
      const k = d.size;
      ctx.setTransform(m0.a * c * k * turn, m0.a * s * k * turn, -m0.a * s * k, m0.a * c * k, m0.e + m0.a * d.x, m0.f + m0.a * d.y);
      ctx.drawImage(d.spr.cv, -d.spr.px, -d.spr.py, d.spr.w, d.spr.h);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(m0);
  }
}
