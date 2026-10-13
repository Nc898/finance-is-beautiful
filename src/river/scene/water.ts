/**
 * The animated water layer (watercolor variant): a pool of small painted brush-mark sprites that drift
 * downstream with the current — lifted-out pale strokes, deeper translucent current streaks, broken ripple
 * marks, a few broad wash drifts and soft glints. Each sprite is painted once into its own canvas as a tapered,
 * soft-edged, dry-brushed stroke (never a hard white line). Positions are an integral of the flow speed, so
 * changes in current only ever change the drift rate (never jump), and sprites wrap far outside the visible
 * area, fading in and out there, so the motion is seamless. Per frame: ~230 drawImage calls, nothing else.
 */
import { Rand, smoothstep } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { farEdge, nearEdge } from './geom';
import { archLine, brushProfile, strokePoly } from './paint';

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

/** feather the ends of a sprite's strokes (destination-in horizontal alpha envelope) */
function feather(c: CanvasRenderingContext2D, x0: number, len: number, h: number, a0 = 0.16, a1 = 0.84): void {
  c.save();
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(x0, 0, x0 + len, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(a0, 'rgba(0,0,0,1)');
  g.addColorStop(a1, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x0 - 2, 0, len + 4, h + 4);
  c.restore();
}

/** dry-brush: bristle gaps (thin streaks along the stroke) and speckle holes eaten out of the paint */
function dryBrush(c: CanvasRenderingContext2D, rnd: Rand, x0: number, len: number, cy: number, th: number, amount: number): void {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.lineCap = 'round';
  const n = Math.round(4 + th * 1.2);
  for (let i = 0; i < n; i++) {
    const y = cy + rnd.range(-0.5, 0.5) * th;
    const a = rnd.range(0.15, 0.7);
    const l = rnd.range(0.12, 0.4);
    c.strokeStyle = `rgba(0,0,0,${rnd.range(0.35, 0.9) * amount})`;
    c.lineWidth = rnd.range(0.2, 0.55);
    c.beginPath();
    c.moveTo(x0 + a * len, y);
    c.lineTo(x0 + Math.min(1, a + l) * len, y + rnd.range(-0.25, 0.25));
    c.stroke();
  }
  c.fillStyle = `rgba(0,0,0,${0.7 * amount})`;
  const m = Math.round(len * th * 0.05);
  for (let i = 0; i < m; i++) c.fillRect(x0 + rnd.next() * len, cy + (rnd.next() - 0.5) * th, rnd.range(0.3, 0.9), rnd.range(0.3, 0.7));
  c.restore();
}

/** one soft, tapered, translucent brush stroke: stacked halos (soft edge) around a firmer core */
function stroke(
  c: CanvasRenderingContext2D,
  rnd: Rand,
  x0: number,
  cy: number,
  len: number,
  th: number,
  color: string,
  a: number,
  o: { bow?: number; head?: number } = {},
): void {
  const line = archLine(x0, cy, len, o.bow ?? rnd.range(-0.4, 0.6), th * 0.12, rnd.range(0, 6), 12);
  const prof = brushProfile(th, o.head ?? 0.22);
  const halos: Array<[number, number]> = [
    [2.2, 0.3],
    [1.6, 0.5],
    [1.0, 1],
  ];
  c.fillStyle = rgba(color, a * 0.45);
  for (const [k, ak] of halos) {
    c.globalAlpha = ak;
    const p = strokePoly(line, (t) => prof(t) * k);
    tracePoly(c, deform(p, rnd, 2, 0.04));
    c.fill();
  }
  c.globalAlpha = 1;
}

function lightStreak(rnd: Rand, q: number, len: number, th: number): Spr {
  const w = len + 8;
  const h = th * 4 + 8;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const cy = h / 2 - th * 0.35;
  // the lifted pale stroke, with a faint cool shadow just below it (the lee of the little crest)
  stroke(c, rnd, 4, cy + th * 0.9, len * 0.9, th * 0.6, '#2A7392', 0.34, { head: 0.3 });
  stroke(c, rnd, 4, cy, len, th, rnd.chance(0.5) ? '#FFFCEF' : '#F4F9F4', 0.7, { head: 0.2 });
  dryBrush(c, rnd, 4, len, cy, th, 0.8);
  feather(c, 4, len, h);
  return { cv, w, h };
}

function darkStreak(rnd: Rand, q: number, len: number, th: number): Spr {
  const w = len + 8;
  const h = th * 2.6 + 8;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const cy = h / 2;
  stroke(c, rnd, 4, cy, len, th, rnd.chance(0.5) ? '#1F6A8A' : '#245F86', 0.5, { head: 0.12, bow: rnd.range(-0.8, 0.8) });
  // a darker thread of pooled pigment along the lower edge, and the dry-brush tail
  c.strokeStyle = rgba('#164E6E', 0.22);
  c.lineWidth = 0.6;
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = 4 + t * len * 0.8;
    const y = cy + th * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.2)), 0.7) + 0.3 * Math.sin(t * 9);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  dryBrush(c, rnd, 4 + len * 0.35, len * 0.65, cy, th, 1);
  feather(c, 4, len, h, 0.1, 0.8);
  return { cv, w, h };
}

/** small broken ripple marks: a couple of short arcs, pale on top with a cool shadow side */
function rippleMarks(rnd: Rand, q: number, w: number): Spr {
  const h = w * 0.5 + 6;
  const cv = makeCanvas((w + 6) * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 3 * q, 0);
  c.lineCap = 'round';
  const arcs = rnd.int(2, 3);
  for (let k = 0; k < arcs; k++) {
    const ww = w * (1 - k * 0.3) * rnd.range(0.8, 1);
    const x0 = (w - ww) / 2 + rnd.range(-1.5, 1.5);
    const y = h * 0.3 + k * h * 0.22;
    const th = rnd.range(0.7, 1.3);
    // arc as a centre line that dips in the middle
    const line: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      line.push([x0 + t * ww, y + Math.sin(Math.PI * t) * ww * 0.07]);
    }
    // the shadow side first, a hair below
    const sp = strokePoly(
      line.map(([x, yy]): [number, number] => [x + 0.6, yy + 1.1]),
      (t) => th * 1.2 * Math.pow(Math.sin(Math.PI * t), 0.7),
    );
    c.fillStyle = rgba('#1F6486', 0.4);
    tracePoly(c, deform(sp, rnd, 1, 0.05));
    c.fill();
    const lp = strokePoly(line, (t) => th * 1.1 * Math.pow(Math.sin(Math.PI * t), 0.6));
    c.fillStyle = rgba('#FFFCEF', 0.78);
    tracePoly(c, deform(lp, rnd, 1, 0.05));
    c.fill();
    // a gap or two where the stroke skipped
    dryBrush(c, rnd, x0, ww, y + ww * 0.035, th * 1.4, 0.5);
  }
  return { cv, w: w + 6, h };
}

/** a broad, very soft wash drifting by: the current's slow undertone */
function washDrift(rnd: Rand, q: number, len: number, th: number, dark: boolean): Spr {
  const w = len + 20;
  const h = th * 2 + 14;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const cy = h / 2;
  const col = dark ? '#245F86' : '#EAF5F2';
  const line = archLine(10, cy, len, rnd.range(-1, 1), th * 0.15, rnd.range(0, 6), 14);
  c.fillStyle = rgba(col, dark ? 0.1 : 0.2);
  for (let i = 0; i < 4; i++) {
    const p = strokePoly(line, (t) => th * (1 - i * 0.18) * Math.pow(Math.sin(Math.PI * t), 0.55) * (0.8 + 0.2 * Math.sin(t * 6 + i)));
    tracePoly(c, deform(p, rnd, 3, 0.05));
    c.fill();
  }
  dryBrush(c, rnd, 10, len, cy, th, 0.55);
  feather(c, 10, len, h, 0.25, 0.75);
  return { cv, w, h };
}

/** a soft painted sparkle: a warm lifted dab with a faint glow and two tiny tapered rays */
function glintSprite(q: number): Spr {
  const s = 14;
  const cv = makeCanvas(s * q, s * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, (s / 2) * q, (s / 2) * q);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,250,228,0.85)');
  g.addColorStop(0.2, 'rgba(255,248,222,0.4)');
  g.addColorStop(1, 'rgba(255,248,222,0)');
  c.fillStyle = g;
  c.fillRect(-s / 2, -s / 2, s, s);
  c.fillStyle = 'rgba(255,253,244,0.8)';
  for (const [rx, ry] of [
    [5.4, 0.4],
    [0.4, 2.8],
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
    const light = [0, 1, 2, 3, 4].map((i) => lightStreak(rnd, q, 46 + i * 26, 2.8 + i * 0.75));
    const dark = [0, 1, 2, 3, 4].map((i) => darkStreak(rnd, q, 84 + i * 34, 4.6 + i * 1.1));
    const rip = [0, 1, 2, 3].map((i) => rippleMarks(rnd, q, 11 + i * 6));
    const drift = [0, 1, 2].map((i) => washDrift(rnd, q, 150 + i * 60, 8 + i * 3, i !== 1));
    this.glint = glintSprite(q);
    const area = this.span * 320;
    const n = Math.round(area / 2400);
    for (let i = 0; i < n; i++) {
      const r = rnd.next();
      const kind = r < 0.3 ? 0 : r < 0.56 ? 1 : r < 0.9 ? 2 : 3;
      const pool = kind === 0 ? light : kind === 1 ? dark : kind === 2 ? rip : drift;
      const f = 0.05 + 0.9 * ((i * 0.61803 + rnd.range(-0.04, 0.04)) % 1);
      this.insts.push({
        x0: rnd.range(0, this.span),
        f,
        spr: rnd.pick(pool),
        kind,
        sp: (0.72 + 0.55 * f) * rnd.range(0.88, 1.12),
        alpha: rnd.range(0.6, 1) * (kind === 1 ? 0.95 : 1),
        phase: rnd.range(0, 6.28),
        wander: rnd.range(0.4, 1.4),
      });
    }
    for (let i = 0; i < 16; i++) this.glints.push({ x: rnd.range(60, 520), f: rnd.range(0.06, 0.52), ph: rnd.range(0, 6.28), sc: rnd.range(0.55, 1.1) });
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
      ctx.globalAlpha = 0.8 * tw;
      const s = 14 * g.sc * (0.7 + 0.5 * tw);
      ctx.drawImage(this.glint.cv, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
