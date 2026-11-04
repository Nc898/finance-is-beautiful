/**
 * Hand-painted watercolor sprites for the two apple pickers, and for what they handle: the round wicker basket and
 * the apples. The figures are the brick crew's build (the vine gardener's and the snow climber's rig, the same
 * brushwork; see src/brick/scene/crewArt.ts, whose painting this follows) dressed for picking fruit in late summer:
 * - a shirt with the sleeves rolled to the elbow, open at the neck over a cotton neckerchief in the picker's accent
 *   colour (A blue, B green);
 * - a canvas bib apron with a deep picking pouch across the front, tied at the back;
 * - corduroy trousers and leather work boots;
 * - A wears a wide-brimmed straw hat with a dark band, B a soft cotton sun hat with a stitched brim.
 * The limbs are cylinders, so one painted arm and one painted leg serve every view; the torso, the head, the
 * neckerchief and the boots are painted once per view round the vertical axis (view 0 faces the right of the
 * screen, a quarter of the way round faces the viewer). Everything is lit from the upper left.
 *
 * The basket is painted as two halves (the inside of its back wall with the far rim, then the outside of its front
 * wall with the near rim) so the apples go in between; the apples are small painted sprites in a few states (the
 * picker's golden ones, the farmer's red ones ripening on the bough, and the windfalls browning in the grass).
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, tracePoly } from '../../scene/watercolor';
import { brush, flat, granulate, mix, paintForm, smoothPoly, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { VIEWS } from '../../vine/scene/gardenerDims';
import { ACCENT, APPLE } from './geom';
import type { PickerId } from '../types';

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
  /** the neckerchief, per view */
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

interface Pig {
  base: string;
  light: string;
  shade: string;
}

interface Look {
  id: PickerId;
  shirt: Pig;
  apron: Pig;
  trouser: Pig;
  boot: Pig;
  hair: Pig;
  hat: 'straw' | 'cotton';
  hatCol: Pig;
  band: string;
  neck: { hull: string; light: string; dark: string };
}

const SKIN: Record<PickerId, Pig> = {
  a: { base: '#E2AE86', light: '#FFE0C2', shade: '#8E5236' },
  b: { base: '#D9A27A', light: '#F8D8B8', shade: '#844A30' },
};

function lookFor(id: PickerId): Look {
  const c = ACCENT[id];
  const neck = { hull: c, light: mix(c, '#FFFFFF', 0.4), dark: mix(c, '#101018', 0.5) };
  if (id === 'a') {
    return {
      id,
      shirt: { base: '#E2D8C0', light: '#FFFBEE', shade: '#8C8068' },
      apron: { base: '#B9A47A', light: '#E8D8B0', shade: '#5E4C30' },
      trouser: { base: '#7E6248', light: '#C2A07C', shade: '#36261A' },
      boot: { base: '#6A4630', light: '#B88E66', shade: '#28180E' },
      hair: { base: '#6A4C34', light: '#A8825E', shade: '#2A1A10' },
      hat: 'straw',
      hatCol: { base: '#D8B66C', light: '#F8E6AE', shade: '#86642C' },
      band: '#4A3424',
      neck,
    };
  }
  return {
    id,
    shirt: { base: '#C8CED0', light: '#F4F8FA', shade: '#6E767C' },
    apron: { base: '#B4A27E', light: '#E4D6B4', shade: '#5A4A32' },
    trouser: { base: '#6E6A50', light: '#ACA684', shade: '#2E2C1E' },
    boot: { base: '#5E3E2A', light: '#A8805E', shade: '#22160E' },
    hair: { base: '#9A6A40', light: '#D8A472', shade: '#4A2C14' },
    hat: 'cotton',
    hatCol: { base: '#DCD2B4', light: '#FBF6E4', shade: '#867A5A' },
    band: '#8E8466',
    neck,
  };
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

/** the body's cross-section at a height above the hip (a shirt and apron: slim, as the crew's) */
const TH = [-10, -5, 2, 12, 22, 30, 34, 37, 39.5, 41.5, 43];
const TDF = [7.6, 8.2, 8.6, 8.8, 8.5, 7.7, 6.5, 4.7, 2.7, 1.2, 0.4];
const TDB = [7.0, 7.8, 8.2, 8.6, 8.7, 7.9, 6.7, 4.9, 2.9, 1.4, 0.5];
const TW = [9.2, 9.5, 9.6, 9.8, 9.9, 9.5, 8.3, 5.7, 2.8, 1.3, 0.5];

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
    const rnd = new Rand(4701 + k + (L.id === 'a' ? 0 : 50));
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const C = L.shirt;
    const hsBody = [-10, -8.4, -5, -1, 3, 8, 13, 18, 23, 28, 32, 35, 37.5, 39.5, 41.5, 42.8];
    const body = torsoOutline(psi, hsBody);
    // the shirt over the whole body, open at the neck: the skin in the V
    pf(body, C.base, { light: C.light, shade: C.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 90, grain: 3, grainColor: mix(C.shade, '#000000', 0.2) });
    const vTop = 38;
    const vBot = 31;
    const vMax = 0.42;
    const vHalf = (h: number): number => (h >= vTop ? vMax : h <= vBot ? 0 : vMax * ((h - vBot) / (vTop - vBot)));
    const vHs: number[] = [];
    for (let h = 42.6; h >= vBot; h -= 1.2) vHs.push(h);
    const skinV = torsoBand(psi, vHs, (h) => -vHalf(h), (h) => vHalf(h), 0.35);
    const S = SKIN[L.id];
    if (skinV) pf(skinV, S.base, { light: S.light, shade: S.shade, alpha: 0.97, layers: 3, inkW: 0.3, speck: 10 });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // a fine cotton weave, folds where the cloth turns away, the placket and its buttons
    for (let i = 0; i < 70; i++) {
      const x = rnd.range(-12, 12);
      const y = rnd.range(-52, 10);
      brush(ctx, [[x, y], [x + rnd.range(0.5, 1.2), y + rnd.range(-0.2, 0.2)]], 0.18, rnd.chance(0.5) ? C.shade : C.light, 0.2, 0.9);
    }
    for (const t0 of [2.3, 3.8, -2.3, -3.8]) {
      const pts: SP[] = [];
      for (let h = 34; h >= -2; h -= 3.4) pts.push(tsp(t0, h, psi));
      for (const run of visRuns(pts)) brush(ctx, run, 0.7, C.shade, 0.16, 0.9);
    }
    const plk: SP[] = [];
    for (let h = vBot; h >= 24; h -= 2) plk.push(tsp(0.05, h, psi, 0.3));
    for (const run of visRuns(plk, 0.05)) brush(ctx, run, 0.35, C.shade, 0.5, 0.6);
    const seam: SP[] = [];
    for (let h = 40; h >= -8; h -= 3) seam.push(tsp(Math.PI, h, psi, 0.1));
    for (const run of visRuns(seam)) brush(ctx, run, 0.3, C.shade, 0.26, 0.9);
    // the yoke seam across the back of the shoulders
    const yoke: SP[] = [];
    for (let t = 1.6; t <= 4.7; t += 0.25) yoke.push(tsp(t, 34.5, psi, 0.2));
    for (const run of visRuns(yoke)) brush(ctx, run, 0.3, C.shade, 0.3, 0.9);
    ctx.restore();
    // the shirt collar, open, lying on the shoulders either side of the V
    const collar = torsoBand(psi, [41.8, 40.6, 39.4, 38.4], (h) => vHalf(h) * 0.9 + 0.1, (h) => TAU - vHalf(h) * 0.9 - 0.1, 0.55);
    if (collar) pf(collar, mix(C.base, C.light, 0.25), { light: C.light, shade: C.shade, alpha: 0.96, layers: 3, inkW: 0.4, speck: 12 });

    // the canvas bib apron: a bib up the chest, the pouch across the front, the straps and the ties
    const A = L.apron;
    const half = (h: number): number => (h > 22 ? lin([22, 31], [1.05, 0.62], h) : 1.18);
    const apHs: number[] = [];
    for (let h = 31; h >= -10.4; h -= 1.6) apHs.push(h);
    const apron = torsoBand(psi, apHs, (h) => -half(h), (h) => half(h), 0.55);
    if (apron) {
      pf(apron, A.base, { light: A.light, shade: A.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.28, shadeA: 0.28, inkW: 0.5, speck: 60, grain: 2, grainColor: mix(A.shade, '#000000', 0.2) });
      ctx.save();
      tracePoly(ctx, apron);
      ctx.clip();
      // canvas grain: short dry strokes, then the pouch (a deeper panel with its stitched top edge and a centre seam)
      for (let i = 0; i < 50; i++) {
        const x = rnd.range(-11, 11);
        const y = rnd.range(-32, 10);
        brush(ctx, [[x, y], [x + rnd.range(0.6, 1.4), y + rnd.range(-0.15, 0.15)]], 0.2, rnd.chance(0.5) ? A.shade : A.light, 0.22, 0.9);
      }
      const pouch = torsoBand(psi, [6.5, 4, 1, -2, -5, -8, -10.4], () => -1.22, () => 1.22, 0.9);
      if (pouch) {
        ctx.fillStyle = 'rgba(70,52,30,0.16)';
        tracePoly(ctx, pouch);
        ctx.fill();
        const top: SP[] = [];
        for (let t = -1.15; t <= 1.16; t += 0.16) top.push(tsp(t, 6.4, psi, 0.95));
        for (const run of visRuns(top, 0.05)) {
          brush(ctx, run, 0.55, A.shade, 0.6, 0.6);
          brush(ctx, run.map(([x, y]) => [x, y - 0.8] as Pt), 0.3, A.light, 0.5, 0.6);
        }
        const mid: SP[] = [];
        for (let h = 6.2; h >= -10; h -= 2) mid.push(tsp(0, h, psi, 0.95));
        for (const run of visRuns(mid, 0.05)) brush(ctx, run, 0.3, A.shade, 0.45, 0.8);
      }
      ctx.restore();
    }
    // the neck straps over the shoulders, and the waist ties round the back to a knot
    for (const s of [-1, 1]) {
      const st: SP[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        st.push(tsp(s * lin([0, 1], [0.62, 1.15], u), 31 + 10.2 * u, psi, 0.7));
      }
      for (const run of visRuns(st, 0.02)) brush(ctx, run, 0.9, A.base, 0.95, 0.4);
      const back: SP[] = [];
      for (let i = 0; i <= 6; i++) back.push(tsp(s * (Math.PI - 0.45 * (i / 6)), 41 - 9 * (i / 6), psi, 0.6));
      for (const run of visRuns(back, 0.02)) brush(ctx, run, 0.9, A.base, 0.9, 0.4);
    }
    const tie: SP[] = [];
    for (let t = 1.1; t <= TAU - 1.1; t += 0.12) tie.push(tsp(t, 8.6, psi, 0.75));
    for (const run of visRuns(tie, 0.02)) brush(ctx, run, 1.0, mix(A.base, A.shade, 0.15), 0.9, 0.2);
    const knot = tsp(Math.PI, 8.6, psi, 1.0);
    if (knot.vis > 0.1) {
      brush(ctx, [[knot.x, knot.y], [knot.x - 1.6, knot.y + 3.6]], 0.8, A.base, 0.9, 0.5);
      brush(ctx, [[knot.x, knot.y], [knot.x + 1.3, knot.y + 4.2]], 0.8, A.base, 0.9, 0.5);
      ctx.fillStyle = rgbaPig(A.shade, 0.7);
      ctx.beginPath();
      ctx.ellipse(knot.x, knot.y, 1, 0.8, 0, 0, TAU);
      ctx.fill();
    }
  }, 0.45, 161 + k + (L.id === 'a' ? 0 : 17));
}

const rgbaPig = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

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
  const SK = SKIN[L.id];
  return part(50, 48, 25, 35, q, (ctx) => {
    const rnd = new Rand(4810 + (L.id === 'a' ? 0 : 31) + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const hp = (a: number, h: number, r = headRho(h)): SP => ({ x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) });
    // the neck
    pf(flat([[-2.7, 2], [2.9, 2], [2.7, -5.4], [-2.5, -5.2]]), SK.base, { light: SK.light, shade: SK.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    const noseBase: Array<[number, number, number]> = [[HR - 0.7, 0, 11], [HR + 2.4, 0, 8.4], [HR - 0.3, -1.4, 7.5], [HR - 0.3, 1.4, 7.5]];
    const noseHull = hull(noseBase.map(([a, b, h]) => [a * cp - b * sp, -h + KA * (a * sp + b * cp)] as Pt));
    const paintNose = (): void => {
      if (noseHull.length < 3) return;
      pf(smoothPoly(noseHull, 3, true), mix(SK.base, '#D9886C', 0.25), { light: SK.light, shade: SK.shade, alpha: 0.96, layers: 3, inkW: 0.34, speck: 6 });
      const tip: Pt = [(HR + 2.4) * cp, -8.4 + KA * (HR + 2.4) * sp];
      const bs: Pt = [(HR - 0.3) * cp + 1.4 * sp, -7.5 - KA * 1.4 * cp + KA * (HR - 0.3) * sp];
      brush(ctx, [bs, tip], 0.42, '#9A5C3E', 0.5, 0.9);
    };
    if (sp < 0 && sp > -0.62) paintNose();
    // the head itself, hair all over (B's a little longer, curling over the collar at the back)
    const hsH = [3.3, 3.9, 5, 6.5, 8.5, 10.5, 12.6, 14.6, 16.6, 18.4, 19.9, 21, 21.7, 21.95];
    const Lh: Pt[] = hsH.map((h) => [-headRho(h), -h]);
    const Rh: Pt[] = hsH.map((h) => [headRho(h), -h]);
    pf(smoothPoly([...Lh, ...Rh.reverse()], 3, true), L.hair.base, { light: L.hair.light, shade: L.hair.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.42, speck: 50 });
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i - 3) * 0.3;
      const pts: SP[] = [hp(a, 11.4), hp(a, 8.4), hp(a, L.id === 'b' ? 3.6 : 5.8, L.id === 'b' ? headRho(5) + 0.6 : undefined)];
      for (const run of visRuns(pts, 0.1)) brush(ctx, run, L.id === 'b' ? 0.5 : 0.3, L.hair.shade, 0.35, 0.9);
    }
    // the ears
    for (const s of [-1, 1]) {
      const b = psi + s * 1.57;
      const vis = Math.sin(b);
      if (vis > -0.2) {
        const r = HR + 0.9;
        ctx.fillStyle = 'rgba(210,146,116,0.92)';
        ctx.beginPath();
        ctx.ellipse(r * Math.cos(b), -HC + 0.6 + KA * r * vis, 0.55 + 1.15 * Math.max(0, vis), 2.3, 0, 0, TAU);
        ctx.fill();
      }
    }
    // the face, sunburnt a little across the nose and cheeks
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
      pf(skin, SK.base, { light: SK.light, shade: SK.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
      ctx.save();
      tracePoly(ctx, skin);
      ctx.clip();
      // the hat's shade across the upper face, warm cheeks
      ctx.fillStyle = 'rgba(122,66,44,0.26)';
      const brow: Pt[] = [];
      for (const h of [17, 15.4, 13.8, 12.6]) {
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
      ctx.fillStyle = 'rgba(214,104,86,0.2)';
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
      for (const run of visRuns(bp, 0.08)) brush(ctx, run, 0.4, mix(L.hair.shade, '#000000', 0.1), 0.7, 0.9);
    }
    if (sp >= 0) paintNose();
    const mouth: SP[] = [hp(-0.3, 5.6, HR * 0.99), hp(0, 5.4, HR * 1.0), hp(0.3, 5.6, HR * 0.99)];
    for (const run of visRuns(mouth, 0.06)) brush(ctx, run, 0.32, '#7A3A2C', 0.6, 0.9);
    paintHat(ctx, L, psi, rnd);
  }, 0.4, 151 + (L.id === 'a' ? 0 : 9) + k);
}

function paintHat(ctx: CanvasRenderingContext2D, L: Look, psi: number, rnd: Rand): void {
  const H = L.hatCol;
  const opts: FormOpts = { flip: false, light: H.light, shade: H.shade, alpha: 0.98, layers: 4, amp: 0.022, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 70 };
  /** a point at azimuth a (from the way the head faces), height h, radius r about the head's axis */
  const at = (a: number, h: number, r: number): Pt => [r * Math.cos(psi + a), -h + KA * r * Math.sin(psi + a)];
  if (L.hat === 'straw') {
    // a wide straw brim, nearly flat, dipping a touch at the front and back; a rounded crown with a dark band
    const RB = HR + 8.2;
    const hb = (a: number) => 15.2 - 0.7 * Math.cos(a) * Math.cos(a);
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      outer.push(at(a, hb(a), RB + 0.4 * Math.sin(a * 3 + 1)));
      inner.push(at(a, hb(a) + 0.2, HR + 1.4));
    }
    const brim = smoothPoly(hull(outer), 2, true);
    paintForm(ctx, brim, mix(H.base, H.shade, 0.08), rnd, { ...opts, speck: 40 });
    ctx.save();
    tracePoly(ctx, brim);
    ctx.clip();
    // the plait of the straw: fine strokes running out across the brim, and rings round it
    for (let b = 0; b < TAU; b += 0.16) {
      const a = b + rnd.range(-0.04, 0.04);
      brush(ctx, [at(a, hb(a) + 0.1, HR + 1.8), at(a, hb(a), RB - 0.3)], 0.22, rnd.chance(0.5) ? H.shade : H.light, 0.4, 0.8);
    }
    for (const r of [HR + 3.6, HR + 5.8, RB - 0.6]) {
      const ring: Pt[] = [];
      for (let b = 0; b <= Math.PI + 0.01; b += 0.12) ring.push(at(b - psi, hb(b - psi), r));
      brush(ctx, ring, 0.26, H.shade, 0.35, 0.9);
    }
    // the shade of the crown on the brim, away from the light
    ctx.fillStyle = 'rgba(90,60,30,0.16)';
    ctx.beginPath();
    const sh = at(-psi + Math.PI * 0.35, 15.2, HR + 3);
    ctx.ellipse(sh[0], sh[1], HR + 1.5, KA * (HR + 1.5) + 1, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    void inner;
    const crown: Pt[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      for (const [h, r] of [[15.4, HR + 1.3], [18.5, HR + 1.0], [21.2, HR * 0.85], [22.6, HR * 0.55], [23, HR * 0.15]] as Array<[number, number]>) crown.push(at(a, h, r));
    }
    const dome = smoothPoly(hull(crown), 2, true);
    paintForm(ctx, dome, H.base, rnd, opts);
    ctx.save();
    tracePoly(ctx, dome);
    ctx.clip();
    for (let h = 17.8; h < 23; h += 1.3) {
      const ring: Pt[] = [];
      for (let b = 0; b <= Math.PI + 0.01; b += 0.14) ring.push(at(b - psi, h, Math.sqrt(Math.max(0, 1 - ((h - 15) / 8.4) ** 2)) * (HR + 1.1)));
      brush(ctx, ring, 0.22, H.shade, 0.32, 0.9);
    }
    ctx.restore();
    const band: Pt[] = [];
    for (let b = -0.04; b <= Math.PI + 0.04; b += 0.1) band.push(at(b - psi, 16.5, HR + 1.35));
    brush(ctx, band, 1.6, L.band, 0.85, 0.3);
    return;
  }
  // a soft cotton sun hat: a low, slightly tapered crown and a brim sloping down all round, rows of stitching
  const brimO: Pt[] = [];
  const brimI: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    brimO.push(at(a, 13.6 - 0.3 * Math.sin(a * 2 + 0.5), HR + 5.6));
    brimI.push(at(a, 15.0, HR + 1.6));
  }
  const brim = smoothPoly(hull([...brimO, ...brimI]), 2, true);
  paintForm(ctx, brim, mix(H.base, H.shade, 0.1), rnd, { ...opts, speck: 30 });
  for (const r of [HR + 2.8, HR + 4.0, HR + 5.1]) {
    const ring: Pt[] = [];
    for (let b = 0; b <= Math.PI + 0.01; b += 0.12) {
      const u = (r - HR - 1.6) / 4;
      ring.push(at(b - psi, 15 - 1.4 * u, r));
    }
    brush(ctx, ring, 0.2, H.shade, 0.45, 0.9);
  }
  const crown: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    for (const [h, r] of [[15, HR + 1.7], [18.5, HR + 1.2], [21.4, HR + 0.6], [22.4, HR * 0.6]] as Array<[number, number]>) crown.push(at(a, h, r));
  }
  const dome = smoothPoly(hull(crown), 2, true);
  paintForm(ctx, dome, H.base, rnd, opts);
  ctx.save();
  tracePoly(ctx, dome);
  ctx.clip();
  // the panels' seams and a soft crease in the top
  for (let b = 0.3; b < Math.PI; b += Math.PI / 3) {
    brush(ctx, [at(b - psi, 15.2, HR + 1.8), at(b - psi, 19, HR + 1.3), at(b - psi, 21.6, HR + 0.5)], 0.22, H.shade, 0.4, 0.9);
  }
  const crease: Pt[] = [];
  for (let b = 0.4; b <= Math.PI - 0.4; b += 0.15) crease.push(at(b - psi, 21.4, HR * 0.55));
  brush(ctx, crease, 0.5, H.shade, 0.3, 0.8);
  ctx.restore();
  const band: Pt[] = [];
  for (let b = -0.04; b <= Math.PI + 0.04; b += 0.1) band.push(at(b - psi, 15.9, HR + 1.75));
  brush(ctx, band, 1.0, L.band, 0.6, 0.3);
}

/* ------------------------------------------------------------------ the neckerchief */

function paintNeckView(L: Look, psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(36, 24, 18, 13, q, (ctx) => {
    const rnd = new Rand(4830 + (L.id === 'a' ? 0 : 5) + k);
    const xe = Math.hypot(7.2 * cp, 8.8 * sp);
    const dr = Math.hypot(8.8 * cp, 7.2 * sp);
    const kk = KA * dr;
    const top = (x: number) => -3.6 - kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const bot = (x: number) => 1.4 + kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const T: Pt[] = [];
    const B: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const x = -xe + (2 * xe * i) / 14;
      T.push([x, top(x)]);
      B.push([x, bot(x)]);
    }
    const roll = smoothPoly([...T, ...B.reverse()], 2, true);
    const n = L.neck;
    // a cotton neckerchief knotted at the front, a little to one side, its points hanging below the knot
    paintForm(ctx, roll, n.hull, rnd, { flip: false, light: n.light, shade: n.dark, alpha: 0.97, layers: 3, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.45, speck: 24 });
    // a few pale dots printed on the cotton
    ctx.save();
    tracePoly(ctx, roll);
    ctx.clip();
    ctx.fillStyle = 'rgba(250,246,236,0.55)';
    for (let i = 0; i < 14; i++) ctx.fillRect(rnd.range(-xe, xe), rnd.range(-3.6 - kk, 1.4 + kk), 0.4, 0.4);
    ctx.restore();
    const fa = 0.35;
    const front: Pt = [8 * Math.cos(psi + fa), 1 + KA * 8 * Math.sin(psi + fa)];
    if (Math.sin(psi + fa) > -0.25) {
      const c = front;
      const pts = smoothPoly([[c[0] - 2.2, c[1] - 0.6], [c[0] + 2.2, c[1] - 0.6], [c[0] + 1.4, c[1] + 4.2], [c[0] + 0.3, c[1] + 6.4], [c[0] - 1.2, c[1] + 4.4]], 3, true);
      paintForm(ctx, pts, n.hull, rnd, { flip: false, light: n.light, shade: n.dark, alpha: 0.97, layers: 3, inkW: 0.4, speck: 10 });
      ctx.fillStyle = rgbaPig(n.dark, 0.7);
      ctx.beginPath();
      ctx.ellipse(c[0], c[1] - 0.2, 1.3, 1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(250,246,236,0.6)';
      for (let i = 0; i < 5; i++) ctx.fillRect(c[0] - 1.4 + rnd.range(0, 2.8), c[1] + rnd.range(0.4, 4), 0.35, 0.35);
    }
  }, 0.4, 171 + (L.id === 'a' ? 0 : 3) + k);
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
    const rnd = new Rand(4850 + k + (L.id === 'a' ? 0 : 3));
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
      // dust from the dry summer grass
      brush(ctx, near.map((p) => [p.x, p.y - 0.8] as Pt), 0.9, '#B8A27A', 0.35, 0.5);
    }
    ctx.restore();
    if (sp > -0.15) {
      for (const h of [2.2, 4.6, 7]) brush(ctx, [P(4.2, -1.8, h), P(4.2, 1.8, h)], 0.3, '#D8C4A0', 0.7, 0.9);
    }
    const heel: Pt[] = [P(-5.5, -2.2, -4.1), P(-5.7, 0, -4.1), P(-5.5, 2.2, -4.1)];
    if (sp < 0.3) brush(ctx, heel, 1.5, '#1E1610', 0.7, 0.6);
  }, 0.6, 193 + k + (L.id === 'a' ? 0 : 3));
}

/* ------------------------------------------------------------------ the limbs */

function paintHand(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, S: Pig): void {
  // a bare working hand: the back of it with the knuckles, the fingers curled, the thumb under
  const thumb = smoothPoly([[x0 + 2.2, -3.4], [x0 + 4, -6.4], [x0 + 7, -6.8], [x0 + 8.2, -5.2], [x0 + 7.2, -3]], 3, true);
  paintForm(ctx, thumb, S.base, rnd, { flip: false, light: S.light, shade: S.shade, alpha: 0.98, layers: 3, inkW: 0.4, speck: 10 });
  const hand = smoothPoly([[x0, -3.6], [x0 + 4, -4.4], [x0 + 8.2, -4.4], [x0 + 11.2, -3], [x0 + 12.2, 0], [x0 + 11.2, 3], [x0 + 7.4, 4.4], [x0 + 3, 4.2], [x0, 3.6]], 3, true);
  paintForm(ctx, hand, S.base, rnd, { flip: false, light: S.light, shade: S.shade, alpha: 0.98, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.45, speck: 20 });
  for (const y of [-2, 0, 2]) brush(ctx, [[x0 + 9, y - 0.4], [x0 + 11.4, y]], 0.3, S.shade, 0.45, 0.9);
}

function paintArm(L: Look, q: number): { upper: Part; fore: Part; elbow: Part } {
  const rnd = new Rand(4840 + (L.id === 'a' ? 0 : 7));
  const sleeve = L.shirt;
  const SK = SKIN[L.id];
  const so: FormOpts = { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 50 };
  const upper = part(36, 16, 6, 8, q, (ctx) => {
    const p = limbPoly(25, 9.2, 8.6, 0.2);
    paintForm(ctx, p, sleeve.base, rnd, so);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    brush(ctx, [[2, 3], [10, 3.3], [20, 2.8]], 1.3, sleeve.shade, 0.2, 0.9);
    brush(ctx, [[3, -2.6], [12, -3], [21, -2.6]], 0.8, sleeve.light, 0.25, 0.9);
    ctx.restore();
  }, 0.5, 181);
  const fore = part(42, 18, 6, 9, q, (ctx) => {
    // the forearm bare and brown from the sun, out of a fat rolled cuff at the elbow
    const arm = limbPoly(19, 7.4, 6, 0.1);
    paintForm(ctx, arm, SK.base, rnd, { flip: false, light: SK.light, shade: SK.shade, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.26, inkW: 0.45, speck: 20 });
    paintForm(ctx, flat([[-1.8, -5.2], [5, -5.4], [5.2, 5.4], [-1.6, 5.3]]), sleeve.base, rnd, { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
    brush(ctx, [[1.6, -5], [1.8, 0], [1.6, 5]], 0.5, sleeve.shade, 0.5, 0.6);
    brush(ctx, [[3.6, -5], [3.8, 0], [3.6, 5]], 0.35, sleeve.shade, 0.35, 0.6);
    paintHand(ctx, rnd, 19.2, SK);
  }, 0.5, 182);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([4.2 * Math.cos((i / 12) * TAU), 4.2 * Math.sin((i / 12) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), sleeve.base, rnd, { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
  }, 0.5, 183);
  return { upper, fore, elbow };
}

function paintLeg(L: Look, q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(4860 + (L.id === 'a' ? 0 : 7));
  const T = L.trouser;
  const o: FormOpts = { flip: false, light: T.light, shade: T.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 60 };
  // corduroy: the wales run down the leg, a little lighter on their crowns
  const wales = (ctx: CanvasRenderingContext2D, len: number, w: number) => {
    for (let y = -w / 2 + 0.9; y < w / 2 - 0.5; y += 1.25) {
      brush(ctx, [[0.5, y], [len * 0.5, y * 0.97 + 0.1], [len - 0.5, y * 0.92]], 0.28, T.shade, 0.3, 0.95);
      brush(ctx, [[0.5, y + 0.45], [len - 0.5, y * 0.92 + 0.45]], 0.16, T.light, 0.22, 0.95);
    }
  };
  const thigh = part(38, 20, 8, 10, q, (ctx) => {
    const p = limbPoly(28.5, 11.6, 9.6, -0.3);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wales(ctx, 28.5, 11.6);
    brush(ctx, [[3, 2.4], [11, 2.8], [20, 2.2], [27, 1.6]], 1.5, T.shade, 0.22, 0.9);
    brush(ctx, [[3, -3], [11, -3.4], [20, -2.9]], 0.8, T.light, 0.25, 0.9);
    ctx.restore();
  }, 0.6, 191);
  const shin = part(38, 18, 7, 9, q, (ctx) => {
    const p = limbPoly(28.5, 9.6, 8.8, 0.25);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wales(ctx, 28.5, 9.6);
    brush(ctx, [[2, 2], [12, 2.3], [22, 1.8]], 1.2, T.shade, 0.22, 0.9);
    // the hem bunched over the boot
    brush(ctx, [[24.5, -4.6], [24.8, 0], [24.5, 4.6]], 0.7, T.shade, 0.45, 0.6);
    ctx.restore();
  }, 0.6, 192);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.2 * Math.cos((i / 14) * TAU), 5.2 * Math.sin((i / 14) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), T.base, rnd, { ...o, speck: 30 });
  }, 0.6, 195);
  return { thigh, shin, knee };
}

/* ------------------------------------------------------------------ the set */

const sets = new Map<string, Sprites>();
const pending = new Map<string, Promise<Sprites | null>>();

/**
 * The painted parts for one picker at one quality (px per rig unit), built once and shared. Painted between frames,
 * a view at a time (`tick` yields to the browser, `check` false abandons stale work).
 */
export function buildPickerSet(id: PickerId, q: number, tick: () => Promise<void>, check: () => boolean): Promise<Sprites | null> {
  const key = `${id}@${q.toFixed(3)}`;
  const done = sets.get(key);
  if (done) return Promise.resolve(done);
  const p = pending.get(key);
  if (p) return p;
  const run = (async (): Promise<Sprites | null> => {
    const L = lookFor(id);
    const views = async (f: (psi: number, k: number) => Part): Promise<Part[] | null> => {
      const out: Part[] = [];
      for (let k = 0; k < VIEWS; k++) {
        out.push(f((k / VIEWS) * TAU, k));
        if (k % 4 === 3) {
          await tick();
          if (!check()) return null;
        }
      }
      return out;
    };
    const arm = paintArm(L, q);
    const leg = paintLeg(L, q);
    await tick();
    if (!check()) return null;
    const torso = await views((psi, k) => paintTorsoView(L, psi, q, k));
    if (!torso) return null;
    const head = await views((psi, k) => paintHeadView(L, psi, q, k));
    if (!head) return null;
    const scarf = await views((psi, k) => paintNeckView(L, psi, q, k));
    if (!scarf) return null;
    const boot = await views((psi, k) => paintBootView(L, psi, q, k));
    if (!boot) return null;
    const cool = '40,34,70';
    const s: Sprites = {
      torso,
      head,
      scarf,
      boot,
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
    sets.set(key, s);
    return s;
  })();
  pending.set(key, run);
  void run.finally(() => pending.delete(key));
  return run;
}

/* ------------------------------------------------------------------ the apples */

/** an apple's radius (world units at the reference depth): a big cooking apple, about 9 cm across */
export const APPLE_R = 1.6;

/**
 * The apple sprites, each painted at radius 1 on a 3 × 3 canvas (centre in the middle): the picker's golden apple,
 * the farmer's red one as it ripens on the bough (RIPE steps from small and green to full red), and a windfall as
 * it browns in the grass (ROT steps, the last a soft brown).
 */
export const RIPE = 5;
export const ROT = 5;
export interface AppleSprites {
  q: number;
  gold: HTMLCanvasElement;
  ripe: HTMLCanvasElement[];
  rot: HTMLCanvasElement[];
}

function paintApple(q: number, body: { light: string; mid: string; deep: string }, blush: string | null, blushA: number, seed: number, spots = 0): HTMLCanvasElement {
  const n = Math.max(6, Math.ceil(3 * q));
  const cv = makeCanvas(n, n);
  const ctx = cv.getContext('2d')!;
  const s = n / 3;
  ctx.setTransform(s, 0, 0, s, 1.5 * s, 1.5 * s);
  const rnd = new Rand(seed);
  // the body: a slightly squat round with a dimple at the top, deep on the side away from the light
  const outline: number[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const r = 1 + 0.04 * Math.sin(a * 3 + seed) - (Math.sin(a) < -0.85 ? 0.08 : 0);
    outline.push(Math.cos(a) * r * 1.04, Math.sin(a) * r * 0.96);
  }
  const g = ctx.createRadialGradient(-0.38, -0.42, 0.08, 0.05, 0.08, 1.15);
  g.addColorStop(0, body.light);
  g.addColorStop(0.5, body.mid);
  g.addColorStop(1, body.deep);
  ctx.fillStyle = g;
  tracePoly(ctx, outline);
  ctx.fill();
  if (blush) {
    // a streaked blush washed over the sunny side
    ctx.save();
    tracePoly(ctx, outline);
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      const a = rnd.range(-2.4, 0.6);
      ctx.strokeStyle = rgbaPig(blush, blushA * rnd.range(0.4, 0.8));
      ctx.lineWidth = rnd.range(0.12, 0.3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.25, -0.9);
      ctx.quadraticCurveTo(Math.cos(a) * 1.0, Math.sin(a) * 0.3, Math.cos(a) * 0.5, 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (let i = 0; i < spots; i++) {
    ctx.fillStyle = `rgba(60,36,20,${rnd.range(0.25, 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(rnd.range(-0.5, 0.6), rnd.range(-0.4, 0.6), rnd.range(0.12, 0.3), rnd.range(0.1, 0.24), 0, 0, TAU);
    ctx.fill();
  }
  // the light on the shoulder, the stem in its dimple, and a broken sepia contour
  ctx.fillStyle = 'rgba(255,250,232,0.7)';
  ctx.beginPath();
  ctx.ellipse(-0.42, -0.45, 0.22, 0.15, -0.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,46,26,0.9)';
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  ctx.moveTo(0.02, -0.82);
  ctx.quadraticCurveTo(0.06, -1.15, 0.24, -1.32);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,36,24,0.45)';
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = 0.3 + (i / 24) * 3.9;
    const r = 1.0;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.96);
    else ctx.lineTo(Math.cos(a) * r * 1.03, Math.sin(a) * r * 0.96);
  }
  ctx.stroke();
  return cv;
}

const appleSets = new Map<string, AppleSprites>();

/** the apple sprites at q px per world unit (an apple is drawn at APPLE_R world units) */
export function appleSprites(q: number): AppleSprites {
  const qq = Math.max(2, Math.round(q * APPLE_R * 2) / 2);
  const key = qq.toFixed(1);
  let s = appleSets.get(key);
  if (!s) {
    const own = APPLE.own;
    const red = APPLE.match;
    const green = { light: '#D8E08A', mid: '#9EB04A', deep: '#5E7228' };
    const ripe: HTMLCanvasElement[] = [];
    for (let i = 0; i < RIPE; i++) {
      const t = i / (RIPE - 1);
      const body = { light: mix(green.light, red.light, t), mid: mix(green.mid, red.mid, t), deep: mix(green.deep, red.deep, t) };
      ripe.push(paintApple(qq, body, i > 0 ? red.mid : null, 0.3 + 0.5 * t, 31 + i));
    }
    const brown = { light: '#B08A5A', mid: '#7A5232', deep: '#4A3020' };
    const rot: HTMLCanvasElement[] = [];
    for (let i = 0; i < ROT; i++) {
      const t = i / (ROT - 1);
      const body = { light: mix(red.light, brown.light, t), mid: mix(red.mid, brown.mid, t), deep: mix(red.deep, brown.deep, t) };
      rot.push(paintApple(qq, body, t < 0.6 ? red.deep : null, 0.5 * (1 - t), 51 + i, Math.round(t * 4)));
    }
    s = { q: qq, gold: paintApple(qq, own, '#E0904A', 0.35, 17), ripe, rot };
    appleSets.set(key, s);
  }
  return s;
}

/* ------------------------------------------------------------------ the basket */

/** the round wicker picking basket (world units at the reference depth): rim radius, bottom radius, height, and the
 *  bail's rise above the rim */
export const BASKET = { R: 6.6, R0: 5.2, H: 7.4, BAIL: 6.8 } as const;
/** the oblique squash of a level circle (KAPPA) */
const KY = 0.4;

export interface BasketSprites {
  q: number;
  /** the inside of the back wall and the far rim; the outside of the front wall and the near rim. Both are drawn
   *  with the basket's bottom centre at (ox, oy) units into the canvas. */
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const basketSets = new Map<string, BasketSprites>();

/** the basket's two halves at q px per world unit, for picker `id` (A's basket has a blue rag tied to the bail's
 *  foot, B's green: the accent) */
export function basketSprites(id: PickerId, q: number): BasketSprites {
  const qq = Math.max(2, Math.round(q * 2) / 2);
  const key = `${id}@${qq.toFixed(1)}`;
  let s = basketSets.get(key);
  if (s) return s;
  const { R, R0, H } = BASKET;
  const w = 2 * R + 4;
  const h = H + 2 * R * KY + 4;
  const ox = R + 2;
  const oy = H + R * KY + 2;
  const willow = { base: '#B88A52', light: '#E8C68C', shade: '#5E4024' };
  const inside = { base: '#7A5434', light: '#A8805A', shade: '#3A2414' };
  const mk = (paint: (ctx: CanvasRenderingContext2D, rnd: Rand) => void, seed: number): HTMLCanvasElement => {
    const cv = makeCanvas(w * qq, h * qq);
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.setTransform(qq, 0, 0, qq, ox * qq, oy * qq);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paint(ctx, new Rand(seed));
    granulate(cv, seed, qq, 0.5);
    return cv;
  };
  /** a point on the basket's wall at angle a (0 = right, pi/2 = toward the viewer) and height z */
  const wall = (a: number, z: number): Pt => {
    const r = R0 + (R - R0) * (z / H);
    return [Math.cos(a) * r, -z + Math.sin(a) * r * KY];
  };
  const ring = (z: number, a0: number, a1: number, n = 24): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) out.push(wall(a0 + ((a1 - a0) * i) / n, z));
    return out;
  };
  const back = mk((ctx, rnd) => {
    // the opening: the inside of the back wall down to the floor, in the shade of the near rim
    const opening = smoothPoly(ring(H, 0, TAU, 32), 2, true);
    paintForm(ctx, opening, inside.base, rnd, { flip: false, light: inside.light, shade: inside.shade, alpha: 0.97, layers: 3, inkW: 0, speck: 20 });
    ctx.save();
    tracePoly(ctx, opening);
    ctx.clip();
    // the stakes running down the inside, and the weavers between them
    for (let a = Math.PI + 0.1; a < TAU - 0.05; a += 0.28) {
      brush(ctx, [wall(a, H), wall(a, 0.5)], 0.3, inside.shade, 0.45, 0.8);
    }
    for (let z = 1; z < H; z += 1.1) brush(ctx, ring(z, Math.PI, TAU, 16), 0.5, rnd.chance(0.5) ? inside.light : inside.shade, 0.3, 0.9);
    ctx.fillStyle = 'rgba(40,24,12,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, -H + R * KY * 0.6, R * 0.9, R * KY * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // the far half of the rim: a thick bound hoop
    brush(ctx, ring(H, Math.PI - 0.05, TAU + 0.05, 24), 1.3, willow.base, 0.97, 0.15);
    brush(ctx, ring(H + 0.3, Math.PI, TAU, 24), 0.4, willow.light, 0.6, 0.4);
  }, id === 'a' ? 601 : 607);
  const front = mk((ctx, rnd) => {
    // the outside of the front wall, from the near rim down to the floor
    const outer = smoothPoly([...ring(H, 0, Math.PI, 20), ...ring(0, Math.PI, 0, 20)], 2, true);
    paintForm(ctx, outer, willow.base, rnd, { flip: false, light: willow.light, shade: willow.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.32, inkW: 0.4, speck: 40 });
    ctx.save();
    tracePoly(ctx, outer);
    ctx.clip();
    // the weave: the weavers going in and out of the stakes, row by row, offset each row
    for (let z = 0.6, row = 0; z < H - 0.3; z += 0.95, row++) {
      for (let a = 0.02 + (row % 2) * 0.13; a < Math.PI; a += 0.26) {
        const p0 = wall(a, z);
        const p1 = wall(a + 0.2, z + 0.1);
        brush(ctx, [p0, p1], 0.62, rnd.chance(0.35) ? willow.light : willow.base, 0.7, 0.6);
        brush(ctx, [[p0[0], p0[1] + 0.35], [p1[0], p1[1] + 0.35]], 0.22, willow.shade, 0.5, 0.6);
      }
    }
    for (let a = 0.13; a < Math.PI; a += 0.26) brush(ctx, [wall(a, 0.2), wall(a, H - 0.2)], 0.22, willow.shade, 0.4, 0.9);
    // shade toward the lower right, away from the light
    const sh = ctx.createLinearGradient(-R, -H, R, 0);
    sh.addColorStop(0, 'rgba(255,240,200,0.12)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(50,30,20,0.3)');
    ctx.fillStyle = sh;
    ctx.fillRect(-R - 1, -H - 4, 2 * R + 2, H + 8);
    ctx.restore();
    // the floor's rim and the near half of the top hoop
    brush(ctx, ring(0, 0, Math.PI, 18), 0.8, willow.shade, 0.7, 0.3);
    brush(ctx, ring(H, -0.05, Math.PI + 0.05, 24), 1.4, willow.base, 0.98, 0.15);
    brush(ctx, ring(H + 0.35, 0.1, Math.PI - 0.1, 24), 0.45, willow.light, 0.7, 0.4);
    // the binding wound round the hoop
    for (let a = 0.1; a < Math.PI; a += 0.16) {
      const p = wall(a, H);
      brush(ctx, [[p[0] - 0.3, p[1] - 0.6], [p[0] + 0.3, p[1] + 0.6]], 0.3, willow.shade, 0.55, 0.6);
    }
    // a rag in the picker's colour tied where the bail meets the rim, near side
    const c = ACCENT[id];
    const t = wall(0.15, H);
    paintForm(ctx, smoothPoly([[t[0] - 0.6, t[1] - 0.4], [t[0] + 0.9, t[1] - 0.6], [t[0] + 1.3, t[1] + 2.6], [t[0] + 0.4, t[1] + 3.2], [t[0] - 0.3, t[1] + 1.4]], 3, true), c, rnd, { flip: false, light: mix(c, '#FFFFFF', 0.4), shade: mix(c, '#101018', 0.5), alpha: 0.95, layers: 2, inkW: 0.25, speck: 4 });
  }, id === 'a' ? 611 : 617);
  s = { q: qq, back, front, ox, oy, w, h };
  basketSets.set(key, s);
  return s;
}
