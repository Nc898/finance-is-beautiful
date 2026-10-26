/**
 * Where things stand in the painted world (scene-owned; geom.ts holds the fixed geometry the climbers share):
 * the creek's course, the ridges, the crest line of the hills, the snowbank at their foot, and the plan of the
 * pines (a pure function of the visible extent, so a wider screen simply sees more wood).
 */
import { Rand } from '../../scene/prng';
import { CREST_Y, FOOT_Y, HILL, LANES, WORLD } from './geom';
import type { PineKind } from './pines';
import { DEBTS, STRATEGIES } from '../types';

/** the creek: its centre line and its width at depth y (it widens toward us) */
export const CREEK_Y0 = 279;
export const creekX = (y: number): number => 500 + 15 * Math.sin((y - CREEK_Y0) / 47) * Math.min(1, (y - CREEK_Y0) / 80) + 5 * Math.sin((y - CREEK_Y0) / 17.5) * Math.min(1, (y - CREEK_Y0) / 120);
export const creekW = (y: number): number => 2.6 + Math.max(0, y - CREEK_Y0) * 0.108;
/** the footbridge crosses the creek here */
export const BRIDGE_Y = 556;

/** distant mountains (two ranges) and the low wooded ridge in front of them */
export const ridgeBack = (x: number): number => 276 + 5 * Math.sin(x / 83 + 0.7) + 3 * Math.sin(x / 31 + 1.1);

/** the crest line of the hills (domes, a notch for the creek's valley between them) */
export function crestLine(x: number): number {
  const dome = (cx: number) => {
    const u = (x - cx) / 235;
    return u * u < 1 ? -15 * (1 - u * u) ** 1.2 : 0;
  };
  const notch = 11 * Math.exp(-(((x - 500) / 42) ** 2));
  return CREST_Y + 1 + dome(HILL.snowball.crest.x) + dome(HILL.avalanche.crest.x) + notch + 2.2 * Math.sin(x / 23 + 0.4) + 1.2 * Math.sin(x / 9.7);
}

/** the top of the snowbank at the foot of the hills */
export function bankTop(x: number): number {
  const pts: Array<[number, number]> = [
    [-400, 603],
    [20, 601],
    [172, 593.5],
    [290, 596.5],
    [405, 599.5],
    [468, 603],
    [532, 603],
    [595, 599.5],
    [710, 596.5],
    [828, 593.5],
    [980, 601],
    [1400, 603],
  ];
  let i = 0;
  while (i < pts.length - 2 && x > pts[i + 1]![0]) i++;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
  const s = t * t * (3 - 2 * t);
  return a[1] + (b[1] - a[1]) * s + 1.6 * Math.sin(x / 19 + 0.8) + 0.9 * Math.sin(x / 6.7);
}

/** distance from a point to the nearest lane's centre line (a thing placed on a lane would be in a ball's way) */
export function laneDistance(x: number, y: number): number {
  let best = Infinity;
  for (const id of STRATEGIES) {
    for (const d of DEBTS) {
      const l = LANES[id][d];
      const t = Math.max(0, Math.min(1, (y - l.start.y) / (l.end.y - l.start.y)));
      const lx = l.start.x + (l.end.x - l.start.x) * t;
      best = Math.min(best, Math.abs(x - lx));
    }
  }
  return best;
}

export type PineLayer = 'ridge' | 'crest' | 'valley' | 'edge';

export interface PinePlan {
  layer: PineLayer;
  kind: PineKind;
  seed: number;
  x: number;
  /** the trunk foot */
  y: number;
  /** the height in world units */
  H: number;
  flip: boolean;
  /** which sprite of its kind and size class (an index into the pool) */
  pick: number;
}

const KINDS: PineKind[] = ['spruce', 'spruce', 'fir', 'spruce', 'young', 'fir'];

/**
 * The pines. A pine wood along each hill's crest (taller toward the middle of the hill), small dark pines along the
 * distant ridge, a stand in the valley either side of the creek, and big pines framing both edges; wider screens
 * (xmin .. xmax) get the same wood carried further out.
 */
export function planPines(xmin: number, xmax: number): PinePlan[] {
  const out: PinePlan[] = [];
  const rnd = new Rand(90210);
  const pickKind = (r: Rand, young = 0.15): PineKind => (r.chance(young) ? 'young' : KINDS[r.int(0, KINDS.length - 1)]!);
  let seed = 100;
  // ---- the distant ridge: two rows of small dark pines
  for (let row = 0; row < 2; row++) {
    for (let x = xmin - 30; x < xmax + 30; x += rnd.range(5, 11)) {
      const patch = Math.sin(x / 61 + row * 1.7) + 0.6 * Math.sin(x / 23 + 0.4) + 0.35;
      if (patch < -0.1) continue;
      out.push({ layer: 'ridge', kind: pickKind(rnd, 0.1), seed: seed++, x, y: ridgeBack(x) + row * 5 + rnd.range(0, 4), H: rnd.range(15, 27) * (1 + row * 0.12), flip: rnd.chance(0.5), pick: rnd.int(0, 5) });
    }
  }
  // ---- the crest woods: a back row (smaller, paler) and a front row
  const lo = HILL.snowball.x0 - 18;
  const hi = HILL.avalanche.x1 + 18;
  for (let row = 0; row < 2; row++) {
    for (let x = xmin - 30; x < xmax + 30; x += rnd.range(7.5, 14) * (row ? 1 : 0.85)) {
      // the creek's valley stays open: the creek is seen running back between the two woods
      const gap = Math.abs(x - 500);
      if (gap < 15 + row * 5) continue;
      const ins = x > lo && x < hi;
      const cx = x < 500 ? HILL.snowball.crest.x : HILL.avalanche.crest.x;
      const mid = ins ? Math.max(0, 1 - Math.abs(x - cx) / 235) : 0;
      const nearValley = x > 440 && x < 560 ? 0.8 : 1;
      const base = (52 + 52 * mid ** 0.8) * nearValley;
      // groves of taller trees and lower stretches, so the wood has a skyline and not a fence
      const grove = 0.78 + 0.34 * Math.sin(x / 47 + row * 2.1) + 0.2 * Math.sin(x / 19 + 0.7);
      const H = base * rnd.range(0.7, 1.2) * Math.max(0.55, grove) * (row ? 1 : 0.9) * (rnd.chance(0.08) ? 1.3 : 1);
      const y = crestLine(x) + (row ? rnd.range(2, 9) : rnd.range(-5, 1));
      out.push({ layer: 'crest', kind: pickKind(rnd), seed: seed++, x, y, H, flip: rnd.chance(0.5), pick: rnd.int(0, 5) });
    }
  }
  // ---- the valley stand, either side of the creek (never on the water, nor in the lanes)
  const valley: Array<[number, number, number]> = [
    // [bank side (-1 left, 1 right), y, H]
    [-1, 322, 62],
    [1, 326, 66],
    [-1, 348, 76],
    [1, 360, 70],
    [-1, 392, 92],
    [1, 400, 86],
    [-1, 438, 108],
    [1, 452, 104],
  ];
  for (const [side, y, H] of valley) {
    const r = new Rand(7000 + Math.round(y));
    const reach = H * 0.21;
    const x = creekX(y) + side * (creekW(y) / 2 + reach * r.range(0.65, 0.95) + r.range(2, 12));
    out.push({ layer: 'valley', kind: pickKind(r, 0.2), seed: seed++, x, y, H, flip: r.chance(0.5), pick: r.int(0, 5) });
  }
  // ---- the edges: big pines framing the picture, outside the hills (their canopy never reaches the lanes or sledges)
  const edgeSide = (sgn: -1 | 1) => {
    const r = new Rand(sgn < 0 ? 4141 : 5252);
    const x0 = sgn < 0 ? -10 : WORLD.width + 10;
    const list: Array<[number, number, number]> = [
      // [distance outward from the edge, y, H]
      [0, 606, 330],
      [-6, 470, 220],
      [34, 530, 280],
      [58, 640, 380],
      [96, 420, 190],
      [120, 590, 330],
    ];
    for (const [dx, y, H] of list) {
      const x = x0 + sgn * dx;
      out.push({ layer: 'edge', kind: dx === 0 || dx === 120 ? 'spruce' : r.chance(0.5) ? 'fir' : 'spruce', seed: seed++, x, y, H, flip: r.chance(0.5), pick: r.int(0, 3) });
    }
    // further out, for wide screens: stands along the crest and in front
    const reach = sgn < 0 ? -xmin : xmax - WORLD.width;
    for (let d = 190; d < reach + 70; d += r.range(46, 92)) {
      const x = x0 + sgn * d;
      const y = r.range(330, 640);
      const H = 130 + (y - 330) * 0.7 * r.range(0.8, 1.2);
      out.push({ layer: 'edge', kind: pickKind(r, 0.2), seed: seed++, x, y, H, flip: r.chance(0.5), pick: r.int(0, 3) });
    }
  };
  edgeSide(-1);
  edgeSide(1);
  out.sort((a, b) => a.y - b.y);
  return out;
}

/** the top of the crest woods over a hill (world y), where its label can sit clear of the trees */
export function woodTop(plans: PinePlan[], id: 'snowball' | 'avalanche'): number {
  const h = HILL[id];
  let top = h.crest.y - 40;
  for (const p of plans) {
    if (p.layer !== 'crest' || p.x < h.x0 + 30 || p.x > h.x1 - 30) continue;
    top = Math.min(top, p.y - p.H * 1.02);
  }
  return top;
}

export { CREST_Y, FOOT_Y };
