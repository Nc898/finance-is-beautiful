/**
 * Small painted props, each a cached sprite with its soft contact shadow baked in: pumpkins and a squash, a
 * wheelbarrow of leaves, a hay bale, the garden bench, the low garden wall by each pile and the leaning rake,
 * plus tufts of grass that sway in the breeze. Painted once; the scene depth-sorts and blits them.
 */
import { Rand } from '../../scene/prng';
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { grassTuft } from '../../river/scene/paint';
import { BENCH, PILE } from './geom';
import { RAKE_LEAN, WALL_STUB } from './layout';
import { INK, grain, newSprite, type Sprite } from './art';
import type { PlanId } from '../types';

/** a soft contact shadow: a flat dark-violet ellipse offset to the lower right (the sun is upper left) */
function contact(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.3): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(54,46,52,${a})`);
  g.addColorStop(0.6, `rgba(54,46,52,${a * 0.62})`);
  g.addColorStop(1, 'rgba(54,46,52,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, rx: number, a = 0.55, w = 0.45): void {
  ctx.strokeStyle = rgba(INK, a);
  ctx.lineWidth = w;
  ctx.setLineDash([rx * 1.2, rx * 0.25, rx * 0.5, rx * 0.25]);
}

/* ------------------------------------------------------------------ pumpkins */

function pumpkin(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, r: number, col: string, kind: 'round' | 'squash' | 'flat'): void {
  const ry = kind === 'flat' ? r * 0.7 : kind === 'squash' ? r * 1.15 : r * 0.82;
  const rx = kind === 'squash' ? r * 0.62 : r;
  const lobes = kind === 'squash' ? 3 : 5;
  // the lobes, back to front
  const order = [] as number[];
  for (let i = 0; i < lobes; i++) order.push(i);
  order.sort((a, b) => Math.abs(b - (lobes - 1) / 2) - Math.abs(a - (lobes - 1) / 2));
  for (const i of order) {
    const f = (i / (lobes - 1)) * 2 - 1;
    const lx = x + f * rx * 0.58;
    const lrx = rx * (0.52 - Math.abs(f) * 0.12);
    const pts: number[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      pts.push(lx + Math.cos(a) * lrx, y + Math.sin(a) * ry);
    }
    const poly = deform(pts, rnd, 2, 0.02);
    ctx.fillStyle = rgba(col, 0.86);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(col, 0.3);
    tracePoly(ctx, deform(pts, rnd, 2, 0.03));
    ctx.fill();
    // lit upper left, shaded lower right of each lobe
    ctx.fillStyle = 'rgba(255,232,170,0.34)';
    ctx.beginPath();
    ctx.ellipse(lx - lrx * 0.3, y - ry * 0.32, lrx * 0.42, ry * 0.36, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,40,16,0.28)';
    ctx.beginPath();
    ctx.ellipse(lx + lrx * 0.4, y + ry * 0.3, lrx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#8A3A18', 0.55);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(lx + lrx * 0.0, y, lrx, ry, 0, -0.9, 0.9);
    ctx.stroke();
  }
  // outline
  dashed(ctx, r, 0.55, 0.5);
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.02, ry * 1.01, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // the stalk and a tendril
  ctx.fillStyle = rgba('#6A5A30', 0.95);
  tracePoly(ctx, [x - r * 0.14, y - ry * 0.92, x + r * 0.16, y - ry * 0.92, x + r * 0.2, y - ry - r * 0.26, x - r * 0.05, y - ry - r * 0.32]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  if (rnd.chance(0.7)) {
    ctx.strokeStyle = rgba('#6E8A3A', 0.8);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.1, y - ry - r * 0.2);
    ctx.bezierCurveTo(x + r * 0.7, y - ry - r * 0.5, x + r * 0.9, y - ry * 0.7, x + r * 0.7, y - ry * 0.55);
    ctx.stroke();
  }
}

export function makePumpkins(seed: number, q: number, spec: Array<{ dx: number; dy: number; r: number; col: string; kind?: 'round' | 'squash' | 'flat' }>): Sprite {
  const rnd = new Rand(seed);
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const p of spec) {
    x0 = Math.min(x0, p.dx - p.r * 1.6);
    x1 = Math.max(x1, p.dx + p.r * 1.8);
    y0 = Math.min(y0, p.dy - p.r * 2);
    y1 = Math.max(y1, p.dy + p.r * 0.9);
  }
  const { sp, ctx } = newSprite(x1 - x0 + 8, y1 - y0 + 6, -x0 + 4, -y0 + 3, q);
  const ord = spec.slice().sort((a, b) => a.dy - b.dy);
  for (const p of ord) contact(ctx, p.dx + p.r * 0.35, p.dy + p.r * 0.12, p.r * 1.4, p.r * 0.34, 0.34);
  for (const p of ord) pumpkin(ctx, rnd, p.dx, p.dy - p.r * 0.8, p.r, p.col, p.kind ?? 'round');
  // a few fallen leaves tucked in around them
  const cols = ['#C8683A', '#D9A03C', '#B8483A', '#E4B64E'];
  for (let i = 0; i < 5; i++) {
    const p = ord[rnd.int(0, ord.length - 1)]!;
    ctx.fillStyle = rgba(rnd.pick(cols), 0.9);
    almond(ctx, p.dx + rnd.range(-1.4, 1.6) * p.r, p.dy + rnd.range(-0.1, 0.5) * p.r, rnd.range(0, 3), 3.6, 1.6);
    ctx.fill();
  }
  grain(sp.cv, seed, 0.7, Math.max(1, Math.round(q * 0.6)));
  return sp;
}

/* ------------------------------------------------------------------ wheelbarrow */

export function makeWheelbarrow(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = newSprite(66, 46, 33, 40, q);
  contact(ctx, 4, 1, 28, 5, 0.32);
  // legs and handles (wood)
  const wood = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    ctx.strokeStyle = rgba('#8A6A44', 0.98);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,206,160,0.5)';
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0 - w * 0.2, y0 - w * 0.2);
    ctx.lineTo(x1 - w * 0.2, y1 - w * 0.2);
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.5, y0 + w * 0.5);
    ctx.lineTo(x1 + w * 0.5, y1 + w * 0.5);
    ctx.stroke();
  };
  wood(8, -8, 18, 0, 2.6); // back leg
  wood(-4, -12, -25, 0, 2.4); // front leg (toward the wheel side)
  // the wheel (at the front, left)
  ctx.fillStyle = rgba('#3A3636', 0.92);
  ctx.beginPath();
  ctx.ellipse(-26, -6, 6.4, 6.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#8E8478', 0.95);
  ctx.beginPath();
  ctx.ellipse(-26, -6, 3.8, 3.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,248,226,0.4)';
  ctx.beginPath();
  ctx.ellipse(-27, -7.4, 1.8, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.ellipse(-26, -6, 6.4, 6.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  // the tub: a deep, faded-green painted tub
  const tub = [-20, -22, 20, -23, 17, -9, -14, -8];
  ctx.fillStyle = rgba('#5F8466', 0.96);
  tracePoly(ctx, deform(tub, rnd, 2, 0.02));
  ctx.fill();
  const tg = ctx.createLinearGradient(-20, -24, 20, -8);
  tg.addColorStop(0, 'rgba(255,248,214,0.32)');
  tg.addColorStop(0.5, 'rgba(255,248,214,0)');
  tg.addColorStop(1, 'rgba(24,40,40,0.34)');
  ctx.fillStyle = tg;
  tracePoly(ctx, tub);
  ctx.fill();
  ctx.strokeStyle = rgba('#2E4A3A', 0.5);
  ctx.lineWidth = 0.5;
  for (const f of [0.3, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(-20 + 40 * f, -22.5 + 0.5 * f);
    ctx.lineTo(-14 + 31 * f, -8);
    ctx.stroke();
  }
  dashed(ctx, 6, 0.6, 0.5);
  tracePoly(ctx, tub);
  ctx.stroke();
  ctx.setLineDash([]);
  // a heap of leaves in it
  const cols = ['#C8683A', '#D9A03C', '#B8483A', '#E4B64E', '#A8522E', '#CC8A32'];
  for (let i = 0; i < 70; i++) {
    const a = rnd.range(0, 1);
    const x = -18 + a * 36;
    const hump = Math.sin(a * Math.PI) * 9;
    const y = -22 - rnd.next() * hump;
    ctx.fillStyle = rgba(rnd.pick(cols), rnd.range(0.7, 0.96));
    almond(ctx, x, y, rnd.range(0, 3.1), rnd.range(4, 7), rnd.range(1.6, 2.6));
    ctx.fill();
  }
  // handles: wood bars reaching back to the right
  wood(14, -17, 36, -9, 2.4);
  wood(12, -12, 34, -4, 2.4);
  // the nearer rail of the tub in front of the leaves
  ctx.strokeStyle = rgba('#4C7658', 0.98);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-20, -22);
  ctx.lineTo(20, -23);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,246,210,0.4)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-20, -22.8);
  ctx.lineTo(20, -23.8);
  ctx.stroke();
  grain(sp.cv, seed, 0.7, Math.max(1, Math.round(q * 0.6)));
  return sp;
}

/* ------------------------------------------------------------------ hay bale */

export function makeHayBale(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = newSprite(56, 40, 28, 32, q);
  contact(ctx, 4, 0.5, 26, 4.6, 0.34);
  const fx0 = -22;
  const fx1 = 18;
  const fy0 = -20;
  const fy1 = 0;
  // the front face
  ctx.fillStyle = rgba('#D9B456', 0.98);
  tracePoly(ctx, deform([fx0, fy0, fx1, fy0, fx1, fy1, fx0, fy1], rnd, 2, 0.01));
  ctx.fill();
  // the top face (a parallelogram going back and to the right)
  const top = [fx0, fy0, fx0 + 6, fy0 - 7, fx1 + 6, fy0 - 7, fx1, fy0];
  ctx.fillStyle = rgba('#E8CB74', 0.98);
  tracePoly(ctx, top);
  ctx.fill();
  // the right end (shaded)
  const side = [fx1, fy0, fx1 + 6, fy0 - 7, fx1 + 6, fy1 - 6, fx1, fy1];
  ctx.fillStyle = rgba('#B8913E', 0.98);
  tracePoly(ctx, side);
  ctx.fill();
  // straw: many fine strokes across each face
  const straw = (x0: number, y0: number, w: number, h: number, dx: number, dy: number, n: number, cols: string[]) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd.next() * w;
      const y = y0 + rnd.next() * h;
      const l = rnd.range(4, 12);
      ctx.strokeStyle = rgba(rnd.pick(cols), rnd.range(0.4, 0.85));
      ctx.lineWidth = rnd.range(0.3, 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * l + rnd.range(-0.6, 0.6), y + dy * l + rnd.range(-0.5, 0.5));
      ctx.stroke();
    }
  };
  straw(fx0, fy0, fx1 - fx0, fy1 - fy0, 1, 0.05, 220, ['#F0DA86', '#C8A248', '#A9822F', '#F4E4A0', '#D6B05A']);
  straw(fx0 + 1, fy0 - 6, fx1 - fx0, 6, 1, -0.05, 60, ['#F0DA86', '#D6B05A', '#F4E4A0']);
  ctx.save();
  tracePoly(ctx, side);
  ctx.clip();
  straw(fx1, fy1 - 8, 6, 8, 0.3, -1, 40, ['#8A6A28', '#B8913E', '#CDAA52']);
  ctx.restore();
  // lit left, shaded bottom
  const g = ctx.createLinearGradient(fx0, fy0, fx1, fy1);
  g.addColorStop(0, 'rgba(255,246,196,0.3)');
  g.addColorStop(0.6, 'rgba(255,246,196,0)');
  g.addColorStop(1, 'rgba(110,70,24,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  // twine
  ctx.strokeStyle = rgba('#6A4A28', 0.78);
  ctx.lineWidth = 0.7;
  for (const f of [0.28, 0.72]) {
    const x = fx0 + (fx1 - fx0) * f;
    ctx.beginPath();
    ctx.moveTo(x, fy0);
    ctx.lineTo(x, fy1);
    ctx.lineTo(x + 6, fy1 - 6);
    ctx.moveTo(x, fy0);
    ctx.lineTo(x + 6, fy0 - 7);
    ctx.stroke();
  }
  dashed(ctx, 6, 0.55, 0.5);
  for (const poly of [[fx0, fy0, fx1, fy0, fx1, fy1, fx0, fy1], top, side]) {
    tracePoly(ctx, poly);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // loose wisps at the foot
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = rgba(rnd.pick(['#E0C468', '#C8A248', '#F0DA86']), 0.85);
    ctx.lineWidth = 0.5;
    const x = rnd.range(fx0 - 5, fx1 + 8);
    ctx.beginPath();
    ctx.moveTo(x, rnd.range(-1, 1.5));
    ctx.lineTo(x + rnd.range(-4, 4), rnd.range(-2, 1.5));
    ctx.stroke();
  }
  grain(sp.cv, seed, 0.7, Math.max(1, Math.round(q * 0.6)));
  return sp;
}

/* ------------------------------------------------------------------ the bench */

/**
 * A wooden garden bench seen from the front; the pivot is the middle of the seat's front edge at ground level.
 * The seat stands `seat` units up: the gardener's sitting height (gardener.ts SEAT_TOP), so they sit ON it.
 */
export function makeBench(seed: number, q: number, seat = 31): Sprite {
  const rnd = new Rand(seed);
  const hw = 36;
  const { sp, ctx } = newSprite(hw * 2 + 22, seat + 38, hw + 8, seat + 32, q);
  contact(ctx, 5, 1.2, hw + 6, 5.4, 0.3);
  const wood = ['#C99A66', '#BE8E5C', '#D2A672', '#B8885A'];
  const plank = (x0: number, y0: number, w: number, h: number, light = 0.34) => {
    ctx.fillStyle = rgba(rnd.pick(wood), 0.98);
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = `rgba(255,240,206,${light})`;
    ctx.fillRect(x0, y0, w, Math.min(1.4, h * 0.4));
    ctx.fillStyle = 'rgba(70,44,28,0.26)';
    ctx.fillRect(x0, y0 + h - Math.min(1.2, h * 0.35), w, Math.min(1.2, h * 0.35));
    ctx.strokeStyle = 'rgba(80,52,34,0.3)';
    ctx.lineWidth = 0.3;
    for (let k = 0; k < 3; k++) {
      const gy = y0 + h * rnd.range(0.25, 0.75);
      ctx.beginPath();
      ctx.moveTo(x0 + w * rnd.range(0, 0.3), gy);
      ctx.lineTo(x0 + w * rnd.range(0.6, 1), gy + rnd.range(-0.3, 0.3));
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.45;
    ctx.strokeRect(x0, y0, w, h);
  };
  // back legs (taller, behind) rising into the backrest posts
  for (const sx of [-hw + 3, hw - 3]) plank(sx - 1.7, -seat - 27, 3.4, seat + 23);
  // backrest slats
  plank(-hw + 1, -seat - 25, hw * 2 - 2, 6);
  plank(-hw + 1, -seat - 16.6, hw * 2 - 2, 6);
  // the seat: a thin top face seen from the front, then the front apron
  ctx.fillStyle = rgba('#D8B07C', 0.98);
  tracePoly(ctx, [-hw, -seat - 2.6, hw, -seat - 2.6, hw + 2, -seat, -hw, -seat]);
  ctx.fill();
  plank(-hw, -seat, hw * 2, 3.8);
  // front legs and a stretcher between them
  for (const sx of [-hw + 4, hw - 4]) plank(sx - 1.9, -seat + 3.8, 3.8, seat - 3.6);
  plank(-hw + 5, -9, hw * 2 - 10, 2);
  grain(sp.cv, seed, 0.7, Math.max(1, Math.round(q * 0.6)));
  return sp;
}

/* ------------------------------------------------------------------ the garden wall and the leaning rake */

/** a low drystone wall segment with a mossy coping, seen from the front; pivot = ground at the left end */
export function makeGardenWall(id: PlanId, q: number): Sprite {
  const w = WALL_STUB[id];
  const rnd = new Rand(id === 'minimum' ? 5501 : 5603);
  const len = w.x1 - w.x0;
  const { sp, ctx } = newSprite(len + 24, w.h + 26, 6, w.h + 8, q);
  contact(ctx, len * 0.5 + 8, 3, len * 0.55, 5, 0.28);
  const x0 = 0;
  const base = 0;
  // courses of stone
  ctx.fillStyle = '#9C9078';
  ctx.fillRect(x0, base - w.h, len, w.h);
  const cols = ['#C2B496', '#B3A486', '#CDBFA0', '#A99A80', '#BDAE90'];
  let y = base;
  let course = 0;
  while (y > base - w.h + 4) {
    const h = rnd.range(7.4, 10.4);
    const ya = Math.max(base - w.h + 2, y - h);
    let x = x0 - rnd.range(0, 8);
    while (x < x0 + len) {
      const ww = rnd.range(12, 26);
      const a = Math.max(x, x0);
      const b = Math.min(x + ww, x0 + len);
      if (b - a > 3) {
        const poly = [a + 0.4, ya + 0.6, b - 0.5, ya + 0.4, b - 0.4, y - 0.4, a + 0.5, y - 0.5];
        ctx.fillStyle = rgba(rnd.pick(cols), 0.9);
        tracePoly(ctx, deform(poly, rnd, 1, 0.03));
        ctx.fill();
        ctx.fillStyle = 'rgba(255,246,218,0.3)';
        ctx.fillRect(a + 0.8, ya + 0.8, (b - a) * 0.5, (y - ya) * 0.32);
        ctx.fillStyle = 'rgba(84,62,52,0.22)';
        ctx.fillRect(a + (b - a) * 0.55, ya + (y - ya) * 0.55, (b - a) * 0.42, (y - ya) * 0.42);
        ctx.strokeStyle = rgba(INK, 0.5);
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        ctx.moveTo(b - 0.5, ya + 1);
        ctx.lineTo(b - 0.4, y - 0.4);
        ctx.lineTo(a + 1, y - 0.5);
        ctx.stroke();
      }
      x += ww;
    }
    y -= h;
    course++;
  }
  void course;
  // the coping: a rounded cap of flat stones, mossy
  ctx.fillStyle = rgba('#CFC2A4', 0.98);
  tracePoly(ctx, deform([x0 - 2, base - w.h - 1, x0 + len + 2, base - w.h - 1, x0 + len + 2, base - w.h + 3.8, x0 - 2, base - w.h + 3.8], rnd, 1, 0.01));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,218,0.4)';
  ctx.fillRect(x0 - 2, base - w.h - 1, len + 4, 1.8);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#8FA050', '#B9A044', '#7C9040']), 0.34);
    ctx.beginPath();
    ctx.ellipse(rnd.range(x0, x0 + len), base - w.h + rnd.range(-0.5, 2), rnd.range(3, 8), rnd.range(0.8, 1.8), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.55;
  for (let x = x0 + rnd.range(6, 14); x < x0 + len; x += rnd.range(14, 26)) {
    ctx.beginPath();
    ctx.moveTo(x, base - w.h - 1);
    ctx.lineTo(x + rnd.range(-0.5, 0.5), base - w.h + 3.8);
    ctx.stroke();
  }
  ctx.setLineDash([16, 3, 7, 2]);
  ctx.strokeRect(x0 - 2, base - w.h - 1, len + 4, 4.8);
  ctx.setLineDash([]);
  // soft shade down the wall to the right, and weeds at its foot
  const g = ctx.createLinearGradient(x0, 0, x0 + len, 0);
  g.addColorStop(0, 'rgba(255,240,200,0.1)');
  g.addColorStop(1, 'rgba(70,56,70,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, base - w.h + 4, len, w.h - 4);
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62'];
  for (let x = x0 - 6; x < x0 + len + 6; x += rnd.range(4, 8)) grassTuft(ctx, x, base + rnd.range(0, 2.5), rnd.range(3, 7), rnd, 1, pal);
  // a few leaves caught along its foot
  const lc = ['#C8683A', '#D9A03C', '#B8483A', '#E4B64E'];
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = rgba(rnd.pick(lc), 0.9);
    almond(ctx, rnd.range(x0 - 4, x0 + len + 6), base + rnd.range(0.5, 5), rnd.range(0, 3.1), rnd.range(3, 5), 1.5);
    ctx.fill();
  }
  grain(sp.cv, id === 'minimum' ? 9 : 11, 0.7, Math.max(1, Math.round(q * 0.6)));
  return sp;
}

/** the leaf rake standing upright, pivot at the head's centre on the ground; the handle runs straight up (len units) */
export function makeRake(q: number, len = 64): Sprite {
  const rnd = new Rand(777);
  const { sp, ctx } = newSprite(40, len + 18, 20, len + 8, q);
  // handle
  const g = ctx.createLinearGradient(-1.4, 0, 1.4, 0);
  g.addColorStop(0, '#D6B284');
  g.addColorStop(0.5, '#B58A58');
  g.addColorStop(1, '#8A6440');
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0.3, -len);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(1.2, -4);
  ctx.lineTo(1.4, -len);
  ctx.stroke();
  // a fan head: bow + tines pointing down
  ctx.strokeStyle = rgba('#6A6A66', 0.95);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(0, -5);
  ctx.lineTo(13, 0);
  ctx.stroke();
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 11; i++) {
    const f = i / 10;
    const x = -13 + f * 26;
    ctx.beginPath();
    ctx.moveTo(x, -2.6 + Math.abs(f - 0.5) * 5);
    ctx.lineTo(x + (f - 0.5) * 2, 4.6 + rnd.range(-0.3, 0.4));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(240,240,236,0.4)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(-13, -0.6);
  ctx.lineTo(0, -5.6);
  ctx.lineTo(13, -0.6);
  ctx.stroke();
  return sp;
}

/* ------------------------------------------------------------------ swaying grass */

export function makeTuft(seed: number, q: number, h: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = newSprite(h * 1.4 + 6, h + 4, (h * 1.4 + 6) / 2, h + 2, q);
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444'];
  grassTuft(ctx, -h * 0.25, 0, h, rnd, 1.1, pal);
  grassTuft(ctx, h * 0.18, 0.4, h * 0.85, rnd, 1.1, pal);
  grassTuft(ctx, 0, 0.8, h * 0.7, rnd, 1.1, pal);
  return sp;
}

/** the spots where a pot, a pile and the bench live, for the depth sorting */
export const BENCH_SORT_Y = (id: PlanId): number => BENCH[id].y - 6;
export const PILE_SORT_Y = (id: PlanId): number => PILE[id].y - 6;
void RAKE_LEAN;
