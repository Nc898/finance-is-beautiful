/**
 * Small loose autumn leaves (a maple, an oak and a birch, in six colour groups and three tones each): the stuff of
 * the clippings piles, of the leaves heaped in the wheelbarrow and of the ones drifting down from the trees.
 *
 * Each leaf is painted like a leaf in a watercolor sketch: two glazes of its colour, a wet-in-wet bloom of a second
 * colour dropped near the tip or the edge, one half a little lighter than the other (the fold along the midrib),
 * pale lifted veins with a thin shadow line beside each, pigment pooled just inside the edge, a few grains of
 * granulation and a broken, tapering sepia contour. The pivot of a sprite is the middle of the blade; the stalk
 * points to the lower end. `paintLeafInto` draws the same leaf straight into any context (used by the props).
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { brush, feather, inkDashes, mix, ribbon, speckle, type Pt } from '../../river/scene/boatInk';
import { tick, type Sprite } from './art';
import { finishSprite } from './propSprite';

export const LEAF_GROUPS = ['crimson', 'scarlet', 'rust', 'brown', 'amber', 'gold'] as const;
/** [light, base, dark] of each group */
export const LEAF_PAL: Record<(typeof LEAF_GROUPS)[number], [string, string, string]> = {
  crimson: ['#D8565F', '#B3303E', '#7A1E30'],
  scarlet: ['#F27650', '#D2442A', '#962A22'],
  rust: ['#E49658', '#C0643A', '#84402A'],
  brown: ['#C29866', '#96683E', '#62432A'],
  amber: ['#F6C766', '#E0A038', '#A66A24'],
  gold: ['#F8DE82', '#E8BE50', '#B88A30'],
};
/** the second colour dropped wet into each group (variegation near the tip / edge) */
const ACCENT: Record<(typeof LEAF_GROUPS)[number], string> = {
  crimson: '#EC7A36',
  scarlet: '#F2A646',
  rust: '#E8B54E',
  brown: '#CDAA62',
  amber: '#CE5E2A',
  gold: '#A8A040',
};

export interface LeafSet {
  /** [group][tone 0 lit … 2 shaded][shape] */
  spr: Sprite[][][];
  /** the leaf's length in world units */
  size: number;
}

/** blade length of each shape (maple, oak, birch), world units, at sprite scale */
export const LEAF_LEN = [11.6, 12.6, 11.8] as const;
const SIZE = 12;
const CANVAS = 18;

/** add small teeth along each edge of an outline chain (the chain runs up the right side: outward is +x) */
function teeth(chain: Pt[], per: number, amp: number, rnd: Rand): Pt[] {
  const out: Pt[] = [chain[0]!];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]!;
    const b = chain[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const n = Math.max(0, Math.round((l / 3.2) * per));
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.74) / n;
      const t1 = (k + 1) / n;
      const o = amp * rnd.range(0.7, 1.2);
      out.push([a[0] + dx * t0 + nx * o, a[1] + dy * t0 + ny * o]);
      if (k < n - 1) out.push([a[0] + dx * t1 - nx * o * 0.15, a[1] + dy * t1 - ny * o * 0.15]);
    }
    out.push(b);
  }
  return out;
}

/** a symmetric outline from a right-hand chain that runs from the base notch (x = 0) to the tip (x = 0) */
function mirror(right: Pt[], rnd: Rand, skew = 0): number[] {
  const o: number[] = [];
  for (const p of right) o.push(p[0], p[1]);
  for (let i = right.length - 2; i >= 1; i--) o.push(-right[i]![0] * (1 + skew * rnd.range(-1, 1)), right[i]![1] + rnd.range(-0.12, 0.12));
  return o;
}

interface Shape {
  poly: number[];
  /** veins as polylines (base frame) */
  veins: Pt[][];
  /** the stalk joins the blade here */
  base: Pt;
}

/** the outline of one leaf, base at the origin, tip straight up; `kind` 0 maple, 1 oak, 2 birch */
function leafShape(kind: number, rnd: Rand): Shape {
  const j = (v: number, a = 0.35) => v + rnd.range(-a, a);
  if (kind === 0) {
    const chain: Pt[] = [
      [0, -0.9],
      [j(2.4, 0.2), j(-0.6, 0.2)],
      [j(2.3, 0.2), j(-2.0, 0.3)],
      [j(5.8, 0.4), j(-3.7, 0.4)],
      [j(2.5, 0.3), j(-5.5, 0.3)],
      [j(5.3, 0.4), j(-8.4, 0.4)],
      [j(1.7, 0.25), j(-7.6, 0.3)],
      [0, j(-11.6, 0.3)],
    ];
    const poly = mirror(teeth(chain, 1, 0.5, rnd), rnd, 0.04);
    const v = (x: number, y: number): Pt[] => [[0, -1.4], [x * 0.5, -1.4 + (y + 1.4) * 0.5], [x * 0.92, y * 0.92]];
    return {
      poly,
      veins: [
        [[0, -0.2], [0, -10.4]],
        v(5.8, -3.7),
        v(-5.8, -3.7),
        v(5.3, -8.4),
        v(-5.3, -8.4),
      ],
      base: [0, -0.7],
    };
  }
  if (kind === 1) {
    const ph = rnd.range(0, 6.28);
    const ph2 = rnd.range(0, 6.28);
    const L = 12.6;
    const half = (t: number, side: number): number => {
      const body = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7);
      const lob = 0.56 + 0.44 * Math.pow(Math.abs(Math.sin(3.5 * Math.PI * t + (side > 0 ? ph : ph2))), 0.55);
      return 3.7 * body * lob;
    };
    const R: Pt[] = [];
    const Lf: Pt[] = [];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const t = 0.02 + (i / N) * 0.97;
      R.push([half(t, 1), -L * t]);
      Lf.push([-half(t, -1), -L * t]);
    }
    const poly: number[] = [];
    for (const p of R) poly.push(p[0], p[1]);
    for (let i = Lf.length - 1; i >= 0; i--) poly.push(Lf[i]![0], Lf[i]![1]);
    const veins: Pt[][] = [[[0, 0], [0, -L * 0.93]]];
    for (let k = 0; k < 5; k++) {
      const t = 0.14 + k * 0.16;
      const t2 = Math.min(0.9, t + 0.1);
      veins.push([[0, -L * t], [half(t2, 1) * 0.8, -L * t2]]);
      veins.push([[0, -L * t], [-half(t2, -1) * 0.8, -L * t2]]);
    }
    return { poly, veins, base: [0, 0] };
  }
  // birch / aspen: an ovate leaf with a drawn-out tip and a double-toothed edge
  const L = 11.8;
  const R: Pt[] = [[0, -0.3]];
  const N = 15;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const w = 4.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.66)), 0.88) * (1 - 0.18 * t * t);
    const tooth = t > 0.12 && t < 0.97 ? (i % 2 === 0 ? 0.34 : -0.04) : 0;
    R.push([Math.max(0, w + tooth), -L * t - (i % 2 ? 0 : 0.1)]);
  }
  R[R.length - 1] = [0, -L];
  const poly = mirror(R, rnd, 0.05);
  const veins: Pt[][] = [[[0, -0.2], [0, -L * 0.94]]];
  for (let k = 0; k < 5; k++) {
    const t = 0.16 + k * 0.15;
    const w = 4.5 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, t + 0.12), 0.66)), 0.88);
    veins.push([[0, -L * t], [w * 0.8, -L * (t + 0.14)]]);
    veins.push([[0, -L * t], [-w * 0.8, -L * (t + 0.14)]]);
  }
  return { poly, veins, base: [0, -0.2] };
}

/**
 * Paint one leaf into `ctx` at the current transform: the blade is centred on the origin, the tip points up, the
 * stalk down. `scale` multiplies the 12-unit design size. `tone` 0 is lit, 2 is shaded.
 */
export function paintLeafInto(ctx: CanvasRenderingContext2D, rnd: Rand, shape: number, group: number, tone: number, detail = 1): void {
  const name = LEAF_GROUPS[group]!;
  const pal = LEAF_PAL[name];
  const col = pal[tone]!;
  const dark = pal[2]!;
  const light = pal[0]!;
  const accent = ACCENT[name];
  const sh = leafShape(shape, rnd);
  const len = LEAF_LEN[shape]!;
  ctx.save();
  ctx.translate(0, len / 2);
  const poly = sh.poly;
  const flip = rnd.chance(0.5) ? -1 : 1;
  // the stalk first (it goes under the blade)
  const stalkCol = mix(dark, '#4A3020', 0.35);
  brush(ctx, [[sh.base[0], sh.base[1] - 1.0], [rnd.range(-0.2, 0.2), 0.8], [rnd.range(-0.5, 0.5), 2.3]], 0.62, stalkCol, 0.92, 0.3);
  // 1. the glazes
  ctx.fillStyle = rgba(col, 0.74);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(col, 0.26);
  tracePoly(ctx, deform(poly, rnd, 2, 0.022));
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // 2. wet-in-wet: the accent colour bleeding in near the tip or one edge, the light colour lifted toward the middle
  const ax = flip * rnd.range(1.2, 3.4);
  const ay = -len * rnd.range(0.55, 0.9);
  const bl: number[] = [];
  for (let k = 0; k < 9; k++) bl.push(ax + Math.cos(k * 0.698) * rnd.range(2.2, 3.4), ay + Math.sin(k * 0.698) * rnd.range(2.0, 3.2));
  feather(ctx, bl, accent, tone === 2 ? 0.38 : 0.56, rnd, 4, 1, 0.45, 0.12);
  const lb: number[] = [];
  for (let k = 0; k < 8; k++) lb.push(-flip * 1.4 + Math.cos(k * 0.785) * 2.6, -len * 0.5 + Math.sin(k * 0.785) * len * 0.3);
  feather(ctx, lb, light, 0.5, rnd, 4, 1, 0.4, 0.1);
  // the two halves of the fold: one lit, one shaded
  ctx.fillStyle = rgba(light, tone === 0 ? 0.32 : 0.2);
  ctx.fillRect(flip > 0 ? -8 : 0.12, -len - 2, 8, len + 4);
  ctx.fillStyle = rgba(dark, tone === 2 ? 0.34 : 0.22);
  ctx.fillRect(flip > 0 ? 0.12 : -8, -len - 2, 8, len + 4);
  const g = ctx.createLinearGradient(0, 0, 0, -len);
  g.addColorStop(0, rgba(dark, 0.4));
  g.addColorStop(0.45, rgba(dark, 0.04));
  g.addColorStop(1, rgba(light, 0.18));
  ctx.fillStyle = g;
  ctx.fillRect(-8, -len - 2, 16, len + 4);
  // 3. veins: a pale lifted line with a thin shadow beside it
  const paper = mix(light, '#FFF2D8', 0.55);
  for (let i = 0; i < sh.veins.length; i++) {
    const v = sh.veins[i]!;
    const main = i === 0;
    ctx.strokeStyle = rgba(dark, main ? 0.4 : 0.3);
    ctx.lineWidth = main ? 0.34 : 0.24;
    ctx.beginPath();
    ctx.moveTo(v[0]![0] + 0.28, v[0]![1] + 0.12);
    for (let k = 1; k < v.length; k++) ctx.lineTo(v[k]![0] + 0.28, v[k]![1] + 0.12);
    ctx.stroke();
    ctx.strokeStyle = rgba(paper, main ? 0.68 : 0.5 + 0.1 * (tone === 0 ? 1 : 0));
    ctx.lineWidth = main ? 0.42 : 0.28;
    ctx.beginPath();
    ctx.moveTo(v[0]![0], v[0]![1]);
    for (let k = 1; k < v.length; k++) ctx.lineTo(v[k]![0], v[k]![1]);
    ctx.stroke();
  }
  // 4. pigment pooled just inside the edge
  ctx.strokeStyle = rgba(dark, 0.16);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 0.5 + i * 0.5;
    tracePoly(ctx, deform(poly, rnd, 1, 0.012));
    ctx.stroke();
  }
  // 5. grains of pigment and lifted paper
  if (detail > 0) speckle(ctx, rnd, -6, -len - 1, 12, len + 2, 14, dark, 0.28, '#FFF4DC', 0.3, 0.2);
  ctx.restore();
  // 6. the contour: a fine broken sepia line, heavier on the shaded side
  inkDashes(ctx, poly, rnd, {
    color: mix(dark, '#2A1A14', 0.55),
    alpha: tone === 0 ? 0.5 : 0.62,
    w: 0.3,
    dash: [2.4, 7],
    gap: [0.3, 1.1],
    center: [0, -len / 2],
  });
  ctx.restore();
}

function paintSmall(seed: number, q: number, group: number, tone: number, shape: number): Sprite {
  const rnd = new Rand(seed);
  // a CPU-backed canvas: the grain pass reads the pixels back, which is slow on a GPU canvas
  const cv = makeCanvas(Math.ceil(CANVAS * q), Math.ceil(CANVAS * q));
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(q, 0, 0, q, (CANVAS / 2) * q, (CANVAS / 2) * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const sp: Sprite = { cv, w: cv.width / q, h: cv.height / q, px: CANVAS / 2, py: CANVAS / 2 };
  paintLeafInto(ctx, rnd, shape, group, tone);
  return finishSprite(sp, seed, q, 0.55, true);
}

/** the most recently built set: the props borrow its sprites for the leaves they carry and shed (instead of repainting them) */
let current: LeafSet | null = null;
export const currentLeafSet = (): LeafSet | null => current;

export async function buildLeafSet(q: number, alive: () => boolean): Promise<LeafSet | null> {
  const spr: Sprite[][][] = [];
  for (let g = 0; g < LEAF_GROUPS.length; g++) {
    spr.push([]);
    for (let t = 0; t < 3; t++) {
      spr[g]!.push([]);
      for (let s = 0; s < 3; s++) spr[g]![t]!.push(paintSmall(5000 + g * 97 + t * 13 + s * 5, q, g, t, s));
    }
    await tick();
    if (!alive()) return null;
  }
  current = { spr, size: SIZE };
  return current;
}

void ribbon;
