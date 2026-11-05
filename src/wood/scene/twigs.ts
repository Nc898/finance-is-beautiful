/**
 * The fee, taken off the top: while the timeline plays, sprigs are cut from the top of each crown and flutter down,
 * as many as the fee is large (a 1% fee drops ten times the sprigs of a 0.1% fee). Deterministic per seed; off in
 * reduced motion and when paused.
 */
import { Rand } from '../../scene/prng';
import { rgba } from '../../scene/watercolor';

type Ctx = CanvasRenderingContext2D;

interface Twig {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  spin: number;
  ground: number;
  age: number;
  rest: number;
  len: number;
  leaf: string;
}

const LEAF = ['#9CC25A', '#B6D264', '#7CA84A', '#C8DC72'];
const MAX = 90;

export class Twigs {
  private list: Twig[] = [];
  private due = 0;
  private rnd: Rand;
  constructor(seed: number) {
    this.rnd = new Rand(seed);
  }

  clear(): void {
    this.list = [];
    this.due = 0;
  }

  /**
   * Advance by dt seconds. `rate` is sprigs a second; they leave from the crown top (cx, top) within `half` either
   * side, and come to rest on the ground at `groundY`.
   */
  update(dt: number, rate: number, cx: number, top: number, half: number, groundY: number): void {
    const r = this.rnd;
    this.due += rate * dt;
    while (this.due >= 1 && this.list.length < MAX) {
      this.due -= 1;
      this.list.push({
        x: cx + r.range(-1, 1) * half,
        y: top + r.range(0, 10),
        vx: r.range(-6, 6),
        vy: r.range(8, 18),
        a: r.range(0, Math.PI * 2),
        spin: r.range(-3, 3),
        ground: groundY + r.range(-4, 8),
        age: 0,
        rest: 0,
        len: r.range(2.6, 4.2),
        leaf: r.pick(LEAF),
      });
    }
    if (this.list.length >= MAX) this.due = 0;
    for (const t of this.list) {
      t.age += dt;
      if (t.y < t.ground) {
        t.vy = Math.min(42, t.vy + 26 * dt);
        t.x += (t.vx + Math.sin(t.age * 3.1 + t.a) * 14) * dt;
        t.y += t.vy * dt;
        t.a += t.spin * dt;
      } else t.rest += dt;
    }
    this.list = this.list.filter((t) => t.rest < 1.4);
  }

  draw(ctx: Ctx): void {
    ctx.lineCap = 'round';
    for (const t of this.list) {
      const alpha = t.rest > 0 ? Math.max(0, 1 - t.rest / 1.4) : Math.min(1, t.age * 4);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.a);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(92,66,42,0.9)';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(-t.len / 2, 0);
      ctx.lineTo(t.len / 2, 0);
      ctx.stroke();
      ctx.fillStyle = rgba(t.leaf, 0.85);
      for (const [px, side] of [
        [-0.15, 1],
        [0.3, -1],
        [0.5, 1],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(px * t.len, side * 1.1, 1.5, 0.75, side * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
