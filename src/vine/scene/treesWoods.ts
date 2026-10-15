/**
 * The woods on the hills and the hedge along the back of the garden: made of the same autumn foliage sprites
 * as the big trees (drawn small, in rows that follow the ridge), a few small whole trees painted with the tree
 * engine, and a handful of dark evergreens, all veiled toward the paper with distance.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { Sprites, Spr } from '../../scene/sprites';
import type { SpriteKind } from '../../scene/watercolor';
import { FOLIAGE, PAPER, grain } from './art';
import { buildFarTrees, drawFarTree, type FarTree } from './trees';
import { autumnSprites, type KitName } from './treesArt';

export type Kits = Record<KitName, Sprites>;

export async function loadKits(sd: number, tick: () => Promise<void>, check: () => boolean): Promise<Kits | null> {
  const maple = await autumnSprites('maple', sd, tick, check);
  const gold = await autumnSprites('gold', sd, tick, check);
  const mixed = await autumnSprites('mixed', sd, tick, check);
  return check() ? { maple, gold, mixed } : null;
}

const KIT_NAMES: KitName[] = ['maple', 'gold', 'mixed'];

/** a random clump sprite of one of the given tones from a random kit (weighted) */
export function pickClump(kits: Kits, rnd: Rand, tones: SpriteKind[], weights: [number, number, number] = [1, 1, 1]): Spr {
  let r = rnd.next() * (weights[0] + weights[1] + weights[2]);
  let k = 0;
  for (; k < 2; k++) {
    r -= weights[k]!;
    if (r <= 0) break;
  }
  const set = kits[KIT_NAMES[k]!]!;
  const list = set.kinds[rnd.pick(tones)]!;
  return list[rnd.int(0, list.length - 1)]!;
}

/** draw a clump sprite with its visible body `bodyW` wide, its pivot (where the branch enters) at (cx, by) */
export function drawClumpSpr(ctx: CanvasRenderingContext2D, s: Spr, cx: number, by: number, bodyW: number, flip = false): void {
  const dw = bodyW / 0.7;
  const dh = (dw * s.sh) / s.sw;
  if (flip) {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, -dw / 2, by - dh * 0.82, dw, dh);
    ctx.restore();
  } else ctx.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, cx - dw / 2, by - dh * 0.82, dw, dh);
}

/** a small conifer: stacked drooping tiers of deep green wash, lit on the left */
export function makeConifer(seed: number, w: number, h: number, q: number): HTMLCanvasElement {
  const rnd = new Rand(seed);
  const cv = makeCanvas(w * q, h * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, (w / 2) * q, h * q);
  const pal = FOLIAGE.ever!;
  const tiers = 7;
  // trunk stub
  ctx.fillStyle = 'rgba(70,48,36,0.8)';
  ctx.fillRect(-w * 0.04, -h * 0.1, w * 0.08, h * 0.1);
  for (let t = 0; t < tiers; t++) {
    const ww = (w / 2) * (0.3 + 0.7 * (1 - Math.pow(1 - (t + 1) / tiers, 1.15)));
    const yb = -h * 0.07 - (h * 0.86 * (tiers - 1 - t)) / tiers;
    const pts = [0, yb - h * 0.19, ww * 0.5, yb - h * 0.08, ww, yb + h * 0.02, ww * 0.4, yb - h * 0.02, 0, yb + h * 0.035, -ww * 0.4, yb - h * 0.02, -ww, yb + h * 0.02, -ww * 0.5, yb - h * 0.08];
    const poly = deform(pts, rnd, 2, 0.05);
    ctx.fillStyle = rgba(pal.base, 0.36);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(pal.mid, 0.32);
    tracePoly(ctx, deform(poly, rnd, 2, 0.05));
    ctx.fill();
    ctx.fillStyle = rgba(pal.deep, 0.26);
    tracePoly(ctx, deform(pts.map((v, i) => (i % 2 === 0 ? v * 0.78 + ww * 0.16 : v + h * 0.02)), rnd, 2, 0.06));
    ctx.fill();
    ctx.fillStyle = rgba(pal.light, 0.26);
    tracePoly(ctx, deform(pts.map((v, i) => (i % 2 === 0 ? v * 0.5 - ww * 0.22 : v - h * 0.012)), rnd, 2, 0.08));
    ctx.fill();
  }
  grain(cv, seed + 3, 1);
  return cv;
}

const TREE_SPECS: Array<{ seed: number; m: number; kit: KitName; haze: number; k: number }> = [
  { seed: 8801, m: 0.8, kit: 'gold', haze: 0.34, k: 0.13 },
  { seed: 8802, m: 0.7, kit: 'maple', haze: 0.34, k: 0.14 },
  { seed: 8803, m: 0.85, kit: 'mixed', haze: 0.34, k: 0.12 },
  { seed: 8804, m: 0.75, kit: 'gold', haze: 0.34, k: 0.15 },
];

export interface WoodsParts {
  trees: FarTree[];
  conifers: HTMLCanvasElement[];
}

export async function buildWoodsParts(A: number, sd: number, tick: () => Promise<void>, check: () => boolean): Promise<WoodsParts> {
  const trees = await buildFarTrees(A, sd, TREE_SPECS, tick, check);
  const q = Math.max(2, A * 1.1);
  return { trees, conifers: [makeConifer(11, 16, 38, q), makeConifer(12, 14, 34, q), makeConifer(13, 15, 40, q)] };
}

export { drawFarTree, PAPER };
