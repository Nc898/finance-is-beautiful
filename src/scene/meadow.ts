/**
 * Time to Grow's own ground: a far summer meadow and hedgerow behind the fence, the grass band (washes, clumps
 * at three depths, seed heads, a few wildflowers), the turf edge with overhanging blades and root hairs, and the
 * soil cut-away (strata, granulation, stones, root hairs and old root channels). Nothing here is shared with the
 * landing page or the river.
 *
 * One painter draws in "ground css" space (x across the canvas, y down from the top of the ground canvas, both in
 * css px). It is called twice with different scales: once for the whole ground at the normal density and once for
 * a window that covers the opening close-up at a higher density, so the zoomed start stays crisp. Every element is
 * seeded by its index, so both passes paint exactly the same picture; elements outside the window are skipped.
 */
import { Rand, clamp, hashSeed } from './prng';
import { deform, paintFence, tracePoly, fencePostXs } from './watercolor';

type C2 = CanvasRenderingContext2D;
type RGB = [number, number, number];

export interface MeadowGeom {
  /** ground canvas size in css px */
  W: number;
  H: number;
  /** css y of the ground line (the trees' feet) */
  gy: number;
  /** css px per world unit */
  s: number;
  dpr: number;
  /** css x of each tree trunk */
  trees: number[];
  seed?: number;
}
export interface MeadowView {
  /** canvas px per css px */
  scale: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** the paper's tooth as one overlay: dark pits and light peaks around its mean */
export interface Tooth {
  tile: CanvasImageSource;
  size: number;
}

const col = (c: RGB, a: number): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
const lerpc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (c: RGB, r: Rand, j: number): RGB => [clamp(c[0] + r.gauss() * j, 0, 255), clamp(c[1] + r.gauss() * j, 0, 255), clamp(c[2] + r.gauss() * j, 0, 255)];
const ramp = (st: RGB[], t: number): RGB => {
  const f = clamp(t, 0, 0.9999) * (st.length - 1);
  const i = Math.floor(f);
  return lerpc(st[i]!, st[i + 1]!, f - i);
};

/** a smooth random function of x (sum of a few sines) */
function wavy(rnd: Rand, amp: number, wls: number[]): (x: number) => number {
  const parts = wls.map((wl, i) => ({ a: (amp * rnd.range(0.55, 1)) / Math.pow(i + 1, 0.55), k: (2 * Math.PI) / (wl * rnd.range(0.8, 1.25)), p: rnd.range(0, 6.28) }));
  return (x) => {
    let v = 0;
    for (const q of parts) v += q.a * Math.sin(x * q.k + q.p);
    return v;
  };
}
function bandPoly(W: number, top: (x: number) => number, bot: (x: number) => number, step: number): number[] {
  const p: number[] = [];
  for (let x = -24; x <= W + 24; x += step) p.push(x, top(x));
  for (let x = W + 24; x >= -24; x -= step) p.push(x, bot(x));
  return p;
}
function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): number[] {
  const p: number[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    p.push(cx + x * cr - y * sr, cy + x * sr + y * cr);
  }
  return p;
}
/** a wash: several translucent, independently re-deformed copies, so the edge builds up like pooled pigment */
function wash(ctx: C2, body: number[], c: RGB, alpha: number, n: number, rnd: Rand, amp: number, levels = 2): void {
  ctx.fillStyle = col(c, alpha);
  for (let i = 0; i < n; i++) {
    tracePoly(ctx, deform(body, rnd, levels, amp));
    ctx.fill();
  }
}
/** a soft wet-in-wet bloom: a radial gradient squashed to an ellipse */
function bloom(ctx: C2, x: number, y: number, rx: number, ry: number, c: RGB, a: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, col(c, a));
  g.addColorStop(0.6, col(c, a * 0.55));
  g.addColorStop(1, col(c, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
/** a bloom with a pale middle and a dried pigment rim (a backrun) */
function backrun(ctx: C2, x: number, y: number, rx: number, ry: number, c: RGB, rim: RGB, a: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, col(c, a * 0.8));
  g.addColorStop(0.7, col(c, a * 0.25));
  g.addColorStop(0.9, col(rim, a * 0.9));
  g.addColorStop(1, col(rim, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bladePath(ctx: C2, x: number, y: number, L: number, w: number, ang: number, bend: number): void {
  const tx = x + Math.sin(ang) * L + bend * L * 0.35;
  const ty = y - Math.cos(ang) * L;
  const cx = x + Math.sin(ang) * L * 0.35 + bend * L * 0.05;
  const cy = y - L * 0.62;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(cx - w * 0.45, cy, tx, ty);
  ctx.quadraticCurveTo(cx + w * 0.45, cy, x + w / 2, y);
  ctx.closePath();
}

const GRASS_PAL: RGB[] = [[40, 92, 52], [74, 130, 62], [118, 164, 70], [176, 202, 92], [214, 220, 118]];
const GRASS_PAL_BACK: RGB[] = [[56, 108, 66], [92, 142, 74], [136, 172, 84], [184, 204, 110]];

function clump(ctx: C2, x: number, y: number, h: number, er: Rand, pal: RGB[], wscale: number, s: number, shade: number): void {
  // pooled shadow at the base, so the blades darken toward the roots
  bloom(ctx, x, y + 0.2 * s, h * 0.5, Math.max(1.1 * s, h * 0.12), [30, 70, 44], 0.34 * shade);
  const n = er.int(6, 19);
  const lean = er.range(-0.35, 0.35);
  for (let k = 0; k < n; k++) {
    const a = lean + er.range(-0.55, 0.55);
    const L = h * er.range(0.42, 1) * (1 - Math.abs(a) * 0.25);
    const bx = x + er.range(-1, 1) * h * 0.16;
    const w = er.range(0.5, 1.0) * s * wscale;
    let f = er.next();
    if (a < 0) f = f * 0.6 + 0.4;
    const c = ramp(pal, f);
    ctx.fillStyle = col(c, er.range(0.8, 0.95));
    const bend = er.range(-0.5, 0.5);
    bladePath(ctx, bx, y, L, w, a, bend);
    ctx.fill();
    if (er.chance(0.32)) {
      // ink under the wash: a thin dark line down the shaded edge
      ctx.strokeStyle = col([30, 58, 38], 0.42);
      ctx.lineWidth = 0.32 * s;
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.5, y);
      ctx.quadraticCurveTo(bx + Math.sin(a) * L * 0.35 + w * 0.3, y - L * 0.62, bx + Math.sin(a) * L + bend * L * 0.35, y - Math.cos(a) * L);
      ctx.stroke();
    }
  }
}

function quadPt(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
}

function seedHead(ctx: C2, x: number, y: number, h: number, er: Rand, s: number): void {
  const bend = er.range(-0.2, 0.2) * h;
  ctx.strokeStyle = col([168, 176, 96], 0.9);
  ctx.lineWidth = 0.5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + bend * 0.3, y - h * 0.6, x + bend, y - h);
  ctx.stroke();
  for (let j = 0; j < 8; j++) {
    const t = 1 - j * 0.045;
    const [px, py] = quadPt(x, y, x + bend * 0.3, y - h * 0.6, x + bend, y - h, t);
    const side = j % 2 === 0 ? 1 : -1;
    ctx.fillStyle = col(j % 3 === 0 ? [196, 164, 92] : [218, 194, 116], 0.92);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(side * 0.6 + bend / h);
    ctx.beginPath();
    ctx.ellipse(side * 0.35 * s, -0.5 * s, 0.38 * s, 1.1 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function stem(ctx: C2, x: number, y: number, h: number, lean: number, s: number): [number, number] {
  ctx.strokeStyle = col([104, 148, 66], 0.9);
  ctx.lineWidth = 0.38 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * h * 0.2, y - h * 0.6, x + lean * h, y - h);
  ctx.stroke();
  return [x + lean * h, y - h];
}

function buttercup(ctx: C2, x: number, y: number, er: Rand, s: number): void {
  const [fx, fy] = stem(ctx, x, y, er.range(4.5, 8) * s, er.range(-0.25, 0.25), s);
  const r = er.range(0.9, 1.25) * s;
  const rot = er.range(0, 6.28);
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2;
    ctx.fillStyle = col(jit([246, 208, 62], er, 8), 0.95);
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, r * 0.56, r * 0.5, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = col([208, 140, 30], 0.95);
  ctx.beginPath();
  ctx.arc(fx, fy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}
function daisy(ctx: C2, x: number, y: number, er: Rand, s: number): void {
  const [fx, fy] = stem(ctx, x, y, er.range(6, 9.5) * s, er.range(-0.2, 0.2), s);
  const r = er.range(1.7, 2.2) * s;
  const rot = er.range(0, 6.28);
  ctx.lineWidth = 0.22 * s;
  for (let k = 0; k < 11; k++) {
    const a = rot + (k / 11) * Math.PI * 2 + er.range(-0.08, 0.08);
    ctx.fillStyle = col([252, 250, 242], 0.97);
    ctx.strokeStyle = col([140, 128, 104], 0.4);
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, r * 0.44, r * 0.17, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = col([238, 184, 50], 0.97);
  ctx.beginPath();
  ctx.arc(fx, fy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}
function clover(ctx: C2, x: number, y: number, er: Rand, s: number): void {
  const [fx, fy] = stem(ctx, x, y, er.range(3.5, 6) * s, er.range(-0.25, 0.25), s);
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 1.1;
    ctx.fillStyle = col([84, 136, 66], 0.9);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 1.2 * s, y + Math.sin(a) * 0.9 * s, 1.3 * s, 0.7 * s, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const r = er.range(1.0, 1.35) * s;
  for (let k = 0; k < 9; k++) {
    const a = er.range(0, 6.28);
    const d = Math.sqrt(er.next()) * r * 0.7;
    ctx.fillStyle = col(jit(k % 3 === 0 ? [236, 196, 218] : [212, 142, 184], er, 8), 0.92);
    ctx.beginPath();
    ctx.arc(fx + Math.cos(a) * d, fy + Math.sin(a) * d, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a pebble with its own shading: cast shadow, body, light from the upper left, a partial ink contour */
function stone(ctx: C2, x: number, y: number, r: number, er: Rand, s: number): void {
  const pals: RGB[] = [[176, 160, 136], [150, 134, 112], [190, 124, 90], [216, 200, 172], [124, 104, 88], [200, 184, 150], [168, 150, 118]];
  const base = jit(pals[er.int(0, pals.length - 1)]!, er, 6);
  const flat = er.range(0.55, 0.85);
  const rot = er.range(-0.5, 0.5);
  ctx.fillStyle = col([76, 46, 26], 0.24);
  tracePoly(ctx, ellipsePoly(x + r * 0.3, y + r * 0.5 * flat, r * 1.05, r * flat * 0.8, 10, rot));
  ctx.fill();
  const body = deform(ellipsePoly(x, y, r, r * flat, 10, rot), er, 2, 0.1);
  tracePoly(ctx, body);
  ctx.fillStyle = col(base, 0.9);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35 * flat, 0, x - r * 0.1, y - r * 0.1, r * 1.15);
  g.addColorStop(0, 'rgba(255,244,222,0.38)');
  g.addColorStop(0.5, 'rgba(255,244,222,0)');
  g.addColorStop(1, 'rgba(56,36,24,0.42)');
  ctx.fillStyle = g;
  tracePoly(ctx, body);
  ctx.fill();
  if (r > 2 * s) {
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = col([70, 54, 40], 0.3);
      ctx.fillRect(x + er.range(-0.6, 0.6) * r, y + er.range(-0.4, 0.4) * r * flat, 0.4 * s, 0.4 * s);
    }
  }
  ctx.strokeStyle = col([54, 38, 28], 0.4);
  ctx.lineWidth = 0.35 * s;
  ctx.setLineDash([r * 1.8, r * 0.5, r * 0.9, r * 0.4]);
  tracePoly(ctx, body);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** a thin wavering root hair or rootlet running down from (x, y), sometimes forking */
function rootHair(ctx: C2, x: number, y: number, len: number, er: Rand, w: number, c: RGB, a: number, depth = 0): void {
  ctx.strokeStyle = col(c, a);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  const segs = Math.max(2, Math.round(len / (3.2 * w + 3)));
  let px = x;
  let py = y;
  let dir = er.range(-0.5, 0.5);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < segs; i++) {
    dir = clamp(dir + er.range(-0.5, 0.5), -1.1, 1.1);
    const nx = px + Math.sin(dir) * (len / segs);
    const ny = py + Math.cos(dir) * (len / segs);
    ctx.quadraticCurveTo(px + er.range(-1, 1) * 0.8, (py + ny) / 2, nx, ny);
    px = nx;
    py = ny;
    pts.push([px, py]);
  }
  ctx.stroke();
  if (depth < 1 && pts.length > 1) {
    for (let k = 0; k < 2; k++) {
      if (!er.chance(0.55)) continue;
      const q = pts[er.int(0, pts.length - 2)]!;
      rootHair(ctx, q[0], q[1], len * er.range(0.25, 0.5), er, w * 0.7, c, a * 0.85, depth + 1);
    }
  }
}

/* ------------------------------------------------------------------------------------------------ layers */

interface Ctx {
  g: MeadowGeom;
  v: MeadowView;
  seed: number;
  /** turf edge: css y of the lower edge of the grass at x */
  edge: (x: number) => number;
  seen: (x0: number, y0: number, x1: number, y1: number) => boolean;
}

/** far summer meadow receding into haze, and a low hedgerow, behind the fence */
function paintFar(ctx: C2, k: Ctx): void {
  const { W, gy, s } = k.g;
  const rnd = new Rand(k.seed + 101);
  ctx.save();
  ctx.globalAlpha = 0.92;
  // haze: cool, pale, fading up into the sky
  {
    const gr = ctx.createLinearGradient(0, gy - 44 * s, 0, gy + 4 * s);
    gr.addColorStop(0, col([200, 214, 176], 0));
    gr.addColorStop(0.45, col([188, 208, 162], 0.3));
    gr.addColorStop(1, col([160, 192, 118], 0.55));
    ctx.fillStyle = gr;
    ctx.fillRect(0, gy - 44 * s, W, 48 * s);
  }
  // low hedgerow: overlapping dabs, cool and desaturated, never tall enough to read as a tree
  const hedgeBase = gy - 21 * s;
  const clumps: Array<{ x: number; w: number; h: number; tone: number; seed: number }> = [];
  for (let x = -30 * s; x < W + 30 * s; ) {
    const w = rnd.range(14, 52) * s;
    clumps.push({ x: x + w / 2, w, h: rnd.range(4.5, 10) * s * (rnd.chance(0.1) ? 1.45 : 1), tone: rnd.next(), seed: rnd.int(1, 1e9) });
    x += w * rnd.range(0.55, 0.95);
  }
  const hedgePal: RGB[] = [[96, 130, 100], [118, 150, 112], [138, 164, 122], [106, 140, 112], [150, 172, 126]];
  for (const c of clumps) {
    if (!k.seen(c.x - c.w, hedgeBase - c.h * 1.4, c.x + c.w, hedgeBase + 3 * s)) continue;
    const er = new Rand(c.seed);
    // grounded: a soft shadow along the foot
    bloom(ctx, c.x, hedgeBase + 0.5 * s, c.w * 0.6, 1.8 * s, [84, 112, 88], 0.3);
    const n = 7 + Math.floor(c.w / (6 * s));
    for (let i = 0; i < n; i++) {
      const dx = c.x + er.gauss() * c.w * 0.26;
      const dy = hedgeBase - c.h * er.range(0.22, 0.85);
      const body = deform(ellipsePoly(dx, dy, c.w * er.range(0.16, 0.3), c.h * er.range(0.28, 0.5), 11, er.range(-0.3, 0.3)), er, 2, 0.12);
      ctx.fillStyle = col(jit(hedgePal[Math.floor(clamp(c.tone + er.range(-0.3, 0.3), 0, 0.99) * hedgePal.length)]!, er, 5), er.range(0.16, 0.26));
      tracePoly(ctx, body);
      ctx.fill();
      bloom(ctx, dx, dy, c.w * er.range(0.22, 0.36), c.h * er.range(0.32, 0.55), jit(hedgePal[Math.floor(clamp(c.tone + er.range(-0.3, 0.3), 0, 0.99) * hedgePal.length)]!, er, 5), er.range(0.16, 0.26));
    }
    for (let i = 0; i < 2; i++) {
      // light from the upper left, shade lower right
      const hx = c.x - c.w * er.range(0.05, 0.22);
      const hy = hedgeBase - c.h * er.range(0.6, 0.9);
      ctx.fillStyle = col([168, 188, 134], 0.28);
      tracePoly(ctx, deform(ellipsePoly(hx, hy, c.w * 0.16, c.h * 0.22, 9), er, 2, 0.14));
      ctx.fill();
      const sx = c.x + c.w * er.range(0.05, 0.22);
      const sy = hedgeBase - c.h * er.range(0.12, 0.35);
      ctx.fillStyle = col([72, 106, 86], 0.3);
      tracePoly(ctx, deform(ellipsePoly(sx, sy, c.w * 0.16, c.h * 0.2, 9), er, 2, 0.14));
      ctx.fill();
    }
    // dry-brush flecks along the crown
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const fx = c.x + er.range(-0.5, 0.5) * c.w;
      const fy = hedgeBase - c.h * er.range(0.55, 1.0);
      ctx.strokeStyle = col(er.chance(0.5) ? [112, 146, 108] : [150, 174, 128], 0.32);
      ctx.lineWidth = 0.5 * s;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + er.range(-1.2, 1.2) * s, fy - er.range(0.8, 2.2) * s);
      ctx.stroke();
    }
  }
  // fields in front of the hedge: pale, cool, a little hay, each nearer band warmer and greener
  const bands: Array<{ y: number; c: RGB; a: number }> = [
    { y: -19.5, c: [178, 202, 130], a: 0.34 },
    { y: -15.5, c: [200, 206, 126], a: 0.3 },
    { y: -12, c: [152, 188, 106], a: 0.36 },
    { y: -8.5, c: [128, 172, 92], a: 0.4 },
  ];
  const tops: Array<(x: number) => number> = [];
  bands.forEach((b, i) => {
    const f = wavy(rnd, 1.7 * s, [300 * s, 110 * s, 38 * s]);
    const top = (x: number) => gy + b.y * s + f(x);
    tops.push(top);
    const body = bandPoly(W, top, () => gy + 5 * s, 10 * s);
    ctx.fillStyle = col(b.c, b.a);
    for (let j = 0; j < 3; j++) {
      tracePoly(ctx, deform(body, rnd, 2, 0.05));
      ctx.fill();
    }
    // wet-in-wet drift inside the field
    for (let j = 0; j < Math.ceil(W / (140 * s)); j++) {
      bloom(ctx, rnd.range(0, W), top(0) + rnd.range(2, 7) * s, rnd.range(30, 90) * s, rnd.range(1.5, 3) * s, jit(b.c, rnd, 14), 0.16);
    }
    // a field boundary: a faint hedge line along the edge, broken
    ctx.strokeStyle = col([96, 132, 92], 0.1);
    ctx.lineWidth = 1.6 * s;
    ctx.setLineDash([90 * s, 40 * s, 36 * s, 30 * s]);
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16 * s) {
      const y = top(x) + 0.2 * s;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // long soft grass strokes, nearer bands denser and taller
    ctx.lineCap = 'round';
    const cnt = Math.round(W / ((5.8 - i * 1) * s));
    for (let j = 0; j < cnt; j++) {
      const x = rnd.range(0, W);
      const y = top(x) + rnd.range(0.5, 5) * s;
      const L = (2.2 + i * 1.1) * s * rnd.range(0.6, 1.2);
      const a = rnd.range(-0.28, 0.28);
      const cc = rnd.chance(0.4) ? [200, 214, 140] : rnd.chance(0.5) ? [124, 164, 96] : [96, 138, 80];
      ctx.strokeStyle = col(cc as RGB, rnd.range(0.12, 0.26));
      ctx.lineWidth = rnd.range(0.45, 0.8) * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(a) * L, y - Math.cos(a) * L);
      ctx.stroke();
    }
  });
  // far flowers: a few pale flecks in the nearest field
  for (let j = 0; j < Math.ceil(W / (60 * s)); j++) {
    const x = rnd.range(0, W);
    const y = gy + rnd.range(-6, 1) * s;
    ctx.fillStyle = col(rnd.chance(0.6) ? [246, 232, 150] : [250, 246, 236], 0.55);
    ctx.fillRect(x, y, 0.8 * s, 0.7 * s);
  }
  ctx.restore();
}

/** the grass band: layered washes, light from the upper left, blooms and granulation */
function paintGrassWash(ctx: C2, k: Ctx): void {
  const { W, gy, s } = k.g;
  const rnd = new Rand(k.seed + 211);
  const top = wavy(rnd, 1.6 * s, [220 * s, 70 * s, 24 * s]);
  const topY = (x: number) => gy - 8 * s + top(x);
  const body = bandPoly(W, topY, (x) => k.edge(x) + 1.5 * s, 8 * s);
  // base: opaque below, dissolving upward into the far meadow
  {
    const gr = ctx.createLinearGradient(0, gy - 10 * s, 0, gy + 19 * s);
    gr.addColorStop(0, col([190, 214, 120], 0));
    gr.addColorStop(0.2, col([176, 206, 104], 0.8));
    gr.addColorStop(0.5, col([132, 178, 84], 0.95));
    gr.addColorStop(0.8, col([84, 140, 64], 1));
    gr.addColorStop(1, col([62, 112, 54], 1));
    ctx.fillStyle = gr;
    tracePoly(ctx, body);
    ctx.fill();
  }
  const greens: RGB[] = [[206, 214, 104], [170, 206, 86], [98, 160, 72], [58, 128, 96], [48, 104, 58], [152, 162, 72]];
  for (let i = 0; i < Math.ceil(W / (18 * s)); i++) {
    const x = rnd.range(-20, W + 20);
    const y = gy + rnd.range(-6, 15) * s;
    const c = greens[rnd.int(0, greens.length - 1)]!;
    const lowy = (y - gy) / (15 * s);
    const cc = lowy > 0.5 && rnd.chance(0.6) ? greens[rnd.int(3, 4)]! : c;
    bloom(ctx, x, y, rnd.range(26, 120) * s, rnd.range(2.4, 6.5) * s, cc, rnd.range(0.12, 0.26), rnd.range(-0.06, 0.06));
  }
  // light catching the top edge from the upper left: pale yellow-green sweeps
  for (let i = 0; i < Math.ceil(W / (60 * s)); i++) {
    bloom(ctx, rnd.range(0, W), gy - 5.5 * s + rnd.range(-2, 3) * s, rnd.range(40, 130) * s, rnd.range(1.6, 3.4) * s, [232, 234, 150], rnd.range(0.14, 0.26), rnd.range(-0.04, 0.04));
  }
  // pooled-pigment washes with hard dried edges
  ctx.save();
  for (let i = 0; i < Math.ceil(W / (40 * s)); i++) {
    const x = rnd.range(0, W);
    const y = gy + rnd.range(-4, 13) * s;
    const c = jit(greens[rnd.int(1, 4)]!, rnd, 8);
    const body2 = ellipsePoly(x, y, rnd.range(20, 70) * s, rnd.range(1.6, 4.2) * s, 14, rnd.range(-0.05, 0.05));
    wash(ctx, body2, c, 0.06, 3, rnd, 0.09);
    ctx.strokeStyle = col(lerpc(c, [30, 70, 40], 0.4), 0.09);
    ctx.lineWidth = 0.5 * s;
    tracePoly(ctx, deform(body2, rnd, 2, 0.08));
    ctx.stroke();
  }
  ctx.restore();
  // granulation of green pigment in the paper's tooth
  const cnt = Math.round((W * 23 * s * s) / (26 * s * s));
  for (let i = 0; i < cnt; i++) {
    const x = rnd.range(0, W);
    const y = gy - 6 * s + rnd.next() * 23 * s;
    const dark = rnd.chance(0.55);
    const sz = rnd.range(0.4, 0.95) * s;
    ctx.fillStyle = dark ? col([36, 86, 52], rnd.range(0.06, 0.14)) : col([226, 232, 150], rnd.range(0.1, 0.2));
    ctx.fillRect(x, y, sz, sz);
  }
  // the turf's own shadow falls on the soil just under it (soft, never a ruled line)
  for (let x = -10 * s; x < W + 10 * s; x += rnd.range(7, 14) * s) {
    bloom(ctx, x, k.edge(x) + 1.5 * s, rnd.range(9, 20) * s, rnd.range(2, 3.6) * s, [64, 40, 22], rnd.range(0.12, 0.24));
  }
}

/** a carpet of single fine blades across the band, so the wash reads as grass rather than a gradient */
function paintBladeCarpet(ctx: C2, k: Ctx): void {
  const { W, gy, s } = k.g;
  const rnd = new Rand(k.seed + 251);
  const n = Math.round((W * 24 * s) / (11 * s));
  for (let i = 0; i < n; i++) {
    const x = rnd.range(-4, W + 4);
    const y = gy - 8 * s + Math.pow(rnd.next(), 0.85) * 24 * s;
    const er = new Rand(hashSeed(k.seed, 70, i));
    const d = (y - (gy - 8 * s)) / (24 * s);
    const L = er.range(2.2, 6.5) * s * (1.1 - d * 0.35);
    if (!k.seen(x - L, y - L, x + L, y + 1)) continue;
    const a = er.range(-0.5, 0.5);
    const f = clamp(er.next() * 0.9 + (a < 0 ? 0.15 : 0) - d * 0.25, 0, 1);
    ctx.fillStyle = col(ramp(GRASS_PAL, f), er.range(0.5, 0.85));
    bladePath(ctx, x, y, L, er.range(0.4, 0.8) * s, a, er.range(-0.4, 0.4));
    ctx.fill();
  }
}

/** soft shadow under the fence: along the foot of the rails and a short wedge from each post */
function paintFenceShadow(ctx: C2, k: Ctx, posts: number[]): void {
  const { W, gy, s } = k.g;
  const base = gy - 7 * s;
  bloom(ctx, W / 2, base + 2.2 * s, W * 0.62, 2.6 * s, [34, 70, 62], 0.1);
  const rnd = new Rand(k.seed + 307);
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    if (!k.seen(a, base - 4 * s, b + 10 * s, base + 8 * s)) continue;
    ctx.save();
    ctx.translate((a + b) / 2 + 3 * s, base + 2.4 * s);
    ctx.scale(1, 0.09);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, (b - a) / 2);
    g.addColorStop(0, col([30, 66, 58], 0.34));
    g.addColorStop(0.7, col([30, 66, 58], 0.14));
    g.addColorStop(1, col([30, 66, 58], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, (b - a) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const px of posts) {
    // a post's shadow lies to the lower right
    ctx.fillStyle = col([30, 62, 52], rnd.range(0.2, 0.3));
    ctx.beginPath();
    ctx.moveTo(px - 2.6 * s, base + 0.6 * s);
    ctx.lineTo(px + 2.8 * s, base + 0.6 * s);
    ctx.lineTo(px + rnd.range(8, 12) * s, base + 3.6 * s);
    ctx.lineTo(px + 3 * s, base + 3.4 * s);
    ctx.closePath();
    ctx.fill();
  }
}

type Row = { name: number; y0: number; y1: number; hMin: number; hMax: number; step: [number, number]; wscale: number; pal: RGB[]; shade: number };

/** clumps of blades along a depth row; taller and denser around the fence posts */
function paintClumps(ctx: C2, k: Ctx, row: Row, posts: number[]): void {
  const { W, s } = k.g;
  const rnd = new Rand(k.seed + 400 + row.name * 17);
  let i = 0;
  const place = (x: number, hBoost: number) => {
    const y = row.y0 + rnd.next() * (row.y1 - row.y0);
    const h = rnd.range(row.hMin, row.hMax) * hBoost;
    const sd = hashSeed(k.seed, row.name, i++);
    if (k.seen(x - h, y - h * 1.3, x + h, y + 3 * s)) clump(ctx, x, y, h, new Rand(sd), row.pal, row.wscale, s, row.shade);
  };
  for (let x = -6 * s; x < W + 6 * s; x += rnd.range(row.step[0], row.step[1]) * s) place(x, rnd.chance(0.12) ? 1.3 : 1);
  // tufts crowd the foot of each post
  if (row.name === 0 || row.name === 1) for (const px of posts) for (let j = 0; j < 3; j++) place(px + rnd.range(-7, 7) * s, 1.25);
}

function paintSeedHeads(ctx: C2, k: Ctx): void {
  const { W, gy, s } = k.g;
  const rnd = new Rand(k.seed + 503);
  const n = Math.round(W / (44 * s));
  for (let i = 0; i < n; i++) {
    const x = rnd.range(0, W);
    const y = gy + rnd.range(-6, 9) * s;
    const h = rnd.range(8, 15) * s;
    const sd = hashSeed(k.seed, 9, i);
    if (k.seen(x - h, y - h, x + h, y + 2 * s)) seedHead(ctx, x, y, h, new Rand(sd), s);
  }
}

function paintFlowers(ctx: C2, k: Ctx): void {
  const { W, gy, s, trees } = k.g;
  const rnd = new Rand(k.seed + 601);
  const scale = Math.max(0.3, W / 1440);
  const spec: Array<[number, (c: C2, x: number, y: number, e: Rand, s: number) => void, number]> = [
    [Math.round(16 * scale) + 2, buttercup, 1],
    [Math.round(9 * scale) + 1, clover, 2],
    [Math.round(4 * scale) + 1, daisy, 3],
  ];
  for (const [count, fn, id] of spec) {
    for (let i = 0; i < count; i++) {
      let x = rnd.range(10, W - 10);
      for (const tx of trees) if (Math.abs(x - tx) < 18 * s) x = tx + (x < tx ? -1 : 1) * 22 * s;
      const y = gy + rnd.range(-2, 13) * s;
      if (k.seen(x - 12 * s, y - 14 * s, x + 12 * s, y + 3 * s)) fn(ctx, x, y, new Rand(hashSeed(k.seed, 20 + id, i)), s);
    }
  }
}

/** blades overhanging the turf edge, and a fringe of pale roots where the turf is undercut */
function paintTurfEdge(ctx: C2, k: Ctx): void {
  const { W, s } = k.g;
  const rnd = new Rand(k.seed + 701);
  let i = 0;
  for (let x = -4 * s; x < W + 4 * s; x += rnd.range(3, 8) * s) {
    const sd = hashSeed(k.seed, 30, i++);
    const y = k.edge(x) - rnd.range(1.5, 3.2) * s;
    const L = rnd.range(4, 12) * s;
    if (!k.seen(x - L, y - 2 * s, x + L, y + L)) continue;
    const er = new Rand(sd);
    const n = er.int(3, 6);
    const dirx = er.range(-1, 1);
    for (let j = 0; j < n; j++) {
      const len = L * er.range(0.5, 1);
      const w = er.range(0.55, 1) * s;
      const side = dirx + er.range(-0.5, 0.5);
      const sx = x + er.range(-1.5, 1.5) * s;
      const c = ramp(GRASS_PAL, er.range(0, 0.55));
      ctx.fillStyle = col(c, 0.92);
      // an arching blade that droops past the edge
      ctx.beginPath();
      ctx.moveTo(sx - w / 2, y);
      ctx.quadraticCurveTo(sx + side * len * 0.5, y - len * 0.2, sx + side * len * 0.9, y + len * 0.7);
      ctx.quadraticCurveTo(sx + side * len * 0.55, y + len * 0.05 + w * 0.4, sx + w / 2, y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function paintSoil(ctx: C2, k: Ctx, tooth: Tooth | null): void {
  const { W, H, gy, s } = k.g;
  const rnd = new Rand(k.seed + 811);
  const top = gy + 5 * s;
  // base: rich topsoil easing to pale subsoil
  {
    const gr = ctx.createLinearGradient(0, top, 0, H);
    gr.addColorStop(0, col([150, 100, 58], 1));
    gr.addColorStop(0.1, col([166, 116, 68], 1));
    gr.addColorStop(0.32, col([186, 138, 86], 1));
    gr.addColorStop(0.65, col([198, 154, 102], 1));
    gr.addColorStop(1, col([208, 170, 120], 1));
    ctx.fillStyle = gr;
    ctx.fillRect(-2, top, W + 4, H - top + 2);
  }
  // strata: wavy, gently tilted, some pinching out, each a wash with its own edge
  const bounds = [20, 34, 56, 86, 124].map((b) => b * s + k.g.gy);
  const strata: Array<{ c: RGB; a: number }> = [
    { c: [108, 70, 40], a: 0.16 },
    { c: [150, 104, 62], a: 0.1 },
    { c: [224, 188, 132], a: 0.15 },
    { c: [186, 122, 82], a: 0.1 },
    { c: [226, 196, 146], a: 0.15 },
    { c: [196, 154, 108], a: 0.1 },
  ];
  const edges: Array<(x: number) => number> = [];
  bounds.forEach((by, i) => {
    const f = wavy(rnd, (2.4 + i * 0.5) * s, [260 * s, 110 * s, 41 * s]);
    const tilt = rnd.range(-0.03, 0.03);
    edges.push((x) => by + f(x) + tilt * (x - W / 2));
  });
  const topEdge = (x: number) => k.edge(x) - 2 * s;
  const allEdges = [topEdge, ...edges];
  for (let i = 0; i < strata.length; i++) {
    const a = allEdges[i]!;
    const b = i + 1 < allEdges.length ? allEdges[i + 1]! : () => H + 6;
    // a stratum thins and swells (a lens), so no band runs ruler-straight
    const pinch = wavy(rnd, 7 * s, [300 * s, 120 * s, 45 * s]);
    const body = bandPoly(W, a, (x) => Math.max(a(x) + 1.2 * s, b(x) + pinch(x)), 9 * s);
    wash(ctx, body, strata[i]!.c, strata[i]!.a * 1.3, 3, rnd, 0.06);
    // the pooled edge of the wash, and a pale lip beneath it
    if (i > 0) {
      ctx.strokeStyle = col([104, 68, 40], 0.06);
      ctx.lineWidth = 1.4 * s;
      ctx.setLineDash([140 * s, 30 * s, 60 * s, 24 * s]);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8 * s) {
        const y = a(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // blooms and backruns
  const warm: RGB[] = [[200, 150, 100], [184, 134, 92], [216, 186, 140], [170, 116, 70]];
  const nb = Math.round((W * (H - top)) / (9000 * s * s));
  for (let i = 0; i < nb; i++) {
    const x = rnd.range(0, W);
    const y = top + Math.pow(rnd.next(), 0.9) * (H - top);
    const c = warm[rnd.int(0, warm.length - 1)]!;
    if (rnd.chance(0.28)) backrun(ctx, x, y, rnd.range(18, 52) * s, rnd.range(8, 22) * s, [232, 202, 156], [150, 104, 64], rnd.range(0.12, 0.22), rnd.range(-0.3, 0.3));
    else bloom(ctx, x, y, rnd.range(30, 100) * s, rnd.range(10, 30) * s, c, rnd.range(0.08, 0.17), rnd.range(-0.2, 0.2));
  }
  // granulation: pigment settling in the paper's tooth, denser in the darker topsoil
  const area = W * (H - top);
  const nd = Math.round(area / (60 * s * s));
  for (let i = 0; i < nd; i++) {
    const x = rnd.range(0, W);
    const y = top + Math.pow(rnd.next(), 1.35) * (H - top);
    const sz = rnd.range(0.4, 0.95) * s;
    ctx.fillStyle = col([118, 78, 44], rnd.range(0.08, 0.2));
    ctx.fillRect(x, y, sz, sz * rnd.range(0.7, 1.2));
  }
  const nl = Math.round(area / (95 * s * s));
  for (let i = 0; i < nl; i++) {
    const x = rnd.range(0, W);
    const y = top + rnd.next() * (H - top);
    const sz = rnd.range(0.4, 0.9) * s;
    ctx.fillStyle = col([240, 216, 170], rnd.range(0.14, 0.3));
    ctx.fillRect(x, y, sz, sz);
  }
  // old root channels: faint dark tunnels where roots once were, tapering, with a pale lower lip
  ctx.lineCap = 'round';
  for (let i = 0; i < Math.max(3, Math.round(W / (240 * s))); i++) {
    const er = new Rand(hashSeed(k.seed, 40, i));
    const x0 = er.range(0, W);
    const y0 = k.edge(x0) + er.range(6, 60) * s;
    const len = er.range(40, 110) * s;
    const dir = er.range(-0.5, 0.5);
    if (!k.seen(x0 - len, y0 - 10 * s, x0 + len, y0 + len)) continue;
    const pts: Array<[number, number]> = [[x0, y0]];
    let a = Math.PI / 2 + dir * 0.9;
    for (let j = 1; j <= 9; j++) {
      a += er.range(-0.35, 0.35);
      const last = pts[j - 1]!;
      pts.push([last[0] + Math.cos(a) * (len / 9), last[1] + Math.sin(a) * (len / 9) * 0.8]);
    }
    for (let j = 0; j < pts.length - 1; j++) {
      const t = j / (pts.length - 1);
      const wd = (2.2 - 1.6 * t) * s;
      ctx.strokeStyle = col([94, 60, 36], 0.16 * (1 - t * 0.6));
      ctx.lineWidth = wd;
      ctx.beginPath();
      ctx.moveTo(pts[j]![0], pts[j]![1]);
      ctx.lineTo(pts[j + 1]![0], pts[j + 1]![1]);
      ctx.stroke();
      ctx.strokeStyle = col([238, 214, 170], 0.14 * (1 - t * 0.6));
      ctx.lineWidth = wd * 0.35;
      ctx.beginPath();
      ctx.moveTo(pts[j]![0] + wd * 0.45, pts[j]![1] + wd * 0.5);
      ctx.lineTo(pts[j + 1]![0] + wd * 0.45, pts[j + 1]![1] + wd * 0.5);
      ctx.stroke();
    }
  }
  // stones: many small, a few large; scattered in loose groups, fewer where the labels sit
  const ns = Math.round(W / (13 * s));
  for (let i = 0; i < ns; i++) {
    const er = new Rand(hashSeed(k.seed, 50, i));
    const x = er.range(0, W);
    const y = k.edge(x) + 12 * s + Math.pow(er.next(), 1.15) * (H - k.edge(x) - 14 * s);
    const big = er.chance(0.1);
    let r = (big ? er.range(3, 5.4) : Math.pow(er.next(), 1.5) * 2.4 + 1.0) * s;
    if (y > H - 120) r = Math.min(r, 1.7 * s);
    const group = er.chance(0.3) ? er.int(2, 4) : 1;
    for (let j = 0; j < group; j++) {
      const gx = x + (j === 0 ? 0 : er.range(-1, 1) * 7 * s);
      const gy2 = y + (j === 0 ? 0 : er.range(-0.6, 0.6) * 5 * s);
      const rr = j === 0 ? r : r * er.range(0.4, 0.85);
      if (k.seen(gx - rr * 2, gy2 - rr * 2, gx + rr * 2, gy2 + rr * 2)) stone(ctx, gx, gy2, rr, new Rand(hashSeed(k.seed, 51 + j, i)), s);
    }
  }
  // fine pale root hairs and rootlets hanging from the turf into the topsoil (quieter than the trees' roots)
  const nh = Math.round(W / (7 * s));
  for (let i = 0; i < nh; i++) {
    const er = new Rand(hashSeed(k.seed, 60, i));
    const x = er.range(0, W);
    const y = k.edge(x) - er.range(1, 5) * s;
    const len = er.range(4, 20) * s * (er.chance(0.2) ? 1.6 : 1);
    if (!k.seen(x - len, y, x + len, y + len * 1.2)) continue;
    rootHair(ctx, x, y, len, er, er.range(0.28, 0.5) * s, [236, 218, 178], er.range(0.28, 0.5));
  }
  const nr = Math.round(W / (46 * s));
  for (let i = 0; i < nr; i++) {
    const er = new Rand(hashSeed(k.seed, 61, i));
    const x = er.range(0, W);
    const y = k.edge(x) - 3 * s;
    const len = er.range(14, 40) * s;
    if (!k.seen(x - len, y, x + len, y + len * 1.2)) continue;
    rootHair(ctx, x, y, len, er, er.range(0.8, 1.3) * s, [150, 108, 66], 0.42);
    rootHair(ctx, x - 0.3 * s, y, len, er, er.range(0.35, 0.5) * s, [226, 200, 152], 0.3);
  }
  void tooth;
}

/**
 * The whole ground: soil, far meadow, grass, fence, clumps, flowers, turf edge. `fenceLm` keeps the fence's
 * thinnest strokes the width they have at the normal density.
 */
export function paintMeadowGround(ctx: C2, g: MeadowGeom, v: MeadowView, tooth: Tooth | null): void {
  const seed = g.seed ?? 31;
  const { W, gy, s } = g;
  const edgeRnd = new Rand(seed + 5);
  const ew = wavy(edgeRnd, 3 * s, [150 * s, 52 * s, 19 * s]);
  const k: Ctx = {
    g,
    v,
    seed,
    edge: (x) => gy + 15 * s + ew(x),
    seen: (x0, y0, x1, y1) => x1 >= v.x0 && x0 <= v.x1 && y1 >= v.y0 && y0 <= v.y1,
  };
  ctx.save();
  ctx.setTransform(v.scale, 0, 0, v.scale, -v.x0 * v.scale, -v.y0 * v.scale);
  ctx.beginPath();
  ctx.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  ctx.clip();
  const posts = fencePostXs(W, gy, s, 61, g.trees);

  paintSoil(ctx, k, tooth);
  paintFar(ctx, k);
  paintGrassWash(ctx, k);
  paintBladeCarpet(ctx, k);
  paintFenceShadow(ctx, k, posts);
  const back: Row = { name: 0, y0: gy - 9 * s, y1: gy - 3 * s, hMin: 6, hMax: 13, step: [5, 12], wscale: 0.9, pal: GRASS_PAL_BACK, shade: 0.7 };
  const mid: Row = { name: 1, y0: gy - 3 * s, y1: gy + 7 * s, hMin: 4.5, hMax: 10, step: [5.5, 13], wscale: 1, pal: GRASS_PAL, shade: 1 };
  const front: Row = { name: 2, y0: gy + 7 * s, y1: gy + 15 * s, hMin: 3, hMax: 6.5, step: [4.5, 10], wscale: 1.15, pal: GRASS_PAL, shade: 1.1 };
  back.hMin *= s;
  back.hMax *= s;
  mid.hMin *= s;
  mid.hMax *= s;
  front.hMin *= s;
  front.hMax *= s;
  paintClumps(ctx, k, back, posts);
  paintSeedHeads(ctx, k);
  paintFence(ctx, W, gy, s, 61, g.trees, 0.2);
  paintClumps(ctx, k, mid, posts);
  paintFlowers(ctx, k);
  paintClumps(ctx, k, front, posts);
  paintTurfEdge(ctx, k);

  // the paper's tooth over the whole ground (only where there is paint: source-atop)
  if (tooth) {
    ctx.globalCompositeOperation = 'source-atop';
    const k1 = 1 / g.dpr;
    const pat = ctx.createPattern(tooth.tile, 'repeat')!;
    pat.setTransform(new DOMMatrix().scale(k1 * (512 / tooth.size)));
    ctx.fillStyle = pat;
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Turn the paper tile into a pit-and-peak overlay (one readback of a small tile, once). */
export function makeTooth(tile: CanvasImageSource, gain = 0.055): Tooth {
  const size = 256;
  const src = document.createElement('canvas');
  src.width = size;
  src.height = size;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(tile, 0, 0, size, size);
  const d = sctx.getImageData(0, 0, size, size).data;
  const n = size * size;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += d[i * 4]! * 0.3 + d[i * 4 + 1]! * 0.59 + d[i * 4 + 2]! * 0.11;
  mean /= n;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const out = cx.createImageData(size, size);
  for (let i = 0; i < n; i++) {
    const dv = mean - (d[i * 4]! * 0.3 + d[i * 4 + 1]! * 0.59 + d[i * 4 + 2]! * 0.11);
    const dark = dv > 0;
    out.data[i * 4] = dark ? 70 : 255;
    out.data[i * 4 + 1] = dark ? 46 : 248;
    out.data[i * 4 + 2] = dark ? 28 : 224;
    out.data[i * 4 + 3] = clamp(Math.abs(dv) * gain * 25.5, 0, 110);
  }
  cx.putImageData(out, 0, 0);
  return { tile: cv, size };
}
