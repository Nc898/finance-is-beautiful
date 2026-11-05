/**
 * Late-summer flowers of the verges, painted into the world layer: knapweed, field scabious, yarrow, ox-eye daisies,
 * a few poppies, wild carrot gone to its bird's-nest seed heads, dock in rusty seed, and the grasses gone to seed;
 * each a few strokes of transparent colour over a dry green, lit from the upper left. Planted in drifts along the
 * verge between the path and the track (clear of the crates), along the far side of the track, and in the long grass
 * at the very front, larger the nearer they are.
 */
import type { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { ribbon } from '../../river/scene/boatInk';
import { blobPoly, grassTuft } from '../../river/scene/paint';
import { CRATES, SEAT, TRACK } from './geom';
import { GRASS, seedHead, wild } from './ground';

const LEAVES = ['#7E8C48', '#909C52', '#6C7C40', '#A0A85E'];

function stem(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, w: number, col = 'rgba(104,120,64,0.8)'): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + (tx - x) * 0.2, y + (ty - y) * 0.6, tx, ty);
  ctx.stroke();
}

/** knapweed: a wiry branched stem, each head a tight dark knob of bracts crowned with a tuft of magenta florets */
export function knapweed(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const heads = rnd.int(1, 3);
  for (let k = 0; k < heads; k++) {
    const tx = x + rnd.range(-0.3, 0.3) * h;
    const ty = y - h * rnd.range(0.75, 1.05);
    stem(ctx, x, y, tx, ty, Math.max(0.25, h * 0.022));
    const r = h * 0.07;
    // the knob of bracts, brown-green, lit on its left
    ctx.fillStyle = rgba('#6A6438', 0.9);
    ctx.beginPath();
    ctx.ellipse(tx, ty + r * 0.4, r * 0.8, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,220,170,0.35)';
    ctx.beginPath();
    ctx.ellipse(tx - r * 0.3, ty + r * 0.2, r * 0.3, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // the florets: fine strokes fanning up and out
    for (let f = 0; f < 9; f++) {
      const a = -Math.PI / 2 + (f / 8 - 0.5) * 2.2;
      ctx.strokeStyle = rgba(rnd.pick(['#A8407E', '#B8569A', '#94346E', '#C46CA6']), 0.85);
      ctx.lineWidth = Math.max(0.2, r * 0.32);
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.3);
      ctx.lineTo(tx + Math.cos(a) * r * 1.5, ty - r * 0.2 + Math.sin(a) * r * 1.3);
      ctx.stroke();
    }
  }
  for (let k = 0; k < 2; k++) {
    ctx.fillStyle = rgba(rnd.pick(LEAVES), 0.6);
    ribbon(ctx, [x, y - h * 0.1, x + rnd.range(-0.25, 0.25) * h, y - h * rnd.range(0.3, 0.45)], h * 0.05, 0.9);
  }
}

/** field scabious: tall bare stems, each with a flat pincushion of pale lilac-blue, the outer florets bigger */
export function scabious(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const heads = rnd.int(1, 2);
  for (let k = 0; k < heads; k++) {
    const tx = x + rnd.range(-0.25, 0.25) * h;
    const ty = y - h * rnd.range(0.85, 1.1);
    stem(ctx, x, y, tx, ty, Math.max(0.22, h * 0.018));
    const r = h * 0.1;
    ctx.fillStyle = rgba(rnd.pick(['#A49CD4', '#B2A8DC', '#9890CA']), 0.85);
    for (let p = 0; p < 9; p++) {
      const a = (p / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(tx + Math.cos(a) * r * 0.75, ty + Math.sin(a) * r * 0.35, r * 0.34, r * 0.2, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba('#C6BEE8', 0.9);
    ctx.beginPath();
    ctx.ellipse(tx, ty - r * 0.05, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,96,160,0.4)';
    ctx.beginPath();
    ctx.ellipse(tx + r * 0.2, ty + r * 0.12, r * 0.4, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,240,0.5)';
    ctx.beginPath();
    ctx.ellipse(tx - r * 0.3, ty - r * 0.12, r * 0.2, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** yarrow: a stiff stem, feathery leaves, and a flat head of tiny cream florets with a blush of pink */
export function yarrow(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const tx = x + rnd.range(-0.12, 0.12) * h;
  const ty = y - h;
  stem(ctx, x, y, tx, ty, Math.max(0.25, h * 0.025));
  for (let k = 0; k < 4; k++) {
    const ly = y - h * (0.15 + k * 0.15);
    const s = k % 2 ? 1 : -1;
    ctx.strokeStyle = rgba(rnd.pick(LEAVES), 0.55);
    ctx.lineWidth = Math.max(0.2, h * 0.03);
    ctx.setLineDash([h * 0.02 + 0.2, h * 0.015 + 0.15]);
    ctx.beginPath();
    ctx.moveTo(x + (tx - x) * (1 - (ly - ty) / h), ly);
    ctx.lineTo(x + s * h * 0.16, ly - h * 0.05);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // a head is never drawn with a negative radius, whatever size it is asked for
  const R = Math.max(0, h * 0.17);
  const pink = rnd.chance(0.2);
  for (let i = 0; i < 16; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const d = Math.sqrt(rnd.next());
    ctx.fillStyle = rgba(pink ? rnd.pick(['#EAC8CE', '#F2DCDC']) : rnd.pick(['#F6F0DE', '#FBF6EA', '#EDE4C8']), 0.92);
    ctx.beginPath();
    ctx.arc(tx + Math.cos(a) * R * d, ty + Math.sin(a) * R * 0.32 * d, R * 0.15 + 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,112,90,0.25)';
  ctx.beginPath();
  ctx.ellipse(tx + R * 0.15, ty + R * 0.22, R * 0.8, R * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** an ox-eye daisy: a long stem, a big white flower with a golden eye, its petals shaded on the right */
export function oxeye(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const tx = x + rnd.range(-0.2, 0.2) * h;
  const ty = y - h;
  stem(ctx, x, y, tx, ty, Math.max(0.25, h * 0.022));
  const r = h * 0.12;
  const tilt = rnd.range(0.4, 0.75);
  for (let p = 0; p < 13; p++) {
    const a = (p / 13) * Math.PI * 2;
    const shade = Math.cos(a) > 0.3 && Math.sin(a) > -0.2;
    ctx.fillStyle = shade ? 'rgba(214,210,224,0.95)' : 'rgba(253,251,244,0.96)';
    ctx.beginPath();
    ctx.ellipse(tx + Math.cos(a) * r * 0.62, ty + Math.sin(a) * r * 0.62 * tilt, r * 0.42, r * 0.13, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba('#E8B030', 0.95);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r * 0.28, r * 0.24 * tilt + r * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,96,30,0.4)';
  ctx.beginPath();
  ctx.ellipse(tx + r * 0.08, ty + r * 0.05, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(rnd.pick(LEAVES), 0.55);
  ribbon(ctx, [x, y - h * 0.05, x + rnd.range(-0.2, 0.2) * h, y - h * 0.3], h * 0.05, 0.9);
}

/** a field poppy: a wiry hairy stem, a scarlet cup of four crumpled petals with a dark heart, or a nodding bud */
export function poppy(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const tx = x + rnd.range(-0.2, 0.2) * h;
  const ty = y - h;
  stem(ctx, x, y, tx, ty, Math.max(0.22, h * 0.02), 'rgba(110,128,70,0.8)');
  if (rnd.chance(0.25)) {
    // a seed pod, the petals fallen
    ctx.fillStyle = rgba('#8C9A5C', 0.9);
    ctx.beginPath();
    ctx.ellipse(tx, ty, h * 0.04, h * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#5E5A3A', 0.9);
    ctx.fillRect(tx - h * 0.04, ty - h * 0.06, h * 0.08, h * 0.015);
    return;
  }
  const r = h * 0.13;
  const col = rnd.pick(['#D8402C', '#E04E34', '#CC3424']);
  ctx.fillStyle = rgba(col, 0.9);
  tracePoly(ctx, deform(blobPoly(tx, ty, r, r * 0.72, rnd, 10, 0.2), rnd, 2, 0.1));
  ctx.fill();
  ctx.fillStyle = rgba(col, 0.55);
  tracePoly(ctx, deform(blobPoly(tx + r * 0.1, ty - r * 0.1, r * 0.8, r * 0.55, rnd, 10, 0.25), rnd, 2, 0.1));
  ctx.fill();
  // the shade in the cup, and the light lifting off its rim on the left
  ctx.fillStyle = 'rgba(110,20,30,0.32)';
  ctx.beginPath();
  ctx.ellipse(tx + r * 0.25, ty + r * 0.15, r * 0.6, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,214,190,0.4)';
  ctx.beginPath();
  ctx.ellipse(tx - r * 0.5, ty - r * 0.3, r * 0.3, r * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(36,26,30,0.85)';
  ctx.beginPath();
  ctx.arc(tx + r * 0.05, ty - r * 0.05, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** wild carrot gone to seed: the umbel curled in on itself into a little brown bird's nest */
export function birdsNest(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const tx = x + rnd.range(-0.15, 0.15) * h;
  const ty = y - h;
  stem(ctx, x, y, tx, ty, Math.max(0.25, h * 0.02), 'rgba(140,130,84,0.8)');
  const r = h * 0.1;
  ctx.fillStyle = rgba('#A08C5C', 0.75);
  ctx.beginPath();
  ctx.ellipse(tx, ty, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,80,50,0.6)';
  ctx.lineWidth = Math.max(0.15, r * 0.12);
  for (let k = 0; k < 6; k++) {
    const a = Math.PI + (k / 5) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(tx, ty + r * 0.5);
    ctx.quadraticCurveTo(tx + Math.cos(a) * r * 1.1, ty, tx + Math.cos(a) * r * 0.5, ty - r * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(250,240,214,0.4)';
  ctx.beginPath();
  ctx.ellipse(tx - r * 0.35, ty - r * 0.25, r * 0.3, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** dock in seed: a stiff spike of rusty seed clusters, the leaves at its foot gone a little red */
export function dock(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, h: number): void {
  const tx = x + rnd.range(-0.1, 0.1) * h;
  const ty = y - h;
  stem(ctx, x, y, tx, ty, Math.max(0.3, h * 0.025), 'rgba(132,92,58,0.85)');
  for (let k = 0; k < 14; k++) {
    const t = k / 14;
    const py = ty + t * h * 0.5;
    const px = tx + (x - tx) * t * 0.5;
    ctx.fillStyle = rgba(rnd.pick(['#9A6044', '#A87050', '#8A5838', '#B48660']), 0.6);
    ctx.beginPath();
    ctx.ellipse(px + rnd.range(-1, 1) * h * 0.04, py, h * 0.035, h * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of [-1, 1]) {
    ctx.fillStyle = rgba(rnd.pick(['#7A8444', '#8C7C44']), 0.65);
    ribbon(ctx, [x, y, x + s * h * 0.18, y - h * 0.12, x + s * h * 0.3, y - h * 0.1], h * 0.08, 0.9);
  }
}

type Kind = 'knapweed' | 'scabious' | 'yarrow' | 'oxeye' | 'poppy' | 'nest' | 'dock' | 'seed';

function plant(ctx: CanvasRenderingContext2D, rnd: Rand, kind: Kind, x: number, y: number, k: number): void {
  switch (kind) {
    case 'knapweed':
      return knapweed(ctx, rnd, x, y, 16 * k * rnd.range(0.8, 1.2));
    case 'scabious':
      return scabious(ctx, rnd, x, y, 18 * k * rnd.range(0.8, 1.2));
    case 'yarrow':
      return yarrow(ctx, rnd, x, y, 12 * k * rnd.range(0.8, 1.2));
    case 'oxeye':
      return oxeye(ctx, rnd, x, y, 14 * k * rnd.range(0.8, 1.2));
    case 'poppy':
      return poppy(ctx, rnd, x, y, 13 * k * rnd.range(0.8, 1.2));
    case 'nest':
      return birdsNest(ctx, rnd, x, y, 16 * k * rnd.range(0.8, 1.2));
    case 'dock':
      return dock(ctx, rnd, x, y, 22 * k * rnd.range(0.8, 1.2));
    case 'seed':
      return seedHead(ctx, rnd, x, y, 16 * k * rnd.range(0.8, 1.2));
  }
}

/** a size for depth: the nearer, the larger */
const kAt = (y: number): number => 0.7 + (y - 520) * 0.0062;

/** clear of the crates, the seat and the picker's patch beside them */
const clearOfCrates = (x: number, y: number): boolean => {
  for (const c of [CRATES.a, CRATES.b]) if (Math.abs(x - c.x) < 34 && Math.abs(y - c.y) < 14) return false;
  for (const s of [SEAT.a, SEAT.b]) if (Math.abs(x - s.x) < 20 && Math.abs(y - s.y) < 10) return false;
  return true;
};

/** drifts of a run of kinds between y0 and y1, planted in tight clumps so they read as plantings, not confetti */
function drifts(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, y0: number, y1: number, kinds: Kind[][], size: number, density: number): void {
  let x = x0;
  let i = rnd.int(0, kinds.length - 1);
  while (x < x1) {
    const w = rnd.range(40, 90);
    const ks = kinds[i++ % kinds.length]!;
    const pts: Array<{ x: number; y: number; kind: Kind }> = [];
    const clumps = Math.round((w / 16) * density);
    for (let c = 0; c < clumps; c++) {
      const cx = x + rnd.range(0, w);
      const cy = rnd.range(y0, y1);
      const kind = rnd.pick(ks);
      const n = rnd.int(2, 6);
      const r = 3 + (cy - y0) * 0.1;
      for (let j = 0; j < n; j++) pts.push({ x: cx + rnd.range(-1, 1) * r * 1.6, y: cy + rnd.range(-1, 1) * r * 0.4, kind });
    }
    pts.sort((a, b) => a.y - b.y);
    for (const p of pts) {
      if (!clearOfCrates(p.x, p.y) || !wild(p.x, p.y)) continue;
      plant(ctx, rnd, p.kind, p.x, p.y, kAt(p.y) * size);
    }
    x += w + rnd.range(0, 30);
  }
}

const VERGE: Kind[][] = [['knapweed', 'yarrow'], ['scabious', 'seed'], ['oxeye', 'oxeye', 'yarrow'], ['knapweed', 'poppy'], ['nest', 'seed'], ['scabious', 'knapweed'], ['seed', 'seed', 'dock']];

/** the verges: between the path and the track, along the near side of the track, and the long grass at the front */
export function paintVerges(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, yBottom0: number): void {
  // the camera's bottom edge can sit above the track on a very short canvas (a hidden or tiny viewport); the near
  // verge is then painted just under the track, out of sight, rather than up the picture, where the depth size goes
  // negative and arc() throws. Every real camera ends well below TRACK.y1 + 12, so this never moves a flower.
  const yBottom = Math.max(yBottom0, TRACK.y1 + 12);
  // between the path and the track (a strip of long grass with flowers in it)
  drifts(ctx, rnd, x0, x1, 536, TRACK.y0 - 3, VERGE, 0.95, 0.9);
  // the near verge, under the track: thicker, taller, and the long grass standing up out of it
  const top = TRACK.y1 + 2;
  for (let x = x0; x < x1; x += rnd.range(5, 11)) {
    const y = top + rnd.range(0, 6);
    grassTuft(ctx, x, y, rnd.range(6, 11), rnd, 1, GRASS);
    if (rnd.chance(0.45)) seedHead(ctx, rnd, x + rnd.range(-2, 2), y, rnd.range(14, 24));
  }
  drifts(ctx, rnd, x0, x1, top + 6, Math.min(yBottom, top + 50), VERGE, 1.25, 1.1);
  for (let x = x0; x < x1; x += rnd.range(4, 9)) {
    const y = rnd.range(top + 10, Math.min(yBottom, top + 60));
    grassTuft(ctx, x, y, rnd.range(8, 15), rnd, 1.2, GRASS);
    if (rnd.chance(0.3)) seedHead(ctx, rnd, x, y, rnd.range(18, 30));
  }
}
