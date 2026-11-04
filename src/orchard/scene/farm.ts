/**
 * The farm on the hill behind the orchards, and the church far off, painted small into the world layer as a painter
 * puts buildings into a distance: a wash for each face (the long side facing us half lit, the gable end on the right
 * in shade, the roof plane catching the sun), the pigment pooled along the lower and shaded edges, a few dark
 * openings, and a broken pen line only where a corner or an eave needs stating. Seen a little from the left, so each
 * building shows its right-hand gable.
 * - the farmhouse: warm honey stone, a slate roof, two chimneys, small windows, a porch;
 * - the big timber barn: dark-stained weatherboard under a long roof of old red clay tiles, its great doors open on
 *   the straw inside;
 * - the oast house: a round brick kiln with a steep tiled cone and a white cowl, joined to a small stowage barn;
 * - the church: a grey stone tower and a slim spire on the far ridge, almost lost in the haze.
 */
import type { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { mix, PAPER } from '../../river/scene/boatInk';

const INK = '#3E3236';

type P = [number, number];
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];
const flat = (ps: P[]): number[] => ps.flatMap((p) => [p[0], p[1]]);

interface Building {
  /** left end of the long wall facing us, at its foot */
  x: number;
  y: number;
  /** the long wall's length and height */
  w: number;
  h: number;
  /** the gable end's depth (seen foreshortened, going back to the right) */
  d: number;
  roofH: number;
  wall: string;
  gable?: string;
  roof: string;
  /** veil toward the paper (distance) */
  fade: number;
}

/** a pen line along a polyline, broken into runs */
function brokenLine(ctx: CanvasRenderingContext2D, rnd: Rand, pts: number[], a: number, w: number): void {
  ctx.strokeStyle = rgba(INK, a);
  ctx.lineWidth = w;
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    if (rnd.chance(0.25)) continue;
    const x0 = pts[2 * i]!;
    const y0 = pts[2 * i + 1]!;
    const x1 = pts[2 * i + 2]!;
    const y1 = pts[2 * i + 3]!;
    const t0 = rnd.range(0, 0.15);
    const t1 = rnd.range(0.8, 1);
    ctx.beginPath();
    ctx.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
    ctx.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    ctx.stroke();
  }
}

/** a wash over a face: the colour, then the pigment pooled toward one edge */
function face(ctx: CanvasRenderingContext2D, rnd: Rand, pts: P[], col: string, a: number, pool: string, poolA: number, poolDir: P): void {
  ctx.fillStyle = rgba(col, a);
  tracePoly(ctx, deform(flat(pts), rnd, 1, 0.012));
  ctx.fill();
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
  ctx.save();
  tracePoly(ctx, flat(pts));
  ctx.clip();
  const g = ctx.createLinearGradient(cx - poolDir[0] * r, cy - poolDir[1] * r, cx + poolDir[0] * r, cy + poolDir[1] * r);
  g.addColorStop(0, rgba(pool, 0));
  g.addColorStop(1, rgba(pool, poolA));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** the shell of a building: the long wall, the gable end, the roof; returns its corners for the details */
function shell(ctx: CanvasRenderingContext2D, rnd: Rand, b: Building): { A: P; B: P; C: P; D: P; dv: P; apexL: P; apexR: P } {
  const f = (c: string) => mix(c, PAPER, b.fade);
  const dv: P = [b.d, -b.d * 0.34];
  const A: P = [b.x, b.y];
  const B: P = [b.x + b.w, b.y];
  const C: P = [b.x + b.w, b.y - b.h];
  const D: P = [b.x, b.y - b.h];
  const apexR = add(add(C, dv, 0.5), [0, -b.roofH]);
  const apexL = add(add(D, dv, 0.5), [0, -b.roofH]);
  // the gable end, in shade
  const gable = [B, add(B, dv), add(C, dv), apexR, C];
  face(ctx, rnd, gable, f(b.gable ?? b.wall), 0.95, '#5A4A68', 0.32, [0.6, 0.8]);
  ctx.fillStyle = rgba('#5A4A6A', 0.26);
  tracePoly(ctx, flat(gable));
  ctx.fill();
  // the long wall: lit from the upper left, deepening to its right and its foot
  face(ctx, rnd, [A, B, C, D], f(b.wall), 0.95, '#7A6070', 0.22, [0.7, 0.7]);
  // the roof plane, overhanging a little at the eave and the verges, catching the sun
  const ov: P = [-1.2, 0.8];
  const roof = [add(D, ov), add(C, [1.2, 0.8]), add(apexR, [1.4, -0.2]), add(apexL, [-1.4, -0.2])];
  face(ctx, rnd, roof, f(b.roof), 0.96, '#4A3A50', 0.24, [0.55, 0.85]);
  ctx.fillStyle = 'rgba(255,236,196,0.22)';
  tracePoly(ctx, flat([roof[0]!, roof[3]!, add(roof[3]!, [b.w * 0.35, 0]), add(roof[0]!, [b.w * 0.25, 0])]));
  ctx.fill();
  // the eave's shadow on the wall under it
  ctx.fillStyle = rgba('#4A3A50', 0.22);
  tracePoly(ctx, flat([D, C, add(C, [0, 1.6]), add(D, [0, 1.2])]));
  ctx.fill();
  // the gable's verge line and the ridge, and the corners stated in pen, broken
  const inkA = 0.55 - b.fade * 0.5;
  brokenLine(ctx, rnd, flat([roof[0]!, roof[1]!, roof[2]!, roof[3]!, roof[0]!]), inkA, 0.4);
  brokenLine(ctx, rnd, flat([C, B, add(B, dv), add(C, dv)]), inkA * 0.9, 0.35);
  brokenLine(ctx, rnd, flat([A, B]), inkA * 0.7, 0.35);
  return { A, B, C, D, dv, apexL, apexR };
}

function opening(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number): void {
  ctx.fillStyle = rgba('#3E3444', a);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rgba('#F4E6C8', a * 0.35);
  ctx.fillRect(x, y + h, w, Math.max(0.35, h * 0.1));
}

function chimney(ctx: CanvasRenderingContext2D, x: number, yTop: number, h: number, col: string, fade: number): void {
  ctx.fillStyle = rgba(mix(col, PAPER, fade), 0.95);
  ctx.fillRect(x - 1.6, yTop, 3.2, h);
  ctx.fillStyle = rgba('#5A4A68', 0.3);
  ctx.fillRect(x + 0.4, yTop, 1.2, h);
  ctx.fillStyle = rgba(mix('#B0644A', PAPER, fade), 0.95);
  ctx.fillRect(x - 1, yTop - 1.4, 0.9, 1.6);
  ctx.fillRect(x + 0.3, yTop - 1.2, 0.9, 1.4);
}

/** the farmhouse: honey stone, a slate roof, two chimneys, small windows in two storeys, a porch */
export function farmhouse(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, k: number, fade: number): void {
  const b: Building = { x, y, w: 34 * k, h: 15 * k, d: 12 * k, roofH: 9 * k, wall: '#E2C69A', gable: '#D6B88C', roof: '#7C8294', fade };
  const s = shell(ctx, rnd, b);
  // stone: a few pooled blooms in the wash
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#C8A276', '#D6B080', '#BC9C80']), 0.16);
    ctx.beginPath();
    ctx.ellipse(rnd.range(x + 2, x + b.w - 2), rnd.range(y - b.h + 2, y - 1), rnd.range(2, 4) * k, rnd.range(0.8, 1.6) * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const a = 0.62 - fade * 0.5;
  for (const u of [0.14, 0.38, 0.62, 0.84]) {
    opening(ctx, x + b.w * u - 1.4 * k, y - b.h + 2.4 * k, 2.8 * k, 3.2 * k, a);
    if (u !== 0.38) opening(ctx, x + b.w * u - 1.4 * k, y - b.h * 0.48, 2.8 * k, 3.4 * k, a);
  }
  // the door under a little porch roof
  opening(ctx, x + b.w * 0.38 - 1.6 * k, y - 5.4 * k, 3.2 * k, 5.4 * k, a * 0.9);
  ctx.fillStyle = rgba(mix('#7C8294', PAPER, fade), 0.9);
  tracePoly(ctx, [x + b.w * 0.38 - 3 * k, y - 5.6 * k, x + b.w * 0.38, y - 7.8 * k, x + b.w * 0.38 + 3 * k, y - 5.6 * k]);
  ctx.fill();
  chimney(ctx, s.apexL[0] + 2 * k, s.apexL[1] - 4 * k, 4.6 * k, '#C8A880', fade);
  chimney(ctx, s.apexR[0] - 2 * k, s.apexR[1] - 4 * k, 4.6 * k, '#C8A880', fade);
}

/** the big timber barn: dark weatherboard, a long roof of old red tiles, the great doors open on the straw */
export function barn(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, k: number, fade: number): void {
  const b: Building = { x, y, w: 58 * k, h: 12 * k, d: 20 * k, roofH: 14 * k, wall: '#7A6656', gable: '#6A5848', roof: '#B87050', fade };
  const s = shell(ctx, rnd, b);
  // the weatherboards: fine level lines, and the tiles: a few broken courses and patches of lichen
  ctx.strokeStyle = rgba('#3E3030', 0.18);
  ctx.lineWidth = 0.25;
  for (let yy = y - 1.6 * k; yy > y - b.h; yy -= 1.6 * k) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, yy);
    ctx.lineTo(x + b.w - 0.5, yy);
    ctx.stroke();
  }
  ctx.save();
  tracePoly(ctx, flat([s.D, s.C, s.apexR, s.apexL]));
  ctx.clip();
  ctx.strokeStyle = rgba('#6A3A30', 0.2);
  ctx.lineWidth = 0.3;
  for (let t = 0.2; t < 1; t += 0.2) {
    const l = add(s.D, [s.apexL[0] - s.D[0], s.apexL[1] - s.D[1]], t);
    const r = add(s.C, [s.apexR[0] - s.C[0], s.apexR[1] - s.C[1]], t);
    ctx.beginPath();
    ctx.moveTo(l[0], l[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#C8B070', '#8C9A6A', '#A06048']), 0.22);
    ctx.beginPath();
    ctx.ellipse(rnd.range(s.D[0] + 4, s.C[0]), rnd.range(s.apexL[1] + 2, s.D[1] - 1), rnd.range(2, 5) * k, rnd.range(0.6, 1.4) * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // the great doors, open: the dark of the barn, the straw stacked inside catching a little light
  const dx = x + b.w * 0.42;
  const dw = 10 * k;
  opening(ctx, dx, y - b.h + 1.4 * k, dw, b.h - 1.4 * k, 0.78 - fade * 0.5);
  ctx.fillStyle = rgba(mix('#D8B868', PAPER, fade), 0.7);
  ctx.fillRect(dx + 1.2 * k, y - 4.2 * k, dw - 2.4 * k, 4.2 * k);
  // the door leaves swung back against the wall
  for (const sx of [-1, 1]) {
    ctx.fillStyle = rgba(mix('#6A5444', PAPER, fade), 0.95);
    const ex = sx < 0 ? dx : dx + dw;
    tracePoly(ctx, [ex, y, ex + sx * 4.6 * k, y + 0.6 * k, ex + sx * 4.6 * k, y - b.h + 2.2 * k, ex, y - b.h + 1.4 * k]);
    ctx.fill();
  }
  // a lean-to on the left end, lower, with a sagging roof of corrugated iron gone rusty
  ctx.fillStyle = rgba(mix('#8A7262', PAPER, fade), 0.9);
  tracePoly(ctx, [x - 12 * k, y, x, y, x, y - b.h * 0.85, x - 12 * k, y - b.h * 0.55]);
  ctx.fill();
  ctx.fillStyle = rgba(mix('#A8786A', PAPER, fade), 0.9);
  tracePoly(ctx, [x - 13 * k, y - b.h * 0.52, x + 0.5, y - b.h * 0.9, x + 0.5, y - b.h * 1.02, x - 13.5 * k, y - b.h * 0.62]);
  ctx.fill();
  opening(ctx, x - 9 * k, y - b.h * 0.42, 5 * k, b.h * 0.42, 0.5 - fade * 0.4);
}

/** the oast house: a round brick kiln, a steep tiled cone, the white cowl leaning off the wind; a small barn beside */
export function oast(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, k: number, fade: number): void {
  // the stowage barn beside it first (it stands to the right, behind)
  const b: Building = { x: x + 5 * k, y: y - 1 * k, w: 18 * k, h: 10 * k, d: 9 * k, roofH: 7 * k, wall: '#E8DCC2', gable: '#D8CAB0', roof: '#B06C4E', fade };
  shell(ctx, rnd, b);
  opening(ctx, x + 12 * k, y - 7 * k, 2.4 * k, 2.6 * k, 0.5 - fade * 0.4);
  // the kiln: a cylinder, lit on its left
  const r = 6.5 * k;
  const h = 15 * k;
  const brick = mix('#C47A5C', PAPER, fade);
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, rgba(mix(brick, '#F6DCC0', 0.35), 0.96));
  g.addColorStop(0.45, rgba(brick, 0.96));
  g.addColorStop(1, rgba(mix(brick, '#5A3A4A', 0.4), 0.96));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - r, y - h);
  ctx.lineTo(x - r, y);
  ctx.ellipse(x, y, r, r * 0.3, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, y - h);
  ctx.closePath();
  ctx.fill();
  // courses of brick, faint
  ctx.strokeStyle = rgba('#7A4434', 0.16);
  ctx.lineWidth = 0.25;
  for (let yy = y - 1.5 * k; yy > y - h; yy -= 1.5 * k) {
    ctx.beginPath();
    ctx.ellipse(x, yy, r, r * 0.3, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
  // the cone: steep, tiled, lit on its left
  const ch = 17 * k;
  const cg = ctx.createLinearGradient(x - r, 0, x + r, 0);
  const tile = mix('#A85E44', PAPER, fade);
  cg.addColorStop(0, rgba(mix(tile, '#F8D8B8', 0.3), 0.97));
  cg.addColorStop(0.5, rgba(tile, 0.97));
  cg.addColorStop(1, rgba(mix(tile, '#4A3048', 0.4), 0.97));
  ctx.fillStyle = cg;
  tracePoly(ctx, [x - r - 0.8, y - h + 0.6, x - 1.1 * k, y - h - ch, x + 1.1 * k, y - h - ch, x + r + 0.8, y - h + 0.6]);
  ctx.fill();
  // the white cowl and its vane, turned off the breeze
  const cy = y - h - ch;
  ctx.fillStyle = rgba(mix('#F6F2E8', PAPER, fade * 0.5), 0.98);
  tracePoly(ctx, [x - 1.6 * k, cy, x - 1.6 * k, cy - 3.6 * k, x + 0.4 * k, cy - 5.4 * k, x + 2.6 * k, cy - 4.6 * k, x + 2.6 * k, cy - 1 * k, x + 1.6 * k, cy]);
  ctx.fill();
  ctx.fillStyle = rgba('#8A8098', 0.35);
  tracePoly(ctx, [x + 0.6 * k, cy, x + 0.6 * k, cy - 4.6 * k, x + 2.6 * k, cy - 4.6 * k, x + 2.6 * k, cy - 1 * k, x + 1.6 * k, cy]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5 - fade * 0.4);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(x + 2.6 * k, cy - 3 * k);
  ctx.lineTo(x + 5 * k, cy - 3.4 * k);
  ctx.stroke();
  brokenLine(ctx, rnd, [x - r - 0.8, y - h + 0.6, x - 1.1 * k, y - h - ch, x + 1.1 * k, y - h - ch, x + r + 0.8, y - h + 0.6], 0.5 - fade * 0.45, 0.35);
  brokenLine(ctx, rnd, [x + r, y - h, x + r, y], 0.45 - fade * 0.4, 0.35);
}

/** the church on the far ridge: a tower and a slim spire, grey stone, nearly lost in the haze */
export function church(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number): void {
  const k = 0.8;
  const stone = mix('#B8B0B4', PAPER, 0.35);
  // the nave, low, behind and to the right
  ctx.fillStyle = rgba(stone, 0.8);
  tracePoly(ctx, deform([x + 3, y, x + 3, y - 6, x + 20, y - 6, x + 20, y], rnd, 1, 0.02));
  ctx.fill();
  ctx.fillStyle = rgba(mix('#8A8EA2', PAPER, 0.4), 0.85);
  tracePoly(ctx, [x + 2, y - 6, x + 6, y - 10, x + 21, y - 10, x + 21, y - 6]);
  ctx.fill();
  // the tower and the spire
  ctx.fillStyle = rgba(stone, 0.9);
  ctx.fillRect(x - 4 * k, y - 16 * k, 8 * k, 16 * k);
  ctx.fillStyle = 'rgba(110,104,140,0.2)';
  ctx.fillRect(x + 0.6 * k, y - 16 * k, 3.4 * k, 16 * k);
  ctx.fillStyle = rgba(mix('#8A8EA2', PAPER, 0.3), 0.92);
  tracePoly(ctx, [x - 4.4 * k, y - 16 * k, x, y - 40 * k, x + 4.4 * k, y - 16 * k]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,206,0.25)';
  tracePoly(ctx, [x - 4.4 * k, y - 16 * k, x, y - 40 * k, x - 0.6 * k, y - 16 * k]);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.32);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(x, y - 40 * k);
  ctx.lineTo(x, y - 44 * k);
  ctx.stroke();
  ctx.fillStyle = 'rgba(62,50,54,0.3)';
  ctx.fillRect(x - 1 * k, y - 13 * k, 2 * k, 3 * k);
}
