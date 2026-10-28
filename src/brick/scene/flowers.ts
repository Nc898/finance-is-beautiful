/**
 * Spring flowers, painted into the world layer: daffodils, tulips, bluebells, primroses, forget-me-nots and cow
 * parsley, each a few strokes of transparent colour over an ink-free green, lit from the upper left; planted in drifts
 * along the near verge (larger the nearer they are) and in beds round the houses: inside the garden fences, beside
 * each house, and either side of the blossom tree, always clear of the builder's way, the pallet, the hoist, the
 * bench and the gate.
 */
import type { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { ribbon } from '../../river/scene/boatInk';
import { blobPoly, grassTuft } from '../../river/scene/paint';
import { BLOSSOM, FENCE_Y, GATE, GROUND_Y, JUNCTION, LANE } from './geom';

const LEAVES = ['#6E9A48', '#86AE56', '#5C8A40', '#7AA24E'];

/** a daffodil: strap leaves, a stem, a nodding six-petalled flower with an orange trumpet */
export function daffodil(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba(rnd.pick(LEAVES), 0.75);
    const tx = x + rnd.range(-0.35, 0.35) * h;
    ribbon(ctx, [x + rnd.range(-0.5, 0.5), y, (x + tx) / 2, y - h * 0.4, tx, y - h * rnd.range(0.55, 0.85)], h * 0.07, 0.95);
  }
  const fx = x + rnd.range(-0.15, 0.25) * h;
  const fy = y - h;
  ctx.strokeStyle = 'rgba(96,136,64,0.8)';
  ctx.lineWidth = h * 0.04;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x, y - h * 0.6, fx, fy);
  ctx.stroke();
  const r = h * 0.17;
  ctx.fillStyle = rgba(rnd.pick(['#F6D654', '#F8E070', '#F2CC48']), 0.92);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * r * 0.6, fy + Math.sin(a) * r * 0.45, r * 0.55, r * 0.3, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(rnd.pick(['#EC9634', '#F0AE3C']), 0.95);
  ctx.beginPath();
  ctx.ellipse(fx + r * 0.25, fy + r * 0.1, r * 0.36, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,220,0.5)';
  ctx.beginPath();
  ctx.ellipse(fx - r * 0.3, fy - r * 0.2, r * 0.2, r * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

const TULIPS = ['#D8384A', '#E8644A', '#F2C24A', '#C83A6A', '#F08AA0', '#B8284A', '#F4F0E6'];

/** a tulip: two broad leaves, a straight stem, a closed cup of three petals, lit on its left */
export function tulip(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number, col = rnd.pick(TULIPS)): void {
  for (const s of [-1, 1]) {
    ctx.fillStyle = rgba(rnd.pick(['#6E9A58', '#7EA866', '#5E8A4C']), 0.82);
    ribbon(ctx, [x, y, x + s * h * 0.12, y - h * 0.3, x + s * h * 0.2, y - h * rnd.range(0.45, 0.6)], h * 0.09, 0.9);
  }
  const fx = x + rnd.range(-0.06, 0.06) * h;
  const fy = y - h;
  ctx.strokeStyle = 'rgba(100,140,72,0.85)';
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(fx, fy + h * 0.08);
  ctx.stroke();
  const w = h * 0.13;
  const ph = h * 0.22;
  ctx.fillStyle = rgba(col, 0.94);
  tracePoly(ctx, [fx - w, fy - ph * 0.85, fx - w * 0.4, fy - ph * 0.6, fx, fy - ph, fx + w * 0.4, fy - ph * 0.6, fx + w, fy - ph * 0.85, fx + w * 0.95, fy - ph * 0.2, fx, fy + ph * 0.12, fx - w * 0.95, fy - ph * 0.2]);
  ctx.fill();
  // the shade on its right, the light lifting off its left
  ctx.fillStyle = 'rgba(70,20,40,0.22)';
  tracePoly(ctx, [fx + w * 0.15, fy - ph * 0.7, fx + w, fy - ph * 0.8, fx + w * 0.9, fy - ph * 0.2, fx + w * 0.1, fy + ph * 0.05]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,236,0.45)';
  ctx.beginPath();
  ctx.ellipse(fx - w * 0.5, fy - ph * 0.5, w * 0.22, ph * 0.28, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** a clump of bluebells: arching stems hung with little violet-blue bells on one side */
export function bluebells(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = rgba(rnd.pick(LEAVES), 0.7);
    const tx = x + rnd.range(-0.4, 0.4) * h;
    ribbon(ctx, [x, y, (x + tx) / 2, y - h * 0.25, tx, y - h * 0.4], h * 0.05, 0.95);
  }
  const n = rnd.int(2, 4);
  for (let s = 0; s < n; s++) {
    const bx = x + rnd.range(-0.25, 0.25) * h;
    const lean = rnd.range(0.15, 0.35) * h * (rnd.chance(0.5) ? 1 : -1);
    const top = { x: bx + lean, y: y - h * rnd.range(0.85, 1.05) };
    ctx.strokeStyle = 'rgba(90,130,70,0.8)';
    ctx.lineWidth = h * 0.03;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx, top.y + h * 0.2, top.x, top.y);
    ctx.stroke();
    for (let b = 0; b < 6; b++) {
      const t = 0.35 + (b / 6) * 0.65;
      const px = bx + (top.x - bx) * t * t;
      const py = y + (top.y - y) * t;
      ctx.fillStyle = rgba(rnd.pick(['#5E6ACC', '#6E78D6', '#5260BE', '#7C84DC']), 0.9);
      ctx.beginPath();
      ctx.ellipse(px + Math.sign(lean) * h * 0.05, py + h * 0.05, h * 0.045, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** a primrose: a rosette of crinkled leaves and a few pale yellow flowers with a deeper eye */
export function primrose(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, r: number): void {
  for (let k = 0; k < 6; k++) {
    const a = Math.PI + (k / 5) * Math.PI;
    ctx.fillStyle = rgba(rnd.pick(['#7EA850', '#8CB45C', '#6C9A46']), 0.75);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 0.35, r * 0.8, r * 0.3, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const n = rnd.int(3, 5);
  for (let f = 0; f < n; f++) {
    const fx = x + rnd.range(-1.1, 1.1) * r;
    const fy = y - rnd.range(0.2, 0.7) * r;
    ctx.fillStyle = rgba(rnd.pick(['#F8EEA0', '#F4E48A', '#FAF2B8']), 0.95);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * r * 0.22, fy + Math.sin(a) * r * 0.16, r * 0.2, r * 0.15, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(232,160,60,0.9)';
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a low mound of forget-me-nots: a haze of tiny sky-blue flowers over soft green */
export function forgetMeNots(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, r: number): void {
  ctx.fillStyle = rgba('#7EA858', 0.5);
  tracePoly(ctx, deform(blobPoly(x, y - r * 0.35, r, r * 0.45, rnd, 12, 0.2), rnd, 2, 0.08));
  ctx.fill();
  for (let i = 0; i < r * 5; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = Math.sqrt(rnd.next());
    ctx.fillStyle = rgba(rnd.pick(['#8CB8EC', '#9EC4F0', '#7AA8E2', '#B8D4F4']), 0.95);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * d, y - r * 0.4 + Math.sin(a) * r * 0.45 * d, r * 0.07 + 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(248,226,120,0.8)';
  for (let i = 0; i < r * 1.2; i++) ctx.fillRect(x + rnd.range(-r, r) * 0.8, y - r * 0.4 + rnd.range(-r, r) * 0.35, 0.3, 0.3);
}

/** cow parsley: a tall stem and lace-white umbels, airy at the verge's edge */
export function cowParsley(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const heads = rnd.int(2, 3);
  for (let k = 0; k < heads; k++) {
    const tx = x + rnd.range(-0.25, 0.25) * h;
    const ty = y - h * rnd.range(0.75, 1);
    ctx.strokeStyle = 'rgba(110,140,80,0.75)';
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (tx - x) * 0.3, y - h * 0.5, tx, ty);
    ctx.stroke();
    const R = h * rnd.range(0.12, 0.17);
    for (let u = 0; u < 9; u++) {
      const a = Math.PI + (u / 8) * Math.PI;
      const ux = tx + Math.cos(a) * R;
      const uy = ty + Math.sin(a) * R * 0.45 - R * 0.15;
      ctx.strokeStyle = 'rgba(120,150,90,0.5)';
      ctx.lineWidth = h * 0.008;
      ctx.beginPath();
      ctx.moveTo(tx, ty + R * 0.2);
      ctx.lineTo(ux, uy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(252,250,240,0.95)';
      for (let d = 0; d < 4; d++) {
        ctx.beginPath();
        ctx.arc(ux + rnd.range(-1, 1) * R * 0.15, uy - rnd.range(0, 1) * R * 0.12, R * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba(rnd.pick(LEAVES), 0.6);
    ctx.beginPath();
    ctx.ellipse(x + rnd.range(-0.15, 0.15) * h, y - h * rnd.range(0.05, 0.2), h * 0.1, h * 0.05, rnd.range(-0.5, 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

type Kind = 'daffodil' | 'tulip' | 'bluebell' | 'primrose' | 'forget' | 'parsley';

/** one flower of a kind at a place, at a size for its depth (k) */
function plant(ctx: CanvasRenderingContext2D, rnd: Rand, kind: Kind, x: number, y: number, k: number): void {
  switch (kind) {
    case 'daffodil':
      return daffodil(ctx, rnd, x, y, 12 * k * rnd.range(0.85, 1.15));
    case 'tulip':
      return tulip(ctx, rnd, x, y, 13 * k * rnd.range(0.85, 1.15));
    case 'bluebell':
      return bluebells(ctx, rnd, x, y, 10 * k * rnd.range(0.85, 1.15));
    case 'primrose':
      return primrose(ctx, rnd, x, y, 3.2 * k * rnd.range(0.85, 1.15));
    case 'forget':
      return forgetMeNots(ctx, rnd, x, y, 5 * k * rnd.range(0.85, 1.2));
    case 'parsley':
      return cowParsley(ctx, rnd, x, y, 26 * k * rnd.range(0.85, 1.15));
  }
}

/** a size for depth: the nearer, the larger */
const kAt = (y: number): number => 0.75 + (y - 470) * 0.0042;

/** a bed of dug earth with a mix of flowers in it, planted back to front */
function bed(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, y0: number, y1: number, kinds: Kind[], n: number, soil = true, size = 1.15): void {
  if (soil) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 + 1;
    ctx.fillStyle = rgba('#A88A64', 0.22);
    tracePoly(ctx, deform(blobPoly(cx, cy, (x1 - x0) / 2 + 2, (y1 - y0) / 2 + 1.5, rnd, 18, 0.1), rnd, 2, 0.04));
    ctx.fill();
  }
  const pts: Array<{ x: number; y: number; kind: Kind }> = [];
  for (let i = 0; i < n; i++) pts.push({ x: rnd.range(x0, x1), y: rnd.range(y0, y1), kind: rnd.pick(kinds) });
  pts.sort((a, b) => a.y - b.y);
  for (const p of pts) plant(ctx, rnd, p.kind, p.x, p.y, kAt(p.y) * size);
}

/** the beds round both houses (house A's side; house B's is its mirror image) */
export function paintBeds(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  for (const id of ['a', 'b'] as const) {
    const m = (x: number) => (id === 'a' ? x : 1000 - x);
    const span = (a: number, b: number): [number, number] => [Math.min(m(a), m(b)), Math.max(m(a), m(b))];
    const gate = GATE[id];
    const g0 = Math.min(gate.x0, gate.x1);
    const g1 = Math.max(gate.x0, gate.x1);
    // along the inside of the garden fence, either side of the path from the gate (clear of the bench and the sand)
    const [a0, a1] = span(196, 296);
    if (a0 > g1 || a1 < g0) bed(ctx, rnd, a0, a1, FENCE_Y - 9, FENCE_Y - 2, ['tulip', 'tulip', 'forget', 'daffodil'], 40);
    const [b0, b1] = span(344, 398);
    bed(ctx, rnd, b0, b1, FENCE_Y - 9, FENCE_Y - 2, ['tulip', 'primrose', 'forget'], 22);
    // beside the house, beyond the hoist, at the outer edge of the garden
    const [c0, c1] = span(14, 56);
    bed(ctx, rnd, c0, c1, GROUND_Y + 6, FENCE_Y - 4, ['bluebell', 'primrose', 'daffodil', 'forget'], 30, false);
  }
  // either side of the blossom tree (clear of the road), and a ring of primroses round its foot
  const roadL = JUNCTION.x - 22;
  bed(ctx, rnd, 400, Math.min(446, roadL - 30), FENCE_Y - 22, FENCE_Y - 4, ['tulip', 'bluebell', 'forget', 'daffodil'], 26, false);
  bed(ctx, rnd, JUNCTION.x + 30, 606, FENCE_Y - 22, FENCE_Y - 4, ['tulip', 'bluebell', 'forget', 'primrose'], 24, false);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9);
    primrose(ctx, rnd, BLOSSOM.x + Math.cos(a) * 22, BLOSSOM.y + 2 + Math.sin(a) * 4, 2.6);
  }
}

/** the near verge below the lane: drifts of flowers all along it, larger toward us, cow parsley at the back */
export function paintForeground(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, yBottom: number): void {
  const top = LANE.y1 + 3;
  // tall cow parsley along the lane's edge first (it stands behind the lower flowers)
  for (let x = x0; x < x1; x += rnd.range(22, 46)) {
    if (Math.abs(x - JUNCTION.x) < 26) continue;
    cowParsley(ctx, rnd, x, top + rnd.range(0, 4), 22 * rnd.range(0.85, 1.2));
  }
  // drifts: each a run of one or two kinds, planted in tight clumps so they read as plantings rather than confetti
  const kinds: Kind[][] = [['daffodil'], ['tulip', 'tulip', 'forget'], ['bluebell', 'primrose'], ['daffodil', 'primrose'], ['tulip'], ['forget', 'bluebell']];
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = rnd.range(50, 90);
    const ks = kinds[i++ % kinds.length]!;
    const pts: Array<{ x: number; y: number; kind: Kind }> = [];
    const clumps = Math.round(w / 14);
    for (let c = 0; c < clumps; c++) {
      const cx = x + rnd.range(0, w);
      const cy = rnd.range(top + 8, Math.min(yBottom, top + 70));
      const kind = rnd.pick(ks);
      const n = rnd.int(4, 8);
      const r = 4 + (cy - top) * 0.12;
      for (let j = 0; j < n; j++) pts.push({ x: cx + rnd.range(-1, 1) * r * 1.6, y: cy + rnd.range(-1, 1) * r * 0.5, kind });
    }
    pts.sort((a, b) => a.y - b.y);
    for (const p of pts) {
      if (Math.abs(p.x - JUNCTION.x) < 20 && p.y < top + 10) continue;
      plant(ctx, rnd, p.kind, p.x, p.y, kAt(p.y) * 1.45);
    }
    for (let j = 0; j < 5; j++) grassTuft(ctx, x + rnd.range(0, w), rnd.range(top + 8, top + 60), rnd.range(6, 11), rnd, 1, ['#9DC25C', '#6E9A48', '#B6D26A']);
    x += w + rnd.range(-10, 6);
  }
}
