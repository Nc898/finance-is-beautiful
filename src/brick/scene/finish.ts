/**
 * The finishing touches, and the spring air:
 * - a paid-off house: a sprig of green tied to the chimney (the builders' topping-out custom), smoke curling from a
 *   pot, and window boxes of tulips under the ground-floor windows;
 * - blossom petals drifting from the tree between the plots on the breeze, turning as they fall, settling on the
 *   grass and fading slowly (never popping in or out). None of it moves in reduced motion.
 */
import { Rand } from '../../scene/prng';
import { rgba, tracePoly } from '../../scene/watercolor';
import { ribbon } from '../../river/scene/boatInk';
import { BLOSSOM, GROUND_Y, HOUSE } from './geom';
import type { HouseView } from './houseView';
import type { LoanId } from '../types';

/** the topping-out sprig: a little green branch tied upright to the chimney's top, a ribbon at its foot */
export function drawSprig(ctx: CanvasRenderingContext2D, v: HouseView, t: number): void {
  const top = v.chimneyTop();
  const c = v.plan.chim;
  const x = c.x1 - 3;
  const y = top.y + 9;
  const sway = Math.sin(t * 1.3) * 0.06;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.strokeStyle = 'rgba(96,74,48,0.95)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0.5, -16);
  ctx.stroke();
  const rnd = new Rand(19);
  for (let i = 0; i < 9; i++) {
    const h = -4 - i * 1.4;
    const s = i % 2 ? 1 : -1;
    ctx.fillStyle = rgba(rnd.pick(['#5E8A3A', '#78A048', '#4E7A34']), 0.92);
    ctx.beginPath();
    ctx.ellipse(s * 2.2, h, 2.6 - i * 0.12, 1, s * -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,52,58,0.95)';
  tracePoly(ctx, [-1.4, -1, 1.4, -1, 2.4, 3.2, 0, 1.6, -2.4, 3.2]);
  ctx.fill();
  ctx.restore();
}

/** smoke from the chimney: soft wisps rising and drifting right on the breeze, thinning as they go */
export function drawSmoke(ctx: CanvasRenderingContext2D, v: HouseView, t: number, still: boolean): void {
  const top = v.chimneyTop();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const age = still ? i / n : (t * 0.22 + i / n) % 1;
    const y = top.y - 2 - age * 70;
    const x = top.x - 4 + age * 34 + Math.sin(age * 6 + i) * 3 * age;
    const r = 2.6 + age * 10;
    const a = 0.42 * (1 - age) * Math.min(1, age * 6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(176,174,188,${a})`);
    g.addColorStop(0.6, `rgba(196,194,206,${a * 0.5})`);
    g.addColorStop(1, 'rgba(210,210,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a window box planted with tulips under each ground-floor window */
export function drawTulips(ctx: CanvasRenderingContext2D, id: LoanId): void {
  const rnd = new Rand(id === 'a' ? 77 : 83);
  for (const w of HOUSE[id].windows) {
    if (w.y1 < GROUND_Y - 60) continue;
    const y = w.y1 + 6;
    // the box, hung under the sill
    ctx.fillStyle = 'rgba(112,82,56,0.95)';
    ctx.fillRect(w.x0 - 1, y, w.x1 - w.x0 + 2, 6);
    ctx.fillStyle = 'rgba(255,236,200,0.25)';
    ctx.fillRect(w.x0 - 1, y, w.x1 - w.x0 + 2, 1);
    ctx.strokeStyle = 'rgba(59,42,34,0.5)';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(w.x0 - 1, y, w.x1 - w.x0 + 2, 6);
    for (let x = w.x0 + 3; x < w.x1 - 1; x += 4.2) {
      const h = rnd.range(6, 9);
      ctx.fillStyle = rgba('#5E8A3A', 0.9);
      ribbon(ctx, [x, y, x + rnd.range(-0.6, 0.6), y - h * 0.6, x + rnd.range(-0.4, 0.4), y - h], 0.6, 0.9);
      ctx.fillStyle = rgba(rnd.pick(['#D8384A', '#E8644A', '#F2C24A', '#C83A6A']), 0.95);
      ctx.beginPath();
      ctx.ellipse(x, y - h - 1.4, 1.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,0.4)';
      ctx.fillRect(x - 0.9, y - h - 2.8, 0.6, 1.4);
    }
  }
}

/* ------------------------------------------------------------------ petals */

interface Petal {
  x: number;
  y: number;
  /** height above its ground depth */
  h: number;
  vx: number;
  vh: number;
  spin: number;
  ang: number;
  col: string;
  /** seconds lying on the grass */
  rest: number;
  life: number;
}

const COLS = ['#FBE6EA', '#F6D2DA', '#FFFFFF', '#F2C4CE', '#FDF0F2'];

export class Petals {
  private list: Petal[] = [];
  private rnd = new Rand(5511);
  private acc = 0;

  update(dt: number, t: number, moving: boolean): void {
    if (!moving) return;
    // a new petal leaves the crown now and then (more on a gust)
    const gust = 0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1);
    this.acc += dt * (1.6 + 3.5 * gust);
    while (this.acc > 1 && this.list.length < 46) {
      this.acc -= 1;
      const r = this.rnd;
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next());
      this.list.push({
        x: BLOSSOM.x + Math.cos(a) * 62 * d,
        y: BLOSSOM.y + r.range(-14, 26),
        h: 150 + Math.sin(a) * 46 * d,
        vx: r.range(4, 12),
        vh: -r.range(9, 15),
        spin: r.range(-3, 3),
        ang: r.range(0, 6),
        col: r.pick(COLS),
        rest: 0,
        life: r.range(5, 9),
      });
    }
    for (const p of this.list) {
      if (p.h > 0) {
        p.x += (p.vx + 6 * Math.sin(t * 1.7 + p.ang)) * dt;
        p.h = Math.max(0, p.h + p.vh * dt + Math.sin(t * 2.3 + p.ang * 3) * 4 * dt);
        p.ang += p.spin * dt;
      } else p.rest += dt;
    }
    this.list = this.list.filter((p) => p.rest < p.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const fade = p.h > 0 ? 1 : Math.max(0, 1 - p.rest / p.life);
      const flip = Math.abs(Math.cos(p.ang));
      ctx.fillStyle = rgba(p.col, 0.9 * fade);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - p.h, 1.6, 0.6 + 0.9 * flip, p.ang, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
