/**
 * The lawn: an autumn meadow of washes, going gold in the sun at the back and deepening to olive toward the
 * viewer, laid as wet-in-wet blooms and dry-brush strokes with paper tooth on top and tufts of dry grass; the
 * soft cast shadows of the cottages and trees; and the fallen leaves, scattered thin across the open lawn and
 * drifting thick along the edges of things (paths, walls, the fence, tree feet).
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { SoftLayer, applyTooth, bloom, brushBand, grassTuft, paperTooth, type Pt } from '../../river/scene/paint';
import { COTTAGE, GROUND_Y, PILE } from './geom';
import { FENCE, LANE, TREES, WALL_STUB } from './layout';
import { PLANS } from '../types';
import type { View } from './landscape';
import type { PathField } from './groundPaths';

export const HEDGE_Y = 306;

const af = (v: View, y0: number, y1: number): number => clamp(((Math.min(v.xmax, 1200) - Math.max(v.xmin, -150)) * (y1 - y0)) / (1350 * 400), 0.4, 3);

export function paintLawn(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, gd: number): void {
  const y0 = HEDGE_Y - 4;
  const y1 = v.ymax + 10;
  const H = y1 - y0;
  const area = af(v, y0, y1);
  const soft = new SoftLayer(v.xmin, y0, v.xmax - v.xmin, H, 0.5);
  const g = soft.ctx.createLinearGradient(0, y0, 0, y1);
  const stop = (y: number) => clamp((y - y0) / H, 0, 1);
  g.addColorStop(0, 'rgba(208,198,112,0.84)');
  g.addColorStop(stop(380), 'rgba(196,192,98,0.86)');
  g.addColorStop(stop(500), 'rgba(184,184,86,0.88)');
  g.addColorStop(stop(620), 'rgba(166,172,74,0.92)');
  g.addColorStop(1, 'rgba(148,158,64,0.95)');
  soft.ctx.fillStyle = g;
  soft.ctx.fillRect(v.xmin, y0, v.xmax - v.xmin, H);
  const bl = (n: number, cols: string[], a: number, rx: [number, number], ry: [number, number], pw = 0.85) => {
    for (let i = 0; i < n * area; i++) {
      const y = y0 + H * Math.pow(rnd.next(), pw);
      const k = 0.6 + (y - y0) / 380;
      bloom(soft.ctx, rnd.range(v.xmin, v.xmax), y, rnd.range(rx[0], rx[1]) * k, rnd.range(ry[0], ry[1]) * k, rnd.pick(cols), a, rnd, 4);
    }
  };
  // wet-in-wet: sun-gold, worn amber-brown, deeper greens, a few cool sage patches
  bl(46, ['#E6C65C', '#DDB24E', '#EDD274', '#D9A646'], 0.36, [60, 170], [10, 28]);
  bl(24, ['#C9915A', '#B9854E', '#C27E4A', '#D09A5C'], 0.28, [50, 130], [9, 22]);
  bl(18, ['#7FA050', '#6F9448', '#8DAA58', '#6E9A5C'], 0.24, [50, 150], [10, 26]);
  bl(8, ['#9CAE8A', '#A8B49A'], 0.18, [60, 160], [8, 18], 1.1);
  soft.draw(ctx, 1, 'multiply');

  // dry-brush strokes laid across the lawn along its perspective: long, flat, with bristles that stop short
  const strokes = Math.round(150 * area);
  const cols = ['#B8B058', '#9AA648', '#C8B462', '#8C9A44', '#D4B868', '#A6A850', '#B79A56'];
  for (let i = 0; i < strokes; i++) {
    const y = y0 + 10 + (H - 10) * Math.pow(rnd.next(), 0.9);
    const k = 0.55 + (y - y0) / 360;
    const len = rnd.range(70, 240) * k;
    const x = rnd.range(v.xmin - 40, v.xmax);
    const bow = rnd.range(-3, 3) * k;
    const pts: Pt[] = [];
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      pts.push([x + len * t, y + bow * Math.sin(t * Math.PI) + 1.2 * k * Math.sin(t * 6 + i)]);
    }
    const dark = rnd.chance(0.55);
    ctx.globalCompositeOperation = dark ? 'multiply' : 'source-over';
    brushBand(ctx, pts, (t) => rnd.range(0.9, 1.1) * (2.6 + 3.2 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * k, rnd.pick(cols), dark ? 0.12 : 0.1, rnd, { layers: 2, bristles: 3, bristleAlpha: dark ? 0.1 : 0.08, amp: 0.05 });
  }
  ctx.globalCompositeOperation = 'source-over';

  // paper tooth over the whole lawn wash
  const tooth = paperTooth('#6A7A38', 160, 411);
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.xmin, y0, v.xmax - v.xmin, H);
  ctx.clip();
  applyTooth(ctx, tooth, v.xmin, y0, v.xmax - v.xmin, H, gd * 0.9, 0.0, 0.36);
  ctx.restore();

  // tufts of autumn grass and dry blades, bigger toward the viewer, thinning on the paths later
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444', '#C2A24E'];
  const noise = makeNoise2D(9191);
  const tufts = Math.round(1700 * area);
  for (let i = 0; i < tufts; i++) {
    const y = y0 + 12 + (H - 12) * Math.pow(rnd.next(), 0.9);
    const x = rnd.range(v.xmin, v.xmax);
    // clumpy: more tufts where the noise is high
    if (noise(x * 0.012, y * 0.02) < 0.34 && rnd.chance(0.6)) continue;
    const k = 0.5 + (y - y0) / 250;
    grassTuft(ctx, x, y, rnd.range(2.6, 6.8) * k, rnd, 0.9 * k, pal);
  }
}

/* ------------------------------------------------------------------ cast shadows */

export function paintCastShadows(ctx: CanvasRenderingContext2D, rnd: Rand, v: View): void {
  const soft = new SoftLayer(v.xmin, 280, v.xmax - v.xmin, v.ymax - 280, 0.5);
  const sh = (x: number, y: number, rx: number, ry: number, a: number, col = '#46503A') => bloom(soft.ctx, x, y, rx, ry, col, a, rnd, 6);
  // the sun is upper left, behind the scene: shadows fall to the right and toward us
  for (const t of TREES) {
    if (!t.look) continue;
    const big = t.look.k > 0.5;
    sh(t.x + t.rx * (big ? 0.55 : 0.5), t.y + (big ? 14 : 8), t.rx * (big ? 1.05 : 0.9), (big ? 18 : 9) + t.ry * 0.05, big ? 0.34 : 0.3);
    if (!big) sh(t.x + t.rx * 0.2, t.y + 3, t.rx * 0.4, 5, 0.28);
  }
  for (const id of PLANS) {
    const c = COTTAGE[id];
    const w = c.wall;
    // a band along the foot of the wall, longer to the right of the sun
    sh((w.x0 + w.x1) / 2 + 24, GROUND_Y + 12, (w.x1 - w.x0) / 2 + 40, 14, 0.3);
    // thrown to the right into the side yard or the lawn
    const toward = id === 'minimum' ? 1 : 0.35;
    const x = id === 'minimum' ? w.x1 + 20 : w.x1 + 22;
    sh(x, GROUND_Y + 22, 40 * toward + 22, 26, 0.26 * toward + 0.06);
    // and behind: the side yard's left half is in the left cottage's shade
    if (id === 'minimum') sh(w.x1 + 18, 400, 24, 70, 0.22);
  }
  // the fence and the garden wall stubs lie a thin shadow to their right
  sh((FENCE.x0 + FENCE.x1) / 2 + 5, FENCE.y + 5, (FENCE.x1 - FENCE.x0) / 2, 4, 0.22);
  for (const id of PLANS) {
    const w = WALL_STUB[id];
    sh((w.x0 + w.x1) / 2 + 8, w.yBase + 7, (w.x1 - w.x0) / 2, 5, 0.26);
  }
  soft.draw(ctx, 1, 'multiply');
}

/* ------------------------------------------------------------------ fallen leaves */

const LEAF_COLS = ['#D9A03C', '#C8683A', '#B8483A', '#E4B64E', '#A8522E', '#CC8A32', '#8E3A2E', '#E0C25A', '#BA7430', '#D4883A', '#9A4A2E'];

function leaf(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, L: number, aMin = 0.55): void {
  const col = rnd.pick(LEAF_COLS);
  ctx.fillStyle = rgba(col, rnd.range(aMin, 0.95));
  const ang = rnd.range(0, Math.PI);
  almond(ctx, x, y, ang, L, L * rnd.range(0.38, 0.56), rnd.gauss() * 0.3);
  ctx.fill();
  if (L > 3.4 && rnd.chance(0.4)) {
    ctx.strokeStyle = 'rgba(70,40,24,0.28)';
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * L * 0.4, y - Math.sin(ang) * L * 0.4);
    ctx.lineTo(x + Math.cos(ang) * L * 0.4, y + Math.sin(ang) * L * 0.4);
    ctx.stroke();
  }
  // a darker, wet, curled one now and then
  if (L > 3 && rnd.chance(0.12)) {
    ctx.fillStyle = 'rgba(60,34,22,0.2)';
    almond(ctx, x + L * 0.1, y + L * 0.08, ang, L * 0.7, L * 0.2, 0);
    ctx.fill();
  }
}

/** how calm the lawn must stay at a spot (the label spots above each pile and the walking strips) */
function calm(x: number, y: number): number {
  let k = 1;
  for (const id of PLANS) {
    const p = PILE[id];
    const d = Math.hypot((x - p.x) / 96, (y - (p.y - 40)) / 48);
    if (d < 1) k *= 0.15 + 0.85 * d * d;
  }
  return k;
}

export function paintLeaves(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, field: PathField): void {
  const noise = makeNoise2D(2323);
  const x0 = Math.max(v.xmin, -150);
  const x1 = Math.min(v.xmax, 1150);
  const area = af(v, 316, v.ymax);
  const N = Math.round(5600 * area);
  const trees = TREES.map((t) => ({ x: t.x + t.rx * 0.35, y: t.y }));
  for (let i = 0; i < N; i++) {
    const y = 312 + (v.ymax - 312) * Math.pow(rnd.next(), 0.8);
    const x = rnd.range(x0, x1);
    let dens = 0.3 + 0.35 * noise(x * 0.02, y * 0.03);
    for (const t of trees) dens += 0.7 * Math.exp(-(((x - t.x) / 150) ** 2 + ((y - t.y - 60) / 90) ** 2));
    for (const id of PLANS) {
      const c = COTTAGE[id];
      if (x > c.wall.x0 - 30 && x < c.wall.x1 + 30) dens += 0.35 * Math.exp(-(((y - (GROUND_Y + 22)) / 26) ** 2));
      const w = WALL_STUB[id];
      if (x > w.x0 - 14 && x < w.x1 + 14) dens += 0.5 * Math.exp(-(((y - (w.yBase + 6)) / 12) ** 2));
    }
    const sd = field.sd(x, y);
    // thicker at the edge of the paths, where the breeze lays them, thin on the stones
    if (sd < 0) dens *= 0.4;
    else if (sd < 9) dens += 0.35 * (1 - sd / 9);
    // along the fence
    if (x > FENCE.x0 - 4 && x < FENCE.x1 + 4) dens += 0.5 * Math.exp(-(((y - FENCE.y - 4) / 9) ** 2));
    if (!rnd.chance(Math.min(1, dens * 0.55) * calm(x, y))) continue;
    // not over the cottage footprints
    let inside = false;
    for (const id of PLANS) {
      const w = COTTAGE[id].wall;
      if (x > w.x0 - 3 && x < w.x1 + 3 && y < GROUND_Y + 1) inside = true;
    }
    if (inside) continue;
    const k = 0.6 + (y - 300) / 300;
    leaf(ctx, rnd, x, y, rnd.range(2.8, 5.4) * k);
  }
  // drifts: small heaps of leaves piled up against the foot of the garden walls, the fence and the path edges
  const drift = (cx: number, cy: number, rx: number, ry: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next());
      leaf(ctx, rnd, cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, rnd.range(3, 5.4) * (0.7 + (cy - 300) / 400), 0.65);
    }
  };
  for (const id of PLANS) {
    const w = WALL_STUB[id];
    for (let i = 0; i < 6; i++) drift(rnd.range(w.x0, w.x1), w.yBase + rnd.range(3, 8), rnd.range(10, 26), rnd.range(3, 6), rnd.int(16, 34));
  }
  for (let i = 0; i < 4; i++) drift(rnd.range(FENCE.x0 + 6, FENCE.x1 - 6), FENCE.y + 3, rnd.range(10, 20), 4, rnd.int(10, 22));
  for (const t of trees) drift(t.x, t.y + 4, 40, 8, 40);
  void deform;
  void tracePoly;
  void LANE;
}
