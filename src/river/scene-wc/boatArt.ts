/**
 * Hand-painted watercolor sprites for the rowboats and rowers, made once per size. Everything is in boat-local
 * units: origin at the waterline amidships, +x toward the stern (bow points upstream = left), +y down.
 *
 *   hullBack / hullFront  – interior + far gunwale (behind the rower) and the clinker near side (in front)
 *   emblem                – a coin jar / strongbox / potted sapling, part of hullBack
 *   rower parts           – torso, head (straw hat, scarf in the boat colour), scarf tails, arms, legs
 *   oar                   – handle at x = 0, blade at the far end, painted in the boat colour
 *
 * The painting technique lives in boatInk.ts (glazes, pooled edges, dry-brush grain, broken tapering ink).
 * Rower and oar sprites are painted for the mirrored rig (drawn under scale(-1, 1)), so they pass `flip` to keep
 * the light on the upper left of the screen.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { BoatId } from '../types';
import { PAPER, SEPIA, brush, feather, flat, granulate, inkDashes, mix, paintForm, smoothPoly, speckle, spriteCtx, streaks, type Pt } from './boatInk';

/** pigment swatches: a lit glaze, the body wash, and a deep pooled tone per boat */
export const BOAT_COLORS: Record<BoatId, { hull: string; light: string; dark: string; scarf: string }> = {
  cash: { hull: '#E5694D', light: '#F7AA8C', dark: '#A83F2D', scarf: '#E5694D' },
  savings: { hull: '#E3A62B', light: '#F7D277', dark: '#A87416', scarf: '#E3A62B' },
  invest: { hull: '#1F805E', light: '#5BAE8C', dark: '#0F5340', scarf: '#1F805E' },
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
  torso: Record<BoatId, Part>;
  head: Record<BoatId, Part>;
  tails: Record<BoatId, Part>;
  upper: Record<BoatId, Part>;
  fore: Part;
  thigh: Part;
  shin: Part;
  upperFar: Record<BoatId, Part>;
  foreFar: Part;
  oars: Record<BoatId, Part>;
  /** the same oars cooled and paler, for the length of blade that is under the water */
  oarsWet: Record<BoatId, Part>;
  hullBack: Record<BoatId, HTMLCanvasElement>;
  hullFront: Record<BoatId, HTMLCanvasElement>;
}

const part = (w: number, h: number, px: number, py: number, q: number, paint: (ctx: CanvasRenderingContext2D) => void, grain = 0.7, seed = 5): Part => {
  const { cv, ctx } = spriteCtx(w, h, q, px, py);
  paint(ctx);
  if (grain > 0) granulate(cv, seed, q, grain);
  return { cv, px, py, w, h };
};

/** a copy of a part with a wash laid over its own pixels only */
const tinted = (src: Part, rgb: string, a: number): Part => {
  const cv = makeCanvas(src.cv.width, src.cv.height);
  const c = cv.getContext('2d')!;
  c.drawImage(src.cv, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(${rgb},${a})`;
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

/* ------------------------------------------------------------------ pigments */

const WOOD = { base: '#D2AC7A', light: '#F8E6B8', shade: '#6A4830' };
const INTERIOR = { light: '#C39C70', mid: '#98714B', dark: '#5C402D' };
const IRON = { base: '#4B505A', light: '#A4ABB8', shade: '#1B1D25' };
const SKIN = { base: '#EBBA94', light: '#FFE6CB', shade: '#9A5C3E' };
const TROUSER = { base: '#6F879C', light: '#BCCEDC', shade: '#2E3E56' };
const STRAW = { base: '#E4C47C', light: '#FBEBB6', shade: '#8A6226' };
const WATER_TEAL = '#1D4E63';
const COOL = '#2F2A58';

/** wobbly y offset for hand-drawn long lines */
const wob = (x: number, p: number): number => 0.22 * Math.sin(x * 0.19 + p) + 0.13 * Math.sin(x * 0.47 + p * 2.3);

/* ---------------------------------------------------------------- hull */

/** pixel rect of a hull sprite that can hold paint: the hull, its emblem and the thing above it */
const hullRect = (q: number): [number, number, number, number] => {
  const x0 = Math.floor((-66 - SPR.x0) * q);
  const x1 = Math.ceil((66 - SPR.x0) * q);
  const y0 = Math.floor((-40 - SPR.y0) * q);
  const y1 = Math.ceil((16 - SPR.y0) * q);
  return [x0, y0, x1 - x0, y1 - y0];
};

function paintHullBack(id: BoatId, q: number): HTMLCanvasElement {
  const { cv, ctx } = spriteCtx(SPR.x1 - SPR.x0, SPR.y1 - SPR.y0, q, -SPR.x0, -SPR.y0);
  const rnd = new Rand(210 + id.length * 17);
  // interior: the lens between the far and near gunwales
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let x = HULL.bow + 1; x <= HULL.stern - 1; x += 2) {
    top.push([x, farGun(x)]);
    bot.push([x, gun(x) + 1]);
  }
  const lens = flat([...top, ...[...bot].reverse()]);
  ctx.save();
  tracePoly(ctx, lens);
  ctx.clip();
  // a warm underpainting, darker toward the near gunwale that shades it
  const g = ctx.createLinearGradient(0, -16, 0, -5);
  g.addColorStop(0, INTERIOR.light);
  g.addColorStop(0.42, INTERIOR.mid);
  g.addColorStop(1, INTERIOR.dark);
  ctx.fillStyle = g;
  ctx.fillRect(-64, -20, 128, 20);
  // glazes of umber and ochre, wet-in-wet blooms
  const shadeBand = (a: number, c: string, dy: number, h: number, n: number) => {
    ctx.fillStyle = rgba(c, a);
    for (let i = 0; i < n; i++) {
      const p: number[] = [];
      for (let x = -64; x <= 64; x += 4) p.push(x, gun(x) + dy - h + 0.7 * Math.sin(x * 0.13 + i * 2));
      for (let x = 64; x >= -64; x -= 4) p.push(x, gun(x) + dy + 2);
      tracePoly(ctx, deform(p, rnd, 2, 0.012));
      ctx.fill();
    }
  };
  ctx.fillStyle = rgba('#A4794E', 0.2);
  for (let i = 0; i < 3; i++) {
    tracePoly(ctx, deform(lens, rnd, 3, 0.03));
    ctx.fill();
  }
  // lit patch on the far wall, upper left
  ctx.fillStyle = rgba('#E3C08C', 0.22);
  for (let i = 0; i < 3; i++) {
    tracePoly(ctx, deform(flat([[-52, farGun(-52) - 1], [-14, farGun(-14) - 1], [-18, farGun(-18) + 3.6], [-50, farGun(-50) + 4.5]]), rnd, 3, 0.1));
    ctx.fill();
  }
  // the shadow the near gunwale throws inside, a cool-warm dark, pooled
  shadeBand(0.16, '#2E1D18', 0, 6.5, 3);
  shadeBand(0.2, '#251610', 0, 3.2, 3);
  const sh = ctx.createLinearGradient(0, -15, 0, -5);
  sh.addColorStop(0, 'rgba(40,26,20,0)');
  sh.addColorStop(1, 'rgba(40,26,20,0.3)');
  ctx.fillStyle = sh;
  ctx.fillRect(-64, -16, 128, 12);
  // floor boards seen along the length: long soft dry-brush streaks that follow the curve
  const fb = (x: number, r: number) => farGun(x) + (gun(x) - farGun(x)) * r;
  streaks(ctx, rnd, fb, -58, 58, 12, { color: '#3C281C', alpha: 0.24, w: 0.36, len: [18, 56], r: [0.05, 0.95] });
  streaks(ctx, rnd, fb, -58, 58, 8, { color: '#E8C890', alpha: 0.2, w: 0.32, len: [14, 40], r: [0.05, 0.6] });
  // ribs across the interior: soft brushed curves, uneven
  for (let x = -49; x <= 51; x += 9.5) {
    if (rnd.chance(0.12)) continue;
    const xx = x + rnd.range(-0.8, 0.8);
    brush(ctx, [[xx, farGun(xx) - 0.3], [xx + 1.2, (farGun(xx) + gun(xx)) / 2], [xx - 0.6, gun(xx) + 1.4]], rnd.range(0.55, 0.95), '#3F2A1E', rnd.range(0.22, 0.4), 0.85);
    brush(ctx, [[xx + 0.7, farGun(xx) + 0.2], [xx + 1.9, (farGun(xx) + gun(xx)) / 2], [xx + 0.2, gun(xx) + 1]], 0.3, '#EBCB98', 0.22, 0.9);
  }
  // thwart (rowing seat): a plank across the boat at the rower, with a soft cast shadow
  const thw: number[] = [3, gun(3) - 0.5, -10, gun(-10) - 0.5, -11.5, farGun(-11.5) + 2.2, 1.5, farGun(1.5) + 2.2];
  ctx.fillStyle = 'rgba(32,20,16,0.26)';
  for (let i = 0; i < 2; i++) {
    tracePoly(ctx, deform(flat([[4.4, gun(3) + 1.6], [-8.6, gun(-10) + 1.9], [-9.8, farGun(-11.5) + 4.6], [3.4, farGun(1.5) + 4.2]]), rnd, 2, 0.04));
    ctx.fill();
  }
  paintForm(ctx, thw, '#C9A474', rnd, { light: '#F2DCB0', shade: '#5E4028', grain: 3, grainColor: '#5A3E28', ink: '#2E2018', inkA: 0.5, inkW: 0.36 });
  speckle(ctx, rnd, -64, -18, 128, 14, 420, '#2A1A12', 0.2, '#F1D7A8', 0.14, 0.2);
  ctx.restore();
  // far gunwale rail: a slim lighter strip, painted wood
  const rail: number[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 2) rail.push(x, farGun(x) - 0.6);
  for (let x = HULL.stern; x >= HULL.bow; x -= 2) rail.push(x, farGun(x) + 1.5);
  paintForm(ctx, rail, '#D2AE80', rnd, { light: '#FFF0CC', shade: '#6B4A30', alpha: 0.93, grain: 2, ink0: true, speck: 80 });
  inkDashes(ctx, flat(top), rnd, { color: SEPIA, alpha: 0.5, w: 0.42, dash: [10, 24], gap: [1.2, 3.5], closed: false });
  // stem and the little stern knee on the far side
  brush(ctx, [[-60, -15.6], [-58.9, -13], [-57.6, -9]], 0.75, SEPIA, 0.6);
  // a coil of rope in the stern: three loops, shaded underneath and lit on top
  for (let k = 0; k < 3; k++) {
    const rx = 4.2 - k * 0.5;
    const cy = -11.2 - 0.3 * k;
    const ring = (dy: number, a0: number, a1: number): Pt[] => {
      const o: Pt[] = [];
      for (let t = 0; t <= 14; t++) {
        const a = a0 + ((a1 - a0) * t) / 14;
        o.push([-46 + Math.cos(a) * rx, cy + dy + Math.sin(a) * 1.5]);
      }
      return o;
    };
    brush(ctx, ring(0.55, 0.05, Math.PI * 0.95), 1.15, '#5B3F26', 0.36, 0.7);
    brush(ctx, ring(0, 0, Math.PI * 2 - 0.05), 1.15, '#D6BA86', 0.95, 0.35);
    brush(ctx, ring(-0.3, Math.PI * 1.05, Math.PI * 1.85), 0.45, '#FFF0C4', 0.55, 0.9);
    brush(ctx, ring(0.2, Math.PI * 0.1, Math.PI * 0.8), 0.3, '#6B4A2C', 0.45, 0.9);
  }
  // the emblem, on the stern thwart behind the rower
  paintEmblem(ctx, id, rnd);
  granulate(cv, 91 + id.length, q, 0.9, hullRect(q));
  return cv;
}

/** a small emblem so identity is never colour alone */
function paintEmblem(ctx: CanvasRenderingContext2D, id: BoatId, rnd: Rand): void {
  ctx.save();
  ctx.translate(36, -10.5);
  // a soft contact shadow on the floor
  ctx.fillStyle = 'rgba(32,20,14,0.28)';
  ctx.beginPath();
  ctx.ellipse(1.2, 0.7, id === 'savings' ? 11.5 : 7.8, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (id === 'cash') {
    // a glass jar of coins with a tin lid
    const jar: Pt[] = [[-6, -15], [6, -15], [7, -12], [7.2, -2], [6.4, 0.4], [-6.4, 0.4], [-7.2, -2], [-7, -12]];
    const poly = smoothPoly(jar, 3, true);
    // glass: pale transparent teal wash
    ctx.fillStyle = 'rgba(206,232,232,0.7)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(poly, rnd, 2, 0.02));
      ctx.fill();
    }
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // coins stacked and heaped, each a small glazed ellipse
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 3; k++) {
        const cx = -4.4 + k * 4.4 + (row % 2) * 1.2 + rnd.range(-0.3, 0.3);
        const cy = -1.6 - row * 2.1;
        const warm = (row + k) % 2 ? '#F0C04C' : '#E4A738';
        ctx.fillStyle = rgba(warm, 0.9);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3.1, 1.28, rnd.range(-0.08, 0.08), 0, Math.PI * 2);
        ctx.fill();
        // the darker pooled rim under each coin and a lifted highlight on top
        ctx.strokeStyle = 'rgba(122,78,22,0.55)';
        ctx.lineWidth = 0.34;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 0.12, 3.05, 1.2, 0, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,244,196,0.7)';
        ctx.beginPath();
        ctx.ellipse(cx - 0.8, cy - 0.35, 1.1, 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // glass: a bright streak on the lit side, a cool wash on the far side, soft bottom thickness
    brush(ctx, [[-5.5, -13.6], [-5.4, -8], [-5.6, -3]], 1.0, '#FFFFFF', 0.6);
    brush(ctx, [[-3.8, -13], [-3.8, -10]], 0.35, '#FFFFFF', 0.5);
    ctx.fillStyle = 'rgba(40,96,114,0.2)';
    ctx.fillRect(3.4, -14.5, 4, 15);
    ctx.fillStyle = 'rgba(50,100,112,0.2)';
    ctx.fillRect(-7.5, -1, 15, 1.4);
    ctx.restore();
    inkDashes(ctx, poly, rnd, { color: '#34545C', alpha: 0.55, w: 0.42, dash: [7, 16], gap: [1, 2.6], center: [0, -7] });
    // lid
    paintForm(ctx, flat([[-7.4, -18.2], [7.4, -18.2], [7.8, -15], [-7.8, -15]]), '#C4B088', rnd, { light: '#FFF4D6', shade: '#5A4630', alpha: 0.95, layers: 2, ink: '#3A2E20', inkW: 0.42, speck: 30 });
    ctx.strokeStyle = 'rgba(80,60,36,0.45)';
    ctx.lineWidth = 0.3;
    for (let x = -6; x <= 6; x += 2.4) {
      ctx.beginPath();
      ctx.moveTo(x, -18);
      ctx.lineTo(x + rnd.range(-0.1, 0.1), -15.2);
      ctx.stroke();
    }
  } else if (id === 'savings') {
    // a small strongbox: arched lid, iron bands, brass lock
    paintForm(ctx, flat([[-10.5, -11], [10.5, -11], [10.8, 0.4], [-10.8, 0.4]]), '#8C5C38', rnd, { light: '#D9AE84', shade: '#2E1E14', alpha: 0.96, layers: 3, grain: 5, grainColor: '#2E1C10', ink: '#241810', inkA: 0.6, inkW: 0.5 });
    const lid: Pt[] = [[-10.8, -11], [-9.4, -15], [0, -17], [9.4, -15], [10.8, -11]];
    paintForm(ctx, smoothPoly(lid, 4, true), '#9C6A44', rnd, { light: '#EFC796', shade: '#2E1E14', alpha: 0.96, layers: 3, grain: 4, grainColor: '#2E1C10', ink: '#241810', inkA: 0.6, inkW: 0.5 });
    // iron straps, painted dark grey-blue with a pale lit edge
    for (const x of [-7.4, 7.4]) {
      paintForm(ctx, flat([[x - 1, -16], [x + 1, -16], [x + 1, 0.4], [x - 1, 0.4]]), IRON.base, rnd, { light: IRON.light, shade: IRON.shade, alpha: 0.95, layers: 2, ink: '#14161C', inkA: 0.5, inkW: 0.28, speck: 10 });
    }
    paintForm(ctx, flat([[-10.8, -12.2], [10.8, -12.2], [10.8, -10.7], [-10.8, -10.7]]), IRON.base, rnd, { light: IRON.light, shade: IRON.shade, alpha: 0.95, layers: 2, ink: '#14161C', inkA: 0.5, inkW: 0.28, speck: 10 });
    // brass lock plate
    paintForm(ctx, flat([[-2.4, -10.4], [2.4, -10.4], [2.4, -5.6], [0, -4.4], [-2.4, -5.6]]), '#E1B03E', rnd, { light: '#FFF2B8', shade: '#7A5212', alpha: 0.96, layers: 2, ink: '#4A3208', inkW: 0.36, speck: 12 });
    ctx.fillStyle = 'rgba(40,28,14,0.85)';
    ctx.beginPath();
    ctx.arc(0, -8.2, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-0.25, -8.2, 0.5, 2);
    // handle
    ctx.strokeStyle = 'rgba(58,62,70,0.88)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -17, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    // a sapling in a terracotta pot: a brushed stem, leaves each a small wet wash with a pale vein
    brush(ctx, [[0, -8], [-0.6, -14], [1.0, -20], [0.4, -27]], 1.5, '#6B4A2F', 0.95, 0.4);
    brush(ctx, [[-0.5, -9], [-1, -14], [0.4, -20], [-0.1, -26]], 0.4, '#C9A56E', 0.5, 0.8);
    const leaf = (x: number, y: number, ang: number, len: number, c1: string, c2: string, hi: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const sp = smoothPoly([[0, 0], [len * 0.3, -len * 0.27], [len * 0.72, -len * 0.22], [len, 0], [len * 0.72, len * 0.2], [len * 0.3, len * 0.25]], 4, true);
      paintForm(ctx, sp, c1, rnd, { light: hi, shade: c2, alpha: 0.95, layers: 2, ink: '#1F3A22', inkA: 0.5, inkW: 0.34, speck: 14, dash: [5, 12] });
      brush(ctx, [[0.4, 0], [len * 0.5, -0.1], [len * 0.88, 0]], 0.26, '#EAF5B0', 0.5, 0.9);
      ctx.restore();
    };
    leaf(0, -12, -2.7, 8, '#69AE48', '#1E5A36', '#C4E486');
    leaf(0.2, -15.5, -0.5, 8.6, '#55A03F', '#1E5A36', '#B6DC7C');
    leaf(0.1, -19, -2.5, 8, '#8CC455', '#2A6A3A', '#DDF0A0');
    leaf(0.4, -22, -0.7, 8.2, '#69AE48', '#1E5A36', '#C4E486');
    leaf(0.4, -27, -1.9, 7.4, '#A6D46A', '#2A6A3A', '#EDF8B8');
    leaf(0.4, -27, -1.15, 7.4, '#8CC455', '#2A6A3A', '#DDF0A0');
    // pot
    paintForm(ctx, flat([[-6.6, -9.4], [6.6, -9.4], [5.2, 0.4], [-5.2, 0.4]]), '#C8663F', rnd, { light: '#F4B88C', shade: '#5A2A18', alpha: 0.96, layers: 3, ink: '#3A1A10', inkA: 0.55, inkW: 0.46, grain: 2 });
    paintForm(ctx, flat([[-7.4, -11.6], [7.4, -11.6], [7.2, -9], [-7.2, -9]]), '#D8764C', rnd, { light: '#FFD2A8', shade: '#5A2A18', alpha: 0.96, layers: 2, ink: '#3A1A10', inkA: 0.55, inkW: 0.46 });
    // soil
    ctx.fillStyle = 'rgba(70,46,30,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -11.4, 6.2, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintHullFront(id: BoatId, q: number): HTMLCanvasElement {
  const { cv, ctx } = spriteCtx(SPR.x1 - SPR.x0, SPR.y1 - SPR.y0, q, -SPR.x0, -SPR.y0);
  const col = BOAT_COLORS[id];
  const rnd = new Rand(310 + id.length * 29);
  // work on a layer so the underwater part can be faded to the water
  const { cv: layer, ctx: lc } = spriteCtx(SPR.x1 - SPR.x0, SPR.y1 - SPR.y0, q, -SPR.x0, -SPR.y0);

  // near-side outline: gunwale (bow to stern), transom, keel (stern to bow), stem
  const outline: Pt[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 2) outline.push([x, gun(x)]);
  outline.push([HULL.stern, gun(HULL.stern)]);
  for (let x = HULL.stern; x >= HULL.bow; x -= 2) outline.push([x, keel(x)]);
  const hull = flat(outline);

  const fr = [0, 0.24, 0.5, 0.76, 1.0];
  const yAt = (x: number, f: number) => gun(x) + (keel(x) - gun(x)) * f;
  const band = (f0: number, f1: number): number[] => {
    const p: Pt[] = [];
    for (let x = HULL.bow; x <= HULL.stern; x += 3) p.push([x, yAt(x, f0)]);
    for (let x = HULL.stern; x >= HULL.bow; x -= 3) p.push([x, yAt(x, f1)]);
    return flat(p);
  };
  const tones = [mix(col.light, col.hull, 0.45), col.hull, mix(col.hull, col.dark, 0.2), mix(col.hull, col.dark, 0.38)];

  lc.save();
  tracePoly(lc, hull);
  lc.clip();
  // 1. a first coverage wash, then the strakes, each its own glaze built from re-deformed passes
  lc.fillStyle = rgba(col.hull, 0.96);
  tracePoly(lc, hull);
  lc.fill();
  for (let i = 0; i < 4; i++) {
    const b = band(fr[i]! - (i ? 0.01 : 0.1), fr[i + 1]! + 0.035);
    lc.fillStyle = rgba(tones[i]!, 0.78);
    tracePoly(lc, b);
    lc.fill();
    lc.fillStyle = rgba(tones[i]!, 0.16);
    for (let k = 0; k < 3; k++) {
      tracePoly(lc, deform(band(fr[i]!, fr[i + 1]! + 0.02), rnd, 2, 0.012));
      lc.fill();
    }
    // pigment pools along the lower edge of each plank, and lifts a little at its top
    lc.fillStyle = rgba(col.dark, 0.16);
    for (let k = 0; k < 2; k++) {
      tracePoly(lc, deform(band(fr[i + 1]! - 0.11, fr[i + 1]! + 0.02), rnd, 2, 0.02));
      lc.fill();
    }
    lc.fillStyle = rgba(col.light, 0.2);
    tracePoly(lc, deform(band(fr[i]! + 0.01, fr[i]! + 0.1), rnd, 2, 0.03));
    lc.fill();
  }
  // wet-in-wet blooms: soft patches of lighter and deeper pigment wandering across the planks
  for (let i = 0; i < 9; i++) {
    const bx = rnd.range(-52, 54);
    const by = yAt(bx, rnd.range(0.1, 0.8));
    const r = rnd.range(5, 11);
    const bl: number[] = [];
    for (let k = 0; k < 9; k++) bl.push(bx + Math.cos(k * 0.7) * r * rnd.range(0.7, 1.2), by + Math.sin(k * 0.7) * r * 0.32 * rnd.range(0.7, 1.2));
    lc.fillStyle = i % 3 === 0 ? rgba(col.light, 0.16) : rgba(col.dark, 0.09);
    for (let k = 0; k < 2; k++) {
      tracePoly(lc, deform(bl, rnd, 3, 0.2));
      lc.fill();
    }
  }
  // 2. lit from the upper left: warm light on the upper strakes and the bow, a cool shade toward the stern and keel
  const gh = lc.createLinearGradient(-60, 0, 60, 0);
  gh.addColorStop(0, 'rgba(255,238,196,0.34)');
  gh.addColorStop(0.45, 'rgba(255,238,196,0.04)');
  gh.addColorStop(1, rgba(mix(col.dark, '#2A2058', 0.3), 0.2));
  lc.fillStyle = gh;
  tracePoly(lc, hull);
  lc.fill();
  const gv = lc.createLinearGradient(0, -16, 0, 2);
  gv.addColorStop(0, 'rgba(255,230,170,0.3)');
  gv.addColorStop(0.5, 'rgba(255,230,170,0.08)');
  gv.addColorStop(1, 'rgba(255,230,170,0)');
  lc.fillStyle = gv;
  lc.fillRect(-64, -18, 128, 20);
  // 3. dry-brush grain that follows the planks
  for (let i = 0; i < 4; i++) {
    const f = (x: number, r: number) => yAt(x, fr[i]! + (fr[i + 1]! - fr[i]!) * r);
    streaks(lc, rnd, f, -58, 58, 8, { color: col.dark, alpha: 0.3, w: 0.34, len: [10, 46], r: [0.15, 0.85] });
    streaks(lc, rnd, f, -58, 58, 6, { color: col.light, alpha: 0.26, w: 0.3, len: [8, 34], r: [0.1, 0.8] });
  }
  // 4. the laps: a shadow washed under each upper plank, a pale catch-light on its edge, a broken ink line
  for (let i = 1; i < 4; i++) {
    const seam = (dy: number, p: number): number[] => {
      const o: number[] = [];
      for (let x = HULL.bow + 1; x <= HULL.stern - 1; x += 3) o.push(x, yAt(x, fr[i]!) + dy + wob(x, p + i * 1.7));
      return o;
    };
    inkDashes(lc, seam(1.2, 0.3), rnd, { color: mix(col.dark, '#1A1430', 0.4), alpha: 0.26, w: 1.7, dash: [14, 40], gap: [1, 5], closed: false });
    inkDashes(lc, seam(0.3, 0.3), rnd, { color: '#FFF2D8', alpha: 0.5, w: 0.55, dash: [8, 26], gap: [1.5, 7], closed: false });
    inkDashes(lc, seam(0.75, 0.3), rnd, { color: SEPIA, alpha: 0.5, w: 0.46, dash: [10, 32], gap: [1.6, 7], closed: false });
    if (i < 3)
      for (let x = -52; x <= 53; x += 6.8) {
        if (rnd.chance(0.3)) continue;
        lc.fillStyle = 'rgba(40,28,26,0.4)';
        lc.beginPath();
        lc.arc(x + (i % 2) * 2.2, yAt(x, fr[i]!) + 1.9, 0.26, 0, Math.PI * 2);
        lc.fill();
      }
  }
  // 5. a cool shadow under the gunwale cap
  {
    const sp: number[] = [];
    for (let x = HULL.bow; x <= HULL.stern; x += 3) sp.push(x, gun(x));
    for (let x = HULL.stern; x >= HULL.bow; x -= 3) sp.push(x, gun(x) + 2.7 + 0.3 * Math.sin(x * 0.2));
    lc.fillStyle = rgba(mix(col.dark, COOL, 0.35), 0.17);
    for (let k = 0; k < 3; k++) {
      tracePoly(lc, deform(sp, rnd, 2, 0.01));
      lc.fill();
    }
  }
  // 6. the water's tint and wet darkening toward the waterline: a wavering edge of pooled teal
  {
    const wp: number[] = [];
    for (let x = HULL.bow - 2; x <= HULL.stern + 2; x += 2.5) wp.push(x, -0.7 + 0.5 * Math.sin(x * 0.16 + 1) + 0.28 * Math.sin(x * 0.43));
    for (let x = HULL.stern + 2; x >= HULL.bow - 2; x -= 6) wp.push(x, 15);
    lc.fillStyle = rgba(WATER_TEAL, 0.12);
    for (let k = 0; k < 4; k++) {
      tracePoly(lc, deform(wp, rnd, 2, 0.01));
      lc.fill();
    }
    lc.fillStyle = rgba('#2A6C84', 0.12);
    lc.fillRect(-64, 4, 128, 12);
    const edge: number[] = [];
    for (let x = HULL.bow; x <= HULL.stern; x += 2.5) edge.push(x, -0.5 + 0.5 * Math.sin(x * 0.16 + 1) + 0.28 * Math.sin(x * 0.43));
    inkDashes(lc, edge, rnd, { color: '#12384A', alpha: 0.3, w: 1.3, dash: [12, 36], gap: [0.8, 3], closed: false });
  }
  // 7. granulation speckle: pigment grains and flecks of paper showing through the lit side
  speckle(lc, rnd, -60, -16, 66, 18, 380, col.dark, 0.2, PAPER, 0.32, 0.2);
  speckle(lc, rnd, -60, -16, 120, 28, 460, col.dark, 0.16, PAPER, 0.14, 0.2);
  lc.restore();

  // 8. gunwale cap in natural wood, along the top edge
  const cap: number[] = [];
  for (let x = HULL.bow; x <= HULL.stern; x += 2) cap.push(x, gun(x) - 1.7);
  for (let x = HULL.stern; x >= HULL.bow; x -= 2) cap.push(x, gun(x) + 0.5);
  paintForm(lc, cap, WOOD.base, rnd, { light: WOOD.light, shade: WOOD.shade, alpha: 0.96, layers: 2, grain: 4, grainColor: '#5A3C26', inkW: 0.45, dash: [10, 30], speck: 100 });
  // stem post: a thicker lighter strip, rising a touch at the bow
  paintForm(lc, flat([[-60.8, -17.2], [-58.8, -16.4], [-56.8, -9], [-54.6, -1.6], [-56.6, -1.8], [-58.4, -8.6]]), '#CDA574', rnd, { light: '#FFF0CE', shade: '#5C3E28', alpha: 0.96, layers: 2, grain: 2, grainColor: '#4A301E', inkW: 0.46 });
  // transom: the stern face, a lighter small plank
  paintForm(lc, flat([[57.6, -13.8], [60.2, -14.1], [60.4, -2.4], [58.8, -1.4]]), '#C79E72', rnd, { light: '#FFF0CE', shade: '#5C3E28', alpha: 0.96, layers: 2, grain: 2, grainColor: '#4A301E', inkW: 0.46 });
  // oarlock: an iron horn on the gunwale
  paintForm(
    lc,
    smoothPoly([[-17.2, gun(-19) - 1.7], [-17.4, gun(-19) - 4.8], [-18.6, gun(-19) - 4.8], [-18.7, gun(-19) - 2.6], [-20.3, gun(-19) - 2.6], [-20.6, gun(-19) - 4.8], [-21.8, gun(-19) - 4.8], [-21.6, gun(-19) - 1.7]], 2, true),
    IRON.base,
    rnd,
    { light: IRON.light, shade: IRON.shade, alpha: 0.97, layers: 2, ink: '#101218', inkA: 0.6, inkW: 0.3, speck: 8 },
  );
  // the contour of the hull: weighty away from the light, light on the lit bow, broken
  inkDashes(lc, hull, rnd, { color: SEPIA, alpha: 0.7, w: 0.78, dash: [12, 34], gap: [0.8, 3.2], center: [0, -3], bias: 0.5 });

  // 9. fade the part below the waterline into the water
  lc.globalCompositeOperation = 'destination-in';
  const fade = lc.createLinearGradient(0, -1, 0, 9);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.35, 'rgba(0,0,0,0.78)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  lc.fillStyle = fade;
  lc.fillRect(SPR.x0, SPR.y0, SPR.x1 - SPR.x0, 0 - SPR.y0 + 10);
  lc.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(q, 0, 0, q, -SPR.x0 * q, -SPR.y0 * q);

  // 10. the waterline: a broken pale line where the hull meets the water, so it sits IN the river
  ctx.save();
  tracePoly(ctx, hull);
  ctx.clip();
  const wl = (dy: number, p: number): number[] => {
    const o: number[] = [];
    for (let x = HULL.bow; x <= HULL.stern; x += 2.5) o.push(x, dy + 0.5 * Math.sin(x * 0.16 + 1) + 0.28 * Math.sin(x * 0.43) + wob(x, p) * 0.5);
    return o;
  };
  inkDashes(ctx, wl(0.75, 0), rnd, { color: '#F4FBF8', alpha: 0.62, w: 0.62, dash: [5, 16], gap: [1.5, 6], closed: false });
  inkDashes(ctx, wl(2.1, 2), rnd, { color: '#E2F1F0', alpha: 0.3, w: 0.5, dash: [4, 12], gap: [2, 7], closed: false });
  ctx.restore();
  granulate(cv, 57 + id.length, q, 1, hullRect(q));
  return cv;
}

/* ---------------------------------------------------------------- oars */

function paintOar(id: BoatId, q: number): Part {
  const col = BOAT_COLORS[id];
  const rnd = new Rand(410 + id.length);
  const LEN = 78;
  return part(LEN + 4, 12, 2, 6, q, (ctx) => {
    const F = true;
    // loom: a slim tapered shaft; light along its top edge, the underside deeper
    const shaft = smoothPoly([[0, -0.95], [20, -1.12], [40, -1.0], [58, -0.82], [60, 0], [58, 0.82], [40, 1.0], [20, 1.12], [0, 0.95]], 3, true);
    paintForm(ctx, shaft, '#CBA470', rnd, { light: '#FFF0CC', shade: '#5C3E28', alpha: 0.96, layers: 3, flip: F, grain: 3, grainColor: '#5A3C26', inkW: 0.34, inkA: 0.55, dash: [10, 24], speck: 40 });
    brush(ctx, [[3, -0.5], [28, -0.62], [57, -0.42]], 0.32, '#FFF4D2', 0.6, 0.9);
    brush(ctx, [[3, 0.62], [28, 0.74], [57, 0.56]], 0.46, '#5A3A22', 0.4, 0.9);
    // grip: a lighter wood with a few turns of leather wrap
    paintForm(ctx, smoothPoly([[-1.2, -1.4], [6.4, -1.3], [7.4, 0], [6.4, 1.3], [-1.2, 1.4], [-2, 0]], 3, true), '#DFC593', rnd, { light: '#FFF6DA', shade: '#6B4A30', alpha: 0.96, layers: 2, flip: F, inkW: 0.36, inkA: 0.55, speck: 12 });
    ctx.strokeStyle = 'rgba(120,84,52,0.38)';
    ctx.lineWidth = 0.3;
    for (let x = 0.6; x < 6.4; x += 1.5) {
      ctx.beginPath();
      ctx.moveTo(x, -1.3);
      ctx.lineTo(x + 0.6, 1.3);
      ctx.stroke();
    }
    // leather collar where the oar sits in the lock
    paintForm(ctx, flat([[32, -1.7], [36.6, -1.7], [36.6, 1.7], [32, 1.7]]), '#7C4B2D', rnd, { light: '#B4825A', shade: '#2E1A10', alpha: 0.97, layers: 2, flip: F, ink: '#24140C', inkA: 0.6, inkW: 0.3, speck: 8 });
    // blade: a narrow spoon in the boat's colour, a lighter dished face, a darker wet tip
    const blade = smoothPoly([[57, -0.85], [61, -1.35], [67, -1.9], [73, -1.95], [77, -1.2], [78.4, 0], [77, 1.2], [73, 1.95], [67, 1.9], [61, 1.35], [57, 0.85]], 3, true);
    paintForm(ctx, blade, col.hull, rnd, { light: col.light, shade: col.dark, alpha: 0.96, layers: 3, flip: F, inkW: 0.4, inkA: 0.6, dash: [6, 16], speck: 40, pool: 1.3 });
    ctx.save();
    tracePoly(ctx, blade);
    ctx.clip();
    // the dished face catches the light along its upper edge, and the pigment pools at the tip
    brush(ctx, [[59, -0.5], [66, -0.95], [74, -0.9]], 0.55, mix(col.light, '#FFF4E4', 0.5), 0.55, 0.9);
    brush(ctx, [[60, 0.6], [67, 1.05], [74, 1.0]], 0.45, col.dark, 0.25, 0.9);
    const tip = ctx.createLinearGradient(70, 0, 78.5, 0);
    tip.addColorStop(0, rgba(col.dark, 0));
    tip.addColorStop(1, rgba(col.dark, 0.5));
    ctx.fillStyle = tip;
    ctx.fillRect(68, -3, 12, 6);
    ctx.restore();
  }, 0.6, 14 + id.length);
}

/* ---------------------------------------------------------------- rower */

function shirtTones(id: BoatId): { base: string; light: string; shade: string } {
  const c = BOAT_COLORS[id];
  return { base: mix(c.light, '#FFF1DA', 0.28), light: '#FFF8EA', shade: mix(c.dark, '#2C2450', 0.35) };
}

function paintTorso(id: BoatId, q: number): Part {
  const rnd = new Rand(777 + id.length);
  const col = BOAT_COLORS[id];
  const sh = shirtTones(id);
  return part(22, 34, 11, 30, q, (ctx) => {
    // shirt: a soft rounded trapezoid from hips (y = 0 at the bottom) up to the shoulders (y = -24)
    const body = smoothPoly([[-5.8, 1], [5.6, 1], [6.4, -9], [6.2, -19], [4.8, -25], [-1.5, -26.5], [-5.4, -23], [-6.6, -12]], 4, true);
    paintForm(ctx, body, sh.base, rnd, { light: sh.light, shade: sh.shade, alpha: 0.97, layers: 4, amp: 0.035, flip: true, lightA: 0.3, shadeA: 0.26, inkW: 0.5, speck: 140 });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // a darker pass of the boat's colour sunk into the back (rig -x = screen right) and under the arm: wet-in-wet
    feather(ctx, flat([[-9, -28], [-1.5, -25], [-0.4, -10], [-1.5, 3], [-9, 3]]), col.hull, 0.34, rnd, 6, 1, 0.5, 0.08);
    // a lighter lifted pass on the chest and shoulder toward the light (rig +x)
    feather(ctx, flat([[0.8, -25], [6, -23], [6.6, -10], [3.2, -6], [0.6, -14]]), col.light, 0.4, rnd, 6, 1, 0.4, 0.1);
    // soft folds: a few brushed strokes, not ruled stripes
    brush(ctx, [[-2.6, -21], [-1.2, -14], [-2.4, -6]], 0.7, col.dark, 0.16, 0.9);
    brush(ctx, [[0.4, -19], [1.4, -13], [0.8, -7]], 0.5, col.dark, 0.12, 0.9);
    brush(ctx, [[3.6, -22], [4.6, -17]], 0.45, '#FFF8EA', 0.4, 0.9);
    // shadow under the shoulder where the arm joins
    brush(ctx, [[-2, -23.5], [1.6, -22.4], [3.6, -23.5]], 1.1, mix(col.dark, '#2C2450', 0.4), 0.18, 0.9);
    // belt
    paintForm(ctx, flat([[-7, -2.4], [7, -2.4], [7, 0.2], [-7, 0.2]]), '#6A4A34', rnd, { light: '#A58266', shade: '#2A1A10', alpha: 0.95, layers: 2, flip: true, ink: '#24160E', inkA: 0.5, inkW: 0.3, speck: 12 });
    ctx.restore();
  }, 0.4, 31 + id.length);
}

function paintRowerLimbs(q: number): Pick<RowerSet, 'fore' | 'thigh' | 'shin' | 'foreFar'> {
  const rnd = new Rand(779);
  const F = true;
  const fore = part(22, 10, 3, 5, q, (ctx) => {
    paintForm(ctx, limbPoly(12.6, 3.9, 3.0, 0.15), SKIN.base, rnd, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, flip: F, inkW: 0.4, speck: 40 });
    // a warm darker pass on the underside of the forearm, and a lit top
    brush(ctx, [[2, 1.2], [7, 1.3], [12, 0.9]], 0.9, '#B0705A', 0.3, 0.9);
    brush(ctx, [[2.5, -1.2], [7, -1.3], [11.5, -0.9]], 0.55, '#FFF0DC', 0.4, 0.9);
    // rolled sleeve cuff, a wash in cream
    paintForm(ctx, flat([[-0.5, -2.5], [2.7, -2.5], [2.7, 2.5], [-0.5, 2.5]]), '#F2E7D0', rnd, { light: '#FFFDF2', shade: '#8A7860', alpha: 0.95, layers: 2, flip: F, ink: '#3A2E24', inkA: 0.5, inkW: 0.32, speck: 12 });
    // hand
    paintForm(ctx, smoothPoly([[12, -1.7], [14.2, -1.9], [15.8, -0.4], [15, 1.7], [12.6, 1.9]], 3, true), SKIN.base, rnd, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, flip: F, inkW: 0.36, speck: 10 });
    // fingers curled round the handle, and the thumb
    for (let k = 0; k < 3; k++) brush(ctx, [[13.6 + k * 0.8, -1.5 + k * 0.1], [14.6 + k * 0.7, -0.4 + k * 0.5], [14.2 + k * 0.7, 0.9 + k * 0.35]], 0.22, '#7A3E2C', 0.4, 0.9);
    brush(ctx, [[12.4, -1.4], [13.6, -1.8], [14.8, -1.5]], 0.34, '#FFF0DC', 0.4, 0.9);
  }, 0.5, 41);
  const thigh = part(24, 11, 4, 5.5, q, (ctx) => {
    paintForm(ctx, limbPoly(15.2, 7.4, 5.8, -0.2), TROUSER.base, rnd, { light: TROUSER.light, shade: TROUSER.shade, alpha: 0.96, layers: 4, flip: F, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 70 });
    brush(ctx, [[3, 1.8], [9, 2.2], [14, 1.4]], 1.4, '#2E3E56', 0.25, 0.9);
    brush(ctx, [[3, -2.4], [9, -2.8], [13, -1.8]], 0.7, '#E2EEF6', 0.3, 0.9);
  }, 0.7, 42);
  const shin = part(30, 14, 4, 7, q, (ctx) => {
    paintForm(ctx, limbPoly(14.4, 5.6, 4.4, 0.2), TROUSER.base, rnd, { light: TROUSER.light, shade: TROUSER.shade, alpha: 0.96, layers: 4, flip: F, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 60 });
    brush(ctx, [[2, 1.3], [8, 1.6], [13, 1.2]], 1.0, '#2E3E56', 0.24, 0.9);
    // shoe: a brown wash with a dark sole line
    paintForm(ctx, smoothPoly([[13.6, -2.6], [17.6, -2.8], [21.4, -1.6], [22, 1.4], [18, 2.8], [13.2, 2.6]], 3, true), '#6E4B35', rnd, { light: '#CBA27C', shade: '#2A1A10', alpha: 0.97, layers: 3, flip: F, inkW: 0.5, speck: 20 });
    brush(ctx, [[14, 2.4], [18, 2.7], [21.4, 1.6]], 0.5, '#1E120A', 0.5, 0.9);
  }, 0.7, 43);
  return { fore, thigh, shin, foreFar: tinted(fore, '40,34,70', 0.3) };
}

function paintUpper(id: BoatId, q: number): Part {
  const rnd = new Rand(780 + id.length);
  const col = BOAT_COLORS[id];
  const sh = shirtTones(id);
  return part(18, 10, 3, 5, q, (ctx) => {
    paintForm(ctx, limbPoly(12.4, 4.8, 4.2, -0.2), sh.base, rnd, { light: sh.light, shade: sh.shade, alpha: 0.97, layers: 3, flip: true, lightA: 0.3, inkW: 0.45, speck: 50 });
    brush(ctx, [[2, 1.4], [7, 1.5], [12, 1.0]], 1.0, col.dark, 0.2, 0.9);
    brush(ctx, [[2, -1.5], [7, -1.7], [11, -1.1]], 0.55, '#FFF8EA', 0.4, 0.9);
  }, 0.6, 44 + id.length);
}

function paintHead(id: BoatId, q: number): { head: Part; tails: Part } {
  const col = BOAT_COLORS[id];
  const rnd = new Rand(888 + id.length * 3);
  const F = true;
  // pivot at the base of the neck; the face looks to +x (toward the stern, where a rower faces)
  const head = part(32, 30, 16, 25, q, (ctx) => {
    // neck
    paintForm(ctx, flat([[-1.9, 1.5], [2.4, 1.5], [2.2, -3.4], [-1.7, -3.2]]), SKIN.base, rnd, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, flip: F, inkW: 0.32, speck: 10 });
    brush(ctx, [[-1.2, -2], [-0.8, 0.8]], 1.1, '#9A5C3E', 0.3, 0.9);
    // scarf knot and collar in the boat colour
    paintForm(ctx, smoothPoly([[-3.6, 0.6], [3.4, 0.8], [4.2, -1.4], [3, -3.1], [-2.8, -2.9], [-4, -1.4]], 3, true), col.scarf, rnd, { light: col.light, shade: col.dark, alpha: 0.96, layers: 3, flip: F, inkW: 0.42, speck: 18 });
    // head
    const face = smoothPoly([[-3.8, -9.6], [-1.4, -12.6], [2.6, -12.6], [4.8, -10.2], [5.4, -7.8], [6.8, -6.6], [5.2, -5.6], [4.8, -3.8], [2.4, -2.9], [-1.4, -3.4], [-4.2, -5.8]], 4, true);
    paintForm(ctx, face, SKIN.base, rnd, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 4, amp: 0.025, flip: F, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
    // hair at the back of the head (to -x), under the hat
    paintForm(ctx, smoothPoly([[-4.2, -5.6], [-3.9, -10.4], [-1.2, -12.9], [0.2, -11], [-1, -8.4], [-2.4, -5]], 3, true), '#6B4A30', rnd, { light: '#B58A60', shade: '#2A1A10', alpha: 0.96, layers: 2, flip: F, inkW: 0.36, speck: 20 });
    brush(ctx, [[-3.4, -6], [-3.2, -9.4], [-1.6, -11.8]], 0.4, '#2A1A10', 0.4, 0.9);
    // the shadow the hat brim casts across the forehead and eye
    ctx.save();
    tracePoly(ctx, face);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,66,44,0.28)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(flat([[-5, -11], [7, -11.3], [7, -8.6], [3.2, -8.4], [-1, -9.6], [-5, -9.2]]), rnd, 2, 0.05));
      ctx.fill();
    }
    // warm cheek, blushed wet-in-wet
    ctx.fillStyle = 'rgba(226,120,100,0.22)';
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(flat([[2.2, -6.9], [4.4, -7.1], [4.8, -5.3], [3, -4.7], [1.8, -5.6]]), rnd, 3, 0.15));
      ctx.fill();
    }
    ctx.restore();
    // ear, eye, brow, nose shadow, mouth: a few quick marks
    ctx.fillStyle = 'rgba(190,112,90,0.7)';
    ctx.beginPath();
    ctx.ellipse(-0.6, -7.3, 1.1, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    brush(ctx, [[-1.1, -8.2], [-0.4, -7.2], [-0.8, -6.3]], 0.3, '#7A3E2C', 0.45, 0.9);
    ctx.fillStyle = 'rgba(40,28,22,0.9)';
    ctx.beginPath();
    ctx.ellipse(3.7, -8.15, 0.46, 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    brush(ctx, [[2.8, -9.3], [3.8, -9.5], [4.8, -9.1]], 0.38, '#4A2E20', 0.7, 0.9);
    brush(ctx, [[3.9, -4.9], [4.8, -5]], 0.3, '#7A3A2C', 0.5, 0.9);
    // straw hat: wide brim, domed crown, a band in the boat colour
    const brim = smoothPoly([[-9.4, -11.2], [-4, -13.1], [4.6, -13.2], [10.4, -11.4], [4.4, -9.8], [-4.2, -9.9]], 4, true);
    paintForm(ctx, brim, STRAW.base, rnd, { light: STRAW.light, shade: STRAW.shade, alpha: 0.96, layers: 4, amp: 0.025, flip: F, lightA: 0.32, shadeA: 0.26, inkW: 0.44, speck: 70 });
    // an underside shadow along the front of the brim, and woven rings around the crown
    ctx.save();
    tracePoly(ctx, brim);
    ctx.clip();
    for (let k = 0; k < 6; k++) {
      const pts: Pt[] = [];
      for (let t = 0; t <= 8; t++) {
        const a = Math.PI * (0.15 + 0.7 * (t / 8));
        pts.push([0.5 + Math.cos(a) * (4.4 + k * 0.95), -11.5 + Math.sin(a) * (1.1 + k * 0.1)]);
      }
      brush(ctx, pts, 0.28, k % 2 ? '#8A6226' : '#B8903C', 0.3, 0.9);
    }
    brush(ctx, [[-8.6, -11.3], [-4, -12.6], [3, -12.7]], 0.5, '#FFF4C8', 0.45, 0.9);
    ctx.restore();
    const crown = smoothPoly([[-4.6, -12.3], [-4.2, -16.4], [-1.6, -18.9], [2.2, -18.9], [4.4, -16.2], [4.6, -12.4]], 4, true);
    paintForm(ctx, crown, '#E9CC88', rnd, { light: '#FFF6CC', shade: STRAW.shade, alpha: 0.96, layers: 4, amp: 0.025, flip: F, lightA: 0.32, shadeA: 0.26, inkW: 0.44, speck: 60 });
    ctx.save();
    tracePoly(ctx, crown);
    ctx.clip();
    // the band: a wash in the boat colour that follows the crown's curve, darker where it pools at the ends
    const bandPoly = smoothPoly([[-5.2, -12.4], [-5.2, -14.9], [0, -15.3], [5.2, -14.9], [5.2, -12.4], [0, -12.7]], 3, true);
    paintForm(ctx, bandPoly, col.scarf, rnd, { light: col.light, shade: col.dark, alpha: 0.94, layers: 3, flip: F, ink: '#3A2418', inkA: 0.4, inkW: 0.3, speck: 14 });
    // straw weave: a few brushed strokes up the crown
    for (let k = -3; k <= 3; k++) brush(ctx, [[k * 1.25, -18.9], [k * 1.4, -17], [k * 1.55, -15.2]], 0.26, '#8A6226', 0.3, 0.9);
    brush(ctx, [[-3.6, -17.4], [-2, -18.5]], 0.6, '#FFF8D4', 0.5, 0.9);
    ctx.restore();
  }, 0.45, 51 + id.length);
  // two scarf tails trailing behind the rower (to -x); pivot at the knot
  const tails = part(18, 10, 1, 5, q, (ctx) => {
    const tailPaint = (poly: number[], lenX0: number, lenX1: number) => {
      paintForm(ctx, poly, col.scarf, rnd, { light: col.light, shade: col.dark, alpha: 0.96, layers: 3, flip: F, lightA: 0.3, shadeA: 0.3, inkW: 0.4, speck: 30 });
      // a soft gradient: deeper at the knot, lifting toward the free end
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      const g = ctx.createLinearGradient(lenX0, 0, lenX1, 0);
      g.addColorStop(0, rgba(col.dark, 0.28));
      g.addColorStop(1, rgba(col.light, 0.34));
      ctx.fillStyle = g;
      ctx.fillRect(-14, -3, 16, 9);
      ctx.restore();
    };
    tailPaint(smoothPoly([[0, -1.2], [-3.6, -1.9], [-8, -1.3], [-11, 0.5], [-8.2, 1.3], [-4, 1.2], [0, 1]], 3, true), 0, -11);
    tailPaint(smoothPoly([[0, 0.6], [-3, 1.5], [-6.4, 2.6], [-9, 4.2], [-6.4, 4.4], [-3, 3], [0, 1.8]], 3, true), 0, -9);
  }, 0.6, 61 + id.length);
  return { head, tails };
}

/* ---------------------------------------------------------------- set */

export function buildRowerSet(q: number): RowerSet {
  const limbs = paintRowerLimbs(q);
  const torso = {} as Record<BoatId, Part>;
  const head = {} as Record<BoatId, Part>;
  const tails = {} as Record<BoatId, Part>;
  const upper = {} as Record<BoatId, Part>;
  const upperFar = {} as Record<BoatId, Part>;
  const oars = {} as Record<BoatId, Part>;
  const oarsWet = {} as Record<BoatId, Part>;
  const hullBack = {} as Record<BoatId, HTMLCanvasElement>;
  const hullFront = {} as Record<BoatId, HTMLCanvasElement>;
  for (const id of ['cash', 'savings', 'invest'] as BoatId[]) {
    const h = paintHead(id, q);
    head[id] = h.head;
    tails[id] = h.tails;
    torso[id] = paintTorso(id, q);
    upper[id] = paintUpper(id, q);
    upperFar[id] = tinted(upper[id]!, '40,34,70', 0.3);
    oars[id] = paintOar(id, q);
    oarsWet[id] = tinted(oars[id]!, '28,92,120', 0.34);
    hullBack[id] = paintHullBack(id, q);
    hullFront[id] = paintHullFront(id, q);
  }
  return { q, ...limbs, torso, head, tails, upper, upperFar, oars, oarsWet, hullBack, hullFront };
}
