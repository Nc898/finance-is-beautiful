/**
 * The low picket fence that closes the side yard between the cottages, with its open gate. Painted the way Time
 * to Grow's fence is: warm washes lit from the upper left, grain strokes, weathered flaking paint, a broken
 * sepia contour, a soft cast shadow to the lower right and grass and late flowers at the feet. Pale limewashed
 * pickets standing against grey-brown rails, one or two a little crooked.
 */
import { Rand } from '../../scene/prng';
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { flowerDab, grassTuft } from '../../river/scene/paint';
import { FENCE } from './layout';
import { INK } from './art';

const PAINT = ['#EFE4C6', '#E8DCBA', '#F1E7CC', '#E2D5B2', '#EBDEBC'];
const BARE = '#C9AE82';

function rail(ctx: CanvasRenderingContext2D, rnd: Rand, xa: number, xb: number, y: number, th: number): void {
  const sag = rnd.range(0.3, 0.9);
  const p = new Path2D();
  p.moveTo(xa, y - th / 2);
  p.quadraticCurveTo((xa + xb) / 2, y - th / 2 + sag, xb, y - th / 2);
  p.lineTo(xb, y + th / 2);
  p.quadraticCurveTo((xa + xb) / 2, y + th / 2 + sag, xa, y + th / 2);
  p.closePath();
  const g = ctx.createLinearGradient(0, y - th, 0, y + th);
  g.addColorStop(0, 'rgba(188,156,116,0.98)');
  g.addColorStop(0.5, 'rgba(146,112,80,0.98)');
  g.addColorStop(1, 'rgba(104,78,56,0.98)');
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(80,56,40,0.34)';
  ctx.lineWidth = 0.3;
  for (let k = 0; k < 3; k++) {
    const s0 = rnd.range(0.05, 0.5);
    const s1 = rnd.range(s0 + 0.2, 0.98);
    const off = rnd.range(-0.3, 0.3) * th;
    ctx.beginPath();
    ctx.moveTo(xa + (xb - xa) * s0, y + off);
    ctx.lineTo(xa + (xb - xa) * s1, y + off + sag * 0.3);
    ctx.stroke();
  }
  ctx.setLineDash([16, 2.5, 7, 2]);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.4;
  ctx.stroke(p);
  ctx.setLineDash([]);
}

function picket(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, base: number, h: number, w: number, lean: number): void {
  const top = base - h;
  const pt = (px: number, py: number): [number, number] => [x + px + (base - py) * lean * -1, py];
  const pts: number[] = [];
  const add = (px: number, py: number) => {
    const [a, b] = pt(px, py);
    pts.push(a, b);
  };
  add(-w / 2, base);
  add(-w / 2 - 0.15, base - h * 0.5);
  add(-w / 2, top + 2.8);
  add(-w * 0.18, top + 0.5);
  add(0, top - 0.7);
  add(w * 0.18, top + 0.5);
  add(w / 2, top + 2.8);
  add(w / 2 + 0.15, base - h * 0.5);
  add(w / 2, base);
  const poly = deform(pts, rnd, 1, 0.012);
  // cast shadow on the lawn: to the lower right
  ctx.fillStyle = 'rgba(46,52,34,0.2)';
  tracePoly(ctx, [x - w / 2, base, x + w / 2, base, x + w / 2 + 10, base + 4.5, x - w / 2 + 10, base + 4.5]);
  ctx.fill();
  const worn = rnd.chance(0.18);
  const col = worn ? '#D8C49C' : rnd.pick(PAINT);
  ctx.fillStyle = rgba(col, 0.98);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // lit left edge, shaded right third, pooled at the foot and under the points
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, 'rgba(255,252,240,0.55)');
  g.addColorStop(0.4, 'rgba(255,252,240,0.05)');
  g.addColorStop(1, 'rgba(110,84,60,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(x - w, top - 2, w * 2, h + 3);
  const v = ctx.createLinearGradient(0, top, 0, base);
  v.addColorStop(0, 'rgba(255,250,235,0.18)');
  v.addColorStop(0.6, 'rgba(120,96,70,0)');
  v.addColorStop(1, 'rgba(96,84,52,0.34)');
  ctx.fillStyle = v;
  ctx.fillRect(x - w, top - 2, w * 2, h + 3);
  // flaked paint showing bare wood, and grain
  for (let i = 0, n = rnd.int(1, worn ? 5 : 3); i < n; i++) {
    ctx.fillStyle = rgba(BARE, rnd.range(0.35, 0.65));
    const fy = rnd.range(top + 3, base - 1);
    ctx.beginPath();
    ctx.ellipse(x + rnd.range(-0.35, 0.35) * w, fy, w * rnd.range(0.12, 0.3), rnd.range(0.8, 2.6), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,92,64,0.3)';
  ctx.lineWidth = 0.28;
  for (let k = 0; k < 2; k++) {
    const gx = x + rnd.range(-0.3, 0.3) * w;
    const y0 = rnd.range(top + 3, base - 8);
    ctx.beginPath();
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx + rnd.range(-0.4, 0.4), y0 + rnd.range(4, 12));
    ctx.stroke();
  }
  ctx.restore();
  ctx.setLineDash([6, 1.2, 3, 1]);
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.4;
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.setLineDash([]);
}

function post(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, base: number, h: number, w: number, cap: boolean): void {
  const top = base - h;
  ctx.fillStyle = 'rgba(46,52,34,0.22)';
  tracePoly(ctx, [x - w / 2, base, x + w / 2, base, x + w / 2 + 11, base + 5, x - w / 2 + 11, base + 5]);
  ctx.fill();
  const p = [x - w / 2, base, x - w / 2, top, x + w / 2, top, x + w / 2, base];
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, 'rgba(214,180,136,0.98)');
  g.addColorStop(0.45, 'rgba(168,128,90,0.98)');
  g.addColorStop(1, 'rgba(104,76,54,0.98)');
  ctx.fillStyle = g;
  tracePoly(ctx, deform(p, rnd, 1, 0.008));
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,56,40,0.4)';
  ctx.lineWidth = 0.3;
  for (let k = 0; k < 3; k++) {
    const gx = x + rnd.range(-0.3, 0.3) * w;
    const y0 = rnd.range(top + 2, base - 12);
    ctx.beginPath();
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y0 + rnd.range(5, 14));
    ctx.stroke();
  }
  if (cap) {
    // a pyramid cap
    ctx.fillStyle = 'rgba(156,118,82,0.98)';
    tracePoly(ctx, [x - w * 0.72, top + 0.6, x - w * 0.1, top - 4.2, x + w * 0.1, top - 4.2, x + w * 0.72, top + 0.6]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,220,0.34)';
    tracePoly(ctx, [x - w * 0.72, top + 0.6, x - w * 0.1, top - 4.2, x, top - 4.2, x - w * 0.05, top + 0.6]);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.4;
    tracePoly(ctx, [x - w * 0.72, top + 0.6, x - w * 0.1, top - 4.2, x + w * 0.1, top - 4.2, x + w * 0.72, top + 0.6]);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(96,70,50,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, top + 0.6, w / 2, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setLineDash([12, 2, 5, 2]);
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 0.5;
  tracePoly(ctx, p);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function paintPicketFence(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  const base = FENCE.y;
  const H = FENCE.h;
  const segs: Array<[number, number]> = [[FENCE.x0 - 4, FENCE.gate0 - 4], [FENCE.gate1 + 4, FENCE.x1 + 4]];
  // a soft strip of long grass for it to stand in
  const gg = ctx.createLinearGradient(0, base - 8, 0, base + 7);
  gg.addColorStop(0, 'rgba(170,176,86,0)');
  gg.addColorStop(0.5, 'rgba(150,160,70,0.28)');
  gg.addColorStop(1, 'rgba(120,134,56,0.34)');
  ctx.fillStyle = gg;
  ctx.fillRect(FENCE.x0 - 6, base - 8, FENCE.x1 - FENCE.x0 + 12, 15);
  // the open gate leaf, swung back into the side yard and seen nearly edge on, behind everything else
  {
    const hx = FENCE.gate0 - 0.5;
    const dx = 9;
    const dz = 6.5;
    const pts = [hx, base - 2, hx + dx, base - 2 - dz, hx + dx, base - 2 - dz - (H - 3), hx, base - 2 - (H - 3) + 1.5];
    ctx.fillStyle = 'rgba(46,52,34,0.18)';
    tracePoly(ctx, [hx, base - 2, hx + dx, base - 2 - dz, hx + dx + 8, base - 2 - dz + 3.5, hx + 8, base + 1.5]);
    ctx.fill();
    for (const f of [0.28, 0.68]) {
      ctx.strokeStyle = 'rgba(128,98,70,0.98)';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(hx, base - 2 - (H - 3) * f);
      ctx.lineTo(hx + dx, base - 2 - dz - (H - 3) * f);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      const x = hx + dx * t;
      const yb = base - 2 - dz * t;
      const w = 4.2 - t * 1.6;
      const h = H - 3 - 0.6;
      const poly = [x - w / 2, yb, x - w / 2, yb - h + 2, x, yb - h - 0.5, x + w / 2, yb - h + 2, x + w / 2, yb];
      ctx.fillStyle = rgba(rnd.pick(PAINT), 0.97);
      tracePoly(ctx, poly);
      ctx.fill();
      ctx.fillStyle = 'rgba(110,84,60,0.28)';
      ctx.fillRect(x + w * 0.1, yb - h + 2, w * 0.4, h - 2);
      ctx.strokeStyle = rgba(INK, 0.45);
      ctx.lineWidth = 0.34;
      tracePoly(ctx, poly);
      ctx.stroke();
    }
    void pts;
  }
  // rails first: they run behind the pickets
  for (const [a, b] of segs) {
    rail(ctx, rnd, a, b, base - H * 0.28, 3.2);
    rail(ctx, rnd, a, b, base - H * 0.7, 3.2);
  }
  // pickets
  for (const [a, b] of segs) {
    const n = Math.round((b - a) / 8.4);
    const step = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const x = a + step * (i + 0.5) + rnd.range(-0.5, 0.5);
      // a missing board in a long fence is a nice touch, but only once
      picket(ctx, rnd, x, base + rnd.range(-0.3, 0.7), H + rnd.range(-1.6, 1.4), 5.4 + rnd.range(-0.3, 0.4), rnd.chance(0.12) ? rnd.range(-0.06, 0.06) : rnd.range(-0.012, 0.012));
    }
  }
  // posts: every few bays, a little taller, with the gate posts capped
  for (const x of [FENCE.x0 + 16, FENCE.x0 + 44, FENCE.x1 - 44, FENCE.x1 - 16]) post(ctx, rnd, x, base + 0.5, H + 4, 6, false);
  for (const x of [FENCE.gate0 - 3, FENCE.gate1 + 3]) post(ctx, rnd, x, base + 1, H + 10, 7.4, true);
  // grass, dried stalks and a few late flowers at the foot
  const tufts = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62'];
  for (let x = FENCE.x0 - 4; x < FENCE.x1 + 4; x += 4.4) {
    if (x > FENCE.gate0 + 8 && x < FENCE.gate1 - 8) continue;
    grassTuft(ctx, x + rnd.range(-2, 2), base + rnd.range(0, 3), rnd.range(4, 8.5), rnd, 1.1, tufts);
  }
  for (const x of [FENCE.x0 + 8, FENCE.x0 + 30, FENCE.gate0 - 12, FENCE.gate1 + 11, FENCE.x1 - 22, FENCE.x1 - 6]) {
    const cols = ['#A98AD0', '#C58FC8', '#8F7CC8', '#D98AA6'];
    for (let k = 0; k < rnd.int(3, 5); k++) flowerDab(ctx, x + rnd.range(-6, 6), base - rnd.range(1.5, 9), rnd.range(1.2, 1.9), rnd.pick(cols), rnd);
  }
  // a few leaves stuck in the pickets' feet
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#D9A03C', '#C8683A', '#B8483A', '#E4B64E']), rnd.range(0.7, 0.95));
    almond(ctx, rnd.range(FENCE.x0, FENCE.x1), base + rnd.range(1, 5), rnd.range(0, 3), rnd.range(3, 5), 1.7, 0);
    ctx.fill();
  }
}
