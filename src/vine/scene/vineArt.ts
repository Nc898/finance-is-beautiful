/**
 * The vine's painting: cached leaf sprites (Virginia creeper, five leaflets, in crimson, scarlet, wine and
 * rust, a few amber) and berries, and the per-frame drawing of woody stems and leaves from the growth state.
 * Leaves are blitted with one transform each; stems are batched into a few paths per width class.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { GROUND_Y } from './geom';
import { COTTAGE } from './geom';
import { INK, newSprite, sway, tick, type Sprite } from './art';
import { cpuSprite, finishSprite } from './propSprite';
import { feather, mix } from '../../river/scene/boatInk';
import { VineState, leafOpen, type VineModel } from './vineModel';
import type { PlanId } from '../types';

export interface WallXf {
  /** the root's world x, the ground y, and which way local u points in x */
  rx: number;
  ry: number;
  sign: 1 | -1;
}
export const wallXf = (id: PlanId): WallXf => ({ rx: COTTAGE[id].root.x, ry: GROUND_Y, sign: id === 'minimum' ? 1 : -1 });
export const toWorldX = (t: WallXf, u: number): number => t.rx + t.sign * u;
export const toWorldY = (t: WallXf, v: number): number => t.ry - v;
export const toLocalU = (t: WallXf, x: number): number => (x - t.rx) * t.sign;
export const toLocalV = (t: WallXf, y: number): number => t.ry - y;

/** [base, light, dark] of each leaf colour */
export const LEAF_COLS: ReadonlyArray<readonly [string, string, string]> = [
  ['#B3203A', '#E24A5C', '#6E1530'], // crimson
  ['#D63A26', '#F47C4C', '#8E1E1E'], // scarlet
  ['#7A1F3C', '#B23C58', '#431228'], // wine
  ['#E0572A', '#F69C4E', '#9A2E1C'], // orange-red
  ['#C4344F', '#EA7282', '#7A1E38'], // rose
  ['#E3982C', '#F7CE66', '#9A5A1C'], // amber
  ['#8E7A3A', '#BCA85A', '#5A4A28'], // bronze (not yet turned)
];

export interface LeafSprites {
  /** [colour][shape] */
  leaf: Sprite[][];
  berry: Sprite;
  /** leaf extent in world units (sprite size) */
  base: number;
}

/** one leaflet, pointing up from the origin: ovate, widest near 40 percent, a toothed point */
function leafletPoly(len: number, wid: number, rnd: Rand): number[] {
  const L: number[] = [];
  const R: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.92) * (1 - 0.12 * t);
    const tooth = t > 0.28 && t < 0.96 ? (i % 2 === 0 ? 1 : -0.35) * 0.09 * wid : 0;
    const w = wid * prof + tooth;
    L.push(-w + rnd.range(-0.06, 0.06), -len * t);
    R.unshift(w + rnd.range(-0.06, 0.06), -len * t);
  }
  return [...L, ...R];
}

function paintLeaf(seed: number, q: number, color: number, shape: number): Sprite {
  const rnd = new Rand(seed);
  const [base, light, dark] = LEAF_COLS[color]!;
  const { sp, ctx } = cpuSprite(30, 26, 15, 21, q);
  const accent = mix(base, color === 5 ? '#D4502A' : '#F4A83A', 0.6);
  // petiole
  ctx.strokeStyle = rgba('#7A3A34', 0.95);
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.quadraticCurveTo(0.5, -2, 0, -5);
  ctx.stroke();
  const hub = -5;
  // five leaflets radiating from the hub: the outer pair hangs back, the centre one is longest
  const spread = shape === 1 ? 1.12 : shape === 2 ? 0.88 : 1;
  const spec: Array<[number, number, number]> = [
    [-74 * spread, 8.6, 3.5],
    [74 * spread, 8.6, 3.5],
    [-38 * spread, 11, 4.5],
    [38 * spread, 11, 4.5],
    [0, 12.4, 5.2],
  ];
  if (shape === 2) {
    spec[0]![1] = 7.8;
    spec[1]![1] = 7.8;
  }
  for (const [deg, len, wid] of spec) {
    const a = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(0, hub);
    ctx.rotate(a);
    // a short leaflet stalk
    ctx.strokeStyle = rgba(dark, 0.8);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -1.1);
    ctx.stroke();
    ctx.translate(0, -0.9);
    const poly = leafletPoly(len, wid, rnd);
    ctx.fillStyle = rgba(base, 0.82);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(base, 0.3);
    tracePoly(ctx, deform(poly, rnd, 1, 0.025));
    ctx.fill();
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // lit left half and a deeper right half; the tip warms toward the light colour
    ctx.fillStyle = rgba(light, 0.4);
    ctx.fillRect(-wid * 1.2, -len * 1.05, wid * 1.2, len * 1.1);
    ctx.fillStyle = rgba(dark, 0.3);
    ctx.fillRect(wid * 0.1, -len * 1.05, wid * 1.2, len * 1.1);
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, rgba(dark, 0.34));
    g.addColorStop(0.5, rgba(dark, 0));
    g.addColorStop(1, rgba(light, 0.26));
    ctx.fillStyle = g;
    ctx.fillRect(-wid * 1.2, -len * 1.05, wid * 2.4, len * 1.1);
    // a second colour bleeding wet-in-wet near the tip, and the pale paper left at the lit shoulder
    {
      const bl: number[] = [];
      const bx = rnd.range(-0.3, 0.3) * wid;
      const by = -len * rnd.range(0.62, 0.86);
      for (let k = 0; k < 8; k++) bl.push(bx + Math.cos(k * 0.785) * wid * 0.95 * rnd.range(0.8, 1.15), by + Math.sin(k * 0.785) * wid * 1.05 * rnd.range(0.8, 1.15));
      feather(ctx, bl, accent, 0.5, rnd, 3, 1, 0.45, 0.12);
    }
    // veins
    ctx.strokeStyle = rgba('#FFE2C0', 0.42);
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len * 0.92);
    for (let k = 1; k <= 3; k++) {
      const y = -len * (0.2 + k * 0.18);
      ctx.moveTo(0, y);
      ctx.lineTo(-wid * 0.62, y - len * 0.1);
      ctx.moveTo(0, y);
      ctx.lineTo(wid * 0.62, y - len * 0.1);
    }
    ctx.stroke();
    ctx.restore();
    // pigment pooled just inside the edge
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    ctx.strokeStyle = rgba(dark, 0.16);
    for (let k = 0; k < 2; k++) {
      ctx.lineWidth = 0.5 + k * 0.5;
      tracePoly(ctx, deform(poly, rnd, 1, 0.012));
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = rgba(dark, 0.7);
    ctx.lineWidth = 0.34;
    ctx.setLineDash([3.2, 0.8, 1.6, 0.7]);
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  return finishSprite(sp, seed, q, 0.8);
}

function paintBerries(q: number): Sprite {
  const rnd = new Rand(404);
  const { sp, ctx } = newSprite(14, 14, 7, 1.5, q);
  ctx.strokeStyle = rgba('#7A3A34', 0.9);
  ctx.lineWidth = 0.5;
  const pts: Array<[number, number]> = [
    [-3.2, 6], [0.4, 8.4], [3.4, 5.4], [-1, 3.6], [1.4, 11], [-3.6, 9.6],
  ];
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 2);
  for (const [x, y] of pts) {
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(x * 0.4, y * 0.4, x, y - 1.6);
  }
  ctx.stroke();
  for (const [x, y] of pts) {
    ctx.fillStyle = rgba('#2A2644', 0.96);
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#5A6AA4', 0.55);
    ctx.beginPath();
    ctx.ellipse(x - 0.6, y - 0.7, 0.8, 0.6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.stroke();
    void rnd;
  }
  return sp;
}

export async function buildLeafSprites(q: number, alive: () => boolean): Promise<LeafSprites | null> {
  const leaf: Sprite[][] = [];
  for (let c = 0; c < LEAF_COLS.length; c++) {
    leaf.push([]);
    for (let s = 0; s < 3; s++) {
      leaf[c]!.push(paintLeaf(600 + c * 31 + s * 7, q, c, s));
      await tick();
      if (!alive()) return null;
    }
  }
  return { leaf, berry: paintBerries(q), base: 24 };
}

/* ------------------------------------------------------------------ drawing */

const STEM_COL = ['#5E4034', '#6A4A3A', '#7A523E', '#8A4E3E'] as const;

/** a point on the quadratic curve at t */
const qb = (a: number, c: number, b: number, t: number): number => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

export class VineView {
  /** where each node's tip is this frame (local u, v) */
  readonly tu: Float32Array;
  readonly tv: Float32Array;
  private readonly paths: Path2D[] = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  constructor(readonly model: VineModel) {
    this.tu = new Float32Array(model.nodes.length);
    this.tv = new Float32Array(model.nodes.length);
  }

  /** world point where node i currently ends (call after draw, or after `tips`) */
  tips(st: VineState): void {
    const nodes = this.model.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const g = st.g[i]!;
      this.tu[i] = qb(n.sx, n.cx, n.ex, g);
      this.tv[i] = qb(n.sy, n.cy, n.ey, g);
    }
  }

  draw(ctx: CanvasRenderingContext2D, st: VineState, tf: WallXf, spr: LeafSprites, t: number, reduced: boolean): void {
    const nodes = this.model.nodes;
    const m0 = ctx.getTransform();
    const A = m0.a;
    const E = m0.e;
    const F = m0.f;
    this.tips(st);
    // ---- stems
    for (let c = 0; c < 4; c++) this.paths[c] = new Path2D();
    let young: Path2D | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const g = st.g[i]!;
      if (g <= 0.002) continue;
      const n = nodes[i]!;
      // the sub-curve from the start to g
      const mcu = n.sx + (n.cx - n.sx) * g;
      const mcv = n.sy + (n.cy - n.sy) * g;
      const x0 = toWorldX(tf, n.sx);
      const y0 = toWorldY(tf, n.sy);
      const xc = toWorldX(tf, mcu);
      const yc = toWorldY(tf, mcv);
      const x1 = toWorldX(tf, this.tu[i]!);
      const y1 = toWorldY(tf, this.tv[i]!);
      const p = g < 0.999 ? (young ??= new Path2D()) : this.paths[n.cls]!;
      p.moveTo(x0, y0);
      p.quadraticCurveTo(xc, yc, x1, y1);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const widths = [3.0, 1.9, 1.25, 0.8];
    for (let c = 0; c < 4; c++) {
      const w = widths[c]!;
      ctx.save();
      ctx.translate(0.7, 0.95);
      ctx.strokeStyle = 'rgba(40,24,30,0.4)';
      ctx.lineWidth = w + 0.5;
      ctx.stroke(this.paths[c]!);
      ctx.restore();
      ctx.strokeStyle = STEM_COL[c]!;
      ctx.lineWidth = w;
      ctx.stroke(this.paths[c]!);
      ctx.save();
      ctx.translate(-0.3, -0.4);
      ctx.strokeStyle = 'rgba(214,172,136,0.42)';
      ctx.lineWidth = w * 0.34;
      ctx.stroke(this.paths[c]!);
      ctx.restore();
    }
    if (young) {
      ctx.strokeStyle = '#9A6244';
      ctx.lineWidth = 0.95;
      ctx.stroke(young);
      ctx.strokeStyle = 'rgba(244,196,150,0.5)';
      ctx.lineWidth = 0.34;
      ctx.stroke(young);
    }
    // ---- leaves (higher ones first)
    ctx.imageSmoothingQuality = 'low';
    const leaves = this.model.leaves;
    const ord = this.model.order;
    const wnd = reduced ? 0 : 1;
    for (let k = 0; k < ord.length; k++) {
      const lf = leaves[ord[k]!]!;
      const g = st.g[lf.node]!;
      if (g <= 0.3) continue;
      const open = leafOpen(g);
      if (open < 0.02) continue;
      const u = this.tu[lf.node]!;
      const v = this.tv[lf.node]!;
      const wx = toWorldX(tf, u);
      const wy = toWorldY(tf, v);
      // the leaf axis in world: local (du, dv) -> (sign * du, -dv); the sprite points up, so rotation = angle from up
      const ax = tf.sign * lf.du;
      const ay = -lf.dv;
      let rot = Math.atan2(ax, -ay);
      const sw = wnd * sway(t, wx, lf.ph) * 0.07;
      rot += sw + wnd * 0.04 * Math.sin(t * 1.9 + lf.ph * 2.3) * (1 - 0.5 * open);
      const s = lf.size * (0.2 + 0.8 * open);
      // unfolding: narrow and short first, then fully open
      const sx = s * (0.45 + 0.55 * open);
      const sy = s * (0.62 + 0.38 * open);
      const co = Math.cos(rot);
      const si = Math.sin(rot);
      ctx.setTransform(A * co * sx, A * si * sx, -A * si * sy, A * co * sy, E + A * wx, F + A * wy);
      const sp = spr.leaf[lf.color]![lf.shape]!;
      ctx.drawImage(sp.cv, -sp.px, -sp.py, sp.w, sp.h);
    }
    // ---- berries hang from a few free twigs
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (!n.berry || st.g[i]! < 0.98) continue;
      const wx = toWorldX(tf, this.tu[i]!);
      const wy = toWorldY(tf, this.tv[i]!);
      const sw = reduced ? 0 : sway(t, wx, i) * 0.05;
      const co = Math.cos(sw);
      const si = Math.sin(sw);
      ctx.setTransform(A * co, A * si, -A * si, A * co, E + A * wx, F + A * wy);
      const sp = spr.berry;
      ctx.drawImage(sp.cv, -sp.px, -sp.py, sp.w, sp.h);
    }
    ctx.setTransform(m0);
  }
}

/** the leaf sprite and its size, for falling and lying clippings */
export const leafSpriteOf = (spr: LeafSprites, color: number, shape: number): Sprite => spr.leaf[clamp(color, 0, spr.leaf.length - 1)]![clamp(shape, 0, 2)]!;
