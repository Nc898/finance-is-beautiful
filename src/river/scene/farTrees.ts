/**
 * A few small, pale trees on the far bank, painted with the same engine as Time to Grow's trees but at low
 * maturity, hazed toward the paper like the landing page's far grove. Each is a cached sprite that the scene
 * sways a hair in the breeze (a shear about its foot).
 */
import { getModel } from '../../scene';
import { TreePainter } from '../../scene/treePainter';
import { ensureSprites } from '../../scene/sprites';
import { makeCanvas } from '../../scene/watercolor';
import { farEdge } from './geom';

export interface TreeSprite {
  cv: HTMLCanvasElement;
  /** foot position in world units */
  x: number;
  y: number;
  /** foot offset inside the sprite, world units; sprite size in world units */
  ox: number;
  oy: number;
  w: number;
  h: number;
  phase: number;
}

const SPECS: Array<{ seed: number; x: number; m: number }> = [
  { seed: 5510, x: -40, m: 0.4 },
  { seed: 3307, x: 112, m: 0.46 },
  { seed: 6120, x: 258, m: 0.33 },
  { seed: 4207, x: 408, m: 0.43 },
  { seed: 9931, x: 628, m: 0.36 },
  { seed: 1181, x: 752, m: 0.47 },
  { seed: 7733, x: 908, m: 0.34 },
  { seed: 2290, x: 1050, m: 0.42 },
];

/** tree-units to world-units */
const TREE_K = 0.27;

export async function buildFarTrees(q: number, xmin: number, xmax: number): Promise<TreeSprite[]> {
  const sprites = await ensureSprites(q * TREE_K);
  const out: TreeSprite[] = [];
  const Wt = 150;
  const Ht = 140;
  for (const [i, sp] of SPECS.entries()) {
    if (sp.x < xmin - 30 || sp.x > xmax + 30) continue;
    const painter = new TreePainter(getModel(sp.seed));
    const cv = makeCanvas(Wt * q, Ht * q);
    const ctx = cv.getContext('2d')!;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Wt * q, (Ht - 3) * q); // keep the roots out of the bank
    ctx.clip();
    painter.paint(
      ctx,
      { ox: (Wt / 2) * q, oy: (Ht - 4) * q, s: q * TREE_K, dpr: 1 },
      { maturity: sp.m, months: 24, timeMs: 0, wind: false, pulse: -1, bills: 0, noBills: true },
      sprites,
    );
    ctx.restore();
    // haze: a veil of paper and a breath of sky over the trees only
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(251,246,234,0.34)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(120,165,205,0.14)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over';
    out.push({ cv, x: sp.x, y: farEdge(sp.x) - 1.5 + (i % 3) * 0.8, ox: Wt / 2, oy: Ht - 4, w: Wt, h: Ht, phase: i * 1.7 });
  }
  return out;
}
