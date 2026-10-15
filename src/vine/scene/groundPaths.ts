/**
 * The garden paths, laid as irregular flagstones (crazy paving). The network is a handful of centre lines with
 * a width each; a seeded scatter of stone centres, spaced by depth so stones grow toward the viewer, is turned
 * into stones by Voronoi cells (cut by the ghost seeds just outside the path so its edge is ragged), each
 * shrunk to leave a gap of earth, rounded, and painted as a small watercolor: warm grey, ochre, sage or
 * pinkish buff, lit pale at the upper left, shaded at the lower right, with a soft contact shadow only to the
 * lower right, a few specks, cracks, lichen and a broken ink line. Grass and leaves creep over the edges.
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, bloom, grassTuft } from '../../river/scene/paint';
import { GROUND_Y } from './geom';
import { FENCE, LANE } from './layout';

type P3 = [number, number, number];

/** a way: control points (x, y, half width) joined by a Catmull-Rom curve */
interface Way {
  name: string;
  pts: P3[];
}

const mirror = (pts: P3[]): P3[] => pts.map(([x, y, h]) => [1000 - x, y, h] as P3);

/**
 * The network. Strips run along the foot of each cottage wall (where the gardeners walk); a lane runs from the
 * far end of the side yard through the gate and on toward the viewer; a walk curves from each door across the
 * lawn to meet the lane.
 */
const LEFT_WALK: P3[] = [
  [302, 480, 14],
  [303, 506, 14],
  [310, 532, 13.5],
  [334, 552, 14],
  [384, 563, 14.5],
  [440, 563, 15.5],
  [498, 558, 17],
];

export const WAYS: Way[] = [
  {
    name: 'lane-back',
    pts: [[LANE.x, LANE.yBack, 5.5], [LANE.x - 1, 380, 8], [LANE.x, 440, 12], [LANE.x, FENCE.y - 2, 15]],
  },
  {
    name: 'lane-front',
    pts: [[LANE.x, FENCE.y + 3, 15.5], [LANE.x, 540, 16.5], [LANE.x, 575, 17.5], [LANE.x + 1, 640, 19], [LANE.x - 1, 720, 20.5]],
  },
  { name: 'walk-minimum', pts: LEFT_WALK },
  { name: 'walk-fixed', pts: mirror(LEFT_WALK) },
];

interface Disc {
  x: number;
  y: number;
  r: number;
}

function densify(w: Way, step = 3): Disc[] {
  const out: Disc[] = [];
  const p = w.pts;
  const n = p.length;
  const at = (i: number) => p[clamp(i, 0, n - 1)]!;
  for (let i = 0; i < n - 1; i++) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const d = at(i + 2);
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const m = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (u0: number, u1: number, u2: number, u3: number) => 0.5 * (2 * u1 + (-u0 + u2) * t + (2 * u0 - 5 * u1 + 4 * u2 - u3) * t2 + (-u0 + 3 * u1 - 3 * u2 + u3) * t3);
      out.push({ x: f(a[0], b[0], c[0], d[0]), y: f(a[1], b[1], c[1], d[1]), r: f(a[2], b[2], c[2], d[2]) });
    }
  }
  const l = p[n - 1]!;
  out.push({ x: l[0], y: l[1], r: l[2] });
  return out;
}

/** a field telling how far inside the paths a point is (negative inside) */
export class PathField {
  private discs: Disc[] = [];
  private grid = new Map<number, Disc[]>();
  private readonly cs = 24;
  private noise = makeNoise2D(5151);
  constructor(ways: Way[] = WAYS) {
    for (const w of ways) for (const d of densify(w)) this.discs.push(d);
    for (const d of this.discs) {
      const reach = d.r + 6;
      const x0 = Math.floor((d.x - reach) / this.cs);
      const x1 = Math.floor((d.x + reach) / this.cs);
      const y0 = Math.floor((d.y - reach) / this.cs);
      const y1 = Math.floor((d.y + reach) / this.cs);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx * 4096 + gy;
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(d);
      }
    }
  }
  /** signed distance to the path edge: < 0 inside, with a little wobble so the edge is ragged */
  sd(x: number, y: number, wobble = 1): number {
    const l = this.grid.get(Math.floor(x / this.cs) * 4096 + Math.floor(y / this.cs));
    let best = 1e9;
    if (l) for (const d of l) best = Math.min(best, Math.hypot(x - d.x, y - d.y) - d.r);
    if (best > 40) return best;
    return best + (this.noise(x * 0.09, y * 0.11) - 0.5) * 3.2 * wobble;
  }
}

/* ------------------------------------------------------------------ stones */

const STONES_OLD = ['#CDBFA2', '#BFAE92', '#DACBAA', '#B3A38C', '#C9B69A', '#D6BE94', '#C2B4A0', '#B8AA90', '#D2B8A0', '#BDB59C', '#CDB09A', '#D8C8A4', '#A9A89A', '#C6A888'];
const STONES = ['#BDB29A', '#B0A48C', '#C8BCA0', '#A59B88', '#BBAB90', '#C4B08C', '#B2A898', '#AAA08A', '#B9A890', '#B2AE98', '#C2B496', '#A4A494'];
void STONES_OLD;
const MOSS = ['#8FA050', '#A0A858', '#7F9446', '#B0A850'];

interface Cell {
  sx: number;
  sy: number;
  poly: number[];
  edge: boolean;
  h: number;
}

/** cut a convex polygon by the half plane (p - m) . n <= 0 */
function clip(poly: number[], mx: number, my: number, nx: number, ny: number): number[] {
  const out: number[] = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[2 * i]!;
    const ay = poly[2 * i + 1]!;
    const bx = poly[2 * j]!;
    const by = poly[2 * j + 1]!;
    const da = (ax - mx) * nx + (ay - my) * ny;
    const db = (bx - mx) * nx + (by - my) * ny;
    if (da <= 0) out.push(ax, ay);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  return out;
}

const rowH = (y: number): number => Math.min(15.5, 7.8 + Math.max(0, y - 322) * 0.05);

function makeCells(field: PathField, rnd: Rand, xmin: number, xmax: number, ymin: number, ymax: number): Cell[] {
  interface Seed {
    x: number;
    y: number;
    h: number;
    ghost: boolean;
  }
  const seeds: Seed[] = [];
  let y = ymin;
  while (y < ymax) {
    // the lane behind the fence is narrow: smaller stones, or one would span it
    const h = rowH(y) * rnd.range(0.94, 1.08) * (y < 484 ? 0.62 : 1);
    let x = xmin + rnd.range(0, h * 1.5);
    while (x < xmax) {
      const w = h * rnd.range(1.1, 1.7);
      const sx = x + w / 2 + rnd.range(-0.22, 0.22) * w;
      const sy = y + h / 2 + rnd.range(-0.26, 0.26) * h;
      const d = field.sd(sx, sy);
      if (d < 0) seeds.push({ x: sx, y: sy, h, ghost: false });
      else if (d < h * 1.9) seeds.push({ x: sx, y: sy, h, ghost: true });
      x += w;
    }
    y += h;
  }
  const cs = 28;
  const grid = new Map<number, Seed[]>();
  for (const s of seeds) {
    const k = Math.floor(s.x / cs) * 4096 + Math.floor(s.y / cs);
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(s);
  }
  const cells: Cell[] = [];
  for (const s of seeds) {
    if (s.ghost) continue;
    const hx = s.h * 3.2;
    const hy = s.h * 2.1;
    let poly = [s.x - hx, s.y - hy, s.x + hx, s.y - hy, s.x + hx, s.y + hy, s.x - hx, s.y + hy];
    let edge = false;
    const gx0 = Math.floor((s.x - hx * 2) / cs);
    const gx1 = Math.floor((s.x + hx * 2) / cs);
    const gy0 = Math.floor((s.y - hy * 2) / cs);
    const gy1 = Math.floor((s.y + hy * 2) / cs);
    const near: Seed[] = [];
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const l = grid.get(gx * 4096 + gy);
      if (l) for (const o of l) if (o !== s) near.push(o);
    }
    near.sort((a, b) => (a.x - s.x) ** 2 + (a.y - s.y) ** 2 - ((b.x - s.x) ** 2 + (b.y - s.y) ** 2));
    for (const o of near) {
      const dx = o.x - s.x;
      const dy = o.y - s.y;
      const dl = Math.hypot(dx, dy);
      if (dl < 1e-3) continue;
      poly = clip(poly, s.x + dx / 2, s.y + dy / 2, dx / dl, dy / dl);
      if (poly.length < 6) break;
      if (o.ghost) edge = true;
    }
    if (poly.length >= 6) {
      // an outsized cell (a gap in the scatter) is pulled in so no slab is bigger than its neighbours
      const lim = 2.9 * s.h * s.h;
      const a = area(poly);
      if (a > lim) {
        const k = Math.sqrt(lim / a);
        poly = poly.map((v, i) => (i % 2 === 0 ? s.x + (v - s.x) * k : s.y + (v - s.y) * k));
      }
      cells.push({ sx: s.x, sy: s.y, poly, edge, h: s.h });
    }
  }
  return cells;
}

function area(p: number[]): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
  }
  return Math.abs(a) / 2;
}

/** shrink toward the seed by about g, then round the corners */
function stoneShape(c: Cell, g: number, rnd: Rand): number[] {
  const p = c.poly;
  const n = p.length / 2;
  const s: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = c.sx - p[2 * i]!;
    const dy = c.sy - p[2 * i + 1]!;
    const dl = Math.hypot(dx, dy) || 1;
    const k = Math.min(0.55, g / dl);
    s.push(p[2 * i]! + dx * k, p[2 * i + 1]! + dy * k);
  }
  // one pass of corner cutting, then a breath of wobble
  const r: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = s[2 * i]!;
    const ay = s[2 * i + 1]!;
    const bx = s[2 * j]!;
    const by = s[2 * j + 1]!;
    r.push(ax * 0.88 + bx * 0.12, ay * 0.88 + by * 0.12, ax * 0.12 + bx * 0.88, ay * 0.12 + by * 0.88);
  }
  return deform(r, rnd, 1, 0.03);
}

function paintStoneCell(ctx: CanvasRenderingContext2D, rnd: Rand, poly: number[], cx: number, cy: number, r: number, col: string, haze: number): void {
  const sc = clamp(r / 7, 0.5, 2.4);
  // soft contact shadow, only to the lower right
  ctx.fillStyle = 'rgba(52,40,30,0.07)';
  for (let i = 2; i >= 1; i--) {
    ctx.save();
    ctx.translate(0.55 * sc * i, 0.8 * sc * i);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.restore();
  }
  // the stone
  ctx.fillStyle = rgba(col, 0.94);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // mottled wash of a second tone
  ctx.fillStyle = rgba(rnd.pick(STONES), 0.32);
  ctx.beginPath();
  ctx.ellipse(cx + rnd.range(-0.3, 0.3) * r, cy + rnd.range(-0.2, 0.2) * r, r * rnd.range(0.55, 0.9), r * rnd.range(0.4, 0.7), rnd.range(0, 3), 0, Math.PI * 2);
  ctx.fill();
  // lit upper left, shaded lower right
  const g = ctx.createLinearGradient(cx - r, cy - r * 0.9, cx + r, cy + r * 0.9);
  g.addColorStop(0, 'rgba(255,250,232,0.22)');
  g.addColorStop(0.5, 'rgba(255,250,232,0.03)');
  g.addColorStop(1, 'rgba(74,58,46,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
  // pigment pooled along the lower right edge, a pale rim along the upper left
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(66,52,42,0.1)';
  ctx.lineWidth = 1.3 * sc;
  ctx.save();
  ctx.translate(-0.7 * sc, -0.9 * sc);
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,250,236,0.5)';
  ctx.lineWidth = 0.9 * sc;
  ctx.save();
  ctx.translate(0.55 * sc, 0.7 * sc);
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.restore();
  // granulation: a few specks
  const nsp = Math.round(r * 0.9);
  for (let i = 0; i < nsp; i++) {
    ctx.fillStyle = rnd.chance(0.5) ? 'rgba(60,48,38,0.22)' : 'rgba(255,248,230,0.3)';
    ctx.beginPath();
    ctx.arc(cx + rnd.range(-1, 1) * r * 1.2, cy + rnd.range(-1, 1) * r * 0.8, rnd.range(0.2, 0.55) * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  // lichen and a crack on some
  if (r > 4 && rnd.chance(0.22)) {
    ctx.fillStyle = rgba(rnd.pick(MOSS), 0.34);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + rnd.range(-0.7, 0.7) * r, cy + rnd.range(-0.4, 0.5) * r * 0.8, r * rnd.range(0.12, 0.3), r * rnd.range(0.08, 0.2), rnd.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (r > 5 && rnd.chance(0.25)) {
    ctx.strokeStyle = 'rgba(58,46,36,0.38)';
    ctx.lineWidth = 0.35 * sc;
    ctx.beginPath();
    const x0 = cx + rnd.range(-0.6, 0.2) * r;
    const y0 = cy + rnd.range(-0.5, 0) * r;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + rnd.range(0.2, 0.6) * r, y0 + rnd.range(0.1, 0.4) * r);
    ctx.lineTo(x0 + rnd.range(0.5, 0.9) * r, y0 + rnd.range(0.3, 0.6) * r);
    ctx.stroke();
  }
  ctx.restore();
  if (haze > 0) {
    ctx.fillStyle = `rgba(251,246,234,${haze})`;
    tracePoly(ctx, poly);
    ctx.fill();
  }
}

/** a fallen leaf lying on or beside a stone */
const LEAF = ['#D9A03C', '#C8683A', '#B8483A', '#E4B64E', '#A8522E', '#CC8A32'];

/** the trodden edge along the foot of each wall: bare worn earth, thin grass, a stray flat stone or two */
function paintWornStrip(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number): void {
  const yc = 503;
  const soft = new SoftLayer(x0 - 10, yc - 24, x1 - x0 + 20, 48, 1);
  const edge = (dy: number, w: number) => {
    const pts: number[] = [];
    for (let x = x0 - 10; x <= x1 + 10; x += 6) pts.push(x, yc + dy + (Math.sin(x / 23 + dy) + 0.6 * Math.sin(x / 9.3)) * w);
    return pts;
  };
  const top = edge(-8, 1.6);
  const bot = edge(8, 1.6);
  const poly: number[] = [...top];
  for (let i = bot.length / 2 - 1; i >= 0; i--) poly.push(bot[2 * i]!, bot[2 * i + 1]!);
  soft.ctx.fillStyle = 'rgba(170,140,88,0.75)';
  tracePoly(soft.ctx, deform(poly, rnd, 1, 0.01));
  soft.ctx.fill();
  soft.ctx.fillStyle = 'rgba(204,174,116,0.6)';
  const inner: number[] = [];
  for (let x = x0; x <= x1; x += 6) inner.push(x, yc - 4 + Math.sin(x / 17) * 1.2);
  for (let x = x1; x >= x0; x -= 6) inner.push(x, yc + 4 + Math.sin(x / 13) * 1.2);
  tracePoly(soft.ctx, inner);
  soft.ctx.fill();
  for (let i = 0; i < 26; i++) bloom(soft.ctx, rnd.range(x0, x1), yc + rnd.range(-3, 3), rnd.range(20, 60), rnd.range(2, 4), rnd.pick(['#C8A870', '#B58E5A', '#D8BE88']), 0.2, rnd, 3);
  soft.draw(ctx, 1, 'multiply');
  soft.draw(ctx, 0.35, 'source-over');
  const tufts = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62'];
  for (let x = x0; x < x1; x += rnd.range(3.5, 7)) {
    const side = rnd.chance(0.5) ? -1 : 1;
    const e = rnd.chance(0.82);
    const y = yc + (e ? side * rnd.range(6, 10) : rnd.range(-5, 5));
    grassTuft(ctx, x, y, e ? rnd.range(3, 6) : rnd.range(1.8, 3), rnd, 0.9, tufts);
  }
  // a stray flat stone here and there
  for (let x = x0 + rnd.range(10, 40); x < x1; x += rnd.range(70, 150)) {
    const r = rnd.range(4.5, 7);
    const y = yc + rnd.range(-3, 3);
    const n = rnd.int(5, 6);
    const pts: number[] = [];
    const a0 = rnd.range(0, 1);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + rnd.range(-0.2, 0.2);
      pts.push(x + Math.cos(a) * r * 1.35 * rnd.range(0.85, 1.1), y + Math.sin(a) * r * 0.62 * rnd.range(0.85, 1.1));
    }
    paintStoneCell(ctx, rnd, pts, x, y, r, rnd.pick(STONES), 0);
  }
  for (let i = 0; i < (x1 - x0) / 14; i++) {
    const L = rnd.range(3, 5);
    ctx.fillStyle = rgba(rnd.pick(LEAF), rnd.range(0.7, 0.95));
    almond(ctx, rnd.range(x0, x1), yc + rnd.range(-7, 7), rnd.range(0, Math.PI), L, L * 0.44, rnd.gauss() * 0.3);
    ctx.fill();
  }
}

export interface PathsResult {
  field: PathField;
}

export function paintPaths(ctx: CanvasRenderingContext2D, rnd: Rand, xmin: number, xmax: number, ymax: number): PathsResult {
  // the lane runs on to the bottom of the view, whatever its height
  const lane = WAYS.find((w) => w.name === 'lane-front')!;
  const ways = WAYS.map((w) => (w === lane ? { ...w, pts: [...w.pts, [LANE.x, Math.max(760, ymax + 40), Math.min(26, 20.5 + Math.max(0, ymax - 720) * 0.006)] as P3] } : w));
  const field = new PathField(ways);
  const x0 = Math.max(xmin, -130);
  const x1 = Math.min(xmax, 1130);
  const cells = makeCells(field, rnd, x0 - 20, x1 + 20, LANE.yBack - 12, Math.max(780, ymax + 50));
  const pal = makeNoise2D(777);
  paintWornStrip(ctx, rnd, x0, x1);
  // the earth under and between the stones, a little wider than the stones, soft edged
  const bed = new SoftLayer(x0 - 10, 300, x1 - x0 + 20, Math.max(780, ymax + 60) - 300, 1.1);
  bed.ctx.fillStyle = '#B09C74';
  bed.ctx.strokeStyle = '#B09C74';
  bed.ctx.lineJoin = 'round';
  bed.ctx.lineWidth = 0.8;
  for (const c of cells) {
    tracePoly(bed.ctx, c.poly);
    bed.ctx.fill();
    bed.ctx.stroke();
  }
  // worn pale dust and darker damp where stones meet: two passes at different alphas
  bed.draw(ctx, 0.3, 'multiply');
  // stones, back to front
  cells.sort((a, b) => a.sy - b.sy);
  for (const c of cells) {
    if (area(c.poly) < 3) continue;
    const g = 0.55 + c.h * 0.045;
    const shape = stoneShape(c, g, rnd);
    const r = Math.sqrt(area(shape) / Math.PI) * 1.05;
    const t = pal(c.sx * 0.03, c.sy * 0.045);
    const col = STONES[Math.floor(clamp(t * 0.7 + rnd.next() * 0.45, 0, 0.999) * STONES.length)]!;
    const far = clamp((FENCE.y - c.sy) / 170, 0, 1);
    paintStoneCell(ctx, rnd, shape, c.sx, c.sy, r, col, far * 0.12);
  }
  // grass, dry blades and leaves creeping over the edge and up through the gaps
  const tufts = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444'];
  for (const c of cells) {
    const n = c.poly.length / 2;
    for (let i = 0; i < n; i++) {
      const vx = c.poly[2 * i]!;
      const vy = c.poly[2 * i + 1]!;
      const edge = c.edge && field.sd(vx, vy) > -2.2;
      if (!(edge ? rnd.chance(0.42) : rnd.chance(0.07))) continue;
      const k = 0.55 + (vy - 322) / 520;
      grassTuft(ctx, vx + rnd.range(-1, 1), vy + rnd.range(-0.5, 1.4), rnd.range(2.4, 5.6) * k, rnd, 0.9 * k, tufts);
    }
  }
  for (const c of cells) {
    if (!rnd.chance(0.16)) continue;
    const L = rnd.range(3, 5.2) * (0.7 + (c.sy - 322) / 520);
    ctx.fillStyle = rgba(rnd.pick(LEAF), rnd.range(0.7, 0.95));
    almond(ctx, c.sx + rnd.range(-3, 3), c.sy + rnd.range(-2, 2), rnd.range(0, Math.PI), L, L * 0.44, rnd.gauss() * 0.3);
    ctx.fill();
  }
  void GROUND_Y;
  return { field };
}
