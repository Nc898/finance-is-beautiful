/**
 * The price board (the Board contract in partsApi.ts): a split-flap board in a wooden frame, headed "This week's
 * basket" on a painted rail. The month is three letter cells and, after a space, the year four digit cells; each of the six items has its name on a painted enamel strip
 * and its price in a row of eight flap cells; under a painted rule is the total.
 *
 * Painted once per size (prepare): the frame, the dark board and the troughs and wells the cells sit in, glazed with
 * the room's light (light.ts), and the cells' flaps: cream enamel faces with brush-painted numerals (not a font), a few
 * variants of each glyph so no two cells are clones. The settled board is kept on one canvas (the painted board with
 * every cell's face on it, each face multiplied by the same glaze, so a face looks as if it were painted into the
 * glazed picture); per frame only the cells that are mid-flip are redrawn on it.
 *
 * A cell that must change does one flap, straight from its old glyph to its new one (blank, "$", "~", ".", "0" … "9"; the
 * year's cells carry the digits): the top half of the old glyph falls over the bottom, shaded as it turns, revealing
 * the new top, and lands showing the new bottom half on its back, with the dark gap between the halves. Nothing between
 * is ever shown, so a glance at the board never reads a figure that is not the old or the new one. The cells of a
 * row that change start a few hundredths of a second apart, left to right. A new target that arrives mid-flap lets the
 * falling flap land and then flaps once more to the latest target, so a cell is never more than one target behind.
 */
import type { BoardContent, ItemKey } from '../types';
import { ITEMS, ITEM_KEYS } from '../types';
import { BOARD, BOARD_FLAPS, BOARD_FRAME, MONTH_CELLS, PRICE_CELLS, YEAR_CELLS, type FlapSize } from './geom';
import type { Board } from './partsApi';
import { Rand, hashSeed } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { smoothPoly } from '../../river/scene/boatInk';
import { buildGlaze, glazePixels, type Glaze } from './light';
import { layoutText } from './hand';
import { INK, LIGHT, blobPoly, grain, mix, mottle, pen, rectPoly, ribbon, spriteCtx, wash } from './paint';

const TAU = Math.PI * 2;
const P = Math.PI;

/* ------------------------------------------------------------------ the drums */

const PRICE_DRUM = ' $~.0123456789';
const YEAR_DRUM = '0123456789';
/** the capitals the month cells show (JAN … DEC) */
const MONTH_DRUM = 'ABCDEFGJLMNOPRSTUVY';
/** how many painted variants of every glyph; a cell keeps its own */
const VARIANTS = 4;

/* ------------------------------------------------------------------ flap timing (seconds, the mechanism's own pace) */

/** one flap's fall, from the old glyph straight to the new one: about 9 frames at 60 fps, so it reads as a flap */
const FLAP = 0.15;
/** the cells of a row that change start this much later, each, left to right */
const RIPPLE = 0.02;

/* ------------------------------------------------------------------ the numerals, as brush strokes */

interface Stroke {
  /** control points in the glyph's box (x 0 … 1 left to right, y 0 … 1 top to bottom) */
  p: number[];
  /** smooth the path through the points (curves) or keep it as a polyline */
  s?: boolean;
  /** the brush's weight relative to the digit's */
  w?: number;
}

const ell = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): number[] => {
  const o: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  return o;
};
const flip180 = (st: Stroke[]): Stroke[] => st.map((s) => ({ ...s, p: s.p.map((v, i) => 1 - v + (i % 2 === 0 ? 0 : 0)) }));

const SIX: Stroke[] = [
  { p: [0.84, 0.1, 0.56, 0.0, 0.26, 0.12, 0.08, 0.46, 0.05, 0.72], s: true },
  { p: ell(0.5, 0.7, 0.43, 0.3, 1.05 * P, 3.15 * P, 18) },
];

/** the glyphs' skeletons: round forms open and a little old-fashioned, as a sign-painter's hand makes them */
const GLYPHS: Record<string, Stroke[]> = {
  '0': [{ p: ell(0.5, 0.5, 0.44, 0.5, 1.3 * P, 3.4 * P, 24) }],
  '1': [{ p: [0.16, 0.3, 0.36, 0.13, 0.56, 0.0], s: true, w: 0.85 }, { p: [0.56, 0.0, 0.56, 0.5, 0.56, 1.02], w: 1.05 }],
  '2': [{ p: [...ell(0.5, 0.3, 0.42, 0.28, 1.12 * P, 2.35 * P, 14), 0.5, 0.72, 0.1, 0.96], s: true }, { p: [0.06, 0.97, 0.5, 0.97, 0.97, 0.97], w: 0.95 }],
  '3': [{ p: ell(0.5, 0.27, 0.38, 0.23, 1.2 * P, 2.5 * P, 12) }, { p: ell(0.5, 0.74, 0.44, 0.26, 1.5 * P, 2.82 * P, 14) }],
  '4': [{ p: [0.68, -0.02, 0.68, 1.02], w: 1.05 }, { p: [0.7, 0.0, 0.0, 0.72] }, { p: [-0.02, 0.72, 0.98, 0.72], w: 0.9 }],
  '5': [{ p: [0.88, 0.04, 0.22, 0.04], w: 0.95 }, { p: [0.22, 0.04, 0.14, 0.46] }, { p: ell(0.48, 0.7, 0.44, 0.3, 1.2 * P, 2.82 * P, 16) }],
  '6': SIX,
  '7': [{ p: [0.03, 0.04, 0.96, 0.04], w: 0.95 }, { p: [0.96, 0.05, 0.7, 0.42, 0.38, 1.02], s: true }],
  '8': [{ p: ell(0.5, 0.26, 0.34, 0.24, 1.5 * P, 3.6 * P, 16) }, { p: ell(0.5, 0.74, 0.42, 0.27, 1.5 * P, 3.6 * P, 18) }],
  '9': flip180(SIX),
  $: [
    { p: [0.84, 0.27, 0.66, 0.1, 0.36, 0.08, 0.15, 0.24, 0.22, 0.43, 0.5, 0.5, 0.78, 0.57, 0.88, 0.75, 0.68, 0.92, 0.38, 0.92, 0.14, 0.75], s: true },
    { p: [0.5, -0.07, 0.5, 1.07], w: 0.5 },
  ],
  '~': [{ p: [0.02, 0.62, 0.2, 0.42, 0.42, 0.42, 0.56, 0.56, 0.74, 0.66, 0.96, 0.42], s: true, w: 0.9 }],
  '.': [{ p: [0.5, 0.86, 0.5, 0.99], w: 0.95 }],

  // the capitals the twelve months need, in the same hand: upright, the downstrokes heavy, the crossbars thin
  A: [{ p: [0.02, 1.0, 0.5, 0.0] }, { p: [0.5, 0.0, 0.98, 1.0] }, { p: [0.2, 0.68, 0.8, 0.68], w: 0.85 }],
  B: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.02, ...ell(0.5, 0.26, 0.38, 0.24, 1.5 * P, 2.5 * P, 10), 0.12, 0.5] }, { p: [0.12, 0.5, ...ell(0.5, 0.745, 0.42, 0.255, 1.5 * P, 2.5 * P, 12), 0.12, 0.998] }],
  C: [{ p: ell(0.54, 0.5, 0.48, 0.5, 1.8 * P, 0.2 * P, 20) }],
  D: [{ p: [0.1, -0.01, 0.1, 1.01], w: 1.05 }, { p: [0.1, 0.02, ...ell(0.45, 0.5, 0.45, 0.48, 1.5 * P, 2.5 * P, 14), 0.1, 0.98] }],
  E: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.03, 0.92, 0.03], w: 0.9 }, { p: [0.12, 0.5, 0.76, 0.5], w: 0.85 }, { p: [0.12, 0.98, 0.94, 0.98], w: 0.9 }],
  F: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.03, 0.92, 0.03], w: 0.9 }, { p: [0.12, 0.5, 0.76, 0.5], w: 0.85 }],
  G: [{ p: [...ell(0.52, 0.5, 0.48, 0.5, 1.8 * P, 0.05 * P, 22), 0.97, 0.52, 0.56, 0.52] }],
  J: [{ p: [0.72, 0.0, 0.72, 0.72, ...ell(0.42, 0.72, 0.3, 0.27, 0, 0.95 * P, 10)] }],
  L: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.98, 0.92, 0.98], w: 0.9 }],
  M: [{ p: [0.06, 1.01, 0.06, 0.0], w: 1.05 }, { p: [0.06, 0.0, 0.5, 0.72], w: 0.9 }, { p: [0.5, 0.72, 0.94, 0.0], w: 0.9 }, { p: [0.94, 0.0, 0.94, 1.01], w: 1.05 }],
  N: [{ p: [0.1, 1.01, 0.1, 0.0], w: 1.05 }, { p: [0.1, 0.0, 0.9, 1.0], w: 0.9 }, { p: [0.9, 1.01, 0.9, 0.0], w: 1.05 }],
  O: [{ p: ell(0.5, 0.5, 0.48, 0.5, 1.3 * P, 3.4 * P, 26) }],
  P: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.02, ...ell(0.5, 0.27, 0.38, 0.25, 1.5 * P, 2.5 * P, 12), 0.12, 0.52] }],
  R: [{ p: [0.12, -0.01, 0.12, 1.01], w: 1.05 }, { p: [0.12, 0.02, ...ell(0.5, 0.27, 0.38, 0.25, 1.5 * P, 2.5 * P, 12), 0.12, 0.52] }, { p: [0.46, 0.52, 0.92, 1.0], w: 0.95 }],
  S: [{ p: [0.86, 0.2, 0.66, 0.04, 0.36, 0.03, 0.14, 0.2, 0.2, 0.4, 0.5, 0.5, 0.8, 0.6, 0.88, 0.8, 0.66, 0.97, 0.34, 0.97, 0.1, 0.8], s: true }],
  T: [{ p: [0.02, 0.03, 0.98, 0.03], w: 0.9 }, { p: [0.5, 0.03, 0.5, 1.01], w: 1.05 }],
  U: [{ p: [0.1, 0.0, 0.1, 0.65, ...ell(0.5, 0.65, 0.4, 0.35, P, 0, 12), 0.9, 0.0] }],
  V: [{ p: [0.02, 0.0, 0.5, 1.0] }, { p: [0.5, 1.0, 0.98, 0.0] }],
  Y: [{ p: [0.02, 0.0, 0.5, 0.52] }, { p: [0.98, 0.0, 0.5, 0.52] }, { p: [0.5, 0.52, 0.5, 1.01], w: 1.05 }],
};

/** the ink the numerals are painted in (a soft black, warm) */
const NUMERAL_INK = '#26160F';
/** the enamel of the flaps: each variant a little warmer or greyer */
const ENAMEL = ['#F8E8BF', '#F5E2B4', '#FAEBC7', '#F2DDAE'];

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** a numeral painted with the brush onto a face (world units, the face's own box), ink under a thin wash */
function paintGlyph(ctx: CanvasRenderingContext2D, ch: string, w: number, h: number, rnd: Rand): void {
  const strokes = GLYPHS[ch];
  if (!strokes) return;
  const Hg = h * 0.7;
  const Wg = Hg * 0.6;
  const rot = rnd.range(-0.05, 0.05);
  const sc = rnd.range(0.95, 1.05);
  const cx = w / 2 + rnd.range(-0.5, 0.5);
  const cy = h / 2 + rnd.range(-0.4, 0.4);
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const wob = 0.014 * Hg;
  const brush = h * 0.118;
  // a hand's own habits in this cell: a lean, a pressure
  const lean = rnd.range(-0.07, 0.09);
  const press = rnd.range(0.93, 1.08);
  for (const st of strokes) {
    const pts: [number, number][] = [];
    for (let i = 0; i < st.p.length; i += 2) {
      const gy = st.p[i + 1]! - 0.5;
      const x = (st.p[i]! - 0.5 + gy * lean) * Wg * sc + rnd.range(-wob, wob);
      const y = gy * Hg * sc + rnd.range(-wob, wob);
      pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    const path = st.s ? smoothPoly(pts, 5, false) : densify(pts);
    const wd = brush * press * (st.w ?? 1) * rnd.range(0.94, 1.06);
    // the ink soaks a little into the enamel round the stroke
    ctx.fillStyle = rgba(NUMERAL_INK, 0.15);
    brushStroke(ctx, path, wd * 1.3, rnd);
    ctx.fillStyle = rgba(NUMERAL_INK, rnd.range(0.94, 0.99));
    brushStroke(ctx, path, wd, rnd);
    // the dry bristle's streak down the heavy strokes
    ctx.fillStyle = rgba('#F3E2B8', 0.16);
    brushStroke(ctx, offsetPath(path, rnd.range(-0.2, 0.2) * wd, wd), wd * 0.13, rnd);
  }
}

/** a sign-writer's stroke: heavy where the brush travels down, thin on its joins and crossbars, the ends cut square,
 *  the weight wandering a little along it */
function brushStroke(ctx: CanvasRenderingContext2D, path: number[], w: number, rnd: Rand): void {
  const n = path.length / 2;
  if (n < 2) return;
  const L: number[] = [];
  const R: number[] = [];
  const ph = rnd.range(0, 6);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = path[2 * b]! - path[2 * a]!;
    let dy = path[2 * b + 1]! - path[2 * a + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const heavy = 0.58 + 0.52 * Math.abs(dy);
    const hw = (w / 2) * heavy * (1 + 0.07 * Math.sin(i * 0.9 + ph));
    L.push(path[2 * i]! - dy * hw, path[2 * i + 1]! + dx * hw);
    R.push(path[2 * i]! + dy * hw, path[2 * i + 1]! - dx * hw);
  }
  ctx.beginPath();
  ctx.moveTo(L[0]!, L[1]!);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i]!, L[i + 1]!);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i]!, R[i + 1]!);
  ctx.closePath();
  ctx.fill();
}

/** a polyline with extra points along its straight runs (so a ribbon follows it smoothly) */
function densify(pts: [number, number][]): number[] {
  const out: number[] = [pts[0]![0], pts[0]![1]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2.2));
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}

function offsetPath(path: number[], off: number, scale: number): number[] {
  const out: number[] = [];
  const n = path.length / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = path[2 * b]! - path[2 * a]!;
    const dy = path[2 * b + 1]! - path[2 * a + 1]!;
    const l = Math.hypot(dx, dy) || 1;
    out.push(path[2 * i]! - (dy / l) * off, path[2 * i + 1]! + (dx / l) * off);
  }
  void scale;
  return out;
}

/** a blank flap: painted the board's own dark ground, so an empty cell recedes; only its edge catches the light */
function paintDarkFace(sz: FlapSize, variant: number, rnd: Rand, cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  const { w, h } = sz;
  const r = Math.min(w, h) * 0.11;
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.fillStyle = ['#222B27', '#252E2A', '#202925', '#232C28'][variant % 4]!;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#2E3C36', '#1A2420', '#34423A', '#18221E']), rnd.range(0.2, 0.4));
    tracePoly(ctx, deform(blobPoly(rnd.range(0, w), rnd.range(0, h), rnd.range(w * 0.3, w * 0.7), rnd.range(h * 0.1, h * 0.25), rnd, 9, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
  // a faint sheen on the upper half (the lamp), the lower half a shade deeper
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(210,225,215,0.13)');
  g.addColorStop(0.48, 'rgba(210,225,215,0.02)');
  g.addColorStop(0.52, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, '#10181A', 0, 0, w, h, 0, 0.2, 351 + variant);
  ctx.restore();
  // the lit top edge and the lit lip of the lower half, the rest in shadow
  ctx.fillStyle = rgba('#D8E2D2', 0.34);
  ribbon(ctx, [r, 0.22, w - r, 0.22], 0.4, 0.8);
  ctx.fillStyle = rgba('#E8D8A8', 0.22);
  ribbon(ctx, [r, h / 2 + 0.35, w - r, h / 2 + 0.35], 0.3, 0.8);
  ctx.fillStyle = rgba('#050807', 0.5);
  ribbon(ctx, [r, h - 0.18, w - r, h - 0.18], 0.4, 0.8);
  ribbon(ctx, [0.16, r, 0.16, h - r], 0.3, 0.8);
  ribbon(ctx, [w - 0.16, r, w - 0.16, h - r], 0.4, 0.8);
  return cv;
}

/** one flap face (the whole cell, both halves) with a glyph: cream enamel washed in layers, the numeral in ink under a
 *  thin wash, the paper's tooth, the edges worn a little */
function paintFace(sz: FlapSize, ch: string, variant: number, q: number, seedBase: number): HTMLCanvasElement {
  const { w, h } = sz;
  const { cv, ctx } = spriteCtx({ x: 0, y: 0, w, h }, q);
  const rnd = new Rand(hashSeed(seedBase, ch.charCodeAt(0), variant, Math.round(h)));
  const r = Math.min(w, h) * 0.11;
  if (ch === ' ') return paintDarkFace(sz, variant, rnd, cv, ctx);
  const tone = mix(ENAMEL[variant % ENAMEL.length]!, rnd.pick(['#E6C98A', '#FBF0CF', '#E2BE80', '#F0D49A']), rnd.range(0.04, 0.14));
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, w, h);
  // the enamel laid in washes that drift a little in hue and value
  wash(ctx, rectPoly(0.2, 0.2, w - 0.2, h - 0.2, rnd, 0.5), mix(tone, '#F6EBCF', 0.4), 0.5, rnd, 3, 0.03);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba(rnd.pick(['#DDBB7C', '#FBF0D0', '#D6B070', '#EDCF94']), rnd.range(0.08, 0.17));
    tracePoly(ctx, deform(blobPoly(rnd.range(0, w), rnd.range(0, h), rnd.range(w * 0.25, w * 0.6), rnd.range(h * 0.12, h * 0.3), rnd, 9, 0.3), rnd, 1, 0.1));
    ctx.fill();
  }
  // the top half faces the lamp, the lower half a little less; the enamel darker at the edges where it is thin
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,248,226,0.26)');
  g.addColorStop(0.3, 'rgba(255,248,226,0.1)');
  g.addColorStop(0.49, 'rgba(255,248,226,0)');
  g.addColorStop(0.51, 'rgba(70,48,24,0)');
  g.addColorStop(1, 'rgba(70,48,24,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const ge = ctx.createLinearGradient(0, 0, w, 0);
  // the enamel pools toward one edge (it varies by cell); the edge toward the window is cooler
  const poolRight = variant % 2 === 0;
  ge.addColorStop(0, poolRight ? 'rgba(150,170,190,0.1)' : 'rgba(176,128,62,0.3)');
  ge.addColorStop(0.16, 'rgba(176,128,62,0)');
  ge.addColorStop(0.84, 'rgba(176,128,62,0)');
  ge.addColorStop(1, poolRight ? 'rgba(176,128,62,0.3)' : 'rgba(176,128,62,0.14)');
  ctx.fillStyle = ge;
  ctx.fillRect(0, 0, w, h);
  // the shadow the gap throws on each half's edge
  const gh = ctx.createLinearGradient(0, h * 0.5 - h * 0.1, 0, h * 0.5);
  gh.addColorStop(0, 'rgba(40,26,14,0)');
  gh.addColorStop(1, 'rgba(40,26,14,0.1)');
  ctx.fillStyle = gh;
  ctx.fillRect(0, h * 0.4, w, h * 0.1);
  const gl = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.5 + h * 0.07);
  gl.addColorStop(0, 'rgba(40,26,14,0.09)');
  gl.addColorStop(1, 'rgba(40,26,14,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, h * 0.5, w, h * 0.07);
  // fine specks and a hairline craze, as old enamel has (now and then)
  const specks = rnd.int(0, 3);
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = rgba('#3A2E26', rnd.range(0.12, 0.3));
    ctx.beginPath();
    ctx.arc(rnd.range(1, w - 1), rnd.range(1, h - 1), rnd.range(0.12, 0.3), 0, TAU);
    ctx.fill();
  }
  if (rnd.chance(0.35)) {
    ctx.strokeStyle = rgba('#7A6648', 0.2);
    ctx.lineWidth = 0.15;
    ctx.beginPath();
    const x0 = rnd.range(0, w);
    const y0 = rnd.range(0, h);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + rnd.range(-2.5, 2.5), y0 + rnd.range(1.5, 4));
    ctx.stroke();
  }
  paintGlyph(ctx, ch, w, h, rnd);
  // a thin warm wash over the ink, so it lies under the enamel's glaze
  wash(ctx, rectPoly(0, 0, w, h, rnd, 0.4), '#F2E6C6', 0.05, rnd, 2, 0.02);
  grain(ctx, '#8A7048', 0, 0, w, h, 0.07, 0.1, 301 + variant);
  ctx.restore();
  // the flap's edge in ink, broken: its corners are rounded and the lit top edge is nearly lost
  ctx.save();
  ctx.fillStyle = rgba('#2A1E18', 0.35);
  ribbon(ctx, [r, 0.16, w - r, 0.16], 0.3, 0.8);
  ribbon(ctx, [r, h - 0.16, w - r, h - 0.16], 0.4, 0.8);
  ribbon(ctx, [0.16, r, 0.16, h - r], 0.3, 0.8);
  ribbon(ctx, [w - 0.16, r, w - 0.16, h - r], 0.4, 0.8);
  ctx.restore();
  return cv;
}

/* ------------------------------------------------------------------ cells */

type CellSet = 'year' | 'row' | 'total';

interface Cell {
  set: CellSet;
  /** which line it is on (0 year, 1 … 6 the items, 7 total) and its place along it */
  line: number;
  col: number;
  drum: string;
  /** world box of its face */
  x: number;
  y: number;
  w: number;
  h: number;
  variant: number;
  /** the glyph it shows (an index in the drum) and the one it is going to */
  cur: number;
  tgt: number;
  /** while a flap is falling: the glyph it lands on (the target when it began) */
  to: number;
  /** a flap is falling: its progress 0 … 1, and how long the whole fall takes */
  flipping: boolean;
  p: number;
  dur: number;
  /** wait this long before the next flap starts (the ripple) */
  delay: number;
  dirty: boolean;
  /** seconds since its target last changed (harness statistics) */
  age: number;
  /** device pixels at the current density: the face's place and the rect restored from the painting */
  px: number;
  py: number;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  const F = BOARD_FLAPS;
  const CX = (BOARD.x0 + BOARD.x1) / 2;
  const mk = (set: CellSet, line: number, col: number, drum: string, x: number, y: number, sz: FlapSize): void => {
    cells.push({
      set,
      line,
      col,
      drum,
      x,
      y,
      w: sz.w,
      h: sz.h,
      variant: hashSeed(77, line, col) % VARIANTS,
      cur: 0,
      tgt: 0,
      to: 0,
      flipping: false,
      p: 0,
      dur: FLAP,
      delay: 0,
      dirty: true,
      age: 0,
      px: 0,
      py: 0,
      rx: 0,
      ry: 0,
      rw: 0,
      rh: 0,
    });
  };
  // the month (three letters), a space of one cell, and the year (four digits), centred together
  const mw = MONTH_CELLS * F.year.w + (MONTH_CELLS - 1) * F.year.gap;
  const yw = YEAR_CELLS * F.year.w + (YEAR_CELLS - 1) * F.year.gap;
  const x0 = CX - (mw + F.year.w + yw) / 2;
  for (let i = 0; i < MONTH_CELLS; i++) mk('year', 0, i, MONTH_DRUM, x0 + i * (F.year.w + F.year.gap), F.yearTop, F.year);
  for (let i = 0; i < YEAR_CELLS; i++) mk('year', 0, MONTH_CELLS + i, YEAR_DRUM, x0 + mw + F.year.w + i * (F.year.w + F.year.gap), F.yearTop, F.year);
  const row = (set: CellSet, line: number, top: number, sz: FlapSize): void => {
    const total = PRICE_CELLS * sz.w + (PRICE_CELLS - 1) * sz.gap;
    for (let i = 0; i < PRICE_CELLS; i++) mk(set, line, i, PRICE_DRUM, F.priceRight - total + i * (sz.w + sz.gap), top, sz);
  };
  ITEM_KEYS.forEach((_, i) => row('row', i + 1, F.rowTops[i]!, F.row));
  row('total', 7, F.totalTop, F.total);
  return cells;
}

/** what each cell should show for a content, as its characters (the year's 4 digits, 6 prices of 8, the total's 8) */
function cellChars(c: BoardContent): string[] {
  const out: string[] = [];
  for (const ch of c.month.toUpperCase().padEnd(MONTH_CELLS, 'A').slice(0, MONTH_CELLS)) out.push(ch);
  const year = c.year.padStart(YEAR_CELLS, '0').slice(-YEAR_CELLS);
  for (const ch of year) out.push(ch);
  const price = (s: string) => {
    const t = s.padStart(PRICE_CELLS, ' ').slice(-PRICE_CELLS);
    for (const ch of t) out.push(ch);
  };
  for (const k of ITEM_KEYS) price(c.prices[k]);
  price(c.total);
  return out;
}

const keyOf = (c: BoardContent): string => `${c.month}|${c.year}|${ITEM_KEYS.map((k) => c.prices[k]).join('|')}|${c.total}`;

/* ------------------------------------------------------------------ the board */

/** the Board, and (for the harness) how many cells are not yet showing their target */
export function createBoard(): Board & { pending(): number; ages(): number[]; states(): { cur: string; to: string | null; tgt: string }[] } {
  const cells = buildCells();
  const FR = BOARD_FRAME;
  const fx0 = BOARD.x0 - FR.side;
  const fx1 = BOARD.x1 + FR.side;
  const fy0 = BOARD.y0 - FR.rail;
  const fy1 = BOARD.y1 + FR.side;
  const CX = (BOARD.x0 + BOARD.x1) / 2;
  const sbox = { x: fx0 - 10, y: fy0 - 10, w: fx1 - fx0 + 20, h: fy1 - fy0 + 20 };

  let q = 0;
  let paint: HTMLCanvasElement | null = null;
  let lightmap: HTMLCanvasElement | null = null;
  let live: HTMLCanvasElement | null = null;
  let liveCtx: CanvasRenderingContext2D | null = null;
  const faces: Record<CellSet, Map<string, HTMLCanvasElement[]>> = { year: new Map(), row: new Map(), total: new Map() };
  let allDirty = true;

  let target: BoardContent = { month: '', year: '', prices: { bread: '', eggs: '', coffee: '', bananas: '', chicken: '', flour: '' }, total: '' };
  let targetKey = '';

  /* ---------------------------------------------------------------- the painting under the faces */

  const paintStatic = async (tick: () => Promise<void>, check: () => boolean): Promise<{ cv: HTMLCanvasElement; g: Glaze } | null> => {
    const { cv, ctx } = spriteCtx(sbox, q);
    const rnd = new Rand(7771);

    // the frame's shadow on the wall (soft, down and to the right: the light is upper left)
    ctx.save();
    ctx.filter = `blur(${Math.max(1, 3.2 * q)}px)`;
    ctx.fillStyle = 'rgba(46,30,18,0.32)';
    ctx.fillRect(fx0 + 3, fy0 + 5, fx1 - fx0 + 1, fy1 - fy0 + 3);
    ctx.restore();

    // the frame: oak members, each washed along its own grain and turned to the light; the top rail painted as a sign
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx0 - 1, fy0 - 1, fx1 - fx0 + 2, fy1 - fy0 + 2);
    ctx.clip();
    const members: { poly: number[]; col: string; vertical: boolean; r: [number, number, number, number] }[] = [
      { poly: [fx0, BOARD.y0, BOARD.x0, BOARD.y0, BOARD.x0, BOARD.y1, fx0, fy1], col: '#946238', vertical: true, r: [fx0, BOARD.y0, BOARD.x0, fy1] },
      { poly: [BOARD.x1, BOARD.y0, fx1, BOARD.y0, fx1, fy1, BOARD.x1, BOARD.y1], col: '#6E4628', vertical: true, r: [BOARD.x1, BOARD.y0, fx1, fy1] },
      { poly: [fx0, fy1, BOARD.x0, BOARD.y1, BOARD.x1, BOARD.y1, fx1, fy1], col: '#7A4E2C', vertical: false, r: [fx0, BOARD.y1, fx1, fy1] },
      { poly: [fx0, fy0, fx1, fy0, fx1, BOARD.y0, fx0, BOARD.y0], col: '#2F4637', vertical: false, r: [fx0, fy0, fx1, BOARD.y0] },
    ];
    for (const [mi, m] of members.entries()) {
      ctx.save();
      tracePoly(ctx, m.poly);
      ctx.clip();
      const [mx0, my0, mx1, my1] = m.r;
      wash(ctx, rectPoly(mx0 - 1, my0 - 1, mx1 + 1, my1 + 1, rnd, 0.2), m.col, 0.97, rnd, 2, 0.004);
      const thick = m.vertical ? mx1 - mx0 : my1 - my0;
      const len = m.vertical ? my1 - my0 : mx1 - mx0;
      // its colour drifts along it in small washes
      for (let k = 0; k < len / 9; k++) {
        const t = rnd.next();
        const cx = m.vertical ? (mx0 + mx1) / 2 : mx0 + t * (mx1 - mx0);
        const cy = m.vertical ? my0 + t * (my1 - my0) : (my0 + my1) / 2;
        const cols = mi === 3 ? ['#3B5645', '#233A2D', '#34503F', '#1F3227'] : ['#B88050', '#6A4024', '#A87448', '#5A3A20'];
        ctx.fillStyle = rgba(rnd.pick(cols), rnd.range(0.12, 0.26));
        tracePoly(ctx, deform(blobPoly(cx, cy, m.vertical ? thick * 0.55 : rnd.range(10, 22), m.vertical ? rnd.range(10, 22) : thick * 0.3, rnd, 10, 0.3), rnd, 1, 0.1));
        ctx.fill();
      }
      // the grain: long fine lines along the member, a little wavy
      const n = Math.round(thick * (mi === 3 ? 0.5 : 0.9));
      for (let g = 0; g < n; g++) {
        const off = rnd.range(0.08, 0.92) * thick;
        const a0 = rnd.range(0, len * 0.4);
        const a1 = a0 + rnd.range(len * 0.25, len * 0.7);
        const pts: number[] = [];
        for (let k = 0; k <= 10; k++) {
          const u = a0 + ((a1 - a0) * k) / 10;
          const w = Math.sin(u * 0.08 + g) * 0.5;
          pts.push(m.vertical ? mx0 + off + w : mx0 + u, m.vertical ? my0 + u : my0 + off + w);
        }
        ctx.fillStyle = rgba(mi === 3 ? '#0E1A12' : '#2E1808', rnd.range(0.1, mi === 3 ? 0.18 : 0.26));
        ribbon(ctx, pts, rnd.range(0.25, 0.6), 0.9);
      }
      ctx.restore();
    }
    // the chamfer round the board: lit on the top and the left, in shade on the right and below
    const ch = 2.4;
    const chamfer = (pts: number[], col: string, a: number) => {
      ctx.fillStyle = rgba(col, a);
      tracePoly(ctx, pts);
      ctx.fill();
    };
    chamfer([BOARD.x0 - ch, BOARD.y0 - ch, BOARD.x1 + ch, BOARD.y0 - ch, BOARD.x1, BOARD.y0, BOARD.x0, BOARD.y0], '#9FB5A6', 0.4);
    chamfer([BOARD.x0 - ch, BOARD.y0 - ch, BOARD.x0, BOARD.y0, BOARD.x0, BOARD.y1, BOARD.x0 - ch, BOARD.y1 + ch], '#E2B47A', 0.5);
    chamfer([BOARD.x1 + ch, BOARD.y0 - ch, BOARD.x1 + ch, BOARD.y1 + ch, BOARD.x1, BOARD.y1, BOARD.x1, BOARD.y0], '#2A160A', 0.5);
    chamfer([BOARD.x0 - ch, BOARD.y1 + ch, BOARD.x0, BOARD.y1, BOARD.x1, BOARD.y1, BOARD.x1 + ch, BOARD.y1 + ch], '#2A160A', 0.42);
    for (const [ax, ay, bx, by, a] of [
      [fx0, fy1, BOARD.x0 - ch, BOARD.y1 + ch, 0.55],
      [fx1, fy1, BOARD.x1 + ch, BOARD.y1 + ch, 0.65],
    ] as const) pen(ctx, ax, ay, bx, by, 0.5, INK, a, rnd, 0.1);
    // the rail's gilt pinstripe, a little in from its edge, and a lit upper edge
    {
      const i0 = 2.6;
      ctx.fillStyle = rgba('#D6B468', 0.8);
      for (const pts of [
        [fx0 + i0, fy0 + i0, fx1 - i0, fy0 + i0],
        [fx0 + i0, BOARD.y0 - i0, fx1 - i0, BOARD.y0 - i0],
        [fx0 + i0, fy0 + i0, fx0 + i0, BOARD.y0 - i0],
        [fx1 - i0, fy0 + i0, fx1 - i0, BOARD.y0 - i0],
      ]) {
        const wob: number[] = [];
        const horizontal = pts[1] === pts[3];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const jx = horizontal ? 0 : rnd.range(-0.12, 0.12);
          const jy = horizontal ? rnd.range(-0.12, 0.12) : 0;
          wob.push(pts[0]! + (pts[2]! - pts[0]!) * t + jx, pts[1]! + (pts[3]! - pts[1]!) * t + jy);
        }
        ribbon(ctx, wob, 0.75, 0.6, 0.1);
      }
      ctx.fillStyle = rgba('#FFF3C8', 0.35);
      ribbon(ctx, [fx0 + 5, fy0 + 3.2, fx1 - 5, fy0 + 3.2], 0.4, 0.8);
    }
    // the wax worn pale along the lit left edge, a little grime on the shaded right and foot
    ctx.fillStyle = rgba('#F2D2A0', 0.3);
    ribbon(ctx, [fx0 + 1.3, BOARD.y0 + 4, fx0 + 1.5, BOARD.y0 + 80, fx0 + 1.2, BOARD.y0 + 200], 1.2, 0.9);
    ctx.fillStyle = rgba('#24140A', 0.22);
    ribbon(ctx, [fx1 - 1.5, BOARD.y0 + 20, fx1 - 1.8, (BOARD.y0 + fy1) / 2, fx1 - 1.5, fy1 - 4], 2.2, 0.85);
    // nails at the corners of the side members and the foot
    for (const [nx, ny] of [
      [fx0 + 6, BOARD.y0 + 8],
      [fx1 - 6, BOARD.y0 + 8],
      [fx0 + 6, fy1 - 6],
      [fx1 - 6, fy1 - 6],
    ] as const) {
      ctx.fillStyle = rgba('#2A1A10', 0.65);
      ctx.beginPath();
      ctx.arc(nx, ny, 1.15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('#7A4A2A', 0.4);
      ctx.beginPath();
      ctx.ellipse(nx + 0.4, ny + 1.6, 0.7, 1.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(LIGHT, 0.5);
      ctx.beginPath();
      ctx.arc(nx - 0.35, ny - 0.4, 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    pen(ctx, fx0, fy0, fx1, fy0, 0.5, INK, 0.45, rnd, 0.25);
    pen(ctx, fx0, fy0, fx0, fy1, 0.5, INK, 0.42, rnd, 0.25);
    pen(ctx, fx1, fy0, fx1, fy1, 0.7, INK, 0.65, rnd, 0.25);
    pen(ctx, fx0, fy1, fx1, fy1, 0.75, INK, 0.7, rnd, 0.25);
    await tick();
    if (!check()) return null;

    // the title, lettered in gilt on the rail: a shadow, the gold, a thin lit edge
    {
      const lay = layoutText({ text: "This week's basket", x: CX, y: BOARD.y0 - 8.5, size: 14.5, align: 'center', seed: 31, weight: 1 });
      ctx.fillStyle = rgba('#0C150F', 0.55);
      for (const st of lay.strokes) ribbon(ctx, st.map((v, i) => (i % 2 === 0 ? v + 0.55 : v + 0.75)), 1.9, 0.35, 0.04);
      ctx.fillStyle = rgba('#DDB964', 0.96);
      for (const st of lay.strokes) ribbon(ctx, st, 1.75, 0.35, 0.05);
      ctx.fillStyle = rgba('#FFF0B8', 0.5);
      for (const st of lay.strokes) ribbon(ctx, st.map((v, i) => (i % 2 === 0 ? v - 0.22 : v - 0.3)), 0.5, 0.6);
    }

    // the board: a dark painted ground, mottled wet in wet, its brush marks and scratches
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
    ctx.clip();
    ctx.fillStyle = '#242C28';
    ctx.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0);
    mottle(ctx, BOARD.x0, BOARD.y0, BOARD.x1, BOARD.y1, ['#1C2622', '#2E3C36', '#222E32', '#34423A', '#26302A'], 6613, 0.3, 46, 1.4);
    // the brush's long strokes, laid across the board
    for (let i = 0; i < 30; i++) {
      const cx = rnd.range(BOARD.x0, BOARD.x1);
      const cy = rnd.range(BOARD.y0 + 4, BOARD.y1 - 4);
      const len = rnd.range(50, 140);
      const a = rnd.range(-0.08, 0.08);
      const pts: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8 - 0.5;
        pts.push(cx + Math.cos(a) * len * t, cy + Math.sin(a) * len * t + Math.sin(t * 6 + i) * 1.2);
      }
      ctx.fillStyle = rgba(rnd.pick(['#4A5E52', '#10181A', '#3C4E48', '#16201C']), rnd.range(0.05, 0.12));
      ribbon(ctx, pts, rnd.range(4, 12), 0.9, 0.2);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd.range(BOARD.x0, BOARD.x1);
      const y = rnd.range(BOARD.y0, BOARD.y1);
      const a = rnd.range(0, P);
      const l = rnd.range(2, 9);
      ctx.strokeStyle = rgba('#C8D6CC', rnd.range(0.04, 0.12));
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // a cool sheen along the window side, the rail's shadow on the top, the frame's on the left
    const cool = ctx.createLinearGradient(BOARD.x0, 0, BOARD.x0 + 46, 0);
    cool.addColorStop(0, 'rgba(150,184,208,0.12)');
    cool.addColorStop(1, 'rgba(150,184,208,0)');
    ctx.fillStyle = cool;
    ctx.fillRect(BOARD.x0, BOARD.y0, 46, BOARD.y1 - BOARD.y0);
    const top = ctx.createLinearGradient(0, BOARD.y0, 0, BOARD.y0 + 12);
    top.addColorStop(0, 'rgba(6,10,8,0.5)');
    top.addColorStop(1, 'rgba(6,10,8,0)');
    ctx.fillStyle = top;
    ctx.fillRect(BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, 12);
    const left = ctx.createLinearGradient(BOARD.x0, 0, BOARD.x0 + 8, 0);
    left.addColorStop(0, 'rgba(6,10,8,0.38)');
    left.addColorStop(1, 'rgba(6,10,8,0)');
    ctx.fillStyle = left;
    ctx.fillRect(BOARD.x0, BOARD.y0, 8, BOARD.y1 - BOARD.y0);
    ctx.restore();

    // the name strips, the troughs and wells the flaps sit in, the rule
    const F = BOARD_FLAPS;
    const lineBoxes: { top: number; h: number; first: Cell; last: Cell; label: string | null }[] = [];
    const byLine = new Map<number, Cell[]>();
    for (const c of cells) byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
    for (const [line, cs] of byLine) {
      const first = cs[0]!;
      const last = cs[cs.length - 1]!;
      lineBoxes.push({ top: first.y, h: first.h, first, last, label: line === 0 ? null : line === 7 ? 'Total' : ITEMS[ITEM_KEYS[line - 1]!].label });
    }
    for (const lb of lineBoxes) {
      const { first, last, top, h } = lb;
      const x0 = first.x - 3.4;
      const x1 = last.x + last.w + 3.4;
      // the trough: a painted metal channel a shade lighter than the board, lit on its upper edge
      const tp = rectPoly(x0, top - 3.2, x1, top + h + 3.2, rnd, 0.25);
      wash(ctx, tp, '#161C19', 0.95, rnd, 2, 0.006);
      ctx.fillStyle = rgba('#7E9488', 0.22);
      ribbon(ctx, [x0 + 1, top - 3.2, x1 - 1, top - 3.2], 0.5, 0.9);
      ctx.fillStyle = rgba('#030504', 0.5);
      ribbon(ctx, [x0 + 1, top + h + 3.3, x1 - 1, top + h + 3.3], 0.8, 0.9);
      pen(ctx, x0, top + h + 3.2, x1, top + h + 3.2, 0.4, INK, 0.5, rnd, 0.2);
    }
    for (const c of cells) {
      // a well a hair larger than the flap, each a little different, with the axle pins at the gap
      const j = () => rnd.range(-0.15, 0.15);
      wash(ctx, rectPoly(c.x - 0.7 + j(), c.y - 0.7 + j(), c.x + c.w + 0.7 + j(), c.y + c.h + 0.7 + j(), rnd, 0.12), '#0B0D0C', 0.98, rnd, 2, 0.004);
      const hy = c.y + c.h / 2;
      for (const px of [c.x - 0.6, c.x + c.w + 0.6]) {
        ctx.fillStyle = rgba('#B89A5A', 0.8);
        ctx.beginPath();
        ctx.arc(px, hy, 0.42, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba('#FFF0C0', 0.5);
        ctx.beginPath();
        ctx.arc(px - 0.12, hy - 0.14, 0.14, 0, TAU);
        ctx.fill();
      }
    }
    await tick();
    if (!check()) return null;

    const strip = (x0: number, top: number, x1: number, h: number, label: string, line: number, big: boolean): void => {
      const poly = rectPoly(x0, top, x1, top + h, rnd, 0.25);
      wash(ctx, poly, '#F3E2B6', 0.98, rnd, 3, 0.01);
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = rgba(rnd.pick(['#DDBB7C', '#FBF0D0', '#D6B070', '#E8CC90']), rnd.range(0.1, 0.2));
        tracePoly(ctx, deform(blobPoly(rnd.range(x0, x1), rnd.range(top, top + h), rnd.range(8, 22), rnd.range(3, 8), rnd, 9, 0.3), rnd, 1, 0.1));
        ctx.fill();
      }
      const gs = ctx.createLinearGradient(0, top, 0, top + h);
      gs.addColorStop(0, 'rgba(255,248,226,0.26)');
      gs.addColorStop(0.5, 'rgba(255,248,226,0.04)');
      gs.addColorStop(1, 'rgba(150,100,40,0.2)');
      ctx.fillStyle = gs;
      ctx.fillRect(x0, top, x1 - x0, h);
      // a chip off a corner, where the enamel has gone to the metal
      if (rnd.chance(0.5)) {
        ctx.fillStyle = rgba('#2A2420', 0.55);
        tracePoly(ctx, deform(blobPoly(rnd.chance(0.5) ? x0 + 0.6 : x1 - 0.6, rnd.chance(0.5) ? top + 0.6 : top + h - 0.6, rnd.range(0.8, 1.6), rnd.range(0.7, 1.3), rnd, 7, 0.3), rnd, 1, 0.1));
        ctx.fill();
      }
      grain(ctx, '#8A7048', x0, top, x1 - x0, h, 0.07, 0.1, 411 + line);
      ctx.restore();
      // the border: a thin painted line inside the edge, then the lettering
      const bi = 1.5;
      pen(ctx, x0 + bi, top + bi, x1 - bi, top + bi, 0.4, NUMERAL_INK, 0.55, rnd, 0.1);
      pen(ctx, x0 + bi, top + h - bi, x1 - bi, top + h - bi, 0.4, NUMERAL_INK, 0.6, rnd, 0.1);
      pen(ctx, x0 + bi, top + bi, x0 + bi, top + h - bi, 0.4, NUMERAL_INK, 0.55, rnd, 0.1);
      pen(ctx, x1 - bi, top + bi, x1 - bi, top + h - bi, 0.4, NUMERAL_INK, 0.6, rnd, 0.1);
      pen(ctx, x0, top + h, x1, top + h, 0.5, INK, 0.55, rnd, 0.2);
      pen(ctx, x1, top, x1, top + h, 0.5, INK, 0.5, rnd, 0.2);
      pen(ctx, x0, top, x1, top, 0.35, INK, 0.3, rnd, 0.2);
      pen(ctx, x0, top, x0, top + h, 0.35, INK, 0.3, rnd, 0.2);
      const lay = layoutText({ text: label, x: x0 + 8, y: top + h / 2 + (big ? 5.4 : 4.8), size: big ? 11.5 : 10.5, align: 'left', seed: 500 + line * 13, weight: 1 });
      ctx.fillStyle = rgba(NUMERAL_INK, 0.17);
      for (const st of lay.strokes) ribbon(ctx, st, 1.7, 0.3, 0.05);
      ctx.fillStyle = rgba(NUMERAL_INK, 0.9);
      for (const st of lay.strokes) ribbon(ctx, st, 1.15, 0.3, 0.04);
      // the screws at the ends
      for (const sx of [x0 + 3.6, x1 - 3.6]) {
        ctx.fillStyle = rgba('#5A4A32', 0.7);
        ctx.beginPath();
        ctx.arc(sx, top + h / 2, 0.75, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba('#FFF4D0', 0.5);
        ctx.beginPath();
        ctx.arc(sx - 0.2, top + h / 2 - 0.25, 0.25, 0, TAU);
        ctx.fill();
      }
    };
    for (const lb of lineBoxes) {
      if (!lb.label) continue;
      const line = lb.first.line;
      strip(F.nameX, lb.top, lb.first.x - 6, lb.h, lb.label, line, line === 7);
    }
    // the rule above the total: one pull of the brush along a straightedge, a thin line under it
    {
      const y = F.ruleY;
      const pts: number[] = [];
      for (let k = 0; k <= 30; k++) pts.push(BOARD.x0 + 12 + (k / 30) * (BOARD.x1 - BOARD.x0 - 24), y + rnd.range(-0.15, 0.15) - (k / 30) * 0.6);
      ctx.fillStyle = rgba('#DDB964', 0.88);
      ribbon(ctx, pts, 1.5, 0.5, 0.1);
      ctx.fillStyle = rgba('#DDB964', 0.5);
      ribbon(ctx, pts.map((v, i) => (i % 2 === 1 ? v + 2.3 : v)), 0.6, 0.6, 0.1);
      ctx.fillStyle = rgba('#FFF0B8', 0.35);
      ribbon(ctx, pts.map((v, i) => (i % 2 === 1 ? v - 0.4 : v)), 0.4, 0.6);
    }
    grain(ctx, '#10181A', BOARD.x0, BOARD.y0, BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, 0, 0.28, 733);
    await tick();
    if (!check()) return null;

    // the room's light over the whole picture, the same glaze the shop's other paintings get
    const g = buildGlaze(sbox.x - 4, sbox.y - 4, sbox.x + sbox.w + 4, sbox.y + sbox.h + 4, 3, () => 'wall', 41, () => 0.3, 0.45);
    const W = cv.width;
    const H = cv.height;
    const gctx = cv.getContext('2d')!;
    const img = gctx.getImageData(0, 0, W, H);
    const out = gctx.createImageData(W, H);
    glazePixels(img.data, out.data, W, H, [0, H], sbox.x, sbox.y, q, g, 0.24);
    gctx.putImageData(out, 0, 0);
    return { cv, g };
  };

  /** the glaze on its own, as a multiplier for the faces (the glaze of a white sheet) */
  const makeLightmap = (g: Glaze, W: number, H: number): HTMLCanvasElement => {
    const lm = makeCanvas(W, H);
    const c = lm.getContext('2d')!;
    const src = new Uint8ClampedArray(W * H * 4).fill(255);
    const out = c.createImageData(W, H);
    glazePixels(src, out.data, W, H, [0, H], sbox.x, sbox.y, q, g, 0.24);
    c.putImageData(out, 0, 0);
    return lm;
  };

  /* ---------------------------------------------------------------- the faces and the cells */

  const paintFaces = async (tick: () => Promise<void>, check: () => boolean): Promise<boolean> => {
    const sets: [CellSet, FlapSize, string, number][] = [
      ['year', BOARD_FLAPS.year, YEAR_DRUM + MONTH_DRUM, 1000],
      ['row', BOARD_FLAPS.row, PRICE_DRUM, 2000],
      ['total', BOARD_FLAPS.total, PRICE_DRUM, 3000],
    ];
    let n = 0;
    for (const [set, sz, drum, seed] of sets) {
      faces[set].clear();
      for (const ch of drum) {
        const vs: HTMLCanvasElement[] = [];
        for (let v = 0; v < VARIANTS; v++) vs.push(paintFace(sz, ch, v, q, seed));
        faces[set].set(ch, vs);
        if (++n % 5 === 0) {
          await tick();
          if (!check()) return false;
        }
      }
    }
    return true;
  };

  const place = (): void => {
    for (const c of cells) {
      const f = faces[c.set].get(c.drum[0]!)![0]!;
      c.px = Math.round((c.x - sbox.x) * q);
      c.py = Math.round((c.y - sbox.y) * q);
      const m = Math.ceil(0.9 * q);
      c.rx = c.px - m;
      c.ry = c.py - m;
      c.rw = f.width + 2 * m;
      c.rh = f.height + 2 * m;
      c.dirty = true;
    }
  };

  const faceOf = (c: Cell, idx: number): HTMLCanvasElement => faces[c.set].get(c.drum[idx]!)![c.variant]!;

  /** one cell, drawn onto the live board from its state: the painting restored under it, the faces, the flap in the
   *  air, the gap, then the glaze's light on the whole face */
  const drawCell = (c: Cell): void => {
    const L = liveCtx!;
    const cur = faceOf(c, c.cur);
    const fw = cur.width;
    const fh = cur.height;
    const th = Math.round(fh / 2);
    const bh = fh - th;
    const X = c.px;
    const Y = c.py;
    const hinge = Y + th;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.clearRect(c.rx, c.ry, c.rw, c.rh);
    L.drawImage(paint!, c.rx, c.ry, c.rw, c.rh, c.rx, c.ry, c.rw, c.rh);
    const flapping = c.flipping && c.p > 0 && c.cur !== c.tgt;
    if (!flapping) {
      L.drawImage(cur, 0, 0, fw, th, X, Y, fw, th);
      L.drawImage(cur, 0, th, fw, bh, X, hinge, fw, bh);
    } else {
      const nxt = faceOf(c, c.to);
      const p = c.p;
      const s = p < 0.5 ? Math.cos(p * P) : -Math.cos(p * P);
      const sh = Math.sin(p * P);
      // behind the flap: the next glyph's top half and the current one's bottom half, each darkened near the gap by
      // the flap that is over it
      L.drawImage(nxt, 0, 0, fw, th, X, Y, fw, th);
      L.drawImage(cur, 0, th, fw, bh, X, hinge, fw, bh);
      let g = L.createLinearGradient(0, hinge, 0, hinge - th * 0.7);
      g.addColorStop(0, `rgba(12,8,6,${0.36 * sh})`);
      g.addColorStop(1, 'rgba(12,8,6,0)');
      L.fillStyle = g;
      L.fillRect(X, Y, fw, th);
      g = L.createLinearGradient(0, hinge, 0, hinge + bh * 0.7);
      g.addColorStop(0, `rgba(12,8,6,${0.4 * (p < 0.5 ? sh : 1 - s * 0.0) * (p < 0.5 ? 1 : 1 - s)})`);
      g.addColorStop(1, 'rgba(12,8,6,0)');
      L.fillStyle = g;
      L.fillRect(X, hinge, fw, bh);
      const edge = Math.max(1, Math.round(0.3 * q));
      if (p < 0.5) {
        // the top half of the current glyph, falling forward: foreshortened, darker as it turns from the lamp
        const hh = th * s;
        L.drawImage(cur, 0, 0, fw, th, X, hinge - hh, fw, hh);
        L.fillStyle = `rgba(14,10,8,${0.5 * (1 - s)})`;
        L.fillRect(X, hinge - hh, fw, hh);
        L.fillStyle = 'rgba(255,246,214,0.3)';
        L.fillRect(X + 1, hinge - hh, fw - 2, edge);
      } else {
        // its back, the next glyph's bottom half, settling down over the current one's
        const hh = bh * s;
        L.drawImage(nxt, 0, th, fw, bh, X, hinge, fw, hh);
        L.fillStyle = `rgba(14,10,8,${0.5 * (1 - s)})`;
        L.fillRect(X, hinge, fw, hh);
        L.fillStyle = 'rgba(255,246,214,0.26)';
        L.fillRect(X + 1, hinge + hh - edge, fw - 2, edge);
      }
    }
    // the gap between the halves: dark, with the lower flap's lit lip just under it
    // a hairline gap with a faint shadow just under it and a whisper of light on the lower half's top edge
    const under = Math.max(1, Math.round(0.35 * q));
    L.fillStyle = 'rgba(8,6,5,0.5)';
    L.fillRect(X + 1, hinge - 1, fw - 2, 1);
    L.fillStyle = 'rgba(30,18,8,0.14)';
    L.fillRect(X + 1, hinge, fw - 2, under);
    L.fillStyle = 'rgba(255,244,214,0.07)';
    L.fillRect(X + 1, hinge + under, fw - 2, 1);
    // the room's light on the whole face
    L.globalCompositeOperation = 'multiply';
    L.drawImage(lightmap!, X, Y, fw, fh, X, Y, fw, fh);
    L.globalCompositeOperation = 'source-over';
    c.dirty = false;
  };

  const repaintAll = (): void => {
    if (!live || !liveCtx || !paint) return;
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveCtx.clearRect(0, 0, live.width, live.height);
    liveCtx.drawImage(paint, 0, 0);
    for (const c of cells) drawCell(c);
    allDirty = false;
  };

  /* ---------------------------------------------------------------- the mechanism */

  const setTargets = (content: BoardContent, immediate: boolean): void => {
    const key = keyOf(content);
    target = { month: content.month, year: content.year, prices: { ...content.prices }, total: content.total };
    if (!immediate && key === targetKey) return;
    targetKey = key;
    const chars = cellChars(content);
    let rankLine = -1;
    let rank = 0;
    cells.forEach((c, i) => {
      const k = c.drum.indexOf(chars[i]!);
      const idx = k < 0 ? 0 : k;
      if (immediate) {
        if (c.cur !== idx || c.flipping || c.tgt !== idx) c.dirty = true;
        c.cur = idx;
        c.tgt = idx;
        c.flipping = false;
        c.p = 0;
        c.delay = 0;
        return;
      }
      if (idx === c.tgt) return;
      c.tgt = idx;
      c.age = 0;
      // a cell that is not in the air waits for its turn in the row's ripple; one that is carries on
      if (c.line !== rankLine) {
        rankLine = c.line;
        rank = 0;
      }
      if (!c.flipping) c.delay = c.cur === idx ? 0 : rank++ * RIPPLE;
    });
  };

  const advance = (c: Cell, dt: number): void => {
    let t = dt;
    let guard = 0;
    while (t > 0 && guard++ < 64) {
      if (c.flipping) {
        const need = (1 - c.p) * c.dur;
        if (t >= need) {
          t -= need;
          c.cur = c.to;
          c.p = 0;
          c.flipping = false;
          c.dirty = true;
        } else {
          c.p += t / c.dur;
          t = 0;
          c.dirty = true;
        }
      } else {
        if (c.cur === c.tgt) {
          c.delay = 0;
          return;
        }
        if (c.delay > 0) {
          const d = Math.min(t, c.delay);
          c.delay -= d;
          t -= d;
          if (c.delay > 0) return;
        }
        // one flap, straight to the latest target: nothing between is ever shown
        c.to = c.tgt;
        c.dur = FLAP;
        c.flipping = true;
        c.p = 0;
      }
    }
  };

  /* ---------------------------------------------------------------- the contract */

  const settledAges: number[] = [];
  const api: Board & { pending(): number; ages(): number[]; states(): { cur: string; to: string | null; tgt: string }[] } = {
    states() {
      return cells.map((c) => ({ cur: c.drum[c.cur]!, to: c.flipping ? c.drum[c.to]! : null, tgt: c.drum[c.tgt]! }));
    },
    ages() {
      return settledAges.splice(0);
    },
    pending() {
      let n = 0;
      for (const c of cells) if (c.flipping || c.cur !== c.tgt) n++;
      return n;
    },
    async prepare(pxPerUnit, tick, check) {
      const nq = Math.max(0.5, Math.min(4, pxPerUnit));
      if (paint && Math.abs(nq - q) / q < 0.03) return;
      const prevQ = q;
      q = nq;
      const s = await paintStatic(tick, check);
      if (!s || !check()) {
        q = prevQ;
        return;
      }
      if (!(await paintFaces(tick, check)) || !check()) {
        q = prevQ;
        return;
      }
      paint = s.cv;
      lightmap = makeLightmap(s.g, paint.width, paint.height);
      live = makeCanvas(paint.width, paint.height);
      liveCtx = live.getContext('2d')!;
      place();
      allDirty = true;
    },
    shown() {
      return { month: target.month, year: target.year, prices: { ...target.prices }, total: target.total };
    },
    update(dtSec, content) {
      setTargets(content, false);
      const dt = Math.max(0, dtSec);
      for (const c of cells) {
        if (!c.flipping && c.cur === c.tgt) continue;
        c.age += dt;
        advance(c, dt);
        if (!c.flipping && c.cur === c.tgt && settledAges.length < 4096) settledAges.push(c.age);
      }
    },
    set(content) {
      setTargets(content, true);
    },
    draw(ctx) {
      if (!paint || !live) return;
      if (allDirty) repaintAll();
      else for (const c of cells) if (c.dirty) drawCell(c);
      ctx.drawImage(live, sbox.x, sbox.y, live.width / q, live.height / q);
    },
  };
  return api;
}

export type { ItemKey };
