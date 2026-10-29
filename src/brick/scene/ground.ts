/**
 * The ground, painted as the vine's lawn is (vine/scene/groundLawn.ts), in spring colours: one meadow from the hedge
 * to the bottom of the picture, a soft graded wash (pale and sunlit at the back, a richer green toward us), wet-in-wet
 * blooms of lime, fresh and deep green with a cool sage here and there, dry-brush strokes laid along its perspective,
 * the paper's tooth over all, clumps of tufts, daisies and the odd dandelion.
 * The earth (the lane, the road down from the village, the trodden yards in front of the houses and the paths from
 * the gates) is laid the same way: a soft wash of granulating earth colours that bleeds into the grass at its edge,
 * wet-in-wet blooms of sienna, umber and a grey-violet, streaks dragged along its length, the grain settling in the
 * paper, pebbles, and grass creeping back in over the edges. The lane has damp ruts with a grassy crown between them,
 * and puddles holding the sky.
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, blobPoly, bloom, brushBand, grassTuft, paperTooth, type Pt } from '../../river/scene/paint';
import { ribbon } from '../../river/scene/boatInk';
import { FENCE_Y, GATE, GROUND_Y, HEDGE_Y, HOUSE, JUNCTION, LANE, ROAD_FAR } from './geom';
import { LOANS, type LoanId } from '../types';

export interface GroundView {
  x0: number;
  x1: number;
  y1: number;
}

/** half the road's width at depth y (it widens toward us) */
export const roadHalf = (y: number): number => 7 + (y - ROAD_FAR.y) * 0.1;
/** the road's centre line at depth y (it wanders a little) */
const roadX = (y: number): number => ROAD_FAR.x + Math.sin(y / 23) * 1.2;

/** the two ruts along the lane (the carts' wheels run in them) */
export const CART_RUT_A = 568;
export const CART_RUT_B = 586;

const GRASS = ['#9DC25C', '#6E9A48', '#B6D26A', '#82AE4E', '#5E8A40', '#C4D878'];

/* ------------------------------------------------------------------ where the earth is */

/** the trodden yard in front of a house */
const yard = (id: LoanId) => {
  const W = HOUSE[id].wall;
  return { cx: (W.x0 + W.x1) / 2, cy: GROUND_Y + 16, rx: (W.x1 - W.x0) / 2 + 30, ry: 20 };
};

/** the path from a house's door to its gate: left and right edges, top to bottom */
function gardenPath(id: LoanId): { l: Pt[]; r: Pt[] } {
  const door = HOUSE[id].door;
  const gate = GATE[id];
  const dx = (door.x0 + door.x1) / 2;
  const gx = (gate.x0 + gate.x1) / 2;
  const l: Pt[] = [];
  const r: Pt[] = [];
  const n = 10;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const y = GROUND_Y + 8 + (FENCE_Y - GROUND_Y - 8) * t;
    const x = dx + (gx - dx) * (t * t * (3 - 2 * t));
    l.push([x - 10 - t * 4, y]);
    r.push([x + 10 + t * 4, y]);
  }
  return { l, r };
}

/** is a point on earth (the lane, the road, a yard or a path)? (tufts and daisies keep off it) */
function onEarth(x: number, y: number): boolean {
  if (y > LANE.y0 - 1 && y < LANE.y1 + 1) return true;
  if (y > ROAD_FAR.y - 6 && y < JUNCTION.y && Math.abs(x - roadX(y)) < roadHalf(y) + 1) return true;
  for (const id of LOANS) {
    const Y = yard(id);
    if (((x - Y.cx) / Y.rx) ** 2 + ((y - Y.cy) / Y.ry) ** 2 < 0.85) return true;
    const p = gardenPath(id);
    if (y > p.l[0]![1] && y < p.l[p.l.length - 1]![1]) {
      const t = (y - p.l[0]![1]) / (p.l[p.l.length - 1]![1] - p.l[0]![1]);
      const i = Math.min(p.l.length - 2, Math.floor(t * (p.l.length - 1)));
      if (x > p.l[i]![0] && x < p.r[i]![0]) return true;
    }
  }
  return false;
}

/** fill the earth's shapes (the lane, the road, the yards and the paths), drawn a little inside their edges */
function traceEarth(c: CanvasRenderingContext2D): void {
  c.fillRect(-2000, LANE.y0 + 2, 5000, LANE.y1 - LANE.y0 - 4);
  c.beginPath();
  for (let y = ROAD_FAR.y; y <= JUNCTION.y; y += 6) c.lineTo(roadX(y) - roadHalf(y) + 1.5, y);
  for (let y = JUNCTION.y; y >= ROAD_FAR.y; y -= 6) c.lineTo(roadX(y) + roadHalf(y) - 1.5, y);
  c.fill();
  for (const id of LOANS) {
    const Y = yard(id);
    c.beginPath();
    c.ellipse(Y.cx, Y.cy, Y.rx * 0.92, Y.ry * 0.85, 0, 0, Math.PI * 2);
    c.fill();
    const p = gardenPath(id);
    c.beginPath();
    for (const [x, y] of p.l) c.lineTo(x + 1.5, y);
    for (const [x, y] of [...p.r].reverse()) c.lineTo(x - 1.5, y);
    c.fill();
  }
}

/** a wheel rut along a run of points: worn in stretches (darker and damp in its bottom, a lit lip beyond it), with gaps
 * where the grass and the gravel have closed over it */
function rut(ctx: CanvasRenderingContext2D, rnd: Rand, pts: Pt[], w: (t: number) => number, lip: Pt, depth = 1): void {
  const n = pts.length;
  let i = 0;
  while (i < n - 2) {
    const run = rnd.int(4, 14);
    const j = Math.min(n - 1, i + run);
    const seg = pts.slice(i, j + 1);
    const t = i / (n - 1);
    const a = rnd.range(0.55, 1) * depth;
    ctx.globalCompositeOperation = 'multiply';
    brushBand(ctx, seg, () => w(t) * rnd.range(0.7, 1.2), rnd.pick(['#A88C6E', '#9E8468', '#B0947A']), 0.34 * a, rnd, { layers: 2, bristles: 2, bristleColor: '#7E6450', bristleAlpha: 0.16 * a, amp: 0.04 });
    ctx.globalCompositeOperation = 'source-over';
    if (rnd.chance(0.7)) brushBand(ctx, seg.map(([x, y]) => [x + lip[0], y + lip[1]] as Pt), () => w(t) * 0.3, '#FFF4DC', 0.22 * a, rnd, { layers: 1, amp: 0.04 });
    i = j + rnd.int(1, 5);
  }
}

/* ------------------------------------------------------------------ the grass */

export function paintGrass(ctx: CanvasRenderingContext2D, rnd: Rand, v: GroundView, gd: number): void {
  const y0 = HEDGE_Y - 2;
  const y1 = v.y1 + 10;
  const H = y1 - y0;
  const area = clamp(((v.x1 - v.x0) * H) / (1080 * 260), 0.5, 3);
  const stop = (y: number) => clamp((y - y0) / H, 0, 1);
  // the base wash, graded from the sunlit back to a richer green toward us, soft (wet) at every edge
  const soft = new SoftLayer(v.x0, y0, v.x1 - v.x0, H, 0.5);
  const g = soft.ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(214,228,156,0.72)');
  g.addColorStop(stop(GROUND_Y), 'rgba(196,220,138,0.8)');
  g.addColorStop(stop(LANE.y0), 'rgba(176,208,118,0.86)');
  g.addColorStop(stop(LANE.y1 + 30), 'rgba(160,198,104,0.9)');
  g.addColorStop(1, 'rgba(140,186,92,0.92)');
  soft.ctx.fillStyle = g;
  soft.ctx.fillRect(v.x0, y0, v.x1 - v.x0, H);
  const bl = (n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], pw = 0.9) => {
    for (let i = 0; i < n * area; i++) {
      const y = y0 + H * Math.pow(rnd.next(), pw);
      const k = 0.55 + (y - y0) / 260;
      bloom(soft.ctx, rnd.range(v.x0, v.x1), y, rnd.range(rx[0], rx[1]) * k, rnd.range(ry[0], ry[1]) * k, rnd.pick(cols), a, rnd, 4);
    }
  };
  // wet in wet: sunlit lime, fresh green, deeper green in the hollows, a cool sage, a breath of buttercup gold
  bl(40, ['#DCE69C', '#D2E28E', '#E4EAA8'], 0.34, [50, 140], [8, 20]);
  bl(30, ['#A6CC6A', '#9AC462', '#B2D274'], 0.3, [40, 120], [7, 18]);
  bl(22, ['#7EA850', '#86B058', '#729E4A'], 0.26, [40, 110], [6, 16], 0.7);
  bl(10, ['#9CB49A', '#A8BCA0', '#94AE96'], 0.2, [50, 130], [6, 14], 1.2);
  bl(8, ['#E8DC8A', '#EEE29A'], 0.2, [30, 80], [5, 12]);
  // the earth is left out of the grass wash (its edge soft, as the layer is), so it keeps its own colour
  soft.ctx.globalCompositeOperation = 'destination-out';
  soft.ctx.fillStyle = 'rgba(0,0,0,0.88)';
  traceEarth(soft.ctx);
  soft.ctx.globalCompositeOperation = 'source-over';
  soft.draw(ctx, 1, 'multiply');

  // dry-brush strokes laid across the grass along its perspective, longer and wider toward us
  const cols = ['#A8C868', '#8CB456', '#C2D880', '#7AA44C', '#B4CE70', '#96BC5E'];
  for (let i = 0, n = Math.round(130 * area); i < n; i++) {
    const y = y0 + 8 + (H - 8) * Math.pow(rnd.next(), 0.85);
    if (y > LANE.y0 - 2 && y < LANE.y1 + 2) continue;
    const k = 0.5 + (y - y0) / 240;
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
  applyTooth(ctx, paperTooth('#4E6A30', 160, 433), v.x0, y0, v.x1 - v.x0, H, gd * 1.4, 0, 0.16);
  ctx.restore();

  // tufts in clumps, bigger toward us, off the earth
  const noise = makeNoise2D(5151);
  for (let i = 0, n = Math.round(1300 * area); i < n; i++) {
    const y = y0 + 6 + (H - 6) * Math.pow(rnd.next(), 0.9);
    const x = rnd.range(v.x0, v.x1);
    if (noise(x * 0.014, y * 0.024) < 0.36 && rnd.chance(0.65)) continue;
    if (onEarth(x, y)) continue;
    const k = 0.45 + (y - y0) / 220;
    grassTuft(ctx, x, y, rnd.range(2.2, 5.6) * k, rnd, 0.8 * k, GRASS);
  }
  // daisies in little colonies, and the odd dandelion
  const dn = makeNoise2D(6262);
  for (let i = 0, n = Math.round(900 * area); i < n; i++) {
    const y = y0 + 10 + (H - 10) * Math.pow(rnd.next(), 0.8);
    const x = rnd.range(v.x0, v.x1);
    if (dn(x * 0.02, y * 0.035) < 0.62 || onEarth(x, y)) continue;
    const r = 0.5 + (y - y0) / 260;
    if (rnd.chance(0.12)) {
      ctx.fillStyle = rgba(rnd.pick(['#F2CC3A', '#F6D84E']), 0.9);
      ctx.beginPath();
      ctx.arc(x, y - r, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = 'rgba(253,251,244,0.92)';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + rnd.next();
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.55, y - r + Math.sin(a) * r * 0.35, r * 0.45, r * 0.25, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(240,196,60,0.95)';
    ctx.beginPath();
    ctx.arc(x, y - r, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ earth */

interface EarthOpts {
  /** the earth's own colours, light to dark (the first is the ground wash) */
  cols: string[];
  /** strength of the ground wash */
  a: number;
  /** the streaks' direction: along x (a lane) or along y (a road) */
  along: 'x' | 'y';
  /** how many pebbles per 1000 square units */
  pebbles: number;
}

const EARTH = ['#E2CCA2', '#D6BC90', '#C9A97A', '#B89670', '#A8907E'];
const SAND = ['#E8D6B0', '#DCC6A0', '#CDB28A', '#BCA07C', '#A8988C'];

/** a patch of earth as a watercolor: soft wash, blooms, streaks, grain, pebbles (the caller adds the grass at its edge) */
function earth(ctx: CanvasRenderingContext2D, rnd: Rand, poly: number[], o: EarthOpts): void {
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
  s.fillStyle = rgba(o.cols[0]!, o.a);
  tracePoly(s, deform(poly, rnd, 2, 0.01));
  s.fill();
  s.save();
  tracePoly(s, poly);
  s.clip();
  const n = Math.max(4, Math.round((W * H) / 900));
  for (let i = 0; i < n; i++) {
    const big = o.along === 'x' ? [rnd.range(18, 60), rnd.range(4, 10)] : [rnd.range(4, 10), rnd.range(10, 30)];
    bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), big[0]!, big[1]!, rnd.pick(o.cols.slice(1)), 0.3, rnd, 4);
  }
  // a cool grey-violet where it is damp, a warm light where it is dry and sunlit
  for (let i = 0; i < n * 0.3; i++) bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), rnd.range(10, 30), rnd.range(4, 9), '#9C94A4', 0.18, rnd, 3);
  for (let i = 0; i < n * 0.3; i++) bloom(s, rnd.range(bx0, bx1), rnd.range(by0, by1), rnd.range(10, 30), rnd.range(4, 9), '#F4E6C6', 0.3, rnd, 3);
  s.restore();
  soft.draw(ctx, 1, 'source-over');

  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // streaks dragged along the way (dry brush), lighter and darker
  const m = Math.max(3, Math.round((W * H) / 500));
  for (let i = 0; i < m; i++) {
    const pts: Pt[] = [];
    if (o.along === 'x') {
      const y = rnd.range(by0, by1);
      const x = rnd.range(bx0 - 20, bx1);
      const len = rnd.range(30, 110);
      for (let j = 0; j <= 8; j++) pts.push([x + (len * j) / 8, y + Math.sin(j + i) * 0.4]);
    } else {
      const t0 = rnd.range(0, 1);
      const off = rnd.range(-0.8, 0.8);
      for (let j = 0; j <= 8; j++) {
        const y = by0 + H * clamp(t0 + (j / 8) * 0.4 - 0.2, 0, 1);
        pts.push([roadX(y) + off * roadHalf(y), y]);
      }
    }
    const dark = rnd.chance(0.5);
    brushBand(ctx, pts, () => rnd.range(0.8, 1.8), dark ? o.cols[3]! : '#F6EAD0', dark ? 0.14 : 0.18, rnd, { layers: 1, bristles: 2, bristleAlpha: 0.1, amp: 0.05 });
  }
  // the grain settles in the paper's tooth (earth pigments granulate)
  applyTooth(ctx, paperTooth('#8A6E54', 160, 457), bx0, by0, W, H, Math.max(1, ctx.getTransform().a * 1.3), 0.08, 0.24);
  ctx.restore();

  // pebbles: a lit top, a shaded underside
  for (let i = 0, k = Math.round(((W * H) / 1000) * o.pebbles); i < k; i++) {
    const x = rnd.range(bx0, bx1);
    const y = rnd.range(by0, by1);
    if (!inside(poly, x, y)) continue;
    const r = rnd.range(0.5, 1.4) * (0.7 + (y - HEDGE_Y) / 300);
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

/** grass growing back in over an edge (a run of points), the tufts leaning out over the earth */
function grassEdge(ctx: CanvasRenderingContext2D, rnd: Rand, pts: Pt[], size: number, every: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += rnd.range(every * 0.5, every * 1.5)) {
      const t = d / len;
      const k = 0.6 + ((ay + by) / 2 - HEDGE_Y) / 260;
      grassTuft(ctx, ax + (bx - ax) * t + rnd.range(-1.5, 1.5), ay + (by - ay) * t + rnd.range(-1, 1.5), rnd.range(0.6, 1.2) * size * k, rnd, 0.8 * k, GRASS);
    }
  }
}

/* ------------------------------------------------------------------ the yards and the garden paths */

export function paintYards(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  for (const id of LOANS) {
    const Y = yard(id);
    const W = HOUSE[id].wall;
    const poly = deform(blobPoly(Y.cx, Y.cy, Y.rx, Y.ry, rnd, 26, 0.12), rnd, 3, 0.04);
    earth(ctx, rnd, poly, { cols: SAND, a: 0.62, along: 'x', pebbles: 0.8 });
    // darker and damper close under the wall, where it is in the house's shade
    const soft = new SoftLayer(W.x0 - 20, GROUND_Y - 6, W.x1 - W.x0 + 40, 26, 0.6);
    bloom(soft.ctx, (W.x0 + W.x1) / 2 + 8, GROUND_Y + 5, (W.x1 - W.x0) / 2 + 10, 7, '#8E7860', 0.4, rnd, 5);
    soft.draw(ctx, 1, 'multiply');
    // the barrow's wheel ruts, from the pallet to the hoist and out to the gate, and footprints
    for (let k = 0; k < 6; k++) {
      const pts: Pt[] = [];
      const xa = rnd.range(W.x0 - 20, W.x1 + 20);
      const ya = rnd.range(GROUND_Y + 10, GROUND_Y + 30);
      const len = rnd.range(30, 90) * (rnd.chance(0.5) ? 1 : -1);
      for (let j = 0; j <= 8; j++) pts.push([xa + (len * j) / 8, ya + Math.sin(j * 0.6 + k) * 2]);
      ctx.fillStyle = rgba('#8E7258', 0.14);
      ribbon(ctx, pts.flat(), 0.7, 0.6);
    }
    for (let k = 0; k < 34; k++) {
      ctx.fillStyle = rgba('#7A5A3E', rnd.range(0.06, 0.14));
      ctx.beginPath();
      ctx.ellipse(rnd.range(W.x0 - 26, W.x1 + 26), rnd.range(GROUND_Y + 6, GROUND_Y + 34), rnd.range(1, 2.2), rnd.range(0.4, 0.8), rnd.range(-0.4, 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    // the path from the door to the gate: packed earth, worn paler down the middle
    const p = gardenPath(id);
    const pp = [...p.l.flat(), ...[...p.r].reverse().flat()];
    earth(ctx, rnd, deform(pp, rnd, 2, 0.03), { cols: EARTH, a: 0.6, along: 'x', pebbles: 0.6 });
    const mid: Pt[] = p.l.map(([x, y], i) => [(x + p.r[i]![0]) / 2, y]);
    brushBand(ctx, mid, (t) => 5 + 4 * t, '#F6EAD0', 0.2, rnd, { layers: 2, amp: 0.06 });
    // the yard's edge and the path's edges grassing over
    const rim: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      rim.push([Y.cx + Math.cos(a) * Y.rx * 0.98, Y.cy + Math.sin(a) * Y.ry * 0.98]);
    }
    grassEdge(ctx, rnd, rim.filter(([, y]) => y > GROUND_Y + 2), 3.4, 7);
    grassEdge(ctx, rnd, p.l.slice(2), 3, 6);
    grassEdge(ctx, rnd, p.r.slice(2), 3, 6);
  }
}

/* ------------------------------------------------------------------ the road */

export function paintRoad(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // the road comes down from the village through the hedge gap and meets the lane, widening toward us
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let y = ROAD_FAR.y - 6; y <= JUNCTION.y; y += 6) {
    const h = roadHalf(y);
    left.push([roadX(y) - h, y]);
    right.push([roadX(y) + h, y]);
  }
  const poly = [...left.flat(), ...[...right].reverse().flat()];
  earth(ctx, rnd, poly, { cols: EARTH, a: 0.78, along: 'y', pebbles: 1.4 });
  // two cart ruts, damp in their bottoms, with a grass crown between them
  for (const side of [-1, 1]) {
    const pts: Pt[] = [];
    for (let y = ROAD_FAR.y; y <= JUNCTION.y; y += 4) pts.push([roadX(y) + side * roadHalf(y) * 0.45 + Math.sin(y / 9 + side) * 0.4 + rnd.range(-0.3, 0.3), y]);
    rut(ctx, rnd, pts, (t) => 1.3 + t * 2.6, [-side * 1.4, 0], 0.6);
  }
  const crown: Pt[] = [];
  for (let y = ROAD_FAR.y + 2; y <= JUNCTION.y - 10; y += 6) crown.push([roadX(y), y]);
  brushBand(ctx, crown, (t) => 1.5 + t * 4, '#A8C870', 0.3, rnd, { layers: 2, amp: 0.08 });
  for (let y = ROAD_FAR.y + 6; y < JUNCTION.y - 8; y += rnd.range(4, 8)) {
    grassTuft(ctx, roadX(y) + rnd.range(-1, 1), y, rnd.range(2, 4) * (0.6 + (y - ROAD_FAR.y) / 200), rnd, 0.6, GRASS);
  }
  grassEdge(ctx, rnd, left, 3, 6);
  grassEdge(ctx, rnd, right, 3, 6);
}

/* ------------------------------------------------------------------ the lane */

export function paintLane(ctx: CanvasRenderingContext2D, rnd: Rand, v: GroundView): void {
  const y0 = LANE.y0;
  const y1 = LANE.y1;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = v.x0; x <= v.x1 + 10; x += 10) {
    top.push([x, y0 + Math.sin(x / 61) * 1.5 + rnd.range(-0.5, 0.5)]);
    bot.push([x, y1 + Math.sin(x / 47 + 1) * 1.8 + rnd.range(-0.5, 0.5)]);
  }
  const poly = [...top.flat(), ...[...bot].reverse().flat()];
  earth(ctx, rnd, poly, { cols: EARTH, a: 0.8, along: 'x', pebbles: 1.2 });
  // the far edge in the verge's shade (the light falls from the upper left)
  const sh = new SoftLayer(v.x0, y0 - 4, v.x1 - v.x0, 16, 0.5);
  for (let x = v.x0; x < v.x1; x += 60) bloom(sh.ctx, x + rnd.range(0, 40), y0 + 2, rnd.range(40, 70), 4, '#7A7088', 0.3, rnd, 3);
  sh.draw(ctx, 1, 'multiply');
  // the grassy crown between the ruts, broken where the wheels and hooves have worn it
  const crownY = (CART_RUT_A + CART_RUT_B) / 2;
  for (let x = v.x0; x < v.x1; ) {
    const len = rnd.range(30, 110);
    const pts: Pt[] = [];
    for (let j = 0; j <= 8; j++) pts.push([x + (len * j) / 8, crownY + Math.sin(j * 0.8 + x) * 0.8]);
    brushBand(ctx, pts, (t) => (2.5 + 2 * Math.sin(Math.PI * t)) * rnd.range(0.8, 1.2), rnd.pick(['#A8C870', '#B6D07A', '#9CC066']), 0.32, rnd, { layers: 2, bristles: 2, bristleAlpha: 0.15, amp: 0.06 });
    for (let d = 0; d < len; d += rnd.range(5, 12)) grassTuft(ctx, x + d, crownY + rnd.range(-1.2, 1.5), rnd.range(2.2, 4), rnd, 0.7, GRASS);
    x += len + rnd.range(20, 80);
  }
  // the ruts the carts come and go in: damp and darker in their bottoms, a lit lip on their far side
  for (const ry of [CART_RUT_A, CART_RUT_B]) {
    const pts: Pt[] = [];
    for (let x = v.x0; x <= v.x1; x += 6) pts.push([x, ry + Math.sin(x / 37) * 1.1 + Math.sin(x / 11 + ry) * 0.4 + rnd.range(-0.3, 0.3)]);
    rut(ctx, rnd, pts, () => 3, [0, -2]);
  }
  // puddles holding the sky, in the ruts and the hollows
  for (const p of [{ x: 96, y: 596, w: 26 }, { x: 352, y: 590, w: 18 }, { x: 690, y: 598, w: 30 }, { x: 948, y: 588, w: 16 }]) puddle(ctx, rnd, p.x, p.y, p.w);
  // the lane's edges grassing over: a ragged fringe on both sides, fuller on the near side
  grassEdge(ctx, rnd, top.map(([x, y]) => [x, y + 1] as Pt), 3, 6);
  grassEdge(ctx, rnd, bot.map(([x, y]) => [x, y + 1.5] as Pt), 4.4, 5);
}

/** a puddle: a ring of dark wet mud, water holding the pale sky, the bank reflected along its far edge, a glint */
function puddle(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, w: number): void {
  const h = w * 0.24;
  const soft = new SoftLayer(x - w * 1.4, y - h * 2.4, w * 2.8, h * 4.8, 1.2);
  bloom(soft.ctx, x, y + h * 0.1, w * 1.15, h * 1.5, '#8A7058', 0.42, rnd, 5);
  soft.draw(ctx, 1, 'multiply');
  const water = deform(blobPoly(x, y, w, h, rnd, 18, 0.16), rnd, 2, 0.05);
  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, 'rgba(120,138,150,0.72)');
  g.addColorStop(0.35, 'rgba(176,200,222,0.82)');
  g.addColorStop(1, 'rgba(214,228,240,0.86)');
  ctx.fillStyle = g;
  tracePoly(ctx, water);
  ctx.fill();
  ctx.save();
  tracePoly(ctx, water);
  ctx.clip();
  // the far bank and its grass reflected, upside down, along the top of the water
  ctx.fillStyle = 'rgba(96,110,84,0.3)';
  tracePoly(ctx, deform(blobPoly(x, y - h * 0.85, w * 1.1, h * 0.45, rnd, 14, 0.25), rnd, 2, 0.08));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,253,246,0.55)';
  ribbon(ctx, [x - w * 0.45, y + h * 0.15, x - w * 0.05, y + h * 0.05, x + w * 0.3, y + h * 0.18], 0.7, 0.6);
  ctx.restore();
  // the water's near edge, a thin dark line of wet mud
  ctx.fillStyle = 'rgba(92,72,58,0.3)';
  ribbon(ctx, [x - w * 0.8, y + h * 0.7, x, y + h * 1.02, x + w * 0.8, y + h * 0.7], 0.6, 0.6);
}
