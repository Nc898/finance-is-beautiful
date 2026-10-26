/**
 * Painted sprites for the moving parts of the scene, built once per size: the snowball bodies (three levels of
 * detail per debt, so the ink contour keeps its weight as a ball shrinks), the soft shadows, snowflakes, powder
 * lumps, snow clumps, the mound a cleared debt leaves and its flag cloth, the wooden sledge.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { feather, inkDashes, mix, paintForm, speckle, TO_LIGHT } from '../../river/scene/boatInk';
import { dryBrush } from '../../vine/scene/cottageWash';
import type { DebtId } from '../types';
import { SLEDGE_SEAT_H } from './climberDims';

export interface Spr {
  cv: HTMLCanvasElement;
  /** half the sprite's extent in world units (a square sprite centred on the ball) */
  half: number;
  /** the radius the sprite was painted for */
  r0: number;
}

const INK = '#2f3556';

/** a snowball: lumpy outline, a lit paper-white side toward the upper left, blue-violet shade, a broken ink contour */
export function makeBody(seed: number, R0: number, q: number, inkW: number): Spr {
  const rnd = new Rand(seed);
  const pad = 2.5 + R0 * 0.06;
  const half = R0 + pad;
  const px = Math.ceil(2 * half * q);
  const cv = makeCanvas(px, px);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, (px / 2), (px / 2));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const n = 36;
  const ph = [rnd.range(0, 6.28), rnd.range(0, 6.28), rnd.range(0, 6.28), rnd.range(0, 6.28)];
  const poly: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // packed by hand: a lumpy round, never a drawn circle
    const rr = R0 * (1 + 0.034 * Math.sin(3 * a + ph[0]!) + 0.028 * Math.sin(5 * a + ph[1]!) + 0.018 * Math.sin(8 * a + ph[2]!) + 0.012 * Math.sin(13 * a + ph[3]!));
    poly.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const body = deform(poly, rnd, 2, 0.012);
  const lx = -TO_LIGHT[0];
  const ly = -TO_LIGHT[1];
  const shift = (p: number[], dx: number, dy: number) => p.map((v, i) => v + (i % 2 ? dy : dx));
  // underpaint: warm paper white
  ctx.fillStyle = rgba('#fffdf6', 0.98);
  tracePoly(ctx, body);
  ctx.fill();
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  // the shade, laid wet: a broad blue-violet wash toward the lower right, a deeper one under it, pooled at its edge
  feather(ctx, shift(body, lx * R0 * 0.3, ly * R0 * 0.36), '#9aa3d8', 0.74, rnd, 20, 1.0, 0.36, 0.05);
  feather(ctx, shift(body, lx * R0 * 0.46, ly * R0 * 0.52), '#6a72b8', 0.6, rnd, 16, 0.86, 0.28, 0.06);
  // the shade as a wash with an edge: a flat transparent glaze over the shaded side, its pigment pooled where it
  // dried along the turn of the form (the watercolor's own line, not an airbrushed fade)
  const shadeShape = deform(shift(body, lx * R0 * 0.5, ly * R0 * 0.56), rnd, 3, 0.05);
  ctx.fillStyle = rgba('#7c84c4', 0.2);
  for (let i = 0; i < 2; i++) {
    tracePoly(ctx, i ? deform(shadeShape, rnd, 2, 0.02) : shadeShape);
    ctx.fill();
  }
  ctx.strokeStyle = rgba('#5a62a8', 0.2);
  ctx.lineWidth = R0 * 0.035;
  tracePoly(ctx, shadeShape);
  ctx.stroke();
  // reflected light from the snow below: a pale cool lift along the lower rim
  ctx.strokeStyle = rgba('#d3dcf4', 0.5);
  ctx.lineWidth = R0 * 0.16;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 1.04, 0.2, 1.75);
  ctx.stroke();
  ctx.strokeStyle = rgba('#e7edfb', 0.4);
  ctx.lineWidth = R0 * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.95, 0.3, 1.6);
  ctx.stroke();
  // the lit side lifted back to paper, a warm cream bloom toward the sun
  feather(ctx, shift(body, -lx * R0 * 0.22, -ly * R0 * 0.24), '#ffffff', 0.92, rnd, 16, 0.82, 0.3, 0.05);
  feather(ctx, shift(body, -lx * R0 * 0.3, -ly * R0 * 0.34), '#fff4d8', 0.6, rnd, 12, 0.55, 0.2, 0.06);
  // pigment pooled just inside the edge on the shaded side
  ctx.strokeStyle = rgba('#5a62a8', 0.16);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = R0 * (0.02 + i * 0.026);
    ctx.beginPath();
    ctx.arc(0, 0, R0 * (1 - 0.01 * i), -0.3, 2.1);
    ctx.stroke();
  }
  // pencil hatching across the turn from light to shade, following the form
  ctx.lineWidth = inkW * 0.55;
  for (let k = 0; k < 22; k++) {
    const a0 = rnd.range(0.1, 2.1);
    const rr = R0 * rnd.range(0.5, 0.97);
    ctx.strokeStyle = rgba('#4a5290', rnd.range(0.14, 0.3));
    ctx.beginPath();
    ctx.arc(0, 0, rr, a0, a0 + rnd.range(0.12, 0.3));
    ctx.stroke();
  }
  // grains: darker packed snow in the shade, a few lifted flecks in the light
  speckle(ctx, rnd, -R0, -R0, R0 * 2, R0 * 2, Math.round(R0 * R0 * 0.35), '#4b5390', 0.22, '#ffffff', 0.5, Math.max(0.12, R0 * 0.007));
  ctx.restore();
  // the contour: broken ink, heavier away from the light
  inkDashes(ctx, body, rnd, { color: INK, alpha: 0.7, w: inkW, dash: [R0 * 0.35, R0 * 1.0], gap: [R0 * 0.03, R0 * 0.14], center: [0, 0], bias: 0.7 });
  return { cv, half, r0: R0 };
}

/** a soft elliptical shadow, blue-violet (a snow shadow), dark at the core */
export function makeShadow(): HTMLCanvasElement {
  const cv = makeCanvas(160, 56);
  const c = cv.getContext('2d')!;
  c.translate(80, 28);
  c.scale(80 / 28, 1);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 28);
  g.addColorStop(0, 'rgba(66,74,150,0.5)');
  g.addColorStop(0.45, 'rgba(76,84,160,0.3)');
  g.addColorStop(1, 'rgba(90,98,170,0)');
  c.fillStyle = g;
  c.fillRect(-28, -28, 56, 56);
  return cv;
}

/** a soft snowflake: a white heart, a faint cool ring (so it reads against pale sky) */
export function makeFlake(): HTMLCanvasElement {
  const cv = makeCanvas(48, 48);
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(240,243,253,0.4)');
  g.addColorStop(0.8, 'rgba(160,172,216,0.1)');
  g.addColorStop(1, 'rgba(160,172,216,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 48, 48);
  return cv;
}

/** a small lump of fresh powder: white, a violet shade under its lower right */
export function makePowder(): HTMLCanvasElement {
  const cv = makeCanvas(64, 48);
  const c = cv.getContext('2d')!;
  const rnd = new Rand(77);
  const lump = (cx: number, cy: number, rx: number, ry: number, col: string, a: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      const j = 1 + rnd.range(-0.12, 0.12);
      pts.push(cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j);
    }
    c.fillStyle = rgba(col, a);
    tracePoly(c, pts);
    c.fill();
  };
  lump(34, 28, 22, 13, '#7f88c8', 0.4);
  lump(33, 26, 21, 12, '#aab4e0', 0.5);
  lump(30, 22, 20, 11.5, '#ffffff', 0.97);
  lump(24, 18, 9, 5, '#fff6e0', 0.6);
  return cv;
}

/** snow clumps (a broken-off chunk, packed): a few angular lobes, white above, a violet-grey shade on the lower right, grains */
export function makeClumps(q: number): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let k = 0; k < 6; k++) {
    const rnd = new Rand(900 + k * 13);
    const S = Math.ceil(10 * q);
    const cv = makeCanvas(S, S);
    const c = cv.getContext('2d')!;
    c.setTransform(q, 0, 0, q, S / 2, S / 2);
    c.lineJoin = 'round';
    const lobe = (r: number, dx: number, dy: number) => {
      const pts: number[] = [];
      const m = 7 + rnd.int(0, 2);
      for (let i = 0; i < m; i++) {
        const t = (i / m) * Math.PI * 2 + rnd.range(-0.15, 0.15);
        const j = 1 + rnd.range(-0.28, 0.2);
        pts.push(dx + Math.cos(t) * r * j, dy + Math.sin(t) * r * 0.82 * j);
      }
      return pts;
    };
    const lobes = [lobe(2.7, 0, 0.2), lobe(1.9, -1.5, -0.3), lobe(1.7, 1.5, 0.6), lobe(1.4, 0.2, -1.2)];
    // the shade first, offset to the lower right and softer
    for (const l of lobes) {
      c.fillStyle = rgba('#7d86c8', 0.34);
      tracePoly(c, l.map((v, i) => (i % 2 ? v + 0.7 : v + 0.55)));
      c.fill();
    }
    for (const l of lobes) {
      c.fillStyle = rgba('#fbfbff', 0.97);
      tracePoly(c, l);
      c.fill();
    }
    // the lit tops
    c.fillStyle = rgba('#ffffff', 0.9);
    tracePoly(c, lobe(1.5, -1.0, -0.8));
    c.fill();
    // the underside, in shade
    c.fillStyle = rgba('#a9b2e0', 0.5);
    tracePoly(c, lobe(1.9, 1.1, 1.0));
    c.fill();
    speckle(c, rnd, -3, -2.6, 6, 5.6, 7, '#4f5792', 0.5, null, 0, 0.13);
    out.push(cv);
  }
  return out;
}

/** the mound a cleared debt leaves at the foot of its lane: packed snow, lit at the upper left, a violet shade */
export function makeMound(q: number): { cv: HTMLCanvasElement; w: number; h: number; px: number; py: number } {
  const w = 30;
  const h = 18;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2;
  const py = h - 3;
  c.setTransform(q, 0, 0, q, px * q, py * q);
  const rnd = new Rand(4242);
  const poly: number[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    poly.push(Math.cos(a) * 11.5 * (1 + rnd.range(-0.05, 0.05)), Math.sin(a) * 8 * (1 + rnd.range(-0.08, 0.08)) + 0.8);
  }
  poly.push(11, 2.2, 5, 3.2, -4, 3.4, -11, 2.4);
  c.fillStyle = rgba('#7a84c4', 0.4);
  tracePoly(c, poly.map((v, i) => (i % 2 ? v + 1.3 : v + 1.6)));
  c.fill();
  paintForm(c, poly, '#f6f8ff', rnd, { light: '#ffffff', shade: '#7a84c4', alpha: 0.98, ink: INK, inkA: 0.6, inkW: 0.42, speck: 60, shadeA: 0.3, lightA: 0.2 });
  return { cv, w, h, px, py };
}

/** a pennant in a hill's colour (swallow-tail), painted as a wash with darker folds and a pooled edge */
export function makeFlagCloth(color: string, q: number): HTMLCanvasElement {
  const W = 16;
  const H = 9;
  const cv = makeCanvas(W * q, H * q);
  const c = cv.getContext('2d')!;
  c.setTransform(q, 0, 0, q, 0, 0);
  const rnd = new Rand(color.charCodeAt(1) * 31 + color.charCodeAt(2));
  const poly = [0.3, 0.8, 5, 0.3, 10, 0.9, 15.4, 0.6, 12, 4.4, 15.4, 8.2, 10, 8.4, 5, 7.9, 0.3, 8.1];
  c.fillStyle = rgba(color, 0.62);
  tracePoly(c, deform(poly, rnd, 1, 0.012));
  c.fill();
  c.fillStyle = rgba(color, 0.32);
  tracePoly(c, deform(poly, rnd, 2, 0.02));
  c.fill();
  c.fillStyle = rgba(mix(color, '#1c1c3c', 0.5), 0.3);
  for (let i = 0; i < 3; i++) {
    const x = 3 + i * 4.2;
    c.beginPath();
    c.moveTo(x, 0.6);
    c.quadraticCurveTo(x + 0.9, 4.2, x + 0.1, 8.2);
    c.lineTo(x + 1.8, 8.1);
    c.quadraticCurveTo(x + 2.4, 4.2, x + 1.6, 0.6);
    c.fill();
  }
  c.fillStyle = rgba('#ffffff', 0.25);
  c.beginPath();
  c.ellipse(4, 2, 3.4, 0.9, 0.05, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = rgba(mix(color, '#14142c', 0.55), 0.55);
  c.lineWidth = 0.28;
  tracePoly(c, poly);
  c.stroke();
  void speckle;
  return cv;
}

/** the wooden sledge: runners curled up at the outer end, planks, cross-bars and a rope, ink and wash; pivot at the base centre */
export function makeSledge(mirror: boolean, q: number): { cv: HTMLCanvasElement; w: number; h: number; px: number; py: number } {
  const w = 74;
  const h = 40;
  const cv = makeCanvas(w * q, h * q);
  const c = cv.getContext('2d')!;
  const px = w / 2;
  const py = h - 8;
  c.setTransform(q, 0, 0, q, px * q, py * q);
  if (mirror) c.scale(-1, 1);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const rnd = new Rand(mirror ? 511 : 509);
  const seat = SLEDGE_SEAT_H;
  // cast shadow on the snow to the lower right
  c.fillStyle = rgba('#6a74b8', 0.3);
  c.beginPath();
  c.ellipse(5, 4.2, 31, 4.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgba('#505aa0', 0.22);
  c.beginPath();
  c.ellipse(2, 3, 24, 2.6, 0, 0, Math.PI * 2);
  c.fill();
  // the runners: two long rails curling up at the left end (the far one a little shorter, behind)
  const runner = (y: number, th: number, a: number, len: number) => {
    const pts: number[] = [];
    const m = 14;
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const x = -len / 2 + len * t;
      const curl = t < 0.22 ? Math.pow(1 - t / 0.22, 2.2) * 7 : 0;
      pts.push(x, y - curl);
    }
    const poly: number[] = [];
    for (let i = 0; i <= m; i++) poly.push(pts[2 * i]!, pts[2 * i + 1]! - th / 2);
    for (let i = m; i >= 0; i--) poly.push(pts[2 * i]!, pts[2 * i + 1]! + th / 2);
    paintForm(c, poly, '#6e5440', rnd, { light: '#a8896a', shade: '#2e2224', alpha: a, ink: '#241a1a', inkA: 0.65, inkW: 0.4, speck: 14, grain: 0 });
  };
  runner(-3.4, 2.1, 0.86, 54);
  // cross-bars standing the planks on the runners
  for (const x of [-18, 0, 18]) {
    paintForm(c, [x - 1.5, -3, x + 1.5, -3, x + 1.3, -seat + 2.2, x - 1.3, -seat + 2.2], '#7a5e46', rnd, { shade: '#2e2224', alpha: 0.9, inkW: 0.35, inkA: 0.55, speck: 4 });
  }
  runner(2.6, 2.4, 0.95, 60);
  // the planks of the seat, seen from above and a little in front
  const cols = ['#b49270', '#a6845f', '#bc9b78', '#9c7b58', '#b08e6a'];
  for (let i = 0; i < 5; i++) {
    const x0 = -26 + i * 10.6;
    const poly = [x0, -seat - 1.2, x0 + 10, -seat - 1.2, x0 + 10.4, -seat + 3.8, x0 + 0.4, -seat + 3.8];
    paintForm(c, poly, cols[i]!, rnd, { light: '#e2c8a4', shade: '#3c2a2a', alpha: 0.94, ink: '#241a1a', inkA: 0.6, inkW: 0.38, speck: 10, grain: 2 });
  }
  // snow lying in the lee of the planks, and along the rear edge
  c.fillStyle = rgba('#8a90cc', 0.3);
  c.beginPath();
  c.ellipse(5, -seat - 0.6, 26, 1.3, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 4; i++) {
    const x = -22 + i * 14 + rnd.range(-3, 3);
    c.fillStyle = rgba('#8a90cc', 0.32);
    c.beginPath();
    c.ellipse(x + 0.6, -seat - 0.4, 5.4, 1.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(253,253,255,0.96)';
    c.beginPath();
    c.ellipse(x, -seat - 1.2, 5.2, 1.7, 0.03, 0, Math.PI * 2);
    c.fill();
  }
  // the rope, from the curled end looped back along the runner
  c.strokeStyle = rgba('#b19a6a', 0.9);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-27.5, -9.5);
  c.bezierCurveTo(-36, -9, -37, -2, -31, 1.4);
  c.stroke();
  c.strokeStyle = rgba('#5a4a30', 0.5);
  c.lineWidth = 0.3;
  c.setLineDash([1.2, 1]);
  c.stroke();
  c.setLineDash([]);
  dryBrush(c, [-26, -seat + 3.9, -10, -seat + 4.1, 6, -seat + 4, 24, -seat + 3.9], 0.5, '#3c2a2a', 0.3, rnd, 0.4);
  return { cv, w, h, px, py };
}

export const DEBT_SEED: Record<DebtId, number> = { medical: 11, car: 23, card: 37 };
