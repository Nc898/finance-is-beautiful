/**
 * Small painted props: reed clumps that sway in the breeze, weathered mileposts with a blank plaque (the app
 * lays DOM text over it), and a rare passing bird.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { birdFrames } from '../../landing/birds';
import { farEdge, nearEdge, postFootY, WORLD } from './geom';
import { flat, grain, inkLine, paintShape, smoothPoly, type Pt } from './ink';

export interface Sprite {
  cv: HTMLCanvasElement;
  /** world size and the foot pivot */
  w: number;
  h: number;
  px: number;
  py: number;
}

/** a tapered blade along a quadratic curve */
function blade(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bend: number, w: number, color: string, a: number, rnd: Rand): void {
  const n = 7;
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2;
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const dx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx);
    const dy = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my);
    const l = Math.hypot(dx, dy) || 1;
    const ww = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.12)), 0.8) * (1 - t * 0.92);
    L.push([x - (dy / l) * ww, y + (dx / l) * ww]);
    R.push([x + (dy / l) * ww, y - (dx / l) * ww]);
  }
  const poly = flat([...L, ...R.reverse()]);
  ctx.fillStyle = rgba(color, a);
  tracePoly(ctx, deform(poly, rnd, 1, 0.03));
  ctx.fill();
}

const GREENS = ['#4F7E3E', '#6E9A48', '#8DB155', '#A7C25C', '#3E6E40'];

export function makeReedClump(seed: number, q: number, tall: number, cattail: boolean): Sprite {
  const rnd = new Rand(seed);
  const w = 34;
  const h = tall + 10;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2;
  const py = h - 2;
  c.setTransform(q, 0, 0, q, 0, 0);
  c.lineCap = 'round';
  // dark water-line pooling at the base
  c.fillStyle = 'rgba(50,74,50,0.25)';
  c.beginPath();
  c.ellipse(px, py + 0.6, 9, 1.6, 0, 0, Math.PI * 2);
  c.fill();
  const stalks = rnd.int(7, 11);
  const order = Array.from({ length: stalks }, (_, i) => i).sort(() => rnd.next() - 0.5);
  for (const i of order) {
    const lean = (i / (stalks - 1) - 0.5) * 2;
    const base = px + lean * 5 + rnd.range(-1.2, 1.2);
    const th = tall * rnd.range(0.62, 1.0);
    const tipx = base + lean * rnd.range(3, 9) + rnd.range(-2, 2);
    const tipy = py - th;
    const col = rnd.pick(GREENS);
    // the stem / long leaf
    blade(c, base, py, tipx, tipy, lean * -2 + rnd.range(-3, 3), rnd.range(0.9, 1.5), col, 0.82, rnd);
    c.strokeStyle = rgba(rnd.pick(['#2E5230', '#4F7E3E']), 0.42);
    c.lineWidth = 0.28;
    c.beginPath();
    c.moveTo(base, py);
    c.quadraticCurveTo((base + tipx) / 2 + lean * -2, (py + tipy) / 2, tipx, tipy);
    c.stroke();
    // a second, shorter flag leaf off the stem
    if (rnd.chance(0.6)) {
      const f = rnd.range(0.25, 0.5);
      const sx = base + (tipx - base) * f;
      const sy = py - th * f;
      blade(c, sx, sy, sx + rnd.range(-12, 12), sy - th * rnd.range(0.35, 0.6), rnd.range(-4, 4), rnd.range(0.7, 1.1), rnd.pick(GREENS), 0.78, rnd);
    }
    if (cattail && rnd.chance(0.35)) {
      // a brown seed head on a bare stalk
      const hx = tipx;
      const hy = tipy + th * 0.1;
      c.strokeStyle = 'rgba(122,98,56,0.9)';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(base, py);
      c.quadraticCurveTo((base + hx) / 2, (py + hy) / 2, hx, hy);
      c.stroke();
      paintShape(c, smoothPoly([[hx - 1, hy + 0.6], [hx - 1.2, hy - 4], [hx - 0.3, hy - 7.4], [hx + 0.5, hy - 4], [hx + 1.1, hy + 0.4]], 3, true), '#7A4E2C', rnd, { shade: '#2A180C', light: '#C99A6A', alpha: 0.95, layers: 2, inkW: 0.35 });
    }
  }
  // lighter highlights on a few blades toward the upper left
  for (let i = 0; i < 3; i++) {
    const bx = px + rnd.range(-6, 3);
    c.strokeStyle = 'rgba(215,232,150,0.5)';
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(bx, py - 2);
    c.quadraticCurveTo(bx - 1 + rnd.range(-2, 2), py - tall * 0.5, bx + rnd.range(-3, 3), py - tall * rnd.range(0.7, 0.95));
    c.stroke();
  }
  return { cv, w, h, px, py };
}

export function makeMilepost(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const w = 96;
  const h = 98;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2 - 6;
  const py = h - 12;
  c.setTransform(q, 0, 0, q, 0, 0);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // cast shadow on the meadow, falling to the lower right
  c.fillStyle = 'rgba(40,70,36,0.3)';
  for (let k = 0; k < 2; k++) {
    tracePoly(c, deform([px - 3, py, px + 5, py - 1, px + 46, py + 6, px + 40, py + 10, px + 2, py + 5], rnd, 2, 0.05));
    c.fill();
  }
  // the pole, weathered and a little crooked
  const lean = rnd.range(-0.02, 0.02);
  const top = py - 56;
  const pole = flat([[px - 4.2, py], [px - 4 + lean * 40, top], [px + 4 + lean * 40, top + 0.4], [px + 4.6, py]]);
  paintShape(c, pole, '#9B7650', rnd, { shade: '#2E1E14', light: '#E6C898', alpha: 0.95, layers: 3, inkW: 0.5, dash: [16, 2, 7, 2] });
  grain(c, rnd, px - 4, top, 8, 56, 6, '#3E2C20', 0.45, 0.35, true);
  // a darker band where the meadow's damp climbs the post
  const dg = c.createLinearGradient(0, py - 12, 0, py);
  dg.addColorStop(0, 'rgba(40,52,30,0)');
  dg.addColorStop(1, 'rgba(40,52,30,0.4)');
  c.fillStyle = dg;
  c.fillRect(px - 5, py - 12, 10, 12);
  // the plaque: a pale painted board in a wooden frame, 56 x 15.5 units, hanging from the top
  const pw = 56;
  const ph = 15.5;
  const bx = px - pw / 2 + lean * 40;
  const by = top - 0.5;
  paintShape(c, flat([[bx, by], [bx + pw, by - 0.4], [bx + pw + 0.4, by + ph], [bx + 0.3, by + ph + 0.5]]), '#C79E6E', rnd, { shade: '#3E2A1A', light: '#F5DCAA', alpha: 0.98, layers: 3, inkW: 0.55, dash: [20, 2.5, 8, 2] });
  const m = 1.9;
  paintShape(c, flat([[bx + m, by + m], [bx + pw - m, by + m - 0.3], [bx + pw - m, by + ph - m], [bx + m, by + ph - m + 0.3]]), '#EBDFC2', rnd, { shade: '#8A7658', light: '#FFF8E6', alpha: 0.98, layers: 2, inkW: 0.3, inkAlpha: 0.35, dash: [10, 2] });
  // a few faded brush marks on the plaque (no text)
  c.strokeStyle = 'rgba(150,120,80,0.16)';
  c.lineWidth = 0.4;
  for (let k = 0; k < 4; k++) {
    c.beginPath();
    c.moveTo(bx + 5, by + 4 + k * 3);
    c.lineTo(bx + pw - 6 - rnd.range(0, 14), by + 4.2 + k * 3);
    c.stroke();
  }
  // nails
  c.fillStyle = 'rgba(52,40,34,0.8)';
  for (const [nx, ny] of [[bx + 2.4, by + 2.6], [bx + pw - 2.4, by + 2.6], [bx + 2.4, by + ph - 2.6], [bx + pw - 2.4, by + ph - 2.2]] as const) {
    c.beginPath();
    c.arc(nx, ny, 0.45, 0, Math.PI * 2);
    c.fill();
  }
  // cap on the pole above the plaque
  paintShape(c, flat([[px - 5 + lean * 40, top - 0.2], [px + 5 + lean * 40, top - 0.1], [px + 3.6 + lean * 40, top - 2.6], [px - 3.6 + lean * 40, top - 2.8]]), '#7A5A3E', rnd, { shade: '#2E1E14', light: '#D2AE80', alpha: 0.95, layers: 2, inkW: 0.45 });
  // grass and a few stones at the foot
  for (let i = 0; i < 6; i++) {
    const sx = px + rnd.range(-8, 9);
    const sy = py + rnd.range(-0.5, 2.5);
    const r = rnd.range(0.9, 2);
    c.fillStyle = rgba(rnd.pick(['#B7AA94', '#A89A86']), 0.85);
    tracePoly(c, deform([sx - r, sy, sx, sy - r * 0.8, sx + r, sy, sx + r * 0.3, sy + r * 0.5], rnd, 1, 0.15));
    c.fill();
  }
  for (let i = 0; i < 34; i++) {
    const gx = px + rnd.range(-11, 12);
    const len = rnd.range(4, 11);
    const ln = rnd.range(-0.5, 0.5);
    c.strokeStyle = rgba(rnd.pick(['#4F7E3E', '#6E9A48', '#8DB155']), rnd.range(0.7, 0.95));
    c.lineWidth = rnd.range(0.4, 0.8);
    c.beginPath();
    c.moveTo(gx, py + 1.6);
    c.quadraticCurveTo(gx + ln * len * 0.3, py - len * 0.6, gx + ln * len, py - len);
    c.stroke();
  }
  void inkLine;
  return { cv, w, h, px, py };
}

/** deterministic reed positions along the banks; the near bank avoids the dock approach */
export function reedSpecs(xmin: number, xmax: number): { near: Array<{ x: number; y: number; k: number; v: number; ph: number }>; far: Array<{ x: number; y: number; k: number; v: number; ph: number }> } {
  const rnd = new Rand(4242);
  const near: Array<{ x: number; y: number; k: number; v: number; ph: number }> = [];
  const far: Array<{ x: number; y: number; k: number; v: number; ph: number }> = [];
  for (let x = xmin; x < xmax; x += rnd.range(60, 150)) {
    if (x > 400 && x < 660) continue;
    near.push({ x, y: nearEdge(x) - rnd.range(0, 6), k: rnd.range(0.8, 1.15), v: rnd.int(0, 3), ph: rnd.range(0, 6.28) });
    if (rnd.chance(0.55)) near.push({ x: x + rnd.range(10, 24), y: nearEdge(x) - rnd.range(-2, 5), k: rnd.range(0.6, 0.9), v: rnd.int(0, 3), ph: rnd.range(0, 6.28) });
  }
  for (let x = xmin + 30; x < xmax; x += rnd.range(80, 190)) far.push({ x, y: farEdge(x) + 1.5, k: rnd.range(0.38, 0.55), v: rnd.int(0, 3), ph: rnd.range(0, 6.28) });
  return { near, far };
}

/** a rare bird crossing the sky: pure function of the clock */
export class Bird {
  private frames = birdFrames(0);
  private frames2 = birdFrames(2);
  /**
   * Returns true if drawn. `t` seconds; the bird crosses left to right every `period` seconds, taking `dur`.
   */
  draw(ctx: CanvasRenderingContext2D, t: number, cssW: number, y0: number, s: number): boolean {
    const period = 41;
    const dur = 11;
    const ph = (t + 17) % period;
    if (ph > dur) return false;
    const k = ph / dur;
    const x = -60 + (cssW + 120) * k;
    const y = y0 + Math.sin(k * 5.2) * 14 * s + (1 - k) * 8 * s;
    const frames = Math.floor(t / period + 0.01) % 2 === 0 ? this.frames : this.frames2;
    const idx = Math.floor((t * 7) % (frames.length * 2));
    const f = frames[idx < frames.length ? idx : frames.length * 2 - 1 - idx]!;
    const w = 46 * s;
    const h = w * (f.height / f.width);
    ctx.globalAlpha = 0.85 * Math.min(1, k * 9) * Math.min(1, (1 - k) * 9);
    ctx.drawImage(f, x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    return true;
  }
}

void WORLD;
void postFootY;
