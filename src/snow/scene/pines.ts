/**
 * The pine painter: the signature of "On a Roll". A seeded painter of snow-laden conifers in the collection's hand:
 * an ink-drawn trunk, drooping tiers of boughs each laid in stacked translucent blue-green glazes (warmer and
 * paler where the upper-left light falls, deep blue-green in shade and underneath), a dry-brush fringe of needles
 * along every lower edge, a row of snow lumps lying along the top of every bough (paper white, a cool violet
 * underside and a pale blue shadow on the shaded side), a broken ink contour, a few bare twigs, paper granulation.
 *
 * Three kinds: a tall narrow spruce with strongly drooping boughs, a broader fir with stiffer boughs, and a
 * young sparse tree with its trunk showing. Every tree is seeded, so no two are alike. Each is painted once into a
 * sprite (pivot at the trunk foot); the scene lays the sprites along the crests, the valley and the edges.
 *
 * Everything is built in a unit space where the tree is 100 tall, then scaled to the sprite; nothing runs per frame.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import type { Pt } from '../../river/scene/paint';
import { grain } from '../../vine/scene/art';

export type PineKind = 'spruce' | 'fir' | 'young';

export interface PineSprite {
  cv: HTMLCanvasElement;
  /** world size of the sprite and the trunk foot inside it (world units) */
  w: number;
  h: number;
  px: number;
  py: number;
  /** the tree's height in world units */
  H: number;
  /** points near the tips of boughs carrying snow (world units, relative to the foot): where a puff can fall from */
  tips: Array<{ x: number; y: number }>;
}

const C = {
  deep: '#173b47',
  shade: '#1f4d54',
  mid: '#3c7a5e',
  lit: '#76a868',
  warm: '#b3cb72',
  ink: '#1f2a33',
  bark: '#6a5446',
  barkDark: '#34292a',
  snow: '#fdfdff',
  snowWarm: '#fff7e2',
  snowShade: '#8e8dc9',
  snowShade2: '#b7bfe4',
  snowCool: '#c3cbec',
};

interface KindSpec {
  tiers: [number, number];
  /** half-length of the widest tier (unit space) */
  reach: number;
  /** how much the boughs droop (tip drop as a share of their length) */
  droop: number;
  /** boughs per side per tier */
  per: [number, number];
  /** thickness of a bough as a share of its length */
  thick: number;
  /** how far the topmost tier's boughs reach, as a share of the widest */
  topReach: number;
  /** snow coverage 0..1 on the boughs */
  snow: number;
  trunkW: number;
  /** share of the height the lowest boughs start above the ground */
  lift: number;
}

const SPECS: Record<PineKind, KindSpec> = {
  spruce: { tiers: [10, 12], reach: 22, droop: 0.72, per: [3, 4], thick: 0.4, topReach: 0.2, snow: 0.8, trunkW: 2.6, lift: 0.1 },
  fir: { tiers: [7, 9], reach: 31, droop: 0.42, per: [3, 4], thick: 0.42, topReach: 0.22, snow: 0.88, trunkW: 3.2, lift: 0.08 },
  young: { tiers: [5, 7], reach: 21, droop: 0.5, per: [2, 3], thick: 0.38, topReach: 0.24, snow: 1, trunkW: 2, lift: 0.17 },
};

/** the unit-space half width of a kind's sprite (its widest bough plus room for the snow and the needles) */
export const pineHalfWidth = (kind: PineKind): number => SPECS[kind].reach * 1.32 + 6;

interface Bough {
  dir: number;
  ax: number;
  ay: number;
  L: number;
  a0: number;
  droop: number;
  T: number;
  tier: number;
  back: boolean;
  front: boolean;
  snow: number;
}

const WORLD_PAD_TOP = 14;
const WORLD_PAD_BOTTOM = 7;

/**
 * Paint one pine of height H world units at q px per world unit. The sprite's pivot is the trunk foot.
 * `detail` thins the needle fringe for very small trees (they read as dabs, as a painter would do them).
 */
export function makePine(seed: number, kind: PineKind, H: number, q: number, o: { lean?: number } = {}): PineSprite {
  const rnd = new Rand(seed * 7919 + (kind === 'spruce' ? 1 : kind === 'fir' ? 2 : 3));
  const S = SPECS[kind];
  const u = H / 100;
  const k = q * u; // px per unit-space unit
  const halfU = pineHalfWidth(kind);
  const Wpx = Math.ceil(2 * halfU * k);
  const Hpx = Math.ceil((100 + WORLD_PAD_TOP + WORLD_PAD_BOTTOM) * k);
  const cv = document.createElement('canvas');
  cv.width = Math.max(4, Wpx);
  cv.height = Math.max(4, Hpx);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(k, 0, 0, k, Wpx / 2, (100 + WORLD_PAD_TOP) * k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const detail = clamp((H * q) / 170, 0.18, 1);
  // thinnest line worth drawing, in unit space (about 0.7 device px)
  const minW = 0.7 / k;
  const lean = o.lean ?? rnd.range(-3.5, 3.5);
  const axisX = (y: number) => lean * (-y / 100) ** 1.6;

  /* ---- the boughs: tiers from the top, each with a few boughs a side */
  const nT = rnd.int(S.tiers[0], S.tiers[1]);
  const boughs: Bough[] = [];
  const topY = -93;
  const botY = -(100 * S.lift + 8);
  const tips: Array<{ x: number; y: number }> = [];
  for (let t = 0; t < nT; t++) {
    const f = t / (nT - 1);
    const ay0 = topY + (botY - topY) * Math.pow(f, kind === 'fir' ? 0.92 : 1);
    const reach = S.reach * (S.topReach + (1 - S.topReach) * Math.pow(f, kind === 'fir' ? 0.78 : 0.88)) * rnd.range(0.92, 1.08);
    for (const dir of [-1, 1]) {
      // an asymmetric tree: one side a little longer, a bough now and then missing
      const side = rnd.range(0.88, 1.1);
      const n = t < 2 ? 2 : rnd.int(S.per[0], S.per[1]);
      for (let j = 0; j < n; j++) {
        if (t > 3 && j === 0 && rnd.chance(0.05)) continue;
        const lf = j === 0 ? 1 : j === 1 ? rnd.range(0.7, 0.82) : rnd.range(0.48, 0.62);
        const L = reach * side * lf;
        const T = Math.max(1.8, L * S.thick * rnd.range(0.9, 1.15));
        const ay = ay0 + j * rnd.range(2.4, 3.8) * (kind === 'young' ? 1.6 : 1);
        boughs.push({
          dir,
          ax: axisX(ay) + dir * 0.6,
          ay,
          L,
          a0: rnd.range(0.05, 0.24),
          droop: S.droop * rnd.range(0.82, 1.18) * (0.75 + 0.25 * f + (t === 0 ? -0.3 : 0)),
          T,
          tier: t,
          back: false,
          front: false,
          snow: clamp(S.snow * rnd.range(0.78, 1.06) + (t < 3 ? 0.1 : 0), 0.35, 1),
        });
      }
    }
    // boughs that point toward us (short, hanging in front of the trunk) and away (behind it), for the cone's depth
    if (t > 0) {
      const nf = kind === 'young' ? (rnd.chance(0.5) ? 1 : 0) : rnd.int(1, 2);
      for (let j = 0; j < nf; j++) {
        const dir = rnd.sign();
        boughs.push({ dir, ax: axisX(ay0) + rnd.range(-2, 2), ay: ay0 + rnd.range(-1, 3), L: reach * rnd.range(0.4, 0.62), a0: rnd.range(0.55, 0.95), droop: 0.4, T: Math.max(2, reach * 0.2), tier: t, back: false, front: true, snow: S.snow * 0.55 });
      }
      for (let j = 0; j < 2; j++) {
        const dir = j === 0 ? -1 : 1;
        boughs.push({ dir, ax: axisX(ay0), ay: ay0 - 2, L: reach * rnd.range(0.6, 0.85), a0: rnd.range(0.0, 0.1), droop: S.droop * 0.7, T: Math.max(2, reach * 0.24), tier: t, back: true, front: false, snow: S.snow * 0.6 });
      }
    }
  }

  /** the centre line of a bough, sampled */
  const centre = (b: Bough, n = 9): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let x: number;
      let y: number;
      if (b.front) {
        x = b.ax + b.dir * b.L * 0.22 * t;
        y = b.ay + b.L * (Math.sin(b.a0) * t + b.droop * t * t) * 1.15;
      } else {
        x = b.ax + b.dir * b.L * (Math.cos(b.a0) * t - 0.12 * t * t);
        y = b.ay + b.L * (Math.sin(b.a0) * t + b.droop * t * t);
      }
      pts.push([x, y]);
    }
    return pts;
  };
  const width = (b: Bough) => (t: number) => b.T * (0.3 * (1 - t) ** 2 + 0.7 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.9));
  /** lower edge line of a bough and the up-pointing normal at each sample */
  const edges = (b: Bough, c: Pt[]) => {
    const w = width(b);
    const D: Pt[] = [];
    const N: Pt[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[Math.max(0, i - 1)]!;
      const e = c[Math.min(c.length - 1, i + 1)]!;
      let tx = e[0] - a[0];
      let ty = e[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      let nx = ty;
      let ny = -tx;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const hw = w(i / (c.length - 1)) / 2;
      D.push([c[i]![0] - nx * hw, c[i]![1] - ny * hw]);
      N.push([nx, ny]);
    }
    return { D, N };
  };

  /** how lit a place on the tree is: 0 shade .. 1 full light (the light is at the upper left) */
  const litAt = (x: number, y: number) => clamp(0.48 - 0.5 * (x / (S.reach * 0.95)) + 0.16 * ((-y - 50) / 50), 0, 1);
  const tone = (f: number): string => (f < 0.5 ? mix(C.shade, C.mid, f * 2) : mix(C.mid, C.lit, (f - 0.5) * 2));

  /** a lumpy ellipse as a polygon (so a stack of them has an uneven, hand-laid edge) */
  const lumpy = (x: number, y: number, rx: number, ry: number, rot: number, amp: number): number[] => {
    const n = 11;
    const pts: number[] = [];
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const j = 1 + rnd.range(-amp, amp);
      const ex = Math.cos(a) * rx * j;
      const ey = Math.sin(a) * ry * j;
      pts.push(x + ex * cs - ey * sn, y + ex * sn + ey * cs);
    }
    return pts;
  };
  const fillBlob = (x: number, y: number, rx: number, ry: number, rot: number, col: string, a: number, amp = 0.09) => {
    ctx.fillStyle = rgba(col, a);
    tracePoly(ctx, lumpy(x, y, rx, ry, rot, amp));
    ctx.fill();
  };

  /* ---- the mass behind everything: soft blooms of deep blue-green down the tree, so the gaps between boughs read as
   * shadow in the tree and not as sky */
  {
    for (let t = 2; t < nT; t++) {
      const f = t / (nT - 1);
      const r = S.reach * (S.topReach + (1 - S.topReach) * Math.pow(f, 0.88)) * 0.5;
      const y = topY + (botY - topY) * f + r * S.droop * 0.55;
      const poly = lumpy(axisX(y), y, r, r * 0.55 + 3, 0, 0.1);
      ctx.fillStyle = rgba(C.deep, kind === 'young' ? 0.07 : 0.15);
      for (let i = 0; i < 2; i++) {
        tracePoly(ctx, deform(poly, rnd, 2, 0.06));
        ctx.fill();
      }
    }
  }

  /** one bough: glazes, underside, needle fringe, snow, ink */
  const paintBough = (b: Bough) => {
    const nS = 10;
    const c = centre(b, nS);
    const { D, N } = edges(b, c);
    const wf = width(b);
    const mid = c[Math.floor(c.length / 2)]!;
    let f = litAt(mid[0], mid[1]);
    if (b.back) f *= 0.55;
    if (b.front) f = f * 0.85 + 0.05;
    const col = tone(f);
    const segL = b.L / nS;
    const tang = (i: number) => {
      const a = c[Math.max(0, i - 1)]!;
      const e = c[Math.min(nS, i + 1)]!;
      return Math.atan2(e[1] - a[1], e[0] - a[0]);
    };
    // the body of foliage: stacked translucent blobs along the bough, so the glaze builds up unevenly
    for (let i = 1; i <= nS; i++) {
      const w = wf(i / nS);
      if (w < 0.5) continue;
      const rot = tang(i);
      const jx = rnd.range(-0.25, 0.25) * segL;
      fillBlob(c[i]![0] + jx, c[i]![1], segL * rnd.range(0.8, 1.1), w * rnd.range(0.52, 0.66), rot, col, b.back ? 0.46 : 0.4);
      fillBlob(c[i]![0] - N[i]![0] * w * 0.18, c[i]![1] - N[i]![1] * w * 0.18, segL * rnd.range(0.7, 1), w * rnd.range(0.34, 0.46), rot, mix(col, C.deep, 0.42), 0.26 + 0.14 * (1 - f));
      if (f > 0.5 && !b.back) fillBlob(c[i]![0] + N[i]![0] * w * 0.2, c[i]![1] + N[i]![1] * w * 0.2, segL * rnd.range(0.6, 0.9), w * rnd.range(0.2, 0.3), rot, C.warm, 0.32 * (f - 0.42) * 2);
    }
    // the underside: deep blue-green pooled along the lower half
    for (let i = 1; i <= nS; i += 1) {
      const w = wf(i / nS);
      if (w < 0.8) continue;
      fillBlob(c[i]![0] - N[i]![0] * w * 0.3, c[i]![1] - N[i]![1] * w * 0.3, segL * rnd.range(0.7, 1.05), w * rnd.range(0.14, 0.22), tang(i), C.deep, 0.22 + 0.16 * (1 - f), 0.12);
    }
    // needles: a dry-brush fringe along the lower edge and the tip, dark, and a few pale ones on the lit upper side
    // (batched: a handful of strokes per bough, each a bundle of needles in one tone)
    const nNeedle = Math.round((b.L * 1.6 + 8) * detail);
    const dark: Array<{ col: string; a: number; w: number }> = [
      { col: mix(col, C.deep, 0.35), a: 0.5, w: 0.5 },
      { col: mix(col, C.deep, 0.6), a: 0.6, w: 0.42 },
      { col: mix(col, C.deep, 0.85), a: 0.66, w: 0.36 },
    ];
    const bundles: number[][] = [[], [], []];
    for (let i = 0; i < nNeedle; i++) {
      const t = rnd.range(0.06, 1);
      const idx = Math.min(c.length - 2, Math.floor(t * (c.length - 1)));
      const fr = t * (c.length - 1) - idx;
      const ex = D[idx]![0] + (D[idx + 1]![0] - D[idx]![0]) * fr;
      const ey = D[idx]![1] + (D[idx + 1]![1] - D[idx]![1]) * fr;
      const nx = N[idx]![0];
      const ny = N[idx]![1];
      const len = rnd.range(1.6, 4.2) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1))) * (b.T / 6 + 0.6);
      const ang = Math.atan2(-ny, -nx) + rnd.range(-0.6, 0.6) + b.dir * 0.2;
      bundles[i % 3]!.push(ex, ey, ex + Math.cos(ang) * len, ey + Math.sin(ang) * len);
    }
    const strokeBundle = (arr: number[], col: string, a: number, w: number) => {
      if (!arr.length) return;
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = Math.max(minW, w);
      ctx.beginPath();
      for (let q2 = 0; q2 < arr.length; q2 += 4) {
        ctx.moveTo(arr[q2]!, arr[q2 + 1]!);
        ctx.lineTo(arr[q2 + 2]!, arr[q2 + 3]!);
      }
      ctx.stroke();
    };
    for (let q2 = 0; q2 < 3; q2++) strokeBundle(bundles[q2]!, dark[q2]!.col, dark[q2]!.a, dark[q2]!.w);
    if (detail > 0.4) {
      const pale: number[][] = [[], []];
      for (let i = 0; i < nNeedle * 0.5; i++) {
        const t = rnd.range(0.1, 0.98);
        const idx = Math.min(c.length - 2, Math.floor(t * (c.length - 1)));
        const w = wf(t);
        const ex = c[idx]![0] + N[idx]![0] * rnd.range(-0.2, 0.55) * w;
        const ey = c[idx]![1] + N[idx]![1] * rnd.range(-0.2, 0.55) * w;
        const ang = Math.atan2(-N[idx]![1], -N[idx]![0]) + rnd.range(-0.9, 0.9);
        const len = rnd.range(1.2, 2.8);
        pale[i % 2]!.push(ex, ey, ex + Math.cos(ang) * len, ey + Math.sin(ang) * len);
      }
      strokeBundle(pale[0]!, f > 0.45 ? C.warm : mix(col, C.lit, 0.4), 0.32, 0.35);
      strokeBundle(pale[1]!, f > 0.45 ? C.lit : mix(col, C.lit, 0.6), 0.3, 0.35);
    }
    // the snow lying along the top of the bough: a row of lumps, a violet shade under each, pale blue on the shaded side
    const cover = b.snow * (b.back ? 0.65 : 1);
    if (cover > 0.3) {
      const t0 = b.front ? 0.02 : 0.05;
      const t1 = b.front ? 0.55 : 0.5 + 0.42 * cover;
      const m = Math.max(3, Math.round((3 + b.L / 2.4) * cover));
      const lumps: Array<{ x: number; y: number; rx: number; ry: number; rot: number }> = [];
      for (let i = 0; i < m; i++) {
        const t = t0 + (t1 - t0) * ((i + rnd.range(0.1, 0.9)) / m);
        const fi = t * nS;
        const i0 = Math.min(nS - 1, Math.floor(fi));
        const fr = fi - i0;
        const cx0 = c[i0]![0] + (c[i0 + 1]![0] - c[i0]![0]) * fr;
        const cy0 = c[i0]![1] + (c[i0 + 1]![1] - c[i0]![1]) * fr;
        const nx = N[i0]![0];
        const ny = N[i0]![1];
        const w = wf(t);
        const rx = Math.max(1.5, (b.L * (t1 - t0)) / m) * rnd.range(1.0, 1.5);
        const ry = Math.max(0.9, w * rnd.range(0.26, 0.4) * cover + 0.35);
        lumps.push({ x: cx0 + nx * w * 0.3, y: cy0 + ny * w * 0.3, rx, ry, rot: tang(i0) + rnd.range(-0.12, 0.12) });
      }
      // a continuous body for the snow first (the lumps ride on it), so it reads as one fall of snow, not beads
      const line: number[] = [];
      for (const l of lumps) line.push(l.x, l.y);
      const bodyW = Math.max(1.2, b.T * 0.5 * cover);
      ctx.fillStyle = rgba(C.snowShade, 0.34 + 0.16 * (1 - f));
      ribbon(ctx, line.map((v, i) => (i % 2 ? v + bodyW * 0.28 : v)), bodyW * 1.18, 0.7);
      ctx.fillStyle = rgba(C.snowShade2, 0.34);
      ribbon(ctx, line.map((v, i) => (i % 2 ? v + bodyW * 0.42 : v)), bodyW * 1.08, 0.7);
      for (const l of lumps) {
        fillBlob(l.x + 0.2, l.y + l.ry * 0.55, l.rx * 1.02, l.ry * 0.95, l.rot, C.snowShade, 0.22 + 0.14 * (1 - f), 0.1);
      }
      ctx.fillStyle = rgba(C.snow, 0.97);
      ribbon(ctx, line, bodyW, 0.7);
      for (const l of lumps) {
        fillBlob(l.x, l.y - l.ry * 0.12, l.rx, l.ry, l.rot, C.snow, 0.97, 0.07);
        if (f < 0.62) fillBlob(l.x + l.rx * 0.1, l.y + l.ry * 0.28, l.rx * 0.8, l.ry * 0.62, l.rot, C.snowCool, 0.55 * (1 - f / 0.62), 0.07);
        else fillBlob(l.x - l.rx * 0.16, l.y - l.ry * 0.3, l.rx * 0.6, l.ry * 0.45, l.rot, C.snowWarm, 0.5, 0.07);
      }
      // a clump of snow hanging at the tip now and then
      if (!b.front && !b.back && b.L > 8 && rnd.chance(0.3) && detail > 0.5) {
        const tp = c[c.length - 1]!;
        fillBlob(tp[0], tp[1] - 0.2, rnd.range(1.2, 2.2), rnd.range(0.8, 1.5), 0, C.snow, 0.95, 0.1);
        fillBlob(tp[0] + 0.2, tp[1] + 0.5, 1.3, 0.55, 0, C.snowShade, 0.4, 0.1);
      }
      if (!b.back && !b.front && b.tier >= 2 && b.L > 10) tips.push({ x: c[c.length - 3]![0], y: c[c.length - 3]![1] });
    }
    // the ink: a broken dark contour under the bough (heavier toward the shade)
    if (detail > 0.3) {
      const inkA = (b.back ? 0.3 : 0.5) * (0.65 + 0.5 * (1 - f));
      let i = 1;
      while (i < D.length - 1) {
        const j = Math.min(D.length - 1, i + rnd.int(2, 5));
        const seg: number[] = [];
        for (let q2 = i; q2 <= j; q2++) seg.push(D[q2]![0] + rnd.range(-0.12, 0.12), D[q2]![1] + rnd.range(-0.1, 0.18));
        ctx.fillStyle = rgba(C.ink, inkA * rnd.range(0.6, 1.1));
        ribbon(ctx, seg, Math.max(minW, rnd.range(0.4, 0.8)), 0.85);
        i = j + rnd.int(1, 3);
      }
    }
    if (!b.back && !b.front && b.L > 9 && rnd.chance(0.35) && detail > 0.5) {
      // a bare twig sprouting from the bough's tip
      const tp = c[c.length - 1]!;
      const ang = Math.atan2(c[c.length - 1]![1] - c[c.length - 3]![1], c[c.length - 1]![0] - c[c.length - 3]![0]) + rnd.range(-0.5, 0.5);
      ctx.strokeStyle = rgba(C.ink, 0.5);
      ctx.lineWidth = Math.max(minW, 0.4);
      ctx.beginPath();
      ctx.moveTo(tp[0], tp[1]);
      ctx.quadraticCurveTo(tp[0] + Math.cos(ang) * 2.4, tp[1] + Math.sin(ang) * 2.4 + 0.6, tp[0] + Math.cos(ang + 0.3) * 4.4, tp[1] + Math.sin(ang + 0.3) * 4.4 + 1.6);
      ctx.stroke();
    }
  };

  /* ---- order: the boughs behind, the trunk, then the tiers from the bottom up (upper tiers hang over the lower) */
  for (const b of boughs.filter((x) => x.back).sort((a, b2) => b2.tier - a.tier)) paintBough(b);

  // the trunk: tapering, warm bark with a shaded right side, ink edges, snow clinging on the windward side
  {
    const tw0 = S.trunkW;
    const left: number[] = [];
    const right: number[] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = -t * 99;
      const w = (tw0 * (1 - t * 0.9) + 0.35) * (i === 0 ? 1.5 : 1 + 0.18 * Math.sin(i * 2.1) * (1 - t));
      const x = axisX(y);
      left.push(x - w / 2, y);
      right.push(x + w / 2, y);
    }
    const poly: number[] = [...left];
    for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i]!, right[i + 1]!);
    ctx.fillStyle = rgba(C.bark, 0.82);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(C.barkDark, 0.45);
    const shadeStrip: number[] = [];
    for (let i = 0; i < left.length; i += 2) shadeStrip.push((left[i]! + right[i]!) / 2 + (right[i]! - left[i]!) * 0.1, left[i + 1]!);
    for (let i = right.length - 2; i >= 0; i -= 2) shadeStrip.push(right[i]!, right[i + 1]!);
    tracePoly(ctx, deform(shadeStrip, rnd, 1, 0.03));
    ctx.fill();
    ctx.fillStyle = rgba(C.ink, 0.62);
    for (const side of [left, right]) {
      let i = 0;
      const m = side.length / 2;
      while (i < m - 1) {
        const j = Math.min(m - 1, i + rnd.int(2, 5));
        const seg: number[] = [];
        for (let q2 = i; q2 <= j; q2++) seg.push(side[2 * q2]! + rnd.range(-0.1, 0.1), side[2 * q2 + 1]!);
        ribbon(ctx, seg, Math.max(minW, rnd.range(0.35, 0.7)), 0.8);
        i = j + (rnd.chance(0.3) ? 1 : 0);
      }
    }
    // snow clinging to the left of the trunk, in a few patches
    ctx.fillStyle = rgba(C.snow, 0.85);
    for (let i = 0; i < 4; i++) {
      const y = rnd.range(-70, -6);
      const x = axisX(y) - (tw0 * (1 - (-y / 99) * 0.9) + 0.35) * 0.32;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.55, rnd.range(1.4, 3.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the spire
    const topX = axisX(-99);
    ctx.strokeStyle = rgba(C.ink, 0.6);
    ctx.lineWidth = Math.max(minW, 0.5);
    ctx.beginPath();
    ctx.moveTo(topX, -97);
    ctx.lineTo(topX + lean * 0.05, -104);
    ctx.stroke();
  }
  // tiers from the bottom up
  const sorted = boughs.filter((x) => !x.back).sort((a, b2) => b2.tier - a.tier || b2.L - a.L);
  // the front boughs hang over the trunk, so they come after the side ones of the same tier
  for (const b of sorted.filter((x) => !x.front)) paintBough(b);
  for (const b of sorted.filter((x) => x.front).sort((a, b2) => b2.tier - a.tier)) paintBough(b);

  // the top: a little cap of snow and the leader
  {
    const x0 = axisX(-96);
    ctx.fillStyle = rgba(C.shade, 0.55);
    ctx.beginPath();
    ctx.moveTo(x0 - 1.8, -88);
    ctx.quadraticCurveTo(x0 - 0.4, -96, x0 + lean * 0.05, -102);
    ctx.quadraticCurveTo(x0 + 0.5, -96, x0 + 2, -88);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(C.snow, 0.96);
    ctx.beginPath();
    ctx.ellipse(x0 - 0.2, -93.5, 1.7, 3.3, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(C.snowShade2, 0.6);
    ctx.beginPath();
    ctx.ellipse(x0 + 0.7, -91.8, 1, 1.9, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // a mound of snow round the foot, shadowed on the right
  {
    const x = axisX(0);
    fillBlob(x + 2.4, 1.2, S.trunkW * 2.9, 2.4, 0, C.snowShade2, 0.55, 0.12);
    fillBlob(x - 0.4, 0.2, S.trunkW * 2.5, 2.1, 0, C.snow, 0.96, 0.1);
    fillBlob(x + 1.6, 1, S.trunkW * 1.7, 1, 0, C.snowShade, 0.28, 0.1);
  }

  // the whole tree: light from the upper left (warm), shade to the lower right (cool violet-blue)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  const lg = ctx.createLinearGradient(0, 0, Wpx * 0.9, Hpx * 0.55);
  lg.addColorStop(0, 'rgba(255,242,206,0.2)');
  lg.addColorStop(0.45, 'rgba(255,242,206,0)');
  lg.addColorStop(1, 'rgba(70,72,150,0.16)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.restore();
  grain(cv, seed * 13 + 5, 0.9, Math.max(1, Math.round(q * 0.6)));

  return {
    cv,
    w: cv.width / q,
    h: cv.height / q,
    px: Wpx / 2 / q,
    py: ((100 + WORLD_PAD_TOP) * k) / q,
    H,
    tips: tips.map((t) => ({ x: t.x * u, y: t.y * u })),
  };
}

/** veil a finished sprite toward the paper and a cool blue (atmospheric perspective for distant trees) */
export function hazeSprite(cv: HTMLCanvasElement, paper: number, blue: number): void {
  const c = cv.getContext('2d')!;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = rgba('#FBF6EA', paper);
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = rgba('#98A8D6', blue);
  c.fillRect(0, 0, cv.width, cv.height);
  c.restore();
}

/** lay a pine sprite at (x, y), its foot, scaled by `k` (1 = as painted) and optionally mirrored */
export function layPine(ctx: CanvasRenderingContext2D, s: PineSprite, x: number, y: number, k = 1, flip = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -k : k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.cv, -s.px, -s.py, s.w, s.h);
  ctx.restore();
}
