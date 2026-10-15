/**
 * Small loose autumn leaves (three shapes, six colour groups, three tones each): the stuff of the clippings
 * piles and of the leaves drifting down from the trees. Painted once as small sprites; the pivot is the centre.
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { INK, grain, newSprite, tick, type Sprite } from './art';

export const LEAF_GROUPS = ['crimson', 'scarlet', 'rust', 'brown', 'amber', 'gold'] as const;
/** [light, base, dark] of each group */
const PAL: Record<(typeof LEAF_GROUPS)[number], [string, string, string]> = {
  crimson: ['#D2525C', '#B3303E', '#802030'],
  scarlet: ['#EE6C46', '#D2442A', '#9A2C20'],
  rust: ['#DE8C54', '#C0643A', '#8A4228'],
  brown: ['#BA8C60', '#96683E', '#674628'],
  amber: ['#F2C060', '#DE9A34', '#A86C24'],
  gold: ['#F6DA7A', '#E6BA4C', '#B88A30'],
};

export interface LeafSet {
  /** [group][tone 0 lit … 2 shaded][shape] */
  spr: Sprite[][][];
  /** the leaf's length in world units */
  size: number;
}

function paintSmall(seed: number, q: number, group: number, tone: number, shape: number): Sprite {
  const rnd = new Rand(seed);
  const pal = PAL[LEAF_GROUPS[group]!]!;
  const col = pal[tone]!;
  const dark = pal[2]!;
  const light = pal[0]!;
  const { sp, ctx } = newSprite(14, 14, 7, 7, q);
  const pts: number[] = [];
  if (shape === 0) {
    // a five-lobed maple-like leaf
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(2.5 * a)), 0.7);
      const r = 5.6 * (0.46 + 0.54 * lobe);
      pts.push(Math.cos(a - Math.PI / 2) * r, Math.sin(a - Math.PI / 2) * r * 0.95);
    }
  } else if (shape === 1) {
    // an elongated, toothed oval
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tooth = 1 + 0.07 * Math.sin(a * 9);
      pts.push(Math.cos(a) * 5.8 * tooth, Math.sin(a) * 3.1 * tooth);
    }
  } else {
    // a rounded heart (birch / aspen)
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 4.2 * (1 + 0.18 * Math.cos(a - Math.PI / 2) * 0.0);
      pts.push(Math.cos(a) * r * 1.0, Math.sin(a) * r * (Math.sin(a) < 0 ? 0.95 : 1.15) - 0.2);
    }
  }
  const poly = deform(pts, rnd, 1, 0.025);
  ctx.fillStyle = rgba(col, 0.92);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(col, 0.3);
  tracePoly(ctx, deform(pts, rnd, 1, 0.04));
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  ctx.fillStyle = rgba(light, 0.34);
  ctx.fillRect(-8, -8, 8, 16);
  ctx.fillStyle = rgba(dark, 0.26);
  ctx.fillRect(1.2, -8, 8, 16);
  ctx.strokeStyle = rgba('#FFE6C0', 0.4);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  if (shape === 0) {
    for (const a of [-90, -50, -130, 20, 160]) {
      const r = (a * Math.PI) / 180;
      ctx.moveTo(0, 0.4);
      ctx.lineTo(Math.cos(r) * 4.6, Math.sin(r) * 4.6);
    }
  } else {
    ctx.moveTo(-5.2, 0);
    ctx.lineTo(5.2, 0);
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      ctx.moveTo(k * 1.3, 0);
      ctx.lineTo(k * 1.3 + 1.1, -2);
      ctx.moveTo(k * 1.3, 0);
      ctx.lineTo(k * 1.3 + 1.1, 2);
    }
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(INK, 0.4);
  ctx.lineWidth = 0.28;
  ctx.setLineDash([2.4, 0.7, 1.2, 0.6]);
  tracePoly(ctx, poly);
  ctx.stroke();
  ctx.setLineDash([]);
  // a small stalk
  ctx.strokeStyle = rgba(dark, 0.8);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  if (shape === 0) {
    ctx.moveTo(0, 5.4);
    ctx.lineTo(0, 7);
  } else {
    ctx.moveTo(-5.6, 0);
    ctx.lineTo(-7, 0.3);
  }
  ctx.stroke();
  grain(sp.cv, seed, 0.6, Math.max(1, Math.round(q * 0.5)));
  return sp;
}

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
  return { spr, size: 11 };
}
