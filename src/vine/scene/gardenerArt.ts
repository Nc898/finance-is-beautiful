/**
 * Hand-painted watercolor sprites for the gardeners, made once per quality. Same house style and the same
 * brushwork helpers as the rowers (boatInk.ts): glazes, pooled edges, dry-brush grain, broken tapering ink.
 *
 * The limbs are cylinders, so one painted arm and one painted leg serve every view. What changes with the way
 * the figure faces is painted once per view: the torso (waistcoat, apron, ties), the head (face, cap), the
 * scarf and the boots each exist as VIEWS paintings taken round the vertical axis (view 0 faces the right of
 * the screen, a quarter of the way round faces the viewer, half way faces left, three quarters faces away).
 * Each is built from the same little solid (an elliptical torso, a sphere for the head, a boot as a box and a
 * cylinder) seen from its own angle, so the features (the eyes, the nose, the apron's edge, the knot of the
 * scarf) sit where they would, and an angle between two views is two paintings dissolving into each other.
 * Everything is lit from the upper left of the screen, so nothing is ever mirrored. Dressed for autumn: tweed
 * flat cap (or a wide felt hat), a knitted scarf in the plan's colour, a canvas apron with a patch pocket,
 * rolled sleeves, denim trousers, leather boots, gloves.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import type { PlanId } from '../types';
import { BOAT_COLORS } from '../../river/scene/boatArt';
import { SEPIA, brush, feather, flat, granulate, inkDashes, mix, paintForm, smoothPoly, speckle, streaks, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { RAKE, VIEWS } from './gardenerDims';

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
  /** a round denim knee and a rounded elbow, laid over a limb seen end-on */
  knee: Part;
  elbow: Part;
  /** the secateurs: the half held still (A) and the half that opens (B), both with their pivot at the origin */
  shearsA: Part;
  shearsB: Part;
  /** the leaf rake, lit for a figure facing right (R) and for the mirror (L, for the one leaning at rest facing left) */
  rake: Part;
  rakeL: Part;
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

/** a polygon around a centre line with widths w0 → w1 */
function bandPoly(c: Pt[], w0: number, w1: number, seg = 3): number[] {
  const n = c.length;
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)]!;
    const b = c[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const hw = (w0 + (w1 - w0) * (i / Math.max(1, n - 1))) / 2;
    L.push([c[i]![0] - dy * hw, c[i]![1] + dx * hw]);
    R.push([c[i]![0] + dy * hw, c[i]![1] - dx * hw]);
  }
  return smoothPoly([...L, ...R.reverse()], seg, true);
}

/* ------------------------------------------------------------------ pigments */

const SKIN = { base: '#EBBA94', light: '#FFE6CB', shade: '#9A5C3E' };
const LINEN = { base: '#EFE3C6', light: '#FFF8E8', shade: '#8E7E62' };
const VEST = { base: '#946440', light: '#D8AC82', shade: '#43291A' };
const APRON = { base: '#D9C48F', light: '#F8ECC6', shade: '#85703F' };
const DENIM = { base: '#62788E', light: '#B6C8D8', shade: '#27384F' };
const LEATHER = { base: '#70492F', light: '#C99E76', shade: '#27170D' };
const GLOVE = { base: '#C89A50', light: '#F1D28E', shade: '#6C481C' };
const STEEL = { base: '#A9B3BF', light: '#F6F9FC', shade: '#3A4350' };
const ENAMEL = { base: '#C8432E', light: '#F2917A', shade: '#6A1C14' };
const WOOD = { base: '#C9A06A', light: '#F6E2B2', shade: '#5E4028' };
const CAP: Record<PlanId, { base: string; light: string; shade: string }> = {
  minimum: { base: '#8A7B66', light: '#CFC0A2', shade: '#3C3225' },
  fixed: { base: '#B8A066', light: '#EAD9A0', shade: '#5E4A22' },
};
const HAIR = { base: '#7A6048', light: '#C0A07A', shade: '#2E2016' };
const CORD = '#5A3A22';
const scarfCol = (id: PlanId) => (id === 'minimum' ? BOAT_COLORS.cash : BOAT_COLORS.invest);

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

/* ------------------------------------------------------------------ the torso */

/** the waistcoat's cross-section at a height above the hip: half depth in front, half depth behind, half width */
const TH = [-5, 4, 14, 24, 32, 36, 38.4, 40.4, 41.2];
const TDF = [7.4, 8.4, 8.8, 8.3, 7.4, 5.8, 4.4, 2.0, 0.4];
const TDB = [7.0, 8.0, 9.0, 9.0, 8.4, 7.0, 5.6, 3.2, 1.2];
const TW = [8.4, 9.2, 9.8, 9.8, 9.0, 7.2, 5.2, 2.4, 0.8];

/** a point on the torso's surface at azimuth t round it (0 is the front, positive toward the right) and height h */
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

/** the outline of the torso seen at `psi` */
function torsoOutline(psi: number, hs: number[]): number[] {
  const L: Pt[] = [];
  const R: Pt[] = [];
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  for (const h of hs) {
    const df = lin(TH, TDF, h);
    const db = lin(TH, TDB, h);
    const w = lin(TH, TW, h);
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

/** a band over the torso's surface between azimuths tLo(h) and tHi(h) for the given heights: only the part we can see */
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
  return part(32, 62, 16, 47, q, (ctx) => {
    const rnd = new Rand(1701 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const sp = Math.sin(psi);
    const hsBody = [-4.4, -1, 3, 8, 13, 18, 23, 28, 32, 35, 37, 38.6, 39.8, 40.8, 41.3];
    // the waistcoat
    const body = torsoOutline(psi, hsBody);
    pf(body, VEST.base, { light: VEST.light, shade: VEST.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 160, grain: 4, grainColor: '#3A2214' });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // soft folds across the back and under the arm
    for (const t0 of [2.5, 3.6, -2.5, -3.6]) {
      const pts: SP[] = [];
      for (let h = 34; h >= 8; h -= 3.2) pts.push(tsp(t0, h, psi));
      for (const run of visRuns(pts)) brush(ctx, run, 0.8, VEST.shade, 0.18, 0.9);
    }
    const sh: SP[] = [];
    for (let t = 0; t <= TAU + 0.01; t += TAU / 24) sh.push(tsp(t, 39, psi));
    for (const run of visRuns(sh)) brush(ctx, run, 1.2, '#2C2038', 0.16, 0.9);
    ctx.restore();
    // the shirt at the collar
    const shirt = torsoBand(psi, [41.4, 39.4, 37.4, 35.4, 33.4, 31.4], (h) => -0.75 * ss((h - 30.5) / 11), (h) => 0.75 * ss((h - 30.5) / 11), 0.5);
    if (shirt) pf(shirt, LINEN.base, { light: LINEN.light, shade: LINEN.shade, alpha: 0.96, layers: 2, inkW: 0.36, speck: 14 });
    // the canvas apron: a bib down the front and a skirt that hangs over the thighs
    const tA = (h: number) => (h >= 30 ? 0.62 + 0.28 * ((35 - h) / 5) : h >= 22 ? 0.9 + 0.22 * ((30 - h) / 8) : 1.16);
    const hsA = [35, 33, 30, 26, 22, 18, 14, 10, 6, 2, -2, -6, -9.6];
    const apron = torsoBand(psi, hsA, (h) => -tA(h), (h) => tA(h), 0.8);
    if (apron) {
      pf(apron, APRON.base, { light: APRON.light, shade: APRON.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.26, inkW: 0.5, speck: 120, grain: 5, grainColor: '#7A6438' });
      // stitching along the apron's edges and the hem
      ctx.strokeStyle = 'rgba(110,84,42,0.5)';
      ctx.lineWidth = 0.26;
      ctx.setLineDash([1.1, 0.9]);
      for (const s of [-1, 1]) {
        const pts: SP[] = [];
        for (const h of hsA) pts.push(tsp(s * (tA(h) - 0.07), h, psi, 0.8));
        for (const run of visRuns(pts)) {
          ctx.beginPath();
          ctx.moveTo(run[0]![0], run[0]![1]);
          for (const p of run) ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
      }
      const hem: SP[] = [];
      for (let t = -1.1; t <= 1.1; t += 0.11) hem.push(tsp(t, -7.6, psi, 0.8));
      for (const run of visRuns(hem)) {
        ctx.beginPath();
        ctx.moveTo(run[0]![0], run[0]![1]);
        for (const p of run) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // the patch pocket on the right (its mouth is where the shears go)
    const pocket = torsoBand(psi, [19, 17, 15, 13, 11, 9, 7], () => 0.1, () => 0.74, 1.25);
    if (pocket) {
      pf(pocket, mix(APRON.base, '#B89A5E', 0.35), { light: APRON.light, shade: APRON.shade, alpha: 0.96, layers: 3, inkW: 0.42, speck: 30, ink: '#4A3A1E' });
      const mouth: SP[] = [];
      for (let t = 0.12; t <= 0.72; t += 0.08) mouth.push(tsp(t, 17.3, psi, 1.25));
      for (const run of visRuns(mouth)) brush(ctx, run, 0.3, '#5A421E', 0.55, 0.9);
    }
    // the waist tie: brown cord round the middle, tied in a bow at the back
    const tie: SP[] = [];
    for (let t = -Math.PI; t <= Math.PI + 0.01; t += TAU / 40) tie.push(tsp(t, 14.8, psi, 1.0));
    for (const run of visRuns(tie)) brush(ctx, run, 0.7, CORD, 0.75, 0.6);
    const bow = tsp(Math.PI, 14.8, psi, 1.5);
    if (bow.vis > 0.04) {
      const cp = Math.cos(psi);
      const at = (b: number, dh: number): Pt => [bow.x - b * sp, bow.y - dh + KA * b * cp];
      ctx.fillStyle = rgba(CORD, 0.8);
      for (const s of [-1, 1]) {
        const c = at(s * 2.6, 0.4);
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], Math.max(0.8, 2.0 * Math.abs(sp)) + 0.4, 1.5, 0, 0, TAU);
        ctx.fill();
        brush(ctx, [at(s * 0.4, 0), at(s * 1.6, -5.2)], 0.55, CORD, 0.8, 0.8);
      }
      brush(ctx, [at(-0.6, 0.3), at(0.6, 0.3)], 0.9, '#3E2616', 0.8, 0.6);
    }
    // neck straps over each shoulder
    for (const s of [-1, 1]) {
      const ctrl: Array<[number, number]> = [[0.7, 34.6], [1.1, 37.6], [1.55, 40], [2.1, 40.5], [2.7, 38], [3.0, 34]];
      const pts: SP[] = ctrl.map(([t, h]) => tsp(s * t, h, psi, 0.6));
      for (const run of visRuns(pts)) {
        brush(ctx, run, 0.8, CORD, 0.78, 0.7);
        brush(ctx, run, 0.26, '#C8A070', 0.45, 0.9);
      }
    }
    // two buttons on the waistcoat edge, beside the apron
    ctx.fillStyle = 'rgba(40,24,14,0.8)';
    for (const s of [-1, 1]) {
      for (const h of [26, 14]) {
        const p = tsp(s * 1.42, h, psi, 0.3);
        if (p.vis > 0.06) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.55, 0, TAU);
          ctx.fill();
        }
      }
    }
    // the back: a seam down the middle and a half-belt with a little buckle
    const seam: SP[] = [];
    for (let h = 40; h >= -3; h -= 3) seam.push(tsp(Math.PI, h, psi, 0.1));
    for (const run of visRuns(seam)) brush(ctx, run, 0.34, VEST.shade, 0.3, 0.9);
    const belt = torsoBand(psi, [25.4, 23.8, 22.2, 20.6], () => Math.PI - 0.85, () => Math.PI + 0.85, 0.6);
    if (belt) {
      pf(belt, '#6A4630', { light: '#A8805A', shade: '#2A1A10', alpha: 0.96, layers: 3, inkW: 0.36, speck: 16, ink: '#2A1A10' });
      const bk = tsp(Math.PI, 23, psi, 0.7);
      if (bk.vis > 0.1) brush(ctx, [[bk.x - 0.9, bk.y], [bk.x + 0.9, bk.y]], 1.5, '#D8B060', 0.85, 0.5);
    }
    void sp;
  }, 0.45, 31 + k);
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

function paintHeadView(id: PlanId, psi: number, q: number, k: number): Part {
  const cap = CAP[id];
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(46, 46, 23, 34, q, (ctx) => {
    const rnd = new Rand(1810 + id.length * 7 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    /** a point on the head: azimuth a from the way it faces, height h; x, y and how squarely it faces the viewer */
    const hp = (a: number, h: number, r = headRho(h)): SP => ({ x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) });
    // the neck
    pf(flat([[-2.7, 2], [2.9, 2], [2.7, -5.4], [-2.5, -5.2]]), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.32, speck: 10 });
    // facing away, the peak of the cap is behind the crown: paint it first
    const peakAt = (hr: number): number[] => {
      const rc = 9.4;
      const pts: Pt[] = [];
      for (const [a, b] of [[rc - 1.6, -5.4], [rc + 3.6, -4.6], [rc + 5, -2.4], [rc + 5.5, 0], [rc + 5, 2.4], [rc + 3.6, 4.6], [rc - 1.6, 5.4]] as Array<[number, number]>) {
        pts.push([a * cp - b * sp, -hr + KA * (a * sp + b * cp)]);
      }
      return smoothPoly(pts, 3, true);
    };
    const isCap = id === 'minimum';
    const hr = isCap ? 15.6 : 15.8;
    if (isCap && sp < -0.05) {
      pf(peakAt(hr - 0.8), mix(cap.base, '#2E2418', 0.25), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 20 });
    }
    // the nose is behind the head when facing away, but peeks round the edge a little: first, then
    const noseBase: Array<[number, number, number]> = [[HR - 0.7, 0, 11], [HR + 2.8, 0, 8.4], [HR - 0.3, -1.4, 7.5], [HR - 0.3, 1.4, 7.5]];
    const noseHull = hull(noseBase.map(([a, b, h]) => [a * cp - b * sp, -h + KA * (a * sp + b * cp)] as Pt));
    const paintNose = (): void => {
      if (noseHull.length < 3) return;
      pf(smoothPoly(noseHull, 3, true), SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.34, speck: 6 });
      const tip: Pt = [(HR + 2.8) * cp, -8.4 + KA * (HR + 2.8) * sp];
      const bs: Pt = [(HR - 0.3) * cp + 1.4 * sp, -7.5 - KA * 1.4 * cp + KA * (HR - 0.3) * sp];
      brush(ctx, [bs, tip], 0.42, '#9A5C3E', 0.5, 0.9);
      ctx.fillStyle = 'rgba(122,58,44,0.55)';
      ctx.beginPath();
      ctx.ellipse(tip[0] - 0.4 * cp, tip[1] + 0.45, 0.45, 0.32, 0, 0, TAU);
      ctx.fill();
    };
    if (sp < 0 && sp > -0.62) paintNose();
    // the head itself, hair all over
    const hsH = [3.3, 3.9, 5, 6.5, 8.5, 10.5, 12.6, 14.6, 16.6, 18.4, 19.9, 21, 21.7, 21.95];
    const L: Pt[] = hsH.map((h) => [-headRho(h), -h]);
    const R: Pt[] = hsH.map((h) => [headRho(h), -h]);
    pf(smoothPoly([...L, ...R.reverse()], 3, true), HAIR.base, { light: HAIR.light, shade: HAIR.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.42, speck: 50 });
    // hair strands at the back and the nape
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i - 2.5) * 0.28;
      const pts: SP[] = [hp(a, 15.6), hp(a, 11), hp(a, 6.6)];
      for (const run of visRuns(pts, 0.1)) brush(ctx, run, 0.3, HAIR.shade, 0.35, 0.9);
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
    const hsF = [3.4, 4, 5, 6.2, 7.6, 9.2, 10.8, 12.4, 14, 15.6, 17.2];
    for (const h of hsF) {
      const w = visWindow(psi, half(h));
      if (!w) continue;
      const r = headRho(h);
      rowsL.push([r * Math.cos(w[1]), -h]);
      rowsR.push([r * Math.cos(w[0]), -h]);
    }
    let skin: number[] | null = null;
    if (rowsL.length >= 3 && Math.max(...rowsR.map((p, i) => p[0] - rowsL[i]![0])) > 1.2) {
      skin = smoothPoly([...rowsL, ...rowsR.slice().reverse()], 3, true);
      pf(skin, SKIN.base, { light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.24, inkW: 0.46, speck: 50 });
      ctx.save();
      tracePoly(ctx, skin);
      ctx.clip();
      // the shade the cap's peak casts across the brow, and rosy cheeks, blushed wet-in-wet
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
      ctx.fillStyle = 'rgba(226,116,98,0.24)';
      for (const s of [-1, 1]) {
        const p = hp(s * 0.72, 7.8);
        if (p.vis > 0.08) {
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 0.8 + 1.7 * p.vis, 1.5, 0, 0, TAU);
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
    // the cap or hat
    if (isCap) {
      // a flat tweed cap: a puffed crown, a seam from the button to each panel, a short peak
      const rx = 10.1;
      const ry = 8.4;
      const cx = 1.1 * cp;
      const cy = -hr + KA * 1.1 * sp;
      const crown: Pt[] = [];
      // over the top from the right to the left, then back along the lower rim, which bulges toward the viewer
      for (let u = 0; u <= 16; u++) {
        const a = (u / 16) * Math.PI;
        crown.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)]);
      }
      for (let u = 1; u < 16; u++) {
        const a = (u / 16) * Math.PI;
        crown.push([cx - rx * Math.cos(a), cy + KA * rx * Math.sin(a)]);
      }
      const crownPoly = smoothPoly(crown, 2, true);
      pf(crownPoly, cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 140 });
      ctx.save();
      tracePoly(ctx, crownPoly);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = i % 3 ? rgba(cap.shade, 0.38) : rgba(cap.light, 0.55);
        ctx.fillRect(rnd.range(-10, 11), rnd.range(-25, -14), rnd.range(0.3, 0.9), rnd.range(0.2, 0.5));
      }
      // the six panels meet at the button on top
      const apex: Pt = [cx + 0.5 * cp, cy - ry * 0.94 + KA * 0.5 * sp];
      for (let i = 0; i < 6; i++) {
        const b = psi + (i * Math.PI) / 3 + Math.PI / 6;
        if (Math.sin(b) <= 0.05) continue;
        const rim: Pt = [cx + rx * Math.cos(b), cy + KA * rx * Math.sin(b)];
        const mid: Pt = [(apex[0] + rim[0]) / 2 + Math.cos(b) * 0.9, (apex[1] + rim[1]) / 2 - 0.4];
        brush(ctx, [apex, mid, rim], 0.34, cap.shade, 0.4, 0.9);
      }
      ctx.fillStyle = rgba(cap.shade, 0.7);
      ctx.beginPath();
      ctx.arc(apex[0], apex[1], 0.55, 0, TAU);
      ctx.fill();
      // the band round the rim
      const rimPts: Pt[] = [];
      for (let u = 0; u <= 12; u++) {
        const a = (u / 12) * Math.PI;
        rimPts.push([cx + rx * 0.99 * Math.cos(a), cy + KA * rx * Math.sin(a) - 0.3]);
      }
      brush(ctx, rimPts, 0.8, mix(cap.base, '#2E2418', 0.3), 0.55, 0.9);
      ctx.restore();
      if (sp >= -0.05) pf(peakAt(hr - 0.8), mix(cap.base, '#2E2418', 0.25), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 20 });
    } else {
      // a wide felt hat with a band in the scarf colour
      const sc = scarfCol(id);
      const bry = KA * 15.2;
      const brim: Pt[] = [];
      for (let u = 0; u < 28; u++) {
        const a = (u / 28) * TAU;
        brim.push([15.2 * Math.cos(a), -hr + bry * Math.sin(a)]);
      }
      pf(smoothPoly(brim, 2, true), cap.base, { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 110 });
      const arc = (rx2: number, y0: number, up: boolean, n = 10): Pt[] => {
        const o: Pt[] = [];
        for (let i = 0; i <= n; i++) {
          const x = -rx2 + (2 * rx2 * i) / n;
          const r = Math.sqrt(Math.max(0, 1 - (x / rx2) * (x / rx2)));
          o.push([x, y0 + (up ? -1 : 1) * KA * rx2 * r]);
        }
        return o;
      };
      const yTop = -hr - 9.6;
      const crownPts: Pt[] = [...arc(6.9, -hr, false), ...arc(6.3, yTop, true).reverse()];
      pf(smoothPoly(crownPts, 2, true), mix(cap.base, cap.light, 0.2), { light: cap.light, shade: cap.shade, alpha: 0.97, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 90 });
      // the top of the crown, with the dent pressed along it
      const topEll: Pt[] = [];
      for (let u = 0; u < 20; u++) {
        const a = (u / 20) * TAU;
        topEll.push([6.3 * Math.cos(a), yTop + KA * 6.3 * Math.sin(a)]);
      }
      pf(smoothPoly(topEll, 2, true), mix(cap.base, cap.light, 0.4), { light: cap.light, shade: cap.shade, alpha: 0.9, layers: 2, inkW: 0.3, speck: 30 });
      const dent: Pt[] = [];
      for (let a = -4.6; a <= 4.6; a += 2.3) dent.push([a * cp, yTop + KA * a * sp]);
      brush(ctx, dent, 0.7, cap.shade, 0.35, 0.9);
      // the band
      const bandPts: Pt[] = [...arc(6.95, -hr - 0.3, false), ...arc(6.8, -hr - 3.4, false).reverse()];
      ctx.save();
      tracePoly(ctx, smoothPoly(crownPts, 2, true));
      ctx.clip();
      pf(smoothPoly(bandPts, 2, true), sc.hull, { light: sc.light, shade: sc.dark, alpha: 0.95, layers: 3, inkW: 0.34, speck: 14, ink: '#1F3A2A' });
      brush(ctx, [[-3.6, yTop + 0.8], [-1.8, yTop + 0.2]], 0.6, '#FFF8D4', 0.5, 0.9);
      ctx.restore();
    }
  }, 0.4, 51 + id.length + k);
}

/* ------------------------------------------------------------------ the scarf */

/**
 * The knitted scarf round the neck, painted over the chin's lower edge: a roll seen from `psi`, the knot at the
 * back, a few rows of stitches and two cream stripes. Anchored at the base of the neck.
 */
function paintScarfView(id: PlanId, psi: number, q: number, k: number): Part {
  const sc = scarfCol(id);
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return part(34, 22, 17, 12, q, (ctx) => {
    const rnd = new Rand(1830 + id.length * 5 + k);
    const xe = Math.hypot(7.4 * cp, 9.6 * sp);
    const dr = Math.hypot(9.6 * cp, 7.4 * sp);
    const kk = KA * dr;
    const top = (x: number) => -4.8 - kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const bot = (x: number) => 3.4 + kk * Math.sqrt(Math.max(0, 1 - (x / xe) * (x / xe)));
    const T: Pt[] = [];
    const B: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const x = -xe + (2 * xe * i) / 14;
      T.push([x, top(x)]);
      B.push([x, bot(x)]);
    }
    // the knot at the back, when it is on the side we see: painted after the roll
    const knotAt = (): Pt => [-7.2 * cp + 1.6 * sp, 0.6 + KA * (-7.2 * sp - 1.6 * cp)];
    const roll = smoothPoly([...T, ...B.reverse()], 2, true);
    paintForm(ctx, roll, sc.hull, rnd, { flip: false, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.28, inkW: 0.46, speck: 40 });
    ctx.save();
    tracePoly(ctx, roll);
    ctx.clip();
    // knit: little V stitches in rows, and two cream stripes
    for (const f of [0.18, 0.5, 0.82]) {
      for (let x = -xe; x < xe; x += 1.7) {
        const y = top(x) + (bot(x) - top(x)) * f;
        brush(ctx, [[x, y - 0.6], [x + 0.8, y + 0.6], [x + 1.6, y - 0.6]], 0.26, sc.dark, 0.3, 0.9);
      }
    }
    for (const f of [0.33, 0.72]) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = -xe + (2 * xe * i) / 8;
        pts.push([x, top(x) + (bot(x) - top(x)) * f]);
      }
      brush(ctx, pts, 0.9, '#F4E8CC', 0.62, 0.7);
    }
    ctx.restore();
    if (sp < 0.3) {
      const c = knotAt();
      paintForm(ctx, smoothPoly([[c[0] - 2.8, c[1]], [c[0] - 1.4, c[1] - 2.7], [c[0] + 1.6, c[1] - 2.6], [c[0] + 2.9, c[1]], [c[0] + 1.6, c[1] + 2.7], [c[0] - 1.4, c[1] + 2.7]], 3, true), sc.hull, rnd, { flip: false, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 3, inkW: 0.4, speck: 14 });
      brush(ctx, [[c[0] - 1.8, c[1] - 0.6], [c[0], c[1] + 0.5], [c[0] + 1.8, c[1] - 0.4]], 0.4, sc.dark, 0.5, 0.9);
    }
  }, 0.4, 71 + id.length + k);
}

/* ------------------------------------------------------------------ the boot */

/** a boot seen from the way the foot points: a sole and vamp as a box, a shaft as a cylinder (ankle at the origin) */
function paintBootView(psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const KB = 0.3;
  const P = (a: number, b: number, h: number): Pt => [a * cp - b * sp, -h + KB * (a * sp + b * cp)];
  const D = (a: number, b: number): number => a * sp + b * cp;
  return part(30, 26, 11, 17, q, (ctx) => {
    const rnd = new Rand(1850 + k);
    const sole: Array<[number, number]> = [[-5.8, 0], [-5.4, 2.6], [-3, 3.7], [2, 4], [7, 4.6], [11, 4.2], [13.2, 2.6], [13.8, 0]];
    const outline: Array<[number, number]> = [...sole, ...sole.slice(1, -1).reverse().map(([a, b]) => [a, -b] as [number, number])];
    // the shaft (a cylinder) first, then the foot over it: the vamp's edge crosses it where the instep is
    const shaft: Pt[] = [];
    for (const h of [1.5, 5, 8, 11.8]) {
      const r = h > 10 ? 0.92 : 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        shaft.push(P(-0.6 + 5 * r * Math.cos(a), 4.5 * r * Math.sin(a), h));
      }
    }
    const lo: FormOpts = { light: LEATHER.light, shade: LEATHER.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.5, speck: 50, grain: 2, grainColor: '#3A2212' };
    paintForm(ctx, smoothPoly(hull(shaft), 2, true), LEATHER.base, rnd, { flip: false, ...lo });
    const foot: Pt[] = [];
    for (const [a, b] of outline) foot.push(P(a, b, -5.1));
    for (const [a, b, h] of [[7, 0, -1.2], [7, 3.2, -2], [7, -3.2, -2], [11, 0, -2.6], [11, 2.6, -3], [11, -2.6, -3], [13, 0, -3.4]] as Array<[number, number, number]>) foot.push(P(a, b, h));
    for (const h of [-2.5, 0.6]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        foot.push(P(-0.6 + 5 * Math.cos(a), 4.5 * Math.sin(a), h));
      }
    }
    const poly = smoothPoly(hull(foot), 2, true);
    paintForm(ctx, poly, LEATHER.base, rnd, { flip: false, ...lo });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    // the toe cap: a seam across the vamp
    const seam: Pt[] = [];
    for (let b = -3.8; b <= 3.81; b += 0.95) seam.push(P(8.8 + 0.01 * b * b, b, -1.6));
    brush(ctx, seam, 0.34, LEATHER.shade, 0.5, 0.9);
    ctx.restore();
    // laces up the front of the shaft
    if (sp > -0.15) {
      for (const h of [2.4, 5, 7.6, 10.2]) brush(ctx, [P(4.6, -1.9, h), P(4.6, 1.9, h)], 0.3, '#E6D2B0', 0.7, 0.9);
    }
    // the cuff of the boot top, the near half of the ring
    const ring: SP[] = [];
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * TAU;
      const a = -0.6 + 5 * Math.cos(th);
      const b = 4.5 * Math.sin(th);
      const pt = P(a, b, 10.8);
      ring.push({ x: pt[0], y: pt[1], vis: D(a, b) });
    }
    const cuffNear = ring.filter((p) => p.vis > 0).sort((u, v) => u.x - v.x);
    if (cuffNear.length > 1) brush(ctx, cuffNear.map((p) => [p.x, p.y] as Pt), 0.4, LEATHER.light, 0.35, 0.9);
    // the dark sole along the near edge, and the heel block
    const edge: SP[] = outline.map(([a, b]) => ({ x: P(a, b, -4.6)[0], y: P(a, b, -4.6)[1], vis: D(a, b) + 0.02 }));
    const ordered = edge.slice().sort((p, q2) => p.x - q2.x);
    const near = ordered.filter((p) => p.vis > 0);
    if (near.length > 1) brush(ctx, near.map((p) => [p.x, p.y] as Pt), 1.1, '#1E120A', 0.72, 0.8);
    const heel: Pt[] = [P(-5.6, -2.2, -4.4), P(-5.8, 0, -4.4), P(-5.6, 2.2, -4.4)];
    if (sp < 0.3) brush(ctx, heel, 1.6, '#2A180C', 0.7, 0.6);
    // light along the shaft's lit side
    brush(ctx, [P(-3, -2.5, 9.8), P(-3.4, -2.5, 1)], 0.4, '#E0B890', 0.3, 0.9);
  }, 0.6, 93 + k);
}

function paintTails(F: boolean, id: PlanId, q: number): Part {
  const rnd = new Rand(1830 + id.length);
  const sc = scarfCol(id);
  return part(16, 36, 8, 4, q, (ctx) => {
    const tail = (poly: number[], len: number, w: number) => {
      paintForm(ctx, poly, sc.hull, rnd, { flip: F, light: sc.light, shade: sc.dark, alpha: 0.97, layers: 3, lightA: 0.3, shadeA: 0.3, inkW: 0.4, speck: 40 });
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      for (let y = 3; y < len; y += 1.9) brush(ctx, [[w * 0.1, y], [w * 0.5, y + 0.9], [w * 0.9, y]], 0.24, sc.dark, 0.28, 0.9);
      brush(ctx, [[-4, len * 0.34], [4, len * 0.34 + 0.4], [9, len * 0.34]], 0.9, '#F4E8CC', 0.6, 0.7);
      brush(ctx, [[-4, len * 0.7], [4, len * 0.7 + 0.4], [9, len * 0.7]], 0.9, '#F4E8CC', 0.6, 0.7);
      ctx.restore();
      // fringe
      for (let k = 0; k < 5; k++) brush(ctx, [[-1.2 + k * 1.0, len - 0.4], [-1.3 + k * 1.0, len + 2.2]], 0.26, sc.dark, 0.6, 0.9);
    };
    tail(smoothPoly([[-2.2, 0], [2.8, 0], [3.8, 12], [3.2, 24], [-1.8, 23.4], [-2.8, 11]], 3, true), 23.6, 6);
    ctx.save();
    ctx.translate(1.4, 0);
    ctx.rotate(-0.32);
    tail(smoothPoly([[-2, 0], [2.4, 0], [3.2, 9], [2.6, 17], [-1.6, 16.6], [-2.4, 8]], 3, true), 16.8, 5);
    ctx.restore();
  }, 0.5, 71 + id.length);
}


function paintArm(F: boolean, q: number): { upper: Part; fore: Part; elbow: Part } {
  const rnd = new Rand(1840);
  const upper = part(36, 14, 6, 7, q, (ctx) => {
    // the skin below the rolled cuff, then the linen sleeve over it, then the roll itself
    paintForm(ctx, limbPoly(25, 4.8, 4.6, 0), SKIN.base, rnd, { flip: F, light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 2, inkW: 0.38, speck: 20 });
    paintForm(ctx, limbPoly(18.4, 7.6, 6.6, 0.2), LINEN.base, rnd, { flip: F, light: LINEN.light, shade: LINEN.shade, alpha: 0.97, layers: 3, lightA: 0.3, inkW: 0.45, speck: 60 });
    brush(ctx, [[2, 1.5], [9, 1.7], [17, 1.1]], 1, LINEN.shade, 0.22, 0.9);
    brush(ctx, [[2, -1.8], [9, -2.1], [16, -1.4]], 0.55, '#FFFFFF', 0.4, 0.9);
    paintForm(ctx, flat([[16.4, -4.2], [21.4, -4], [21.6, 4.1], [16.6, 4.3]]), mix(LINEN.base, '#CDBE9C', 0.4), rnd, { flip: F, light: LINEN.light, shade: LINEN.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 16, ink: '#4A3C28' });
    brush(ctx, [[17.6, -3.8], [17.8, 3.9]], 0.3, LINEN.shade, 0.4, 0.9);
    brush(ctx, [[19.6, -3.8], [19.8, 3.9]], 0.3, LINEN.shade, 0.4, 0.9);
  }, 0.5, 81);
  const fore = part(40, 14, 6, 7, q, (ctx) => {
    paintForm(ctx, limbPoly(22, 5.6, 4.7, 0.15), SKIN.base, rnd, { flip: F, light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.4, speck: 40 });
    brush(ctx, [[2, 1.2], [9, 1.3], [17, 0.9]], 0.9, '#B0705A', 0.3, 0.9);
    brush(ctx, [[2.5, -1.2], [9, -1.3], [17, -0.9]], 0.5, '#FFF0DC', 0.4, 0.9);
    // glove: a cuff and a fist in tan canvas, the fingers curled
    paintForm(ctx, flat([[18.4, -3.9], [23.4, -3.7], [23.6, 3.9], [18.6, 4.1]]), mix(GLOVE.base, '#8A5E2A', 0.3), rnd, { flip: F, light: GLOVE.light, shade: GLOVE.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 16 });
    const fist = smoothPoly([[22.6, -3.8], [26, -4.6], [30, -4], [32.2, -1.6], [32.4, 1.4], [30.2, 3.8], [26, 4.4], [22.6, 3.7]], 3, true);
    paintForm(ctx, fist, GLOVE.base, rnd, { flip: F, light: GLOVE.light, shade: GLOVE.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 28 });
    for (let k = 0; k < 3; k++) brush(ctx, [[28.4 + k * 0.1, -2.6 + k * 2.1], [30.6, -2.1 + k * 2.1], [31.6, -1.3 + k * 2.1]], 0.24, GLOVE.shade, 0.5, 0.9);
    brush(ctx, [[24, -3.6], [27.6, -4.2], [30.4, -3.4]], 0.36, GLOVE.light, 0.6, 0.9);
  }, 0.5, 82);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([3.6 * Math.cos((i / 12) * Math.PI * 2), 3.6 * Math.sin((i / 12) * Math.PI * 2)]);
    paintForm(ctx, smoothPoly(c, 2, true), SKIN.base, rnd, { flip: F, light: SKIN.light, shade: SKIN.shade, alpha: 0.96, layers: 3, inkW: 0.36, speck: 12 });
  }, 0.5, 83);
  return { upper, fore, elbow };
}

function paintLeg(F: boolean, q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(1850);
  const thigh = part(38, 18, 8, 9, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 11.8, 9.4, -0.3), DENIM.base, rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 100, grain: 4, grainColor: '#2E4058' });
    brush(ctx, [[3, 2.2], [11, 2.6], [20, 2], [27, 1.4]], 1.5, DENIM.shade, 0.22, 0.9);
    brush(ctx, [[3, -2.8], [11, -3.2], [20, -2.7]], 0.7, '#E6EEF6', 0.3, 0.9);
  }, 0.6, 91);
  const shin = part(38, 16, 7, 8, q, (ctx) => {
    paintForm(ctx, limbPoly(28.5, 9.4, 8.2, 0.25), DENIM.base, rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 90, grain: 4, grainColor: '#2E4058' });
    brush(ctx, [[2, 1.8], [12, 2.1], [22, 1.6]], 1.2, DENIM.shade, 0.22, 0.9);
    // turn-up cuff at the ankle
    paintForm(ctx, flat([[23.6, -4.8], [29.4, -4.6], [29.8, 4.8], [24, 5]]), mix(DENIM.base, DENIM.light, 0.32), rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 24 });
    brush(ctx, [[23.9, -4.4], [24.2, 4.5]], 0.3, DENIM.shade, 0.4, 0.9);
  }, 0.6, 92);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.4 * Math.cos((i / 14) * Math.PI * 2), 5.4 * Math.sin((i / 14) * Math.PI * 2)]);
    paintForm(ctx, smoothPoly(c, 2, true), DENIM.base, rnd, { flip: F, light: DENIM.light, shade: DENIM.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.28, inkW: 0.5, speck: 40, grain: 4, grainColor: '#2E4058' });
  }, 0.6, 95);
  return { thigh, shin, knee };
}

/**
 * The secateurs in two halves, pivot at the origin, blades toward +x. A is the half the hand holds still (handle
 * up at the back, anvil blade below); B is the half that opens (handle below, hooked blade above), rotated about
 * the pivot by -angle to open. Crossed at the pivot, like real shears.
 */
function paintShears(F: boolean, q: number): { a: Part; b: Part } {
  const rnd = new Rand(1860);
  const handle = (ctx: CanvasRenderingContext2D, c: Pt[]) => paintForm(ctx, bandPoly(c, 3.2, 2.6), ENAMEL.base, rnd, { flip: F, light: ENAMEL.light, shade: ENAMEL.shade, alpha: 0.97, layers: 3, lightA: 0.34, inkW: 0.34, speck: 10, ink: '#3A0E0A', pool: 1.2 });
  const blade = (ctx: CanvasRenderingContext2D, c: Pt[], hook: boolean) => {
    paintForm(ctx, bandPoly(c, 2.7, 1.1), STEEL.base, rnd, { flip: F, light: STEEL.light, shade: STEEL.shade, alpha: 0.97, layers: 3, lightA: 0.4, inkW: 0.3, speck: 8, ink: '#232A34' });
    if (hook) brush(ctx, [c[c.length - 2]!, c[c.length - 1]!, [c[c.length - 1]![0] + 0.2, c[c.length - 1]![1] + 1.4]], 0.7, STEEL.base, 0.95, 0.5);
  };
  const dot = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(176,132,44,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.8)';
    ctx.beginPath();
    ctx.arc(-0.3, -0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  const a = part(36, 20, 18, 10, q, (ctx) => {
    blade(ctx, [[0, 0.5], [5.5, 1.1], [11, 1.2], [14, 0.6]], false);
    handle(ctx, [[0.4, -0.2], [-4.6, -1.2], [-9.6, -2.2], [-13.4, -3.2]]);
    dot(ctx);
  }, 0.4, 101);
  const b = part(36, 20, 18, 10, q, (ctx) => {
    handle(ctx, [[0.4, 0.2], [-4.6, 1.3], [-9.6, 2.4], [-13.4, 3.5]]);
    blade(ctx, [[0, -0.5], [5.5, -1.2], [11, -1.3], [14, -0.4]], true);
    dot(ctx);
  }, 0.4, 102);
  return { a, b };
}

/** The leaf rake: pole along +x from the head joint at the origin, a fan of tines folded back on it. */
function paintRake(F: boolean, q: number): Part {
  const rnd = new Rand(1870);
  const W = 138;
  const H = 36;
  return part(W, H, 26, 8, q, (ctx) => {
    const L = RAKE.POLE;
    // the pole: a long slim ash handle with a little grain, a rounded top
    const pole = bandPoly([[0, 0], [L * 0.33, 0.1], [L * 0.66, -0.05], [L, 0]], 2.9, 2.5, 4);
    paintForm(ctx, pole, WOOD.base, rnd, { flip: F, light: WOOD.light, shade: WOOD.shade, alpha: 0.97, layers: 3, lightA: 0.32, inkW: 0.38, speck: 90, grain: 6, grainColor: '#5A3C26', dash: [10, 26] });
    brush(ctx, [[L * 0.88, -0.6], [L * 0.99, -0.55]], 0.4, '#FFF4D0', 0.5, 0.9);
    // the head: a fan of springy steel tines, the ends curled
    const tines = 9;
    const base = (132 * Math.PI) / 180;
    for (let i = 0; i < tines; i++) {
      const a = base + ((i - (tines - 1) / 2) * 5.2 * Math.PI) / 180;
      const len = 23 + 4.5 * Math.cos(((i - (tines - 1) / 2) / 4) * 1.2) + (i % 2) * 0.8;
      const pts: Pt[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const bend = a + 0.12 * t * t * (i - (tines - 1) / 2 > 0 ? 1 : -1) - 0.28 * t * t * t;
        pts.push([Math.cos(bend) * len * t, Math.sin(bend) * len * t]);
      }
      const col = i % 2 ? '#8A95A3' : '#6E7B8A';
      brush(ctx, pts, 0.95 - 0.35 * (i % 2) * 0.3, col, 0.94, 0.55);
      brush(ctx, [pts[1]!, pts[3]!], 0.26, '#E8EEF4', 0.5, 0.9);
    }
    // the binding across the fan and the ferrule where the pole joins
    const bind: Pt[] = [];
    for (let i = 0; i < tines; i++) {
      const a = base + ((i - (tines - 1) / 2) * 5.2 * Math.PI) / 180;
      bind.push([Math.cos(a) * 9.4, Math.sin(a) * 9.4]);
    }
    brush(ctx, bind, 1.3, '#4A5460', 0.9, 0.5);
    paintForm(ctx, flat([[-1.4, -1.8], [4.4, -1.6], [4.6, 1.8], [-1.6, 1.9]]), '#B89A4E', rnd, { flip: F, light: '#F4E09A', shade: '#6A4E18', alpha: 0.97, layers: 2, inkW: 0.3, speck: 8 });
    inkDashes(ctx, bandPoly([[0, 0], [L, 0]], 2.9, 2.5, 1), rnd, { color: SEPIA, alpha: 0.35, w: 0.3, dash: [12, 30], gap: [2, 6], flip: F });
    feather(ctx, flat([[3, -1.4], [L * 0.3, -1.2], [L * 0.3, 0.2], [3, 0.4]]), '#FFF2D0', 0.3, rnd, 3, 1, 0.5, 0.05);
    void streaks;
    void speckle;
  }, 0.5, 111);
}



function paintSet(id: PlanId, q: number, shared: { torso: Part[]; boot: Part[] }): Sprites {
  const arm = paintArm(false, q);
  const leg = paintLeg(false, q);
  const sh = paintShears(false, q);
  const cool = '40,34,70';
  const views = (f: (psi: number, k: number) => Part): Part[] => Array.from({ length: VIEWS }, (_, k) => f((k / VIEWS) * TAU, k));
  return {
    torso: shared.torso,
    boot: shared.boot,
    head: views((psi, k) => paintHeadView(id, psi, q, k)),
    scarf: views((psi, k) => paintScarfView(id, psi, q, k)),
    tails: paintTails(false, id, q),
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
    shearsA: sh.a,
    shearsB: sh.b,
    rake: paintRake(false, q),
    rakeL: paintRake(true, q),
  };
}

const cache = new Map<string, Sprites>();
const sharedCache = new Map<number, { torso: Part[]; boot: Part[] }>();

/** The painted parts for one plan at one quality; built once and shared. */
export function buildGardenerSet(id: PlanId, q: number): Sprites {
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
