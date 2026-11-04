/**
 * The ground, painted as Brick's (brick/scene/ground.ts) in late-summer colours: one meadow from the farm's
 * boundary hedge to the bottom of the picture, a soft graded wash (sunlit straw and olive at the back, a deeper,
 * drier green toward us), wet-in-wet blooms of straw, olive, a deep summer green and a cool sage, dry-brush strokes
 * laid along its perspective, the paper's tooth over all, and long grass in clumps, gone to seed.
 * - The pickers' two plots: grass mown short and still green between the rows, the mower's passes in paler and
 *   deeper bands, each row of slots a faint line of longer grass left uncut (where the trees will stand).
 * - The path along the front of both orchards to the farmer's tree, worn into the grass: bare dry earth down the
 *   middle, flattened grass either side, the grass creeping back over its edges; at each outer corner it opens into
 *   a trodden patch round the crates.
 * - The farm track along the very front: dusty earth with two dry ruts and a grassy crown between them.
 * - The old tree's shade: a dappled pool of cool shadow thrown long to the lower right over the grass and the path.
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, blobPoly, bloom, brushBand, grassTuft, paperTooth, type Pt } from '../../river/scene/paint';
import { CRATES, FARM_TREE, PATH, ROW_Y, SLOTS, TRACK, WORLD } from './geom';
import { PICKERS, type PickerId } from '../types';

export interface GroundView {
  x0: number;
  x1: number;
  y1: number;
}

/** the farm's boundary hedge behind the orchards: the meadow starts here */
export const HEDGE_Y = 326;

/** each picker's plot of mown grass (world rect) */
export const PLOT: Record<PickerId, { x0: number; x1: number; y0: number; y1: number }> = (() => {
  const xs = SLOTS.a.map((p) => p.x);
  const a = { x0: Math.min(...xs) - 38, x1: Math.max(...xs) + 24, y0: ROW_Y[0] - 10, y1: ROW_Y[ROW_Y.length - 1] + 16 };
  return { a, b: { x0: WORLD.width - a.x1, x1: WORLD.width - a.x0, y0: a.y0, y1: a.y1 } };
})();

/** the worn path's centre line (it wanders a little) and its half width */
export const pathY = (x: number): number => (PATH.y0 + PATH.y1) / 2 + 2.2 * Math.sin(x / 83 + 0.6) + 1.2 * Math.sin(x / 31);
const PATH_HALF = 7.5;
/** how far along x the path runs (its ends turn down to the crates) */
const PATH_X0 = CRATES.a.x + 20;
const PATH_X1 = CRATES.b.x - 20;

/** the trodden patch round each picker's crates and seat */
const yard = (id: PickerId) => ({ cx: id === 'a' ? CRATES.a.x + 30 : CRATES.b.x - 30, cy: CRATES.a.y + 4, rx: 58, ry: 15 });

/** the track's two ruts */
const RUTS = [TRACK.y0 + 13, TRACK.y1 - 12];

export const GRASS = ['#B4B866', '#7E8E46', '#C8C27A', '#96A052', '#6E7E40', '#D2C882'];
const MOWN = ['#B4BE74', '#9CAA62', '#C4C882', '#A8B26A'];

/* ------------------------------------------------------------------ where things are */

let edgeNoise: ((x: number, y: number) => number) | null = null;
/** is a point in a plot's mown grass? Its edge is ragged (the mower went round it by eye), never a ruled line */
function inPlot(x: number, y: number, pad = 0): PickerId | null {
  edgeNoise ??= makeNoise2D(7331);
  const m = (edgeNoise(x * 0.045, y * 0.06) - 0.5) * 30;
  for (const id of PICKERS) {
    const P = PLOT[id];
    if (x > P.x0 - pad + m && x < P.x1 + pad - m && y > P.y0 - pad + m * 0.35 && y < P.y1 + pad - m * 0.35) return id;
  }
  return null;
}

function onPath(x: number, y: number, pad = 0): boolean {
  if (x > PATH_X0 - 6 && x < PATH_X1 + 6 && Math.abs(y - pathY(x)) < PATH_HALF + pad) return true;
  for (const id of PICKERS) {
    const Y = yard(id);
    if (((x - Y.cx) / (Y.rx + pad)) ** 2 + ((y - Y.cy) / (Y.ry + pad)) ** 2 < 0.85) return true;
  }
  return false;
}

/** is a point on bare earth (the path, a yard or the track)? (tufts and flowers keep off it) */
export function onEarth(x: number, y: number, pad = 0): boolean {
  if (y > TRACK.y0 - 1 - pad && y < TRACK.y1 + 1 + pad) return true;
  return onPath(x, y, pad);
}

/** may tall grass and flowers grow here (not on the earth, not in the mown plots, not round the old tree's foot)? */
export function wild(x: number, y: number): boolean {
  if (onEarth(x, y, 2) || inPlot(x, y, 2)) return false;
  return ((x - FARM_TREE.x) / 26) ** 2 + ((y - FARM_TREE.y) / 7) ** 2 > 1;
}

/** the path's two edges as runs of points, left to right */
function pathEdges(): { top: Pt[]; bot: Pt[] } {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = PATH_X0; x <= PATH_X1; x += 8) {
    const w = PATH_HALF * (0.85 + 0.15 * Math.sin(x / 41));
    top.push([x, pathY(x) - w]);
    bot.push([x, pathY(x) + w]);
  }
  return { top, bot };
}

/* ------------------------------------------------------------------ the meadow */

export function paintMeadow(ctx: CanvasRenderingContext2D, rnd: Rand, v: GroundView, gd: number): void {
  const y0 = HEDGE_Y - 4;
  const y1 = v.y1 + 10;
  const H = y1 - y0;
  const area = clamp(((v.x1 - v.x0) * H) / (1080 * 300), 0.5, 3);
  const stop = (y: number) => clamp((y - y0) / H, 0, 1);
  // the base wash, graded from the sunlit straw-olive at the back to a deeper, drier green toward us, soft at every edge
  const soft = new SoftLayer(v.x0, y0, v.x1 - v.x0, H, 0.5);
  const g = soft.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(222,214,148,0.74)');
  g.addColorStop(stop(420), 'rgba(204,204,130,0.8)');
  g.addColorStop(stop(PATH.y1), 'rgba(188,194,114,0.86)');
  g.addColorStop(stop(TRACK.y1), 'rgba(174,182,100,0.9)');
  g.addColorStop(1, 'rgba(158,170,90,0.92)');
  soft.ctx.fillStyle = g;
  soft.ctx.fillRect(v.x0, y0, v.x1 - v.x0, H);
  const bl = (n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], pw = 0.9) => {
    for (let i = 0; i < n * area; i++) {
      const y = y0 + H * Math.pow(rnd.next(), pw);
      const k = 0.55 + (y - y0) / 280;
      bloom(soft.ctx, rnd.range(v.x0, v.x1), y, rnd.range(rx[0], rx[1]) * k, rnd.range(ry[0], ry[1]) * k, rnd.pick(cols), a, rnd, 4);
    }
  };
  // wet in wet: sunlit straw, olive, deeper summer green in the hollows, a cool sage, a warm ochre where it is driest
  bl(40, ['#E6D896', '#DCD086', '#EEE0A6'], 0.34, [50, 140], [8, 20]);
  bl(30, ['#AEB466', '#A2AC5C', '#BABE70'], 0.3, [40, 120], [7, 18]);
  bl(22, ['#7E9048', '#86964E', '#728642'], 0.26, [40, 110], [6, 16], 0.7);
  bl(10, ['#A0AC94', '#AAB49A', '#96A48E'], 0.18, [50, 130], [6, 14], 1.2);
  bl(12, ['#DEBC76', '#E6C886'], 0.22, [30, 90], [5, 12]);
  // the earth is left out of the grass wash (its edge soft, as the layer is), so it keeps its own colour
  soft.ctx.globalCompositeOperation = 'destination-out';
  soft.ctx.fillStyle = 'rgba(0,0,0,0.85)';
  traceEarth(soft.ctx);
  soft.ctx.globalCompositeOperation = 'source-over';
  soft.draw(ctx, 1, 'multiply');

  // dry-brush strokes laid across the grass along its perspective, longer and wider toward us
  const cols = ['#B4B868', '#94A052', '#CEC882', '#7C8C48', '#C0BC72', '#A2A85A'];
  for (let i = 0, n = Math.round(130 * area); i < n; i++) {
    const y = y0 + 8 + (H - 8) * Math.pow(rnd.next(), 0.85);
    if (y > TRACK.y0 - 2 && y < TRACK.y1 + 2) continue;
    const k = 0.5 + (y - y0) / 260;
    const len = rnd.range(60, 200) * k;
    const x = rnd.range(v.x0 - 40, v.x1);
    const bow = rnd.range(-2, 2) * k;
    const pts: Pt[] = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      pts.push([x + len * t, y + bow * Math.sin(t * Math.PI) + 0.8 * k * Math.sin(t * 6 + i)]);
    }
    const dark = rnd.chance(0.55);
    ctx.globalCompositeOperation = dark ? 'multiply' : 'source-over';
    brushBand(ctx, pts, (t) => rnd.range(0.9, 1.1) * (2 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * k, rnd.pick(cols), dark ? 0.11 : 0.09, rnd, { layers: 2, bristles: 3, bristleAlpha: dark ? 0.09 : 0.07, amp: 0.05 });
  }
  ctx.globalCompositeOperation = 'source-over';

  // the paper's tooth over the whole meadow
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x0, y0, v.x1 - v.x0, H);
  ctx.clip();
  applyTooth(ctx, paperTooth('#5E6430', 160, 439), v.x0, y0, v.x1 - v.x0, H, gd * 1.4, 0, 0.16);
  ctx.restore();
}

/** fill the earth's shapes (the path, the yards, the track), drawn a little inside their edges */
function traceEarth(c: CanvasRenderingContext2D): void {
  c.fillRect(-2000, TRACK.y0 + 2, 5000, TRACK.y1 - TRACK.y0 - 4);
  const { top, bot } = pathEdges();
  c.beginPath();
  for (const [x, y] of top) c.lineTo(x, y + 1.5);
  for (const [x, y] of [...bot].reverse()) c.lineTo(x, y - 1.5);
  c.fill();
  for (const id of PICKERS) {
    const Y = yard(id);
    c.beginPath();
    c.ellipse(Y.cx, Y.cy, Y.rx * 0.9, Y.ry * 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** long grass in clumps over the wild parts of the meadow, gone to seed, bigger toward us */
export function paintLongGrass(ctx: CanvasRenderingContext2D, rnd: Rand, v: GroundView, y0: number, y1: number): void {
  const area = clamp(((v.x1 - v.x0) * (y1 - y0)) / (1080 * 300), 0.2, 3);
  const noise = makeNoise2D(5171);
  for (let i = 0, n = Math.round(1700 * area); i < n; i++) {
    const y = y0 + (y1 - y0) * Math.pow(rnd.next(), 0.9);
    const x = rnd.range(v.x0, v.x1);
    if (noise(x * 0.014, y * 0.024) < 0.34 && rnd.chance(0.6)) continue;
    if (!wild(x, y)) continue;
    const k = 0.45 + (y - HEDGE_Y) / 230;
    grassTuft(ctx, x, y, rnd.range(2.6, 6.4) * k, rnd, 0.8 * k, GRASS);
    // seed heads standing up out of the tuft: a fine stem, a nodding head of straw
    if (rnd.chance(0.35)) seedHead(ctx, rnd, x + rnd.range(-1, 1) * k, y, rnd.range(7, 12) * k);
  }
}

/** a grass stem gone to seed: a fine bent stem and a loose plume of oat-like spikelets, straw in the sun */
export function seedHead(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const lean = rnd.range(-0.25, 0.4) * h;
  const tx = x + lean;
  const ty = y - h;
  ctx.strokeStyle = rgba(rnd.pick(['#A6A060', '#B8AC6A', '#8E9050']), 0.7);
  ctx.lineWidth = Math.max(0.2, h * 0.025);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.2, y - h * 0.6, tx, ty);
  ctx.stroke();
  const n = 3 + Math.round(h / 4);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const px = tx - lean * 0.08 * t + rnd.range(-0.6, 0.6) * h * 0.05;
    const py = ty + t * h * 0.32;
    ctx.fillStyle = rgba(rnd.pick(['#E6D496', '#D8C47E', '#F0E2AA', '#C8B070']), 0.8);
    ctx.beginPath();
    ctx.ellipse(px + (k % 2 ? 1 : -1) * h * 0.045, py, h * 0.03 + 0.15, h * 0.06 + 0.2, (k % 2 ? 0.5 : -0.5) + lean * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ the pickers' plots */

export function paintPlots(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  for (const id of PICKERS) {
    const P = PLOT[id];
    const W = P.x1 - P.x0;
    const H = P.y1 - P.y0;
    // the mown grass: late-summer pale, a little straw-coloured and only a breath greener than the long meadow,
    // laid as a few light, even blooms over the plot's ragged shape, very soft, so it melts into the long grass
    const soft = new SoftLayer(P.x0 - 40, P.y0 - 30, W + 80, H + 60, 0.25);
    for (let y = P.y0 - 4; y < P.y1 + 4; y += 14) {
      for (let x = P.x0 - 10; x < P.x1 + 10; x += 30) {
        const px = x + rnd.range(-8, 8);
        const py = y + rnd.range(-3, 3);
        if (inPlot(px, py) !== id) continue;
        bloom(soft.ctx, px, py, rnd.range(26, 38), rnd.range(9, 13), rnd.pick(['#D2D898', '#CAD290', '#D8D8A0']), 0.14, rnd, 2);
      }
    }
    soft.draw(ctx, 1, 'multiply');
    // the mower's passes: bands along the rows, alternately paler (mown away from us, the blades catching the
    // light) and deeper (mown toward us)
    // (not clipped: each pass fades in and out at its ends, so the plot has no ruled edge)
    const fade = (t: number) => Math.min(1, t * 7, (1 - t) * 7);
    ctx.save();
    for (let y = P.y0 + 2, k = 0; y < P.y1; k++) {
      const h = 4.5 + (y - P.y0) * 0.05;
      const pts: Pt[] = [];
      const xa = P.x0 + rnd.range(-6, 22);
      const xb = P.x1 - rnd.range(-6, 22);
      for (let x = xa; x <= xb; x += 12) pts.push([x, y + h / 2 + Math.sin(x / 47 + k) * 0.5]);
      const pale = k % 2 === 0;
      ctx.globalCompositeOperation = pale ? 'source-over' : 'multiply';
      brushBand(ctx, pts, (t) => h * rnd.range(0.85, 1.05) * fade(t), pale ? '#EEECC0' : '#A8B468', pale ? 0.06 : 0.04, rnd, { layers: 2, bristles: 4, bristleAlpha: pale ? 0.1 : 0.12, amp: 0.02 });
      y += h;
    }
    ctx.globalCompositeOperation = 'source-over';
    // the rows of slots: a faint line of grass left a little longer where the trees will stand
    for (const ry of ROW_Y) {
      const pts: Pt[] = [];
      for (let x = P.x0 + 4; x <= P.x1 - 4; x += 10) pts.push([x, ry + Math.sin(x / 33 + ry) * 0.4]);
      const k = 0.6 + (ry - HEDGE_Y) / 300;
      ctx.globalCompositeOperation = 'multiply';
      brushBand(ctx, pts, (t) => 2.2 * k * fade(t), '#8E9E58', 0.14, rnd, { layers: 2, bristles: 3, bristleAlpha: 0.1, amp: 0.03 });
      ctx.globalCompositeOperation = 'source-over';
      for (let x = P.x0 + 6; x < P.x1 - 4; x += rnd.range(3, 7)) if (inPlot(x, ry) === id) grassTuft(ctx, x, ry + rnd.range(-0.6, 1), rnd.range(1.6, 3) * k, rnd, 0.6 * k, MOWN);
    }
    // the mown grass, short tufts here and there and a few clover heads
    for (let i = 0; i < 260; i++) {
      const x = rnd.range(P.x0, P.x1);
      const y = rnd.range(P.y0, P.y1);
      if (inPlot(x, y) !== id) continue;
      const k = 0.55 + (y - HEDGE_Y) / 300;
      grassTuft(ctx, x, y, rnd.range(1.2, 2.4) * k, rnd, 0.5 * k, MOWN);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd.range(P.x0, P.x1);
      const y = rnd.range(P.y0, P.y1);
      if (inPlot(x, y) !== id) continue;
      ctx.fillStyle = rgba(rnd.pick(['#F4F0E2', '#E8C8D0']), 0.7);
      ctx.beginPath();
      ctx.arc(x, y - 0.6, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // (no fringe is drawn round it: the long grass of the meadow stops at its ragged edge on its own)
  }
}

/** grass growing back in over an edge (a run of points), the tufts leaning out over it */
function grassEdge(ctx: CanvasRenderingContext2D, rnd: Rand, pts: Pt[], size: number, every: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += rnd.range(every * 0.5, every * 1.5)) {
      const t = d / len;
      const k = 0.6 + ((ay + by) / 2 - HEDGE_Y) / 280;
      grassTuft(ctx, ax + (bx - ax) * t + rnd.range(-1.5, 1.5), ay + (by - ay) * t + rnd.range(-1, 1.5), rnd.range(0.6, 1.2) * size * k, rnd, 0.8 * k, GRASS);
    }
  }
}

/* ------------------------------------------------------------------ earth */

const EARTH = ['#E6D2A6', '#DAC296', '#CCB084', '#BC9C76', '#AA9482'];

/** a patch of dry earth as a watercolor: soft wash, blooms, streaks, grain, a few pebbles */
function earth(ctx: CanvasRenderingContext2D, rnd: Rand, poly: number[], a: number, pebbles: number): void {
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    bx0 = Math.min(bx0, poly[i]!);
    bx1 = Math.max(bx1, poly[i]!);
    by0 = Math.min(by0, poly[i + 1]!);
    by1 = Math.max(by1, poly[i + 1]!);
  }
  const pad = 6;
  const W = bx1 - bx0;
  const H = by1 - by0;
  // the ground wash and the blooms in it, soft: the earth bleeds into the grass at its edge
  const soft = new SoftLayer(bx0 - pad, by0 - pad, W + pad * 2, H + pad * 2, 0.7);
  const s = soft.ctx;
  s.fillStyle = rgba(EARTH[0]!, a);
  tracePoly(s, deform(poly, rnd, 2, 0.01));
  s.fill();
  s.save();
  tracePoly(s, poly);
  s.clip();
  const n = Math.max(4, Math.round((W * H) / 900));
  for (let i = 0; i < n; i++) bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), rnd.range(18, 60), rnd.range(3, 8), rnd.pick(EARTH.slice(1)), 0.3, rnd, 4);
  // a cool grey-violet where the dust lies in shade, a warm light where it is sunlit and dry
  for (let i = 0; i < n * 0.25; i++) bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), rnd.range(10, 30), rnd.range(3, 7), '#A49AA6', 0.16, rnd, 3);
  for (let i = 0; i < n * 0.35; i++) bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), rnd.range(10, 30), rnd.range(3, 7), '#F6E8C4', 0.34, rnd, 3);
  s.restore();
  soft.draw(ctx, 1, 'source-over');

  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // streaks dragged along the way (dry brush), lighter and darker
  const m = Math.max(3, Math.round((W * H) / 500));
  for (let i = 0; i < m; i++) {
    const y = rnd.range(by0, by1);
    const x = rnd.range(bx0 - 20, bx1);
    const len = rnd.range(30, 110);
    const pts: Pt[] = [];
    for (let j = 0; j <= 8; j++) pts.push([x + (len * j) / 8, y + Math.sin(j + i) * 0.4]);
    const dark = rnd.chance(0.45);
    brushBand(ctx, pts, () => rnd.range(0.8, 1.8), dark ? EARTH[3]! : '#F8ECD0', dark ? 0.13 : 0.2, rnd, { layers: 1, bristles: 2, bristleAlpha: 0.1, amp: 0.05 });
  }
  // the grain settles in the paper's tooth (earth pigments granulate)
  applyTooth(ctx, paperTooth('#8A6E54', 160, 461), bx0, by0, W, H, Math.max(1, ctx.getTransform().a * 1.3), 0.1, 0.22);
  ctx.restore();

  // pebbles: a lit top, a shaded underside
  for (let i = 0, k = Math.round(((W * H) / 1000) * pebbles); i < k; i++) {
    const x = rnd.range(bx0, bx1);
    const y = rnd.range(by0, by1);
    if (!inside(poly, x, y)) continue;
    const r = rnd.range(0.5, 1.3) * (0.7 + (y - HEDGE_Y) / 300);
    ctx.fillStyle = rgba(rnd.pick(['#A89C8C', '#B8AC98', '#8E8478', '#C2B49C']), 0.7);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,232,0.5)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.2, r * 0.45, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,64,52,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.45, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** even-odd point in polygon */
function inside(poly: number[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!;
    const yi = poly[i + 1]!;
    const xj = poly[j]!;
    const yj = poly[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* ------------------------------------------------------------------ the path and the yards */

export function paintPath(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // the trodden patches round the crates first (the path runs into them)
  for (const id of PICKERS) {
    const Y = yard(id);
    const poly = deform(blobPoly(Y.cx, Y.cy, Y.rx, Y.ry, rnd, 26, 0.1), rnd, 3, 0.04);
    // flattened grass round it, then the bare earth
    const soft = new SoftLayer(Y.cx - Y.rx - 16, Y.cy - Y.ry - 10, Y.rx * 2 + 32, Y.ry * 2 + 20, 0.7);
    bloom(soft.ctx, Y.cx, Y.cy, Y.rx * 1.12, Y.ry * 1.3, '#D8CE94', 0.4, rnd, 5);
    soft.draw(ctx, 1, 'source-over');
    earth(ctx, rnd, poly, 0.6, 0.8);
    // boot prints
    for (let k = 0; k < 30; k++) {
      ctx.fillStyle = rgba('#7A5E42', rnd.range(0.05, 0.12));
      ctx.beginPath();
      ctx.ellipse(rnd.range(Y.cx - Y.rx * 0.8, Y.cx + Y.rx * 0.8), rnd.range(Y.cy - Y.ry * 0.6, Y.cy + Y.ry * 0.6), rnd.range(1, 2), rnd.range(0.4, 0.7), rnd.range(-0.4, 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const { top, bot } = pathEdges();
  // the flattened grass either side of the worn line: paler, straw-coloured, soft
  const soft = new SoftLayer(PATH_X0 - 20, PATH.y0 - 14, PATH_X1 - PATH_X0 + 40, PATH.y1 - PATH.y0 + 28, 0.6);
  for (let x = PATH_X0; x < PATH_X1; x += 26) bloom(soft.ctx, x + rnd.range(0, 20), pathY(x) + rnd.range(-1, 1), rnd.range(26, 44), PATH_HALF * 1.9, '#E0D49A', 0.36, rnd, 4);
  soft.draw(ctx, 1, 'source-over');
  // the bare earth down the middle
  const poly = [...top.flat(), ...[...bot].reverse().flat()];
  earth(ctx, rnd, poly, 0.62, 0.5);
  // worn paler in the middle where the boots go
  const mid: Pt[] = top.map(([x, y], i) => [x, (y + bot[i]![1]) / 2 + 0.6]);
  brushBand(ctx, mid, () => PATH_HALF * 0.8, '#FAF0D6', 0.2, rnd, { layers: 2, amp: 0.04 });
  // the edges grassing over, fuller on the near side
  grassEdge(ctx, rnd, top.map(([x, y]) => [x, y + 1] as Pt), 3, 5);
  grassEdge(ctx, rnd, bot.map(([x, y]) => [x, y + 1.6] as Pt), 3.6, 5);
}

/* ------------------------------------------------------------------ the track */

export function paintTrack(ctx: CanvasRenderingContext2D, rnd: Rand, v: GroundView): void {
  const y0 = TRACK.y0;
  const y1 = TRACK.y1;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = v.x0; x <= v.x1 + 10; x += 10) {
    top.push([x, y0 + Math.sin(x / 61) * 1.5 + rnd.range(-0.5, 0.5)]);
    bot.push([x, y1 + Math.sin(x / 47 + 1) * 1.8 + rnd.range(-0.5, 0.5)]);
  }
  const poly = [...top.flat(), ...[...bot].reverse().flat()];
  earth(ctx, rnd, poly, 0.78, 1.1);
  // the far edge in the verge's shade (the light falls from the upper left)
  const sh = new SoftLayer(v.x0, y0 - 4, v.x1 - v.x0, 16, 0.5);
  for (let x = v.x0; x < v.x1; x += 60) bloom(sh.ctx, x + rnd.range(0, 40), y0 + 2, rnd.range(40, 70), 4, '#8A7C8A', 0.28, rnd, 3);
  sh.draw(ctx, 1, 'multiply');
  // the grassy crown between the ruts, broken where the wheels have worn it, gone straw-coloured in the dry
  const crownY = (RUTS[0]! + RUTS[1]!) / 2;
  for (let x = v.x0; x < v.x1; ) {
    const len = rnd.range(30, 110);
    const pts: Pt[] = [];
    for (let j = 0; j <= 8; j++) pts.push([x + (len * j) / 8, crownY + Math.sin(j * 0.8 + x) * 0.8]);
    brushBand(ctx, pts, (t) => (2.5 + 2 * Math.sin(Math.PI * t)) * rnd.range(0.8, 1.2), rnd.pick(['#B8B870', '#C6C07C', '#A8AE66']), 0.32, rnd, { layers: 2, bristles: 2, bristleAlpha: 0.15, amp: 0.06 });
    for (let d = 0; d < len; d += rnd.range(5, 12)) grassTuft(ctx, x + d, crownY + rnd.range(-1.2, 1.5), rnd.range(2.2, 4.2), rnd, 0.7, GRASS);
    x += len + rnd.range(20, 80);
  }
  // the ruts: dry, a shadowed bottom and a lit lip on their far side
  for (const ry of RUTS) {
    const pts: Pt[] = [];
    for (let x = v.x0; x <= v.x1; x += 6) pts.push([x, ry + Math.sin(x / 37) * 1.1 + Math.sin(x / 11 + ry) * 0.4 + rnd.range(-0.3, 0.3)]);
    let i = 0;
    while (i < pts.length - 2) {
      const j = Math.min(pts.length - 1, i + rnd.int(4, 14));
      const seg = pts.slice(i, j + 1);
      const a = rnd.range(0.5, 1);
      ctx.globalCompositeOperation = 'multiply';
      brushBand(ctx, seg, () => 3 * rnd.range(0.7, 1.2), rnd.pick(['#B09276', '#A68A70', '#B89C80']), 0.3 * a, rnd, { layers: 2, bristles: 2, bristleColor: '#86684E', bristleAlpha: 0.14 * a, amp: 0.04 });
      ctx.globalCompositeOperation = 'source-over';
      if (rnd.chance(0.7)) brushBand(ctx, seg.map(([x, y]) => [x, y - 2] as Pt), () => 0.9, '#FFF4DC', 0.22 * a, rnd, { layers: 1, amp: 0.04 });
      i = j + rnd.int(1, 5);
    }
  }
  // the edges grassing over: a ragged fringe on both sides, fuller on the near side
  grassEdge(ctx, rnd, top.map(([x, y]) => [x, y + 1] as Pt), 3.4, 5);
  grassEdge(ctx, rnd, bot.map(([x, y]) => [x, y + 1.5] as Pt), 4.8, 5);
}

/* ------------------------------------------------------------------ the old tree's shade */

/** the old tree's shade thrown long to the lower right: a cool pool, dappled with sun coming through the leaves */
export function paintTreeShade(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const cx = FARM_TREE.x + 56;
  const cy = FARM_TREE.y + 10;
  const soft = new SoftLayer(cx - 260, cy - 40, 520, 80, 0.7);
  bloom(soft.ctx, cx, cy, 196, 20, '#6E6C8A', 0.4, rnd, 6);
  bloom(soft.ctx, cx - 40, cy - 2, 110, 12, '#5E6078', 0.26, rnd, 4);
  // the sun coming through the gaps in the crown: soft spots lifted out of the shade
  soft.ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = Math.sqrt(rnd.next());
    bloom(soft.ctx, cx + Math.cos(a) * 170 * d, cy + Math.sin(a) * 15 * d, rnd.range(4, 10), rnd.range(1.4, 2.6), '#000000', 0.7, rnd, 3);
  }
  soft.ctx.globalCompositeOperation = 'source-over';
  soft.draw(ctx, 1, 'multiply');
  // darkest close round the trunk's foot
  const g = ctx.createRadialGradient(FARM_TREE.x + 8, FARM_TREE.y + 2, 0, FARM_TREE.x + 8, FARM_TREE.y + 2, 40);
  g.addColorStop(0, 'rgba(70,64,80,0.3)');
  g.addColorStop(1, 'rgba(70,64,80,0)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(FARM_TREE.x + 8, FARM_TREE.y + 2, 40, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
