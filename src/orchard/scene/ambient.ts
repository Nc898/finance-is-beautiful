/**
 * The late-summer air (decorative, wall clock; it goes on while paused, and none of it is drawn or moves in reduced
 * motion), as Brick's petals (brick/scene/finish.ts):
 * - a leaf or two now and then let go by the old tree, turning as it drifts down on the breeze to the right,
 *   settling in the grass and fading slowly (never popping in or out);
 * - wasps over the windfalls, while there are windfalls on a side to be drawn to: small, quick, erratic, hovering
 *   low over the rotting fruit;
 * - two butterflies (a small tortoiseshell, a cabbage white) wandering over the verges' flowers;
 * - swallows high up now and then, two or three swooping across the sky together;
 * - rarely, an apple let go by the old tree's high crown: it drops, bounces once in the grass and lies there,
 *   browning, until it fades.
 * Each thing on the ground is an item drawn in depth order (its ground y); the swallows are drawn over the sky only,
 * behind everything else.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, rgba } from '../../scene/watercolor';
import { FARM_TREE, TRACK, WINDFALL } from './geom';
import type { Item } from './partsApi';
import type { PickerId } from '../types';
import { paintApple } from './farmTree';

interface Leaf {
  x: number;
  /** the ground depth it falls toward (and is drawn at) */
  y: number;
  h: number;
  vx: number;
  vh: number;
  spin: number;
  ang: number;
  col: string;
  rest: number;
  life: number;
}

interface Drop {
  x: number;
  y: number;
  h: number;
  vh: number;
  vx: number;
  bounced: number;
  rest: number;
  life: number;
  rnd: Rand;
}

interface Flyer {
  x: number;
  y: number;
  h: number;
  /** wander phases */
  p: number;
  q: number;
  heading: number;
  kind: 'tortoiseshell' | 'white';
}

interface Wasp {
  id: PickerId;
  p: number;
  q: number;
  r: number;
}

interface Swallow {
  x: number;
  y: number;
  vx: number;
  phase: number;
  dy: number;
}

const LEAF_COLS = ['#C8AE48', '#D6BC5A', '#A8A848', '#BC8E3C', '#9AA250', '#D2A44C'];

export class Ambient {
  private rnd = new Rand(7717);
  private leaves: Leaf[] = [];
  private drops: Drop[] = [];
  private nextLeaf = 3;
  private nextDrop = 18;
  private nextSwallows = 9;
  private swallows: Swallow[] = [];
  private flyers: Flyer[];
  private wasps: Wasp[] = [];
  /** how present the wasps are on each side (0 … 1), easing as the windfalls come and go */
  private waspK: Record<PickerId, number> = { a: 0, b: 0 };
  private t = 0;

  constructor(private dropFrom: ReadonlyArray<{ x: number; y: number }>) {
    const r = this.rnd;
    this.flyers = [
      { x: 230, y: 556, h: 10, p: r.range(0, 9), q: r.range(0, 9), heading: 0, kind: 'tortoiseshell' },
      { x: 760, y: 600, h: 14, p: r.range(0, 9), q: r.range(0, 9), heading: 0, kind: 'white' },
    ];
    for (const id of ['a', 'b'] as const) for (let k = 0; k < 3; k++) this.wasps.push({ id, p: r.range(0, 20), q: r.range(0, 20), r: r.range(0.7, 1.3) });
  }

  /** advance the air by dt seconds; `windfalls` says where there is fallen fruit for the wasps */
  update(dt: number, windfalls: Record<PickerId, boolean>, viewX0: number, viewX1: number): void {
    const r = this.rnd;
    this.t += dt;
    const t = this.t;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1);
    // leaves
    this.nextLeaf -= dt * (0.6 + gust);
    if (this.nextLeaf <= 0) {
      this.nextLeaf = r.range(4, 9);
      const a = r.range(Math.PI * 1.05, Math.PI * 1.95);
      const d = Math.sqrt(r.next());
      const sx = FARM_TREE.x + Math.cos(a) * 170 * d;
      const sy = 250 + Math.sin(a) * -100 * d * 0.4 + r.range(0, 90);
      const ground = r.range(494, 540);
      this.leaves.push({ x: sx, y: ground, h: ground - sy, vx: r.range(6, 14), vh: -r.range(12, 20), spin: r.range(-3, 3), ang: r.range(0, 6), col: r.pick(LEAF_COLS), rest: 0, life: r.range(6, 10) });
    }
    for (const p of this.leaves) {
      if (p.h > 0) {
        p.x += (p.vx * (0.6 + gust) + 8 * Math.sin(t * 1.6 + p.ang)) * dt;
        p.h = Math.max(0, p.h + p.vh * dt + Math.sin(t * 2.2 + p.ang * 3) * 6 * dt);
        p.ang += p.spin * dt;
      } else p.rest += dt;
    }
    this.leaves = this.leaves.filter((p) => p.rest < p.life);
    // an apple from the high crown, now and then
    this.nextDrop -= dt;
    if (this.nextDrop <= 0 && this.dropFrom.length) {
      this.nextDrop = r.range(26, 48);
      const from = r.pick(this.dropFrom);
      const ground = r.range(494, 506);
      this.drops.push({ x: from.x, y: ground, h: ground - from.y, vh: 0, vx: r.range(-3, 3), bounced: 0, rest: 0, life: r.range(10, 16), rnd: new Rand(r.int(1, 1e6)) });
    }
    for (const d of this.drops) {
      if (d.h > 0 || d.vh > 0) {
        d.vh -= 353 * dt;
        d.h += d.vh * dt;
        d.x += d.vx * dt;
        if (d.h <= 0) {
          d.h = 0;
          // one small bounce, then it lies (rolling a little)
          d.vh = d.bounced === 0 ? 34 : 0;
          d.vx = d.bounced === 0 ? d.vx + 8 : 0;
          d.bounced++;
        }
      } else d.rest += dt;
    }
    this.drops = this.drops.filter((d) => d.rest < d.life);
    // wasps come and go with the windfalls
    for (const id of ['a', 'b'] as const) this.waspK[id] = clamp(this.waspK[id] + (windfalls[id] ? dt : -dt) * 0.8, 0, 1);
    // the butterflies wander over the verges, never far from the flowers
    for (const f of this.flyers) {
      f.p += dt * 0.5;
      f.q += dt * 0.37;
      const turn = Math.sin(f.p * 1.3) * 1.4 + Math.sin(f.q * 2.1) * 0.8;
      f.heading += turn * dt;
      const sp = 16;
      f.x += Math.cos(f.heading) * sp * dt;
      f.y += Math.sin(f.heading) * sp * 0.25 * dt;
      // kept over the verges: turned back gently at the edges
      const lo = 540;
      const hi = TRACK.y1 + 16;
      if (f.y < lo) f.heading += dt * 2 * Math.sign(Math.cos(f.heading) || 1);
      if (f.y > hi) f.heading -= dt * 2 * Math.sign(Math.cos(f.heading) || 1);
      f.y = clamp(f.y, lo - 6, hi + 6);
      if (f.x < viewX0 + 40) f.heading = f.heading * 0.98;
      if (f.x < viewX0 + 20) f.x = viewX0 + 20;
      if (f.x > viewX1 - 20) f.x = viewX1 - 20;
      if (f.x < viewX0 + 40 && Math.cos(f.heading) < 0) f.heading = Math.PI - f.heading;
      if (f.x > viewX1 - 40 && Math.cos(f.heading) > 0) f.heading = Math.PI - f.heading;
      f.h = 9 + 6 * Math.sin(f.p * 2.3) + 3 * Math.sin(f.q * 5);
    }
    // swallows: a little group now and then, swooping across high up
    this.nextSwallows -= dt;
    if (this.nextSwallows <= 0 && this.swallows.length === 0) {
      this.nextSwallows = r.range(16, 30);
      const dir = r.chance(0.5) ? 1 : -1;
      const n = r.int(2, 3);
      const y = r.range(140, 210);
      for (let k = 0; k < n; k++) this.swallows.push({ x: dir > 0 ? viewX0 - 30 - k * r.range(20, 40) : viewX1 + 30 + k * r.range(20, 40), y: y + r.range(-14, 14), vx: dir * r.range(150, 190), phase: r.range(0, 6), dy: r.range(10, 22) });
    }
    for (const s of this.swallows) {
      s.x += s.vx * dt;
      s.phase += dt;
    }
    this.swallows = this.swallows.filter((s) => s.x > viewX0 - 200 && s.x < viewX1 + 200);
  }

  /** the swallows, high over the sky (drawn behind everything standing) */
  drawSky(ctx: CanvasRenderingContext2D): void {
    for (const s of this.swallows) {
      const y = s.y + Math.sin(s.phase * 1.7) * s.dy;
      const flap = Math.sin(s.phase * 13);
      const glide = Math.sin(s.phase * 0.9) > 0.3;
      const w = glide ? 0.2 : flap;
      const dir = Math.sign(s.vx);
      ctx.save();
      ctx.translate(s.x, y);
      ctx.scale(dir, 1);
      ctx.rotate(Math.cos(s.phase * 1.7) * 0.25);
      ctx.fillStyle = 'rgba(44,46,70,0.85)';
      // the body, the forked tail, the swept wings
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-6.4, -1.4);
      ctx.lineTo(-3.4, 0.1);
      ctx.lineTo(-6.4, 1.6);
      ctx.closePath();
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0.6, 0);
        ctx.quadraticCurveTo(-1, side * (3 + w * 1.5) - 1, -4.2, side * (5.4 + w * 1.8) - w * 1.5);
        ctx.quadraticCurveTo(-0.6, side * 1.6, -0.8, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** the things on the ground or near it, as depth-sorted items */
  items(): Item[] {
    const out: Item[] = [];
    for (const p of this.leaves) {
      out.push({
        depth: p.y,
        draw: (ctx) => {
          const fade = p.h > 0 ? 1 : Math.max(0, 1 - p.rest / p.life);
          const flip = Math.abs(Math.cos(p.ang));
          ctx.fillStyle = rgba(p.col, 0.9 * fade);
          almond(ctx, p.x, p.y - p.h, p.ang, 3.4, 0.5 + 0.9 * flip, 0.3);
          ctx.fill();
          ctx.strokeStyle = `rgba(90,70,40,${0.5 * fade})`;
          ctx.lineWidth = 0.25;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.ang) * 1.7, p.y - p.h - Math.sin(p.ang) * 1.7);
          ctx.lineTo(p.x + Math.cos(p.ang) * 1.7, p.y - p.h + Math.sin(p.ang) * 1.7);
          ctx.stroke();
        },
      });
    }
    for (const d of this.drops) {
      out.push({
        depth: d.y,
        draw: (ctx) => {
          const fade = Math.max(0, 1 - Math.max(0, d.rest - d.life * 0.5) / (d.life * 0.5));
          if (fade <= 0) return;
          ctx.save();
          ctx.globalAlpha = fade;
          if (d.h < 30) {
            ctx.fillStyle = `rgba(80,70,90,${0.25 * (1 - d.h / 30)})`;
            ctx.beginPath();
            ctx.ellipse(d.x + 1.2, d.y + 0.4, 2.6, 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          const rnd = new Rand(7);
          // browning as it lies
          paintApple(ctx, d.x, d.y - d.h - 2, 2.2, 0.6 - Math.min(1, d.rest / 6) * 0.8, rnd);
          ctx.restore();
        },
      });
    }
    for (const w of this.wasps) {
      const k = this.waspK[w.id];
      if (k <= 0.01) continue;
      const R = WINDFALL[w.id];
      const t = this.t * w.r;
      const x = (R.x0 + R.x1) / 2 + Math.sin(t * 1.7 + w.p) * (R.x1 - R.x0) * 0.32 + Math.sin(t * 6.1 + w.q) * 3;
      const y = (R.y0 + R.y1) / 2 + Math.sin(t * 1.3 + w.q) * (R.y1 - R.y0) * 0.3;
      const h = 3 + 3 * Math.abs(Math.sin(t * 2.3 + w.p)) + Math.sin(t * 9 + w.q) * 0.8;
      const facing = Math.cos(t * 1.7 + w.p) >= 0 ? 1 : -1;
      out.push({
        depth: y,
        draw: (ctx) => {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.translate(x, y - h);
          ctx.scale(facing, 1);
          // the wings, a pale blur
          ctx.fillStyle = 'rgba(236,240,246,0.55)';
          ctx.beginPath();
          ctx.ellipse(-0.1, -0.7, 0.9, 0.45, -0.5, 0, Math.PI * 2);
          ctx.fill();
          // the body: gold banded with black
          ctx.fillStyle = 'rgba(214,166,40,0.95)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 1.1, 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(40,30,24,0.9)';
          ctx.fillRect(-0.45, -0.45, 0.25, 0.9);
          ctx.fillRect(0.05, -0.45, 0.22, 0.9);
          ctx.beginPath();
          ctx.arc(0.95, -0.05, 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }
    for (const f of this.flyers) {
      out.push({
        depth: f.y,
        draw: (ctx) => {
          const flap = Math.abs(Math.sin(f.p * 22));
          const dir = Math.cos(f.heading) >= 0 ? 1 : -1;
          ctx.save();
          ctx.translate(f.x, f.y - f.h);
          ctx.scale(dir, 1);
          const fore = f.kind === 'white' ? 'rgba(250,248,238,0.95)' : 'rgba(214,110,44,0.95)';
          const hind = f.kind === 'white' ? 'rgba(240,238,222,0.95)' : 'rgba(196,92,40,0.95)';
          const open = 0.35 + 0.65 * flap;
          for (const side of [-1, 1]) {
            ctx.fillStyle = fore;
            ctx.beginPath();
            ctx.ellipse(0.3, -1.2 * open * (side < 0 ? 1 : 0.8), 1.6, 1.2 * open, side * 0.2 - 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hind;
            ctx.beginPath();
            ctx.ellipse(-0.6, -0.6 * open, 1.1, 0.9 * open, 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
          if (f.kind === 'tortoiseshell') {
            ctx.fillStyle = 'rgba(40,30,30,0.7)';
            ctx.beginPath();
            ctx.arc(0.9, -1.6 * open, 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(250,240,200,0.8)';
            ctx.beginPath();
            ctx.arc(1.4, -1.8 * open, 0.22, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(60,60,60,0.6)';
            ctx.beginPath();
            ctx.arc(1.3, -1.9 * open, 0.28, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(50,40,36,0.9)';
          ctx.fillRect(-0.9, -0.25, 2.2, 0.5);
          ctx.restore();
        },
      });
    }
    return out;
  }
}
