/**
 * Hand-painted watercolor sprites for the grocer: the brick crew's and the orchard pickers' build (the vine
 * gardener's and the snow climber's rig, the same brushwork; see src/orchard/scene/pickerArt.ts, whose painting this
 * follows), dressed as a corner shopkeeper of middle age:
 * - a striped cotton shirt, collarless with a stud, the sleeves rolled to the elbow, bare forearms;
 * - a dark wool waistcoat, five brass buttons and a watch chain, a satin back with its buckle strap;
 * - a long canvas apron tied at the waist and falling to the knee, a pocket on the right where the chalk lives;
 * - dark wool trousers and polished boots;
 * - greying hair going back at the temples, a lined face, a pencil behind the right ear.
 * The cloth he wipes with (a checked tea towel) is painted twice: draped over the left shoulder, per view, and
 * bunched in the hand. The limbs are cylinders, so one painted arm and leg serve every view; the torso, the head,
 * the drape and the boots are painted per view round the vertical axis (view 0 faces the right of the screen, a
 * quarter of the way round faces the viewer). Lit from the upper left, as every sprite in the collection; the room's
 * own light (the lamps, the window) is glazed over the whole figure as it is drawn (grocerFigure.ts).
 *
 * Handedness: the rig's hand 0 is on the side its lateral axis points to, which is the figure's own right (facing us,
 * it is on the screen's left). In the views below the lateral coordinate b > 0 (azimuth +pi/2) is his right.
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, tracePoly } from '../../scene/watercolor';
import { brush, granulate, inkDashes, mix, paintForm, smoothPoly, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { VIEWS } from '../../vine/scene/gardenerDims';
import { HEAD_SKIN, paintHead } from './grocerHead';

export interface Part {
  cv: HTMLCanvasElement;
  /** pivot position inside the canvas, in units; size in units */
  px: number;
  py: number;
  w: number;
  h: number;
}

export interface GrocerSprites {
  torso: Part[];
  head: Part[];
  /** the tea towel draped over the left shoulder, per view */
  drape: Part[];
  boot: Part[];
  upper: Part;
  /** the forearm and hand, for his right hand and his left (the thumb on its own side) */
  fore: [Part, Part];
  upperFar: Part;
  foreFar: [Part, Part];
  thigh: Part;
  shin: Part;
  thighFar: Part;
  shinFar: Part;
  knee: Part;
  elbow: Part;
  /** the tea towel bunched in the hand (pivot at its middle, about 9 units across) */
  wad: Part;
}

interface Pig {
  base: string;
  light: string;
  shade: string;
}

const SHIRT: Pig = { base: '#E4E0D2', light: '#FFFCF0', shade: '#8A8676' };
const STRIPE = '#6E84A0';
const VEST: Pig = { base: '#4C4A3C', light: '#8E8C70', shade: '#1C1C16' };
const VEST_BACK: Pig = { base: '#7A5E48', light: '#B89878', shade: '#3A2618' };
const APRON: Pig = { base: '#D6CBB0', light: '#F6EEDA', shade: '#7A6C52' };
const TROUSER: Pig = { base: '#4A4440', light: '#8A827A', shade: '#1E1A18' };
const BOOT: Pig = { base: '#3A2A22', light: '#8A6A56', shade: '#120C08' };
const BRASS = '#C9A048';
/** the tea towel: unbleached linen with a blue check */
const TOWEL: Pig = { base: '#E8E2D2', light: '#FFFBF0', shade: '#8C8676' };
const CHECK = '#4A6A9A';

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
  // (laid twice: a form's glazes cover about 85% on their own, which at his size lets the shelves show through a
  // face or a sleeve; twice over the body is solid while the brushed edges stay soft)
  const c = cv.getContext('2d')!;
  c.drawImage(soft, 0, 0);
  c.drawImage(soft, 0, 0);
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

const rgbaHex = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

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

/** the body's cross-section at a height above the hip: a man of middle age, a little thicker through the middle than
 *  the pickers, the apron standing off the front below the waist */
const TH = [-26, -10, -5, 2, 12, 22, 30, 34, 37, 39.5, 41.5, 43];
const TDF = [8.4, 8.0, 8.6, 9.2, 9.6, 9.0, 7.9, 6.9, 5.8, 4.6, 4.1, 4.0];
const TDB = [7.2, 7.2, 8.0, 8.4, 8.6, 8.7, 7.9, 7.0, 5.9, 4.8, 4.4, 4.3];
const TW = [10.2, 9.6, 9.8, 10.0, 10.2, 10.1, 9.8, 9.0, 7.4, 5.3, 4.4, 4.2];

/* the neck: a column leaning a little forward out of the collar, cut off higher at the back (the nape, up to the
 * hair) than at the front (under the jaw), its top always under the head (drawn over it) */
const NECK_C = (h: number): number => -0.5 + 0.11 * (h - 37);
const neckTop = (t: number): number => 45.2 - 1.6 * Math.cos(t);
function nsp(t: number, h: number, psi: number, pad = 0): SP {
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const r = (c >= 0 ? 3.3 : 3.8) + pad;
  const w = lin([37, 41, 47], [4.1, 3.75, 3.6], h) + pad;
  const a = NECK_C(h) + r * c;
  const b = w * sn;
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  return { x: a * cp - b * sp, y: -h + KA * (a * sp + b * cp), vis: (c / r) * sp + (sn / w) * cp };
}

function paintNeck(ctx: CanvasRenderingContext2D, psi: number, rnd: Rand): void {
  const S = HEAD_SKIN;
  const pts: Pt[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * TAU;
    for (const h of [37, 40, neckTop(t)]) {
      const p = nsp(t, h, psi);
      pts.push([p.x, p.y]);
    }
  }
  const poly = smoothPoly(hull(pts), 2, true);
  paintForm(ctx, poly, S.base, rnd, { flip: false, light: S.light, shade: S.shade, alpha: 0.98, layers: 3, lightA: 0.24, shadeA: 0.2, inkW: 0, ink0: true, speck: 10, pool: 0.6 });
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  // the side away from the lamps and the window in shade (the light from the upper left of the room)
  const tL = Math.atan2(0.5, -0.55) - psi;
  const band = (t0: number, t1: number, h0: number, h1: (t: number) => number, color: string, a: number, blur: number): void => {
    const L: Pt[] = [];
    const R: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = t0 + ((t1 - t0) * i) / 16;
      const p0 = nsp(t, h0, psi, 0.05);
      const p1 = nsp(t, h1(t), psi, 0.05);
      if (p0.vis < -0.05 && p1.vis < -0.05) continue;
      L.push([p0.x, p0.y]);
      R.push([p1.x, p1.y]);
    }
    if (L.length < 2) return;
    ctx.save();
    ctx.filter = `blur(${Math.max(0.5, blur * (ctx.getTransform().a || 1))}px)`;
    ctx.fillStyle = rgbaHex(color, a);
    tracePoly(ctx, smoothPoly([...L, ...R.reverse()], 2, true));
    ctx.fill();
    ctx.restore();
  };
  band(tL + Math.PI - 1.2, tL + Math.PI + 1.2, 36, (t) => neckTop(t) + 1, '#7A4A48', 0.42, 0.6);
  // the jaw's shadow across the throat and the sides, under where the head sits
  band(-2.0, 2.0, 43.0, (t) => neckTop(t) + 1, '#6A3E40', 0.36, 0.8);
  // the long muscle from behind the ear to the pit of the neck, the pit itself, and the nape's groove between its cords
  for (const sg of [-1, 1]) {
    const m: SP[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      m.push(nsp(sg * (1.85 - 1.55 * u), 46.2 - 6.2 * u, psi, 0.1));
    }
    for (const run of visRuns(m, 0.1)) {
      brush(ctx, run, 0.55, S.light, 0.22, 0.8);
      brush(ctx, run.map(([x, y]) => [x + 0.35, y + 0.15] as Pt), 0.22, S.shade, 0.25, 0.8);
    }
    const cord: SP[] = [];
    for (let h = 39.5; h <= 46; h += 1) cord.push(nsp(Math.PI + sg * 0.5, h, psi, 0.1));
    for (const run of visRuns(cord, 0.1)) brush(ctx, run, 0.7, S.light, 0.2, 0.8);
  }
  const groove: SP[] = [];
  for (let h = 39.5; h <= 46; h += 1) groove.push(nsp(Math.PI, h, psi, 0.1));
  for (const run of visRuns(groove, 0.1)) brush(ctx, run, 0.28, S.shade, 0.3, 0.8);
  const pit = nsp(0, 40.6, psi, 0.1);
  if (pit.vis > 0.2) {
    ctx.fillStyle = rgbaHex(S.shade, 0.25);
    ctx.beginPath();
    ctx.ellipse(pit.x, pit.y, 0.9, 0.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // its sides in ink, lightly
  const sideL: Pt[] = [];
  const sideR: Pt[] = [];
  for (let h = 38; h <= 45.5; h += 1.5) {
    let lo: SP | null = null;
    let hi: SP | null = null;
    for (let i = 0; i < 48; i++) {
      const p = nsp((i / 48) * TAU, h, psi);
      if (!lo || p.x < lo.x) lo = p;
      if (!hi || p.x > hi.x) hi = p;
    }
    sideL.push([lo!.x, lo!.y]);
    sideR.push([hi!.x, hi!.y]);
  }
  brush(ctx, sideL, 0.26, '#3A2820', 0.4, 0.8);
  brush(ctx, sideR, 0.26, '#3A2820', 0.4, 0.8);
}

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
    for (let k = 0; k <= 26; k++) {
      const p = tsp(a + ((b - a) * k) / 26, h, psi, pad);
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
  return part(50, 84, 25, 55, q, (ctx) => {
    const rnd = new Rand(6101 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    const C = SHIRT;
    // the neck, under the collar; the trousers' seat under everything (seen from behind and in profile, between the
    // waistcoat and the legs)
    paintNeck(ctx, psi, rnd);
    const seat = torsoOutline(psi, [-10, -8, -5, -2, 1, 4]);
    pf(seat, TROUSER.base, { light: TROUSER.light, shade: TROUSER.shade, alpha: 0.97, layers: 3, inkW: 0.5, speck: 30 });
    const hsBody = [-1, 3, 8, 13, 18, 23, 28, 32, 35, 37.5, 39.5, 41.5, 43];
    const body = torsoOutline(psi, hsBody);
    pf(body, C.base, { light: C.light, shade: C.shade, alpha: 0.97, layers: 4, amp: 0.03, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 90, grain: 3, grainColor: mix(C.shade, '#000000', 0.2) });
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    // the shirt's fine blue stripe, running round the body (only on the faces we see)
    for (let t0 = -Math.PI; t0 < Math.PI; t0 += 0.21) {
      const pts: SP[] = [];
      for (let h = 42; h >= -1; h -= 2.5) pts.push(tsp(t0 + Math.sin(h * 0.05) * 0.02, h, psi, 0.05));
      for (const run of visRuns(pts, 0.08)) brush(ctx, run, 0.16, STRIPE, 0.32, 0.95);
    }
    ctx.restore();
    // the shirt's band collar and its stud, close round the neck
    const collar = torsoBand(psi, [43.0, 42.3, 41.5, 40.8], () => -Math.PI, () => Math.PI, 0.4);
    if (collar) pf(collar, mix(C.base, C.light, 0.15), { light: C.light, shade: C.shade, alpha: 0.97, layers: 3, inkW: 0.38, speck: 6 });
    const stud = tsp(0, 41.2, psi, 0.9);
    if (stud.vis > 0.15) {
      ctx.fillStyle = rgbaHex(BRASS, 0.95);
      ctx.beginPath();
      ctx.ellipse(stud.x, stud.y, 0.5, 0.5, 0, 0, TAU);
      ctx.fill();
    }

    // the waistcoat: wool all round the front and sides, a V from the collarbone to the top button, points at the front
    // hem; the back is satin with a buckle strap
    const vTop = 37.5;
    const vBot = 26;
    const vHalf = (h: number): number => (h >= vTop ? 0.62 : h <= vBot ? 0 : 0.62 * ss((h - vBot) / (vTop - vBot)));
    const hsV: number[] = [];
    for (let h = 38.2; h >= -1.5; h -= 1.5) hsV.push(h);
    const sides = (h: number): [number, number] => [vHalf(h) + 0.02, TAU - vHalf(h) - 0.02];
    // the front (each half, so the V opens) and the back (the satin)
    for (const s of [-1, 1]) {
      const half = torsoBand(psi, hsV, (h) => (s > 0 ? sides(h)[0] : -1.75), (h) => (s > 0 ? 1.75 : -sides(h)[0]), 0.45);
      if (half) pf(half, VEST.base, { light: VEST.light, shade: VEST.shade, alpha: 0.98, layers: 4, amp: 0.025, lightA: 0.32, shadeA: 0.3, inkW: 0.55, speck: 60, grain: 2, grainColor: '#101008' });
    }
    const back = torsoBand(psi, hsV, () => 1.75, () => TAU - 1.75, 0.45);
    if (back) {
      pf(back, VEST_BACK.base, { light: VEST_BACK.light, shade: VEST_BACK.shade, alpha: 0.98, layers: 4, amp: 0.025, lightA: 0.36, shadeA: 0.3, inkW: 0.5, speck: 30 });
      ctx.save();
      tracePoly(ctx, back);
      ctx.clip();
      // the satin's sheen, and the buckle strap across the small of the back
      for (const [t0, w, a] of [[Math.PI - 0.55, 1.4, 0.24], [Math.PI + 0.7, 0.9, 0.14]] as const) {
        const sheen: SP[] = [];
        for (let h = 35; h >= 3; h -= 3) sheen.push(tsp(t0 + 0.06 * Math.sin(h * 0.2), h, psi, 0.5));
        for (const run of visRuns(sheen, 0.05)) brush(ctx, run, w, VEST_BACK.light, a, 0.8);
      }
      // the centre seam, and the soft pull of the cloth toward the strap
      const seam: SP[] = [];
      for (let h = 37; h >= 0; h -= 2) seam.push(tsp(Math.PI, h, psi, 0.52));
      for (const run of visRuns(seam, 0.05)) brush(ctx, run, 0.24, VEST_BACK.shade, 0.5, 0.9);
      for (const s of [-1, 1]) {
        const pull: SP[] = [tsp(Math.PI + s * 0.9, 14, psi, 0.5), tsp(Math.PI + s * 0.45, 10.5, psi, 0.5), tsp(Math.PI + s * 0.15, 8, psi, 0.5)];
        for (const run of visRuns(pull, 0.05)) brush(ctx, run, 0.5, VEST_BACK.shade, 0.25, 0.9);
      }
      for (const s of [-1, 1]) {
        const strap: SP[] = [];
        for (let i = 0; i <= 5; i++) strap.push(tsp(Math.PI + s * (0.2 + 0.12 * i), 7.5, psi, 0.6));
        for (const run of visRuns(strap, 0.05)) brush(ctx, run, 1.1, VEST_BACK.shade, 0.7, 0.4);
      }
      const bk = tsp(Math.PI, 7.5, psi, 0.7);
      if (bk.vis > 0.1) {
        ctx.strokeStyle = rgbaHex(BRASS, 0.85);
        ctx.lineWidth = 0.35;
        ctx.strokeRect(bk.x - 0.9, bk.y - 0.8, 1.8, 1.6);
      }
      ctx.restore();
    }
    // the wool's texture, the armholes' seams and the buttons, the welt pockets and the watch chain
    ctx.save();
    for (let i = 0; i < 150; i++) {
      const t = rnd.range(-1.7, 1.7);
      const h = rnd.range(0, 37);
      if (Math.abs(t) < vHalf(h) + 0.05) continue;
      const p = tsp(t, h, psi, 0.5);
      if (p.vis < 0.1) continue;
      // (the wool's twill: short strokes on the diagonal, a fleck of warmer brown now and then)
      const l = rnd.range(0.5, 1.0);
      const col = rnd.chance(0.12) ? '#7A6448' : rnd.chance(0.5) ? VEST.light : VEST.shade;
      brush(ctx, [[p.x, p.y], [p.x + l * 0.7, p.y - l * 0.6]], 0.13, col, 0.24, 0.9);
    }
    // the front's darts, from the chest to the points, and the seam over the shoulder
    for (const s of [-1, 1]) {
      const dart: SP[] = [];
      for (let h = 31; h >= 1; h -= 3) dart.push(tsp(s * (0.95 - 0.004 * (31 - h)), h, psi, 0.5));
      for (const run of visRuns(dart, 0.08)) {
        brush(ctx, run, 0.22, VEST.shade, 0.45, 0.9);
        brush(ctx, run.map(([x, y]) => [x - 0.3, y] as Pt), 0.3, VEST.light, 0.18, 0.9);
      }
      const sh: SP[] = [];
      for (let t = 0.7; t <= 1.7; t += 0.2) sh.push(tsp(s * t, 37.2 - 0.6 * (t - 0.7), psi, 0.5));
      for (const run of visRuns(sh, 0.06)) brush(ctx, run, 0.22, VEST.shade, 0.45, 0.9);
    }
    for (const s of [-1, 1]) {
      const arm: SP[] = [];
      for (let h = 37; h >= 25; h -= 2) arm.push(tsp(s * (1.75 - 0.15 * Math.sin(((h - 25) / 12) * Math.PI)), h, psi, 0.5));
      for (const run of visRuns(arm, 0.05)) brush(ctx, run, 0.32, VEST.shade, 0.5, 0.8);
      // the welt pocket at the waist on each side, and the edge of the opening down the front
      const welt: SP[] = [];
      for (let t = 0.45; t <= 1.0; t += 0.11) welt.push(tsp(s * t, 9 + (t - 0.45) * 1.2, psi, 0.55));
      for (const run of visRuns(welt, 0.06)) brush(ctx, run, 0.32, VEST.shade, 0.7, 0.6);
      const edge: SP[] = [];
      for (let h = vTop; h >= -1; h -= 1.5) edge.push(tsp(s * (vHalf(h) + 0.03), h, psi, 0.5));
      for (const run of visRuns(edge, 0.06)) brush(ctx, run, 0.3, VEST.light, 0.4, 0.8);
    }
    for (let i = 0; i < 5; i++) {
      const h = vBot - 0.8 - i * 5.4;
      const p = tsp(-0.04, h, psi, 0.75);
      if (p.vis < 0.12) continue;
      const rx = 0.25 + 0.45 * p.vis;
      ctx.fillStyle = 'rgba(20,16,10,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + 0.15, p.y + 0.2, rx, 0.65, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgbaHex(BRASS, 0.95);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, 0.65, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,84,30,0.6)';
      ctx.beginPath();
      ctx.ellipse(p.x + 0.1, p.y + 0.15, rx * 0.7, 0.42, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,40,20,0.6)';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, 0.65, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,0.8)';
      ctx.beginPath();
      ctx.arc(p.x - 0.18, p.y - 0.22, 0.17, 0, TAU);
      ctx.fill();
    }
    // the watch chain: from the third button in a swag to the left pocket
    const chain: SP[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      chain.push(tsp(-0.06 - 0.62 * u, vBot - 11.6 - 3.2 * Math.sin(Math.PI * u) + 1.5 * u, psi, 0.85));
    }
    for (const run of visRuns(chain, 0.08)) {
      brush(ctx, run, 0.32, '#8A6A2A', 0.9, 0.95);
      brush(ctx, run.map(([x, y]) => [x - 0.1, y - 0.12] as Pt), 0.14, '#F2D890', 0.8, 0.95);
    }
    ctx.restore();
    // the collar's open shirt between the lapels (the stripe and the stud already sit there)

    // the long canvas apron: tied at the waist, from the waist down past the knee, wrapping the front and sides
    const A = APRON;
    const hsA: number[] = [];
    for (let h = 5.6; h >= -25.5; h -= 1.6) hsA.push(h);
    const aw = (h: number): number => lin([-26, -10, 5.6], [1.42, 1.32, 1.24], h);
    const apron = torsoBand(psi, hsA, (h) => -aw(h), (h) => aw(h), 0.9);
    if (apron) {
      pf(apron, A.base, { light: A.light, shade: A.shade, alpha: 0.98, layers: 4, amp: 0.025, lightA: 0.3, shadeA: 0.3, inkW: 0.55, speck: 70, grain: 2, grainColor: mix(A.shade, '#000000', 0.2) });
      ctx.save();
      tracePoly(ctx, apron);
      ctx.clip();
      // canvas: short dry strokes; the long folds hanging from the ties; a stain or two of honest work
      for (let i = 0; i < 80; i++) {
        const x = rnd.range(-12, 12);
        const y = rnd.range(-6, 27);
        brush(ctx, [[x, y], [x + rnd.range(0.6, 1.4), y + rnd.range(-0.15, 0.15)]], 0.2, rnd.chance(0.5) ? A.shade : A.light, 0.24, 0.9);
      }
      // the folds hanging from the gathers at the ties: each a soft shadow with the light along the ridge beside it,
      // some long, some dying out, one or two from the pull of the ties across the hips
      for (const [t0, h0, h1, a] of [[-1.05, 3, -24, 0.9], [-0.55, 1, -18, 0.7], [-0.1, 3, -25, 1], [0.3, -4, -22, 0.6], [0.72, 2, -25, 0.9], [1.15, 0, -16, 0.7]] as const) {
        const pts: SP[] = [];
        const lit: SP[] = [];
        for (let h = h0; h >= h1; h -= 2.5) {
          const t = t0 + 0.05 * Math.sin(h * 0.25 + t0 * 3);
          pts.push(tsp(t, h, psi, 0.96));
          lit.push(tsp(t - 0.09, h, psi, 0.96));
        }
        for (const run of visRuns(pts, 0.05)) brush(ctx, run, 0.9, A.shade, 0.24 * a, 0.85);
        for (const run of visRuns(lit, 0.05)) brush(ctx, run, 0.7, A.light, 0.3 * a, 0.85);
      }
      for (const s of [-1, 1]) {
        const pull: SP[] = [tsp(s * 1.25, 4.2, psi, 0.96), tsp(s * 0.95, 0.5, psi, 0.96), tsp(s * 0.8, -3, psi, 0.96)];
        for (const run of visRuns(pull, 0.05)) brush(ctx, run, 0.55, A.shade, 0.25, 0.9);
      }
      // chalk dust: a dry, pale rub below the pocket where he wipes his fingers
      for (let i = 0; i < 26; i++) {
        const p = tsp(rnd.range(0.35, 1.0), rnd.range(-16, -10), psi, 0.98);
        if (p.vis < 0.15) continue;
        brush(ctx, [[p.x, p.y], [p.x + rnd.range(-0.3, 0.3), p.y + rnd.range(0.8, 2.2)]], rnd.range(0.2, 0.45), '#FBF8F0', rnd.range(0.12, 0.3), 0.8);
      }
      for (let i = 0; i < 3; i++) {
        const p = tsp(rnd.range(-0.8, 0.8), rnd.range(-20, -4), psi, 0.95);
        if (p.vis < 0.15) continue;
        ctx.fillStyle = rgbaHex(rnd.pick(['#9A7A5A', '#8A8A7A', '#A8865E']), 0.14);
        tracePoly(ctx, deform(smoothPoly([[p.x - 1.6, p.y], [p.x, p.y - 1.1], [p.x + 1.4, p.y + 0.2], [p.x, p.y + 1.2]], 3, true), rnd, 2, 0.1));
        ctx.fill();
      }
      // the pocket on his right, its stitched top and the chalk dust round its mouth
      const pk = torsoBand(psi, [-2, -4, -7, -10, -12], () => 0.32, () => 0.95, 1.05);
      if (pk) {
        ctx.fillStyle = 'rgba(86,70,46,0.17)';
        tracePoly(ctx, pk);
        ctx.fill();
        const top: SP[] = [];
        for (let t = 0.32; t <= 0.96; t += 0.08) top.push(tsp(t, -2, psi, 1.08));
        for (const run of visRuns(top, 0.05)) {
          brush(ctx, run, 0.45, A.shade, 0.6, 0.6);
          brush(ctx, run.map(([x, y]) => [x, y + 0.6] as Pt), 0.5, '#F4F2EA', 0.35, 0.5);
        }
      }
      // the hem, a little heavier
      const hem: SP[] = [];
      for (let t = -1.4; t <= 1.41; t += 0.1) hem.push(tsp(t, -25.2, psi, 0.95));
      for (const run of visRuns(hem, 0.04)) brush(ctx, run, 0.55, A.shade, 0.45, 0.7);
      ctx.restore();
    }
    // the apron's ties round the waist to a bow at the back
    const tie: SP[] = [];
    for (let t = 1.2; t <= TAU - 1.2; t += 0.12) tie.push(tsp(t, 4.8, psi, 0.95));
    for (const run of visRuns(tie, 0.02)) brush(ctx, run, 1.0, mix(A.base, A.shade, 0.15), 0.9, 0.2);
    const knot = tsp(Math.PI, 4.8, psi, 1.1);
    if (knot.vis > 0.1) {
      for (const [dx, dy] of [[-2.6, 1.2], [2.4, 0.8], [-1.2, 5.2], [1.6, 5.6]] as const) brush(ctx, [[knot.x, knot.y], [knot.x + dx, knot.y + dy]], 0.85, A.base, 0.92, 0.5);
      ctx.fillStyle = rgbaHex(A.shade, 0.7);
      ctx.beginPath();
      ctx.ellipse(knot.x, knot.y, 1, 0.8, 0, 0, TAU);
      ctx.fill();
    }
  }, 0.45, 261 + k);
}

/* ------------------------------------------------------------------ the head */

/** the head, from just under the jaw to the crown (the neck is the torso's, under the collar): see grocerHead.ts */
function paintHeadView(psi: number, q: number, k: number): Part {
  return part(32, 33, 16, 30, q, (ctx) => paintHead(ctx, psi, k, q, [16, 30]), 0.3, 251 + k);
}

/* ------------------------------------------------------------------ the tea towel */

/** a checked weave over a shape (the caller clips) */
function checks(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, cell: number, rnd: Rand, ang = 0): void {
  ctx.save();
  ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
  ctx.rotate(ang);
  const R = Math.hypot(x1 - x0, y1 - y0);
  for (let x = -R; x < R; x += cell * 2) {
    ctx.fillStyle = rgbaHex(CHECK, rnd.range(0.2, 0.3));
    ctx.fillRect(x, -R, cell * 0.8, R * 2);
  }
  for (let y = -R; y < R; y += cell * 2) {
    ctx.fillStyle = rgbaHex(CHECK, rnd.range(0.18, 0.28));
    ctx.fillRect(-R, y, R * 2, cell * 0.8);
  }
  ctx.restore();
}

/** the towel over the left shoulder: a fold lying on the shoulder, one end down the chest, one down the back */
function paintDrapeView(psi: number, q: number, k: number): Part {
  return part(40, 52, 20, 30, q, (ctx) => {
    const rnd = new Rand(6330 + k);
    // the shoulder's top at the left side (b < 0): azimuth -pi/2 on the body, at the shoulder's height above the
    // hip less the pivot (the pivot is the left shoulder joint, 35 above the hip and 8 to the side)
    const at = (t: number, h: number, pad: number): SP => {
      const p = tsp(t, h + 35, psi, pad);
      const c = tsp(-Math.PI / 2, 35, psi, 0);
      return { x: p.x - c.x, y: p.y - c.y + 0, vis: p.vis };
    };
    const strip = (tA: number, tB: number, hTop: number, hBot: number): SP[][] => {
      const L: SP[] = [];
      const R: SP[] = [];
      for (let h = hTop; h >= hBot; h -= 1.5) {
        L.push(at(tA, h, 1.3));
        R.push(at(tB, h, 1.3));
      }
      return [L, R];
    };
    const paintStrip = (tA: number, tB: number, hTop: number, hBot: number, flare: number): void => {
      const [L, R] = strip(tA, tB, hTop, hBot);
      const visible = L.filter((p, i) => p.vis > 0.02 || R[i]!.vis > 0.02);
      if (visible.length < 2) return;
      const pts: Pt[] = [];
      for (let i = 0; i < L.length; i++) if (L[i]!.vis > 0.02 || R[i]!.vis > 0.02) pts.push([L[i]!.x - flare * (i / L.length), L[i]!.y]);
      for (let i = R.length - 1; i >= 0; i--) if (L[i]!.vis > 0.02 || R[i]!.vis > 0.02) pts.push([R[i]!.x + flare * (i / R.length), R[i]!.y]);
      if (pts.length < 4) return;
      const poly = smoothPoly(pts, 2, true);
      paintForm(ctx, poly, TOWEL.base, rnd, { flip: false, light: TOWEL.light, shade: TOWEL.shade, alpha: 0.97, layers: 3, inkW: 0.45, speck: 14 });
      ctx.save();
      tracePoly(ctx, poly);
      ctx.clip();
      checks(ctx, -20, -30, 20, 30, 1.25, rnd, 0.04);
      // the folds down its length
      for (let i = 0; i < 3; i++) {
        const u = rnd.range(0.2, 0.8);
        const run: Pt[] = [];
        for (let j = 0; j < L.length; j++) run.push([L[j]!.x + (R[j]!.x - L[j]!.x) * u, L[j]!.y + (R[j]!.y - L[j]!.y) * u]);
        brush(ctx, run, 0.5, TOWEL.shade, 0.25, 0.8);
      }
      ctx.restore();
    };
    // down the back first (behind, when we see the front), then over the shoulder and down the chest
    paintStrip(-Math.PI / 2 - 1.15, -Math.PI / 2 - 0.45, 6.2, -12, 1.2);
    paintStrip(-Math.PI / 2 + 0.45, -Math.PI / 2 + 1.15, 6.2, -16, 1.6);
    // the fold over the top of the shoulder
    const top: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = -Math.PI / 2 - 1.15 + (2.3 * i) / 12;
      const p = at(t, 6.6 - 0.4 * Math.sin((i / 12) * Math.PI), 1.6);
      top.push([p.x, p.y]);
    }
    for (let i = 12; i >= 0; i--) {
      const t = -Math.PI / 2 - 1.15 + (2.3 * i) / 12;
      const p = at(t, 3.6, 1.5);
      top.push([p.x, p.y]);
    }
    const poly = smoothPoly(hull(top), 2, true);
    paintForm(ctx, poly, mix(TOWEL.base, TOWEL.light, 0.2), rnd, { flip: false, light: TOWEL.light, shade: TOWEL.shade, alpha: 0.97, layers: 3, inkW: 0.45, speck: 8 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    checks(ctx, -20, -30, 20, 30, 1.25, rnd, 0.3);
    ctx.restore();
  }, 0.35, 281 + k);
}

/** the towel bunched in the hand: a soft wad, a corner hanging */
function paintWad(q: number): Part {
  return part(20, 20, 10, 9, q, (ctx) => {
    const rnd = new Rand(6390);
    const body: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r = 4.6 + rnd.range(-0.9, 0.9);
      body.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.85]);
    }
    const tail = smoothPoly([[-1.5, 2], [1.5, 2.4], [2.6, 8.8], [0.4, 9.6], [-1.6, 8.4]], 3, true);
    paintForm(ctx, tail, TOWEL.base, rnd, { flip: false, light: TOWEL.light, shade: TOWEL.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 6 });
    ctx.save();
    tracePoly(ctx, tail);
    ctx.clip();
    checks(ctx, -4, 0, 4, 10, 1.1, rnd, 0.2);
    ctx.restore();
    const poly = smoothPoly(body, 3, true);
    paintForm(ctx, poly, TOWEL.base, rnd, { flip: false, light: TOWEL.light, shade: TOWEL.shade, alpha: 0.97, layers: 3, inkW: 0.45, speck: 10 });
    ctx.save();
    tracePoly(ctx, poly);
    ctx.clip();
    checks(ctx, -6, -5, 6, 5, 1.1, rnd, 0.5);
    for (let i = 0; i < 4; i++) {
      const a = rnd.range(0, TAU);
      brush(ctx, [[Math.cos(a) * 1.2, Math.sin(a) * 1], [Math.cos(a) * 4.4, Math.sin(a) * 3.4]], 0.5, TOWEL.shade, 0.35, 0.8);
    }
    ctx.restore();
  }, 0.3, 291);
}

/* ------------------------------------------------------------------ the boot */

function paintBootView(psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const KB = 0.3;
  const P = (a: number, b: number, h: number): Pt => [a * cp - b * sp, -h + KB * (a * sp + b * cp)];
  const D = (a: number, b: number): number => a * sp + b * cp;
  const BO = BOOT;
  return part(36, 34, 13, 25, q, (ctx) => {
    const rnd = new Rand(6450 + k);
    const sole: Array<[number, number]> = [[-5.8, 0], [-5.4, 3.0], [-2.6, 4.1], [2, 4.4], [6.6, 4.8], [10.8, 4.4], [13.2, 2.8], [13.8, 0]];
    const outline: Array<[number, number]> = [...sole, ...sole.slice(1, -1).reverse().map(([a, b]) => [a, -b] as [number, number])];
    const shaft: Pt[] = [];
    for (const h of [1.5, 5, 8.6]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        shaft.push(P(-0.6 + 4.8 * Math.cos(a), 4.4 * Math.sin(a), h));
      }
    }
    const lo: FormOpts = { light: BO.light, shade: BO.shade, alpha: 0.97, layers: 4, lightA: 0.34, shadeA: 0.3, inkW: 0.55, speck: 40 };
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
    // the toe cap's seam, the polish's shine on the toe, the welt
    const seam: Pt[] = [];
    for (let b = -3.8; b <= 3.81; b += 0.95) seam.push(P(8.8 + 0.01 * b * b, b, -1.8));
    brush(ctx, seam, 0.36, BO.shade, 0.6, 0.9);
    const shine = P(10.6, -1.2, -2.6);
    ctx.fillStyle = 'rgba(255,238,214,0.32)';
    ctx.beginPath();
    ctx.ellipse(shine[0], shine[1], 1.6, 0.7, 0, 0, TAU);
    ctx.fill();
    const edge: SP[] = outline.map(([a, b]) => ({ x: P(a, b, -3.8)[0], y: P(a, b, -3.8)[1], vis: D(a, b) + 0.02 }));
    const near = edge.slice().sort((p, q2) => p.x - q2.x).filter((p) => p.vis > 0);
    if (near.length > 1) brush(ctx, near.map((p) => [p.x, p.y] as Pt), 1.4, '#1A120C', 0.9, 0.8);
    ctx.restore();
    // the crease across the instep where the boot flexes, and one round the ankle
    brush(ctx, [P(5.6, -3.4, -1.2), P(6.2, -1.2, -0.6), P(6.3, 1.2, -0.6), P(5.6, 3.4, -1.2)], 0.3, BO.shade, 0.5, 0.8);
    brush(ctx, [P(5.4, -3.2, -1.5), P(6.0, -1.0, -0.9), P(6.1, 1.0, -0.9)], 0.35, BO.light, 0.25, 0.8);
    if (sp > -0.15) {
      // the tongue, the eyelets and the laces crossed up the front, tied at the top
      brush(ctx, [P(4.4, 0, 0.6), P(4.4, 0, 8.4)], 1.6, mix(BO.base, BO.shade, 0.3), 0.6, 0.2);
      const hs = [1.2, 3.0, 4.8, 6.6];
      for (let i = 0; i < hs.length; i++) {
        for (const b of [-1.45, 1.45]) {
          const e = P(4.35 - 0.1 * Math.abs(b), b, hs[i]!);
          ctx.fillStyle = 'rgba(210,180,120,0.8)';
          ctx.beginPath();
          ctx.arc(e[0], e[1], 0.28, 0, TAU);
          ctx.fill();
        }
        if (i > 0) {
          brush(ctx, [P(4.4, -1.45, hs[i - 1]!), P(4.6, 1.45, hs[i]!)], 0.24, '#2A1C14', 0.85, 0.6);
          brush(ctx, [P(4.4, 1.45, hs[i - 1]!), P(4.6, -1.45, hs[i]!)], 0.24, '#3A2A1E', 0.75, 0.6);
        }
      }
      const top = P(4.6, 0, 7.6);
      brush(ctx, [top, [top[0] - 1.0, top[1] + 1.4]], 0.24, '#2A1C14', 0.8, 0.6);
      brush(ctx, [top, [top[0] + 0.7, top[1] + 1.6]], 0.24, '#2A1C14', 0.8, 0.6);
    }
    const heel: Pt[] = [P(-5.5, -2.2, -4.1), P(-5.7, 0, -4.1), P(-5.5, 2.2, -4.1)];
    if (sp < 0.3) brush(ctx, heel, 1.5, '#100A06', 0.7, 0.6);
  }, 0.5, 293 + k);
}

/* ------------------------------------------------------------------ the limbs */

/** a profile along a limb (x along it) from its widths at stations: smooth, closed */
function profile(xs: number[], ws: number[], bow: number[] = [], capA = 0.35, capB = 0.3): number[] {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i < xs.length; i++) {
    const b = bow[i] ?? 0;
    top.push([xs[i]!, -ws[i]! / 2 + b]);
    bot.push([xs[i]!, ws[i]! / 2 + b]);
  }
  const n = xs.length - 1;
  return smoothPoly([[xs[0]! - ws[0]! * capA, bow[0] ?? 0], ...top, [xs[n]! + ws[n]! * capB, bow[n] ?? 0], ...bot.reverse()], 3, true);
}

/** the long sides of a limb's profile (for its ink: a limb is never ringed with a line where it joins the next) */
function sides(xs: number[], ws: number[], bow: number[] = []): [Pt[], Pt[]] {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i < xs.length; i++) {
    const b = bow[i] ?? 0;
    top.push([xs[i]!, -ws[i]! / 2 + b]);
    bot.push([xs[i]!, ws[i]! / 2 + b]);
  }
  return [top, bot];
}

/** broken ink along an open line: dashes that fade in and out, heavier on the shaded (+y) side */
function inkLine(ctx: CanvasRenderingContext2D, pts: Pt[], rnd: Rand, w: number, a: number, color = '#33261C'): void {
  const sm = smoothPoly(pts, 4, false);
  const P: Pt[] = [];
  for (let i = 0; i < sm.length; i += 2) P.push([sm[i]!, sm[i + 1]!]);
  let i = Math.floor(rnd.range(0, 3));
  while (i < P.length - 2) {
    const j = Math.min(P.length - 1, i + Math.floor(rnd.range(5, 14)));
    brush(ctx, P.slice(i, j + 1), w * rnd.range(0.8, 1.2), color, a * rnd.range(0.7, 1.05), 0.9);
    i = j + Math.floor(rnd.range(1, 3));
  }
}

/** fade one end of a painted limb into what it overlaps (alpha ramp along x, sprite units) */
function fadeEnd(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0 = -20, y1 = 20): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  ctx.fillRect(x0 < x1 ? lo - 20 : lo, y0, hi - lo + 20, y1 - y0);
  ctx.restore();
}

/** a soft fold in cloth: its shadow and the light along its ridge, side by side */
function fold(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, shade: string, light: string, a: number, off = 0.35): void {
  brush(ctx, pts, w, shade, 0.3 * a, 0.9);
  brush(ctx, pts.map(([x, y]) => [x - off * 0.3, y - off] as Pt), w * 0.8, light, 0.32 * a, 0.9);
}

/**
 * A working hand, half closed, seen from its back: the back of the hand from the wrist to the knuckles, its tendons,
 * four fingers with their first joints over the knuckles and the rest curled under, and the thumb along the near
 * side wrapping toward the first finger. The grip (where the chalk, the towel and the pieces sit) is at x0 + 6.6,
 * under the knuckles. `th` is the side of the thumb (-1: the sprite's -y, his right hand; +1 his left).
 */
function paintHand(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, S: Pig, th: number): void {
  const so: FormOpts = { flip: false, light: S.light, shade: S.shade, alpha: 0.98, layers: 2, lightA: 0.28, shadeA: 0.24, inkW: 0, ink0: true, speck: 3, pool: 0.5 };
  const Y = (y: number): number => y * -th;
  const warm = mix(S.base, '#D27A62', 0.16);
  // the fingers side by side from the first (by the thumb) to the little one: each its first joint lying forward
  // from the knuckle, then bent at the second joint and curling under, its end turned away into shade
  const fingers = [
    { y: -1.95, len: 2.15, w: 1.38 },
    { y: -0.62, len: 2.35, w: 1.4 },
    { y: 0.66, len: 2.1, w: 1.32 },
    { y: 1.85, len: 1.65, w: 1.14 },
  ];
  const kx = (y: number): number => x0 + 6.85 - 0.3 * (y + 1.95);
  for (const f of fingers.slice().reverse()) {
    const k = kx(f.y);
    const y = Y(f.y);
    const hw = f.w / 2;
    const e = k + f.len;
    // the curled middle joint: a short rounded band beyond the bend, darker
    const curl = smoothPoly([[e - 0.3, y - hw * 0.95], [e + 0.6, y - hw * 0.85], [e + 1.0, y], [e + 0.6, y + hw * 0.85], [e - 0.3, y + hw * 0.95]], 3, true);
    paintForm(ctx, curl, mix(warm, S.shade, 0.32), rnd, { ...so, lightA: 0.12 });
    const prox = smoothPoly([[k - 0.8, y - hw], [k + f.len * 0.5, y - hw * 1.03], [e, y - hw * 0.94], [e + 0.2, y], [e, y + hw * 0.94], [k + f.len * 0.5, y + hw], [k - 0.8, y + hw]], 3, true);
    paintForm(ctx, prox, warm, rnd, so);
    // the bend's crease, the light along the finger's back, the shade where it meets the next
    brush(ctx, [[e - 0.1, y - hw * 0.8], [e + 0.12, y], [e - 0.1, y + hw * 0.8]], 0.14, '#6A3428', 0.6, 0.8);
    brush(ctx, [[k + 0.1, Y(f.y - 0.12)], [e - 0.4, Y(f.y - 0.1)]], 0.38, S.light, 0.32, 0.9);
    inkLine(ctx, [[k - 0.3, y + hw * th * 0.98], [k + f.len * 0.55, y + hw * th], [e + 0.3, y + hw * th * 0.7], [e + 0.95, y + hw * th * 0.1]], rnd, 0.14, 0.6);
  }
  // the back of the hand: narrow at the wrist, spreading to the row of knuckles
  const back = smoothPoly([[x0 - 0.8, Y(-2.1)], [x0 + 2.4, Y(-2.6)], [kx(-1.95) + 0.2, Y(-2.65)], [kx(-0.62) + 0.35, Y(-1.3)], [kx(0.66) + 0.3, Y(0.0)], [kx(1.85) + 0.15, Y(1.2)], [kx(1.85) - 0.1, Y(2.45)], [x0 + 3.2, Y(2.6)], [x0 - 0.8, Y(2.15)]], 3, true);
  paintForm(ctx, back, warm, rnd, { ...so, layers: 3 });
  ctx.save();
  tracePoly(ctx, back);
  ctx.clip();
  // the tendons fanning from the wrist to each knuckle, light over their ridges, and a vein
  for (const f of fingers) {
    const y = Y(f.y);
    brush(ctx, [[x0 + 0.8, Y(f.y * 0.45)], [x0 + 3.6, (Y(f.y * 0.45) + y) / 2], [kx(f.y) - 0.6, y]], 0.24, S.light, 0.22, 0.9);
  }
  brush(ctx, [[x0 + 0.3, Y(0.4)], [x0 + 2.2, Y(0.8)], [x0 + 3.9, Y(0.1)], [x0 + 5.1, Y(-0.6)]], 0.16, '#6A7A8A', 0.16, 0.9);
  // the shade across the hand's far edge
  brush(ctx, [[x0, Y(2.0)], [x0 + 3.5, Y(2.3)], [kx(1.85) - 0.3, Y(2.1)]], 1.0, S.shade, 0.22, 0.9);
  ctx.restore();
  // the knuckles: the light on each, a little red
  for (const f of fingers) {
    const k = kx(f.y);
    const y = Y(f.y);
    ctx.fillStyle = 'rgba(200,110,90,0.22)';
    ctx.beginPath();
    ctx.ellipse(k - 0.1, y, 0.62, f.w * 0.44, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,236,218,0.32)';
    ctx.beginPath();
    ctx.ellipse(k - 0.3, Y(f.y - 0.15), 0.32, f.w * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  // the thumb, along the near side: the ball of it at the wrist, its tip tucked against the first finger, its nail
  const tp: Array<[number, number]> = [[x0 + 0.3, -2.2], [x0 + 2.6, -3.45], [x0 + 4.8, -3.75], [x0 + 6.8, -3.45], [x0 + 8.35, -2.8], [x0 + 8.1, -2.2], [x0 + 6.3, -2.3], [x0 + 3.9, -2.15], [x0 + 1.3, -1.5]];
  const thumb = smoothPoly(tp.map(([x, y]) => [x, Y(y)] as Pt), 3, true);
  paintForm(ctx, thumb, mix(warm, '#D88870', 0.06), rnd, so);
  brush(ctx, [[x0 + 2.2, Y(-2.95)], [x0 + 4.8, Y(-3.2)], [x0 + 6.6, Y(-3.0)]], 0.5, S.light, 0.3, 0.9);
  brush(ctx, [[x0 + 2.0, Y(-2.0)], [x0 + 4.4, Y(-2.3)], [x0 + 6.4, Y(-2.45)]], 0.35, S.shade, 0.25, 0.9);
  brush(ctx, [[x0 + 5.6, Y(-3.6)], [x0 + 5.8, Y(-2.9)], [x0 + 5.6, Y(-2.35)]], 0.12, '#6A3428', 0.5, 0.8);
  const nail = smoothPoly([[x0 + 6.8, Y(-3.15)], [x0 + 7.95, Y(-2.9)], [x0 + 8.05, Y(-2.45)], [x0 + 6.9, Y(-2.55)]], 3, true);
  ctx.fillStyle = 'rgba(238,198,182,0.7)';
  tracePoly(ctx, nail);
  ctx.fill();
  brush(ctx, [[x0 + 6.8, Y(-3.1)], [x0 + 6.85, Y(-2.6)]], 0.1, '#6A3428', 0.45, 0.5);
  inkLine(ctx, tp.slice(0, 6).map(([x, y]) => [x, Y(y)] as Pt), rnd, 0.17, 0.62);
  inkLine(ctx, tp.slice(5).map(([x, y]) => [x, Y(y)] as Pt), rnd, 0.12, 0.45);
  // the back of the hand's far edge in ink, broken
  inkLine(ctx, [[x0 + 0.8, Y(2.2)], [x0 + 3.2, Y(2.6)], [kx(1.85) - 0.1, Y(2.45)]], rnd, 0.17, 0.6);
}

/** the shirt's fine stripe on a sleeve, running round its cylinder (closer together toward its edges), broken where it
 *  folds */
function sleeveStripes(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, w: (x: number) => number, n: number): void {
  for (let k = 0; k < n; k++) {
    const th = -Math.PI / 2 + (Math.PI * (k + 0.5)) / n;
    const fade = Math.cos(th);
    const pts: Pt[] = [];
    for (let x = x0; x <= x1 + 0.01; x += 1.2) pts.push([x, (w(x) / 2) * Math.sin(th) + 0.12 * Math.sin(x * 0.7 + k)]);
    // (a gap or two, where a fold takes the stripe out of sight)
    let i = 0;
    while (i < pts.length - 1) {
      const j = Math.min(pts.length - 1, i + Math.floor(rnd.range(4, 10)));
      brush(ctx, pts.slice(i, j + 1), 0.11, STRIPE, 0.28 * (0.35 + 0.65 * fade), 0.95);
      i = j + 1;
    }
  }
}

function paintArm(q: number): { upper: Part; fore: [Part, Part]; elbow: Part } {
  const rnd = new Rand(6540);
  const sleeve = SHIRT;
  const SK = HEAD_SKIN;
  const so: FormOpts = { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.26, inkW: 0, ink0: true, speck: 14, pool: 0.6 };
  const upper = part(36, 16, 6, 8, q, (ctx) => {
    // the shirtsleeve from the shoulder down the arm, slim, to the cuff rolled twice above the elbow
    const xs = [-1.5, 3, 8, 13, 17, 19.8];
    const ws = [8.4, 8.2, 7.7, 7.2, 7.0, 7.3];
    const bow = [0, 0.15, 0.25, 0.2, 0.1, 0.05];
    const p = profile(xs, ws, bow, 0.3, 0.1);
    paintForm(ctx, p, sleeve.base, rnd, so);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    // the cylinder's light along the top, its shade along the underside
    brush(ctx, [[-1, -2.2], [8, -2.3], [19, -1.8]], 2.0, sleeve.light, 0.3, 0.9);
    brush(ctx, [[0, 3.1], [9, 3.0], [19, 2.6]], 1.6, sleeve.shade, 0.24, 0.9);
    sleeveStripes(ctx, rnd, -1.5, 19.6, (x) => lin(xs, ws, x), 11);
    // the folds: the cloth pushed up into soft diagonal folds above the roll, a long fold down the underside, the
    // drag of the armhole at the shoulder
    const folds: Array<[Pt[], number, number]> = [
      [[[12.5, -3.3], [14.6, -1.9], [16.3, -0.2], [17.4, 1.2]], 0.6, 1],
      [[[14.5, 3.4], [16.0, 2.0], [17.7, 0.3]], 0.55, 0.9],
      [[[16.3, -3.4], [17.3, -2.4], [18.0, -1.1]], 0.45, 0.9],
      [[[9.5, 3.3], [12.0, 2.3], [14.4, 1.4]], 0.5, 0.6],
      [[[6.5, -3.1], [8.6, -2.0], [10.2, -1.6]], 0.4, 0.45],
      [[[-0.5, -2.7], [2.0, -1.8], [4.5, -1.3]], 0.45, 0.6],
    ];
    for (const [pts, w, a] of folds) fold(ctx, pts, w, sleeve.shade, sleeve.light, a * 1.2);
    fold(ctx, [[1, 2.6], [6, 3.0], [11, 2.8]], 0.7, sleeve.shade, sleeve.light, 0.7, -0.4);
    ctx.restore();
    const [top, bot] = sides(xs, ws, bow);
    inkLine(ctx, top, rnd, 0.32, 0.5);
    inkLine(ctx, bot, rnd, 0.38, 0.6);
    // the cuff rolled twice: a thick band of shirting turned inside out, its two turns, its lit top
    const roll = smoothPoly([[18.7, -4.15], [21.2, -4.4], [23.3, -4.25], [24.3, -3.0], [24.3, 2.9], [23.3, 4.3], [21.2, 4.5], [18.7, 4.2], [18.2, 0]], 3, true);
    paintForm(ctx, roll, mix(sleeve.base, sleeve.light, 0.25), rnd, { ...so, speck: 6, lightA: 0.34 });
    ctx.save();
    tracePoly(ctx, roll);
    ctx.clip();
    for (let k = 0; k < 9; k++) {
      const y = -4 + k * 1.0;
      brush(ctx, [[18.8, y], [21, y + 0.1], [24, y + 0.05]], 0.1, STRIPE, 0.22, 0.95);
    }
    for (const x of [18.9, 21.4]) brush(ctx, [[x + 0.3, -4.4], [x - 0.15, -1.6], [x - 0.2, 1.6], [x + 0.3, 4.4]], 0.32, sleeve.shade, 0.5, 0.7);
    for (const x of [19.7, 22.2]) brush(ctx, [[x + 0.3, -3.8], [x, -1.2], [x + 0.05, 1.2]], 0.5, sleeve.light, 0.45, 0.8);
    brush(ctx, [[23.6, -3.4], [23.9, 0], [23.6, 3.4]], 0.5, sleeve.shade, 0.35, 0.7);
    ctx.restore();
    inkDashes(ctx, roll, rnd, { color: '#33261C', alpha: 0.55, w: 0.3, dash: [2, 5], gap: [0.4, 1.4], center: [21.3, 0] });
    // the roll's shadow on the sleeve just above it
    brush(ctx, [[17.6, -3.2], [17.9, 0], [17.6, 3.2]], 0.7, sleeve.shade, 0.22, 0.6);
  }, 0.4, 281);
  const xs = [-0.6, 2.5, 6, 10, 14, 18, 20.8];
  const ws = [6.2, 6.8, 6.9, 6.3, 5.5, 4.8, 4.5];
  const bow = [0, -0.25, -0.35, -0.25, -0.1, 0, 0];
  const fore = (th: number) => part(42, 18, 6, 9, q, (ctx) => {
    // the bare forearm: full below the elbow, narrowing to the wrist, browned by the shop's lamps; lit along its top
    const arm = profile(xs, ws, bow, 0.45, 0.2);
    paintForm(ctx, arm, SK.base, rnd, { flip: false, light: SK.light, shade: SK.shade, alpha: 0.98, layers: 3, lightA: 0.3, shadeA: 0.26, inkW: 0, ink0: true, speck: 8, pool: 0.5 });
    ctx.save();
    tracePoly(ctx, arm);
    ctx.clip();
    brush(ctx, [[1, -1.9], [7, -2.3], [13, -1.6], [19, -1.1]], 1.5, SK.light, 0.3, 0.9);
    brush(ctx, [[1, 2.8], [8, 2.8], [15, 2.2], [20, 1.9]], 1.3, mix(SK.shade, '#5A3A48', 0.3), 0.3, 0.9);
    // the muscle along the top near the elbow, the bone's ridge toward the wrist, the wrist bone
    brush(ctx, [[1.5, -0.8], [5, -1.2], [9, -0.7]], 0.9, SK.shade, 0.12, 0.9);
    brush(ctx, [[12, 0.5], [17, 0.6], [20, 0.5]], 0.5, SK.light, 0.18, 0.9);
    ctx.fillStyle = 'rgba(255,236,218,0.35)';
    ctx.beginPath();
    ctx.ellipse(19.6, -1.5 * th, 0.6, 0.45, 0, 0, TAU);
    ctx.fill();
    // a vein on the inside of the wrist, faint
    brush(ctx, [[9, 1.6], [14, 1.4], [19.5, 1.0]], 0.2, '#6A7A90', 0.14, 0.9);
    // the hair on the forearm, fine and sparse, lying toward the wrist, more on the outer side
    for (let i = 0; i < 110; i++) {
      const x = rnd.range(1.5, 19.5);
      const hw = lin(xs, ws, x) / 2;
      const y = rnd.range(-hw + 0.3, hw * 0.6);
      const l = rnd.range(0.45, 0.8);
      brush(ctx, [[x, y], [x + l, y + l * rnd.range(0.05, 0.35)]], 0.07, rnd.chance(0.3) ? '#8A7A68' : '#3E2E24', rnd.range(0.25, 0.45), 0.9);
    }
    ctx.restore();
    const [top, bot] = sides(xs.slice(1), ws.slice(1), bow.slice(1));
    inkLine(ctx, top, rnd, 0.28, 0.5);
    inkLine(ctx, bot, rnd, 0.32, 0.58);
    // (the elbow end fades into the arm above it, under the roll: no seam at the joint)
    fadeEnd(ctx, -3.4, -1.0);
    paintHand(ctx, rnd, 20.4, SK, th);
  }, 0.35, th < 0 ? 282 : 284);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    // the bare elbow where the forearm turns toward us: a soft round of skin, the point of the bone
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([3.4 * Math.cos((i / 12) * TAU), 3.2 * Math.sin((i / 12) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), SK.base, rnd, { flip: false, light: SK.light, shade: SK.shade, alpha: 0.97, layers: 2, inkW: 0, ink0: true, speck: 3, pool: 0.3 });
    brush(ctx, [[-1.6, 0.6], [0, 1.2], [1.6, 0.6]], 0.2, SK.shade, 0.35, 0.8);
  }, 0.3, 283);
  return { upper, fore: [fore(-1), fore(1)], elbow };
}

function paintLeg(q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(6560);
  const T = TROUSER;
  const o: FormOpts = { flip: false, light: T.light, shade: T.shade, alpha: 0.97, layers: 4, lightA: 0.28, shadeA: 0.28, inkW: 0, ink0: true, speck: 8, pool: 0.5 };
  // dark wool: a fine twill of short diagonal strokes, a few long ones of the weave, the pressed crease down the
  // front catching the light with its shadow beside it
  const wool = (ctx: CanvasRenderingContext2D, len: number, w: number) => {
    for (let i = 0; i < len * 5; i++) {
      const x = rnd.range(-1, len);
      const y = rnd.range(-w / 2 + 0.4, w / 2 - 0.4);
      brush(ctx, [[x, y], [x + 0.55, y + 0.5]], 0.09, rnd.chance(0.5) ? T.light : T.shade, 0.16, 0.9);
    }
    for (let i = 0; i < len * 0.7; i++) {
      const x = rnd.range(0, len - 3);
      const y = rnd.range(-w / 2 + 0.8, w / 2 - 0.8);
      brush(ctx, [[x, y], [x + rnd.range(2, 5), y + rnd.range(-0.1, 0.1)]], 0.12, rnd.chance(0.5) ? T.light : T.shade, 0.16, 0.9);
    }
    brush(ctx, [[0.5, -w * 0.14], [len * 0.5, -w * 0.12], [len - 0.5, -w * 0.11]], 0.26, mix(T.light, '#FFFFFF', 0.15), 0.4, 0.95);
    brush(ctx, [[0.5, -w * 0.14 + 0.35], [len * 0.5, -w * 0.12 + 0.35], [len - 0.5, -w * 0.11 + 0.35]], 0.3, T.shade, 0.25, 0.95);
  };
  const tx = [0, 7, 14, 21, 28.5];
  const tw = [11.2, 10.8, 10.0, 9.2, 8.8];
  const tb = [0, -0.2, -0.3, -0.2, 0];
  const thigh = part(38, 20, 8, 10, q, (ctx) => {
    const p = profile(tx, tw, tb, 0.35, 0.32);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wool(ctx, 28.5, 11);
    brush(ctx, [[3, 3.0], [11, 3.4], [20, 2.8], [27, 2.2]], 2.0, T.shade, 0.28, 0.9);
    brush(ctx, [[3, -3.2], [12, -3.4], [22, -2.8]], 1.4, T.light, 0.16, 0.9);
    // the cloth gathering toward the knee: curved folds across it, and the drag from the seat at the top
    const kf: Array<[Pt[], number, number]> = [
      [[[19.5, -3.8], [21.8, -2.2], [23.2, -0.4]], 0.6, 1.2],
      [[[22.6, -4.1], [24.4, -2.6], [25.1, -1.0], [24.6, 0.6]], 0.6, 1.4],
      [[[25.5, 1.0], [26.6, 2.4], [26.8, 3.9]], 0.55, 1.2],
      [[[21.0, 3.6], [22.8, 2.4], [24.0, 1.2]], 0.5, 1.0],
      [[[26.4, -3.6], [27.4, -2.2], [27.6, -0.8]], 0.45, 1.0],
    ];
    for (const [pts, w, a] of kf) fold(ctx, pts, w, T.shade, T.light, a);
    fold(ctx, [[1, 3.6], [5, 1.8], [9, 0.9]], 0.6, T.shade, T.light, 0.9);
    fold(ctx, [[2, -4.2], [6, -2.6]], 0.5, T.shade, T.light, 0.7);
    ctx.restore();
    const [top, bot] = sides(tx, tw, tb);
    inkLine(ctx, top, rnd, 0.32, 0.45);
    inkLine(ctx, bot, rnd, 0.38, 0.55);
  }, 0.4, 291);
  const sx = [0, 9, 18, 24, 28.5];
  const sw = [8.8, 8.4, 8.2, 8.5, 8.9];
  const sb = [0, 0.2, 0.2, 0.1, 0];
  const shin = part(38, 18, 7, 9, q, (ctx) => {
    const p = profile(sx, sw, sb, 0.45, 0.2);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wool(ctx, 28.5, 8.6);
    brush(ctx, [[2, 2.5], [12, 2.7], [22, 2.3]], 1.6, T.shade, 0.26, 0.9);
    brush(ctx, [[2, -2.6], [12, -2.6], [22, -2.4]], 1.0, T.light, 0.15, 0.9);
    // the folds under the knee, and the break where the trouser leg rests on the boot
    const sf: Array<[Pt[], number, number]> = [
      [[[0.8, -3.8], [2.2, -2.0], [2.6, 0.2]], 0.55, 1.1],
      [[[1.6, 1.4], [2.8, 2.8], [2.6, 4.0]], 0.5, 0.9],
      [[[22.0, -4.0], [23.4, -2.6], [23.8, -0.8], [23.0, 0.8]], 0.6, 1.4],
      [[[24.2, 0.4], [25.4, 1.8], [25.6, 3.8]], 0.55, 1.3],
      [[[25.0, -4.1], [26.2, -2.8], [26.4, -1.4]], 0.5, 1.2],
      [[[21.6, 2.0], [22.6, 3.6]], 0.45, 0.9],
    ];
    for (const [pts, w, a] of sf) fold(ctx, pts, w, T.shade, T.light, a);
    // the turn-up's edge
    brush(ctx, [[27.4, -4.4], [27.6, 0], [27.4, 4.4]], 0.5, T.shade, 0.5, 0.6);
    ctx.restore();
    const [top, bot] = sides(sx.slice(1), sw.slice(1), sb.slice(1));
    inkLine(ctx, top, rnd, 0.3, 0.45);
    inkLine(ctx, bot, rnd, 0.36, 0.55);
    // (its top fades into the thigh's end over the knee)
    fadeEnd(ctx, -4, 1.4);
  }, 0.4, 292);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.0 * Math.cos((i / 14) * TAU), 5.0 * Math.sin((i / 14) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), T.base, rnd, { ...o, speck: 3, pool: 0.2 });
    fold(ctx, [[-2.6, 1.6], [0, 2.4], [2.6, 1.6]], 0.5, T.shade, T.light, 1);
  }, 0.4, 295);
  return { thigh, shin, knee };
}

/* ------------------------------------------------------------------ the set */

const sets = new Map<string, GrocerSprites>();
const pending = new Map<string, Promise<GrocerSprites | null>>();

/**
 * The grocer's painted parts at one quality (px per rig unit), built once and shared. Painted between frames, a few
 * views at a time (`tick` yields to the browser, `check` false abandons stale work).
 */
export function buildGrocerSet(q: number, tick: () => Promise<void>, check: () => boolean): Promise<GrocerSprites | null> {
  const key = q.toFixed(3);
  const done = sets.get(key);
  if (done) return Promise.resolve(done);
  const p = pending.get(key);
  if (p) return p;
  const run = (async (): Promise<GrocerSprites | null> => {
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
    const arm = paintArm(q);
    const leg = paintLeg(q);
    const wad = paintWad(q);
    await tick();
    if (!check()) return null;
    const torso = await views((psi, k) => paintTorsoView(psi, q, k));
    if (!torso) return null;
    const head = await views((psi, k) => paintHeadView(psi, q, k));
    if (!head) return null;
    const drape = await views((psi, k) => paintDrapeView(psi, q, k));
    if (!drape) return null;
    const boot = await views((psi, k) => paintBootView(psi, q, k));
    if (!boot) return null;
    const cool = '40,34,70';
    const s: GrocerSprites = {
      torso,
      head,
      drape,
      boot,
      upper: arm.upper,
      fore: arm.fore,
      upperFar: tinted(arm.upper, cool, 0.28),
      foreFar: [tinted(arm.fore[0], cool, 0.28), tinted(arm.fore[1], cool, 0.28)],
      thigh: leg.thigh,
      shin: leg.shin,
      thighFar: tinted(leg.thigh, cool, 0.28),
      shinFar: tinted(leg.shin, cool, 0.28),
      knee: leg.knee,
      elbow: arm.elbow,
      wad,
    };
    sets.set(key, s);
    return s;
  })();
  pending.set(key, run);
  void run.finally(() => pending.delete(key));
  return run;
}
