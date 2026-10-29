/**
 * The house, painted three ways, once per size (see houseView.ts for how they are shown):
 * - the pencil drawing: the whole finished house as a light graphite underdrawing on the paper (the lender's part),
 *   with an architect's overshoot at the corners, a few construction lines and course ticks;
 * - the wall: lime mortar, then every brick of the plan (housePlan.ts) as its own transparent glaze in warm reds and
 *   orange-browns, the pigment pooled along its lower and shaded edges, a few darker headers and burnt ends, the
 *   stone sills and lintels; the openings left as paper;
 * - the finished house: the wall, then what goes in later: the sash windows and the door in their reveals, the
 *   shadow under the eaves, the clay-tile roof, the chimney with its pots, the gutter and downpipe.
 * Light from the upper left on both houses (shading is never mirrored); only the plan is mirrored for house B.
 * Painted as the vine's cottages are (vine/scene/cottageWash.ts): a broad wash of the wall's or the roof's colour
 * first, so each reads as one mass, then a brick or a tile stated only where the eye goes (the corners, round the
 * openings, the foot of the wall, under the eaves, the shaded right) and lost in the sunlit upper left; a few
 * backruns where the washes dried, and the paper's grain over all.
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { applyTooth, blobPoly, paperTooth } from '../../river/scene/paint';
import { backrun } from '../../vine/scene/cottageWash';
import { ACCENT, BRICK_L, COURSE_H, GROUND_Y, HOUSE, type Rect } from './geom';
import { RIDGE_Y, housePlan, type HousePlan } from './housePlan';
import type { LoanId } from '../types';

export const PAPER = '#FBF6EA';
const SHADE = '#4A3640';
const LIGHT = '#FFF4DE';
const INK = '#3B2A26';
const GRAPHITE = '#4C4A52';

/** the sprites' extent in world units (the same for all three) */
export interface SpriteBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function spriteBox(id: LoanId): SpriteBox {
  const H = HOUSE[id];
  return { x: H.wall.x0 - 34, y: 132, w: H.wall.x1 - H.wall.x0 + 68, h: GROUND_Y + 16 - 132 };
}

const BRICKS = ['#B4533B', '#BF6142', '#A94B37', '#C46B46', '#9F4535', '#B85E3D', '#C97650', '#A55139', '#B9583E', '#AE4E3C'];
const HEADERS = ['#7E3A34', '#8A4236', '#713532'];
const STONE = ['#E6D8BA', '#DDCDAE', '#EADFC4'];
const TILES = ['#B9643F', '#C2704A', '#AA5838', '#B66A44', '#9E5236', '#C47A50'];

function ctxFor(id: LoanId, q: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; box: SpriteBox } {
  const box = spriteBox(id);
  const cv = makeCanvas(Math.ceil(box.w * q), Math.ceil(box.h * q));
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -box.x * q, -box.y * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { cv, ctx, box };
}

/** a slightly irregular rectangle (a hand-laid edge) */
function rr(x0: number, y0: number, x1: number, y1: number, rnd: Rand, jit = 0.25): number[] {
  const j = () => rnd.range(-jit, jit);
  const mx = (x0 + x1) / 2;
  return [x0 + j(), y0 + j(), mx + j(), y0 + j() * 0.6, x1 + j(), y0 + j(), x1 + j(), (y0 + y1) / 2 + j(), x1 + j(), y1 + j(), mx + j(), y1 + j() * 0.6, x0 + j(), y1 + j(), x0 + j(), (y0 + y1) / 2 + j()];
}

/** how lit a point of the front is: the sun is upper left, so the upper left of the wall is the palest */
function lightAt(id: LoanId): (x: number, y: number) => number {
  const W = HOUSE[id].wall;
  const nz = makeNoise2D(id === 'a' ? 7301 : 7309);
  return (x, y) => {
    const u = (x - W.x0) / (W.x1 - W.x0);
    const v = (y - W.y0) / (W.y1 - W.y0);
    return clamp(0.62 - 0.32 * u - 0.18 * v + (nz(x * 0.018, y * 0.024) - 0.5) * 0.36, 0, 1);
  };
}

/**
 * How much of a brick or tile is stated (0 lost in the light .. 1 fully stated): high at the wall's corners, round
 * the openings, along the foot and under the eaves, and toward the shaded right; low in the sunlit upper left. On
 * the roof: stated along the eaves, the hips and to the right, lost high on the left. Broken up by noise so the edge
 * between stated and lost wanders.
 */
function detailAt(id: LoanId, roof = false): (x: number, y: number) => number {
  const H = HOUSE[id];
  const W = H.wall;
  const R = H.roof;
  const plan = housePlan(id);
  const nz = makeNoise2D(id === 'a' ? 8803 : 8807);
  const near = (x: number, y: number, r: Rect, pad: number): number => {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dy = Math.max(r.y0 - y, 0, y - r.y1);
    return clamp(1 - Math.hypot(dx, dy) / pad, 0, 1);
  };
  return (x, y) => {
    let d: number;
    if (roof) {
      const u = (x - R.x0) / (R.x1 - R.x0);
      const low = clamp((y - (R.eaveY - 26)) / 26, 0, 1);
      const t = (R.eaveY - y) / (R.eaveY - R.ridgeY);
      const xl = R.x0 + (R.ridgeX0 - R.x0) * t;
      const xr = R.x1 - (R.x1 - R.ridgeX1) * t;
      const hip = clamp(1 - Math.min(x - xl, xr - x) / 26, 0, 1);
      d = 0.12 + 0.55 * low + 0.45 * hip + 0.35 * clamp((u - 0.4) / 0.6, 0, 1);
    } else {
      const u = (x - W.x0) / (W.x1 - W.x0);
      const corner = clamp(1 - Math.min(x - W.x0, W.x1 - x) / 34, 0, 1);
      let open = 0;
      for (const o of plan.openings) open = Math.max(open, near(x, y, o.cut, 16));
      const foot = clamp((y - (GROUND_Y - 34)) / 34, 0, 1);
      const eave = clamp(1 - (y - W.y0) / 22, 0, 1);
      const shade = clamp((u - 0.5) / 0.5, 0, 1);
      d = 0.14 + 0.7 * corner + 0.5 * open + 0.5 * foot + 0.3 * eave + 0.35 * shade;
    }
    d += (nz(x * 0.024, y * 0.032) - 0.5) * 0.75;
    return clamp(d, 0, 1);
  };
}

/** a broad, mottled colour field for a wash (wet in wet: the colours drift into each other) */
function washField(seed: number, cols: string[]): (x: number, y: number) => string {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 3);
  return (x, y) => {
    const a = n1(x * 0.011, y * 0.016);
    const b = n2(x * 0.03, y * 0.04);
    const t = clamp(a * 0.75 + b * 0.25, 0, 0.999) * (cols.length - 1);
    const i = Math.floor(t);
    return mix(cols[i]!, cols[i + 1]!, t - i);
  };
}

/** the paper's grain over a region of the current clip: the wash thins on the peaks, pigment settles in the valleys */
function grain(ctx: CanvasRenderingContext2D, pigment: string, x: number, y: number, w: number, h: number, lift: number, gran: number): void {
  const q = ctx.getTransform().a;
  applyTooth(ctx, paperTooth(pigment, 192, 517), x, y, w, h, Math.max(1, q * 1.1), lift, gran);
}

/* ------------------------------------------------------------------ the wall */

function paintBrick(ctx: CanvasRenderingContext2D, rnd: Rand, r: Rect, lit: number, header: boolean, vis = 1): void {
  const x0 = r.x0 + 0.55;
  const x1 = r.x1 - 0.55;
  const y0 = r.y0 + 0.6;
  const y1 = r.y1 - 0.55;
  if (x1 - x0 < 1.2) return;
  const v = clamp(vis, 0, 1);
  let base = header ? rnd.pick(HEADERS) : rnd.pick(BRICKS);
  base = mix(base, '#E9A57C', lit * 0.38);
  const dk = mix(base, SHADE, 0.55);
  // the joint under the brick: where the eye reads a course from, even where the brick itself is lost
  ctx.fillStyle = rgba(mix(base, SHADE, 0.62), 0.14 + 0.3 * v);
  ribbon(ctx, [x0 + 0.4, y1 + 0.3, (x0 + x1) / 2, y1 + 0.45 + rnd.range(-0.15, 0.15), x1 - 0.2, y1 + 0.25], 0.5 + 0.35 * v, 0.85);
  if (v < 0.12) return;
  const poly = deform(rr(x0, y0, x1, y1, rnd, 0.3), rnd, 2, 0.05);
  // two uneven glazes, as strong as the brick is stated
  ctx.fillStyle = rgba(base, (0.22 + 0.5 * v) * rnd.range(0.85, 1.12));
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(mix(base, rnd.pick(['#D88A5E', '#8E4032', '#C4704C', '#A86048']), 0.5), 0.1 + 0.16 * v);
  tracePoly(ctx, deform(poly, rnd, 1, 0.09));
  ctx.fill();
  // the wet edge where the glaze dried, then the pigment pooled along the lower edge and the shaded right
  if (v > 0.4) {
    ctx.strokeStyle = rgba(dk, 0.06 + 0.16 * v);
    ctx.lineWidth = 0.35;
    tracePoly(ctx, poly);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(dk, (0.18 + (1 - lit) * 0.16) * v);
  ribbon(ctx, [x0 + 0.6, y1 - 0.35, (x0 + x1) / 2, y1 - 0.25, x1 - 0.3, y1 - 0.4], 0.75, 0.9);
  if (v > 0.35) {
    ctx.fillStyle = rgba(dk, (0.12 + (1 - lit) * 0.12) * v);
    ribbon(ctx, [x1 - 0.35, y0 + 0.5, x1 - 0.25, (y0 + y1) / 2, x1 - 0.35, y1 - 0.3], 0.5, 0.9);
  }
  if (rnd.chance(0.55)) {
    ctx.fillStyle = rgba(LIGHT, (0.14 + lit * 0.26) * (0.5 + 0.5 * v));
    ribbon(ctx, [x0 + 0.8, y0 + 0.45, x0 + (x1 - x0) * rnd.range(0.3, 0.6), y0 + 0.4], 0.45, 0.9);
  }
  // a burnt end now and then, a speck or two of grit (only where stated)
  if (!header && v > 0.5 && rnd.chance(0.12)) {
    const e = rnd.chance(0.5) ? x0 : x1 - 3.2;
    ctx.fillStyle = rgba('#5E2E2C', 0.22);
    tracePoly(ctx, deform(rr(e, y0 + 0.3, e + 3.2, y1 - 0.3, rnd, 0.3), rnd, 1, 0.08));
    ctx.fill();
  }
  if (v > 0.45 && rnd.chance(0.5)) {
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#5A2A26' : '#F6E2C8', 0.35);
    ctx.fillRect(rnd.range(x0 + 1, x1 - 1), rnd.range(y0 + 0.8, y1 - 0.8), 0.45, 0.35);
  }
}

function paintStoneBlock(ctx: CanvasRenderingContext2D, rnd: Rand, r: Rect, lit: number, kind: 'sill' | 'lintel'): void {
  const base = mix(rnd.pick(STONE), '#FFF6E2', lit * 0.3);
  const poly = deform(rr(r.x0 + 0.3, r.y0 + 0.4, r.x1 - 0.3, r.y1 - 0.4, rnd, 0.2), rnd, 1, 0.025);
  ctx.fillStyle = rgba(base, 0.85);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba('#C4B08C', 0.26);
  tracePoly(ctx, deform(poly, rnd, 1, 0.05));
  ctx.fill();
  // a mottle of ochre and grey where the wash dried unevenly
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const cx = rnd.range(r.x0, r.x1);
    const cy = rnd.range(r.y0, r.y1);
    ctx.fillStyle = rgba(rnd.pick(['#BFA77E', '#A8A090', '#D4BC92']), 0.2);
    tracePoly(ctx, deform(blobPoly(cx, cy, rnd.range(4, 10), rnd.range(2, 4), rnd, 10, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
  ctx.restore();
  // the sill's front edge and the lintel's soffit are in shade
  const dk = mix(base, SHADE, 0.5);
  if (kind === 'sill') {
    ctx.fillStyle = rgba(dk, 0.5);
    ctx.fillRect(r.x0 + 0.4, r.y1 - 2.2, r.x1 - r.x0 - 0.8, 1.6);
    // its shadow on the brick below, to the lower right
    ctx.fillStyle = rgba('#4A2E30', 0.28);
    tracePoly(ctx, [r.x0 + 2, r.y1 - 0.6, r.x1 + 1, r.y1 - 0.6, r.x1 + 2.6, r.y1 + 2.4, r.x0 + 3.4, r.y1 + 2.4]);
    ctx.fill();
  } else {
    // a keyed lintel: faint joints between its voussoirs
    const n = Math.max(3, Math.round((r.x1 - r.x0) / 9));
    ctx.strokeStyle = rgba(dk, 0.35);
    ctx.lineWidth = 0.35;
    for (let i = 1; i < n; i++) {
      const x = r.x0 + ((r.x1 - r.x0) * i) / n + rnd.range(-0.3, 0.3);
      ctx.beginPath();
      ctx.moveTo(x, r.y0 + 0.8);
      ctx.lineTo(x + (x - (r.x0 + r.x1) / 2) * 0.05, r.y1 - 0.8);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(dk, 0.4);
    ctx.fillRect(r.x0 + 0.6, r.y1 - 1.3, r.x1 - r.x0 - 1.2, 0.9);
  }
  ctx.strokeStyle = rgba(INK, 0.16);
  ctx.lineWidth = 0.35;
  tracePoly(ctx, poly);
  ctx.stroke();
}

/** the wall as it is laid: mortar, the bricks, the stone sills and lintels (the openings left as paper) */
export function paintWallSprite(id: LoanId, q: number): HTMLCanvasElement {
  const { cv, ctx } = ctxFor(id, q);
  const plan = housePlan(id);
  const H = HOUSE[id];
  const rnd = new Rand(id === 'a' ? 5501 : 5507);
  const lit = lightAt(id);
  const det = detailAt(id);
  const field = washField(id === 'a' ? 3301 : 3307, ['#C98A66', '#B8603F', '#C46E4A', '#A9533E', '#CC7E58', '#B35A44']);
  // the ground wash: the brickwork as one warm mass, the lime of the joints showing only where the wall is stated
  // (in the light it is all one wash, as a painter leaves it)
  for (const u of plan.units) {
    if (u.stage === 1 || u.kind !== 'brick') continue;
    const r = u.rects[0]!;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const l = lit(cx, cy);
    const d = det(cx, cy);
    const c = mix(mix(field(cx, cy), '#F0C8A0', l * 0.45), mix('#E4D3B8', '#C9B49C', 1 - l), 0.22 + 0.4 * d);
    ctx.fillStyle = rgba(c, 0.8);
    ctx.fillRect(r.x0 - 0.05, r.y0 - 0.05, r.x1 - r.x0 + 0.1, r.y1 - r.y0 + 0.1);
  }
  // the bricks (every fifth course a few darker headers, as in a garden-wall bond), each as stated as its place
  plan.units.forEach((u, i) => {
    if (u.stage === 1 || u.kind !== 'brick') return;
    const r = u.rects[0]!;
    const course = Math.round((GROUND_Y - r.y1) / COURSE_H);
    const header = r.x1 - r.x0 < BRICK_L * 0.62 ? rnd.chance(0.5) : course % 5 === 2 && i % 2 === 0 && rnd.chance(0.6);
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    paintBrick(ctx, rnd, r, lit(cx, cy), header, det(cx, cy));
  });
  // stone
  for (const u of plan.units) {
    if (u.kind === 'sill' || u.kind === 'lintel') paintStoneBlock(ctx, rnd, u.rects[0]!, lit(u.x, GROUND_Y - u.h), u.kind);
  }
  // the wall's own broad washes over the brickwork: warm light at the upper left, a cooler shade to the lower right,
  // and a little rising damp at the foot (clipped to the brick units so the openings stay paper)
  ctx.save();
  ctx.beginPath();
  for (const u of plan.units) if (u.stage !== 1) for (const r of u.rects) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.clip();
  const W = H.wall;
  const g = ctx.createLinearGradient(W.x0, W.y0, W.x1, W.y1);
  g.addColorStop(0, 'rgba(255,230,190,0.2)');
  g.addColorStop(0.45, 'rgba(255,226,180,0)');
  g.addColorStop(1, 'rgba(70,44,64,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(W.x0, W.y0, W.x1 - W.x0, W.y1 - W.y0);
  const damp = ctx.createLinearGradient(0, GROUND_Y - 18, 0, GROUND_Y);
  damp.addColorStop(0, 'rgba(80,60,50,0)');
  damp.addColorStop(1, 'rgba(80,60,50,0.18)');
  ctx.fillStyle = damp;
  ctx.fillRect(W.x0, GROUND_Y - 18, W.x1 - W.x0, 18);
  // the light lifted out of the wash in the upper left (blotted while wet), and backruns where it pooled
  for (let i = 0; i < 5; i++) {
    const x = W.x0 + (W.x1 - W.x0) * rnd.range(0.02, 0.45);
    const y = W.y0 + (W.y1 - W.y0) * rnd.range(0.05, 0.55);
    ctx.fillStyle = rgba(LIGHT, 0.12);
    tracePoly(ctx, deform(blobPoly(x, y, rnd.range(16, 34), rnd.range(10, 20), rnd, 14, 0.3), rnd, 2, 0.08));
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    backrun(ctx, rnd.range(W.x0, W.x1), rnd.range(W.y0, W.y1), rnd.range(10, 26), rnd.range(7, 16), rnd.pick(['#9C4A3A', '#C9845A', '#7E4A52', '#B86A4A']), 0.22, rnd);
  }
  grain(ctx, '#5A3028', W.x0, W.y0 - 4, W.x1 - W.x0, W.y1 - W.y0 + 8, 0.1, 0.18);
  ctx.restore();
  return cv;
}

/* ------------------------------------------------------------------ what goes in later */

function paintSash(ctx: CanvasRenderingContext2D, rnd: Rand, w: Rect, upper: boolean): void {
  const x0 = w.x0;
  const x1 = w.x1;
  const y0 = w.y0;
  const y1 = w.y1;
  // the glass, wet in wet: the sky reflected, the room's dark coming down from the head into it, one soft lifted sheen
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = rgba(mix('#A9C2D2', '#8EA6BC', rnd.next()), 0.92);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#5E6C88', '#66728E', '#56607C']), 0.16);
    tracePoly(ctx, deform(blobPoly(rnd.range(x0, x1), y0 + (y1 - y0) * rnd.range(0, 0.5), (x1 - x0) * rnd.range(0.3, 0.55), (y1 - y0) * rnd.range(0.2, 0.35), rnd, 14, 0.3), rnd, 2, 0.1));
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(46,48,72,0.42)');
  g.addColorStop(0.35, 'rgba(46,48,72,0.08)');
  g.addColorStop(1, 'rgba(46,48,72,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // net curtains inside, faint
  ctx.fillStyle = rgba(upper ? '#E8E0D4' : '#D9C9B2', 0.26);
  tracePoly(ctx, deform(rr(x0 + 1.5, y0 + 1.5, x0 + 1.5 + (x1 - x0) * 0.22, y1 - 1.5, rnd, 0.4), rnd, 1, 0.05));
  ctx.fill();
  tracePoly(ctx, deform(rr(x1 - 1.5 - (x1 - x0) * 0.22, y0 + 1.5, x1 - 1.5, y1 - 1.5, rnd, 0.4), rnd, 1, 0.05));
  ctx.fill();
  ctx.fillStyle = 'rgba(244,250,255,0.22)';
  const sx = x0 + (x1 - x0) * rnd.range(0.2, 0.4);
  tracePoly(ctx, deform([sx, y0, sx + 9, y0, sx - 18, y1, sx - 27, y1], rnd, 2, 0.06));
  ctx.fill();
  ctx.restore();
  // the painted timber: frame, meeting rail, glazing bars (six over six), paper white with a cool shade
  const frame = 'rgba(248,243,230,0.93)';
  const shade = 'rgba(140,140,160,0.45)';
  const bar = 1.1;
  const midY = (y0 + y1) / 2;
  ctx.fillStyle = frame;
  ctx.fillRect(x0, y0, x1 - x0, 2.2);
  ctx.fillRect(x0, y1 - 2.4, x1 - x0, 2.4);
  ctx.fillRect(x0, y0, 2.2, y1 - y0);
  ctx.fillRect(x1 - 2.2, y0, 2.2, y1 - y0);
  ctx.fillRect(x0, midY - 1.3, x1 - x0, 2.6);
  for (const t of [1 / 3, 2 / 3]) ctx.fillRect(x0 + (x1 - x0) * t - bar / 2, y0, bar, y1 - y0);
  for (const yy of [y0 + (midY - y0) / 2, midY + (y1 - midY) / 2]) ctx.fillRect(x0, yy - bar / 2, x1 - x0, bar);
  // shade on the right of every bar and under every rail (the light is upper left)
  ctx.fillStyle = shade;
  ctx.fillRect(x1 - 0.9, y0, 0.9, y1 - y0);
  ctx.fillRect(x0, midY + 1.1, x1 - x0, 0.5);
  for (const t of [1 / 3, 2 / 3]) ctx.fillRect(x0 + (x1 - x0) * t + bar / 2 - 0.2, y0, 0.35, y1 - y0);
  // the reveal's shadow: the top and the right side of the opening are in the shade of the brick
  ctx.fillStyle = 'rgba(60,36,40,0.42)';
  tracePoly(ctx, deform([x0 - 3, y0 - 3, x1 + 3, y0 - 3, x1 + 3, y1, x1 - 0.5, y1, x1 - 0.5, y0 + 1.6, x0, y0 + 1.6], rnd, 1, 0.02));
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.28);
  ctx.lineWidth = 0.4;
  tracePoly(ctx, rr(x0, y0, x1, y1, rnd, 0.25));
  ctx.stroke();
}

function paintDoor(ctx: CanvasRenderingContext2D, rnd: Rand, d: Rect, accent: string): void {
  const x0 = d.x0;
  const x1 = d.x1;
  const fan = 12;
  // the fanlight over the door
  const fg = ctx.createLinearGradient(x0, d.y0, x1, d.y0 + fan);
  fg.addColorStop(0, 'rgba(150,176,196,0.9)');
  fg.addColorStop(1, 'rgba(70,80,104,0.92)');
  ctx.fillStyle = fg;
  ctx.fillRect(x0, d.y0, x1 - x0, fan);
  ctx.strokeStyle = 'rgba(250,246,236,0.95)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    ctx.beginPath();
    ctx.moveTo((x0 + x1) / 2, d.y0 + fan);
    ctx.lineTo((x0 + x1) / 2 + Math.cos(a) * (x1 - x0) * 0.5, d.y0 + fan + Math.sin(a) * fan);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(250,246,236,0.95)';
  ctx.fillRect(x0, d.y0 + fan - 1.2, x1 - x0, 2.4);
  // the door leaf: four panels, the accent colour laid as two glazes, lit at the upper left
  const ly0 = d.y0 + fan + 1.2;
  const leaf = deform(rr(x0 + 0.4, ly0, x1 - 0.4, d.y1, rnd, 0.15), rnd, 1, 0.006);
  ctx.fillStyle = rgba(accent, 0.88);
  tracePoly(ctx, leaf);
  ctx.fill();
  const lg = ctx.createLinearGradient(x0, ly0, x1, d.y1);
  lg.addColorStop(0, 'rgba(255,240,214,0.28)');
  lg.addColorStop(1, 'rgba(30,24,40,0.3)');
  ctx.fillStyle = lg;
  tracePoly(ctx, leaf);
  ctx.fill();
  const pw = (x1 - x0 - 9) / 2;
  const ph = (d.y1 - ly0 - 12) / 2;
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 2; r++) {
      const px = x0 + 3 + c * (pw + 3);
      const py = ly0 + 3.5 + r * (ph + 4) + (r === 1 ? 0 : 0);
      const ph2 = r === 0 ? ph * 0.9 : ph * 1.1;
      ctx.fillStyle = rgba(mix(accent, '#1E1A2A', 0.35), 0.5);
      ctx.fillRect(px + 0.8, py + 0.8, pw, ph2);
      ctx.fillStyle = rgba(mix(accent, '#FFF0D8', 0.3), 0.55);
      ctx.fillRect(px, py, pw, 0.6);
      ctx.fillRect(px, py, 0.6, ph2);
    }
  }
  // brass knob, letter plate, the step
  ctx.fillStyle = 'rgba(214,170,74,0.95)';
  ctx.beginPath();
  ctx.arc(x1 - 5, (ly0 + d.y1) / 2 + 4, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect((x0 + x1) / 2 - 4, (ly0 + d.y1) / 2 - 1, 8, 1.6);
  ctx.fillStyle = 'rgba(60,36,40,0.45)';
  tracePoly(ctx, [x0 - 3, d.y0 - 3, x1 + 3, d.y0 - 3, x1 + 3, d.y1, x1 - 0.4, d.y1, x1 - 0.4, d.y0 + 1.5, x0, d.y0 + 1.5]);
  ctx.fill();
  ctx.save();
  tracePoly(ctx, leaf);
  ctx.clip();
  backrun(ctx, (x0 + x1) / 2 + rnd.range(-3, 3), ly0 + (d.y1 - ly0) * rnd.range(0.3, 0.7), (x1 - x0) * 0.3, (d.y1 - ly0) * 0.18, accent, 0.4, rnd);
  ctx.restore();
  ctx.strokeStyle = rgba(INK, 0.32);
  ctx.lineWidth = 0.45;
  tracePoly(ctx, leaf);
  ctx.stroke();
  // the stone step
  const st = rr(x0 - 6, d.y1, x1 + 6, d.y1 + 8, rnd, 0.3);
  ctx.fillStyle = rgba('#E2D5BA', 0.92);
  tracePoly(ctx, st);
  ctx.fill();
  ctx.fillStyle = rgba('#9A8C7A', 0.45);
  ctx.fillRect(x0 - 6, d.y1 + 5.6, x1 - x0 + 12, 2.4);
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.4;
  tracePoly(ctx, st);
  ctx.stroke();
}

function paintRoof(ctx: CanvasRenderingContext2D, rnd: Rand, plan: HousePlan, id: LoanId): void {
  const R = HOUSE[id].roof;
  const nz = makeNoise2D(id === 'a' ? 6601 : 6607);
  const det = detailAt(id, true);
  const field = washField(id === 'a' ? 6621 : 6627, ['#C47A52', '#B4613F', '#C98A60', '#A85A40', '#BE6E48', '#9E5A48']);
  const roofPoly = [R.x0, R.eaveY, R.ridgeX0, R.ridgeY, R.ridgeX1, R.ridgeY, R.x1, R.eaveY];
  ctx.save();
  tracePoly(ctx, roofPoly);
  ctx.clip();
  // the ground wash, laid tile by tile (each tile's place carries its share), wet in wet: terracotta drifting into
  // umber and a touch of violet, paler in the sun up on the left
  for (const u of plan.units) {
    if (u.stage !== 1 || u.kind !== 'tile') continue;
    const r = u.rects[0]!;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const u01 = (cx - R.x0) / (R.x1 - R.x0);
    const v01 = (R.eaveY - cy) / (R.eaveY - R.ridgeY);
    const lit = clamp(0.5 - 0.35 * u01 + 0.25 * v01 + (nz(cx * 0.03, cy * 0.05) - 0.5) * 0.4, 0, 1);
    ctx.fillStyle = rgba(mix(field(cx, cy), '#ECB088', lit * 0.4), 0.88);
    ctx.fillRect(r.x0 - 0.1, r.y0 - 0.1, r.x1 - r.x0 + 0.2, r.y1 - r.y0 + 0.2);
  }
  for (const u of plan.units) {
    if (u.stage !== 1 || u.kind !== 'tile') continue;
    const r = u.rects[0]!;
    const x0 = r.x0 + 0.3;
    const x1 = r.x1 - 0.3;
    const y0 = r.y0;
    const y1 = r.y1;
    const cx = (x0 + x1) / 2;
    const v = det(cx, (y0 + y1) / 2);
    const u01 = (r.x0 - R.x0) / (R.x1 - R.x0);
    const v01 = (R.eaveY - r.y1) / (R.eaveY - R.ridgeY);
    const lit = clamp(0.5 - 0.35 * u01 + 0.25 * v01 + (nz(r.x0 * 0.03, r.y0 * 0.05) - 0.5) * 0.4, 0, 1);
    const base = mix(rnd.pick(TILES), '#EAA77A', lit * 0.4);
    const dk = mix(base, SHADE, 0.5);
    // the course line: the shadow under the row above, always there (it is what reads as a tiled roof)
    ctx.fillStyle = rgba(dk, 0.3 + 0.3 * v);
    ribbon(ctx, [x0 - 0.2, y1 - 0.6, cx, y1 - 0.25 + rnd.range(-0.2, 0.2), x1 + 0.2, y1 - 0.6], 0.8 + 0.5 * v, 0.85);
    // the butt joint to the next tile: a short stroke, lost where the roof is in the sun
    if (rnd.chance(0.35 + 0.6 * v)) {
      ctx.fillStyle = rgba(dk, 0.12 + 0.25 * v);
      ribbon(ctx, [x1 - 0.2, y0 + 0.8 + rnd.range(0, 1.5), x1 - 0.1, y1 - 0.8], 0.45, 0.9);
    }
    if (v < 0.1) continue;
    // the tile's own glaze, as stated as its place
    const poly = deform([x0, y0, x1, y0, x1, y1 - 0.8, cx, y1 - 0.1, x0, y1 - 0.8], rnd, 1, 0.05);
    ctx.fillStyle = rgba(base, (0.18 + 0.45 * v) * rnd.range(0.7, 1.2));
    tracePoly(ctx, poly);
    ctx.fill();
    // the light caught on the tile's lower lip
    if (rnd.chance(0.4 + 0.4 * v)) {
      ctx.fillStyle = rgba(LIGHT, 0.12 + 0.2 * v);
      ribbon(ctx, [x0 + 0.8, y1 - 1.6, cx, y1 - 1.3, x1 - 1.2, y1 - 1.6], 0.45, 0.9);
    }
    // lichen and moss here and there (more toward the shaded right and the lower rows)
    if (rnd.chance((0.06 + 0.08 * (1 - v01)) * v)) {
      ctx.fillStyle = rgba(rnd.pick(['#A8A86A', '#C8BE7E', '#7E8A50']), 0.45);
      tracePoly(ctx, deform(blobPoly(rnd.range(x0 + 1, x1 - 1), rnd.range(y0 + 1, y1 - 1), rnd.range(0.8, 2), rnd.range(0.5, 1.2), rnd, 8, 0.3), rnd, 1, 0.1));
      ctx.fill();
    }
  }
  // broad washes over the whole roof: light along the upper left, shade at the lower right; backruns; the grain
  const g = ctx.createLinearGradient(R.x0, R.ridgeY, R.x1, R.eaveY);
  g.addColorStop(0, 'rgba(255,230,190,0.24)');
  g.addColorStop(0.5, 'rgba(255,230,190,0)');
  g.addColorStop(1, 'rgba(60,36,56,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(R.x0, R.ridgeY, R.x1 - R.x0, R.eaveY - R.ridgeY);
  // the hipped ends: lit on the left, in shade on the right
  ctx.fillStyle = 'rgba(255,236,200,0.16)';
  tracePoly(ctx, deform([R.x0, R.eaveY, R.ridgeX0, R.ridgeY, R.ridgeX0 + 10, R.ridgeY, R.x0 + 18, R.eaveY], rnd, 1, 0.03));
  ctx.fill();
  ctx.fillStyle = 'rgba(60,34,48,0.2)';
  tracePoly(ctx, deform([R.x1, R.eaveY, R.ridgeX1, R.ridgeY, R.ridgeX1 - 10, R.ridgeY, R.x1 - 18, R.eaveY], rnd, 1, 0.03));
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    backrun(ctx, rnd.range(R.x0 + 30, R.x1 - 30), rnd.range(R.ridgeY + 8, R.eaveY - 6), rnd.range(14, 30), rnd.range(6, 12), rnd.pick(['#9E5038', '#C98A60', '#7E4A58']), 0.24, rnd);
  }
  grain(ctx, '#5A3028', R.x0, R.ridgeY, R.x1 - R.x0, R.eaveY - R.ridgeY, 0.08, 0.18);
  ctx.restore();
  // the ridge: one roll of half-round tiles laid end to end, a lit top, a faint joint between each
  for (const u of plan.units) {
    if (u.kind !== 'ridge') continue;
    const r = u.rects[0]!;
    const top = r.y0 + 2;
    ctx.fillStyle = rgba('#94503A', 0.88);
    tracePoly(ctx, deform([r.x0 - 0.2, r.y1, r.x0 - 0.2, top + 0.6, (r.x0 + r.x1) / 2, top, r.x1 + 0.2, top + 0.6, r.x1 + 0.2, r.y1], rnd, 1, 0.02));
    ctx.fill();
    ctx.fillStyle = rgba('#E8A478', 0.4);
    ribbon(ctx, [r.x0, top + 1.1, (r.x0 + r.x1) / 2, top + 0.8, r.x1, top + 1.1], 0.7, 0.9);
    ctx.fillStyle = rgba('#5A2E2C', 0.3);
    ctx.fillRect(r.x1 - 0.3, top + 0.8, 0.5, r.y1 - top - 1);
  }
  // the ink of the roof: light, broken lines down the hips
  ctx.strokeStyle = rgba(INK, 0.3);
  ctx.lineWidth = 0.5;
  for (const [ax, ay, bx, by] of [[R.x0, R.eaveY, R.ridgeX0, RIDGE_Y], [R.x1, R.eaveY, R.ridgeX1, RIDGE_Y]] as const) {
    let t = 0;
    while (t < 1) {
      const t1 = Math.min(1, t + rnd.range(0.15, 0.4));
      ctx.beginPath();
      ctx.moveTo(ax + (bx - ax) * t, ay + (by - ay) * t);
      ctx.lineTo(ax + (bx - ax) * t1 + rnd.range(-0.2, 0.2), ay + (by - ay) * t1);
      ctx.stroke();
      t = t1 + rnd.range(0.02, 0.08);
    }
  }
}

function paintChimney(ctx: CanvasRenderingContext2D, rnd: Rand, plan: HousePlan, lit: (x: number, y: number) => number): void {
  // the stack's mortar first, solid, so the roof never shows through its brickwork
  {
    const c = plan.chim;
    ctx.fillStyle = rgba('#C99A7C', 0.97);
    ctx.fillRect(c.x0, c.shaftTop, c.x1 - c.x0, c.base - c.shaftTop + 6);
  }
  for (const u of plan.units) {
    if (u.stage !== 2) continue;
    const r = u.rects[0]!;
    if (u.kind === 'brick') {
      paintBrick(ctx, rnd, { x0: r.x0, x1: r.x1, y0: r.y0, y1: Math.min(r.y1, r.y0 + COURSE_H) }, lit(r.x0, r.y0) * 0.7, false, 0.75);
    } else if (u.kind === 'cap') {
      // the oversailing courses of the cap
      ctx.fillStyle = rgba('#A84E38', 0.9);
      tracePoly(ctx, rr(r.x0, r.y0, r.x1, r.y1, rnd, 0.2));
      ctx.fill();
      ctx.fillStyle = 'rgba(60,34,40,0.4)';
      ctx.fillRect(r.x0, r.y1 - 1.4, r.x1 - r.x0, 1.4);
      ctx.fillStyle = 'rgba(255,220,180,0.3)';
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, 0.8);
    } else if (u.kind === 'pot') {
      // a terracotta pot: tapered, a rim at the top, lit on the left
      const cx = (r.x0 + r.x1) / 2;
      const w = r.x1 - r.x0 - 2;
      const y0 = r.y0 + 6;
      const poly = [cx - w * 0.42, r.y1, cx - w * 0.5, y0 + 2, cx - w * 0.56, y0, cx + w * 0.56, y0, cx + w * 0.5, y0 + 2, cx + w * 0.42, r.y1];
      ctx.fillStyle = rgba('#C77048', 0.95);
      tracePoly(ctx, poly);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,36,40,0.35)';
      tracePoly(ctx, [cx + w * 0.05, r.y1, cx + w * 0.1, y0 + 2, cx + w * 0.5, y0 + 2, cx + w * 0.42, r.y1]);
      ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.5);
      ctx.lineWidth = 0.4;
      tracePoly(ctx, poly);
      ctx.stroke();
    }
  }
  // the chimney's shadow on the roof, to the lower right
  const c = plan.chim;
  ctx.fillStyle = 'rgba(60,30,40,0.28)';
  tracePoly(ctx, [c.x1, c.base - 2, c.x1 + 10, c.base + 4, c.x1 + 10, c.base + 12, c.x1, c.base + 8]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(c.x0, c.shaftTop, c.x1 - c.x0, c.base - c.shaftTop);
}

/** the finished house: the wall, then the windows and door, the eaves' shadow, the roof, the chimney, the gutter */
export function paintFinishedSprite(id: LoanId, q: number, wall: HTMLCanvasElement): HTMLCanvasElement {
  const { cv, ctx, box } = ctxFor(id, q);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(wall, 0, 0);
  ctx.restore();
  const plan = housePlan(id);
  const H = HOUSE[id];
  const rnd = new Rand(id === 'a' ? 6101 : 6113);
  const lit = lightAt(id);
  for (const o of plan.openings) {
    if (o.door) paintDoor(ctx, rnd, o.win, ACCENT[id]);
    else paintSash(ctx, rnd, o.win, o.win.y1 < GROUND_Y - 100);
  }
  // the eaves' shadow on the top of the wall, deeper toward the right
  const W = H.wall;
  const sh = ctx.createLinearGradient(0, W.y0, 0, W.y0 + 22);
  sh.addColorStop(0, 'rgba(56,30,44,0.42)');
  sh.addColorStop(0.5, 'rgba(56,30,44,0.16)');
  sh.addColorStop(1, 'rgba(56,30,44,0)');
  ctx.fillStyle = sh;
  tracePoly(ctx, [W.x0, W.y0, W.x1, W.y0, W.x1, W.y0 + 26, W.x0 + 30, W.y0 + 18, W.x0, W.y0 + 10]);
  ctx.fill();
  paintRoof(ctx, rnd, plan, id);
  paintChimney(ctx, rnd, plan, lit);
  // the gutter along the eaves and the downpipe at the outer corner (cast iron, black, a lit top edge)
  const R = H.roof;
  ctx.fillStyle = 'rgba(46,42,48,0.9)';
  ctx.fillRect(R.x0 - 1, R.eaveY - 0.5, R.x1 - R.x0 + 2, 3.2);
  ctx.fillStyle = 'rgba(200,200,210,0.5)';
  ctx.fillRect(R.x0 - 1, R.eaveY - 0.5, R.x1 - R.x0 + 2, 0.6);
  const px = H.outer === 1 ? W.x0 - 4 : W.x1 + 1;
  ctx.fillStyle = 'rgba(46,42,48,0.88)';
  ctx.fillRect(px, R.eaveY + 2, 3, GROUND_Y - R.eaveY);
  ctx.fillStyle = 'rgba(200,200,210,0.4)';
  ctx.fillRect(px, R.eaveY + 2, 0.7, GROUND_Y - R.eaveY);
  for (let y = R.eaveY + 30; y < GROUND_Y - 10; y += 46) ctx.fillRect(px - 0.6, y, 4.2, 1.2);
  void box;
  return cv;
}

/* ------------------------------------------------------------------ the pencil drawing */

/** a pencil line: two or three light passes, a little off each other, overshooting the ends */
function pencil(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, y0: number, x1: number, y1: number, a = 0.5, over = 1.6): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const passes = rnd.chance(0.6) ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    const o0 = rnd.range(-0.2, 1) * over;
    const o1 = rnd.range(-0.2, 1) * over;
    const n = Math.max(2, Math.round(len / 14));
    ctx.strokeStyle = rgba(GRAPHITE, a * (p === 0 ? 1 : 0.55) * rnd.range(0.75, 1.05));
    ctx.lineWidth = rnd.range(0.32, 0.5);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 - ux * o0 + (x1 - x0 + ux * (o0 + o1)) * t + rnd.range(-0.18, 0.18) - uy * p * 0.35;
      const y = y0 - uy * o0 + (y1 - y0 + uy * (o0 + o1)) * t + rnd.range(-0.18, 0.18) + ux * p * 0.35;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}
const pRect = (ctx: CanvasRenderingContext2D, rnd: Rand, r: Rect, a = 0.5, over = 1.6) => {
  pencil(ctx, rnd, r.x0, r.y0, r.x1, r.y0, a, over);
  pencil(ctx, rnd, r.x1, r.y0, r.x1, r.y1, a, over);
  pencil(ctx, rnd, r.x1, r.y1, r.x0, r.y1, a, over);
  pencil(ctx, rnd, r.x0, r.y1, r.x0, r.y0, a, over);
};

/** the whole finished house as a graphite underdrawing on the paper */
export function paintPencilSprite(id: LoanId, q: number): HTMLCanvasElement {
  const { cv, ctx } = ctxFor(id, q);
  const plan = housePlan(id);
  const H = HOUSE[id];
  const rnd = new Rand(id === 'a' ? 4401 : 4409);
  const W = H.wall;
  const R = H.roof;
  // the wall, overshooting at the corners
  pRect(ctx, rnd, W, 0.62, 5);
  // construction lines: the floor line and the sill and head heights, run out past the wall
  for (const y of [GROUND_Y - 96, GROUND_Y - 128, GROUND_Y - 186]) pencil(ctx, rnd, W.x0 - 14, y, W.x1 + 12, y, 0.16, 2);
  pencil(ctx, rnd, (W.x0 + W.x1) / 2, R.ridgeY - 12, (W.x0 + W.x1) / 2, GROUND_Y + 8, 0.1, 2);
  // the openings, with their glazing bars, sills and lintels
  for (const o of plan.openings) {
    const w = o.win;
    pRect(ctx, rnd, w, 0.55, 1.4);
    if (o.door) {
      pencil(ctx, rnd, w.x0, w.y0 + 12, w.x1, w.y0 + 12, 0.4, 0.6);
      const mx = (w.x0 + w.x1) / 2;
      pencil(ctx, rnd, mx, w.y0 + 14, mx, w.y1 - 2, 0.25, 0.5);
      pencil(ctx, rnd, w.x0 - 6, w.y1 + 8, w.x1 + 6, w.y1 + 8, 0.35, 1);
    } else {
      const midY = (w.y0 + w.y1) / 2;
      pencil(ctx, rnd, w.x0, midY, w.x1, midY, 0.35, 0.5);
      for (const t of [1 / 3, 2 / 3]) pencil(ctx, rnd, w.x0 + (w.x1 - w.x0) * t, w.y0, w.x0 + (w.x1 - w.x0) * t, w.y1, 0.18, 0.3);
    }
  }
  for (const u of plan.units) {
    if (u.kind === 'sill' || u.kind === 'lintel') pRect(ctx, rnd, u.rects[0]!, 0.4, 1);
  }
  // a few courses ticked in at the corners and round the door, as a painter marks the bond before washing in
  for (let k = 1; k < 32; k += rnd.int(2, 4)) {
    const y = GROUND_Y - k * COURSE_H;
    for (const [xa, len] of [[W.x0, rnd.range(10, 26)], [W.x1, -rnd.range(10, 26)]] as const) {
      pencil(ctx, rnd, xa, y, xa + len, y, 0.16, 0.4);
    }
  }
  // the roof: outline, ridge, hips, a few tile courses suggested
  pencil(ctx, rnd, R.x0, R.eaveY, R.x1, R.eaveY, 0.55, 4);
  pencil(ctx, rnd, R.x0, R.eaveY, R.ridgeX0, RIDGE_Y, 0.5, 3);
  pencil(ctx, rnd, R.x1, R.eaveY, R.ridgeX1, RIDGE_Y, 0.5, 3);
  pencil(ctx, rnd, R.ridgeX0, RIDGE_Y, R.ridgeX1, RIDGE_Y, 0.55, 4);
  pencil(ctx, rnd, R.ridgeX0, RIDGE_Y - 6, R.ridgeX1, RIDGE_Y - 6, 0.3, 1);
  for (let i = 1; i < plan.rows.length; i += 2) {
    const y = plan.rows[i]!;
    const t = (R.eaveY - y) / (R.eaveY - R.ridgeY);
    const xl = R.x0 + (R.ridgeX0 - R.x0) * t;
    const xr = R.x1 - (R.x1 - R.ridgeX1) * t;
    const a = rnd.range(0, 0.4);
    pencil(ctx, rnd, xl + (xr - xl) * a, y, xl + (xr - xl) * Math.min(1, a + rnd.range(0.2, 0.5)), y, 0.14, 0.5);
  }
  // the chimney and its pots
  const c = plan.chim;
  pRect(ctx, rnd, { x0: c.x0, x1: c.x1, y0: c.shaftTop, y1: c.base }, 0.5, 2);
  pRect(ctx, rnd, { x0: c.x0 - 5, x1: c.x1 + 5, y0: c.capTop, y1: c.shaftTop }, 0.45, 1);
  const mid = (c.x0 + c.x1) / 2;
  for (const dx of [-6.5, 6.5]) pRect(ctx, rnd, { x0: mid + dx - 4, x1: mid + dx + 4, y0: c.potTop, y1: c.capTop }, 0.4, 0.8);
  // the gutter and downpipe
  const px = H.outer === 1 ? W.x0 - 4 : W.x1 + 1;
  pencil(ctx, rnd, px, R.eaveY + 2, px, GROUND_Y, 0.3, 1);
  pencil(ctx, rnd, px + 3, R.eaveY + 2, px + 3, GROUND_Y, 0.3, 1);
  // the foundation, laid and painted from the start: a band of engineering brick at the foot
  ctx.fillStyle = rgba('#6E5A54', 0.5);
  tracePoly(ctx, rr(W.x0 - 2, GROUND_Y - 2, W.x1 + 2, GROUND_Y + 3, rnd, 0.3));
  ctx.fill();
  ctx.fillStyle = rgba('#3E3034', 0.3);
  ctx.fillRect(W.x0 - 2, GROUND_Y + 1.5, W.x1 - W.x0 + 4, 1.5);
  return cv;
}

/** the house's outline as it stands finished (walls, roof, chimney), world units: the paper is kept white inside it */
export function silhouette(id: LoanId): number[][] {
  const H = HOUSE[id];
  const W = H.wall;
  const R = H.roof;
  const c = housePlan(id).chim;
  return [
    [W.x0 - 1, GROUND_Y + 1, W.x0 - 1, R.eaveY, R.x0 + 1, R.eaveY + 3, R.x0 + 4, R.eaveY - 1, R.ridgeX0 + 5, RIDGE_Y - 9, R.ridgeX1 - 5, RIDGE_Y - 9, R.x1 - 4, R.eaveY - 1, R.x1 - 1, R.eaveY + 3, W.x1 + 1, R.eaveY, W.x1 + 1, GROUND_Y + 1],
    [c.x0 - 6, c.base, c.x0 - 6, c.capTop - 1, c.x1 + 6, c.capTop - 1, c.x1 + 6, c.base],
    // each pot, closely
    ...[-6.5, 6.5].map((dx) => {
      const m = (c.x0 + c.x1) / 2 + dx;
      return [m - 5.5, c.capTop, m - 5.5, c.potTop - 1, m + 5.5, c.potTop - 1, m + 5.5, c.capTop];
    }),
  ];
}
