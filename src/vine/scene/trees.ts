/**
 * The garden's trees. The big ones are Time to Grow's own trees (same skeleton model, same painter: a tapering
 * trunk that forks into scaffold limbs, nested secondary limbs, twigs, and a crown built from many overlapping
 * foliage clumps with gaps where the sky shows) dressed for autumn with the sprites of treesArt.ts. Each is
 * painted once into its own canvas, then laid into the world layer. The far ones are the same trees at a small
 * size, hazed toward the paper, used for the woods on the hills.
 */
import type { Rand } from '../../scene/prng';
import { H as TREE_H } from '../../scene/treeModel';
import { TreePainter } from '../../scene/treePainter';
import { getModel } from '../../scene/treeView';
import { almond, makeCanvas, rgba } from '../../scene/watercolor';
import { grassTuft } from '../../river/scene/paint';
import { INK, PAPER } from './art';
import { autumnSprites, type KitName } from './treesArt';
import type { Sprites } from '../../scene/sprites';

export interface TreePlan {
  seed: number;
  /** the trunk foot in world units */
  x: number;
  y: number;
  /** world units per tree unit (a mature tree is 560 tree units tall) */
  k: number;
  /** maturity 0..1: 1 is the full crown */
  m: number;
  kit: KitName;
  /** paper haze over the whole tree, 0..1 (distance) */
  haze: number;
  flip?: boolean;
}

const HALF = 300;
const PAD_TOP = 70;

const PARAMS = { maturity: 1, months: 24, timeMs: 0, wind: false, pulse: -1, bills: 0, noBills: true } as const;

/** paint one tree into its own canvas; returns it with the foot position inside it (layer px) */
export async function renderTree(plan: TreePlan, A: number, sd: number, tick: () => Promise<void>, check: () => boolean): Promise<{ cv: HTMLCanvasElement; fx: number; fy: number } | null> {
  const s = A * plan.k;
  const sprites = await autumnSprites(plan.kit, sd, tick, check);
  if (!check()) return null;
  const w = Math.ceil(2 * HALF * s);
  const h = Math.ceil((TREE_H * plan.m + PAD_TOP) * s + 10 * s);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  const ox = w / 2;
  const oy = h - 8 * s;
  const painter = new TreePainter(getModel(plan.seed));
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  // the roots belong to the soil of Time to Grow's cut-away: here the trunk simply stands in the lawn
  ctx.beginPath();
  ctx.rect(0, 0, w, oy + 1.6 * s);
  ctx.clip();
  painter.paint(ctx, { ox, oy, s, dpr: 1 }, { ...PARAMS, maturity: plan.m }, sprites as Sprites);
  ctx.restore();
  if (plan.haze > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = rgba(PAPER, plan.haze);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(130,160,210,${0.06 + plan.haze * 0.16})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { cv, fx: ox, fy: oy };
}

/** lay a rendered tree into the world layer (ctx maps world units to layer px) */
export function layTree(ctx: CanvasRenderingContext2D, plan: TreePlan, r: { cv: HTMLCanvasElement; fx: number; fy: number }, A: number): void {
  ctx.save();
  ctx.translate(plan.x, plan.y);
  if (plan.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(r.cv, -r.fx / A, -r.fy / A, r.cv.width / A, r.cv.height / A);
  ctx.restore();
}

/** the dressing at a trunk foot: crumbs of earth, tufts of dry grass and a few leaves, so it sits in the lawn */
export function dressFoot(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, r: number, tufts = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62']): void {
  // damp earth right at the bark, shadowed on the right
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba('#6A4C34', 0.12);
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + 0.5, r * (1.6 - i * 0.2), r * (0.34 - i * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 16; i++) {
    const a = rnd.range(-1, 1);
    const px = x + a * r * 1.7;
    const py = y + rnd.range(-0.4, 1.6);
    ctx.fillStyle = rgba(rnd.pick(['#6E5238', '#8A6C48', '#B49A70']), rnd.range(0.4, 0.8));
    ctx.beginPath();
    ctx.ellipse(px, py, rnd.range(0.5, 1.3), rnd.range(0.3, 0.7), rnd.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * 2 - 1;
    grassTuft(ctx, x + a * r * 1.6 + rnd.range(-1, 1), y + rnd.range(0, 2.4), rnd.range(3.4, 7), rnd, 1, tufts);
  }
  // leaves caught round the foot
  const leaf = ['#D9A03C', '#C8683A', '#B8483A', '#E4B64E', '#A8522E'];
  for (let i = 0; i < 18; i++) {
    const a = rnd.range(-1.4, 1.4);
    const L = rnd.range(2.6, 4.6);
    ctx.fillStyle = rgba(rnd.pick(leaf), rnd.range(0.65, 0.95));
    almond(ctx, x + a * r * 1.5, y + rnd.range(0.5, 4.5), rnd.range(0, Math.PI), L, L * 0.44, rnd.gauss() * 0.3);
    ctx.fill();
  }
  void INK;
}

/* ------------------------------------------------------------------ far trees (the woods) */

export interface FarTree {
  cv: HTMLCanvasElement;
  /** foot inside the sprite and the sprite size, world units */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/**
 * A handful of small trees painted with the same engine at a low maturity and a given world size, used again
 * and again (scaled, flipped) along the ridges for woods. `haze` veils each toward the paper and sky.
 */
export async function buildFarTrees(
  A: number,
  sd: number,
  specs: Array<{ seed: number; m: number; kit: KitName; haze: number; k: number }>,
  tick: () => Promise<void>,
  check: () => boolean,
): Promise<FarTree[]> {
  const out: FarTree[] = [];
  for (const sp of specs) {
    const plan: TreePlan = { seed: sp.seed, x: 0, y: 0, k: sp.k, m: sp.m, kit: sp.kit, haze: sp.haze };
    const r = await renderTree(plan, A, sd, tick, check);
    if (!r) return out;
    out.push({ cv: r.cv, ox: r.fx / A, oy: r.fy / A, w: r.cv.width / A, h: r.cv.height / A });
    await tick();
  }
  return out;
}

export function drawFarTree(ctx: CanvasRenderingContext2D, t: FarTree, x: number, y: number, sc: number, flip: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -sc : sc, sc);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(t.cv, -t.ox, -t.oy, t.w, t.h);
  ctx.restore();
}

