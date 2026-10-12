/**
 * The animated water layer: a pool of small painted stroke sprites (pale lifted streaks, deeper current
 * streaks, tiny ripple pairs, glints) that drift downstream with the current. Positions are an integral of the
 * flow speed, so changes in current only ever change the drift rate (never jump), and sprites wrap far outside
 * the visible area, fading in and out there, so the motion is seamless.
 */
import { Rand, smoothstep } from '../../scene/prng';
import { deform, makeCanvas, tracePoly } from '../../scene/watercolor';
import { farEdge, nearEdge } from './geom';

interface Spr {
  cv: HTMLCanvasElement;
  w: number;
  h: number;
}

interface Inst {
  x0: number;
  f: number;
  spr: Spr;
  kind: number;
  sp: number;
  alpha: number;
  phase: number;
  /** extra slow wandering of the streak in y, world units */
  wander: number;
}

/** world units/second of drift per unit of `current` at mid-river */
export const FLOW_K = 650;
/** a faint idle drift when nothing is flowing (still water is never frozen) */
const IDLE = 0.8;

function streakSprite(rnd: Rand, q: number, len: number, th: number, light: boolean): Spr {
  const w = len + 6;
  const h = th * 2 + 6;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const cy = h / 2;
  const n = 10;
  const top: number[] = [];
  const bot: number[] = [];
  const ph = rnd.range(0, 6);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prof = Math.pow(Math.sin(Math.PI * t), 0.85) * (0.75 + 0.25 * Math.sin(t * 6 + ph));
    const wob = Math.sin(t * 4 + ph) * th * 0.25;
    top.push(3 + t * len, cy - prof * th * 0.5 + wob);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const prof = Math.pow(Math.sin(Math.PI * t), 0.85) * (0.7 + 0.3 * Math.sin(t * 5 + ph + 1));
    const wob = Math.sin(t * 4 + ph) * th * 0.25;
    bot.push(3 + t * len, cy + prof * th * 0.5 + wob);
  }
  const pts: number[] = [...top, ...bot];
  // fill with an alpha envelope along its length: soft ends
  const grad = c.createLinearGradient(3, 0, 3 + len, 0);
  if (light) {
    grad.addColorStop(0, 'rgba(250,252,246,0)');
    grad.addColorStop(0.2, 'rgba(250,252,246,0.62)');
    grad.addColorStop(0.7, 'rgba(244,250,248,0.5)');
    grad.addColorStop(1, 'rgba(244,250,248,0)');
  } else {
    grad.addColorStop(0, 'rgba(24,88,126,0)');
    grad.addColorStop(0.25, 'rgba(24,88,126,0.34)');
    grad.addColorStop(0.75, 'rgba(30,96,130,0.26)');
    grad.addColorStop(1, 'rgba(24,88,126,0)');
  }
  c.fillStyle = grad;
  for (let k = 0; k < 2; k++) {
    tracePoly(c, deform(pts, rnd, 2, 0.05));
    c.fill();
  }
  if (light) {
    // the shadow side of the crest, a hair below
    c.strokeStyle = 'rgba(30,96,130,0.34)';
    c.lineWidth = 0.7;
    c.lineCap = 'round';
    const sg = c.createLinearGradient(3, 0, 3 + len, 0);
    sg.addColorStop(0, 'rgba(30,96,130,0)');
    sg.addColorStop(0.3, 'rgba(30,96,130,0.4)');
    sg.addColorStop(0.8, 'rgba(30,96,130,0.3)');
    sg.addColorStop(1, 'rgba(30,96,130,0)');
    c.strokeStyle = sg;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 3 + t * len * 0.92;
      const y = cy + th * 0.62 + Math.sin(t * 4 + ph) * th * 0.25;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  return { cv, w, h };
}

function ripplePair(rnd: Rand, q: number, w: number): Spr {
  const h = w * 0.42 + 4;
  const cv = makeCanvas((w + 4) * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 2 * q, 0);
  c.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const ww = w * (k ? 0.62 : 1);
    const y = h * 0.42 + k * h * 0.28;
    const g = c.createLinearGradient(0, 0, ww, 0);
    g.addColorStop(0, 'rgba(250,252,246,0)');
    g.addColorStop(0.3, 'rgba(250,252,246,0.78)');
    g.addColorStop(0.7, 'rgba(250,252,246,0.78)');
    g.addColorStop(1, 'rgba(250,252,246,0)');
    c.strokeStyle = g;
    c.lineWidth = 0.95;
    c.beginPath();
    c.ellipse(w / 2, y - h * 0.18, ww / 2, h * 0.22, 0, Math.PI * 0.08, Math.PI * 0.92);
    c.stroke();
    const g2 = c.createLinearGradient(0, 0, ww, 0);
    g2.addColorStop(0, 'rgba(26,90,126,0)');
    g2.addColorStop(0.3, 'rgba(26,90,126,0.4)');
    g2.addColorStop(0.7, 'rgba(26,90,126,0.4)');
    g2.addColorStop(1, 'rgba(26,90,126,0)');
    c.strokeStyle = g2;
    c.lineWidth = 0.75;
    c.beginPath();
    c.ellipse(w / 2, y - h * 0.18 + 1.1, ww / 2, h * 0.22, 0, Math.PI * 0.12, Math.PI * 0.88);
    c.stroke();
  }
  void rnd;
  return { cv, w: w + 4, h };
}

function glintSprite(q: number): Spr {
  const s = 14;
  const cv = makeCanvas(s * q, s * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, (s / 2) * q, (s / 2) * q);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,252,236,0.95)');
  g.addColorStop(0.15, 'rgba(255,250,226,0.5)');
  g.addColorStop(1, 'rgba(255,250,226,0)');
  c.fillStyle = g;
  c.fillRect(-s / 2, -s / 2, s, s);
  c.fillStyle = 'rgba(255,253,244,0.9)';
  for (const [rx, ry] of [
    [6.4, 0.45],
    [0.45, 3.4],
  ] as const) {
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }
  return { cv, w: s, h: s };
}

export class WaterLayer {
  private insts: Inst[] = [];
  private glint: Spr;
  private glints: Array<{ x: number; f: number; ph: number; sc: number }> = [];
  private D = 0;
  private lastT = -1;
  private xmin: number;
  private span: number;

  constructor(q: number, xmin: number, xmax: number) {
    const rnd = new Rand(8128);
    this.xmin = xmin - 110;
    this.span = xmax - xmin + 220;
    const light = [0, 1, 2, 3].map((i) => streakSprite(rnd, q, 54 + i * 24, 3 + i * 0.5, true));
    const dark = [0, 1, 2, 3].map((i) => streakSprite(rnd, q, 80 + i * 30, 3.6 + i * 0.6, false));
    const rip = [0, 1, 2].map((i) => ripplePair(rnd, q, 12 + i * 6));
    this.glint = glintSprite(q);
    const area = this.span * 320;
    const n = Math.round(area / 2300);
    for (let i = 0; i < n; i++) {
      const r = rnd.next();
      const kind = r < 0.3 ? 0 : r < 0.55 ? 1 : 2;
      const pool = kind === 0 ? light : kind === 1 ? dark : rip;
      const f = 0.05 + 0.9 * ((i * 0.61803 + rnd.range(-0.04, 0.04)) % 1);
      this.insts.push({
        x0: rnd.range(0, this.span),
        f,
        spr: rnd.pick(pool),
        kind,
        sp: (0.72 + 0.55 * f) * rnd.range(0.88, 1.12),
        alpha: rnd.range(0.55, 1) * (kind === 1 ? 0.9 : 1),
        phase: rnd.range(0, 6.28),
        wander: rnd.range(0.4, 1.4),
      });
    }
    for (let i = 0; i < 22; i++) this.glints.push({ x: rnd.range(60, 520), f: rnd.range(0.06, 0.52), ph: rnd.range(0, 6.28), sc: rnd.range(0.55, 1.2) });
  }

  /** advance the drift by the elapsed wall-clock time at the given flow speed (world units/s at mid-river) */
  step(timeMs: number, flowSpeed: number, reduced: boolean): void {
    const dt = this.lastT < 0 || timeMs < this.lastT || timeMs - this.lastT > 250 ? 0 : (timeMs - this.lastT) / 1000;
    this.lastT = timeMs;
    if (!reduced) this.D += dt * (flowSpeed + IDLE);
  }

  draw(ctx: CanvasRenderingContext2D, timeMs: number, reduced: boolean, flowing: boolean): void {
    const t = reduced ? 0 : timeMs / 1000;
    const calm = flowing ? 1 : 0.75;
    for (const it of this.insts) {
      const px = (it.x0 + this.D * it.sp) % this.span;
      const x = this.xmin + px;
      // fade near the wrap seam (far outside the visible area)
      const fade = smoothstep(px / 70) * smoothstep((this.span - px) / 70);
      if (fade <= 0.01) continue;
      const y0 = farEdge(x) + (nearEdge(x) - farEdge(x)) * it.f;
      const y = y0 + (reduced ? 0 : Math.sin(t * 0.35 * it.wander + it.phase) * 1.2);
      const shimmer = reduced ? 0.9 : (0.78 + 0.22 * Math.sin(t * 0.95 * calm + it.phase)) * (it.kind === 2 ? 0.8 + 0.2 * Math.sin(t * 1.7 + it.phase * 2) : 1);
      ctx.globalAlpha = Math.min(1, it.alpha * fade * shimmer);
      const sc = 0.85 + 0.35 * it.f;
      const w = it.spr.w * sc;
      const h = it.spr.h * sc * (it.kind === 2 && !reduced ? 1 + 0.1 * Math.sin(t * 1.4 + it.phase) : 1);
      ctx.drawImage(it.spr.cv, x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  /** sun glints, upper left water */
  drawGlints(ctx: CanvasRenderingContext2D, timeMs: number, reduced: boolean): void {
    const t = timeMs / 1000;
    for (const g of this.glints) {
      const x = g.x;
      const y = farEdge(x) + (nearEdge(x) - farEdge(x)) * g.f;
      const tw = reduced ? (g.ph > 3.2 ? 0.55 : 0) : Math.pow(Math.max(0, Math.sin(t * 1.15 + g.ph * 3.1)), 3);
      if (tw < 0.02) continue;
      ctx.globalAlpha = 0.9 * tw;
      const s = 14 * g.sc * (0.7 + 0.5 * tw);
      ctx.drawImage(this.glint.cv, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
