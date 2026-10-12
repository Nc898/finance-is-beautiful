/**
 * Painted sprites for the rowboats and rowers, made once per size. Everything is in boat-local units:
 * origin at the waterline amidships, +x toward the stern (bow points upstream = left), +y down.
 *
 *   hullBack / hullFront  – interior + far gunwale (behind the rower) and the clinker near side (in front)
 *   emblem                – a coin jar / strongbox / potted sapling, part of hullBack
 *   rower parts           – torso, head (straw hat, scarf in the boat colour), scarf tails, arms, legs
 *   oar                   – handle at x = 0, blade at the far end, painted in the boat colour
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { BoatId } from '../types';
import { flat, grain, inkLine, paintShape, smoothPoly, wash, type Pt } from './ink';

export const BOAT_COLORS: Record<BoatId, { hull: string; light: string; dark: string; scarf: string }> = {
  cash: { hull: '#E9694E', light: '#F59A7E', dark: '#B8452F', scarf: '#E9694E' },
  savings: { hull: '#E3A82A', light: '#F5CD6A', dark: '#B57F18', scarf: '#E3A82A' },
  invest: { hull: '#1E7F5C', light: '#4DA683', dark: '#125741', scarf: '#1E7F5C' },
};

/** geometry shared with the animation */
export const HULL = { bow: -60, stern: 59.5 };
export const gun = (x: number): number => {
  const s = x / 60;
  return -7.3 - (s < 0 ? 8.2 : 6.4) * Math.pow(Math.abs(s), 2.4);
};
export const keel = (x: number): number => {
  const s = x / 60;
  return 11 - (s < 0 ? 12.6 : 12.0) * Math.pow(Math.abs(s), 2.1);
};
export const farGun = (x: number): number => gun(x) - 7.4 * (1 - Math.pow(Math.min(1, Math.abs(x / 60)), 5));

/** extent of the sprite canvases in boat units */
export const SPR = { x0: -74, x1: 74, y0: -64, y1: 30 };

export interface Part {
  cv: HTMLCanvasElement;
  /** pivot position inside the canvas, in units; size in units */
  px: number;
  py: number;
  w: number;
  h: number;
}

export interface BoatSet {
  q: number;
  hullBack: HTMLCanvasElement;
  hullFront: HTMLCanvasElement;
  oar: Part;
}

export interface RowerSet {
  q: number;
  torso: Part;
  head: Record<BoatId, Part>;
  tails: Record<BoatId, Part>;
  upper: Part;
  fore: Part;
  thigh: Part;
  shin: Part;
  upperFar: Part;
  foreFar: Part;
  oars: Record<BoatId, Part>;
  hullBack: Record<BoatId, HTMLCanvasElement>;
  hullFront: Record<BoatId, HTMLCanvasElement>;
}

const part = (w: number, h: number, px: number, py: number, q: number, paint: (ctx: CanvasRenderingContext2D) => void): Part => {
  const cv = makeCanvas(w * q, h * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, px * q, py * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx);
  return { cv, px, py, w, h };
};

const darken = (src: Part, a: number): Part => {
  const cv = makeCanvas(src.cv.width, src.cv.height);
  const c = cv.getContext('2d')!;
  c.drawImage(src.cv, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(52,44,70,${a})`;
  c.fillRect(0, 0, cv.width, cv.height);
  return { ...src, cv };
};

/** capsule outline along +x from (0,0) to (len,0), tapered from w0 to w1, slightly bowed */
function limbPoly(len: number, w0: number, w1: number, bow = 0): number[] {
  const pts: Pt[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.92 + 0.12 * Math.sin(Math.PI * t));
    pts.push([len * t, -w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([len + w1 * 0.45, 0]);
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.92 + 0.12 * Math.sin(Math.PI * t));
    pts.push([len * t, w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([-w0 * 0.45, 0]);
  return smoothPoly(pts, 3, true);
}

/* ---------------------------------------------------------------- hull */

function paintHullBack(id: BoatId, q: number): HTMLCanvasElement {
  const W = SPR.x1 - SPR.x0;
  const H = SPR.y1 - SPR.y0;
  const cv = makeCanvas(W * q, H * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -SPR.x0 * q, -SPR.y0 * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rnd = new Rand(210 + id.length * 17);
  // interior: the lens between the far and near gunwales
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = HULL.bow + 1; x <= HULL.stern - 1; x += 3) {
    top.push([x, farGun(x)]);
    bot.push([x, gun(x) + 1]);
  }
  const lens = flat([...top, ...bot.reverse()]);
  ctx.save();
  tracePoly(ctx, lens);
  ctx.clip();
  const g = ctx.createLinearGradient(0, -16, 0, -6);
  g.addColorStop(0, '#B8936A');
  g.addColorStop(0.45, '#9B7650');
  g.addColorStop(1, '#6E5038');
  ctx.fillStyle = g;
  ctx.fillRect(-64, -20, 128, 20);
  // ribs across the interior
  ctx.strokeStyle = 'rgba(58,40,28,0.5)';
  ctx.lineWidth = 0.7;
  for (let x = -48; x <= 50; x += 9.5) {
    ctx.beginPath();
    ctx.moveTo(x, farGun(x) - 0.5);
    ctx.quadraticCurveTo(x + 1.2, (farGun(x) + gun(x)) / 2, x - 0.6, gun(x) + 1.5);
    ctx.stroke();
  }
  // thwart (rowing seat): a plank across the boat at the rower
  ctx.fillStyle = '#C4A074';
  ctx.beginPath();
  ctx.moveTo(-3, gun(-3) - 0.5);
  ctx.lineTo(10, gun(10) - 0.5);
  ctx.lineTo(11.5, farGun(11.5) + 2.2);
  ctx.lineTo(-1.5, farGun(-1.5) + 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(48,34,26,0.6)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // the shadow the near gunwale throws inside
  const sh = ctx.createLinearGradient(0, -15, 0, -5);
  sh.addColorStop(0, 'rgba(40,26,20,0)');
  sh.addColorStop(1, 'rgba(40,26,20,0.38)');
  ctx.fillStyle = sh;
  ctx.fillRect(-64, -16, 128, 12);
  grain(ctx, rnd, -58, -16, 116, 10, 10, '#3E2C20', 0.3, 0.35);
  ctx.restore();
  // far gunwale rail: a slim lighter strip
  const rail: number[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 3) rail.push(x, farGun(x) - 0.6);
  for (let x = HULL.stern; x >= HULL.bow; x -= 3) rail.push(x, farGun(x) + 1.5);
  paintShape(ctx, rail, '#D2AE80', rnd, { shade: '#6B4A30', light: '#FFF2D0', alpha: 0.9, layers: 2, inkW: 0.45, dash: [14, 2, 6, 2] });
  inkLine(ctx, flat(top), 1, { alpha: 0.55, width: 0.45, closed: false, dash: [18, 2, 8, 2] });
  // stem and the little stern knee on the far side
  ctx.strokeStyle = 'rgba(48,34,26,0.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-60, -15.4);
  ctx.quadraticCurveTo(-58.8, -13, -57.6, -9);
  ctx.stroke();
  // a coil of rope in the stern
  ctx.strokeStyle = 'rgba(214,190,140,0.95)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.ellipse(46, -11.2 - 0.3 * k, 4.2 - k * 0.5, 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(86,64,40,0.5)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.ellipse(46, -11.2, 3.8, 1.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  // the emblem, on the bow thwart
  paintEmblem(ctx, id, rnd);
  return cv;
}

/** a small emblem so identity is never colour alone */
function paintEmblem(ctx: CanvasRenderingContext2D, id: BoatId, rnd: Rand): void {
  ctx.save();
  ctx.translate(-34, -10.5);
  if (id === 'cash') {
    // a glass jar of coins with a tin lid
    const jar: Pt[] = [
      [-6, -15],
      [6, -15],
      [7, -12],
      [7.2, -2],
      [6.4, 0.4],
      [-6.4, 0.4],
      [-7.2, -2],
      [-7, -12],
    ];
    const poly = smoothPoly(jar, 3, true);
    // glass
    ctx.fillStyle = 'rgba(214,236,238,0.78)';
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // coins stacked and heaped
    const coins: Array<[number, number, number]> = [];
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 3; k++) coins.push([-4.4 + k * 4.4 + (row % 2) * 1.2, -1.6 - row * 2.1, row]);
    }
    for (const [cx, cy, r] of coins) {
      const col = r % 2 ? '#F2C24A' : '#E6A93A';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 3.1, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(112,72,22,0.75)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,244,196,0.8)';
      ctx.beginPath();
      ctx.ellipse(cx - 0.8, cy - 0.35, 1.1, 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // glass highlight
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-5.4, -13.5, 1.1, 10.5);
    ctx.fillStyle = 'rgba(40,90,110,0.18)';
    ctx.fillRect(3.6, -14, 3.6, 14);
    ctx.restore();
    inkLine(ctx, poly, 1, { alpha: 0.6, width: 0.45, dash: [10, 1.5, 4, 1.5] });
    // lid
    paintShape(ctx, flat([[-7.4, -18.2], [7.4, -18.2], [7.8, -15], [-7.8, -15]]), '#C9B58A', rnd, { shade: '#5A4630', light: '#FFF6DA', alpha: 0.9, layers: 2, inkW: 0.45 });
    ctx.strokeStyle = 'rgba(80,60,36,0.6)';
    ctx.lineWidth = 0.35;
    for (let x = -6; x <= 6; x += 2.4) {
      ctx.beginPath();
      ctx.moveTo(x, -18);
      ctx.lineTo(x, -15.2);
      ctx.stroke();
    }
  } else if (id === 'savings') {
    // a small strongbox: arched lid, iron bands, brass lock
    const body = flat([[-10.5, -11], [10.5, -11], [10.8, 0.4], [-10.8, 0.4]]);
    paintShape(ctx, body, '#8A5A36', rnd, { shade: '#2E1E14', light: '#E0B488', alpha: 0.95, layers: 3, inkW: 0.5 });
    grain(ctx, rnd, -10, -11, 20, 11, 6, '#3A2616', 0.4, 0.3);
    const lid: Pt[] = [
      [-10.8, -11],
      [-9.4, -15],
      [0, -17],
      [9.4, -15],
      [10.8, -11],
    ];
    paintShape(ctx, smoothPoly(lid, 4, true), '#9A6842', rnd, { shade: '#2E1E14', light: '#F0C898', alpha: 0.95, layers: 3, inkW: 0.5 });
    // iron straps
    ctx.fillStyle = 'rgba(58,62,70,0.92)';
    for (const x of [-7.4, 7.4]) {
      ctx.fillRect(x - 1, -16, 2, 16.4);
      ctx.fillStyle = 'rgba(190,196,204,0.5)';
      ctx.fillRect(x - 1, -16, 0.5, 16.4);
      ctx.fillStyle = 'rgba(58,62,70,0.92)';
    }
    ctx.fillRect(-10.8, -11.8, 21.6, 1.3);
    // brass lock plate
    paintShape(ctx, flat([[-2.4, -10.4], [2.4, -10.4], [2.4, -5.6], [0, -4.4], [-2.4, -5.6]]), '#E3B441', rnd, { shade: '#6B4A12', light: '#FFF2B8', alpha: 0.95, layers: 2, inkW: 0.4 });
    ctx.fillStyle = 'rgba(40,28,14,0.85)';
    ctx.beginPath();
    ctx.arc(0, -8.2, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-0.25, -8.2, 0.5, 2);
    // handle
    ctx.strokeStyle = 'rgba(58,62,70,0.9)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -17, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    // a sapling in a terracotta pot
    // stem
    const stem = new Path2D();
    stem.moveTo(0, -8);
    stem.bezierCurveTo(-0.6, -14, 1.2, -20, 0.4, -27);
    ctx.strokeStyle = '#6B4A2F';
    ctx.lineWidth = 1.5;
    ctx.stroke(stem);
    ctx.strokeStyle = 'rgba(160,126,84,0.8)';
    ctx.lineWidth = 0.5;
    ctx.save();
    ctx.translate(-0.4, 0);
    ctx.stroke(stem);
    ctx.restore();
    const leaf = (x: number, y: number, ang: number, len: number, c1: string, c2: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const p = flat([[0, 0], [len * 0.3, -len * 0.26], [len * 0.7, -len * 0.22], [len, 0], [len * 0.7, len * 0.2], [len * 0.3, len * 0.24]]);
      const sp = smoothPoly([[0, 0], [len * 0.3, -len * 0.27], [len * 0.72, -len * 0.22], [len, 0], [len * 0.72, len * 0.2], [len * 0.3, len * 0.25]], 4, true);
      void p;
      paintShape(ctx, sp, c1, rnd, { shade: c2, light: '#E6F5A8', alpha: 0.95, layers: 2, inkW: 0.4, ink: '#1F3A22', inkAlpha: 0.55, dash: [6, 1, 3, 1] });
      ctx.strokeStyle = 'rgba(30,70,40,0.55)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len * 0.85, 0);
      ctx.stroke();
      ctx.restore();
    };
    leaf(0, -12, -2.7, 8, '#6DB04A', '#1E5A36');
    leaf(0.2, -15.5, -0.5, 8.6, '#58A03F', '#1E5A36');
    leaf(0.1, -19, -2.5, 8, '#8CC455', '#2A6A3A');
    leaf(0.4, -22, -0.7, 8.2, '#6DB04A', '#1E5A36');
    leaf(0.4, -27, -1.9, 7.4, '#A6D46A', '#2A6A3A');
    leaf(0.4, -27, -1.15, 7.4, '#8CC455', '#2A6A3A');
    // pot
    const pot = flat([[-6.6, -9.4], [6.6, -9.4], [5.2, 0.4], [-5.2, 0.4]]);
    paintShape(ctx, pot, '#C9663F', rnd, { shade: '#5A2A18', light: '#F2B58A', alpha: 0.95, layers: 3, inkW: 0.5 });
    paintShape(ctx, flat([[-7.4, -11.6], [7.4, -11.6], [7.2, -9], [-7.2, -9]]), '#D8764C', rnd, { shade: '#5A2A18', light: '#FFD2A8', alpha: 0.95, layers: 2, inkW: 0.5 });
    // soil
    ctx.fillStyle = 'rgba(70,46,30,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -11.4, 6.2, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintHullFront(id: BoatId, q: number): HTMLCanvasElement {
  const W = SPR.x1 - SPR.x0;
  const H = SPR.y1 - SPR.y0;
  const cv = makeCanvas(W * q, H * q);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, -SPR.x0 * q, -SPR.y0 * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const col = BOAT_COLORS[id];
  const rnd = new Rand(310 + id.length * 29);
  // work on a layer so the underwater part can be faded to the water
  const layer = makeCanvas(cv.width, cv.height);
  const lc = layer.getContext('2d')!;
  lc.setTransform(q, 0, 0, q, -SPR.x0 * q, -SPR.y0 * q);
  lc.lineJoin = 'round';
  lc.lineCap = 'round';

  // near-side outline: gunwale (bow to stern), transom, keel (stern to bow), stem
  const outline: Pt[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 3) outline.push([x, gun(x)]);
  outline.push([HULL.stern, gun(HULL.stern)]);
  for (let x = HULL.stern; x >= HULL.bow; x -= 3) outline.push([x, keel(x)]);
  const hull = flat(outline);

  // 1. painted planking: three strakes, each its own wash, lapped
  const strakes = [0, 0.2, 0.42, 0.7, 1.0];
  const band = (f0: number, f1: number): number[] => {
    const p: Pt[] = [];
    for (let x = HULL.bow; x <= HULL.stern; x += 3) p.push([x, gun(x) + (keel(x) - gun(x)) * f0]);
    for (let x = HULL.stern; x >= HULL.bow; x -= 3) p.push([x, gun(x) + (keel(x) - gun(x)) * f1]);
    return flat(p);
  };
  lc.save();
  tracePoly(lc, hull);
  lc.clip();
  for (let i = 0; i < strakes.length - 1; i++) {
    const b = band(strakes[i]!, strakes[i + 1]! + 0.02);
    // lighter on top, a little deeper lower down
    const tone = i === 0 ? col.light : i === 1 ? col.hull : i === 2 ? col.hull : col.dark;
    lc.fillStyle = rgba(tone, i === 0 ? 0.92 : 0.95);
    tracePoly(lc, b);
    lc.fill();
    wash(lc, b, col.dark, 0.07, rnd, 2, 0.01, 2);
    // soft light from the upper left along each plank
    const g = lc.createLinearGradient(-60, 0, 60, 0);
    g.addColorStop(0, 'rgba(255,246,220,0.3)');
    g.addColorStop(0.5, 'rgba(255,246,220,0)');
    g.addColorStop(1, 'rgba(30,20,20,0.2)');
    lc.fillStyle = g;
    tracePoly(lc, b);
    lc.fill();
    // the lap: a highlight on the upper edge, a dark shadow line under the plank above
    if (i > 0) {
      const edge: number[] = [];
      for (let x = HULL.bow; x <= HULL.stern; x += 3) edge.push(x, gun(x) + (keel(x) - gun(x)) * strakes[i]!);
      lc.setLineDash([]);
      lc.strokeStyle = rgba(col.dark, 0.5);
      lc.lineWidth = 1.5;
      lc.beginPath();
      lc.moveTo(edge[0]!, edge[1]! + 0.9);
      for (let k = 2; k < edge.length; k += 2) lc.lineTo(edge[k]!, edge[k + 1]! + 0.9);
      lc.stroke();
      lc.strokeStyle = 'rgba(255,240,214,0.5)';
      lc.lineWidth = 0.6;
      lc.beginPath();
      lc.moveTo(edge[0]!, edge[1]! + 1.9);
      for (let k = 2; k < edge.length; k += 2) lc.lineTo(edge[k]!, edge[k + 1]! + 1.9);
      lc.stroke();
      inkLine(lc, edge, 1, { alpha: 0.78, width: 0.6, closed: false, dash: [22, 2.5, 9, 2] });
    }
    // grain along the plank
    grain(lc, rnd, -58, gun(0) + (keel(0) - gun(0)) * strakes[i]!, 116, (keel(0) - gun(0)) * (strakes[i + 1]! - strakes[i]!), 5, col.dark, 0.32, 0.35);
  }
  // rivets / nails along the laps
  lc.fillStyle = 'rgba(40,30,28,0.55)';
  for (let i = 1; i < 3; i++)
    for (let x = -50; x <= 52; x += 7.5) {
      lc.beginPath();
      lc.arc(x + (i % 2) * 2, gun(x) + (keel(x) - gun(x)) * strakes[i]! + 1.9, 0.32, 0, Math.PI * 2);
      lc.fill();
    }
  // wet darkening and the water's tint toward the keel
  const wet = lc.createLinearGradient(0, -2, 0, 11);
  wet.addColorStop(0, 'rgba(26,60,70,0)');
  wet.addColorStop(0.25, 'rgba(26,60,74,0.38)');
  wet.addColorStop(1, 'rgba(40,96,120,0.7)');
  lc.fillStyle = wet;
  lc.fillRect(-64, -2, 128, 16);
  lc.restore();

  // 2. gunwale cap in natural wood, along the top edge
  const cap: number[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 3) cap.push(x, gun(x) - 1.7);
  for (let x = HULL.stern; x >= HULL.bow; x -= 3) cap.push(x, gun(x) + 0.5);
  paintShape(lc, cap, '#D6B282', rnd, { shade: '#6B4A30', light: '#FFF4D4', alpha: 0.95, layers: 2, inkW: 0.5, dash: [16, 2, 7, 2] });
  // stem post: a thicker lighter strip, rising a touch at the bow
  paintShape(lc, flat([[-60.8, -17.2], [-58.8, -16.4], [-56.8, -9], [-54.6, -1.6], [-56.6, -1.8], [-58.4, -8.6]]), '#CDA574', rnd, { shade: '#5C3E28', light: '#FFF2D0', alpha: 0.95, layers: 2, inkW: 0.5 });
  // transom: the stern face, a lighter small plank
  paintShape(lc, flat([[57.6, -13.8], [60.2, -14.1], [60.4, -2.4], [58.8, -1.4]]), '#C79E72', rnd, { shade: '#5C3E28', light: '#FFF2D0', alpha: 0.95, layers: 2, inkW: 0.5 });
  // oarlock: a little iron horn on the gunwale
  lc.fillStyle = 'rgba(52,54,60,0.95)';
  lc.beginPath();
  lc.moveTo(17.2, gun(19) - 1.7);
  lc.lineTo(17.4, gun(19) - 4.8);
  lc.lineTo(18.6, gun(19) - 4.8);
  lc.lineTo(18.7, gun(19) - 2.4);
  lc.lineTo(20.3, gun(19) - 2.4);
  lc.lineTo(20.6, gun(19) - 4.8);
  lc.lineTo(21.8, gun(19) - 4.8);
  lc.lineTo(21.6, gun(19) - 1.7);
  lc.closePath();
  lc.fill();
  inkLine(lc, flat(outline), 1, { alpha: 0.78, width: 0.75, dash: [26, 2.5, 10, 2] });

  // 3. fade the part below the waterline into the water
  lc.globalCompositeOperation = 'destination-in';
  const fade = lc.createLinearGradient(0, -1, 0, 9);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.35, 'rgba(0,0,0,0.78)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  lc.fillStyle = fade;
  lc.fillRect(SPR.x0, SPR.y0, SPR.x1 - SPR.x0, 0 - SPR.y0 + 9 - 0 + 1); // up to y = 10
  lc.fillStyle = 'rgba(0,0,0,0)';
  lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(layer, 0, 0, layer.width, layer.height, SPR.x0, SPR.y0, SPR.x1 - SPR.x0, SPR.y1 - SPR.y0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

/* ---------------------------------------------------------------- oars */

function paintOar(id: BoatId, q: number): Part {
  const col = BOAT_COLORS[id];
  const rnd = new Rand(410 + id.length);
  const LEN = 78;
  return part(LEN + 4, 12, 2, 6, q, (ctx) => {
    // loom (shaft) with a tapered, slightly bowed outline
    const shaft = flat([[0, -1.1], [34, -1.4], [58, -1.2], [59, 0], [58, 1.2], [34, 1.4], [0, 1.1]]);
    paintShape(ctx, shaft, '#C9A06C', rnd, { shade: '#5C3E28', light: '#FFF2D0', alpha: 0.95, layers: 2, inkW: 0.4, dash: [12, 2, 5, 2] });
    // grip
    paintShape(ctx, smoothPoly([[-1.2, -1.5], [6.4, -1.4], [7.4, 0], [6.4, 1.4], [-1.2, 1.5], [-2, 0]], 3, true), '#E2C898', rnd, { shade: '#6B4A30', light: '#FFF6DA', alpha: 0.95, layers: 2, inkW: 0.4 });
    // leather collar where the oar sits in the lock
    ctx.fillStyle = 'rgba(96,58,36,0.9)';
    ctx.fillRect(32, -1.7, 4.6, 3.4);
    ctx.strokeStyle = 'rgba(40,24,16,0.7)';
    ctx.lineWidth = 0.35;
    ctx.strokeRect(32, -1.7, 4.6, 3.4);
    // blade: a long leaf in the boat's colour with a pale tip
    const blade = smoothPoly([[56, -1.1], [61, -2.4], [68, -2.7], [75, -2.1], [78, 0], [75, 2.1], [68, 2.7], [61, 2.4], [56, 1.1]], 4, true);
    paintShape(ctx, blade, col.hull, rnd, { shade: col.dark, light: '#FFF2E0', alpha: 0.95, layers: 3, inkW: 0.5, dash: [14, 2, 6, 2] });
    ctx.save();
    tracePoly(ctx, blade);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,248,232,0.78)';
    ctx.fillRect(72.4, -5, 8, 10);
    ctx.strokeStyle = 'rgba(255,248,232,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(56, 0);
    ctx.lineTo(74, 0);
    ctx.stroke();
    ctx.restore();
  });
}

/* ---------------------------------------------------------------- rower */

const SKIN = '#E8B994';
const SHIRT = '#EFE6CF';
const TROUSER = '#6C8296';

function paintRower(q: number): Omit<RowerSet, 'oars' | 'hullBack' | 'hullFront' | 'q' | 'head' | 'tails'> {
  const rnd = new Rand(777);
  const torso = part(22, 34, 11, 30, q, (ctx) => {
    // shirt: a soft rounded trapezoid from hips (y = 0 at the bottom) up to the shoulders (y = -24)
    const body = smoothPoly([[-5.8, 1], [5.6, 1], [6.4, -9], [6.2, -19], [4.8, -25], [-1.5, -26.5], [-5.4, -23], [-6.6, -12]], 4, true);
    paintShape(ctx, body, SHIRT, rnd, { shade: '#6B5A4A', light: '#FFFDF2', alpha: 0.95, layers: 3, inkW: 0.5 });
    // a vest in a deeper tone for depth, and the belt
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    ctx.fillStyle = 'rgba(86,112,140,0.2)';
    ctx.beginPath();
    ctx.moveTo(-1.2, -26);
    ctx.lineTo(1.6, -24);
    ctx.quadraticCurveTo(2.6, -13, 2, 1);
    ctx.lineTo(-7, 1);
    ctx.lineTo(-7, -26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(70,52,40,0.85)';
    ctx.fillRect(-7, -2.4, 14, 2.6);
    ctx.strokeStyle = 'rgba(60,50,44,0.4)';
    ctx.lineWidth = 0.4;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(-3 + k * 1.8, -22 + k * 0.4);
      ctx.quadraticCurveTo(-1 + k * 1.6, -14, -2 + k * 1.8, -5);
      ctx.stroke();
    }
    ctx.restore();
  });
  const upper = part(18, 10, 3, 5, q, (ctx) => {
    paintShape(ctx, limbPoly(12.4, 4.8, 4.2, -0.2), SHIRT, rnd, { shade: '#6B5A4A', light: '#FFFDF2', alpha: 0.95, layers: 2, inkW: 0.45 });
  });
  const fore = part(22, 10, 3, 5, q, (ctx) => {
    paintShape(ctx, limbPoly(12.6, 3.9, 3.0, 0.15), SKIN, rnd, { shade: '#7A4A30', light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.42 });
    // rolled sleeve cuff
    ctx.fillStyle = 'rgba(239,230,207,0.95)';
    ctx.fillRect(-0.5, -2.5, 3.2, 5);
    ctx.strokeStyle = 'rgba(60,50,44,0.55)';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(-0.5, -2.5, 3.2, 5);
    // hand
    paintShape(ctx, smoothPoly([[12, -1.7], [14.2, -1.9], [15.8, -0.4], [15, 1.7], [12.6, 1.9]], 3, true), SKIN, rnd, { shade: '#7A4A30', light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.4 });
  });
  const thigh = part(24, 11, 4, 5.5, q, (ctx) => {
    paintShape(ctx, limbPoly(15.2, 7.4, 5.8, -0.2), TROUSER, rnd, { shade: '#2E3E50', light: '#C6D6E4', alpha: 0.95, layers: 3, inkW: 0.5 });
  });
  const shin = part(30, 14, 4, 7, q, (ctx) => {
    paintShape(ctx, limbPoly(14.4, 5.6, 4.4, 0.2), TROUSER, rnd, { shade: '#2E3E50', light: '#C6D6E4', alpha: 0.95, layers: 3, inkW: 0.5 });
    // shoe
    paintShape(ctx, smoothPoly([[13.6, -2.6], [17.6, -2.8], [21.4, -1.6], [22, 1.4], [18, 2.8], [13.2, 2.6]], 3, true), '#6B4A34', rnd, { shade: '#2A1A10', light: '#C9A07A', alpha: 0.95, layers: 2, inkW: 0.5 });
  });
  const dk = 0.3;
  return { torso, upper, fore, thigh, shin, upperFar: darken(upper, dk), foreFar: darken(fore, dk) };
}

function paintHead(id: BoatId, q: number): { head: Part; tails: Part } {
  const col = BOAT_COLORS[id];
  const rnd = new Rand(888 + id.length * 3);
  // pivot at the base of the neck; the face looks to +x (toward the stern, where a rower faces)
  const head = part(32, 30, 16, 25, q, (ctx) => {
    // neck
    paintShape(ctx, flat([[-1.9, 1.5], [2.4, 1.5], [2.2, -3.4], [-1.7, -3.2]]), SKIN, rnd, { shade: '#7A4A30', light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.35 });
    // scarf knot and collar in the boat colour
    paintShape(ctx, smoothPoly([[-3.6, 0.6], [3.4, 0.8], [4.2, -1.4], [3, -3.1], [-2.8, -2.9], [-4, -1.4]], 3, true), col.scarf, rnd, { shade: col.dark, light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.45 });
    // head
    const face = smoothPoly([[-3.8, -9.6], [-1.4, -12.6], [2.6, -12.6], [4.8, -10.2], [5.4, -7.8], [6.8, -6.6], [5.2, -5.6], [4.8, -3.8], [2.4, -2.9], [-1.4, -3.4], [-4.2, -5.8]], 4, true);
    paintShape(ctx, face, SKIN, rnd, { shade: '#7A4A30', light: '#FFF0DA', alpha: 0.95, layers: 3, inkW: 0.5 });
    // hair at the back of the head (to -x), under the hat
    paintShape(ctx, smoothPoly([[-4.2, -5.6], [-3.9, -10.4], [-1.2, -12.9], [0.2, -11], [-1, -8.4], [-2.4, -5]], 3, true), '#6B4A30', rnd, { shade: '#2A1A10', light: '#B58A60', alpha: 0.95, layers: 2, inkW: 0.4 });
    // ear, eye, brow, cheek
    ctx.fillStyle = 'rgba(190,120,96,0.75)';
    ctx.beginPath();
    ctx.ellipse(-0.6, -7.3, 1.1, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,28,22,0.9)';
    ctx.beginPath();
    ctx.arc(3.7, -8.2, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,28,0.7)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(2.9, -9.2);
    ctx.lineTo(4.6, -9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,130,110,0.3)';
    ctx.beginPath();
    ctx.arc(3.4, -6, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // straw hat: wide brim, domed crown, a band in the boat colour
    const brim = smoothPoly([[-9.4, -11.2], [-4, -13.1], [4.6, -13.2], [10.4, -11.4], [4.4, -9.8], [-4.2, -9.9]], 4, true);
    paintShape(ctx, brim, '#E6CB82', rnd, { shade: '#7A5A22', light: '#FFF4C8', alpha: 0.95, layers: 3, inkW: 0.5 });
    const crown = smoothPoly([[-4.6, -12.3], [-4.2, -16.4], [-1.6, -18.9], [2.2, -18.9], [4.4, -16.2], [4.6, -12.4]], 4, true);
    paintShape(ctx, crown, '#EBD28C', rnd, { shade: '#7A5A22', light: '#FFF8D4', alpha: 0.95, layers: 3, inkW: 0.5 });
    ctx.save();
    tracePoly(ctx, crown);
    ctx.clip();
    ctx.fillStyle = rgba(col.scarf, 0.95);
    ctx.fillRect(-6, -14.7, 12, 2.2);
    ctx.fillStyle = 'rgba(40,26,18,0.25)';
    ctx.fillRect(-6, -12.7, 12, 0.5);
    // straw weave
    ctx.strokeStyle = 'rgba(122,90,34,0.4)';
    ctx.lineWidth = 0.3;
    for (let k = -4; k <= 4; k += 1.4) {
      ctx.beginPath();
      ctx.moveTo(k, -19);
      ctx.lineTo(k * 1.15, -14.8);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(122,90,34,0.4)';
    ctx.lineWidth = 0.3;
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.ellipse(0.4, -11.5, 4 + k * 0.85, 1.2 + k * 0.1, 0, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
  });
  // two scarf tails trailing behind the rower (to -x); pivot at the knot
  const tails = part(18, 10, 1, 5, q, (ctx) => {
    const t1 = smoothPoly([[0, -1.2], [-3.6, -1.9], [-8, -1.3], [-11, 0.5], [-8.2, 1.3], [-4, 1.2], [0, 1]], 3, true);
    paintShape(ctx, t1, col.scarf, rnd, { shade: col.dark, light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.42 });
    const t2 = smoothPoly([[0, 0.6], [-3, 1.5], [-6.4, 2.6], [-9, 4.2], [-6.4, 4.4], [-3, 3], [0, 1.8]], 3, true);
    paintShape(ctx, t2, col.scarf, rnd, { shade: col.dark, light: '#FFF0DA', alpha: 0.95, layers: 2, inkW: 0.42 });
  });
  return { head, tails };
}

/* ---------------------------------------------------------------- set */

export function buildRowerSet(q: number): RowerSet {
  const body = paintRower(q);
  const head = {} as Record<BoatId, Part>;
  const tails = {} as Record<BoatId, Part>;
  const oars = {} as Record<BoatId, Part>;
  const hullBack = {} as Record<BoatId, HTMLCanvasElement>;
  const hullFront = {} as Record<BoatId, HTMLCanvasElement>;
  for (const id of ['cash', 'savings', 'invest'] as BoatId[]) {
    const h = paintHead(id, q);
    head[id] = h.head;
    tails[id] = h.tails;
    oars[id] = paintOar(id, q);
    hullBack[id] = paintHullBack(id, q);
    hullFront[id] = paintHullFront(id, q);
  }
  return { q, ...body, head, tails, oars, hullBack, hullFront };
}

void deform;
