/**
 * The foreground that frames the picture: an autumn border along the bottom edge of the view. Tall ornamental
 * grasses with feathery plumes, asters in violet and pink, sedum gone to rust, rudbeckia, low bronze foliage, and a
 * few big fallen leaves lying near the corners, a little out of focus. Heaviest at the two corners, low and
 * open in the middle so the central path keeps leading the eye in. Anchored to the bottom of the view.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, rgba, tracePoly } from '../../scene/watercolor';
import { grassTuft, strokePoly, type Pt } from '../../river/scene/paint';
import { LANE } from './layout';
import type { View } from './landscape';

const STRAW = ['#E6D69A', '#D8BE6A', '#C9A850', '#B8943E', '#CBA060'];
const COPPER = ['#C47E3E', '#B8683A', '#A85A32', '#D49448'];
const OLIVE = ['#9AA050', '#868E42', '#B0AC58', '#7C8A40'];
const ASTER = ['#A98AD0', '#C58FC8', '#8F7CC8', '#D98AA6', '#B49AD8', '#9A86C6'];
const SEDUM = ['#B0483C', '#C2574A', '#9C3A38', '#D07A6A', '#A8403A'];
const LEAVES = ['#D9A03C', '#C8683A', '#B8483A', '#E4B64E', '#A8522E', '#CC8A32', '#9A3A2E'];

function blade(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, L: number, ang: number, w: number, col: string, a: number): { x: number; y: number; ang: number } {
  const bend = rnd.range(0.2, 0.55) * Math.sign(ang || 1);
  const pts: Pt[] = [];
  const n = 10;
  let tx = 0;
  let ty = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // an arching curve: starts upright, leans over toward the tip's side
    const a2 = ang * Math.pow(t, 1.5) + bend * t * t;
    const px = x + Math.sin(a2) * L * t * 0.9 + ang * L * 0.22 * t * t;
    const py = y - Math.cos(a2 * 0.8) * L * t * 0.96 + L * 0.08 * t * t * Math.abs(ang);
    pts.push([px, py]);
    tx = px;
    ty = py;
  }
  const poly = strokePoly(pts, (t) => w * Math.pow(1 - t, 0.75) * (0.4 + 0.6 * Math.min(1, t * 6)));
  ctx.fillStyle = rgba(col, a);
  tracePoly(ctx, poly);
  ctx.fill();
  return { x: tx, y: ty, ang: ang + bend };
}

function plume(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, ang: number, L: number): void {
  const dir = ang - 0.3;
  ctx.fillStyle = rgba(rnd.pick(['#E9D3B8', '#EBD9C0', '#DEC2A6', '#F0E2CC']), 0.72);
  almond(ctx, x + Math.sin(dir) * L * 0.4, y - Math.cos(dir) * L * 0.4, dir - Math.PI / 2, L, L * 0.2, 0);
  ctx.fill();
  ctx.strokeStyle = rgba('#B89A7C', 0.42);
  ctx.lineWidth = 0.28;
  for (let i = 0; i < 5; i++) {
    const t = rnd.range(0.1, 0.9);
    const bx = x + Math.sin(dir) * L * t;
    const by = y - Math.cos(dir) * L * t;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.sin(dir + rnd.range(-0.6, 0.6)) * 3, by - Math.cos(dir + rnd.range(-0.6, 0.6)) * 3);
    ctx.stroke();
  }
}

/** a clump of arching grass blades with plumes, tall at the middle */
function grassClump(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const n = Math.round(18 + h * 0.5);
  const ends: Array<{ x: number; y: number; ang: number }> = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n / 2; i++) {
      const u = rnd.range(-1, 1);
      const L = h * (0.5 + 0.5 * (1 - Math.abs(u) * 0.7)) * rnd.range(0.8, 1.08) * (pass ? 0.8 : 1);
      const ang = u * rnd.range(0.55, 1.05);
      // the left blades catch the light
      const lit = ang < 0 ? 0.85 : 0.4;
      const col = rnd.chance(lit * 0.7) ? rnd.pick(STRAW) : rnd.chance(0.35) ? rnd.pick(COPPER) : rnd.pick(OLIVE);
      const e = blade(ctx, rnd, x + rnd.range(-3, 3), y, L, ang, rnd.range(1.1, 1.9) * (0.7 + h / 80), col, pass ? 0.78 : 0.9);
      if (!pass && Math.abs(u) < 0.6 && rnd.chance(0.45)) ends.push(e);
    }
  }
  for (const e of ends) plume(ctx, rnd, e.x, e.y, e.ang, rnd.range(9, 15) * (0.6 + h / 90));
  // dark thread at the root and a few fallen blades
  ctx.fillStyle = 'rgba(70,56,28,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 0.5, 7 + h * 0.07, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function aster(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number, col: string): void {
  // stem
  const tx = x + rnd.range(-0.2, 0.2) * h;
  const ty = y - h;
  ctx.strokeStyle = 'rgba(92,112,56,0.78)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + (tx - x) * 0.2, y - h * 0.55, tx, ty);
  ctx.stroke();
  // lance leaves up the stem
  for (let i = 0; i < 4; i++) {
    const t = rnd.range(0.15, 0.8);
    const lx = x + (tx - x) * t;
    const ly = y - h * t;
    ctx.fillStyle = rgba(rnd.pick(['#6E8A44', '#7E9A4A', '#5C7A3C']), 0.8);
    almond(ctx, lx + rnd.range(-2, 2), ly, rnd.range(-0.6, 0.6) + (i % 2 ? 0.4 : -0.4) - Math.PI / 2 + Math.PI / 2, 5, 1.3, 0);
    ctx.fill();
  }
  // a head of tiny daisies
  const r = h * 0.075 + 1;
  for (let i = 0; i < 6; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = rnd.range(0, 1) * r * 1.5;
    const px = tx + Math.cos(a) * d;
    const py = ty + Math.sin(a) * d * 0.8;
    const rr = r * rnd.range(0.55, 0.85);
    ctx.fillStyle = rgba(col, 0.82);
    for (let k = 0; k < 7; k++) {
      almond(ctx, px, py, (k / 7) * Math.PI * 2 + a, rr * 2.1, rr * 0.34, 0);
      ctx.fill();
    }
    ctx.fillStyle = rgba('#E8B83C', 0.9);
    ctx.beginPath();
    ctx.arc(px, py, rr * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sedum(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  ctx.strokeStyle = 'rgba(112,128,72,0.85)';
  ctx.lineWidth = 1.4;
  const stems = rnd.int(3, 5);
  for (let s = 0; s < stems; s++) {
    const tx = x + (s - (stems - 1) / 2) * h * 0.2 + rnd.range(-1, 1);
    const ty = y - h * rnd.range(0.8, 1.1);
    ctx.beginPath();
    ctx.moveTo(x + rnd.range(-2, 2), y);
    ctx.quadraticCurveTo(tx * 0.5 + x * 0.5, y - h * 0.5, tx, ty);
    ctx.stroke();
    const r = h * 0.2;
    const col = rnd.pick(SEDUM);
    for (let k = 0; k < 14; k++) {
      const a = rnd.range(0, Math.PI * 2);
      const d = Math.sqrt(rnd.next()) * r;
      ctx.fillStyle = rgba(rnd.chance(0.3) ? rnd.pick(SEDUM) : col, rnd.range(0.55, 0.85));
      ctx.beginPath();
      ctx.arc(tx + Math.cos(a) * d, ty + Math.sin(a) * d * 0.55, rnd.range(0.8, 1.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,230,200,0.28)';
    ctx.beginPath();
    ctx.ellipse(tx - r * 0.3, ty - r * 0.2, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rudbeckia(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const ty = y - h;
  ctx.strokeStyle = 'rgba(96,116,58,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + rnd.range(-3, 3), y - h * 0.5, x, ty);
  ctx.stroke();
  const r = h * 0.12 + 1.4;
  const petal = rnd.pick(['#E8A82C', '#F0BC38', '#E08A28']);
  for (let k = 0; k < 11; k++) {
    ctx.fillStyle = rgba(petal, 0.88);
    almond(ctx, x, ty, (k / 11) * Math.PI * 2, r * 2.4, r * 0.42, 0);
    ctx.fill();
  }
  ctx.fillStyle = rgba('#5A3A22', 0.92);
  ctx.beginPath();
  ctx.ellipse(x, ty, r * 0.55, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** a maple leaf lying flat (foreshortened), with veins; blurred a touch by the caller */
function mapleLeaf(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, s: number, rot: number, col: string): void {
  const pts: number[] = [];
  const lobes = 5;
  for (let i = 0; i < lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI * 2 - Math.PI / 2;
    const tip = i % 2 === 0;
    const r = tip ? (i === 0 ? 1 : 0.88) : 0.4;
    const d = r * s * rnd.range(0.92, 1.06);
    pts.push(Math.cos(a) * d, Math.sin(a) * d * (a > 0.2 && a < 2.9 && !tip ? 1 : 1));
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, 0.62);
  const poly = deform(pts, rnd, 1, 0.05);
  ctx.fillStyle = rgba(col, 0.92);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.22)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.25, -s * 0.25, s * 0.4, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,40,24,0.4)';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  for (let i = 0; i < lobes; i++) {
    ctx.moveTo(0, s * 0.1);
    ctx.lineTo(pts[i * 4]! * 0.8, pts[i * 4 + 1]! * 0.8);
  }
  ctx.moveTo(0, s * 0.1);
  ctx.lineTo(0, s * 0.7);
  ctx.stroke();
  ctx.restore();
}

export function paintBorder(ctx: CanvasRenderingContext2D, rnd: Rand, v: View, gd: number): void {
  // the view's bottom edge (the layer reaches a little beyond the screen)
  const yb = v.ymax - 18;
  // the whole width of the view, however wide the window (the side panel can be collapsed)
  const x0 = v.xmin;
  const x1 = v.xmax;
  const laneGap = 46;
  // a deepening of the lawn along the very bottom, as the nearest ground goes into shade and saturation
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, yb - 70, 0, yb + 6);
  g.addColorStop(0, 'rgba(176,160,70,0)');
  g.addColorStop(1, 'rgba(150,140,54,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, yb - 70, x1 - x0, 80);
  ctx.restore();

  // blurred nearest layer: big fallen leaves near the corners
  ctx.save();
  ctx.filter = `blur(${(1.3 * gd).toFixed(2)}px)`;
  for (let i = 0; i < 16; i++) {
    const left = i % 2 === 0;
    const x = left ? rnd.range(x0, x0 + 260) : rnd.range(x1 - 260, x1);
    if (Math.abs(x - LANE.x) < laneGap + 20) continue;
    mapleLeaf(ctx, rnd, x, yb - rnd.range(4, 34), rnd.range(8, 17), rnd.range(0, Math.PI * 2), rnd.pick(LEAVES));
  }
  ctx.restore();

  // positions along the edge: dense at the two corners, sparse in the middle
  const spots: Array<{ x: number; w: number }> = [];
  for (let x = x0; x < x1; ) {
    // dense from the corners of the garden outward to the view's edges, open in the middle
    const edge = Math.min(1, Math.min(Math.max(0, x - 40), Math.max(0, 960 - x)) / 240);
    const gap = rnd.range(18, 32) * (0.7 + 0.8 * edge);
    if (Math.abs(x - LANE.x) > laneGap) spots.push({ x, w: 1 - 0.55 * edge });
    x += gap;
  }
  // far to near so the nearer plants overlap the farther: grasses first
  const rows = [
    { dy: 44, k: 1.0 },
    { dy: 30, k: 1.1 },
    { dy: 16, k: 1.25 },
    { dy: 4, k: 1.4 },
  ];
  for (const row of rows) {
    for (const s of spots) {
      if (!rnd.chance(0.5 + 0.5 * s.w)) continue;
      const x = s.x + rnd.range(-12, 12);
      const y = yb - row.dy + rnd.range(-2, 2);
      const t = rnd.next();
      const big = s.w > 0.7;
      if (t < 0.34 && row.k < 1.3) grassClump(ctx, rnd, x, y, rnd.range(big ? 60 : 34, big ? 104 : 58) * row.k * 0.9);
      else if (t < 0.55) {
        const col = rnd.pick(ASTER);
        for (let k = 0; k < rnd.int(4, 8); k++) aster(ctx, rnd, x + rnd.range(-12, 12), y + rnd.range(-1, 2), rnd.range(22, big ? 46 : 32) * row.k * 0.9, col);
      } else if (t < 0.68) sedum(ctx, rnd, x, y, rnd.range(16, 27) * row.k);
      else if (t < 0.82) {
        for (let k = 0; k < rnd.int(2, 5); k++) rudbeckia(ctx, rnd, x + rnd.range(-10, 10), y + rnd.range(-1, 2), rnd.range(16, 30) * row.k);
      } else {
        // low mound of bronze foliage with grass
        for (let k = 0; k < 6; k++) grassTuft(ctx, x + rnd.range(-12, 12), y + rnd.range(-2, 2), rnd.range(6, 12) * row.k, rnd, 1.6, ['#A8A04A', '#8E9A42', '#C2A850', '#B8743A']);
      }
    }
  }
  // dry grass tufts across the whole bottom, large and soft
  for (let x = x0; x < x1; x += rnd.range(7, 16)) {
    if (Math.abs(x - LANE.x) < laneGap - 12) continue;
    grassTuft(ctx, x, yb - rnd.range(-2, 12), rnd.range(7, 14), rnd, 1.7, ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444']);
  }
  void clamp;
}
