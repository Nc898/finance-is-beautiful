/**
 * Small painted props (watercolor variant): reed clumps that sway in the breeze, weathered mileposts with a pale
 * plaque (the app lays DOM text over it), mooring posts, the start line of cork floats and its pennant, and a
 * rare passing bird. Wood is painted like Time to Grow's fence: warm washes lit from the upper left, grain
 * strokes, a check or two, a darker end-grain cap and a broken sepia contour.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { birdFrames } from '../../landing/birds';
import { farEdge, nearEdge, postFootY, WORLD } from './geom';
import { flat, grain, smoothPoly, type Pt } from './ink';
void smoothPoly;
import { blobPoly, grassTuft, strokePoly } from './paint';

export interface Sprite {
  cv: HTMLCanvasElement;
  /** world size and the foot pivot */
  w: number;
  h: number;
  px: number;
  py: number;
}

/* ------------------------------------------------------------------ reeds */

/** a tapered blade along a quadratic curve: a wash with a lit left edge and a shaded right edge */
function blade(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bend: number, w: number, color: string, a: number, rnd: Rand): void {
  const n = 8;
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
    const ww = w * 1.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.5 + 0.12)), 0.8) * (1 - t * 0.92);
    L.push([x - (dy / l) * ww, y + (dx / l) * ww]);
    R.push([x + (dy / l) * ww, y - (dx / l) * ww]);
  }
  const poly = flat([...L, ...R.slice().reverse()]);
  ctx.fillStyle = rgba(color, a * 0.55);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(color, a * 0.45);
  tracePoly(ctx, deform(poly, rnd, 1, 0.03));
  ctx.fill();
  // lit left edge, shaded right edge
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(226,238,160,0.45)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(36,76,50,0.4)';
  ctx.beginPath();
  R.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
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
  // wet pooling at the base, a pale ring where the stems enter the water, a soft reflection
  c.fillStyle = 'rgba(50,80,60,0.22)';
  c.beginPath();
  c.ellipse(px, py + 0.6, 9, 1.7, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(248,252,244,0.45)';
  c.lineWidth = 0.5;
  c.beginPath();
  c.ellipse(px, py + 1.4, 10.5, 1.9, 0, 0.1, Math.PI - 0.1);
  c.stroke();
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
    blade(c, base, py, tipx, tipy, lean * -2 + rnd.range(-3, 3), rnd.range(0.9, 1.5), col, 0.85, rnd);
    c.strokeStyle = rgba(rnd.pick(['#2E5230', '#4F7E3E']), 0.34);
    c.lineWidth = 0.26;
    c.beginPath();
    c.moveTo(base, py);
    c.quadraticCurveTo((base + tipx) / 2 + lean * -2, (py + tipy) / 2, tipx, tipy);
    c.stroke();
    // a second, shorter flag leaf off the stem
    if (rnd.chance(0.6)) {
      const f = rnd.range(0.25, 0.5);
      const sx = base + (tipx - base) * f;
      const sy = py - th * f;
      blade(c, sx, sy, sx + rnd.range(-12, 12), sy - th * rnd.range(0.35, 0.6), rnd.range(-4, 4), rnd.range(0.7, 1.1), rnd.pick(GREENS), 0.8, rnd);
    }
    if (cattail && rnd.chance(0.35)) {
      // a brown seed head on a bare stalk: wash, lit upper-left, dark tip, broken ink
      const hx = tipx;
      const hy = tipy + th * 0.1;
      c.strokeStyle = 'rgba(128,104,60,0.9)';
      c.lineWidth = 0.55;
      c.beginPath();
      c.moveTo(base, py);
      c.quadraticCurveTo((base + hx) / 2, (py + hy) / 2, hx, hy);
      c.stroke();
      const head = smoothPoly([[hx - 1, hy + 0.6], [hx - 1.3, hy - 3.6], [hx - 0.4, hy - 7.2], [hx + 0.5, hy - 3.8], [hx + 1.2, hy + 0.4]], 3, true);
      c.fillStyle = 'rgba(122,78,44,0.55)';
      tracePoly(c, head);
      c.fill();
      c.fillStyle = 'rgba(94,56,32,0.35)';
      tracePoly(c, deform(head, rnd, 1, 0.04));
      c.fill();
      c.strokeStyle = 'rgba(214,170,120,0.7)';
      c.lineWidth = 0.35;
      c.beginPath();
      c.moveTo(hx - 0.7, hy - 0.5);
      c.lineTo(hx - 0.7, hy - 5.8);
      c.stroke();
      c.strokeStyle = 'rgba(42,24,12,0.7)';
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(hx - 0.2, hy - 7.2);
      c.lineTo(hx + 0.1, hy - 9.6);
      c.stroke();
    }
  }
  // lighter highlights on a few blades toward the upper left
  for (let i = 0; i < 3; i++) {
    const bx = px + rnd.range(-6, 3);
    c.strokeStyle = 'rgba(222,236,160,0.5)';
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(bx, py - 2);
    c.quadraticCurveTo(bx - 1 + rnd.range(-2, 2), py - tall * 0.5, bx + rnd.range(-3, 3), py - tall * rnd.range(0.7, 0.95));
    c.stroke();
  }
  return { cv, w, h, px, py };
}

/* ------------------------------------------------------------------ wood */

/** a painted upright of weathered wood (post): gradient wash, grain, checks, end grain, broken sepia contour */
function paintBeam(
  c: CanvasRenderingContext2D,
  rnd: Rand,
  pts: Pt[],
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  o: { alpha?: number; lit?: string; mid?: string; dark?: string } = {},
): void {
  const poly = deform(flat(pts), rnd, 2, 0.006);
  const path = new Path2D();
  path.moveTo(poly[0]!, poly[1]!);
  for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i]!, poly[i + 1]!);
  path.closePath();
  const a = o.alpha ?? 0.96;
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, o.lit ?? `rgba(208,176,132,${a})`);
  g.addColorStop(0.45, o.mid ?? `rgba(162,124,86,${a})`);
  g.addColorStop(1, o.dark ?? `rgba(100,72,52,${a})`);
  c.fillStyle = g;
  c.fill(path);
  c.save();
  c.clip(path);
  // uneven wash: a few translucent bands of warmer and cooler wood
  for (let k = 0; k < 4; k++) {
    const yy = top + rnd.next() * (bottom - top);
    c.fillStyle = rnd.chance(0.5) ? 'rgba(120,84,50,0.1)' : 'rgba(236,208,160,0.12)';
    c.fillRect(x0 - 1, yy, x1 - x0 + 2, rnd.range(3, 12));
  }
  // light along the upper-left edge
  const lg = c.createLinearGradient(x0, 0, x0 + (x1 - x0) * 0.4, 0);
  lg.addColorStop(0, 'rgba(255,240,206,0.3)');
  lg.addColorStop(1, 'rgba(255,240,206,0)');
  c.fillStyle = lg;
  c.fillRect(x0 - 1, top, (x1 - x0) * 0.5, bottom - top);
  // grain strokes and a check or two
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(78,54,38,0.36)';
  c.lineWidth = 0.32;
  for (let k = 0; k < 5; k++) {
    const gx = x0 + (x1 - x0) * rnd.range(0.12, 0.9);
    const y0 = top + rnd.range(0.04, 0.45) * (bottom - top);
    const y1 = y0 + rnd.range(0.2, 0.5) * (bottom - top);
    c.beginPath();
    c.moveTo(gx, y0);
    c.quadraticCurveTo(gx + rnd.range(-0.5, 0.5), (y0 + y1) / 2, gx + rnd.range(-0.4, 0.4), Math.min(bottom - 1, y1));
    c.stroke();
  }
  // a knot
  if (rnd.chance(0.6)) {
    const kx = x0 + (x1 - x0) * rnd.range(0.3, 0.7);
    const ky = top + (bottom - top) * rnd.range(0.2, 0.7);
    c.strokeStyle = 'rgba(70,46,30,0.4)';
    c.lineWidth = 0.4;
    c.beginPath();
    c.ellipse(kx, ky, 0.9, 1.5, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(kx, ky, 1.7, 2.6, 0, 0, Math.PI * 2);
    c.stroke();
  }
  // pooled pigment along the shaded edge
  c.strokeStyle = 'rgba(70,48,34,0.18)';
  c.lineWidth = 1.4;
  c.stroke(path);
  c.restore();
  // broken sepia contour
  c.setLineDash([14, 2.5, 6, 2]);
  c.strokeStyle = 'rgba(46,34,26,0.64)';
  c.lineWidth = 0.5;
  c.stroke(path);
  c.setLineDash([]);
}

/** a weathered mooring post standing in the water (origin at its foot on the surface) */
export function makeMooringPost(seed: number, q: number, up: number): Sprite {
  const rnd = new Rand(seed);
  const w = 30;
  const h = up + 34;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2;
  const py = up + 6;
  c.setTransform(q, 0, 0, q, 0, 0);
  c.lineCap = 'round';
  // wet ring and the post's dark, rippled reflection: soft, vertically smeared dabs
  c.strokeStyle = 'rgba(244,250,244,0.55)';
  c.lineWidth = 0.7;
  c.beginPath();
  c.ellipse(px + 0.4, py + 0.3, 5.6, 1.8, 0, 0, Math.PI * 2);
  c.stroke();
  for (let k = 0; k < 5; k++) {
    c.strokeStyle = `rgba(40,56,62,${0.24 - k * 0.04})`;
    c.lineWidth = 3 - k * 0.4;
    c.beginPath();
    c.moveTo(px + Math.sin(k) * 0.7, py + 2 + k * 4.4);
    c.quadraticCurveTo(px + 1.6 * (k % 2 ? 1 : -1), py + 3.6 + k * 4.4, px + Math.sin(k + 2) * 0.9, py + 5.8 + k * 4.4);
    c.stroke();
  }
  const pw = 5.8;
  const pts: Pt[] = [
    [px - pw / 2, py],
    [px - pw / 2 + 0.3, py - up * 0.5],
    [px - pw / 2 + 0.1, py - up],
    [px, py - up - 1.4],
    [px + pw / 2 - 0.1, py - up],
    [px + pw / 2, py - up * 0.5],
    [px + pw / 2 - 0.3, py],
  ];
  paintBeam(c, rnd, pts, px - pw / 2, px + pw / 2, py - up, py);
  // dark wet band at the waterline and a green weed stain just above it
  c.save();
  const wg = c.createLinearGradient(0, py - 6, 0, py);
  wg.addColorStop(0, 'rgba(60,84,50,0)');
  wg.addColorStop(0.6, 'rgba(56,84,60,0.32)');
  wg.addColorStop(1, 'rgba(34,54,52,0.6)');
  c.fillStyle = wg;
  c.fillRect(px - pw / 2, py - 6, pw, 6);
  c.restore();
  // a rope lashing near the top
  c.strokeStyle = 'rgba(222,196,146,0.95)';
  c.lineWidth = 0.9;
  for (let k = 0; k < 2; k++) {
    c.beginPath();
    c.moveTo(px - pw / 2 - 0.2, py - up + 2.2 + k * 1.3);
    c.quadraticCurveTo(px, py - up + 3.6 + k * 1.3, px + pw / 2 + 0.2, py - up + 2.2 + k * 1.3);
    c.stroke();
  }
  c.strokeStyle = 'rgba(86,62,40,0.5)';
  c.lineWidth = 0.3;
  c.setLineDash([1.4, 1.2]);
  c.beginPath();
  c.moveTo(px - pw / 2, py - up + 2.6);
  c.quadraticCurveTo(px, py - up + 4, px + pw / 2, py - up + 2.6);
  c.stroke();
  c.setLineDash([]);
  return { cv, w, h, px, py };
}

/** a weathered milepost with a pale painted board (blank: the app letters the value on it) */
export function makeMilepost(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const w = 104;
  const h = 108;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2 - 6;
  const py = h - 12;
  c.setTransform(q, 0, 0, q, 0, 0);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // cast shadow on the meadow, falling to the lower right: soft stacked wash
  c.fillStyle = 'rgba(46,76,40,0.1)';
  for (let k = 0; k < 4; k++) {
    const f = 1 - k * 0.12;
    tracePoly(c, deform([px - 3, py, px + 5, py - 1, px + 46 * f, py + 6 * f, px + 40 * f, py + 10 * f, px + 2, py + 5], rnd, 2, 0.05));
    c.fill();
  }
  // the pole, weathered and a little crooked
  const lean = rnd.range(-0.02, 0.02);
  const top = py - 64;
  const pole: Pt[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pole.push([px - 4.2 - t * 0.4 + lean * 40 * (1 - t) + rnd.range(-0.12, 0.12), top + (py - top) * t]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pole.push([px + 4.4 + t * 0.2 + lean * 40 * (1 - t) + rnd.range(-0.12, 0.12), top + 0.4 + (py - top - 0.4) * t]);
  }
  paintBeam(c, rnd, pole, px - 4.6, px + 4.6, top, py);
  // a darker band where the meadow's damp climbs the post
  const dg = c.createLinearGradient(0, py - 12, 0, py);
  dg.addColorStop(0, 'rgba(46,60,32,0)');
  dg.addColorStop(1, 'rgba(46,60,32,0.38)');
  c.fillStyle = dg;
  c.fillRect(px - 5, py - 12, 10, 12);
  // the plaque: a pale painted board in a wooden frame, big enough to carry the value the app writes on it
  const pw = 84;
  const ph = 32;
  const bx = px - pw / 2 + lean * 40;
  const by = top - 0.5;
  // frame: the same warm wood as the fence, as four thin strips
  paintBeam(c, rnd, [[bx, by], [bx + pw, by - 0.4], [bx + pw + 0.4, by + ph], [bx + 0.3, by + ph + 0.5]], bx, bx + pw, by, by + ph, { lit: 'rgba(204,170,124,0.98)', mid: 'rgba(176,138,98,0.98)', dark: 'rgba(132,98,68,0.98)' });
  const m = 2;
  const board: Pt[] = [[bx + m, by + m], [bx + pw - m, by + m - 0.3], [bx + pw - m, by + ph - m], [bx + m, by + ph - m + 0.3]];
  // the board: a flat pale painted wash, built from a few layers so its edge stays hand-made
  c.fillStyle = '#F1E8CE';
  tracePoly(c, flat(board));
  c.fill();
  c.save();
  tracePoly(c, flat(board));
  c.clip();
  c.fillStyle = 'rgba(232,218,184,0.5)';
  for (let k = 0; k < 2; k++) {
    tracePoly(c, deform(flat(board), rnd, 2, 0.01));
    c.fill();
  }
  // the frame shades the board's upper-left edge; light pools toward the lower right
  const sg = c.createLinearGradient(bx, by, bx + pw * 0.5, by + ph);
  sg.addColorStop(0, 'rgba(120,92,56,0.16)');
  sg.addColorStop(0.2, 'rgba(120,92,56,0)');
  c.fillStyle = sg;
  c.fillRect(bx, by, pw, ph);
  const eg = c.createLinearGradient(0, by, 0, by + 5);
  eg.addColorStop(0, 'rgba(110,84,52,0.14)');
  eg.addColorStop(1, 'rgba(110,84,52,0)');
  c.fillStyle = eg;
  c.fillRect(bx, by, pw, 5);
  // a very faint grain and a stain or two (kept pale: the value is lettered on top)
  c.strokeStyle = 'rgba(150,120,80,0.08)';
  c.lineWidth = 0.4;
  for (let k = 0; k < 6; k++) {
    c.beginPath();
    c.moveTo(bx + 4, by + 4 + k * 4.4);
    c.lineTo(bx + pw - 5 - rnd.range(0, 18), by + 4.3 + k * 4.4);
    c.stroke();
  }
  c.fillStyle = 'rgba(186,160,112,0.07)';
  tracePoly(c, deform(blobPoly(bx + pw * rnd.range(0.2, 0.8), by + ph * 0.7, 14, 4, rnd, 9, 0.2), rnd, 1, 0.1));
  c.fill();
  c.restore();
  // inner ink line of the board, broken
  c.setLineDash([10, 2]);
  c.strokeStyle = 'rgba(90,66,44,0.3)';
  c.lineWidth = 0.3;
  tracePoly(c, flat(board));
  c.stroke();
  c.setLineDash([]);
  // nails
  c.fillStyle = 'rgba(52,40,34,0.8)';
  for (const [nx, ny] of [[bx + 1.1, by + 1.1], [bx + pw - 1.1, by + 1.1], [bx + 1.1, by + ph - 1.1], [bx + pw - 1.1, by + ph - 0.8]] as const) {
    c.beginPath();
    c.arc(nx, ny, 0.4, 0, Math.PI * 2);
    c.fill();
  }
  // cap on the pole above the plaque
  c.fillStyle = 'rgba(112,82,56,0.7)';
  tracePoly(c, flat([[px - 5 + lean * 40, top - 0.2], [px + 5 + lean * 40, top - 0.1], [px + 3.6 + lean * 40, top - 2.6], [px - 3.6 + lean * 40, top - 2.8]]));
  c.fill();
  c.setLineDash([8, 2]);
  c.strokeStyle = 'rgba(46,34,26,0.6)';
  c.lineWidth = 0.45;
  c.stroke();
  c.setLineDash([]);
  // grass and a few stones at the foot
  for (let i = 0; i < 5; i++) {
    const sx = px + rnd.range(-8, 9);
    const sy = py + rnd.range(-0.5, 2.5);
    const r = rnd.range(0.9, 2);
    c.fillStyle = rgba(rnd.pick(['#B7AA94', '#A89A86']), 0.8);
    tracePoly(c, deform([sx - r, sy, sx, sy - r * 0.8, sx + r, sy, sx + r * 0.3, sy + r * 0.5], rnd, 1, 0.15));
    c.fill();
  }
  for (let i = 0; i < 9; i++) grassTuft(c, px + rnd.range(-10, 11), py + rnd.range(0.4, 2.2), rnd.range(4, 10), rnd, 0.9, ['#4F7E3E', '#6E9A48', '#8DB155']);
  void grain;
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

/* ------------------------------------------------------------------ start line */

interface CorkSprites {
  cream: Sprite;
  coral: Sprite;
  flag: Sprite;
}

/** one painted cork float (origin at its centre) */
function makeCork(seed: number, q: number, coral: boolean): Sprite {
  const rnd = new Rand(seed);
  const rx = 4.8;
  const ry = 3;
  const w = rx * 2 + 4;
  const h = ry * 2 + 4;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const cx = w / 2;
  const cy = h / 2;
  const body = blobPoly(cx, cy, rx, ry, rnd, 14, 0.05);
  c.fillStyle = coral ? 'rgba(232,112,84,0.62)' : 'rgba(238,222,186,0.7)';
  tracePoly(c, body);
  c.fill();
  c.fillStyle = coral ? 'rgba(214,86,62,0.35)' : 'rgba(214,190,150,0.35)';
  tracePoly(c, deform(body, rnd, 2, 0.03));
  c.fill();
  c.save();
  tracePoly(c, body);
  c.clip();
  const g = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  g.addColorStop(0, 'rgba(255,248,226,0.55)');
  g.addColorStop(0.5, 'rgba(255,248,226,0)');
  g.addColorStop(1, coral ? 'rgba(120,40,28,0.42)' : 'rgba(90,70,40,0.36)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // banding of the wash
  c.strokeStyle = coral ? 'rgba(130,48,34,0.25)' : 'rgba(110,86,50,0.22)';
  c.lineWidth = 0.4;
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    c.moveTo(cx + k * 2.4, cy - ry);
    c.quadraticCurveTo(cx + k * 2.4 + 0.5, cy, cx + k * 2.4, cy + ry);
    c.stroke();
  }
  c.restore();
  c.setLineDash([5, 1.2]);
  c.strokeStyle = 'rgba(52,36,26,0.6)';
  c.lineWidth = 0.4;
  tracePoly(c, body);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = 'rgba(255,252,242,0.75)';
  c.beginPath();
  c.ellipse(cx - rx * 0.38, cy - ry * 0.4, rx * 0.32, ry * 0.24, -0.3, 0, Math.PI * 2);
  c.fill();
  return { cv, w, h, px: cx, py: cy };
}

function makeFlag(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const w = 16;
  const h = 10;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const poly = flat([
    [0.4, 1.2],
    [4, 1.5],
    [8, 2.2],
    [12.4, 4.2],
    [8, 6.4],
    [4, 7.1],
    [0.4, 7.4],
  ]);
  c.fillStyle = 'rgba(236,115,87,0.62)';
  tracePoly(c, poly);
  c.fill();
  c.fillStyle = 'rgba(214,84,60,0.3)';
  for (let k = 0; k < 2; k++) {
    tracePoly(c, deform(poly, rnd, 2, 0.03));
    c.fill();
  }
  c.save();
  tracePoly(c, poly);
  c.clip();
  const g = c.createLinearGradient(0, 1, 12, 7);
  g.addColorStop(0, 'rgba(255,226,200,0.5)');
  g.addColorStop(0.5, 'rgba(255,226,200,0)');
  g.addColorStop(1, 'rgba(110,34,24,0.3)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // a fold in the cloth
  c.strokeStyle = 'rgba(120,40,28,0.28)';
  c.lineWidth = 0.4;
  c.beginPath();
  c.moveTo(3, 1.6);
  c.quadraticCurveTo(5, 4.4, 3.4, 7.2);
  c.stroke();
  c.restore();
  c.setLineDash([6, 1.2]);
  c.strokeStyle = 'rgba(80,36,26,0.6)';
  c.lineWidth = 0.4;
  tracePoly(c, poly);
  c.stroke();
  c.setLineDash([]);
  return { cv, w, h, px: 0.4, py: 4.4 };
}

/**
 * The start line: a rope strung with painted cork floats straight across the river at the dock's x (u = 0),
 * lined up with the "today" milepost, plus a small pennant on the far bank. Floats bob gently and ripple.
 * Corks and flag are painted once as sprites; per frame only a short polyline and ~20 drawImage calls.
 */
export class StartLine {
  private s: CorkSprites;
  constructor(q: number) {
    this.s = { cream: makeCork(71, q, false), coral: makeCork(72, q, true), flag: makeFlag(73, q) };
  }

  draw(ctx: CanvasRenderingContext2D, x: number, yFar: number, yNear: number, t: number, reduced: boolean): void {
    const n = Math.max(6, Math.round((yNear - yFar) / 15));
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const y = yFar + 6 + (yNear - yFar - 12) * f;
      // the rope sits a hair downstream mid-river where the current pulls it, perspective-narrow near the far bank
      const bow = Math.sin(Math.PI * f) * 2.2;
      const bob = reduced ? 0 : 0.6 * Math.sin(t * 1.7 + i * 0.9);
      pts.push([x + bow + (reduced ? 0 : 0.35 * Math.sin(t * 0.9 + i)), y + bob, 0.55 + 0.45 * f]);
    }
    ctx.save();
    ctx.lineCap = 'round';
    // the rope's soft shadow on the water, then the rope (lit side, ink side)
    const rope = (dx: number, dy: number) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(24,66,84,0.14)';
    ctx.lineWidth = 3.2;
    rope(1.6, 1.4);
    ctx.strokeStyle = 'rgba(24,66,84,0.2)';
    ctx.lineWidth = 1.8;
    rope(1.3, 1.1);
    ctx.strokeStyle = 'rgba(222,196,146,0.92)';
    ctx.lineWidth = 1.15;
    rope(0, 0);
    ctx.strokeStyle = 'rgba(70,52,34,0.5)';
    ctx.lineWidth = 0.38;
    ctx.setLineDash([1.6, 1.4]);
    rope(0.3, 0.2);
    ctx.setLineDash([]);
    // floats: corks alternating cream and coral, smaller toward the far bank
    pts.forEach(([px, py, k], i) => {
      if (i === 0 || i === pts.length - 1) return;
      const rx = 3.6 * k + 1.2;
      const ry = 2.1 * k + 0.7;
      // ripple ring and reflection (soft)
      ctx.strokeStyle = 'rgba(250,253,248,0.45)';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.ellipse(px, py + ry * 0.7, rx * 1.6, ry * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,70,90,0.16)';
      ctx.beginPath();
      ctx.ellipse(px + 0.5, py + ry * 1.7, rx * 0.9, ry * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const sp = i % 2 === 0 ? this.s.coral : this.s.cream;
      const sw = (sp.w * rx) / 4.8;
      const sh = (sp.h * ry) / 3;
      ctx.drawImage(sp.cv, px - (sp.px * sw) / sp.w, py - (sp.py * sh) / sp.h, sw, sh);
    });
    // a small pennant on the far bank marking the line: a painted pole and a flag that flutters
    const [fx, fy] = [x, yFar + 2];
    const sway = reduced ? 0 : Math.sin(t * 2.2) * 1.2;
    ctx.strokeStyle = 'rgba(160,122,84,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 0.4, fy - 30);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,42,30,0.55)';
    ctx.lineWidth = 0.4;
    ctx.setLineDash([9, 1.6]);
    ctx.beginPath();
    ctx.moveTo(fx + 0.6, fy);
    ctx.lineTo(fx + 0.2, fy - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    const fl = this.s.flag;
    ctx.save();
    ctx.translate(fx - 0.4, fy - 28.6);
    ctx.transform(1, 0, 0, 1, 0, 0);
    ctx.rotate(sway * 0.035);
    ctx.drawImage(fl.cv, -fl.px, -fl.py, fl.w + sway * 0.25, fl.h);
    ctx.restore();
    ctx.restore();
  }
}

/** kept for callers that want the one-off function form */
export function drawStartLine(ctx: CanvasRenderingContext2D, x: number, yFar: number, yNear: number, t: number, reduced: boolean, sl?: StartLine): void {
  (sl ?? new StartLine(2)).draw(ctx, x, yFar, yNear, t, reduced);
}

void strokePoly;
