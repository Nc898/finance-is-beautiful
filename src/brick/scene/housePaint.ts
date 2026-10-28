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
 */
import { Rand, clamp, makeNoise2D } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
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

/* ------------------------------------------------------------------ the wall */

function paintBrick(ctx: CanvasRenderingContext2D, rnd: Rand, r: Rect, lit: number, header: boolean): void {
  const x0 = r.x0 + 0.55;
  const x1 = r.x1 - 0.55;
  const y0 = r.y0 + 0.6;
  const y1 = r.y1 - 0.55;
  if (x1 - x0 < 1.2) return;
  let base = header ? rnd.pick(HEADERS) : rnd.pick(BRICKS);
  base = mix(base, '#E9A57C', lit * 0.38);
  const poly = deform(rr(x0, y0, x1, y1, rnd, 0.22), rnd, 1, 0.04);
  // two uneven glazes
  ctx.fillStyle = rgba(base, 0.62 + rnd.range(-0.08, 0.1));
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(mix(base, rnd.pick(['#D88A5E', '#8E4032', '#C4704C', '#A86048']), 0.5), 0.22);
  tracePoly(ctx, deform(poly, rnd, 1, 0.08));
  ctx.fill();
  // the pigment pools along the lower edge and the shaded right; the light lifts off the top
  const dk = mix(base, SHADE, 0.55);
  ctx.fillStyle = rgba(dk, 0.32 + (1 - lit) * 0.2);
  ribbon(ctx, [x0 + 0.6, y1 - 0.35, (x0 + x1) / 2, y1 - 0.25, x1 - 0.3, y1 - 0.4], 0.75, 0.9);
  ctx.fillStyle = rgba(dk, 0.2 + (1 - lit) * 0.15);
  ribbon(ctx, [x1 - 0.35, y0 + 0.5, x1 - 0.25, (y0 + y1) / 2, x1 - 0.35, y1 - 0.3], 0.5, 0.9);
  if (rnd.chance(0.55)) {
    ctx.fillStyle = rgba(LIGHT, 0.18 + lit * 0.3);
    ribbon(ctx, [x0 + 0.8, y0 + 0.45, x0 + (x1 - x0) * rnd.range(0.3, 0.6), y0 + 0.4], 0.45, 0.9);
  }
  // a burnt end now and then, a speck or two of grit
  if (!header && rnd.chance(0.12)) {
    const e = rnd.chance(0.5) ? x0 : x1 - 3.2;
    ctx.fillStyle = rgba('#5E2E2C', 0.3);
    tracePoly(ctx, rr(e, y0 + 0.3, e + 3.2, y1 - 0.3, rnd, 0.3));
    ctx.fill();
  }
  if (rnd.chance(0.5)) {
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#5A2A26' : '#F6E2C8', 0.4);
    ctx.fillRect(rnd.range(x0 + 1, x1 - 1), rnd.range(y0 + 0.8, y1 - 0.8), 0.45, 0.35);
  }
}

function paintStoneBlock(ctx: CanvasRenderingContext2D, rnd: Rand, r: Rect, lit: number, kind: 'sill' | 'lintel'): void {
  const base = mix(rnd.pick(STONE), '#FFF6E2', lit * 0.3);
  const poly = deform(rr(r.x0 + 0.3, r.y0 + 0.4, r.x1 - 0.3, r.y1 - 0.4, rnd, 0.2), rnd, 1, 0.025);
  ctx.fillStyle = rgba(base, 0.85);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba('#C4B08C', 0.3);
  tracePoly(ctx, deform(poly, rnd, 1, 0.05));
  ctx.fill();
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
  ctx.strokeStyle = rgba(INK, 0.3);
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
  // the lime mortar: a pale warm wash where the brickwork goes, darker in the joints' shade toward the right
  for (const u of plan.units) {
    if (u.stage === 1) continue;
    if (u.kind !== 'brick') continue;
    const r = u.rects[0]!;
    const l = lit(r.x0, r.y0);
    ctx.fillStyle = rgba(mix('#E4D3B8', '#BFAE98', 1 - l), 0.62);
    ctx.fillRect(r.x0 - 0.05, r.y0 - 0.05, r.x1 - r.x0 + 0.1, r.y1 - r.y0 + 0.1);
  }
  // the bricks (every fifth course a few darker headers, as in a garden-wall bond)
  plan.units.forEach((u, i) => {
    if (u.stage === 1 || u.kind !== 'brick') return;
    const r = u.rects[0]!;
    const course = Math.round((GROUND_Y - r.y1) / COURSE_H);
    const header = r.x1 - r.x0 < BRICK_L * 0.62 ? rnd.chance(0.5) : course % 5 === 2 && i % 2 === 0 && rnd.chance(0.6);
    paintBrick(ctx, rnd, r, lit((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), header);
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
  g.addColorStop(0, 'rgba(255,226,180,0.14)');
  g.addColorStop(0.5, 'rgba(255,226,180,0)');
  g.addColorStop(1, 'rgba(70,44,64,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(W.x0, W.y0, W.x1 - W.x0, W.y1 - W.y0);
  const damp = ctx.createLinearGradient(0, GROUND_Y - 18, 0, GROUND_Y);
  damp.addColorStop(0, 'rgba(80,60,50,0)');
  damp.addColorStop(1, 'rgba(80,60,50,0.18)');
  ctx.fillStyle = damp;
  ctx.fillRect(W.x0, GROUND_Y - 18, W.x1 - W.x0, 18);
  // a couple of soft blooms where the wash pooled
  for (let i = 0; i < 6; i++) {
    const x = rnd.range(W.x0, W.x1);
    const y = rnd.range(W.y0, W.y1);
    const b = ctx.createRadialGradient(x, y, 0, x, y, rnd.range(14, 34));
    b.addColorStop(0, rgba(rnd.pick(['#9C4A3A', '#C9845A', '#7E4A52']), 0.09));
    b.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = b;
    ctx.fillRect(x - 40, y - 40, 80, 80);
  }
  ctx.restore();
  return cv;
}

/* ------------------------------------------------------------------ what goes in later */

function paintSash(ctx: CanvasRenderingContext2D, rnd: Rand, w: Rect, upper: boolean): void {
  const x0 = w.x0;
  const x1 = w.x1;
  const y0 = w.y0;
  const y1 = w.y1;
  // the glass: the sky reflected, darker in the lower right, a pale diagonal sheen
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(150,176,196,0.9)');
  g.addColorStop(0.55, 'rgba(92,112,138,0.92)');
  g.addColorStop(1, 'rgba(58,66,90,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // net curtains or a drawn-back curtain inside, faint
  ctx.fillStyle = rgba(upper ? '#E8E0D4' : '#D9C9B2', 0.32);
  ctx.fillRect(x0 + 1.5, y0 + 1.5, (x1 - x0) * 0.22, y1 - y0 - 3);
  ctx.fillRect(x1 - 1.5 - (x1 - x0) * 0.22, y0 + 1.5, (x1 - x0) * 0.22, y1 - y0 - 3);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = 'rgba(240,248,255,0.32)';
  for (const off of [0.18, 0.44]) {
    const sx = x0 + (x1 - x0) * off;
    tracePoly(ctx, [sx, y0, sx + 6, y0, sx - 22, y1, sx - 28, y1]);
    ctx.fill();
  }
  ctx.restore();
  // the painted timber: frame, meeting rail, glazing bars (six over six), paper white with a cool shade
  const frame = 'rgba(250,246,236,0.96)';
  const shade = 'rgba(150,150,166,0.6)';
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
  tracePoly(ctx, [x0 - 3, y0 - 3, x1 + 3, y0 - 3, x1 + 3, y1, x1 - 0.5, y1, x1 - 0.5, y0 + 1.6, x0, y0 + 1.6]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.4;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  void rnd;
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
  const leaf = deform(rr(x0 + 0.4, ly0, x1 - 0.4, d.y1, rnd, 0.15), rnd, 1, 0.02);
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
  ctx.strokeStyle = rgba(INK, 0.55);
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
  // under the tiles a warm ground wash so the gaps read as shadow, not paper
  const roofPoly = [R.x0, R.eaveY, R.ridgeX0, R.ridgeY, R.ridgeX1, R.ridgeY, R.x1, R.eaveY];
  ctx.fillStyle = rgba('#8A4A36', 0.55);
  tracePoly(ctx, roofPoly);
  ctx.fill();
  for (const u of plan.units) {
    if (u.stage !== 1 || u.kind !== 'tile') continue;
    const r = u.rects[0]!;
    const x0 = r.x0 + 0.3;
    const x1 = r.x1 - 0.3;
    const y0 = r.y0;
    const y1 = r.y1;
    const u01 = (r.x0 - R.x0) / (R.x1 - R.x0);
    const v01 = (R.eaveY - r.y1) / (R.eaveY - R.ridgeY);
    const lit = clamp(0.5 - 0.35 * u01 + 0.25 * v01 + (nz(r.x0 * 0.03, r.y0 * 0.05) - 0.5) * 0.4, 0, 1);
    const base = mix(rnd.pick(TILES), '#EAA77A', lit * 0.4);
    // a tile hangs from the row above: its bottom edge rounded a little, its lower part catching the light less
    const poly = deform([x0, y0, x1, y0, x1, y1 - 1, (x0 + x1) / 2, y1 + 0.3, x0, y1 - 1], rnd, 1, 0.04);
    ctx.fillStyle = rgba(base, 0.82);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba(mix(base, SHADE, 0.5), 0.35);
    ribbon(ctx, [x0 + 0.5, y1 - 0.6, (x0 + x1) / 2, y1, x1 - 0.5, y1 - 0.6], 0.8, 0.9);
    ctx.fillStyle = rgba(mix(base, SHADE, 0.45), 0.28);
    ctx.fillRect(x1 - 0.7, y0, 0.7, y1 - y0 - 0.6);
    // lichen and moss here and there (more toward the shaded right and the lower rows)
    if (rnd.chance(0.06 + 0.08 * (1 - v01))) {
      ctx.fillStyle = rgba(rnd.pick(['#A8A86A', '#C8BE7E', '#7E8A50']), 0.5);
      ctx.beginPath();
      ctx.ellipse(rnd.range(x0 + 1, x1 - 1), rnd.range(y0 + 1, y1 - 1), rnd.range(0.8, 2), rnd.range(0.5, 1.2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the ridge tiles: half-round, darker, a lit top
  for (const u of plan.units) {
    if (u.kind !== 'ridge') continue;
    const r = u.rects[0]!;
    const poly = deform([r.x0, r.y1, r.x0 + 1, r.y0 + 3, (r.x0 + r.x1) / 2, r.y0 + 1, r.x1 - 1, r.y0 + 3, r.x1, r.y1], rnd, 1, 0.04);
    ctx.fillStyle = rgba('#8E4632', 0.9);
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.fillStyle = rgba('#E59A6E', 0.45);
    ribbon(ctx, [r.x0 + 1.5, r.y0 + 2.8, (r.x0 + r.x1) / 2, r.y0 + 1.6, r.x1 - 1.5, r.y0 + 2.8], 0.8, 0.9);
  }
  // broad washes over the whole roof: light along the upper left, shade at the lower right and under the ridge
  ctx.save();
  tracePoly(ctx, roofPoly);
  ctx.clip();
  const g = ctx.createLinearGradient(R.x0, R.ridgeY, R.x1, R.eaveY);
  g.addColorStop(0, 'rgba(255,230,190,0.2)');
  g.addColorStop(0.55, 'rgba(255,230,190,0)');
  g.addColorStop(1, 'rgba(60,36,56,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(R.x0, R.ridgeY, R.x1 - R.x0, R.eaveY - R.ridgeY);
  ctx.restore();
  // the hipped ends are in shade on the right, lit on the left
  ctx.fillStyle = 'rgba(255,236,200,0.14)';
  tracePoly(ctx, [R.x0, R.eaveY, R.ridgeX0, R.ridgeY, R.ridgeX0 + 8, R.ridgeY, R.x0 + 14, R.eaveY]);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,34,48,0.2)';
  tracePoly(ctx, [R.x1, R.eaveY, R.ridgeX1, R.ridgeY, R.ridgeX1 - 8, R.ridgeY, R.x1 - 14, R.eaveY]);
  ctx.fill();
  // the ink of the roof: broken lines at the eaves, the hips and the ridge
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(R.x0, R.eaveY);
  ctx.lineTo(R.ridgeX0, RIDGE_Y);
  ctx.lineTo(R.ridgeX1, RIDGE_Y);
  ctx.lineTo(R.x1, R.eaveY);
  ctx.stroke();
}

function paintChimney(ctx: CanvasRenderingContext2D, rnd: Rand, plan: HousePlan, lit: (x: number, y: number) => number): void {
  // the stack's mortar first, solid, so the roof never shows through its brickwork
  {
    const c = plan.chim;
    ctx.fillStyle = rgba('#D9C6AA', 0.97);
    ctx.fillRect(c.x0, c.shaftTop, c.x1 - c.x0, c.base - c.shaftTop + 6);
  }
  for (const u of plan.units) {
    if (u.stage !== 2) continue;
    const r = u.rects[0]!;
    if (u.kind === 'brick') {
      paintBrick(ctx, rnd, { x0: r.x0, x1: r.x1, y0: r.y0, y1: Math.min(r.y1, r.y0 + COURSE_H) }, lit(r.x0, r.y0) * 0.7, false);
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
