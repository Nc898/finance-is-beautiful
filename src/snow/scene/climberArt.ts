/**
 * Hand-painted watercolor sprites for the climbers: the vine gardener's build (same rig, same dimensions, same
 * brushwork helpers) dressed for winter. A padded coat in quilted bands with a zip, a high collar and snow on the
 * shoulders; a knitted scarf in the hill's colour (snowball: deep blue, avalanche: holly red); a knitted bobble hat
 * pulled down over the ears with a cuff and a stripe in that colour; thick knitted mittens; snow-trousers; chunky
 * snow boots with a fleece cuff. Rosy cheeks and nose from the cold.
 *
 * As the gardener's: the limbs are cylinders, so one painted arm and one painted leg serve every view; what changes
 * with the way the figure faces is painted once per view: the torso (coat), the head (face and hat), the scarf and
 * the boots each exist as VIEWS paintings taken round the vertical axis (view 0 faces the right of the screen, a
 * quarter of the way round faces the viewer, half way faces left, three quarters faces away), each built from the
 * same little solid seen from its own angle, so the features sit where they would, and an angle between two views
 * is two paintings dissolving into each other. Everything is lit from the upper left of the screen.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, tracePoly } from '../../scene/watercolor';
import { brush, flat, granulate, mix, paintForm, smoothPoly, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { VIEWS } from '../../vine/scene/gardenerDims';
import type { StrategyId } from '../types';

export interface Part {
  cv: HTMLCanvasElement;
  /** pivot position inside the canvas, in units; size in units */
  px: number;
  py: number;
  w: number;
  h: number;
}

export interface Sprites {
  /** VIEWS paintings round the vertical axis of each */
  torso: Part[];
  head: Part[];
  scarf: Part[];
  boot: Part[];
  tails: Part;
  upper: Part;
  fore: Part;
  upperFar: Part;
  foreFar: Part;
  thigh: Part;
  shin: Part;
  thighFar: Part;
  shinFar: Part;
  /** a round trouser knee and a rounded elbow, laid over a limb seen end-on */
  knee: Part;
  elbow: Part;
}

const TAU = Math.PI * 2;
/** the painting camera: how much a step toward the viewer shifts a point down the sprite */
const KA = 0.15;

/**
 * Painted on a software canvas (so the paper grain, which reads the pixels back, is cheap) and then copied once
 * onto an ordinary canvas for drawing.
 */
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

/* ------------------------------------------------------------------ pigments */

const SKIN = { base: '#EBBA94', light: '#FFE6CB', shade: '#9A5C3E' };
const COAT = { base: '#B98650', light: '#F0CE96', shade: '#5A3A1C' };
const TROUSER = { base: '#4B5872', light: '#8E9DBA', shade: '#1C2434' };
const WOOL = { base: '#EBDFC2', light: '#FFF9E8', shade: '#96845E' };
const BOOT = { base: '#6E4A33', light: '#BA8F68', shade: '#2A1A10' };
const FLEECE = { base: '#F4ECD8', light: '#FFFDF4', shade: '#A89C80' };
const HAIR = { base: '#7A6048', light: '#C0A07A', shade: '#2E2016' };
const CORD = '#4A3220';

interface Knit {
  hull: string;
  light: string;
  dark: string;
}
/** the hill's colour: deep blue for the snowball hill, holly red for the avalanche hill */
const knitCol = (id: StrategyId): Knit =>
  id === 'snowball' ? { hull: '#2D4E97', light: '#7595D6', dark: '#14264F' } : { hull: '#B3242D', light: '#E9777E', dark: '#5C0F17' };

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
  /** how squarely the surface faces the viewer (> 0 is the side we see) */
  vis: number;
}

/** runs of consecutive visible points */
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

/** convex hull of a point set (monotone chain) */
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

/* ------------------------------------------------------------------ the torso: a padded coat */

/** the coat's cross-section at a height above the hip: half depth in front, half depth behind, half width */
const TH = [-10, -5, 2, 12, 22, 30, 34, 37, 39.5, 41.5, 43];
const TDF = [8.6, 9.4, 10.0, 10.2, 9.6, 8.6, 7.2, 5.2, 3.0, 1.4, 0.4];
const TDB = [8.2, 9.2, 10.0, 10.2, 9.8, 8.8, 7.4, 5.4, 3.2, 1.6, 0.6];
const TW = [10.2, 10.9, 11.4, 11.4, 10.8, 10.2, 8.8, 6.0, 3.0, 1.4, 0.6];

/** a point on the coat's surface at azimuth t round it (0 is the front, positive toward the right) and height h */
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

/** the outline of the coat seen at `psi` */
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

/** a band over the coat's surface between azimuths tLo(h) and tHi(h) for the given heights: only the part we can see */
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

function paintTorsoView(psi: number, q: number, k: number): Part {
  return part(46, 72, 23, 53, q, (ctx) => {
    const rnd = new Rand(2701 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const hsBody = [-10, -8.4, -5, -1, 3, 8, 13, 18, 23, 28, 32, 35, 37.5, 39.5, 41.5, 42.8];
    const body = torsoOutline(psi, hsBody);
    pf(body, COAT.base, { light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 150, grain: 5, grainColor: '#3A2210' });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // the quilting: horizontal baffles, each a dark stitched channel with the puff above it lit and the one below shaded
    const rows = [-6.4, -0.6, 5.2, 11, 16.8, 22.6, 28.4, 33.4];
    for (const h of rows) {
      const ring: SP[] = [];
      for (let t = -Math.PI; t <= Math.PI + 0.01; t += TAU / 56) ring.push(tsp(t, h, psi, 0.05));
      for (const run of visRuns(ring, 0.0)) {
        brush(ctx, run, 0.62, COAT.shade, 0.42, 0.55);
        brush(ctx, run.map(([x, y]) => [x, y - 1.15] as Pt), 0.9, COAT.light, 0.3, 0.6);
        brush(ctx, run.map(([x, y]) => [x, y + 1.3] as Pt), 1.0, COAT.shade, 0.16, 0.6);
      }
    }
    // folds across the back and under the arm, and the shade where the coat turns away
    for (const t0 of [2.4, 3.7, -2.4, -3.7]) {
      const pts: SP[] = [];
      for (let h = 32; h >= -2; h -= 3.4) pts.push(tsp(t0, h, psi));
      for (const run of visRuns(pts)) brush(ctx, run, 0.8, COAT.shade, 0.14, 0.9);
    }
    // the zip down the front, with a little pull near the chin
    const zip: SP[] = [];
    for (let h = -9; h <= 40; h += 2.5) zip.push(tsp(0, h, psi, 0.15));
    for (const run of visRuns(zip, 0.05)) {
      brush(ctx, run, 0.78, '#3A2412', 0.7, 0.3);
      brush(ctx, run, 0.3, '#E6D7B2', 0.5, 0.3);
    }
    const pull = tsp(0.04, 31.5, psi, 0.4);
    if (pull.vis > 0.14) {
      ctx.fillStyle = 'rgba(230,206,150,0.95)';
      ctx.fillRect(pull.x - 0.5, pull.y - 0.6, 1.0, 2.6);
      ctx.strokeStyle = 'rgba(60,40,20,0.6)';
      ctx.lineWidth = 0.18;
      ctx.strokeRect(pull.x - 0.5, pull.y - 0.6, 1.0, 2.6);
    }
    // the hem: a darker elastic band round the bottom, and the cuffs of two handwarmer pockets on the sides
    const hem: SP[] = [];
    for (let t = -Math.PI; t <= Math.PI + 0.01; t += TAU / 56) hem.push(tsp(t, -8.6, psi, 0.15));
    for (const run of visRuns(hem, 0.0)) brush(ctx, run, 2.1, mix(COAT.base, '#3A2410', 0.5), 0.6, 0.35);
    for (const s of [-1, 1]) {
      const pts: SP[] = [];
      for (const [h, tt] of [[14, 0.72], [10.2, 0.78], [6.6, 0.84]] as Array<[number, number]>) pts.push(tsp(s * tt, h, psi, 0.3));
      for (const run of visRuns(pts, 0.03)) brush(ctx, run, 0.5, COAT.shade, 0.5, 0.6);
    }
    ctx.restore();
    // the high collar, a lip of fleece lining round the neck, painted over the coat's top
    const collar = torsoBand(psi, [41.4, 40.2, 38.8, 37.2], () => -Math.PI, () => Math.PI, 0.5);
    if (collar) pf(collar, mix(COAT.base, COAT.light, 0.2), { light: COAT.light, shade: COAT.shade, alpha: 0.96, layers: 3, inkW: 0.4, speck: 16 });
    // the hood folded at the back of the neck, a padded bunch that shows past the shoulders in side views
    const hood = torsoBand(psi, [41, 39.2, 37, 34.8, 32.6, 30.6], () => Math.PI - 0.82, () => Math.PI + 0.82, 3.1);
    if (hood) {
      pf(hood, mix(COAT.base, COAT.shade, 0.16), { light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 3, lightA: 0.28, shadeA: 0.3, inkW: 0.5, speck: 40 });
    }
    // fresh snow lying on the shoulders
    for (const s of [-1, 1]) {
      for (const [tt, h, rr] of [[1.45, 34.6, 2.3], [1.2, 35.9, 1.7], [1.7, 33.4, 1.5]] as Array<[number, number, number]>) {
        const p = tsp(s * tt, h, psi, 0.35);
        if (p.vis > 0.1) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 0.3, rr * (0.55 + 0.45 * p.vis), rr * 0.55, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(150,164,205,0.45)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 0.4, rr * (0.5 + 0.4 * p.vis), rr * 0.3, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    // the back: a seam down the middle
    const seam: SP[] = [];
    for (let h = 40; h >= -8; h -= 3) seam.push(tsp(Math.PI, h, psi, 0.1));
    for (const run of visRuns(seam)) brush(ctx, run, 0.34, COAT.shade, 0.3, 0.9);
    void CORD;
  }, 0.45, 41 + k);
}

/* ------------------------------------------------------------------ the head */

/** the head: a sphere of horizontal radius HR and vertical radius HV centred HC above the neck's base */
const HC = 12.6;
const HR = 8.5;
const HV = 9.3;
const headRho = (h: number): number => {
  const t = (h - HC) / HV;
  const jaw = h < 8.6 ? 0.66 + 0.34 * ss((h - 3.2) / 5.4) : 1;
  return HR * Math.sqrt(Math.max(0.0004, 1 - t * t)) * jaw;
};
/** the part of the surface between azimuths [lo, hi] (from the screen's right round through the viewer to its left) that we can see */
function visWindow(psi: number, half: number): [number, number] | null {
  const p = ((psi % TAU) + TAU) % TAU;
  const lo = Math.max(0, p - half);
  const hi = Math.min(Math.PI, p + half);
  if (hi > lo) return [lo, hi];
  const w = p + half - TAU;
  if (w > 0) return [0, Math.min(Math.PI, w)];
  return null;
}

/** the knitted hat: a dome a little larger than the head, its cuff lower at the back and over the ears than at the brow */
const HAT_RX = HR + 2.0;
const HAT_RY = HV + 2.6;
const hatR = (h: number): number => HAT_RX * Math.sqrt(Math.max(0, 1 - ((h - HC) / HAT_RY) * ((h - HC) / HAT_RY)));
const hatBase = (a: number): number => 12.9 + 2.1 * Math.cos(a);
const POM_H = 24.6;

function paintHeadView(id: StrategyId, psi: number, q: number, k: number): Part {
  const kn = knitCol(id);
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(46, 46, 23, 34, q, (ctx) => {
    const rnd = new Rand(2810 + id.length * 7 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    /** a point on the head: azimuth a from the way it faces, height h; x, y and how squarely it faces the viewer */
    const hp = (a: number, h: number, r = headRho(h)): SP => ({ x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) });
    // the neck
    pf(flat([[-2.7, 2], [2.9, 2], [2.7, -5.4], [-2.5, -5.2]]), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    // the nose is behind the head when facing away, but peeks round the edge a little: first, then
    const noseBase: Array<[number, number, number]> = [[HR - 0.7, 0, 11], [HR + 2.8, 0, 8.4], [HR - 0.3, -1.4, 7.5], [HR - 0.3, 1.4, 7.5]];
    const noseHull = hull(noseBase.map(([a, b, h]) => [a * cp - b * sp, -h + KA * (a * sp + b * cp)] as Pt));
    const paintNose = (): void => {
      if (noseHull.length < 3) return;
      pf(smoothPoly(noseHull, 3, true), mix(SKIN.base, '#E9806A', 0.35), { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.34, speck: 6 });
      const tip: Pt = [(HR + 2.8) * cp, -8.4 + KA * (HR + 2.8) * sp];
      const bs: Pt = [(HR - 0.3) * cp + 1.4 * sp, -7.5 - KA * 1.4 * cp + KA * (HR - 0.3) * sp];
      brush(ctx, [bs, tip], 0.42, '#9A5C3E', 0.5, 0.9);
      ctx.fillStyle = 'rgba(204,70,58,0.5)';
      ctx.beginPath();
      ctx.ellipse(tip[0] - 0.4 * cp, tip[1] + 0.2, 0.8, 0.62, 0, 0, TAU);
      ctx.fill();
    };
    if (sp < 0 && sp > -0.62) paintNose();
    // the head itself, hair all over
    const hsH = [3.3, 3.9, 5, 6.5, 8.5, 10.5, 12.6, 14.6, 16.6, 18.4, 19.9, 21, 21.7, 21.95];
    const L: Pt[] = hsH.map((h) => [-headRho(h), -h]);
    const R: Pt[] = hsH.map((h) => [headRho(h), -h]);
    pf(smoothPoly([...L, ...R.reverse()], 3, true), HAIR.base, { light: HAIR.light, shade: HAIR.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.42, speck: 50 });
    // hair strands at the back and the nape (a little shows under the hat)
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i - 3) * 0.3;
      const pts: SP[] = [hp(a, 11.4), hp(a, 8.4), hp(a, 5.8)];
      for (const run of visRuns(pts, 0.1)) brush(ctx, run, 0.3, HAIR.shade, 0.35, 0.9);
    }
    // the ears, with the cold in them
    for (const s of [-1, 1]) {
      const b = psi + s * 1.57;
      const vis = Math.sin(b);
      if (vis > -0.2) {
        const r = HR + 0.9;
        ctx.fillStyle = 'rgba(224,132,110,0.92)';
        ctx.beginPath();
        ctx.ellipse(r * Math.cos(b), -HC + 0.6 + KA * r * vis, 0.55 + 1.15 * Math.max(0, vis), 2.3, 0, 0, TAU);
        ctx.fill();
      }
    }
    // the face
    const half = (h: number): number => 0.68 + 0.84 * ss((h - 3.6) / 6.4);
    const rowsL: Pt[] = [];
    const rowsR: Pt[] = [];
    const hsF = [3.4, 4, 5, 6.2, 7.6, 9.2, 10.8, 12.4, 14, 15.6, 17.2];
    for (const h of hsF) {
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
      // the shade the hat's cuff casts across the brow, and rosy cheeks, blushed wet-in-wet (rosier in the cold)
      ctx.fillStyle = 'rgba(122,66,44,0.26)';
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
      ctx.fillStyle = 'rgba(224,92,82,0.3)';
      for (const s of [-1, 1]) {
        const p = hp(s * 0.72, 7.8);
        if (p.vis > 0.08) {
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 0.9 + 1.9 * p.vis, 1.6, 0, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    // eyes and brows
    for (const s of [-1, 1]) {
      const e = hp(s * 0.36, 11.6, HR * 0.99);
      if (e.vis > 0.1) {
        ctx.fillStyle = 'rgba(40,28,22,0.92)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 0.2 + 0.4 * e.vis, 0.66, 0, 0, TAU);
        ctx.fill();
      }
      const bp: SP[] = [hp(s * 0.14, 13.5, HR * 0.99), hp(s * 0.4, 13.9, HR * 0.99), hp(s * 0.66, 13.4, HR * 0.99)];
      for (const run of visRuns(bp, 0.08)) brush(ctx, run, 0.4, '#4A2E20', 0.7, 0.9);
    }
    // the nose (in front of the face), the mouth
    if (sp >= 0) paintNose();
    const mouth: SP[] = [hp(-0.3, 5.6, HR * 0.99), hp(0, 5.4, HR * 1.0), hp(0.3, 5.6, HR * 0.99)];
    for (const run of visRuns(mouth, 0.06)) brush(ctx, run, 0.32, '#7A3A2C', 0.6, 0.9);
    const chin: SP[] = [hp(-0.18, 4, HR * 0.8), hp(0.18, 4, HR * 0.8)];
    for (const run of visRuns(chin, 0.1)) brush(ctx, run, 0.3, '#9A5C3E', 0.3, 0.9);

    // ---- the knitted hat
    // a point on the hat at azimuth a (from the way the head faces) and height h, `pad` outside the dome
    const hatPt = (a: number, h: number, pad = 0): SP => {
      const r = hatR(h) + pad;
      return { x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) };
    };
    // the silhouette: the hull of the dome and the cuff's outside
    const cloud: Pt[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const hb = hatBase(a) - 0.4;
      for (const h of [hb, hb + 1.6, hb + 3.6, hb + 6, 18, 20, 22, 23.4, 24.3]) {
        if (h < hb) continue;
        const p = hatPt(a, h, h < hb + 4 ? 1.0 : 0.15);
        cloud.push([p.x, p.y]);
      }
    }
    cloud.push([0.3 * cp * 0, -24.9]);
    const dome = smoothPoly(hull(cloud), 2, true);
    pf(dome, WOOL.base, { light: WOOL.light, shade: WOOL.shade, alpha: 0.98, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 130 });
    ctx.save();
    tracePoly(ctx, dome);
    ctx.clip();
    // a ring band on the visible half of the hat between two height functions
    const ringBand = (lo: (a: number) => number, hi: (a: number) => number, pad: number): number[] | null => {
      const A: Pt[] = [];
      const B: Pt[] = [];
      const N = 30;
      for (let i = 0; i <= N; i++) {
        const b = -0.04 + ((Math.PI + 0.08) * i) / N;
        const a = b - psi;
        const pl = hatPt(a, lo(a), pad);
        const ph = hatPt(a, hi(a), pad);
        A.push([pl.x, pl.y]);
        B.push([ph.x, ph.y]);
      }
      return smoothPoly([...A, ...B.reverse()], 2, true);
    };
    // the stripe in the hill's colour, a hand-span above the cuff
    const stripe = ringBand((a) => hatBase(a) + 5.3, (a) => hatBase(a) + 8.0, 0.35);
    if (stripe) pf(stripe, kn.hull, { light: kn.light, shade: kn.dark, alpha: 0.95, layers: 3, inkW: 0.3, speck: 20, ink: kn.dark });
    // knit: little V stitches in rows on the dome above the stripe and between the stripe and the cuff
    for (let h = 15.6; h < 24; h += 1.55) {
      const hb = (a: number) => hatBase(a);
      for (let b = 0.22; b < Math.PI - 0.2; b += 0.3) {
        const a = b - psi;
        const hh = h + 0.5 * Math.sin(b * 3 + h);
        if (hh < hb(a) + 4.4 || (hh > hb(a) + 5.1 && hh < hb(a) + 8.4) || hh > 23.8) continue;
        const p = hatPt(a, hh, 0.5);
        const w = 0.5 * Math.sin(b);
        brush(ctx, [[p.x - w - 0.2, p.y - 0.55], [p.x, p.y + 0.5], [p.x + w + 0.2, p.y - 0.55]], 0.26, WOOL.shade, 0.32, 0.9);
      }
    }
    for (let h = 15.2; h < 24; h += 1.55) {
      for (let b = 0.22; b < Math.PI - 0.2; b += 0.3) {
        const a = b - psi;
        const hh = h + 0.5 * Math.sin(b * 3 + h);
        if (hh < hatBase(a) + 5.4 || hh > hatBase(a) + 7.9) continue;
        const p = hatPt(a, hh, 0.5);
        const w = 0.5 * Math.sin(b);
        brush(ctx, [[p.x - w - 0.2, p.y - 0.55], [p.x, p.y + 0.5], [p.x + w + 0.2, p.y - 0.55]], 0.26, kn.dark, 0.4, 0.9);
      }
    }
    ctx.restore();
    // the cuff: a folded, ribbed band round the hat, lower at the back and over the ears
    const cuff = ringBand((a) => hatBase(a) - 0.4, (a) => hatBase(a) + 3.9, 1.0);
    if (cuff) {
      pf(cuff, mix(WOOL.base, WOOL.shade, 0.12), { light: WOOL.light, shade: WOOL.shade, alpha: 0.98, layers: 3, lightA: 0.3, shadeA: 0.3, inkW: 0.46, speck: 50 });
      // ribs: fine vertical lines across the band
      for (let b = 0.1; b < Math.PI - 0.05; b += 0.17) {
        const a = b - psi;
        const p0 = hatPt(a, hatBase(a) - 0.2, 1.0);
        const p1 = hatPt(a, hatBase(a) + 3.7, 1.0);
        brush(ctx, [[p0.x, p0.y], [p1.x, p1.y]], 0.22, WOOL.shade, 0.34, 0.8);
      }
    }
    // the bobble on the crown, a little behind it: a fuzzy ball of wool
    {
      const pa = hatPt(Math.PI, POM_H, 0);
      const px = pa.x + 1.1 * Math.cos(psi + Math.PI) * 0;
      const py = -POM_H - 1.1 + KA * 1.2 * Math.sin(psi + Math.PI);
      const R0 = 3.9;
      const circle: Pt[] = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        const rr = R0 * (1 + 0.07 * Math.sin(i * 2.3 + k));
        circle.push([px + rr * Math.cos(a), py + rr * Math.sin(a)]);
      }
      const pom = smoothPoly(circle, 2, true);
      pf(pom, FLEECE.base, { light: FLEECE.light, shade: FLEECE.shade, alpha: 0.98, layers: 4, amp: 0.05, lightA: 0.35, shadeA: 0.32, inkW: 0.3, speck: 60 });
      ctx.save();
      tracePoly(ctx, pom);
      ctx.clip();
      for (let i = 0; i < 44; i++) {
        const a = rnd.range(0, TAU);
        const d0 = rnd.range(0.2, 0.9) * R0;
        const len = rnd.range(0.8, 1.7);
        const x0 = px + Math.cos(a) * d0;
        const y0 = py + Math.sin(a) * d0;
        const lightSide = Math.cos(a) * -0.58 + Math.sin(a) * -0.81 > 0;
        brush(ctx, [[x0, y0], [x0 + Math.cos(a + 0.5) * len, y0 + Math.sin(a + 0.5) * len]], 0.2, lightSide ? '#FFFFFF' : FLEECE.shade, lightSide ? 0.6 : 0.32, 0.9);
      }
      ctx.restore();
      // wisps standing off the edge
      for (let i = 0; i < 14; i++) {
        const a = rnd.range(0, TAU);
        const x0 = px + Math.cos(a) * R0 * 0.96;
        const y0 = py + Math.sin(a) * R0 * 0.96;
        brush(ctx, [[x0, y0], [x0 + Math.cos(a) * 1.1, y0 + Math.sin(a) * 1.1]], 0.2, FLEECE.shade, 0.45, 0.9);
      }
    }
  }, 0.4, 51 + id.length + k);
}

/* ------------------------------------------------------------------ the scarf */

/**
 * The knitted scarf round the neck, painted over the chin's lower edge: a thick roll seen from `psi`, the knot at
 * the back, rows of stitches and two cream stripes. Anchored at the base of the neck.
 */
function paintScarfView(id: StrategyId, psi: number, q: number, k: number): Part {
  const sc = knitCol(id);
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(36, 24, 18, 13, q, (ctx) => {
    const rnd = new Rand(2830 + id.length * 5 + k);
    const xe = Math.hypot(8.3 * cp, 10.6 * sp);
    const dr = Math.hypot(10.6 * cp, 8.3 * sp);
    const kk = KA * dr;
    const top = (x: number) => -5.4 - kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const bot = (x: number) => 4.1 + kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const T: Pt[] = [];
    const B: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const x = -xe + (2 * xe * i) / 14;
      T.push([x, top(x)]);
      B.push([x, bot(x)]);
    }
    const knotAt = (): Pt => [-8 * cp + 1.7 * sp, 0.8 + KA * (-8 * sp - 1.7 * cp)];
    const roll = smoothPoly([...T, ...B.reverse()], 2, true);
    paintForm(ctx, roll, sc.hull, rnd, { flip: false, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 40 });
    ctx.save();
    tracePoly(ctx, roll);
    ctx.clip();
    for (const f of [0.14, 0.34, 0.54, 0.74, 0.9]) {
      for (let x = -xe; x < xe; x += 1.7) {
        const y = top(x) + (bot(x) - top(x)) * f;
        brush(ctx, [[x, y - 0.6], [x + 0.8, y + 0.6], [x + 1.6, y - 0.6]], 0.26, sc.dark, 0.32, 0.9);
      }
    }
    for (const f of [0.3, 0.7]) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = -xe + (2 * xe * i) / 8;
        pts.push([x, top(x) + (bot(x) - top(x)) * f]);
      }
      brush(ctx, pts, 0.95, '#F4E8CC', 0.62, 0.7);
    }
    ctx.restore();
    if (sp < 0.3) {
      const c = knotAt();
      paintForm(ctx, smoothPoly([[c[0] - 3.2, c[1]], [c[0] - 1.6, c[1] - 3.1], [c[0] + 1.8, c[1] - 3], [c[0] + 3.3, c[1]], [c[0] + 1.8, c[1] + 3.1], [c[0] - 1.6, c[1] + 3.1]], 3, true), sc.hull, rnd, { flip: false, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
      brush(ctx, [[c[0] - 2, c[1] - 0.7], [c[0], c[1] + 0.6], [c[0] + 2, c[1] - 0.5]], 0.4, sc.dark, 0.5, 0.9);
    }
  }, 0.4, 71 + id.length + k);
}

function paintTails(id: StrategyId, q: number): Part {
  const rnd = new Rand(2830 + id.length);
  const sc = knitCol(id);
  return part(16, 36, 8, 4, q, (ctx) => {
    const tail = (poly: number[], len: number, w: number) => {
      paintForm(ctx, poly, sc.hull, rnd, { flip: false, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.3, inkW: 0.4, speck: 40 });
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      for (let y = 3; y < len; y += 1.9) brush(ctx, [[w * 0.1, y], [w * 0.5, y + 0.9], [w * 0.9, y]], 0.24, sc.dark, 0.3, 0.9);
      brush(ctx, [[-4, len * 0.34], [4, len * 0.34 + 0.4], [9, len * 0.34]], 0.9, '#F4E8CC', 0.6, 0.7);
      brush(ctx, [[-4, len * 0.7], [4, len * 0.7 + 0.4], [9, len * 0.7]], 0.9, '#F4E8CC', 0.6, 0.7);
      ctx.restore();
      // fringe
      for (let k = 0; k < 5; k++) brush(ctx, [[-1.2 + k * 1.0, len - 0.4], [-1.3 + k * 1.0, len + 2.2]], 0.26, sc.dark, 0.6, 0.9);
    };
    tail(smoothPoly([[-2.4, 0], [3, 0], [4, 12], [3.4, 24], [-2, 23.4], [-3, 11]], 3, true), 23.6, 6);
    ctx.save();
    ctx.translate(1.4, 0);
    ctx.rotate(-0.32);
    tail(smoothPoly([[-2.2, 0], [2.6, 0], [3.4, 9], [2.8, 17], [-1.8, 16.6], [-2.6, 8]], 3, true), 16.8, 5);
    ctx.restore();
  }, 0.5, 71 + id.length);
}

/* ------------------------------------------------------------------ the snow boot */

/**
 * A snow boot seen from the way the foot points: a thick sole and a rounded vamp as a box, a tall shaft as a
 * cylinder with a fleece cuff round the top (ankle at the origin). The trouser leg goes in under the cuff.
 */
function paintBootView(psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const KB = 0.3;
  const P = (a: number, b: number, h: number): Pt => [a * cp - b * sp, -h + KB * (a * sp + b * cp)];
  const D = (a: number, b: number): number => a * sp + b * cp;
  return part(36, 34, 13, 25, q, (ctx) => {
    const rnd = new Rand(2850 + k);
    const sole: Array<[number, number]> = [[-6.4, 0], [-6, 3.2], [-3, 4.5], [2, 4.9], [7, 5.5], [11.5, 5.2], [14.2, 3.4], [14.9, 0]];
    const outline: Array<[number, number]> = [...sole, ...sole.slice(1, -1).reverse().map(([a, b]) => [a, -b] as [number, number])];
    // the shaft (a cylinder) first, then the foot over it
    const shaft: Pt[] = [];
    for (const h of [1.5, 5, 9, 12.6]) {
      const r = h > 11 ? 0.94 : 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        shaft.push(P(-0.6 + 5.7 * r * Math.cos(a), 5.1 * r * Math.sin(a), h));
      }
    }
    const lo: FormOpts = { light: BOOT.light, shade: BOOT.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 60, grain: 2, grainColor: '#3A2212' };
    paintForm(ctx, smoothPoly(hull(shaft), 2, true), BOOT.base, rnd, { flip: false, ...lo });
    const foot: Pt[] = [];
    for (const [a, b] of outline) foot.push(P(a, b, -5.1));
    for (const [a, b, h] of [[7, 0, -0.6], [7, 3.6, -1.6], [7, -3.6, -1.6], [11.5, 0, -2.2], [11.5, 3.2, -2.8], [11.5, -3.2, -2.8], [14, 0, -3.4], [14, 2, -3.8], [14, -2, -3.8]] as Array<[number, number, number]>) foot.push(P(a, b, h));
    for (const h of [-2.5, 0.6]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        foot.push(P(-0.6 + 5.7 * Math.cos(a), 5.1 * Math.sin(a), h));
      }
    }
    const poly = smoothPoly(hull(foot), 2, true);
    paintForm(ctx, poly, BOOT.base, rnd, { flip: false, ...lo });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // the toe cap: a seam across the vamp, and a stitched welt above the sole
    const seam: Pt[] = [];
    for (let b = -4.2; b <= 4.21; b += 0.95) seam.push(P(9.6 + 0.01 * b * b, b, -1.8));
    brush(ctx, seam, 0.36, BOOT.shade, 0.5, 0.9);
    // the sole: a pale rubber band with a dark tread under it, along the near edge
    const edge: SP[] = outline.map(([a, b]) => ({ x: P(a, b, -4.2)[0], y: P(a, b, -4.2)[1], vis: D(a, b) + 0.02 }));
    const ordered = edge.slice().sort((p, q2) => p.x - q2.x);
    const near = ordered.filter((p) => p.vis > 0);
    if (near.length > 1) {
      brush(ctx, near.map((p) => [p.x, p.y] as Pt), 1.9, '#8A7656', 0.9, 0.8);
      brush(ctx, near.map((p) => [p.x, p.y + 1.2] as Pt), 1.1, '#2A1E16', 0.8, 0.8);
    }
    ctx.restore();
    // laces up the front of the shaft
    if (sp > -0.15) {
      for (const h of [2.4, 5, 7.6, 10.2]) brush(ctx, [P(4.9, -2.2, h), P(4.9, 2.2, h)], 0.32, '#EBD9B6', 0.75, 0.9);
    }
    // the fleece cuff round the top: a thick ring, the near side drawn over the shaft, fuzzy along its top edge
    const ringPts: Pt[] = [];
    for (const h of [11.6, 17]) {
      const rr = h > 14 ? 6.4 : 6.9;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ringPts.push(P(-0.6 + rr * Math.cos(a), (rr - 0.5) * Math.sin(a), h));
      }
    }
    const cuffPoly = smoothPoly(hull(ringPts), 2, true);
    paintForm(ctx, cuffPoly, FLEECE.base, rnd, { flip: false, light: FLEECE.light, shade: FLEECE.shade, alpha: 0.98, layers: 4, amp: 0.04, lightA: 0.35, shadeA: 0.3, inkW: 0.36, speck: 70, ink: '#6A5E48' });
    ctx.save();
    tracePoly(ctx, cuffPoly);
    ctx.clip();
    for (let i = 0; i < 40; i++) {
      const a = rnd.range(0, TAU);
      const hh = rnd.range(11.8, 16.8);
      const p = P(-0.6 + 6.5 * Math.cos(a), 6 * Math.sin(a), hh);
      brush(ctx, [[p[0], p[1]], [p[0] + rnd.range(-1, 1), p[1] - rnd.range(0.6, 1.5)]], 0.2, FLEECE.shade, 0.3, 0.9);
    }
    ctx.restore();
    // the heel's dark tread behind
    const heel: Pt[] = [P(-6.1, -2.4, -4.5), P(-6.3, 0, -4.5), P(-6.1, 2.4, -4.5)];
    if (sp < 0.3) brush(ctx, heel, 1.7, '#2A1E16', 0.7, 0.6);
    brush(ctx, [P(-3, -2.7, 9.8), P(-3.4, -2.7, 1)], 0.4, '#E0B890', 0.3, 0.9);
  }, 0.6, 93 + k);
}

/* ------------------------------------------------------------------ the limbs */

function paintArm(id: StrategyId, q: number): { upper: Part; fore: Part; elbow: Part } {
  const kn = knitCol(id);
  const rnd = new Rand(2840);
  const upper = part(36, 16, 6, 8, q, (ctx) => {
    // a padded sleeve: puffed in three channels
    const sleeve = limbPoly(25, 10.8, 10, 0.2);
    paintForm(ctx, sleeve, COAT.base, rnd, { flip: false, light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 70, grain: 3, grainColor: '#3A2210' });
    ctx.save();
    tracePoly(ctx, sleeve);
    ctx.clip();
    for (const x of [8.4, 16.2]) {
      brush(ctx, [[x, -5.4], [x + 0.5, 0], [x, 5.4]], 0.6, COAT.shade, 0.42, 0.6);
      brush(ctx, [[x - 1.5, -4.8], [x - 1.2, 0], [x - 1.5, 4.8]], 0.9, COAT.light, 0.28, 0.6);
    }
    brush(ctx, [[2, 3.4], [10, 3.7], [20, 3.2]], 1.4, COAT.shade, 0.18, 0.9);
    ctx.restore();
  }, 0.5, 81);
  const fore = part(42, 18, 6, 9, q, (ctx) => {
    // the sleeve to the wrist with an elastic cuff, then a thick knitted mitten with its thumb
    const sleeve = limbPoly(18.6, 9.8, 8.6, 0.15);
    paintForm(ctx, sleeve, COAT.base, rnd, { flip: false, light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 50 });
    brush(ctx, [[8, -4.4], [8.4, 0], [8, 4.4]], 0.55, COAT.shade, 0.4, 0.6);
    brush(ctx, [[2, 3.2], [9, 3.4], [16, 3]], 1.2, COAT.shade, 0.18, 0.9);
    paintForm(ctx, flat([[16, -4.6], [20, -4.5], [20.2, 4.6], [16.2, 4.7]]), mix(COAT.base, COAT.shade, 0.42), rnd, { flip: false, light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
    // the thumb first (under the mitten), then the mitten over it
    const thumb = smoothPoly([[22.4, -4.2], [24.4, -7.4], [27.8, -7.9], [29.4, -6.2], [28.6, -3.8]], 3, true);
    paintForm(ctx, thumb, WOOL.base, rnd, { flip: false, light: WOOL.light, shade: WOOL.shade, alpha: 0.98, layers: 3, inkW: 0.4, speck: 24 });
    const mitten = smoothPoly([[19.6, -4.4], [24, -5.3], [28.8, -5.6], [32.4, -4.2], [34.2, -0.4], [33.4, 3.4], [30, 5.6], [25, 5.5], [19.6, 4.5]], 3, true);
    paintForm(ctx, mitten, WOOL.base, rnd, { flip: false, light: WOOL.light, shade: WOOL.shade, alpha: 0.98, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 70 });
    ctx.save();
    tracePoly(ctx, mitten);
    ctx.clip();
    // the ribbed cuff in the hill's colour, and rows of stitches over the back of the mitten
    paintForm(ctx, flat([[19.4, -5.2], [23.4, -5.2], [23.6, 5.4], [19.6, 5.4]]), kn.hull, rnd, { flip: false, light: kn.light, shade: kn.dark, alpha: 0.96, layers: 3, inkW: 0.3, speck: 14, ink: kn.dark });
    for (let x = 24.6; x < 33.4; x += 1.9) {
      for (let y = -4.2; y < 5; y += 2.2) {
        brush(ctx, [[x, y - 0.5], [x + 0.55, y + 0.55], [x + 1.1, y - 0.5]], 0.22, WOOL.shade, 0.34, 0.9);
      }
    }
    brush(ctx, [[24.4, -4.4], [29, -4.9], [32.2, -3.6]], 0.45, '#FFFFFF', 0.5, 0.9);
    ctx.restore();
  }, 0.5, 82);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([4.3 * Math.cos((i / 12) * Math.PI * 2), 4.3 * Math.sin((i / 12) * Math.PI * 2)]);
    paintForm(ctx, smoothPoly(c, 2, true), COAT.base, rnd, { flip: false, light: COAT.light, shade: COAT.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
  }, 0.5, 83);
  return { upper, fore, elbow };
}

function paintLeg(q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(2850);
  const thigh = part(38, 20, 8, 10, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 12.6, 10.4, -0.3), TROUSER.base, rnd, { flip: false, light: TROUSER.light, shade: TROUSER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 90, grain: 3, grainColor: '#2A3246' });
    brush(ctx, [[3, 2.4], [11, 2.8], [20, 2.2], [27, 1.6]], 1.6, TROUSER.shade, 0.22, 0.9);
    brush(ctx, [[3, -3], [11, -3.4], [20, -2.9]], 0.8, '#E6EEF8', 0.3, 0.9);
    brush(ctx, [[9, -6], [9.4, 0], [9, 6]], 0.5, TROUSER.shade, 0.3, 0.6);
  }, 0.6, 91);
  const shin = part(38, 18, 7, 9, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 10.4, 9.2, 0.25), TROUSER.base, rnd, { flip: false, light: TROUSER.light, shade: TROUSER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 80, grain: 3, grainColor: '#2A3246' });
    brush(ctx, [[2, 2], [12, 2.3], [22, 1.8]], 1.3, TROUSER.shade, 0.22, 0.9);
    brush(ctx, [[10, -4.6], [10.4, 0], [10, 4.6]], 0.45, TROUSER.shade, 0.3, 0.6);
  }, 0.6, 92);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.6 * Math.cos((i / 14) * Math.PI * 2), 5.6 * Math.sin((i / 14) * Math.PI * 2)]);
    paintForm(ctx, smoothPoly(c, 2, true), TROUSER.base, rnd, { flip: false, light: TROUSER.light, shade: TROUSER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 40, grain: 3, grainColor: '#2A3246' });
  }, 0.6, 95);
  return { thigh, shin, knee };
}

/* ------------------------------------------------------------------ the set */

function paintSet(id: StrategyId, q: number, shared: { torso: Part[]; boot: Part[] }): Sprites {
  const arm = paintArm(id, q);
  const leg = paintLeg(q);
  const cool = '40,34,70';
  const views = (f: (psi: number, k: number) => Part): Part[] => Array.from({ length: VIEWS }, (_, k) => f((k / VIEWS) * TAU, k));
  return {
    torso: shared.torso,
    boot: shared.boot,
    head: views((psi, k) => paintHeadView(id, psi, q, k)),
    scarf: views((psi, k) => paintScarfView(id, psi, q, k)),
    tails: paintTails(id, q),
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
}

const cache = new Map<string, Sprites>();
const sharedCache = new Map<number, { torso: Part[]; boot: Part[] }>();

/** The painted parts for one hill's climber at one quality; built once and shared. */
export function buildClimberSet(id: StrategyId, q: number): Sprites {
  const key = `${id}@${q}`;
  let s = cache.get(key);
  if (!s) {
    let sh = sharedCache.get(q);
    if (!sh) {
      const views = (f: (psi: number, k: number) => Part): Part[] => Array.from({ length: VIEWS }, (_, k) => f((k / VIEWS) * TAU, k));
      sh = { torso: views((psi, k) => paintTorsoView(psi, q, k)), boot: views((psi, k) => paintBootView(psi, q, k)) };
      sharedCache.set(q, sh);
    }
    s = paintSet(id, q, sh);
    cache.set(key, s);
  }
  return s;
}
