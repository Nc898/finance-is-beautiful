/**
 * Hand-painted watercolor sprites for the crew: the vine gardener's and the snow climber's build (same rig, same
 * dimensions, same brushwork helpers; see src/snow/scene/climberArt.ts) dressed for a spring building site:
 * - the builder: a pale shirt with the sleeves rolled to the elbow under a tweed waistcoat, canvas trousers, a flat
 *   cap, a neckerchief in the house's colour, leather work boots;
 * - the bricklayer: a faded ochre drill jacket buttoned up, dark trousers, a knitted beanie, the house's neckerchief;
 * - the lender's carter: a dark coat over a waistcoat with a watch chain, a white collar and a dark tie, striped
 *   grey trousers, a bowler hat, black boots.
 * The limbs are cylinders, so one painted arm and one painted leg serve every view; the torso, the head, the neck
 * and the boots are painted once per view round the vertical axis (view 0 faces the right of the screen, a quarter
 * of the way round faces the viewer), and an angle between two views is two paintings dissolving into each other.
 * Everything is lit from the upper left of the screen.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, tracePoly } from '../../scene/watercolor';
import { brush, flat, granulate, mix, paintForm, smoothPoly, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { VIEWS } from '../../vine/scene/gardenerDims';
import { ACCENT } from './geom';
import type { LoanId } from '../types';

export interface Part {
  cv: HTMLCanvasElement;
  /** pivot position inside the canvas, in units; size in units */
  px: number;
  py: number;
  w: number;
  h: number;
}

export interface Sprites {
  torso: Part[];
  head: Part[];
  /** the neckerchief (or collar and tie), per view */
  scarf: Part[];
  boot: Part[];
  upper: Part;
  fore: Part;
  upperFar: Part;
  foreFar: Part;
  thigh: Part;
  shin: Part;
  thighFar: Part;
  shinFar: Part;
  knee: Part;
  elbow: Part;
}

export type Role = 'builder' | 'bricklayer' | 'carter';

interface Pig {
  base: string;
  light: string;
  shade: string;
}

interface Look {
  role: Role;
  /** the outer garment of the torso (waistcoat, jacket, coat) */
  coat: Pig;
  /** the shirt (seen at the neck opening, and as the sleeves when they are rolled) */
  shirt: Pig;
  trouser: Pig;
  boot: Pig;
  hair: Pig;
  hat: 'cap' | 'beanie' | 'bowler';
  hatCol: Pig;
  /** the neckerchief's colour, or null for the carter's collar and tie */
  neck: { hull: string; light: string; dark: string } | null;
  /** sleeves rolled to the elbow (bare forearms) or long to the wrist */
  rolled: boolean;
  /** a stripe in the trousers (the carter's) */
  stripe: boolean;
}

const SKIN = { base: '#E8B892', light: '#FFE4C8', shade: '#965A3C' };

function neckFor(id: LoanId): { hull: string; light: string; dark: string } {
  const c = ACCENT[id];
  return { hull: c, light: mix(c, '#FFFFFF', 0.4), dark: mix(c, '#101018', 0.5) };
}

function lookFor(role: Role, id: LoanId): Look {
  switch (role) {
    case 'builder':
      return {
        role,
        coat: { base: '#7A6A54', light: '#C2AE8A', shade: '#33281E' },
        shirt: { base: '#D6DCE0', light: '#FFFFFF', shade: '#7E8890' },
        trouser: { base: '#A89470', light: '#E2D2AE', shade: '#4E4230' },
        boot: { base: '#6A4630', light: '#B88E66', shade: '#28180E' },
        hair: { base: '#8A6A4C', light: '#C8A47C', shade: '#3A2818' },
        hat: 'cap',
        hatCol: { base: '#8A7A64', light: '#CDBB98', shade: '#3A3024' },
        neck: neckFor(id),
        rolled: true,
        stripe: false,
      };
    case 'bricklayer':
      return {
        role,
        coat: { base: '#C29A5A', light: '#F2D8A2', shade: '#5E4220' },
        shirt: { base: '#E6E0D2', light: '#FFFFFF', shade: '#8E8676' },
        trouser: { base: '#5C5A58', light: '#9C9A96', shade: '#24221E' },
        boot: { base: '#5A3E2C', light: '#A8805E', shade: '#22160E' },
        hair: { base: '#4E3A2C', light: '#8E7058', shade: '#1E140C' },
        hat: 'beanie',
        hatCol: { base: '#B4553A', light: '#E8987A', shade: '#521E14' },
        neck: neckFor(id),
        rolled: false,
        stripe: false,
      };
    case 'carter':
      return {
        role,
        coat: { base: '#3E3C46', light: '#8A88A0', shade: '#121018' },
        shirt: { base: '#F2EEE4', light: '#FFFFFF', shade: '#9A9488' },
        trouser: { base: '#6A6870', light: '#A8A6B2', shade: '#26242C' },
        boot: { base: '#2E2A2C', light: '#7A7276', shade: '#0E0C0E' },
        hair: { base: '#9A9286', light: '#D2CCC0', shade: '#4A443C' },
        hat: 'bowler',
        hatCol: { base: '#2C2A30', light: '#76728A', shade: '#0A080C' },
        neck: null,
        rolled: false,
        stripe: true,
      };
  }
}

const TAU = Math.PI * 2;
/** the painting camera: how much a step toward the viewer shifts a point down the sprite */
const KA = 0.15;

const part = (w: number, h: number, px: number, py: number, q: number, paint: (ctx: CanvasRenderingContext2D) => void, grain = 0.6, seed = 5): Part => {
  const soft = makeCanvas(w * q, h * q);
  const ctx = soft.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(q, 0, 0, q, px * q, py * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx);
  if (grain > 0) granulate(soft, seed, q, grain);
  const cv = makeCanvas(w * q, h * q);
  cv.getContext('2d')!.drawImage(soft, 0, 0);
  return { cv, px, py, w, h };
};

const tinted = (src: Part, rgb: string, a: number): Part => {
  const cv = makeCanvas(src.cv.width, src.cv.height);
  const c = cv.getContext('2d')!;
  c.drawImage(src.cv, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(${rgb},${a})`;
  c.fillRect(0, 0, cv.width, cv.height);
  return { ...src, cv };
};

function limbPoly(len: number, w0: number, w1: number, bow = 0): number[] {
  const pts: Pt[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.94 + 0.1 * Math.sin(Math.PI * t));
    pts.push([len * t, -w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([len + w1 * 0.42, 0]);
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const w = (w0 + (w1 - w0) * t) * (0.94 + 0.1 * Math.sin(Math.PI * t));
    pts.push([len * t, w / 2 + bow * Math.sin(Math.PI * t)]);
  }
  pts.push([-w0 * 0.42, 0]);
  return smoothPoly(pts, 3, true);
}

/* ------------------------------------------------------------------ small solids */

const lin = (xs: number[], ys: number[], v: number): number => {
  if (v <= xs[0]!) return ys[0]!;
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]!) {
      const t = (v - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * t;
    }
  }
  return ys[ys.length - 1]!;
};
const ss = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

interface SP {
  x: number;
  y: number;
  vis: number;
}

function visRuns(ps: SP[], th = 0.04): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of ps) {
    if (p.vis > th) cur.push([p.x, p.y]);
    else {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function hull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/* ------------------------------------------------------------------ the torso */

/** the body's cross-section at a height above the hip (slimmer than the climber's padded coat) */
const TH = [-10, -5, 2, 12, 22, 30, 34, 37, 39.5, 41.5, 43];
const TDF = [7.4, 8.0, 8.4, 8.8, 8.6, 7.8, 6.6, 4.8, 2.8, 1.3, 0.4];
const TDB = [7.0, 7.8, 8.4, 8.8, 8.8, 8.0, 6.8, 5.0, 3.0, 1.5, 0.6];
const TW = [9.2, 9.6, 9.8, 10.0, 10.0, 9.6, 8.4, 5.8, 2.9, 1.4, 0.6];

function tsp(t: number, h: number, psi: number, pad = 0): SP {
  const df = lin(TH, TDF, h);
  const db = lin(TH, TDB, h);
  const w = lin(TH, TW, h);
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const A = c >= 0 ? df : db;
  const a = (A + pad) * c;
  const b = (w + pad) * sn;
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return { x: a * cp - b * sp, y: -h + KA * (a * sp + b * cp), vis: (c / A) * sp + (sn / w) * cp };
}

function torsoOutline(psi: number, hs: number[], pad = 0): number[] {
  const L: Pt[] = [];
  const R: Pt[] = [];
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  for (const h of hs) {
    const df = lin(TH, TDF, h) + pad;
    const db = lin(TH, TDB, h) + pad;
    const w = lin(TH, TW, h) + pad;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 64; k++) {
      const t = (k / 64) * TAU;
      const c = Math.cos(t);
      const x = (c >= 0 ? df : db) * c * cp - w * Math.sin(t) * sp;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    L.push([lo, -h]);
    R.push([hi, -h]);
  }
  return smoothPoly([...L, ...R.reverse()], 3, true);
}

function torsoBand(psi: number, hs: number[], tLo: (h: number) => number, tHi: (h: number) => number, pad: number): number[] | null {
  const L: Pt[] = [];
  const R: Pt[] = [];
  let wmax = 0;
  for (const h of hs) {
    let lo = Infinity;
    let hi = -Infinity;
    let yl = 0;
    let yh = 0;
    const a = tLo(h);
    const b = tHi(h);
    for (let k = 0; k <= 22; k++) {
      const p = tsp(a + ((b - a) * k) / 22, h, psi, pad);
      if (p.vis <= 0.02) continue;
      if (p.x < lo) {
        lo = p.x;
        yl = p.y;
      }
      if (p.x > hi) {
        hi = p.x;
        yh = p.y;
      }
    }
    if (hi >= lo) {
      L.push([lo, yl]);
      R.push([hi, yh]);
      wmax = Math.max(wmax, hi - lo);
    }
  }
  if (L.length < 2 || wmax < 0.9) return null;
  return smoothPoly([...L, ...R.reverse()], 3, true);
}

function paintTorsoView(L: Look, psi: number, q: number, k: number): Part {
  return part(46, 72, 23, 53, q, (ctx) => {
    const rnd = new Rand(3701 + k + L.role.length * 13);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const C = L.coat;
    const hsBody = [-10, -8.4, -5, -1, 3, 8, 13, 18, 23, 28, 32, 35, 37.5, 39.5, 41.5, 42.8];
    const body = torsoOutline(psi, hsBody);
    // the garment over the whole body, then the shirt showing in the V at the chest (the jacket is buttoned to a
    // narrow notch at the collar)
    pf(body, C.base, { light: C.light, shade: C.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 120, grain: 4, grainColor: mix(C.shade, '#000000', 0.2) });
    const vTop = L.role === 'bricklayer' ? 39 : 37.5;
    const vBot = L.role === 'bricklayer' ? 36.5 : L.role === 'carter' ? 22 : 26;
    const vMax = L.role === 'bricklayer' ? 0.14 : 0.52;
    const vHalf = (h: number): number => (h >= vTop ? vMax : h <= vBot ? 0 : vMax * ((h - vBot) / (vTop - vBot)));
    const vHs: number[] = [];
    for (let h = 42.6; h >= vBot; h -= 1.5) vHs.push(h);
    const shirtV = torsoBand(psi, vHs, (h) => -vHalf(h), (h) => vHalf(h), 0.35);
    if (shirtV) pf(shirtV, L.shirt.base, { light: L.shirt.light, shade: L.shirt.shade, alpha: 0.97, layers: 3, inkW: 0.35, speck: 16 });
    const garment = body;
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // tweed or drill: a fine broken weave over the garment
    if (garment) {
      ctx.save();
      tracePoly(ctx, garment);
      ctx.clip();
      for (let i = 0; i < (L.role === 'builder' ? 120 : 60); i++) {
        const x = rnd.range(-12, 12);
        const y = rnd.range(-52, 10);
        brush(ctx, [[x, y], [x + rnd.range(0.6, 1.4), y + rnd.range(-0.2, 0.2)]], 0.2, rnd.chance(0.5) ? C.shade : C.light, 0.25, 0.9);
      }
      ctx.restore();
    }
    // folds where the cloth turns away, under the arms and across the back
    for (const t0 of [2.3, 3.8, -2.3, -3.8]) {
      const pts: SP[] = [];
      for (let h = 32; h >= -2; h -= 3.4) pts.push(tsp(t0, h, psi));
      for (const run of visRuns(pts)) brush(ctx, run, 0.7, C.shade, 0.16, 0.9);
    }
    // the front edges of the opening and the buttons down them
    for (const s of [-1, 1]) {
      const edge: SP[] = [];
      for (let h = vTop; h >= -9; h -= 2.5) edge.push(tsp(s * Math.max(vHalf(h), 0.02), h, psi, 0.3));
      for (const run of visRuns(edge, 0.05)) brush(ctx, run, 0.4, mix(C.shade, '#000000', 0.2), 0.55, 0.5);
    }
    const buttons = L.role === 'carter' ? [20, 15, 10, 5] : L.role === 'builder' ? [23, 17.5, 12, 6.5, 1] : [35, 29, 23, 17, 11, 5];
    for (const h of buttons) {
      const p = tsp(0.06, h, psi, 0.5);
      if (p.vis > 0.15) {
        ctx.fillStyle = L.role === 'carter' ? 'rgba(40,36,40,0.95)' : 'rgba(70,50,32,0.9)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 0.55 + 0.25 * p.vis, 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,210,0.5)';
        ctx.fillRect(p.x - 0.3, p.y - 0.4, 0.3, 0.3);
      }
    }
    // pockets: the jacket's two patch pockets, the waistcoat's welts; the carter's watch chain across the front
    if (L.role === 'bricklayer') {
      for (const s of [-1, 1]) {
        const pts: SP[] = [tsp(s * 0.45, 10, psi, 0.4), tsp(s * 0.95, 10, psi, 0.4), tsp(s * 0.95, 3, psi, 0.4), tsp(s * 0.45, 3, psi, 0.4), tsp(s * 0.45, 10, psi, 0.4)];
        for (const run of visRuns(pts, 0.05)) brush(ctx, run, 0.4, C.shade, 0.5, 0.6);
      }
    } else if (L.role === 'builder') {
      for (const s of [-1, 1]) {
        const pts: SP[] = [tsp(s * 0.45, 12, psi, 0.4), tsp(s * 0.95, 12.6, psi, 0.4)];
        for (const run of visRuns(pts, 0.05)) brush(ctx, run, 0.5, C.shade, 0.6, 0.6);
      }
    } else {
      const chain: SP[] = [];
      for (let t = -0.75; t <= 0.05; t += 0.08) chain.push(tsp(t, 14 + 2.2 * Math.cos((t + 0.35) * 4), psi, 0.6));
      for (const run of visRuns(chain, 0.05)) brush(ctx, run, 0.32, '#E2C060', 0.9, 0.9);
    }
    // the back: a seam down the middle; a belt line for the jacket
    const seam: SP[] = [];
    for (let h = 40; h >= -8; h -= 3) seam.push(tsp(Math.PI, h, psi, 0.1));
    for (const run of visRuns(seam)) brush(ctx, run, 0.32, C.shade, 0.3, 0.9);
    ctx.restore();
    // the collar of the jacket and coat, lying on the shoulders
    if (L.role !== 'builder') {
      const collar = torsoBand(psi, [41.6, 40.4, 39, 37.6], (h) => vHalf(h) * 0.6, (h) => TAU - vHalf(h) * 0.6, 0.6);
      if (collar) pf(collar, mix(C.base, C.shade, 0.1), { light: C.light, shade: C.shade, alpha: 0.96, layers: 3, inkW: 0.4, speck: 16 });
    }
  }, 0.45, 61 + k + L.role.length);
}

/* ------------------------------------------------------------------ the head and the hats */

const HC = 12.6;
const HR = 8.5;
const HV = 9.3;
const headRho = (h: number): number => {
  const t = (h - HC) / HV;
  const jaw = h < 8.6 ? 0.66 + 0.34 * ss((h - 3.2) / 5.4) : 1;
  return HR * Math.sqrt(Math.max(0.0004, 1 - t * t)) * jaw;
};
function visWindow(psi: number, half: number): [number, number] | null {
  const p = ((psi % TAU) + TAU) % TAU;
  const lo = Math.max(0, p - half);
  const hi = Math.min(Math.PI, p + half);
  if (hi > lo) return [lo, hi];
  const w = p + half - TAU;
  if (w > 0) return [0, Math.min(Math.PI, w)];
  return null;
}

function paintHeadView(L: Look, psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(46, 46, 23, 34, q, (ctx) => {
    const rnd = new Rand(3810 + L.role.length * 7 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const hp = (a: number, h: number, r = headRho(h)): SP => ({ x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) });
    // the neck
    pf(flat([[-2.7, 2], [2.9, 2], [2.7, -5.4], [-2.5, -5.2]]), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    const noseBase: Array<[number, number, number]> = [[HR - 0.7, 0, 11], [HR + 2.6, 0, 8.4], [HR - 0.3, -1.4, 7.5], [HR - 0.3, 1.4, 7.5]];
    const noseHull = hull(noseBase.map(([a, b, h]) => [a * cp - b * sp, -h + KA * (a * sp + b * cp)] as Pt));
    const paintNose = (): void => {
      if (noseHull.length < 3) return;
      pf(smoothPoly(noseHull, 3, true), mix(SKIN.base, '#D9886C', 0.25), { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.34, speck: 6 });
      const tip: Pt = [(HR + 2.6) * cp, -8.4 + KA * (HR + 2.6) * sp];
      const bs: Pt = [(HR - 0.3) * cp + 1.4 * sp, -7.5 - KA * 1.4 * cp + KA * (HR - 0.3) * sp];
      brush(ctx, [bs, tip], 0.42, '#9A5C3E', 0.5, 0.9);
    };
    if (sp < 0 && sp > -0.62) paintNose();
    // the head itself, hair all over
    const hsH = [3.3, 3.9, 5, 6.5, 8.5, 10.5, 12.6, 14.6, 16.6, 18.4, 19.9, 21, 21.7, 21.95];
    const Lh: Pt[] = hsH.map((h) => [-headRho(h), -h]);
    const Rh: Pt[] = hsH.map((h) => [headRho(h), -h]);
    pf(smoothPoly([...Lh, ...Rh.reverse()], 3, true), L.hair.base, { light: L.hair.light, shade: L.hair.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.42, speck: 50 });
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i - 3) * 0.3;
      const pts: SP[] = [hp(a, 11.4), hp(a, 8.4), hp(a, 5.8)];
      for (const run of visRuns(pts, 0.1)) brush(ctx, run, 0.3, L.hair.shade, 0.35, 0.9);
    }
    // the ears
    for (const s of [-1, 1]) {
      const b = psi + s * 1.57;
      const vis = Math.sin(b);
      if (vis > -0.2) {
        const r = HR + 0.9;
        ctx.fillStyle = 'rgba(214,150,120,0.92)';
        ctx.beginPath();
        ctx.ellipse(r * Math.cos(b), -HC + 0.6 + KA * r * vis, 0.55 + 1.15 * Math.max(0, vis), 2.3, 0, 0, TAU);
        ctx.fill();
      }
    }
    // the face
    const half = (h: number): number => 0.68 + 0.84 * ss((h - 3.6) / 6.4);
    const rowsL: Pt[] = [];
    const rowsR: Pt[] = [];
    for (const h of [3.4, 4, 5, 6.2, 7.6, 9.2, 10.8, 12.4, 14, 15.6, 17.2]) {
      const w = visWindow(psi, half(h));
      if (!w) continue;
      const r = headRho(h);
      rowsL.push([r * Math.cos(w[1]), -h]);
      rowsR.push([r * Math.cos(w[0]), -h]);
    }
    if (rowsL.length >= 3 && Math.max(...rowsR.map((p, i) => p[0] - rowsL[i]![0])) > 1.2) {
      const skin = smoothPoly([...rowsL, ...rowsR.slice().reverse()], 3, true);
      pf(skin, SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
      ctx.save();
      tracePoly(ctx, skin);
      ctx.clip();
      // the hat's shade across the brow, warm cheeks
      ctx.fillStyle = 'rgba(122,66,44,0.24)';
      const brow: Pt[] = [];
      for (const h of [15.8, 14.6, 13.4]) {
        const w = visWindow(psi, half(h));
        if (w) brow.push([headRho(h) * Math.cos(w[1]) - 1, -h], [headRho(h) * Math.cos(w[0]) + 1, -h]);
      }
      if (brow.length >= 6) {
        const top = brow.filter((_, i) => i % 2 === 0);
        const bot = brow.filter((_, i) => i % 2 === 1);
        for (let i = 0; i < 3; i++) {
          tracePoly(ctx, deform(flat([...top, ...bot.reverse()]), rnd, 2, 0.05));
          ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(214,110,92,0.18)';
      for (const s of [-1, 1]) {
        const p = hp(s * 0.72, 7.8);
        if (p.vis > 0.08) {
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 0.9 + 1.9 * p.vis, 1.6, 0, 0, TAU);
            ctx.fill();
          }
        }
      }
      // the carter's grey whiskers
      if (L.role === 'carter') {
        for (const s of [-1, 1]) {
          const pts: SP[] = [hp(s * 0.95, 11, HR * 1.0), hp(s * 0.9, 8, HR * 0.98), hp(s * 0.7, 6, HR * 0.95)];
          for (const run of visRuns(pts, 0.08)) brush(ctx, run, 1.5, L.hair.base, 0.8, 0.6);
        }
      }
      ctx.restore();
    }
    for (const s of [-1, 1]) {
      const e = hp(s * 0.36, 11.6, HR * 0.99);
      if (e.vis > 0.1) {
        ctx.fillStyle = 'rgba(40,28,22,0.92)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 0.2 + 0.4 * e.vis, 0.66, 0, 0, TAU);
        ctx.fill();
      }
      const bp: SP[] = [hp(s * 0.14, 13.5, HR * 0.99), hp(s * 0.4, 13.9, HR * 0.99), hp(s * 0.66, 13.4, HR * 0.99)];
      for (const run of visRuns(bp, 0.08)) brush(ctx, run, 0.4, L.role === 'carter' ? '#7A7468' : '#4A2E20', 0.7, 0.9);
    }
    if (sp >= 0) paintNose();
    const mouth: SP[] = [hp(-0.3, 5.6, HR * 0.99), hp(0, 5.4, HR * 1.0), hp(0.3, 5.6, HR * 0.99)];
    for (const run of visRuns(mouth, 0.06)) brush(ctx, run, 0.32, '#7A3A2C', 0.6, 0.9);
    if (L.role === 'carter') {
      // a grey moustache
      const mo: SP[] = [hp(-0.42, 6.6, HR * 1.02), hp(0, 6.9, HR * 1.06), hp(0.42, 6.6, HR * 1.02)];
      for (const run of visRuns(mo, 0.06)) brush(ctx, run, 1.1, L.hair.base, 0.85, 0.5);
    }
    paintHat(ctx, L, psi, rnd, k);
  }, 0.4, 51 + L.role.length + k);
}

function paintHat(ctx: CanvasRenderingContext2D, L: Look, psi: number, rnd: Rand, k: number): void {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const H = L.hatCol;
  const opts: FormOpts = { flip: false, light: H.light, shade: H.shade, alpha: 0.98, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 90 };
  /** a point at azimuth a (from the way the head faces), height h, radius r about the head's axis */
  const at = (a: number, h: number, r: number): Pt => [r * Math.cos(psi + a), -h + KA * r * Math.sin(psi + a)];
  if (L.hat === 'beanie') {
    // a knitted beanie pulled down over the ears, turned up at the cuff
    const RX = HR + 1.6;
    const RY = HV + 2.0;
    const rAt = (h: number) => RX * Math.sqrt(Math.max(0, 1 - ((h - HC) / RY) * ((h - HC) / RY)));
    const base = (a: number) => 13.6 + 1.8 * Math.cos(a);
    const cloud: Pt[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      for (const h of [base(a) - 0.4, base(a) + 2, 17, 19.5, 21.5, 22.8]) cloud.push(at(a, h, rAt(h) + (h < base(a) + 3 ? 0.9 : 0.15)));
    }
    cloud.push([0, -23.6]);
    const dome = smoothPoly(hull(cloud), 2, true);
    paintForm(ctx, dome, H.base, rnd, opts);
    ctx.save();
    tracePoly(ctx, dome);
    ctx.clip();
    for (let h = 16.4; h < 23; h += 1.5) {
      for (let b = 0.22; b < Math.PI - 0.2; b += 0.3) {
        const a = b - psi;
        const p = at(a, h + 0.4 * Math.sin(b * 3 + h), rAt(h) + 0.5);
        const w = 0.5 * Math.sin(b);
        brush(ctx, [[p[0] - w - 0.2, p[1] - 0.55], [p[0], p[1] + 0.5], [p[0] + w + 0.2, p[1] - 0.55]], 0.26, H.shade, 0.32, 0.9);
      }
    }
    ctx.restore();
    // the turned-up cuff with its ribs
    const A: Pt[] = [];
    const B: Pt[] = [];
    for (let i = 0; i <= 30; i++) {
      const b = -0.04 + ((Math.PI + 0.08) * i) / 30;
      const a = b - psi;
      A.push(at(a, base(a) - 0.4, rAt(base(a)) + 1.1));
      B.push(at(a, base(a) + 3.4, rAt(base(a) + 3.4) + 1.1));
    }
    const cuff = smoothPoly([...A, ...B.reverse()], 2, true);
    paintForm(ctx, cuff, mix(H.base, H.shade, 0.15), rnd, { ...opts, layers: 3, speck: 40 });
    for (let b = 0.1; b < Math.PI - 0.05; b += 0.17) {
      const a = b - psi;
      brush(ctx, [at(a, base(a) - 0.2, rAt(base(a)) + 1.1), at(a, base(a) + 3.2, rAt(base(a) + 3.2) + 1.1)], 0.22, H.shade, 0.34, 0.8);
    }
    return;
  }
  if (L.hat === 'cap') {
    // a flat cap: a soft crown sloping down to the front, a short stiff peak over the brow
    const crown: Pt[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      const front = Math.cos(a);
      const r = HR + 1.8 + 0.8 * front;
      const hb = 14.4 + 1.0 * Math.cos(a);
      const ht = 20.6 - 1.6 * front;
      crown.push(at(a, hb, r), at(a, ht, r - 0.6), at(a, ht + 1.0, r * 0.6));
    }
    const dome = smoothPoly(hull(crown), 2, true);
    paintForm(ctx, dome, H.base, rnd, opts);
    ctx.save();
    tracePoly(ctx, dome);
    ctx.clip();
    // tweed flecks and the seam where the crown is gathered at the front
    for (let i = 0; i < 70; i++) {
      const x = rnd.range(-12, 12);
      const y = rnd.range(-23, -13);
      brush(ctx, [[x, y], [x + 0.8, y + 0.1]], 0.22, rnd.chance(0.5) ? H.shade : H.light, 0.3, 0.9);
    }
    ctx.restore();
    // the peak: out in front of the brow, seen from above at its own angle
    if (sp > -0.5) {
      const peak: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = -0.95 + (1.9 * i) / 10;
        peak.push(at(a, 14.6, HR + 1.6));
      }
      for (let i = 10; i >= 0; i--) {
        const a = -0.85 + (1.7 * i) / 10;
        peak.push(at(a, 13.6, HR + 5.4 - 1.6 * Math.abs(a)));
      }
      const pk = smoothPoly(peak, 2, true);
      paintForm(ctx, pk, mix(H.base, H.shade, 0.25), rnd, { ...opts, layers: 3, speck: 20 });
    }
    void k;
    return;
  }
  // the bowler: a hard round crown and a narrow brim curled up at the sides
  const crown: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    for (const [h, r] of [[15.2, HR + 1.0], [19, HR + 1.0], [22.4, HR * 0.86], [24.4, HR * 0.55], [25, HR * 0.2]] as Array<[number, number]>) crown.push(at(a, h, r));
  }
  const dome = smoothPoly(hull(crown), 2, true);
  // the brim first (its far half behind the crown)
  const brim: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const side = Math.abs(Math.sin(a));
    brim.push(at(a, 15 + 1.2 * side, HR + 4.2));
  }
  const brimPoly = smoothPoly(hull(brim), 2, true);
  paintForm(ctx, brimPoly, mix(H.base, H.shade, 0.2), rnd, { ...opts, layers: 3, speck: 20 });
  paintForm(ctx, dome, H.base, rnd, opts);
  // the band round the crown and a sheen on its lit shoulder
  const band: Pt[] = [];
  for (let b = -0.04; b <= Math.PI + 0.04; b += 0.1) band.push(at(b - psi, 16.6, HR + 1.05));
  brush(ctx, band, 1.6, '#141218', 0.7, 0.4);
  brush(ctx, [at(Math.PI * 0.75 - psi, 21.8, HR * 0.9), at(Math.PI * 0.6 - psi, 23.4, HR * 0.6)], 0.9, '#B8B4CC', 0.45, 0.8);
  void cp;
}

/* ------------------------------------------------------------------ the neckerchief, or collar and tie */

function paintNeckView(L: Look, psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(36, 24, 18, 13, q, (ctx) => {
    const rnd = new Rand(3830 + L.role.length * 5 + k);
    const xe = Math.hypot(7.2 * cp, 8.8 * sp);
    const dr = Math.hypot(8.8 * cp, 7.2 * sp);
    const kk = KA * dr;
    const top = (x: number) => -3.6 - kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const bot = (x: number) => 1.6 + kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const T: Pt[] = [];
    const B: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const x = -xe + (2 * xe * i) / 14;
      T.push([x, top(x)]);
      B.push([x, bot(x)]);
    }
    const roll = smoothPoly([...T, ...B.reverse()], 2, true);
    const front: Pt = [8 * cp, 1 + KA * 8 * sp];
    if (L.neck) {
      // a cotton neckerchief knotted at the front, its points hanging below the knot
      const n = L.neck;
      paintForm(ctx, roll, n.hull, rnd, { flip: false, light: n.light, shade: n.dark, alpha: 0.97, layers: 3, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.45, speck: 24 });
      if (sp > -0.25) {
        const c = front;
        const pts = smoothPoly([[c[0] - 2.2, c[1] - 0.6], [c[0] + 2.2, c[1] - 0.6], [c[0] + 1.2, c[1] + 4.6], [c[0], c[1] + 6.2], [c[0] - 1.2, c[1] + 4.6]], 3, true);
        paintForm(ctx, pts, n.hull, rnd, { flip: false, light: n.light, shade: n.dark, alpha: 0.97, layers: 3, inkW: 0.4, speck: 10 });
        ctx.fillStyle = 'rgba(250,246,236,0.7)';
        for (let i = 0; i < 6; i++) ctx.fillRect(c[0] - 1.6 + rnd.range(0, 3.2), c[1] + rnd.range(0, 4), 0.35, 0.35);
      }
    } else {
      // a starched white collar and a dark tie
      paintForm(ctx, roll, L.shirt.base, rnd, { flip: false, light: L.shirt.light, shade: L.shirt.shade, alpha: 0.98, layers: 3, inkW: 0.4, speck: 10 });
      if (sp > -0.25) {
        const c = front;
        const tie = smoothPoly([[c[0] - 1.1, c[1] - 1], [c[0] + 1.1, c[1] - 1], [c[0] + 1.6, c[1] + 6], [c[0], c[1] + 7.6], [c[0] - 1.6, c[1] + 6]], 3, true);
        paintForm(ctx, tie, '#5A2A30', rnd, { flip: false, light: '#A8606A', shade: '#200A10', alpha: 0.98, layers: 3, inkW: 0.4, speck: 8 });
      }
    }
  }, 0.4, 71 + L.role.length + k);
}

/* ------------------------------------------------------------------ the work boot */

function paintBootView(L: Look, psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const KB = 0.3;
  const P = (a: number, b: number, h: number): Pt => [a * cp - b * sp, -h + KB * (a * sp + b * cp)];
  const D = (a: number, b: number): number => a * sp + b * cp;
  const BO = L.boot;
  return part(36, 34, 13, 25, q, (ctx) => {
    const rnd = new Rand(3850 + k + L.role.length);
    const sole: Array<[number, number]> = [[-5.8, 0], [-5.4, 3.0], [-2.6, 4.1], [2, 4.4], [6.6, 4.9], [10.8, 4.6], [13.2, 3.0], [13.8, 0]];
    const outline: Array<[number, number]> = [...sole, ...sole.slice(1, -1).reverse().map(([a, b]) => [a, -b] as [number, number])];
    const shaft: Pt[] = [];
    for (const h of [1.5, 5, 8.6]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        shaft.push(P(-0.6 + 4.8 * Math.cos(a), 4.4 * Math.sin(a), h));
      }
    }
    const lo: FormOpts = { light: BO.light, shade: BO.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 50, grain: 2, grainColor: '#22140C' };
    paintForm(ctx, smoothPoly(hull(shaft), 2, true), BO.base, rnd, { flip: false, ...lo });
    const foot: Pt[] = [];
    for (const [a, b] of outline) foot.push(P(a, b, -4.6));
    for (const [a, b, h] of [[6.6, 0, -0.8], [6.6, 3.2, -1.8], [6.6, -3.2, -1.8], [10.8, 0, -2.4], [10.8, 2.8, -2.9], [10.8, -2.8, -2.9], [13, 0, -3.4], [13, 1.8, -3.8], [13, -1.8, -3.8]] as Array<[number, number, number]>) foot.push(P(a, b, h));
    for (const h of [-2.2, 0.6]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        foot.push(P(-0.6 + 4.8 * Math.cos(a), 4.4 * Math.sin(a), h));
      }
    }
    const poly = smoothPoly(hull(foot), 2, true);
    paintForm(ctx, poly, BO.base, rnd, { flip: false, ...lo });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    const seam: Pt[] = [];
    for (let b = -3.8; b <= 3.81; b += 0.95) seam.push(P(8.8 + 0.01 * b * b, b, -1.8));
    brush(ctx, seam, 0.36, BO.shade, 0.5, 0.9);
    const edge: SP[] = outline.map(([a, b]) => ({ x: P(a, b, -3.8)[0], y: P(a, b, -3.8)[1], vis: D(a, b) + 0.02 }));
    const near = edge.slice().sort((p, q2) => p.x - q2.x).filter((p) => p.vis > 0);
    if (near.length > 1) {
      brush(ctx, near.map((p) => [p.x, p.y] as Pt), 1.4, '#3A2A1E', 0.9, 0.8);
      // a crust of mud on the builders' boots
      if (L.role !== 'carter') brush(ctx, near.map((p) => [p.x, p.y - 0.8] as Pt), 0.9, '#9A7E58', 0.4, 0.5);
    }
    ctx.restore();
    if (sp > -0.15) {
      for (const h of [2.2, 4.6, 7]) brush(ctx, [P(4.2, -1.8, h), P(4.2, 1.8, h)], 0.3, '#D8C4A0', 0.7, 0.9);
    }
    const heel: Pt[] = [P(-5.5, -2.2, -4.1), P(-5.7, 0, -4.1), P(-5.5, 2.2, -4.1)];
    if (sp < 0.3) brush(ctx, heel, 1.5, '#1E1610', 0.7, 0.6);
  }, 0.6, 93 + k + L.role.length);
}

/* ------------------------------------------------------------------ the limbs */

function paintHand(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number): void {
  // a bare working hand: the back of it with the knuckles, the fingers curled, the thumb under
  const thumb = smoothPoly([[x0 + 2.2, -3.4], [x0 + 4, -6.4], [x0 + 7, -6.8], [x0 + 8.2, -5.2], [x0 + 7.2, -3]], 3, true);
  paintForm(ctx, thumb, SKIN.base, rnd, { flip: false, light: SKIN.light, shade: SKIN.shade, alpha: 0.98, layers: 3, inkW: 0.4, speck: 10 });
  const hand = smoothPoly([[x0, -3.6], [x0 + 4, -4.4], [x0 + 8.2, -4.4], [x0 + 11.2, -3], [x0 + 12.2, 0], [x0 + 11.2, 3], [x0 + 7.4, 4.4], [x0 + 3, 4.2], [x0, 3.6]], 3, true);
  paintForm(ctx, hand, SKIN.base, rnd, { flip: false, light: SKIN.light, shade: SKIN.shade, alpha: 0.98, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.45, speck: 20 });
  for (const y of [-2, 0, 2]) brush(ctx, [[x0 + 9, y - 0.4], [x0 + 11.4, y]], 0.3, SKIN.shade, 0.45, 0.9);
}

function paintArm(L: Look, q: number): { upper: Part; fore: Part; elbow: Part } {
  const rnd = new Rand(3840 + L.role.length);
  const sleeve = L.rolled ? L.shirt : L.coat;
  const so: FormOpts = { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 60 };
  const upper = part(36, 16, 6, 8, q, (ctx) => {
    const p = limbPoly(25, 9.2, 8.2, 0.2);
    paintForm(ctx, p, sleeve.base, rnd, so);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    brush(ctx, [[2, 3], [10, 3.3], [20, 2.8]], 1.3, sleeve.shade, 0.2, 0.9);
    brush(ctx, [[3, -2.6], [12, -3], [21, -2.6]], 0.8, sleeve.light, 0.25, 0.9);
    ctx.restore();
  }, 0.5, 81);
  const fore = part(42, 18, 6, 9, q, (ctx) => {
    if (L.rolled) {
      // the forearm bare from a rolled cuff at the elbow
      const arm = limbPoly(19, 7.4, 6, 0.1);
      paintForm(ctx, arm, SKIN.base, rnd, { flip: false, light: SKIN.light, shade: SKIN.shade, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.26, inkW: 0.45, speck: 20 });
      paintForm(ctx, flat([[-1.6, -5], [4.6, -5.2], [4.8, 5.2], [-1.4, 5.1]]), L.shirt.base, rnd, { flip: false, light: L.shirt.light, shade: L.shirt.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
      brush(ctx, [[1.4, -4.8], [1.6, 0], [1.4, 4.8]], 0.5, L.shirt.shade, 0.5, 0.6);
    } else {
      const p = limbPoly(18.6, 8.4, 7.4, 0.15);
      paintForm(ctx, p, sleeve.base, rnd, so);
      brush(ctx, [[2, 3], [9, 3.2], [16, 2.8]], 1.1, sleeve.shade, 0.2, 0.9);
      // the cuff (white for the carter's shirt showing)
      const cuff = L.role === 'carter' ? L.shirt : { base: mix(sleeve.base, sleeve.shade, 0.25), light: sleeve.light, shade: sleeve.shade };
      paintForm(ctx, flat([[16.4, -4], [19.6, -3.9], [19.8, 4], [16.6, 4.1]]), cuff.base, rnd, { flip: false, light: cuff.light, shade: cuff.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 10 });
    }
    paintHand(ctx, rnd, 19.2);
  }, 0.5, 82);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([4 * Math.cos((i / 12) * TAU), 4 * Math.sin((i / 12) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), sleeve.base, rnd, { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
  }, 0.5, 83);
  return { upper, fore, elbow };
}

function paintLeg(L: Look, q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(3850 + L.role.length);
  const T = L.trouser;
  const o: FormOpts = { flip: false, light: T.light, shade: T.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 80, grain: 3, grainColor: mix(T.shade, '#000000', 0.2) };
  const stripes = (ctx: CanvasRenderingContext2D, len: number) => {
    if (!L.stripe) return;
    for (const y of [-3.4, -1.1, 1.2, 3.5]) brush(ctx, [[1, y], [len - 1, y * 0.92]], 0.22, T.shade, 0.35, 0.9);
  };
  const thigh = part(38, 20, 8, 10, q, (ctx) => {
    const p = limbPoly(28.5, 11.6, 9.6, -0.3);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    stripes(ctx, 28.5);
    brush(ctx, [[3, 2.4], [11, 2.8], [20, 2.2], [27, 1.6]], 1.5, T.shade, 0.22, 0.9);
    brush(ctx, [[3, -3], [11, -3.4], [20, -2.9]], 0.8, T.light, 0.25, 0.9);
    ctx.restore();
  }, 0.6, 91);
  const shin = part(38, 18, 7, 9, q, (ctx) => {
    const p = limbPoly(28.5, 9.6, 8.6, 0.25);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    stripes(ctx, 28.5);
    brush(ctx, [[2, 2], [12, 2.3], [22, 1.8]], 1.2, T.shade, 0.22, 0.9);
    // the turn-up at the hem, over the boot
    brush(ctx, [[24.5, -4.6], [24.8, 0], [24.5, 4.6]], 0.6, T.shade, 0.4, 0.6);
    ctx.restore();
  }, 0.6, 92);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.2 * Math.cos((i / 14) * TAU), 5.2 * Math.sin((i / 14) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), T.base, rnd, { ...o, speck: 30 });
  }, 0.6, 95);
  return { thigh, shin, knee };
}

/* ------------------------------------------------------------------ the set */

const cache = new Map<string, Sprites>();

/** The painted parts for one crew member at one quality; built once and shared. */
export function buildCrewSet(role: Role, id: LoanId, q: number): Sprites {
  const key = `${role}|${role === 'carter' ? '' : id}@${q}`;
  let s = cache.get(key);
  if (!s) {
    const L = lookFor(role, id);
    const views = (f: (psi: number, k: number) => Part): Part[] => Array.from({ length: VIEWS }, (_, k) => f((k / VIEWS) * TAU, k));
    const arm = paintArm(L, q);
    const leg = paintLeg(L, q);
    const cool = '40,34,70';
    s = {
      torso: views((psi, k) => paintTorsoView(L, psi, q, k)),
      head: views((psi, k) => paintHeadView(L, psi, q, k)),
      scarf: views((psi, k) => paintNeckView(L, psi, q, k)),
      boot: views((psi, k) => paintBootView(L, psi, q, k)),
      upper: arm.upper,
      fore: arm.fore,
      upperFar: tinted(arm.upper, cool, 0.3),
      foreFar: tinted(arm.fore, cool, 0.3),
      thigh: leg.thigh,
      shin: leg.shin,
      thighFar: tinted(leg.thigh, cool, 0.3),
      shinFar: tinted(leg.shin, cool, 0.3),
      knee: leg.knee,
      elbow: arm.elbow,
    };
    cache.set(key, s);
  }
  return s;
}
