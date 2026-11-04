/**
 * The farmer's tree (the employer): a big, old, gnarled apple tree in front in the middle, painted once per size.
 *
 * The wood is drawn in ink under its washes, as Time to Grow's trunks are (treePainter.ts): a grey-brown bark wash,
 * warm tan on the lit side and umber going to violet on the shaded, the bark tile's grain, scaly plates and fissures
 * in short dark strokes, a pale stripe where the sun runs along it, and a broken sepia contour, heavier on the side
 * away from the light. It has character: it leans a little to the left and corrects, the trunk is split by an old
 * wound gone dark and hollow, lichen grows grey-green and orange on its sunny side and moss at its foot, a burr or
 * two, roots flaring into the grass.
 *
 * The crown is the late-summer leaf (summerArt.ts) in clumps laid by where each sits against the light (back
 * masses, then the limbs, then the shade, the middle and the lit clumps over them), a broad old dome wider than it
 * is tall, heavy with red apples: many small translucent dabs, each with its light lifting off the upper left, a
 * darker crescent under it, the shaded ones dull and crimson, some russet-gold with a red flush.
 *
 * The low boughs (BOUGH) reach out to either side under the crown, sagging under their fruit, with pendant shoots
 * and their leaf hanging from them; the picker part (picker.ts) hangs the low fruit in them. A few sprays of leaf are
 * kept apart as the tree's front parts (drawn in depth order after the low fruit and the ladder), so the fruit's
 * stalks tuck in among the leaves and the ladder's top goes in behind the foliage.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly, almond, type SpriteKind } from '../../scene/watercolor';
import { barkPattern } from '../../scene/treePainter';
import { grassTuft, blobPoly } from '../../river/scene/paint';
import { smoothPoly, TO_LIGHT, type Pt } from '../../river/scene/boatInk';
import type { Sprites } from '../../scene/sprites';
import { BOUGH, FARM_TREE, LADDER } from './geom';
import { drawClump, summerSprites } from './summerArt';
import { GRASS } from './ground';
import type { PickerId } from '../types';

/** a painting of part of the tree, and the world rect it covers */
export interface TreeSprite {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FarmTreeArt {
  /** the trunk, the limbs, the crown and its high fruit, the low boughs and their leaf (depth FARM_TREE.y) */
  body: TreeSprite;
  /** sprays of leaf along each low bough, over the low fruit (depth just after BOUGH.y) */
  boughFront: Record<PickerId, TreeSprite>;
  /** the foliage in front of the ladder's top (depth just after the ladder's foot) */
  ladderFront: TreeSprite;
  /** a few apples high in the crown (world units) that may drop now and then (ambient.ts) */
  dropFrom: Array<{ x: number; y: number }>;
}

const INK = '#2F2A22';

/** the crown: a broad old dome made of overlapping lobes (centre, radii) */
const LOBES = [
  { x: 500, y: 238, rx: 196, ry: 124 },
  { x: 506, y: 176, rx: 132, ry: 64 },
  { x: 398, y: 296, rx: 100, ry: 72 },
  { x: 606, y: 292, rx: 96, ry: 74 },
  { x: 330, y: 250, rx: 48, ry: 40 },
  { x: 676, y: 246, rx: 46, ry: 40 },
] as const;
const inCrown = (x: number, y: number, k = 1): boolean => LOBES.some((l) => ((x - l.x) / (l.rx * k)) ** 2 + ((y - l.y) / (l.ry * k)) ** 2 < 1);
/** where a point of the crown sits against the light: its outward normal on the dome, and the light on it */
function domeAt(x: number, y: number): { d: number; nx: number; ny: number; light: number } {
  const nx = (x - 500) / 205;
  const ny = (y - 236) / 132;
  const d = Math.hypot(nx, ny);
  const light = (TO_LIGHT[0] * nx + TO_LIGHT[1] * ny) / Math.max(d, 0.35);
  return { d, nx, ny, light };
}

/* ------------------------------------------------------------------ the wood */

interface Limb {
  pts: Pt[];
  r0: number;
  r1: number;
  /** gnarl: how lumpy its outline is */
  gn: number;
}

const F = FARM_TREE;
/** the low boughs' lines (they sag under the fruit), the trunk, the limbs into the crown, and the roots */
const LIMBS: Limb[] = [
  // the roots, flaring into the grass
  { pts: [[490, 482], [474, 489], [458, 492], [446, 493]], r0: 7, r1: 1.2, gn: 0.1 },
  { pts: [[510, 482], [528, 489], [546, 492], [560, 494]], r0: 7.5, r1: 1.2, gn: 0.1 },
  { pts: [[500, 484], [503, 492], [506, 496]], r0: 6, r1: 2, gn: 0.1 },
  // the scaffold limbs up into the crown, and their side branches
  { pts: [[490, 388], [470, 352], [446, 318], [418, 286], [388, 262], [356, 246]], r0: 10, r1: 2.4, gn: 0.12 },
  { pts: [[446, 318], [404, 318], [362, 312], [326, 300]], r0: 4.6, r1: 1.6, gn: 0.1 },
  { pts: [[499, 386], [503, 344], [497, 302], [505, 252], [500, 196], [510, 150]], r0: 10, r1: 2.2, gn: 0.12 },
  { pts: [[499, 300], [468, 254], [446, 206], [430, 172]], r0: 5, r1: 1.6, gn: 0.1 },
  { pts: [[505, 252], [548, 210], [578, 180], [600, 164]], r0: 4.4, r1: 1.5, gn: 0.1 },
  { pts: [[508, 384], [530, 350], [560, 314], [596, 284], [630, 262], [660, 250]], r0: 9.5, r1: 2.4, gn: 0.12 },
  { pts: [[540, 336], [584, 324], [626, 322], [668, 314]], r0: 4.6, r1: 1.6, gn: 0.1 },
  // the trunk: a lean to the left, then back
  { pts: [[500, 492], [499, 470], [494, 446], [490, 422], [493, 402], [498, 386], [500, 376]], r0: 17, r1: 12, gn: 0.09 },
];
/** the low boughs: out from the fork and sagging, A's to the left, B's to the right */
const BOUGHS: Record<PickerId, Limb> = {
  a: { pts: [[493, 392], [474, 386], [452, 389], [430, 396], [410, 405], [392, 414], [380, 420]], r0: 9.5, r1: 1.4, gn: 0.1 },
  b: { pts: [[506, 390], [526, 384], [550, 388], [572, 396], [592, 405], [610, 413], [622, 418]], r0: 9.5, r1: 1.4, gn: 0.1 },
};

/** a limb's outline: the smoothed centre line, the radius along it, the normals (toward the light where litS > 0) */
function shape(l: Limb, rnd: Rand): { P: Pt[]; R: number[]; N: Pt[]; litS: number } {
  const flatPts = smoothPoly(l.pts, 6, false);
  const P: Pt[] = [];
  for (let i = 0; i < flatPts.length; i += 2) P.push([flatPts[i]!, flatPts[i + 1]!]);
  const n = P.length;
  const ph = rnd.range(0, 6);
  const R: number[] = [];
  const N: Pt[] = [];
  let lit = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    R.push((l.r0 + (l.r1 - l.r0) * Math.pow(t, 0.85)) * (1 + l.gn * Math.sin(t * 19 + ph) + l.gn * 0.6 * Math.sin(t * 41 + ph * 2)));
    const a = P[Math.max(0, i - 1)]!;
    const b = P[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    N.push([nx, ny]);
    lit += nx * TO_LIGHT[0] + ny * TO_LIGHT[1];
  }
  return { P, R, N, litS: lit >= 0 ? 1 : -1 };
}

/** a band of the limb between two offsets across it (f: −1 the shaded edge … 1 the lit edge) */
function band(ctx: CanvasRenderingContext2D, s: ReturnType<typeof shape>, f0: number, f1: number, rnd: Rand, jit = 0.08): void {
  const { P, R, N, litS } = s;
  ctx.beginPath();
  for (let i = 0; i < P.length; i++) {
    const f = f0 + rnd.range(-jit, jit);
    ctx.lineTo(P[i]![0] + N[i]![0] * R[i]! * litS * f, P[i]![1] + N[i]![1] * R[i]! * litS * f);
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const f = f1 + rnd.range(-jit, jit) * 1.4;
    ctx.lineTo(P[i]![0] + N[i]![0] * R[i]! * litS * f, P[i]![1] + N[i]![1] * R[i]! * litS * f);
  }
  ctx.closePath();
}

/** paint one limb: ink under washes, as Time to Grow's trunks */
function paintLimb(ctx: CanvasRenderingContext2D, l: Limb, rnd: Rand, A: number): void {
  const s = shape(l, rnd);
  const { P, R, N, litS } = s;
  const big = l.r0 > 6;
  // the silhouette, and the base wash: an old apple's grey-brown bark
  const sil = new Path2D();
  for (let i = 0; i < P.length; i++) sil.lineTo(P[i]![0] + N[i]![0] * R[i]! * litS, P[i]![1] + N[i]![1] * R[i]! * litS);
  for (let i = P.length - 1; i >= 0; i--) sil.lineTo(P[i]![0] - N[i]![0] * R[i]! * litS, P[i]![1] - N[i]![1] * R[i]! * litS);
  sil.closePath();
  ctx.fillStyle = rgba('#7E6A58', 0.94);
  ctx.fill(sil);
  // warm tan where the low sun falls on it, umber going violet on the shaded side
  ctx.fillStyle = 'rgba(236,206,150,0.16)';
  for (const f of big ? [0.82, 0.6, 0.38, 0.14] : [0.7, 0.3]) {
    band(ctx, s, 0.98, f, rnd);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(78,50,42,0.16)';
  for (const f of big ? [0, -0.22, -0.44, -0.64] : [-0.1, -0.5]) {
    band(ctx, s, -0.98, f, rnd);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(64,50,86,0.16)';
  for (const f of [-0.55, -0.78]) {
    band(ctx, s, -0.98, f, rnd, 0.06);
    ctx.fill();
  }
  // the bark's grain
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  const pat = barkPattern(ctx);
  pat.setTransform(new DOMMatrix().scale(1 / A, 1 / A));
  ctx.fillStyle = pat;
  ctx.fill(sil);
  ctx.restore();
  // scaly plates and fissures: short dark strokes along the limb, crowded on the shaded side; pale lips on the lit
  if (l.r0 > 3) {
    ctx.lineCap = 'round';
    const n = Math.round(P.length * (big ? 5 : 1.6));
    for (let k = 0; k < n; k++) {
      const i = rnd.int(1, P.length - 2);
      if (R[i]! < 2.2) continue;
      const off = clamp(rnd.gauss() * 0.45 - 0.2, -0.92, 0.92);
      const cx = P[i]![0] + N[i]![0] * R[i]! * litS * off;
      const cy = P[i]![1] + N[i]![1] * R[i]! * litS * off;
      const tx = N[i]![1];
      const ty = -N[i]![0];
      const ln = rnd.range(0.6, 2.2) * Math.min(R[i]! * 0.5, 4);
      const across = rnd.chance(0.3);
      const dx = across ? N[i]![0] : tx;
      const dy = across ? N[i]![1] : ty;
      const dark = off < 0.3 || rnd.chance(0.4);
      ctx.strokeStyle = dark ? `rgba(58,36,30,${rnd.range(0.2, 0.42)})` : 'rgba(246,226,184,0.4)';
      ctx.lineWidth = rnd.range(0.3, 0.75);
      ctx.beginPath();
      ctx.moveTo(cx - dx * ln * 0.5, cy - dy * ln * 0.5);
      ctx.lineTo(cx + dx * ln * 0.5 + rnd.range(-0.3, 0.3), cy + dy * ln * 0.5 + rnd.range(-0.3, 0.3));
      ctx.stroke();
    }
  }
  // the wet edge: pigment pooled along the shaded side
  ctx.strokeStyle = 'rgba(58,34,36,0.3)';
  ctx.lineWidth = Math.max(0.5, l.r0 * 0.1);
  ctx.beginPath();
  for (let i = 0; i < P.length; i++) {
    const f = -0.86 + rnd.range(-0.05, 0.05);
    ctx.lineTo(P[i]![0] + N[i]![0] * R[i]! * litS * f, P[i]![1] + N[i]![1] * R[i]! * litS * f);
  }
  ctx.stroke();
  // a pale stripe where the sun runs along it
  if (l.r0 > 2.4) {
    ctx.strokeStyle = 'rgba(248,234,200,0.5)';
    ctx.lineWidth = clamp(l.r0 * 0.09, 0.4, 1.5);
    ctx.beginPath();
    for (let i = 0; i < P.length; i++) {
      const f = 0.62 + rnd.range(-0.08, 0.08);
      ctx.lineTo(P[i]![0] + N[i]![0] * R[i]! * litS * f, P[i]![1] + N[i]![1] * R[i]! * litS * f);
    }
    ctx.stroke();
  }
  // the broken sepia contour: runs and gaps, heavier on the shaded side
  for (const side of [1, -1]) {
    const sg = side * litS;
    let i = 0;
    while (i < P.length - 1) {
      const run = rnd.int(3, 9);
      const j = Math.min(P.length - 1, i + run);
      if (!rnd.chance(side > 0 ? 0.4 : 0.15)) {
        ctx.strokeStyle = side > 0 ? 'rgba(47,42,34,0.45)' : 'rgba(47,42,34,0.85)';
        ctx.lineWidth = (side > 0 ? 0.45 : 0.8) * clamp(0.7 + l.r0 * 0.05, 0.7, 1.4) * rnd.range(0.8, 1.2);
        ctx.beginPath();
        for (let q = i; q <= j; q++) ctx.lineTo(P[q]![0] + N[q]![0] * R[q]! * sg, P[q]![1] + N[q]![1] * R[q]! * sg);
        ctx.stroke();
      }
      i = j + rnd.int(0, 2);
    }
  }
}

/** the old trunk's character: the split, a burr or two, lichen in the sun, moss at its foot */
function trunkCharacter(ctx: CanvasRenderingContext2D, rnd: Rand): void {
  // the split: an old wound up the trunk, gone dark and hollow, its lit lip catching the sun
  const cx = 497;
  const cy = 446;
  ctx.fillStyle = 'rgba(58,40,46,0.85)';
  almond(ctx, cx, cy, Math.PI / 2 + 0.08, 40, 3.4, 0.6);
  ctx.fill();
  ctx.fillStyle = 'rgba(40,28,36,0.6)';
  almond(ctx, cx + 0.6, cy + 2, Math.PI / 2 + 0.08, 26, 1.8, 0.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244,222,180,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 1.4, cy - 18);
  ctx.quadraticCurveTo(cx - 4.6, cy, cx - 1.2, cy + 19);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.8);
  ctx.lineWidth = 0.7;
  almond(ctx, cx, cy, Math.PI / 2 + 0.08, 40, 3.4, 0.6);
  ctx.stroke();
  // the callus rolled round the wound's edges
  ctx.strokeStyle = 'rgba(110,86,70,0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + 3.8, cy - 16);
  ctx.quadraticCurveTo(cx + 6, cy, cx + 3.4, cy + 18);
  ctx.stroke();
  // burrs: knobbly swellings with a dark eye
  for (const [x, y, r] of [[506, 414, 3.6], [486, 468, 2.8]] as const) {
    ctx.fillStyle = 'rgba(120,96,78,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,220,180,0.3)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0.3, 0.6, 3.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(50,34,32,0.7)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.1, r * 0.25, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // lichen on the sunny side of the trunk and the limbs: pale grey-green rosettes, a few orange dots
  const spots: Array<[number, number, number]> = [[486, 430, 4], [484, 404, 3.4], [489, 458, 3], [478, 364, 2.6], [462, 336, 2.4], [497, 350, 2.2], [516, 396, 2.4], [470, 388, 2.2]];
  for (const [x, y, r] of spots) {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = rgba(rnd.pick(['#C8CCA8', '#B8C09C', '#D8D8BC']), 0.5);
      tracePoly(ctx, deform(blobPoly(x + rnd.range(-r, r) * 0.5, y + rnd.range(-r, r) * 0.5, r * rnd.range(0.5, 0.9), r * rnd.range(0.4, 0.7), rnd, 10, 0.3), rnd, 1, 0.1));
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,128,100,0.4)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = rgba(rnd.pick(['#E0A040', '#D88A34', '#E8B850']), 0.75);
      ctx.beginPath();
      ctx.arc(x + rnd.range(-r, r), y + rnd.range(-r, r) * 0.7, rnd.range(0.35, 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // moss at the foot, on the shaded side
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = rgba(rnd.pick(['#6E7A3C', '#7E8A46', '#5E6A36']), 0.45);
    tracePoly(ctx, deform(blobPoly(rnd.range(502, 516), rnd.range(472, 488), rnd.range(2, 4), rnd.range(1.4, 3), rnd, 10, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ the fruit */

/**
 * One apple: a translucent dab of red (or a russet-gold with a red flush), a darker crescent at its lower right, the
 * light lifting off its upper left, the dimple and the stalk when it is big enough. `light` −1 … 1: where it hangs
 * against the light (dull and crimson in the shade, bright in the sun).
 */
export function paintApple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: number, rnd: Rand, flush = false): void {
  const L = clamp((light + 1) / 2, 0, 1);
  const base = flush ? (L > 0.5 ? '#E0A048' : '#B8803C') : L > 0.66 ? '#D8483A' : L > 0.33 ? '#B83C32' : '#86343A';
  ctx.fillStyle = rgba(base, L > 0.33 ? 0.82 : 0.7);
  tracePoly(ctx, deform(blobPoly(x, y, r, r * 0.94, rnd, 10, 0.06), rnd, 1, 0.05));
  ctx.fill();
  if (flush) {
    // the red flush over the sunny cheek
    ctx.fillStyle = rgba('#C8402E', 0.6);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.75, r * 0.6, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // a second, smaller glaze for depth
  ctx.fillStyle = rgba(base, 0.4);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y + r * 0.1, r * 0.72, r * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  // the shaded crescent, cool and violet in the shade
  ctx.fillStyle = L > 0.4 ? 'rgba(110,26,34,0.42)' : 'rgba(74,30,52,0.42)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.32, y + r * 0.36, r * 0.66, r * 0.42, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // the light, lifted off the upper left (brighter and crisper the more sun it gets)
  ctx.fillStyle = `rgba(255,244,222,${0.25 + L * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.38, r * 0.3, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  if (r * ctx.getTransform().a > 5) {
    ctx.strokeStyle = 'rgba(60,40,30,0.7)';
    ctx.lineWidth = Math.max(0.2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(x + r * 0.05, y - r * 0.7);
    ctx.quadraticCurveTo(x + r * 0.1, y - r * 1.2, x + r * 0.35, y - r * 1.45);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ the crown */

interface ClumpAt {
  x: number;
  y: number;
  w: number;
  kind: SpriteKind;
  flip: boolean;
}

const ORDER: Record<SpriteKind, number> = { back: 0, shade: 1, coral: 2, mid: 2, lit: 3, gold: 3 };

/** the kind of clump for a place in the crown, by where it sits against the light */
function kindAt(x: number, y: number, rnd: Rand): SpriteKind {
  const { d, ny, light } = domeAt(x, y);
  // the values turn gradually round the dome: the boundaries wander, so no seam runs down the crown
  const l = light + rnd.range(-0.28, 0.28);
  if (d < 0.38) return rnd.chance(0.12) ? 'back' : rnd.chance(0.5) ? 'shade' : 'mid';
  if (ny > 0.7) return rnd.chance(0.6) ? 'shade' : 'back';
  if (l > 0.42) return rnd.chance(0.12) ? 'gold' : 'lit';
  if (l > -0.5) return rnd.chance(0.05) ? 'coral' : 'mid';
  return rnd.chance(0.4) ? 'mid' : 'shade';
}

function crownClumps(rnd: Rand): ClumpAt[] {
  const out: ClumpAt[] = [];
  const step = 21;
  for (let y = 100; y < 380; y += step * 0.8) {
    for (let x = 290; x < 712; x += step) {
      const px = x + rnd.range(-0.45, 0.45) * step;
      const py = y + rnd.range(-0.4, 0.4) * step;
      if (!inCrown(px, py, 0.96)) continue;
      // gaps at the ragged edge, where the sky shows through
      const edge = !inCrown(px, py, 0.8);
      if (edge && rnd.chance(0.42)) continue;
      // smaller toward the top, so the dome's crown is a run of small lobes rather than a few big blocks
      const top = clamp((150 - py) / 40, 0, 1);
      out.push({ x: px, y: py, w: rnd.range(40, 60) * (edge ? 0.8 : 1) * (1 - top * 0.35), kind: kindAt(px, py, rnd), flip: rnd.chance(0.5) });
    }
  }
  // sprigs breaking the outline, so the dome is ragged against the sky
  for (let i = 0; i < 46; i++) {
    // round the shoulders and the sides (the top is ragged enough from its own lobes)
    const a = rnd.chance(0.5) ? rnd.range(Math.PI * 0.95, Math.PI * 1.35) : rnd.range(Math.PI * 1.65, Math.PI * 2.05);
    const l = LOBES[0];
    const x = l.x + Math.cos(a) * l.rx * rnd.range(0.94, 1.02);
    const y = l.y + Math.sin(a) * l.ry * rnd.range(0.94, 1.02);
    out.push({ x, y, w: rnd.range(22, 32), kind: kindAt(x, y, rnd), flip: rnd.chance(0.5) });
  }
  return out;
}

/** the low bough's leaf: clumps along it and above it, and the pendant shoots hanging from it */
function boughClumps(id: PickerId, rnd: Rand): { clumps: ClumpAt[]; shoots: Pt[][] } {
  const s = shape(BOUGHS[id], rnd);
  const clumps: ClumpAt[] = [];
  const shoots: Pt[][] = [];
  const n = s.P.length;
  for (let i = 2; i < n; i += 2) {
    const [x, y] = s.P[i]!;
    const t = i / (n - 1);
    // above the bough, toward the crown: the leaf sits on the limb, so the sagging wood shows under it (the shaded
    // ones go behind the limb, the lit and middle ones over its upper edge)
    if (rnd.chance(0.9)) {
      const w = rnd.range(26, 34) * (1 - t * 0.3);
      clumps.push({ x: x + rnd.range(-4, 4), y: y - w * 0.44 - rnd.range(-1, 5), w, kind: kindAt(x, y - 60, rnd) === 'lit' || rnd.chance(0.35) ? 'lit' : rnd.chance(0.7) ? 'mid' : 'shade', flip: rnd.chance(0.5) });
    }
    // a short shoot hanging from it, drawn down by the fruit's weight, with its sprig of leaf
    if (i % 4 === 0 && t > 0.25) {
      const len = rnd.range(5, 9);
      const sway = rnd.range(-4, 4);
      shoots.push([
        [x, y + 1],
        [x + sway * 0.3, y + len * 0.45],
        [x + sway, y + len],
      ]);
      clumps.push({ x: x + sway, y: y + len - 4, w: rnd.range(12, 16), kind: rnd.chance(0.6) ? 'mid' : 'lit', flip: rnd.chance(0.5) });
    }
  }
  // where the crown comes down to meet the bough's outer half, a few clumps join them, so the bough grows out of
  // the tree rather than floating as a tier under it
  for (let k = 0; k < 4; k++) {
    const i = Math.round(n * (0.45 + k * 0.13));
    const [x, y] = s.P[Math.min(n - 1, i)]!;
    clumps.push({ x: x + rnd.range(-6, 6), y: y - rnd.range(26, 34), w: rnd.range(30, 40), kind: 'shade', flip: rnd.chance(0.5) });
  }
  return { clumps, shoots };
}

function lay(ctx: CanvasRenderingContext2D, sp: Sprites, c: ClumpAt, rnd: Rand): void {
  const list = sp.kinds[c.kind]!;
  drawClump(ctx, list[rnd.int(0, list.length - 1)]!, c.x, c.y + c.w * 0.3, c.w, c.flip);
}

/** a canvas over a world rect at density A, its context set to world units */
function sheet(x: number, y: number, w: number, h: number, A: number): { sp: TreeSprite; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(Math.ceil(w * A), Math.ceil(h * A));
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(A, 0, 0, A, -x * A, -y * A);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.imageSmoothingQuality = 'high';
  return { sp: { cv, x, y, w, h }, ctx };
}

/** paint the farmer's tree at density A (device px per world unit) */
export async function renderFarmTree(A: number, tick: () => Promise<void>, check: () => boolean): Promise<FarmTreeArt | null> {
  const sp = await summerSprites(A > 1.6 ? 1.4 : 1, tick, check);
  if (!check()) return null;
  const rnd = new Rand(88211);
  const { sp: body, ctx } = sheet(236, 84, 528, 420, A);

  // 1. the soft dark mass under the whole crown (the shade inside it), laid wet on a very low-resolution sheet so
  // it has no edge of its own: wherever the leaf parts, the hollow shows as a soft depth, never a shape
  {
    const lo = sheet(236, 84, 528, 420, A * 0.12);
    for (const l of LOBES) {
      const g = lo.ctx.createRadialGradient(l.x + 6, l.y + 8, 0, l.x + 6, l.y + 8, Math.max(l.rx, l.ry) * 0.9);
      g.addColorStop(0, 'rgba(46,58,40,0.34)');
      g.addColorStop(0.6, 'rgba(52,64,44,0.2)');
      g.addColorStop(1, 'rgba(60,70,50,0)');
      lo.ctx.save();
      lo.ctx.translate(l.x + 6, l.y + 8);
      lo.ctx.scale(1, l.ry / l.rx);
      lo.ctx.translate(-(l.x + 6), -(l.y + 8));
      lo.ctx.fillStyle = g;
      lo.ctx.fillRect(l.x - l.rx, l.y - l.rx, l.rx * 2.2, l.rx * 2.2);
      lo.ctx.restore();
    }
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lo.sp.cv, lo.sp.x, lo.sp.y, lo.sp.w, lo.sp.h);
    ctx.restore();
  }
  // 2. the back clumps
  const all = crownClumps(rnd);
  const bo = { a: boughClumps('a', rnd), b: boughClumps('b', rnd) };
  for (const c of all.filter((c) => c.kind === 'back')) lay(ctx, sp, c, rnd);
  await tick();
  if (!check()) return null;
  // 3. the wood: roots, limbs, the trunk, the low boughs and their shoots
  for (const l of LIMBS) paintLimb(ctx, l, rnd, A);
  trunkCharacter(ctx, rnd);
  for (const id of ['a', 'b'] as const) {
    for (const c of bo[id].clumps.filter((c) => c.kind === 'shade')) lay(ctx, sp, c, rnd);
    paintLimb(ctx, BOUGHS[id], rnd, A);
    ctx.strokeStyle = rgba('#5A4A3E', 0.8);
    for (const sh of bo[id].shoots) {
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sh[0]![0], sh[0]![1]);
      ctx.quadraticCurveTo(sh[1]![0], sh[1]![1], sh[2]![0], sh[2]![1]);
      ctx.stroke();
    }
  }
  await tick();
  if (!check()) return null;
  // 4. the crown over the wood: shade, then the middle, then the lit clumps; some fruit in among them as they go
  const front = all.filter((c) => c.kind !== 'back').sort((p, q) => ORDER[p.kind] - ORDER[q.kind] || p.y - q.y);
  const apples = crownApples(rnd);
  let ai = 0;
  const drop: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < front.length; i++) {
    lay(ctx, sp, front[i]!, rnd);
    // the inner fruit is laid before the lit clumps, so the leaves half hide it
    if (front[i]!.kind === 'mid' && i % 3 === 0) {
      for (let k = 0; k < 5 && ai < apples.length * 0.35; k++, ai++) {
        const a = apples[ai]!;
        paintApple(ctx, a.x, a.y, a.r, a.light - 0.4, rnd, a.flush);
      }
    }
  }
  for (const id of ['a', 'b'] as const) for (const c of bo[id].clumps.filter((c) => c.kind !== 'shade')) lay(ctx, sp, c, rnd);
  // 5. the rest of the fruit over the leaf, then a few leaves back over some of it
  for (; ai < apples.length; ai++) {
    const a = apples[ai]!;
    paintApple(ctx, a.x, a.y, a.r, a.light, rnd, a.flush);
    if (a.y < 220 && drop.length < 8 && rnd.chance(0.3)) drop.push({ x: a.x, y: a.y });
  }
  leafOver(ctx, rnd, apples.slice(Math.floor(apples.length * 0.35)));
  // 6. the grass round the trunk's foot, standing up in front of the roots
  for (let x = 452; x < 556; x += rnd.range(3, 7)) {
    if (Math.abs(x - 500) < 14 && rnd.chance(0.5)) continue;
    grassTuft(ctx, x, F.y + rnd.range(0, 6), rnd.range(3, 6), rnd, 0.9, GRASS);
  }
  await tick();
  if (!check()) return null;

  // the front parts: sprays of leaf along each low bough (over the low fruit), and over the ladder's top
  const boughFront = {} as Record<PickerId, TreeSprite>;
  for (const id of ['a', 'b'] as const) {
    const B = BOUGH[id];
    const { sp: fs, ctx: fc } = sheet(B.x0 - 30, B.y - B.hHigh - 30, B.x1 - B.x0 + 60, 46, A);
    const s = shape(BOUGHS[id], new Rand(id === 'a' ? 3101 : 3109));
    const r2 = new Rand(id === 'a' ? 3121 : 3127);
    for (let i = 3; i < s.P.length - 2; i += 5) {
      const [x, y] = s.P[i]!;
      if (x < B.x0 - 10 || x > B.x1 + 10) continue;
      lay(fc, sp, { x: x + r2.range(-3, 3), y: y + r2.range(-1, 3), w: r2.range(14, 19), kind: r2.chance(0.5) ? 'lit' : 'mid', flip: r2.chance(0.5) }, r2);
    }
    boughFront[id] = fs;
  }
  const lt = LADDER.top;
  const { sp: ladderFront, ctx: lc } = sheet(lt.x - 40, lt.y - 40, 80, 64, A);
  {
    const r3 = new Rand(3203);
    for (const [dx, dy, w] of [[-14, -14, 36], [10, -20, 34], [-2, 4, 30], [18, 0, 26], [-20, 6, 24]] as const) {
      const x = lt.x + dx;
      const y = lt.y + dy;
      lay(lc, sp, { x, y, w, kind: kindAt(x, y, r3) === 'lit' ? 'lit' : r3.chance(0.5) ? 'mid' : 'shade', flip: r3.chance(0.5) }, r3);
    }
    for (let k = 0; k < 4; k++) {
      const a = r3.range(0, Math.PI * 2);
      const x = lt.x + Math.cos(a) * 18;
      const y = lt.y - 6 + Math.sin(a) * 10;
      paintApple(lc, x, y, 2.2, domeAt(x, y).light, r3);
    }
  }
  return { body, boughFront, ladderFront, dropFrom: drop };
}

interface AppleAt {
  x: number;
  y: number;
  r: number;
  light: number;
  flush: boolean;
}

/** the high fruit: many apples over the outer crown, more low down where the branches bend under them */
function crownApples(rnd: Rand): AppleAt[] {
  const out: AppleAt[] = [];
  let guard = 0;
  while (out.length < 230 && guard++ < 6000) {
    const x = rnd.range(296, 706);
    const y = rnd.range(110, 392);
    // every apple hangs inside the leaf mass, never out on the ragged edge against the sky
    if (!inCrown(x, y, 0.82)) continue;
    const { d, ny, light } = domeAt(x, y);
    if (d < 0.38) continue;
    // fewer at the top, more in the lower half of the crown
    if (ny < -0.3 && rnd.chance(0.55)) continue;
    // the free low fruit belongs to the pickers' boughs
    if (y > 372) continue;
    out.push({ x, y, r: rnd.range(2.2, 3), light, flush: rnd.chance(0.16) });
    // apples hang in twos and threes
    if (rnd.chance(0.4)) out.push({ x: x + rnd.range(-4, 4), y: y + rnd.range(1.5, 4), r: rnd.range(2, 2.7), light: light - 0.15, flush: false });
  }
  // shuffle so the inner ones (laid among the leaves) are spread over the crown
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** a few single leaves back over some of the fruit, so it hangs in the leaf rather than on it */
function leafOver(ctx: CanvasRenderingContext2D, rnd: Rand, apples: AppleAt[]): void {
  for (const a of apples) {
    if (!rnd.chance(0.35)) continue;
    const ang = rnd.range(-2.6, -0.4);
    const L = clamp((a.light + 1) / 2, 0, 1);
    ctx.fillStyle = rgba(L > 0.6 ? rnd.pick(['#A8AE58', '#B8B866']) : L > 0.3 ? rnd.pick(['#6E8A44', '#7A9050']) : rnd.pick(['#4A6040', '#3E5438']), 0.85);
    almond(ctx, a.x + Math.cos(ang) * a.r * 0.9, a.y + Math.sin(ang) * a.r * 0.9 - a.r * 0.3, ang, a.r * 2.4, a.r * 0.5, 0.3);
    ctx.fill();
  }
}
