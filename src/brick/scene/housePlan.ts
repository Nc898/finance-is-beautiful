/**
 * The build plan of one house: every brick, stone, tile and pot in the order the bricklayer sets it, with the part
 * of the finished painting it uncovers (world rects) and its share of its stage's area. Pure geometry (no canvas),
 * the same for any size and run, so the same `built` always shows the same bricks.
 *
 * Walls (BUILD.wall): COURSES courses of COURSE_H from the foot up, each from the hoist (outer) end across, bricks
 * in stretcher bond (half-bond offset on odd courses), cut round the openings; a stone sill under each window (in
 * the course under the opening) and a stone lintel two courses deep over each opening (set as part of the lower of
 * its two courses). An opening's frame and glass (the door) go in when its lintel is set.
 * Roof (BUILD.roof): rows of clay tiles from the eaves up, each from the outer end across, skipping the chimney;
 * the eaves row brings the gutter, the downpipe and the roof's shadow on the wall; the ridge tiles last.
 * Chimney (BUILD.chimney): courses of the stack, the oversailing cap, then the two pots (the last at paid off).
 */
import { BRICK_L, BUILD, COURSES, COURSE_H, GROUND_Y, HOUSE, type Rect } from './geom';
import type { LoanId } from '../types';

export type Stage = 0 | 1 | 2;

export interface Unit {
  stage: Stage;
  /** what it uncovers (world) */
  rects: Rect[];
  /** where it is set: x, and h above GROUND_Y (the bricklayer's target) */
  x: number;
  h: number;
  /** its share of the stage (area) */
  area: number;
  /** laying it sets the lintel of this opening (its frame and glass go in) */
  opens?: number;
  kind: 'brick' | 'sill' | 'lintel' | 'tile' | 'ridge' | 'cap' | 'pot';
}

export interface Opening {
  /** the window or door rect from geom */
  win: Rect;
  /** the hole left in the brickwork (reveal included) */
  cut: Rect;
  /** what appears when its lintel is set (cut + box / step) */
  show: Rect[];
  door: boolean;
  /** course of the sill (-1 for the door) and the lower lintel course */
  sill: number;
  lintel: number;
}

export interface HousePlan {
  id: LoanId;
  units: Unit[];
  /** index of the first unit of each stage, and the stage ends (exclusive) */
  start: [number, number, number, number];
  /** cumulative area within each stage, per unit (inclusive), and each stage's total */
  cum: Float64Array;
  total: [number, number, number];
  openings: Opening[];
  /** the roof's tile rows (screen y of each row's eave edge) and the gauge */
  rows: number[];
  gauge: number;
  /** the stack's courses: bottom y of each, and the cap/pots heights */
  chim: { x0: number; x1: number; base: number; shaftTop: number; capTop: number; potTop: number; courses: number[] };
  /** x along the house from the outer end */
  xAt: (u: number) => number;
}

export const REVEAL = 3;
export const SILL_OUT = 6;
export const LINTEL_OUT = 7;
export const TILE_W = 11.5;
export const ROWS = 11;
export const RIDGE_Y = 184;

const plans = new Map<LoanId, HousePlan>();

const courseBottom = (k: number): number => GROUND_Y - k * COURSE_H;

export function housePlan(id: LoanId): HousePlan {
  const hit = plans.get(id);
  if (hit) return hit;
  const H = HOUSE[id];
  const wall = H.wall;
  const outer = H.outer;
  const W = wall.x1 - wall.x0;
  const xAt = (u: number): number => (outer === 1 ? wall.x0 + u : wall.x1 - u);
  const uOf = (x: number): number => (outer === 1 ? x - wall.x0 : wall.x1 - x);
  const uRange = (r: { x0: number; x1: number }): [number, number] => {
    const a = uOf(r.x0);
    const b = uOf(r.x1);
    return [Math.min(a, b), Math.max(a, b)];
  };
  const rectU = (u0: number, u1: number, y0: number, y1: number): Rect => {
    const a = xAt(u0);
    const b = xAt(u1);
    return { x0: Math.min(a, b), x1: Math.max(a, b), y0, y1 };
  };

  // ---- the openings
  const openings: Opening[] = [];
  const obst: Array<{ u0: number; u1: number; k0: number; k1: number; unit?: Unit }> = [];
  const units: Unit[] = [];
  const allWins = [...H.windows.map((w) => ({ w, door: false })), { w: H.door, door: true }];
  for (const { w, door } of allWins) {
    const [u0, u1] = uRange(w);
    const hTop = GROUND_Y - w.y0;
    const hBot = GROUND_Y - w.y1;
    const lintel = Math.ceil(hTop / COURSE_H - 1e-6);
    const sill = door ? -1 : Math.floor(hBot / COURSE_H);
    const cu0 = u0 - REVEAL;
    const cu1 = u1 + REVEAL;
    const k0 = sill + 1;
    const cut = rectU(cu0, cu1, courseBottom(lintel), courseBottom(k0));
    const show: Rect[] = [cut];
    if (door) show.push(rectU(cu0 - 6, cu1 + 6, GROUND_Y, GROUND_Y + 9));
    else if (w.y1 > GROUND_Y - 60) show.push(rectU(cu0 - 4, cu1 + 4, courseBottom(sill), courseBottom(sill) + 15));
    const oi = openings.length;
    openings.push({ win: w, cut, show, door, sill, lintel });
    obst.push({ u0: cu0, u1: cu1, k0, k1: lintel - 1 });
    if (!door) obst.push({ u0: cu0 - SILL_OUT, u1: cu1 + SILL_OUT, k0: sill, k1: sill, unit: { stage: 0, rects: [rectU(cu0 - SILL_OUT, cu1 + SILL_OUT, courseBottom(sill + 1), courseBottom(sill) + 2.2)], x: xAt((cu0 + cu1) / 2), h: (sill + 0.5) * COURSE_H, area: (cu1 - cu0 + 2 * SILL_OUT) * COURSE_H, kind: 'sill' } });
    obst.push({ u0: cu0 - LINTEL_OUT, u1: cu1 + LINTEL_OUT, k0: lintel, k1: lintel + 1, unit: { stage: 0, rects: [rectU(cu0 - LINTEL_OUT, cu1 + LINTEL_OUT, courseBottom(lintel + 2), courseBottom(lintel))], x: xAt((cu0 + cu1) / 2), h: (lintel + 1) * COURSE_H, area: (cu1 - cu0 + 2 * LINTEL_OUT) * COURSE_H * 2, opens: oi, kind: 'lintel' } });
  }

  // ---- the walls, course by course from the outer end
  for (let k = 0; k < COURSES; k++) {
    const yb = courseBottom(k);
    const yt = yb - COURSE_H;
    const here = obst.filter((o) => k >= o.k0 && k <= o.k1).sort((a, b) => a.u0 - b.u0);
    // free intervals between obstacles
    const items: Array<{ u: number; unit: Unit }> = [];
    let cur = 0;
    const fill = (a: number, b: number) => {
      if (b - a < 0.5) return;
      const off = k % 2 === 1 ? BRICK_L / 2 : 0;
      const edges: number[] = [a];
      for (let e = -off + BRICK_L * Math.ceil((a + off) / BRICK_L + 1e-6); e < b - 1e-6; e += BRICK_L) edges.push(e);
      edges.push(b);
      // merge slivers into their neighbour (a closer or bat is never less than about a quarter brick)
      for (let i = 1; i < edges.length - 1; i++) {
        if (edges[i]! - edges[i - 1]! < 4 || edges[i + 1]! - edges[i]! < 4) {
          edges.splice(i, 1);
          i--;
        }
      }
      for (let i = 0; i + 1 < edges.length; i++) {
        const e0 = edges[i]!;
        const e1 = edges[i + 1]!;
        items.push({ u: e0, unit: { stage: 0, rects: [rectU(e0, e1, yt, yb)], x: xAt((e0 + e1) / 2), h: (k + 0.5) * COURSE_H, area: (e1 - e0) * COURSE_H, kind: 'brick' } });
      }
    };
    for (const o of here) {
      const a = Math.max(cur, 0);
      const b = Math.min(o.u0, W);
      if (b > a) fill(a, b);
      if (o.unit && o.k0 === k) items.push({ u: Math.max(0, o.u0), unit: o.unit });
      cur = Math.max(cur, o.u1);
    }
    if (cur < W) fill(Math.max(0, cur), W);
    items.sort((p, q) => p.u - q.u);
    for (const it of items) units.push(it.unit);
  }
  const wallEnd = units.length;
  // the foot course is the foundation's: painted from month 0, so it is not part of the plan

  // ---- the roof, row by row from the eaves up
  const R = H.roof;
  const rise = R.eaveY - R.ridgeY;
  const gauge = (R.eaveY - RIDGE_Y) / ROWS;
  const leftAt = (y: number) => R.x0 + ((R.ridgeX0 - R.x0) * (R.eaveY - y)) / rise;
  const rightAt = (y: number) => R.x1 - ((R.x1 - R.ridgeX1) * (R.eaveY - y)) / rise;
  const ch = H.chimney;
  const chim = { x0: ch.x0, x1: ch.x1, base: 216, shaftTop: 163, capTop: 156, potTop: ch.y0, courses: [] as number[] };
  const rows: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    const yb = R.eaveY - r * gauge;
    const yt = yb - gauge;
    rows.push(yb);
    const xl = leftAt(yb) - 4;
    const xr = rightAt(yb) + 4;
    const ul0 = Math.min(uOf(xl), uOf(xr));
    const ul1 = Math.max(uOf(xl), uOf(xr));
    // the stack stands in the rows above its foot
    const blocked = yt < chim.base + 2 ? uRange({ x0: chim.x0 - 1.5, x1: chim.x1 + 1.5 }) : null;
    const off = r % 2 === 1 ? TILE_W / 2 : 0;
    const spans: Array<[number, number]> = blocked ? [[ul0, blocked[0]], [blocked[1], ul1]] : [[ul0, ul1]];
    for (const [a, b] of spans) {
      if (b - a < 1) continue;
      const edges: number[] = [a];
      for (let e = -off + TILE_W * Math.ceil((a + off) / TILE_W + 1e-6); e < b - 1e-6; e += TILE_W) edges.push(e);
      edges.push(b);
      for (let i = 1; i < edges.length - 1; i++) {
        if (edges[i]! - edges[i - 1]! < 3 || edges[i + 1]! - edges[i]! < 3) {
          edges.splice(i, 1);
          i--;
        }
      }
      for (let i = 0; i + 1 < edges.length; i++) {
        const e0 = edges[i]!;
        const e1 = edges[i + 1]!;
        const rects: Rect[] = [rectU(e0, e1, yt, yb)];
        if (r === 0) {
          // the eaves bring the gutter and the roof's shadow on the top of the wall
          rects.push(rectU(e0, e1, yb, yb + 34));
          // and the downpipe at the outer corner
          if (i === 0 && a === ul0) rects.push(rectU(-12, 16, yb, GROUND_Y + 6));
        }
        const xm = xAt((e0 + e1) / 2);
        units.push({ stage: 1, rects, x: xm, h: GROUND_Y - (yb + yt) / 2, area: (e1 - e0) * gauge, kind: 'tile' });
      }
    }
  }
  // the ridge tiles
  {
    const [a, b] = uRange({ x0: R.ridgeX0 - 3, x1: R.ridgeX1 + 3 });
    const n = Math.max(1, Math.round((b - a) / 17));
    for (let i = 0; i < n; i++) {
      const e0 = a + ((b - a) * i) / n;
      const e1 = a + ((b - a) * (i + 1)) / n;
      units.push({ stage: 1, rects: [rectU(e0 - (i === 0 ? 4 : 0), e1 + (i === n - 1 ? 4 : 0), RIDGE_Y - 10, RIDGE_Y + 0.01)], x: xAt((e0 + e1) / 2), h: GROUND_Y - RIDGE_Y + 4, area: (e1 - e0) * 8, kind: 'ridge' });
    }
  }
  const roofEnd = units.length;

  // ---- the chimney stack: courses, the cap, the pots
  {
    const [a, b] = uRange({ x0: chim.x0, x1: chim.x1 });
    let k = 0;
    for (let yb = chim.base; yb > chim.shaftTop + 0.5; yb -= COURSE_H, k++) {
      const yt = Math.max(chim.shaftTop, yb - COURSE_H);
      chim.courses.push(yb);
      const off = k % 2 === 1 ? BRICK_L / 2 : 0;
      const edges: number[] = [a];
      for (let e = a - off + BRICK_L; e < b - 4; e += BRICK_L) if (e - a > 4) edges.push(e);
      edges.push(b);
      for (let i = 0; i + 1 < edges.length; i++) {
        const rects = [rectU(edges[i]! - (i === 0 ? 3 : 0), edges[i + 1]! + (i === edges.length - 2 ? 3 : 0), yt, yb + (k === 0 ? 8 : 0))];
        units.push({ stage: 2, rects, x: xAt((edges[i]! + edges[i + 1]!) / 2), h: GROUND_Y - (yb + yt) / 2, area: (edges[i + 1]! - edges[i]!) * (yb - yt), kind: 'brick' });
      }
    }
    const capRect = rectU(a - 5, b + 5, chim.capTop - 0.5, chim.shaftTop + 0.01);
    units.push({ stage: 2, rects: [capRect], x: xAt((a + b) / 2), h: GROUND_Y - (chim.capTop + chim.shaftTop) / 2, area: (b - a + 10) * (chim.shaftTop - chim.capTop), kind: 'cap' });
    const potW = 9;
    const mid = (a + b) / 2;
    for (const pu of [mid - 6.5, mid + 6.5]) {
      units.push({ stage: 2, rects: [rectU(pu - potW / 2 - 1, pu + potW / 2 + 1, chim.potTop - 6, chim.capTop + 0.01)], x: xAt(pu), h: GROUND_Y - (chim.potTop + chim.capTop) / 2, area: potW * (chim.capTop - chim.potTop), kind: 'pot' });
    }
  }

  const start: [number, number, number, number] = [0, wallEnd, roofEnd, units.length];
  const cum = new Float64Array(units.length);
  const total: [number, number, number] = [0, 0, 0];
  for (let s = 0; s < 3; s++) {
    let acc = 0;
    for (let i = start[s]!; i < start[s + 1]!; i++) {
      acc += units[i]!.area;
      cum[i] = acc;
    }
    total[s] = acc;
  }
  const plan: HousePlan = { id, units, start, cum, total, openings, rows, gauge, chim, xAt };
  plans.set(id, plan);
  return plan;
}

/**
 * How many units are laid at `built` (0 … 1): within each stage, the units whose cumulative area is covered by
 * the stage's share of `built` (so the painted area is proportional to it, a brick at a time). Every unit at 1.
 */
export function laidCount(plan: HousePlan, built: number): number {
  if (!(built > 0)) return 0;
  if (built >= 1 - 1e-9) return plan.units.length;
  const st = [BUILD.wall, BUILD.roof, BUILD.chimney] as const;
  for (let s = 0; s < 3; s++) {
    const [b0, b1] = st[s]!;
    if (built >= b1) continue;
    const f = Math.max(0, (built - b0) / (b1 - b0));
    const want = f * plan.total[s]!;
    // binary search the cumulative areas in this stage
    let lo = plan.start[s]!;
    let hi = plan.start[s + 1]!;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (plan.cum[m]! <= want + 1e-9) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  return plan.units.length;
}

/** units laid per unit of `built` around a given `built` (for the bricklayer's pace) */
export function unitsPerBuilt(plan: HousePlan, built: number): number {
  const st = [BUILD.wall, BUILD.roof, BUILD.chimney] as const;
  for (let s = 0; s < 3; s++) {
    const [b0, b1] = st[s]!;
    if (built < b1 || s === 2) return (plan.start[s + 1]! - plan.start[s]!) / (b1 - b0);
  }
  return 0;
}
