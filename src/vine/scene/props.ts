/**
 * Small painted props, each a cached sprite with its soft contact shadow baked in: pumpkins and a squash, a
 * wheelbarrow of leaves, a hay bale, the garden bench, the low garden wall by each pile and the leaning rake,
 * plus tufts of grass that sway in the breeze. Painted once; the scene depth-sorts and blits them.
 *
 * Painted in the house watercolor style of the river's mileposts and rowboats: every form is a few low-alpha
 * glazes, a bloom toward the sun (upper left) and a shadow wash the other way, pigment pooled inside the edge,
 * dry-brush grain, granulation and a broken, tapering sepia contour.
 */
import { Rand } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { grassTuft, strokePoly } from '../../river/scene/paint';
import { brush, feather, inkDashes, mix, paintForm, ribbon, smoothPoly, speckle, bounds, type Pt } from '../../river/scene/boatInk';
import { BENCH, PILE } from './geom';
import { RAKE_LEAN, WALL_STUB } from './layout';
import type { Sprite } from './art';
import { cpuSprite, finishSprite } from './propSprite';
import { WOOD, darker, dropLeaf, grainIn, lighter, plank, quad, softShadow, strew, sunAndShade } from './propPaint';
import type { PlanId } from '../types';

/** the shadow goes behind everything already painted (so the sun glaze never tints it) */
function shadowBehind(ctx: CanvasRenderingContext2D, f: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  f();
  ctx.restore();
}

const circle = (cx: number, cy: number, rx: number, ry: number, rnd: Rand, n = 22, jit = 0.012): number[] => {
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + rnd.range(-jit, jit);
    o.push(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j);
  }
  return o;
};

const fin = (sp: Sprite, seed: number, q: number, amt = 0.6): void => void finishSprite(sp, seed, q, amt);

/* ------------------------------------------------------------------ pumpkins */

/** a lobed pumpkin leaf lying on the ground, with its veins */
function pumpkinLeaf(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, y: number, s: number, rot: number): void {
  const co = Math.cos(rot);
  const si = Math.sin(rot);
  const T = (u: number, v: number): Pt => [x + (u * co - v * si) * s, y + (u * si + v * co) * s * 0.52];
  const pts: number[] = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lobe = Math.pow(Math.abs(Math.cos(2.5 * a)), 0.65);
    const r = 0.5 + 0.5 * lobe;
    const p = T(Math.cos(a) * r, Math.sin(a) * r);
    pts.push(p[0], p[1]);
  }
  const poly = deform(pts, rnd, 1, 0.02);
  paintForm(ctx, poly, '#6F9040', rnd, { alpha: 0.9, layers: 2, light: '#B5CB6E', shade: '#31502C', speck: 8, inkA: 0.5, inkW: 0.4, dash: [3, 8] });
  ctx.strokeStyle = 'rgba(220,236,160,0.5)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.62 + Math.PI;
    const p0 = T(0, 0);
    const p1 = T(Math.cos(a) * 0.82, Math.sin(a) * 0.82);
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
  }
  ctx.stroke();
}

/** a body outline for a round or flat pumpkin with scalloped sides */
function pumpkinBody(cx: number, cy: number, rx: number, ry: number, lobes: number, rnd: Rand): number[] {
  const pts: number[] = [];
  const n = 44;
  const ph = rnd.range(0, 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // the silhouette dips a little between ribs, and the crown is pinched at the stem
    const scallop = 1 - 0.028 * Math.abs(Math.cos(((lobes * a) / 2) + ph));
    const pinch = a > Math.PI * 1.35 && a < Math.PI * 1.65 ? 1 - 0.09 * Math.cos((a - Math.PI * 1.5) * 5) : 1;
    pts.push(cx + Math.cos(a) * rx * scallop, cy + Math.sin(a) * ry * scallop * pinch);
  }
  return pts;
}

function pumpkin(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, gy: number, r: number, col: string, kind: 'round' | 'squash' | 'flat', withLeaf: boolean): void {
  const light = lighter(col, 0.5);
  const shade = darker(col, 0.5);
  let top = 0;
  let body: number[];
  let cx = x;
  let cy = gy;
  let rx = r;
  let ry = r;
  const lobes = kind === 'flat' ? 9 : kind === 'round' ? 7 : 4;
  if (kind === 'squash') {
    const s = r;
    const P: Pt[] = [
      [-0.4 * s, -2.7 * s],
      [0.0 * s, -2.8 * s],
      [0.44 * s, -2.7 * s],
      [0.54 * s, -1.85 * s],
      [0.86 * s, -1.2 * s],
      [1.1 * s, -0.62 * s],
      [0.92 * s, -0.12 * s],
      [0.4 * s, 0.04 * s],
      [-0.3 * s, 0.04 * s],
      [-0.9 * s, -0.1 * s],
      [-1.1 * s, -0.66 * s],
      [-0.88 * s, -1.24 * s],
      [-0.56 * s, -1.9 * s],
    ];
    body = smoothPoly(P.map((p) => [x + p[0], gy + p[1]] as Pt), 5, true);
    top = gy - 2.75 * s;
    cx = x;
    cy = gy - 0.95 * s;
    rx = 1.05 * s;
    ry = 1.0 * s;
  } else {
    rx = kind === 'flat' ? r * 1.12 : r;
    ry = kind === 'flat' ? r * 0.64 : r * 0.84;
    cy = gy - ry * 0.97;
    body = pumpkinBody(cx, cy, rx, ry, lobes, rnd);
    top = cy - ry * 0.96;
  }
  if (withLeaf) pumpkinLeaf(ctx, rnd, x - r * 1.5, gy - r * 0.14, r * 1.7, rnd.range(-0.4, 0.2));
  // the volume: glazes, sun bloom, shade wash, pooled edge
  paintForm(ctx, body, col, rnd, {
    alpha: 0.95,
    layers: 3,
    light,
    shade,
    lightA: 0.34,
    shadeA: 0.3,
    pool: 1.3,
    speck: Math.round(r * r * 0.9),
    inkA: 0.6,
    inkW: 0.5,
    dash: [4, 14],
  });
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  // the ribs: a dark crease with a lit lobe beside it, meridians that bulge out around the belly
  const spanX = kind === 'squash' ? rx * 0.85 : rx;
  const yTop = kind === 'squash' ? top + r * 0.4 : cy - ry * 0.93;
  const yBot = kind === 'squash' ? gy : cy + ry * 0.96;
  const rib = (phi: number, t0 = 0, t1 = 1): Pt[] => {
    const o: Pt[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = t0 + (t1 - t0) * (k / 10);
      let px = cx + phi * spanX * (0.16 + 0.8 * Math.sin(Math.PI * t));
      if (kind === 'squash') px = cx + phi * spanX * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9)) * (t > 0.55 ? 1 : 0.55 + t * 0.8));
      o.push([px, yTop + (yBot - yTop) * t]);
    }
    return o;
  };
  const nCrease = lobes - 1;
  for (let j = 1; j <= nCrease; j++) {
    const phi = -1 + (2 * j) / lobes;
    // the lit side of each lobe: a pale streak just left of the crease, stronger on the left of the fruit
    const lit = phi < 0.35 ? 1 : 0.55;
    const pts = rib(phi - 2 / lobes * 0.32);
    brush(ctx, pts, r * 0.2, light, 0.2 + 0.2 * lit, 0.95);
    brush(ctx, rib(phi, 0.03, 0.97), Math.max(0.55, r * 0.085), darker(col, 0.62), 0.34 + 0.12 * (phi > 0 ? 1 : 0), 0.9);
    brush(ctx, rib(phi - 0.025, 0.1, 0.9), 0.3, lighter(col, 0.75), 0.2, 0.9);
  }
  // paper-bright lift on the upper-left shoulder
  ctx.fillStyle = 'rgba(255,244,214,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.4, cy - ry * 0.44, rx * 0.2, ry * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // the underside sinks into shadow, a warm bounce at the very foot
  const sg = ctx.createLinearGradient(0, cy, 0, cy + ry);
  sg.addColorStop(0, 'rgba(120,48,24,0)');
  sg.addColorStop(0.75, 'rgba(110,40,28,0.2)');
  sg.addColorStop(1, 'rgba(90,40,50,0.34)');
  ctx.fillStyle = sg;
  ctx.fillRect(cx - rx * 1.1, cy, rx * 2.2, ry * 1.1);
  ctx.restore();
  // the stalk: a ridged, woody stub curving up and over, with a flared base and a cut end
  const sb = top + (kind === 'squash' ? r * 0.12 : r * 0.12);
  const sx = kind === 'squash' ? x - 0.05 * r : x + r * 0.02;
  const sc: Pt[] = [
    [sx, sb],
    [sx + r * 0.04, sb - r * 0.22],
    [sx + r * 0.12, sb - r * 0.42],
    [sx + r * 0.3, sb - r * 0.58],
  ];
  const stem = strokePoly(sc, (t) => r * (0.3 - 0.1 * t + 0.22 * Math.pow(1 - t, 6)));
  paintForm(ctx, stem, '#7D6A3A', rnd, { alpha: 0.96, layers: 2, light: '#C2B070', shade: '#3C3220', speck: 6, inkA: 0.65, inkW: 0.4, grain: 3, dash: [2, 6] });
  ctx.fillStyle = 'rgba(48,32,20,0.55)';
  ctx.beginPath();
  ctx.ellipse(sx + r * 0.3, sb - r * 0.58, r * 0.13, r * 0.07, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // a green curl of tendril leaving the stalk
  if (kind !== 'squash' && rnd.chance(0.85)) {
    const px = sx + r * 0.08;
    const py = sb - r * 0.18;
    const dir = rnd.chance(0.5) ? 1 : -1;
    const tp: Pt[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const a = t * Math.PI * 3.2;
      const rad = r * (0.58 - 0.5 * t);
      tp.push([px + dir * (r * 0.6 * t + Math.sin(a) * rad * 0.8) , py - r * 0.22 * t + (1 - Math.cos(a)) * rad * 0.8 - r * 0.2]);
    }
    brush(ctx, tp, 0.45, '#6F9040', 0.9, 0.7);
    brush(ctx, tp, 0.18, '#C2DA80', 0.4, 0.7);
  }
}

/** pumpkins are painted 25% larger than the radii and offsets asked for, so they read at scene scale */
const PUMPKIN_SCALE = 1.25;

export function makePumpkins(seed: number, q: number, specIn: Array<{ dx: number; dy: number; r: number; col: string; kind?: 'round' | 'squash' | 'flat' }>): Sprite {
  const rnd = new Rand(seed);
  const spec = specIn.map((p) => ({ ...p, dx: p.dx * PUMPKIN_SCALE, dy: p.dy * PUMPKIN_SCALE, r: p.r * PUMPKIN_SCALE }));
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const p of spec) {
    const tall = p.kind === 'squash' ? 3.3 : 1.9;
    x0 = Math.min(x0, p.dx - p.r * 2.5);
    x1 = Math.max(x1, p.dx + p.r * 2.1);
    y0 = Math.min(y0, p.dy - p.r * tall);
    y1 = Math.max(y1, p.dy + p.r * 0.9);
  }
  const { sp, ctx } = cpuSprite(x1 - x0 + 8, y1 - y0 + 6, -x0 + 4, -y0 + 3, q);
  const ord = spec.slice().sort((a, b) => a.dy - b.dy);
  ord.forEach((p, i) => pumpkin(ctx, rnd, p.dx, p.dy, p.r, p.col, p.kind ?? 'round', i === 0));
  // a few fallen leaves tucked in around them
  for (let i = 0; i < 6; i++) {
    const p = ord[rnd.int(0, ord.length - 1)]!;
    dropLeaf(ctx, rnd, p.dx + rnd.range(-1.9, 2.1) * p.r, p.dy + rnd.range(-0.05, 0.4) * p.r, rnd.range(0, 6.28), 0.46 * rnd.range(0.9, 1.2), 1, 0.55);
  }
  sunAndShade(ctx, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, 0.1, 0.08);
  shadowBehind(ctx, () => {
    for (const p of ord) softShadow(ctx, rnd, p.dx + p.r * 0.38, p.dy + p.r * 0.04, p.r * 1.45, p.r * 0.3, 0.2);
  });
  fin(sp, seed, q);
  return sp;
}

/* ------------------------------------------------------------------ wheelbarrow */

export function makeWheelbarrow(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = cpuSprite(162, 82, 74, 72, q);
  const WX = -46;
  const WY = -12.5;
  const WR = 12.5;
  const wood = '#B88A58';
  // ---- far side first: far handle, far leg, far fork
  const handle = (x0: number, y0: number, x1: number, y1: number, w: number, far: boolean): void => {
    const pts: Pt[] = [];
    for (let k = 0; k <= 8; k++) pts.push([x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8 - Math.sin((k / 8) * Math.PI) * 1.2]);
    const poly = strokePoly(pts, (t) => w * (0.78 + 0.22 * t + (t > 0.86 ? 0.5 : 0)));
    plank(ctx, rnd, poly, far ? '#8E6840' : wood, { grain: 7, ink: far ? 0.4 : 0.55, knots: far ? 0 : 1 });
  };
  handle(-1, -16, 78, -31, 3.4, true);
  const leg = (x0: number, y0: number, x1: number, y1: number, far: boolean): void => {
    const poly = strokePoly([[x0, y0], [(x0 + x1) / 2 + 0.6, (y0 + y1) / 2], [x1, y1]], () => 3.3);
    plank(ctx, rnd, poly, far ? '#8E6840' : '#B07E50', { grain: 5, ink: far ? 0.4 : 0.55, vertical: true });
  };
  leg(52, -26, 60, -1.4, true);
  // far fork strap
  brush(ctx, [[WX + 1.5, WY - 1.5], [-26, -19], [-8, -20.5]], 1.3, '#5C6264', 0.7, 0.8);

  // ---- the wheel: tyre, steel rim, hub and spokes
  const tyre = circle(WX, WY, WR, WR, rnd, 28);
  paintForm(ctx, tyre, '#46403E', rnd, { alpha: 0.96, layers: 3, light: '#8A8284', shade: '#1E1A22', lightA: 0.3, shadeA: 0.3, speck: 50, inkA: 0.6, inkW: 0.55, dash: [6, 18] });
  ctx.save();
  ctx.strokeStyle = 'rgba(20,16,20,0.5)';
  ctx.lineWidth = 0.55;
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(WX + Math.cos(a) * (WR - 0.2), WY + Math.sin(a) * (WR - 0.2));
    ctx.lineTo(WX + Math.cos(a) * (WR - 1.9), WY + Math.sin(a) * (WR - 1.9));
    ctx.stroke();
  }
  ctx.restore();
  paintForm(ctx, circle(WX, WY, WR - 3.0, WR - 3.0, rnd, 22), '#A29C8E', rnd, { alpha: 0.95, layers: 2, light: '#E6E0D0', shade: '#4C4850', speck: 30, inkA: 0.5, inkW: 0.4, dash: [4, 12] });
  ctx.strokeStyle = rgba('#5A5650', 0.8);
  ctx.lineWidth = 0.7;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(WX, WY);
    ctx.lineTo(WX + Math.cos(a) * (WR - 3.6), WY + Math.sin(a) * (WR - 3.6));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(250,246,230,0.4)';
  ctx.lineWidth = 0.35;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(WX - 0.3, WY - 0.3);
    ctx.lineTo(WX - 0.3 + Math.cos(a) * (WR - 3.8), WY - 0.3 + Math.sin(a) * (WR - 3.8));
    ctx.stroke();
  }
  paintForm(ctx, circle(WX, WY, 2.5, 2.5, rnd, 12), '#7E7868', rnd, { alpha: 0.96, layers: 2, light: '#D8D2C0', shade: '#38343A', speck: 4, inkA: 0.5, inkW: 0.35, dash: [2, 6] });
  // ---- near fork: a steel strap from the axle up to the tub
  brush(ctx, [[WX, WY], [-28, -17.5], [-10, -18.5]], 1.9, '#6A7072', 0.95, 0.8);
  brush(ctx, [[WX - 0.2, WY - 0.6], [-28, -18.1], [-10, -19.2]], 0.5, '#C8CCC8', 0.55, 0.8);

  // ---- the tub: first the dim inside seen over the near rim, then the leaves, then the near wall
  const rimNearY = (x: number): number => -34.2 + Math.pow((x - 3) / 33, 2) * 0.9;
  const inside = [-31, -34, 35, -34.4, 37, -40, -27, -39.5];
  tracePoly(ctx, inside);
  const ig = ctx.createLinearGradient(0, -40, 0, -34);
  ig.addColorStop(0, '#324A44');
  ig.addColorStop(1, '#24362F');
  ctx.fillStyle = ig;
  ctx.fill();
  // the heap of leaves
  const heap: Array<{ x: number; y: number; r: number; s: number; t: number }> = [];
  for (let i = 0; i < 175; i++) {
    const u = rnd.next();
    const x = -28.5 + u * 62;
    const env = 22 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * u)), 0.75) * (0.82 + 0.18 * Math.sin(u * 9));
    const y = -34 - Math.pow(rnd.next(), 0.8) * env;
    const hf = (-34 - y) / (env + 0.1);
    const lit = x < 12 && hf > 0.35 ? 0 : hf < 0.22 ? 2 : 1;
    heap.push({ x, y, r: rnd.range(0, 6.28), s: 0.64 + rnd.range(-0.1, 0.16), t: rnd.chance(0.2) ? 1 : lit });
  }
  heap.sort((a, b) => a.y - b.y);
  for (const h of heap) dropLeaf(ctx, rnd, h.x, h.y, h.r, h.s, h.t, 0.82);

  // the near wall: faded green enamel, stamped ribs, rolled rim, chipped to rust at the foot
  const wall: Pt[] = [
    [-32, -34.2],
    [-30.2, -29],
    [-26, -21.2],
    [-18.5, -15],
    [-6, -12.6],
    [10, -12.4],
    [21, -14.6],
    [28, -23],
    [31.5, -30],
    [35, -34.4],
  ];
  const wallPoly = smoothPoly(wall, 5, false).concat([35, -34.4, -32, -34.2]);
  const wp = deform(wallPoly, rnd, 1, 0.006);
  paintForm(ctx, wp, '#5A9084', rnd, {
    alpha: 0.97,
    layers: 3,
    light: '#B4DAC8',
    shade: '#233C46',
    lightA: 0.3,
    shadeA: 0.32,
    pool: 1.4,
    speck: 140,
    inkA: 0.6,
    inkW: 0.5,
    dash: [6, 20],
  });
  ctx.save();
  tracePoly(ctx, wp);
  ctx.clip();
  // stamped ribs running down the tub
  for (const f of [0.22, 0.45, 0.68]) {
    const x0 = -30 + 63 * f;
    const x1 = -24 + 52 * f;
    ctx.strokeStyle = 'rgba(30,60,66,0.4)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, -33);
    ctx.quadraticCurveTo((x0 + x1) / 2 - 1, -24, x1, -12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,240,226,0.42)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(x0 - 1.1, -33);
    ctx.quadraticCurveTo((x0 + x1) / 2 - 2.1, -24, x1 - 1.1, -12);
    ctx.stroke();
  }
  // rust blooming from the bottom edge and a couple of chips
  const rust: number[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    rust.push(4 + Math.cos(a) * 22, -11.5 + Math.sin(a) * 4.2);
  }
  feather(ctx, rust, '#B4642E', 0.55, rnd, 5, 1, 0.4, 0.14);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#B4642E', '#8A4A28', '#D08A44']), 0.5);
    ctx.beginPath();
    ctx.ellipse(rnd.range(-20, 26), rnd.range(-22, -13), rnd.range(0.8, 2.2), rnd.range(0.4, 1), rnd.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  grainIn(ctx, rnd, wp, 10, '#1E3C3E', 0.2, { vertical: false, w: 0.5 });
  ctx.restore();
  // the rolled rim along the top
  const rim: Pt[] = [];
  for (let k = 0; k <= 12; k++) {
    const x = -32 + (67 * k) / 12;
    rim.push([x, rimNearY(x)]);
  }
  const rimPoly = strokePoly(rim, () => 2.5);
  paintForm(ctx, rimPoly, '#6FA596', rnd, { alpha: 0.97, layers: 2, light: '#D8F0E2', shade: '#2A4A52', speck: 20, inkA: 0.6, inkW: 0.42, dash: [6, 16] });
  // ---- the near handle runs back out from under the tub
  handle(-4, -14, 80, -29, 3.6, false);
  // grip end caps
  ctx.fillStyle = rgba('#6A4A2C', 0.6);
  ctx.beginPath();
  ctx.ellipse(80.6, -29.2, 1.0, 1.9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  leg(48, -25, 54, -1.4, false);
  // a leaf or two hanging over the near rim, and the ones blown to the ground
  for (let i = 0; i < 7; i++) dropLeaf(ctx, rnd, rnd.range(-24, 28), rimNearY(0) + rnd.range(-2.4, 1.0), rnd.range(-0.9, 0.9) + 0.5 * Math.PI * (rnd.chance(0.5) ? 0 : 1) * 0, 0.64, rnd.chance(0.5) ? 0 : 1, 0.78);
  strew(ctx, rnd, 10, -62, 34, -4, 6, 0.5);
  sunAndShade(ctx, -66, -60, 150, 72, 0.1, 0.14);
  shadowBehind(ctx, () => {
    softShadow(ctx, rnd, 8, -0.4, 64, 6, 0.2);
    softShadow(ctx, rnd, WX + 3, -0.4, 14, 3.4, 0.2);
  });
  fin(sp, seed, q);
  return sp;
}

/* ------------------------------------------------------------------ hay bale */

/** straw strokes inside a polygon: tapered strands, mostly along one direction */
function straw(
  ctx: CanvasRenderingContext2D,
  rnd: Rand,
  poly: number[],
  n: number,
  cols: readonly string[],
  o: { ang?: number; spread?: number; len?: [number, number]; w?: [number, number]; a?: [number, number] } = {},
): void {
  const b = bounds(poly);
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const [l0, l1] = o.len ?? [5, 16];
  const [w0, w1] = o.w ?? [0.3, 0.8];
  const [a0, a1] = o.a ?? [0.3, 0.8];
  for (let i = 0; i < n; i++) {
    const x = b.x0 + rnd.next() * b.w;
    const y = b.y0 + rnd.next() * b.h;
    const L = rnd.range(l0, l1);
    const ang = (o.ang ?? 0) + rnd.gauss() * (o.spread ?? 0.1);
    const bend = rnd.gauss() * 1.2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const pts: number[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4 - 0.5;
      pts.push(x + dx * L * t - dy * bend * (1 - 4 * t * t), y + dy * L * t + dx * bend * (1 - 4 * t * t));
    }
    ctx.fillStyle = rgba(rnd.pick(cols), rnd.range(a0, a1));
    ribbon(ctx, pts, rnd.range(w0, w1), 0.95);
  }
  ctx.restore();
}

export function makeHayBale(seed: number, q: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = cpuSprite(112, 78, 50, 64, q);
  const fx0 = -34;
  const fx1 = 32;
  const fy0 = -36;
  const fy1 = 0;
  const DX = 11;
  const DY = -9;
  const hay = ['#F2DC8A', '#E4C468', '#D6AE55', '#BC9440', '#A07A30', '#F7E7A8'];
  // faces, with the soft bulge of a pressed bale
  const front = deform([fx0 + 1, fy0 + 0.5, (fx0 + fx1) / 2, fy0 - 1.6, fx1 - 1, fy0 + 0.5, fx1 + 1.2, (fy0 + fy1) / 2, fx1 - 0.5, fy1 - 0.6, (fx0 + fx1) / 2, fy1 + 0.8, fx0 + 0.5, fy1 - 0.6, fx0 - 1.2, (fy0 + fy1) / 2], rnd, 2, 0.012);
  const top = deform([fx0 + 1, fy0 + 0.5, (fx0 + fx1) / 2, fy0 - 1.6, fx1 - 1, fy0 + 0.5, fx1 - 1 + DX, fy0 + DY + 0.4, (fx0 + fx1) / 2 + DX, fy0 + DY - 1.4, fx0 + 1 + DX, fy0 + DY + 0.4], rnd, 2, 0.01);
  const side = deform([fx1 - 1, fy0 + 0.5, fx1 - 1 + DX, fy0 + DY + 0.4, fx1 + 0.5 + DX, (fy0 + fy1) / 2 + DY, fx1 - 0.5 + DX, fy1 + DY - 0.5, fx1 - 0.5, fy1 - 0.6, fx1 + 1.2, (fy0 + fy1) / 2], rnd, 2, 0.01);
  // back (shaded) end of the twine and the faces' bases
  paintForm(ctx, side, '#B08A3A', rnd, { alpha: 0.96, layers: 3, light: '#E0C26C', shade: '#5A3A2A', lightA: 0.18, shadeA: 0.36, speck: 60, ink0: true });
  straw(ctx, rnd, side, 130, ['#8A6A2A', '#A98838', '#C8A650', '#6E5222'], { ang: -1.25, spread: 0.45, len: [2, 6], w: [0.28, 0.6], a: [0.3, 0.7] });
  paintForm(ctx, front, '#DDB65C', rnd, { alpha: 0.97, layers: 3, light: '#FFF0B4', shade: '#7A5428', lightA: 0.28, shadeA: 0.32, pool: 1.5, speck: 140, ink0: true });
  paintForm(ctx, top, '#EBCF7A', rnd, { alpha: 0.97, layers: 3, light: '#FFF6C8', shade: '#9A7430', lightA: 0.3, shadeA: 0.2, speck: 80, ink0: true });
  // the straw itself: long tapered strands lying along the bale, a few tufted seams between the flakes
  straw(ctx, rnd, front, 520, hay, { ang: 0.0, spread: 0.1, len: [8, 24], w: [0.3, 0.95], a: [0.25, 0.8] });
  straw(ctx, rnd, front, 90, ['#8A6A2A', '#6E5222', '#A98838'], { ang: 0.02, spread: 0.08, len: [10, 28], w: [0.25, 0.6], a: [0.25, 0.55] });
  straw(ctx, rnd, top, 200, hay, { ang: -0.05, spread: 0.1, len: [8, 22], w: [0.3, 0.9], a: [0.3, 0.8] });
  // the flake seams: dark, tapered lines across the front face
  for (const f of [0.26, 0.52, 0.76]) {
    const y = fy0 + (fy1 - fy0) * f;
    const seam: number[] = [];
    for (let k = 0; k <= 16; k++) seam.push(fx0 + 2 + ((fx1 - fx0 - 4) * k) / 16, y + Math.sin(k * 0.8 + f * 9) * 0.6 + rnd.range(-0.2, 0.2));
    ctx.fillStyle = rgba('#6A4A22', 0.28);
    ribbon(ctx, seam, 1.5, 0.95);
    ctx.fillStyle = rgba('#FFF2B0', 0.3);
    ribbon(ctx, seam.map((v, i) => (i % 2 ? v - 1.3 : v)), 0.6, 0.95);
  }
  // twine: pressed grooves with a cord and a knot, over the front and across the top
  for (const f of [0.27, 0.74]) {
    const x = fx0 + (fx1 - fx0) * f;
    const pts: Pt[] = [];
    for (let k = 0; k <= 8; k++) pts.push([x + Math.sin(k * 1.3 + f * 7) * 0.35, fy0 + 0.5 + ((fy1 - fy0 - 1) * k) / 8]);
    brush(ctx, pts, 3.2, '#6A4A22', 0.2, 0.9);
    brush(ctx, pts, 0.95, '#6C4E2A', 0.9, 0.95);
    brush(ctx, pts.map(([a, b]) => [a - 0.35, b] as Pt), 0.3, '#E8C890', 0.6, 0.95);
    const tp: Pt[] = [[x, fy0 + 0.2], [x + DX * 0.5 + 0.2, fy0 + DY * 0.5 - 1], [x + DX, fy0 + DY + 0.2]];
    brush(ctx, tp, 2.6, '#6A4A22', 0.18, 0.9);
    brush(ctx, tp, 0.9, '#6C4E2A', 0.9, 0.95);
    brush(ctx, tp.map(([a, b]) => [a - 0.3, b - 0.3] as Pt), 0.28, '#E8C890', 0.55, 0.95);
  }
  // the knot and two loose cord ends
  {
    const kx = fx0 + (fx1 - fx0) * 0.27;
    ctx.fillStyle = rgba('#5A3E20', 0.9);
    ctx.beginPath();
    ctx.ellipse(kx + 0.2, fy0 + 3.4, 1.7, 1.3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    brush(ctx, [[kx, fy0 + 3.6], [kx - 2, fy0 + 7], [kx - 1.4, fy0 + 10]], 0.5, '#6C4E2A', 0.85, 0.7);
    brush(ctx, [[kx + 0.4, fy0 + 3.6], [kx + 2.6, fy0 + 6.6], [kx + 3.2, fy0 + 9.6]], 0.5, '#6C4E2A', 0.85, 0.7);
  }
  // sun on the upper left, shade down and to the right, a darker foot
  ctx.save();
  tracePoly(ctx, front);
  ctx.clip();
  const g = ctx.createLinearGradient(fx0, fy0, fx1, fy1);
  g.addColorStop(0, 'rgba(255,246,196,0.26)');
  g.addColorStop(0.5, 'rgba(255,246,196,0)');
  g.addColorStop(1, 'rgba(110,60,50,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(fx0 - 2, fy0 - 3, fx1 - fx0 + 4, fy1 - fy0 + 6);
  const fg = ctx.createLinearGradient(0, fy1 - 9, 0, fy1 + 1);
  fg.addColorStop(0, 'rgba(90,50,40,0)');
  fg.addColorStop(1, 'rgba(90,50,50,0.34)');
  ctx.fillStyle = fg;
  ctx.fillRect(fx0 - 2, fy1 - 9, fx1 - fx0 + 4, 10);
  ctx.restore();
  // a broken contour on each face, with the heavier line on the shaded edges
  for (const poly of [front, top, side]) {
    const b = bounds(poly);
    inkDashes(ctx, poly, rnd, { color: '#4A3420', alpha: 0.5, w: 0.5, dash: [4, 14], gap: [0.8, 3], center: [b.cx, b.cy] });
  }
  // stray strands sticking out of the silhouette and some loose straw at the foot
  for (let i = 0; i < 90; i++) {
    const t = rnd.next();
    let x: number;
    let y: number;
    if (t < 0.35) {
      x = rnd.range(fx0, fx1);
      y = fy0 - rnd.range(0, 1.5);
    } else if (t < 0.55) {
      x = fx0 + rnd.range(-1.5, 0.6);
      y = rnd.range(fy0, fy1);
    } else if (t < 0.7) {
      x = fx1 + DX + rnd.range(-1, 1.6);
      y = rnd.range(fy0 + DY, fy1 + DY);
    } else {
      x = rnd.range(fx0 - 6, fx1 + DX + 4);
      y = rnd.range(fy1 - 1, fy1 + 3.4);
    }
    const a = t < 0.35 ? -Math.PI / 2 + rnd.gauss() * 0.7 : t < 0.55 ? Math.PI + rnd.gauss() * 0.7 : t < 0.7 ? rnd.gauss() * 0.7 : rnd.gauss() * 0.5 + (rnd.chance(0.5) ? 0 : Math.PI);
    const L = rnd.range(2.5, t >= 0.7 ? 9 : 6);
    ctx.fillStyle = rgba(rnd.pick(hay), rnd.range(0.55, 0.95));
    ribbon(ctx, [x, y, x + Math.cos(a) * L * 0.5 + rnd.range(-0.4, 0.4), y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L], rnd.range(0.35, 0.75), 0.95);
  }
  strew(ctx, rnd, 7, fx0 - 10, fx1 + DX + 6, 1, 6, 0.46);
  sunAndShade(ctx, fx0 - 14, fy0 - 14, 100, 66, 0.05, 0.1);
  shadowBehind(ctx, () => {
    softShadow(ctx, rnd, 6 + DX * 0.5, 0.2, 50, 6.4, 0.22);
    softShadow(ctx, rnd, 14, 3, 36, 3.2, 0.14);
  });
  fin(sp, seed, q);
  return sp;
}

/* ------------------------------------------------------------------ the bench */

/**
 * A wooden garden bench in three-quarter view; the pivot is the middle of the seat's front edge at ground level.
 * The seat's top front edge stands `seat` units up: the gardener's sitting height (gardener.ts SEAT_TOP), so they
 * sit ON it. The back and the arms rise behind and to the sides of that line.
 */
export function makeBench(seed: number, q: number, seat = 31): Sprite {
  const rnd = new Rand(seed);
  const hw = 41;
  const DX = 7;
  const DY = -8;
  const W = hw * 2 + DX + 30;
  const Hh = seat + 56;
  const { sp, ctx } = cpuSprite(W, Hh, hw + 14, seat + 46, q);
  const wood = (i: number): string => WOOD[(i + seed) % WOOD.length]!;
  const at = (x: number, y: number, d: number): Pt => [x + DX * d, y + DY * d];
  const leg = '#A8764A';
  // ---- the back posts: rear legs that rise into the backrest, seen behind the seat
  const bk = (sx: number): number[] => {
    const lean = 3.4;
    const xb = sx + DX;
    return quad([xb - 2, DY + 0.6], [xb + 2, DY + 0.6], [xb + 2 + lean, DY - seat - 36], [xb - 2 + lean, DY - seat - 36]);
  };
  for (const sx of [-hw + 4, hw - 4]) plank(ctx, rnd, bk(sx), '#9A6A42', { grain: 5, ink: 0.5, vertical: true });
  // the rail under the seat at the back, in shade
  plank(ctx, rnd, quad(at(-hw + 4, -seat + 1, 1), at(hw - 4, -seat + 1, 1), at(hw - 4, -seat + 5.8, 1), at(-hw + 4, -seat + 5.8, 1)), '#8E6038', { grain: 4, ink: 0.4 });
  // ---- the backrest: three slats, slightly leaned back, between the posts
  for (let i = 0; i < 3; i++) {
    const y0 = -seat - 12 - i * 9.2;
    const lean = ((seat + 36 + (y0 + seat)) / (seat + 36)) * 0;
    void lean;
    const k = (seat + 12 + i * 9.2 - 6) / (seat + 36);
    const bx = DX + 3.4 * Math.max(0, Math.min(1, k + 0.2));
    plank(ctx, rnd, quad([-hw + 3 + bx, y0 + DY - 7.4], [hw - 3 + bx, y0 + DY - 7.4], [hw - 3 + bx, y0 + DY - 0.4], [-hw + 3 + bx, y0 + DY - 0.4]), wood(i), { grain: 14, knots: 1, ink: 0.55 });
  }
  // ---- the arms: a flat bar from the front post back to the rear post
  const armY = -seat - 14;
  // right side of the seat (the end face we see, in shade) and the side rail under the arm
  const rightEnd = quad([hw, -seat], at(hw, -seat, 1), at(hw, -seat + 3.8, 1), [hw, -seat + 3.8]);
  void rightEnd;
  // ---- the seat: four slats, top faces lit; the front slat's face below them
  for (let i = 0; i < 4; i++) {
    const a = i / 4 + 0.012;
    const b = (i + 1) / 4 - 0.012;
    const poly = quad(at(-hw, -seat, a), at(hw, -seat, a), at(hw, -seat, b), at(-hw, -seat, b));
    plank(ctx, rnd, poly, lighter(wood(i + 2), 0.18), { grain: 10, knots: i === 1 ? 1 : 0, ink: 0.5, light: 0.3 });
  }
  // the right end of the seat, a shaded face
  plank(ctx, rnd, quad([hw, -seat], at(hw, -seat, 1), [hw + DX, -seat + DY + 4.2], [hw, -seat + 4.2]), '#9C6C42', { grain: 4, ink: 0.5, shade: 0.3 });
  // front rail face
  plank(ctx, rnd, quad([-hw, -seat], [hw, -seat], [hw, -seat + 4.4], [-hw, -seat + 4.4]), wood(1), { grain: 12, knots: 1, ink: 0.6 });
  // under the seat is dim: a shadow wash on the back rail and the ground behind the legs
  ctx.fillStyle = 'rgba(50,34,56,0.24)';
  ctx.fillRect(-hw + 3, -seat + 4.4, hw * 2 - 6, 4);
  // ---- front legs (rising into the arms), the low stretcher and the side stretcher
  plank(ctx, rnd, quad([-hw + 3, -9.4], [hw - 3, -9.4], [hw - 3, -6.2], [-hw + 3, -6.2]), '#A5724A', { grain: 6, ink: 0.5 });
  plank(ctx, rnd, quad([hw - 2.6, -10], at(hw - 2.6, -10, 1), at(hw - 2.6, -7, 1), [hw - 2.6, -7]), '#8A5A38', { grain: 3, ink: 0.45, shade: 0.3 });
  for (const sx of [-hw + 3.2, hw - 3.2]) {
    plank(ctx, rnd, quad([sx - 2.1, armY], [sx + 2.1, armY], [sx + 2.1, 0], [sx - 2.1, 0]), leg, { grain: 6, ink: 0.55, vertical: true });
    // a shaded right edge on the leg
    ctx.fillStyle = 'rgba(60,32,40,0.2)';
    ctx.fillRect(sx + 0.6, armY + 4, 1.6, -armY - 4);
  }
  // arm bars
  for (const sx of [-hw + 3.2, hw - 3.2]) {
    const top = quad([sx - 2.3, armY], [sx + 2.3, armY], at(sx + 2.3, armY, 1), at(sx - 2.3, armY, 1));
    plank(ctx, rnd, top, lighter(wood(4), 0.2), { grain: 5, ink: 0.55, light: 0.3, vertical: false });
    plank(ctx, rnd, quad([sx - 2.3, armY], [sx + 2.3, armY], [sx + 2.3, armY + 2.4], [sx - 2.3, armY + 2.4]), wood(0), { grain: 3, ink: 0.55 });
    if (sx > 0) plank(ctx, rnd, quad([sx + 2.3, armY], at(sx + 2.3, armY, 1), [sx + 2.3 + DX, armY + DY + 2.4], [sx + 2.3, armY + 2.4]), '#9C6C42', { grain: 3, ink: 0.5, shade: 0.3 });
  }
  // moss and weathering on the seat ends, a few leaves caught by the feet and on the stretcher
  for (const mx of [-hw + 6, hw - 8]) {
    const mp: number[] = [];
    for (let k = 0; k < 9; k++) mp.push(mx + Math.cos(k * 0.7) * 3.4, -seat - 3 + Math.sin(k * 0.7) * 1.2);
    feather(ctx, mp, '#8FA050', 0.4, rnd, 3, 1, 0.5, 0.15);
  }
  speckle(ctx, rnd, -hw, -seat - 8, hw * 2, 9, 40, '#5A3A22', 0.25, '#FFF0D0', 0.3, 0.2);
  strew(ctx, rnd, 6, -hw - 4, hw + 8, -3, 4, 0.48);
  sunAndShade(ctx, -hw - 6, -seat - 50, hw * 2 + 30, seat + 54, 0.12, 0.12);
  shadowBehind(ctx, () => {
    softShadow(ctx, rnd, 6 + DX * 0.4, 0.8 + DY * 0.3, hw + 6, 6.6, 0.24);
  });
  fin(sp, seed, q);
  return sp;
}

/* ------------------------------------------------------------------ the garden wall and the leaning rake */

/** stone colours: warm and cool greys, a few buff and rust-stained ones */
const STONE_COLS = ['#CDBB98', '#C3AB86', '#D2BF9A', '#C9AE8C', '#ABABA8', '#B6B6B1', '#A8ACAC', '#BAB6A6', '#C4B9A0', '#BBAE98', '#D0B07C', '#BE9C7E'] as const;

/**
 * One drystone block painted as a wash: glazes, a bloom of the lit colour toward the top, deeper pigment sunk
 * toward the underside, a lit top edge, grains, and broken ink only along the shaded (right and lower) edges.
 * `pts` is the flat outline in order, starting at the top left and going clockwise.
 */
function stoneBlock(ctx: CanvasRenderingContext2D, rnd: Rand, pts: number[], col: string, o: { shadow?: number; dark?: number } = {}): void {
  const poly = deform(pts, rnd, 1, 0.014);
  const b = bounds(poly);
  const shade = mix(darker(col, 0.55), '#4A3C5A', 0.15);
  const k = o.dark ?? 0;
  const base = k > 0 ? mix(col, '#5A4E5A', k) : col;
  // a thin shadow under the stone, on the one below
  if (o.shadow !== undefined) {
    ctx.fillStyle = 'rgba(34,24,38,0.28)';
    tracePoly(ctx, [b.x0 + 0.5, b.y1 - 0.4, b.x1 + 0.6, b.y1 - 0.4, b.x1 - 0.6, b.y1 + o.shadow, b.x0 + 1.4, b.y1 + o.shadow * 1.1]);
    ctx.fill();
  }
  ctx.fillStyle = rgba(base, 0.76);
  tracePoly(ctx, poly);
  ctx.fill();
  ctx.fillStyle = rgba(base, 0.24);
  tracePoly(ctx, deform(poly, rnd, 1, 0.02));
  ctx.fill();
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // lit toward the top, sinking into shade toward the underside and the right
  const g = ctx.createLinearGradient(b.x0, b.y0, b.x0 + b.w * 0.25, b.y1);
  g.addColorStop(0, rgba(lighter(base, 0.7), 0.42 * (1 - k)));
  g.addColorStop(0.35, rgba(lighter(base, 0.5), 0.08));
  g.addColorStop(0.7, rgba(shade, 0.06));
  g.addColorStop(1, rgba(shade, 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2);
  const sg = ctx.createLinearGradient(b.x0 + b.w * 0.55, 0, b.x1, 0);
  sg.addColorStop(0, rgba(shade, 0));
  sg.addColorStop(1, rgba(shade, 0.2));
  ctx.fillStyle = sg;
  ctx.fillRect(b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2);
  // a patch of a second colour bleeding in (iron stain, lichen bloom or a cooler vein)
  if (rnd.chance(0.55)) {
    const bl: number[] = [];
    const cx = b.x0 + b.w * rnd.range(0.2, 0.8);
    const cy = b.y0 + b.h * rnd.range(0.25, 0.8);
    const rr = Math.min(b.w * 0.3, b.h * 0.9);
    for (let i = 0; i < 8; i++) bl.push(cx + Math.cos(i * 0.785) * rr * rnd.range(0.8, 1.3), cy + Math.sin(i * 0.785) * rr * 0.6 * rnd.range(0.8, 1.2));
    feather(ctx, bl, rnd.pick(['#C9A878', '#9CA0A8', '#B58E72', '#A9B08A']), 0.5, rnd, 3, 1, 0.45, 0.12);
  }
  // pigment pooled inside the edge
  ctx.strokeStyle = rgba(shade, 0.16);
  ctx.lineWidth = 1.1;
  tracePoly(ctx, poly);
  ctx.stroke();
  speckle(ctx, rnd, b.x0, b.y0, b.w, b.h, Math.round(b.w * b.h * 0.5), shade, 0.26, '#FFF4DC', 0.3, 0.2);
  ctx.restore();
  // the lit top edge: a pale, broken stroke along the upper outline
  const n = poly.length / 2;
  const top: number[] = [];
  for (let i = 0; i < n; i++) if (poly[2 * i + 1]! < b.cy - b.h * 0.1 && (i < n * 0.35 || i > n * 0.9)) top.push(poly[2 * i]!, poly[2 * i + 1]! + 0.3);
  if (top.length >= 4) inkDashes(ctx, top, rnd, { closed: false, color: '#FFF6E0', alpha: 0.5, w: 0.55, dash: [3, 9], gap: [0.4, 1.6] });
  // broken ink only on the shaded edges: down the right side and along the underside
  const ink: number[] = [];
  const iR = Math.floor(n * 0.2);
  const iL = Math.floor(n * 0.75);
  for (let i = iR; i <= iL; i++) ink.push(poly[2 * i]!, poly[2 * i + 1]!);
  if (ink.length >= 4) inkDashes(ctx, ink, rnd, { closed: false, color: '#3A2A28', alpha: 0.62, w: 0.55, dash: [3, 9], gap: [0.5, 2.2] });
}

/** a low drystone wall segment with an upright coping, seen from the front; pivot = ground at the left end */
export function makeGardenWall(id: PlanId, q: number): Sprite {
  const w = WALL_STUB[id];
  const seed = id === 'minimum' ? 5501 : 5603;
  const rnd = new Rand(seed);
  const len = w.x1 - w.x0;
  const H = w.h;
  const { sp, ctx } = cpuSprite(len + 30, H + 34, 8, H + 12, q);
  const j2 = (a: number): number => rnd.range(-a, a);
  // the inner end (toward the middle of the garden) steps down like a broken stub; the outer end runs off the view
  const innerRight = id === 'minimum';
  const topAt = (x: number): number => {
    const d = innerRight ? len - x : x;
    const k = Math.max(0, Math.min(1, d / 40));
    return -H * (0.5 + 0.5 * Math.pow(k, 0.7)) + 1.5;
  };
  const wobble = Array.from({ length: 12 }, () => rnd.range(-1.1, 1.1));
  const copeZone = 7.4;
  const tgt = (x: number): number => topAt(x) + copeZone + wobble[Math.max(0, Math.min(11, Math.floor(x / (len / 11.99))))]!;
  // the dark packing and voids behind everything: stones are laid over it, and what they leave shows as black gaps
  const fill: number[] = [-3, 1.5];
  for (let x = 0; x <= len; x += 6) fill.push(x, topAt(x) + copeZone - 1);
  fill.push(len + 3, 1.5);
  ctx.fillStyle = '#463C48';
  tracePoly(ctx, fill);
  ctx.fill();
  // flat-bedded stones laid on a skyline: always start where the wall is lowest, never longer than the level run there,
  // so the courses wander, stones differ a lot in length and thickness, and gaps are pinned with small wedges
  const M = Math.ceil(len);
  const N = M + 3;
  const sky = new Float32Array(N).fill(0);
  let guard = 0;
  while (guard++ < 1500) {
    // start at the leftmost column that is (nearly) the lowest part of the wall that still needs building up
    let maxS = -1e9;
    for (let x = 0; x < M; x++) if (sky[x]! - tgt(x) > 1.1) maxS = Math.max(maxS, sky[x]!);
    if (maxS < -1e8) break;
    let xi = 0;
    while (xi < M && !(sky[xi]! - tgt(xi) > 1.1 && sky[xi]! >= maxS - 1.2)) xi++;
    // the level run starting here
    let run = 0;
    while (xi + run < M && sky[xi + run]! >= maxS - 3.6 && sky[xi + run]! - tgt(xi + run) > 1.1) run++;
    const r0 = rnd.next();
    let ww = r0 < 0.22 ? rnd.range(8, 13) : r0 < 0.65 ? rnd.range(14, 27) : rnd.range(27, 48);
    ww = Math.min(ww, run + 2.5);
    if (run < 5) ww = Math.max(4, run + 1);
    const x0 = xi;
    const x1 = Math.min(M, x0 + ww);
    // the stone rests on the highest point below it
    let base = 1e9;
    let maxTgt = -1e9;
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      base = Math.min(base, sky[x]!);
      maxTgt = Math.max(maxTgt, tgt(x));
    }
    let hh = Math.min(12.5, Math.max(3.8, ww * rnd.range(0.2, 0.55) + rnd.range(-0.8, 1.6)));
    let top = base - hh;
    if (top < maxTgt) {
      top = maxTgt;
      hh = base - top;
    }
    if (hh < 2.2) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) sky[x] = Math.min(sky[x]!, tgt(x) - 1);
      continue;
    }
    // small pinning stones wedged into any gap under this one
    {
      let gx = -1;
      for (let x = Math.floor(x0); x <= Math.ceil(x1) + 1; x++) {
        const gap = x <= Math.ceil(x1) ? sky[x]! - base : 0;
        if (gap > 1.9 && gx < 0) gx = x;
        if ((gap <= 1.9 || x > Math.ceil(x1)) && gx >= 0) {
          const gw = x - gx;
          if (gw >= 2.5 && rnd.chance(0.9)) {
            const wx0 = gx + 0.3;
            const wx1 = Math.min(x - 0.3, wx0 + rnd.range(3.5, 10));
            const yl = sky[Math.min(N - 1, Math.floor(wx0))]!;
            const yr = sky[Math.min(N - 1, Math.floor(wx1))]!;
            const pts = [wx0 + 0.6, base + 0.6, (wx0 + wx1) / 2, base + 0.2, wx1 - 0.5, base + 0.7, wx1, (base + yr) / 2, wx1 - 0.8, yr, (wx0 + wx1) / 2, Math.max(yl, yr) + 0.3, wx0 + 0.8, yl, wx0, (base + yl) / 2];
            stoneBlock(ctx, rnd, pts, rnd.pick(STONE_COLS), { dark: 0.28 });
          }
          gx = -1;
        }
      }
    }
    const l1 = rnd.range(0, Math.min(2.6, ww * 0.12));
    const l2 = rnd.range(0, Math.min(2.6, ww * 0.12));
    const sh = rnd.chance(0.07) ? 1 : 0; // a through-stone, standing a little proud of the face
    const bot = base + rnd.range(0, 0.7) + sh * 0.9;
    const tp = top - sh * 0.5;
    const xa = x0 + 0.3;
    const xb = x1 - 0.3;
    const pts = [
      xa + 1.4 + l1, tp + j2(0.4),
      (xa + xb) / 2 + j2(ww * 0.1), tp - rnd.range(0, 0.9) + j2(0.3),
      xb - 1.4 - l2, tp + j2(0.4),
      xb + j2(0.5), tp + Math.min(2.2, hh * 0.3),
      xb + j2(0.6) - l2 * 0.4, bot - 0.2,
      (xa + xb) / 2 + j2(ww * 0.1), bot + j2(0.4),
      xa + l1 * 0.5, bot - 0.1,
      xa + j2(0.5), tp + Math.min(2.0, hh * 0.3),
    ];
    const cool = rnd.chance(0.4);
    stoneBlock(ctx, rnd, pts, cool ? rnd.pick(STONE_COLS.slice(4, 8)) : rnd.pick(STONE_COLS), { shadow: 1.5 + sh * 2 });
    // lichen: a small scatter of pale rounded discs on some stones
    if (rnd.chance(0.28) && ww > 8) {
      const lx = x0 + ww * rnd.range(0.2, 0.75);
      const ly = top + hh * rnd.range(0.25, 0.6);
      const lc = rnd.pick(['#C7C98A', '#B7C07A', '#D8B56A', '#E3E0C2']);
      for (let i = 0, n = rnd.int(3, 6); i < n; i++) {
        ctx.fillStyle = rgba(lc, 0.55);
        ctx.beginPath();
        ctx.arc(lx + rnd.range(-2.6, 2.6), ly + rnd.range(-1, 1), rnd.range(0.5, 1.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) sky[x] = top - 0.3;
  }
  // the coping: stones set on edge, upright and slanted, along the top
  {
    let x = -rnd.range(0, 4);
    while (x < len + 3) {
      const cw = rnd.range(3.4, 7.6);
      const t0 = topAt(Math.min(len, Math.max(0, x + cw / 2)));
      const bot = t0 + copeZone + 0.8;
      const hc = rnd.range(6.2, 9.6);
      const tp = Math.max(t0 - 1.8, bot - hc - rnd.range(0, 1.2));
      const shear = rnd.range(-0.34, 0.34) * (bot - tp) * 0.5;
      const xa = Math.max(x, -4);
      const xb = Math.min(x + cw, len + 4);
      if (xb - xa > 1.8) {
        const pts = [
          xa + shear + j2(0.5), tp + 1.1 + j2(0.3),
          xa + shear + (xb - xa) * 0.45, tp - rnd.range(0, 0.8),
          xb + shear - 0.6, tp + 0.2 + j2(0.3),
          xb + shear + 0.1, tp + 1.8,
          xb + 0.2, bot - 0.6,
          (xa + xb) / 2, bot + 0.3,
          xa - 0.1, bot - 0.5,
          xa + shear * 0.5, (tp + bot) / 2,
        ];
        const col = rnd.pick(STONE_COLS);
        stoneBlock(ctx, rnd, pts, rnd.chance(0.5) ? lighter(col, 0.12) : col, { shadow: 0.8 });
      }
      x += cw - rnd.range(0, 1.3);
    }
  }
  // moss: on top of the coping, in the crevices and creeping up from the foot
  for (let i = 0; i < 34; i++) {
    const mx = rnd.range(0, len);
    const onTop = rnd.chance(0.55);
    const my = onTop ? topAt(mx) + rnd.range(-1, 3) : rnd.range(-H * 0.6, -1);
    const mp: number[] = [];
    const rr = rnd.range(2, onTop ? 7 : 4.5);
    for (let k = 0; k < 9; k++) mp.push(mx + Math.cos(k * 0.7) * rr * rnd.range(0.7, 1.2), my + Math.sin(k * 0.7) * rr * 0.4 * rnd.range(0.7, 1.2));
    feather(ctx, mp, rnd.pick(['#8FA050', '#A3B058', '#7C9040', '#B9A044', '#6F8C48']), onTop ? 0.55 : 0.42, rnd, 3, 1, 0.5, 0.16);
  }
  // the lower stones sink into shade, the right side darkens a little, the upper left catches the sun
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const sg = ctx.createLinearGradient(0, -H, 0, 0);
  sg.addColorStop(0, 'rgba(255,240,200,0.1)');
  sg.addColorStop(0.55, 'rgba(70,56,80,0)');
  sg.addColorStop(1, 'rgba(60,44,70,0.26)');
  ctx.fillStyle = sg;
  ctx.fillRect(-4, -H - 6, len + 12, H + 8);
  const dg = ctx.createLinearGradient(0, 0, len, 0);
  dg.addColorStop(0, 'rgba(255,238,190,0.08)');
  dg.addColorStop(1, 'rgba(60,44,70,0.12)');
  ctx.fillStyle = dg;
  ctx.fillRect(-4, -H - 6, len + 12, H + 8);
  ctx.restore();
  // grass and weeds at its foot and sprouting from the coping, a few tumbled stones and leaves
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62'];
  for (let x = -6; x < len + 6; x += rnd.range(4, 9)) grassTuft(ctx, x, rnd.range(0, 2.8), rnd.range(3, 8), rnd, 1, pal);
  for (let i = 0; i < 9; i++) {
    const gx = rnd.range(2, len - 2);
    grassTuft(ctx, gx, topAt(gx) + copeZone * 0.55, rnd.range(3, 6), rnd, 0.9, pal);
  }
  for (let i = 0; i < 5; i++) {
    const sx = rnd.range(4, len);
    const sw = rnd.range(5, 11);
    const sh2 = rnd.range(3, 5.4);
    const pts = [sx + 1, -sh2, sx + sw / 2, -sh2 - 0.6, sx + sw - 1, -sh2 + 0.2, sx + sw, -sh2 * 0.4, sx + sw - 1, 0.6, sx + sw / 2, 1, sx + 0.8, 0.5, sx, -sh2 * 0.5];
    stoneBlock(ctx, rnd, pts, rnd.pick(STONE_COLS), { shadow: 1.2 });
  }
  strew(ctx, rnd, 22, -4, len + 6, 0.4, 7, 0.5);
  shadowBehind(ctx, () => {
    softShadow(ctx, rnd, len * 0.5 + 4, 3.4, len * 0.54, 6, 0.2);
    softShadow(ctx, rnd, len * 0.5 + 8, 6, len * 0.5, 3, 0.12);
  });
  fin(sp, seed, q);
  return sp;
}

/** the leaf rake standing upright, pivot at the head's centre on the ground; the handle runs straight up (len units) */
export function makeRake(q: number, len = 64): Sprite {
  const rnd = new Rand(777);
  const { sp, ctx } = cpuSprite(44, len + 20, 22, len + 10, q);
  // handle: a long, tapering pole of pale ash with grain
  const hp = strokePoly([[0, -3], [0.2, -len * 0.5], [0.3, -len]], (t) => 2.7 - 0.4 * t);
  paintForm(ctx, hp, '#C49A68', rnd, { alpha: 0.97, layers: 3, light: '#F2D8A8', shade: '#6A4630', speck: 60, grain: 8, inkA: 0.55, inkW: 0.4, dash: [6, 20] });
  // a worn hand-grip band near the top
  ctx.fillStyle = rgba('#8A6440', 0.5);
  ctx.fillRect(-1.3, -len * 0.9, 2.8, 5);
  // head: a steel bow with a fan of flexible tines
  const bow = new Path2D();
  bow.moveTo(-14, 1.4);
  bow.quadraticCurveTo(-7, -4.8, 0, -5.4);
  bow.quadraticCurveTo(7, -4.8, 14, 1.4);
  ctx.strokeStyle = rgba('#5C6264', 0.95);
  ctx.lineWidth = 1.4;
  ctx.stroke(bow);
  ctx.strokeStyle = rgba('#C8CCC8', 0.5);
  ctx.lineWidth = 0.4;
  ctx.save();
  ctx.translate(-0.3, -0.5);
  ctx.stroke(bow);
  ctx.restore();
  for (let i = 0; i < 13; i++) {
    const f = i / 12;
    const x = -14 + f * 28;
    const yb = 1.4 - (1 - Math.abs(f - 0.5) * 2) * 5.2;
    ctx.strokeStyle = rgba('#6A7072', 0.95);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(x, yb + 0.6);
    ctx.quadraticCurveTo(x + (f - 0.5) * 3, yb + 5, x + (f - 0.5) * 4.6, 7.2 + rnd.range(-0.4, 0.5));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,236,232,0.42)';
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.moveTo(x - 0.25, yb + 0.6);
    ctx.quadraticCurveTo(x - 0.25 + (f - 0.5) * 3, yb + 5, x - 0.25 + (f - 0.5) * 4.6, 7);
    ctx.stroke();
  }
  // the collar that joins the pole to the bow
  ctx.fillStyle = rgba('#5C6264', 0.95);
  ctx.beginPath();
  ctx.ellipse(0.1, -5, 2.2, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  fin(sp, 777, q, 0.5);
  return sp;
}

/* ------------------------------------------------------------------ swaying grass */

export function makeTuft(seed: number, q: number, h: number): Sprite {
  const rnd = new Rand(seed);
  const { sp, ctx } = cpuSprite(h * 1.4 + 6, h + 4, (h * 1.4 + 6) / 2, h + 2, q);
  const pal = ['#B2B455', '#8E9C42', '#C9B65A', '#A6A64A', '#D6BA62', '#7E9444'];
  grassTuft(ctx, -h * 0.25, 0, h, rnd, 1.1, pal);
  grassTuft(ctx, h * 0.18, 0.4, h * 0.85, rnd, 1.1, pal);
  grassTuft(ctx, 0, 0.8, h * 0.7, rnd, 1.1, pal);
  return sp;
}

/** the spots where a pot, a pile and the bench live, for the depth sorting */
export const BENCH_SORT_Y = (id: PlanId): number => BENCH[id].y - 6;
export const PILE_SORT_Y = (id: PlanId): number => PILE[id].y - 6;
void RAKE_LEAN;
void mix;
void smoothPoly;
void darker;
