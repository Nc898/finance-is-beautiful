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
import { brush, flat, granulate, mix, paintForm, smoothPoly, type FormOpts, type Pt } from '../../river/scene/boatInk';
import { VIEWS } from '../../vine/scene/gardenerDims';

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
  fore: Part;
  upperFar: Part;
  foreFar: Part;
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

const SKIN: Pig = { base: '#DCA582', light: '#F8D8BE', shade: '#8A4E36' };
const SHIRT: Pig = { base: '#E4E0D2', light: '#FFFCF0', shade: '#8A8676' };
const STRIPE = '#6E84A0';
const VEST: Pig = { base: '#4C4A3C', light: '#8E8C70', shade: '#1C1C16' };
const VEST_BACK: Pig = { base: '#7A5E48', light: '#B89878', shade: '#3A2618' };
const APRON: Pig = { base: '#D6CBB0', light: '#F6EEDA', shade: '#7A6C52' };
const TROUSER: Pig = { base: '#4A4440', light: '#8A827A', shade: '#1E1A18' };
const BOOT: Pig = { base: '#3A2A22', light: '#8A6A56', shade: '#120C08' };
const HAIR: Pig = { base: '#857868', light: '#C9BFB0', shade: '#3A3028' };
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
const TDF = [8.4, 8.0, 8.6, 9.2, 9.6, 9.0, 7.9, 6.9, 5.8, 4.4, 3.6, 3.2];
const TDB = [7.2, 7.2, 8.0, 8.4, 8.6, 8.7, 7.9, 7.0, 5.9, 4.5, 3.6, 3.2];
const TW = [10.2, 9.6, 9.8, 10.0, 10.2, 10.1, 9.8, 9.0, 7.4, 5.0, 3.8, 3.3];

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
    // the trousers' seat under everything (seen from behind and in profile, between the waistcoat and the legs)
    const seat = torsoOutline(psi, [-10, -8, -5, -2, 1, 4]);
    pf(seat, TROUSER.base, { light: TROUSER.light, shade: TROUSER.shade, alpha: 0.97, layers: 3, inkW: 0.5, speck: 30 });
    const hsBody = [-1, 3, 8, 13, 18, 23, 28, 32, 35, 37.5, 39.5, 41.5, 42.8];
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
    const collar = torsoBand(psi, [42.6, 41.8, 40.8, 40], () => -Math.PI, () => Math.PI, 0.5);
    if (collar) pf(collar, mix(C.base, C.light, 0.3), { light: C.light, shade: C.shade, alpha: 0.97, layers: 3, inkW: 0.42, speck: 8 });
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
      const sheen: SP[] = [];
      for (let h = 34; h >= 4; h -= 3) sheen.push(tsp(Math.PI - 0.5, h, psi, 0.5));
      for (const run of visRuns(sheen, 0.05)) brush(ctx, run, 1.3, VEST_BACK.light, 0.22, 0.8);
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
    for (let i = 0; i < 90; i++) {
      const t = rnd.range(-1.7, 1.7);
      const h = rnd.range(0, 37);
      if (Math.abs(t) < vHalf(h) + 0.05) continue;
      const p = tsp(t, h, psi, 0.5);
      if (p.vis < 0.1) continue;
      brush(ctx, [[p.x, p.y], [p.x + rnd.range(0.5, 1.1), p.y + rnd.range(-0.3, 0.3)]], 0.2, rnd.chance(0.5) ? VEST.light : VEST.shade, 0.28, 0.9);
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
      ctx.fillStyle = rgbaHex(BRASS, 0.95);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 0.25 + 0.45 * p.vis, 0.65, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.8)';
      ctx.beginPath();
      ctx.arc(p.x - 0.2, p.y - 0.25, 0.2, 0, TAU);
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
      for (const t0 of [-0.95, -0.4, 0.15, 0.7, 1.15]) {
        const pts: SP[] = [];
        for (let h = 4; h >= -25; h -= 3) pts.push(tsp(t0 + 0.04 * Math.sin(h * 0.3 + t0), h, psi, 0.95));
        for (const run of visRuns(pts, 0.05)) brush(ctx, run, 0.9, A.shade, 0.16, 0.8);
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

const HC = 12.6;
const HR = 8.7;
const HV = 9.4;
const headRho = (h: number): number => {
  const t = (h - HC) / HV;
  // a fuller jaw than the pickers': middle age
  const jaw = h < 8.6 ? 0.8 + 0.2 * ss((h - 3.2) / 5.4) : 1;
  return HR * Math.sqrt(Math.max(0.0004, 1 - t * t)) * jaw;
};
function paintHeadView(psi: number, q: number, k: number): Part {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const SK = SKIN;
  return part(50, 44, 25, 31, q, (ctx) => {
    const rnd = new Rand(6210 + k);
    const pf = (poly: number[], base: string, o: FormOpts) => paintForm(ctx, poly, base, rnd, { flip: false, ...o });
    /** a point on the head at azimuth a from the way it faces, height h (radius r, by default the skull's) */
    const hp = (a: number, h: number, r = headRho(h)): SP => ({ x: r * Math.cos(psi + a), y: -h + KA * r * Math.sin(psi + a), vis: Math.sin(psi + a) });
    // the neck, with the shade of the jaw across it
    const neck = flat([[-4.0, 2.4], [4.2, 2.4], [3.9, -6], [-3.7, -5.8]]);
    pf(neck, mix(SK.base, SK.shade, 0.22), { light: SK.light, shade: SK.shade, alpha: 0.96, layers: 2, inkW: 0.3, speck: 8 });
    // the jaw's shadow across the throat (seen from the front: the chin stands out over it)
    if (sp > -0.2) {
      ctx.save();
      tracePoly(ctx, neck);
      ctx.clip();
      const g = ctx.createLinearGradient(0, -5, 0, 1.5);
      g.addColorStop(0, 'rgba(96,44,34,0.55)');
      g.addColorStop(1, 'rgba(96,44,34,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-5, -6.5, 10, 9);
      ctx.restore();
    }
    // the skull and the face in skin (lit from the upper left), the hair laid over it as a cap
    const hsH = [3.3, 3.9, 5, 6.5, 8.5, 10.5, 12.6, 14.6, 16.6, 18.4, 19.9, 21, 21.7, 21.95];
    const Lh: Pt[] = hsH.map((h) => [-headRho(h), -h]);
    const Rh: Pt[] = hsH.map((h) => [headRho(h), -h]);
    const skull = smoothPoly([...Lh, ...Rh.reverse()], 3, true);
    pf(skull, SK.base, { light: SK.light, shade: SK.shade, alpha: 0.97, layers: 4, amp: 0.02, lightA: 0.34, shadeA: 0.3, inkW: 0, ink0: true, speck: 24 });
    const noseBase: Array<[number, number, number]> = [[HR - 0.8, 0, 11.4], [HR + 2.5, 0, 8.3], [HR + 1.4, 0, 7.5], [HR - 0.2, -1.7, 7.6], [HR - 0.2, 1.7, 7.6]];
    const noseHull = hull(noseBase.map(([a, b, h]) => [a * cp - b * sp, -h + KA * (a * sp + b * cp)] as Pt));
    const paintNose = (): void => {
      if (noseHull.length < 3 || sp < -0.05) return;
      pf(smoothPoly(noseHull, 3, true), mix(SK.base, '#D07A62', 0.2), { light: SK.light, shade: SK.shade, alpha: 0.9, layers: 3, inkW: 0.28, speck: 4 });
      // the nostril, under the tip
      const n = hp(-0.12 * Math.sign(cp || 1), 7.6, HR + 1.2);
      ctx.fillStyle = 'rgba(110,52,38,0.55)';
      ctx.beginPath();
      ctx.ellipse(n.x, n.y, 0.5 + 0.3 * sp, 0.35, 0, 0, TAU);
      ctx.fill();
    };
    // the hair: from the hairline (high at the brow, a little higher at the temples, down at the sideburns and the
    // nape) up over the crown, on the half of the head we see
    const hb = (a: number): number => {
      const x = Math.abs(a);
      if (x <= 1.25) return 18.4 + 1.0 * Math.sin(x * 2.4) ** 2;
      if (x <= 1.62) return lin([1.25, 1.45, 1.62], [18.6, 13.5, 11.2], x);
      return lin([1.62, 2.2, Math.PI], [11.2, 8.2, 6.6], x);
    };
    {
      const cap: Pt[] = [];
      let hL = 0;
      let hR = 0;
      for (let i = 0; i <= 48; i++) {
        const u = Math.PI - (Math.PI * i) / 48;
        const a = Math.atan2(Math.sin(u - psi), Math.cos(u - psi));
        const h = hb(a);
        const r = headRho(h) + 0.25;
        cap.push([r * Math.cos(u), -h + KA * r * Math.sin(u)]);
        if (i === 0) hL = h;
        if (i === 48) hR = h;
      }
      const up: Pt[] = [];
      for (const h of hsH) if (h > hR + 0.2) up.push([headRho(h) + 0.3, -h]);
      const down: Pt[] = [];
      for (const h of hsH.slice().reverse()) if (h > hL + 0.2) down.push([-headRho(h) - 0.3, -h]);
      const hair = smoothPoly([...cap, ...up, [0, -22.3], ...down], 2, true);
      pf(hair, HAIR.base, { light: HAIR.light, shade: HAIR.shade, alpha: 0.95, layers: 4, amp: 0.018, lightA: 0.36, shadeA: 0.26, inkW: 0, ink0: true, speck: 40 });
      ctx.save();
      tracePoly(ctx, hair);
      ctx.clip();
      // combed back and to the side, greyer at the temples and over the ears
      for (let i = 0; i < 80; i++) {
        const a = rnd.range(-Math.PI, Math.PI);
        const h0 = rnd.range(hb(a), 21.5);
        const h1 = Math.max(hb(a), h0 - 2.2);
        const p0 = hp(a, h0, headRho(h0) + 0.25);
        const p1 = hp(a + 0.18, h1, headRho(h1) + 0.25);
        if (p0.vis < 0.02 || p1.vis < 0.02) continue;
        const grey = Math.abs(a) > 1.0 && Math.abs(a) < 2.4;
        brush(ctx, [[p0.x, p0.y], [p1.x, p1.y]], rnd.range(0.18, 0.32), grey || rnd.chance(0.4) ? '#E6E0D6' : HAIR.shade, rnd.range(0.25, 0.5), 0.9);
      }
      ctx.restore();
      // the hairline, softly stated where we see it
      const edge: SP[] = [];
      for (let a = -1.6; a <= 1.61; a += 0.08) edge.push(hp(a, hb(a), headRho(hb(a)) + 0.25));
      for (const r of visRuns(edge, 0.12)) brush(ctx, r, 0.3, HAIR.shade, 0.3, 0.8);
    }
    // the head's outline, once over skin and hair together
    ctx.strokeStyle = 'rgba(51,38,28,0.5)';
    ctx.lineWidth = 0.4;
    tracePoly(ctx, deform(skull, rnd, 1, 0.008));
    ctx.stroke();
    // the ears
    for (const s of [-1, 1]) {
      const c = hp(s * 1.57, 11.4, HR + 0.9);
      if (c.vis < -0.3) continue;
      const wv = 1.3 + 1.0 * Math.max(0, c.vis);
      const ear = smoothPoly([[c.x - wv * 0.6, c.y - 2.4], [c.x + wv * 0.5, c.y - 2.6], [c.x + wv * 0.7, c.y - 0.4], [c.x + wv * 0.4, c.y + 2.2], [c.x - wv * 0.3, c.y + 2.6], [c.x - wv * 0.7, c.y]], 3, true);
      pf(ear, mix(SK.base, '#D08670', 0.25), { light: SK.light, shade: SK.shade, alpha: 0.96, layers: 2, inkW: 0.3, speck: 3 });
      if (c.vis > 0.2) brush(ctx, [[c.x - wv * 0.15, c.y - 1.6], [c.x + wv * 0.15, c.y], [c.x - wv * 0.1, c.y + 1.4]], 0.3, '#8A4636', 0.45, 0.8);
    }
    // the features, only where they face us
    if (sp > -0.1) {
      ctx.save();
      tracePoly(ctx, skull);
      ctx.clip();
      // warmth over the cheeks, shade in the sockets, the jaw's turn
      for (const s of [-1, 1]) {
        const ch = hp(s * 0.75, 8.2);
        if (ch.vis > 0.1) {
          ctx.fillStyle = 'rgba(204,104,84,0.16)';
          for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.ellipse(ch.x, ch.y, 0.9 + 1.8 * ch.vis, 1.6, 0, 0, TAU);
            ctx.fill();
          }
        }
        const so = hp(s * 0.36, 12.2, HR * 0.98);
        if (so.vis > 0.1) {
          ctx.fillStyle = 'rgba(122,70,52,0.22)';
          ctx.beginPath();
          ctx.ellipse(so.x, so.y, 0.6 + 1.1 * so.vis, 1.1, 0, 0, TAU);
          ctx.fill();
        }
      }
      const jaw: SP[] = [];
      for (let a = -1.2; a <= 1.21; a += 0.1) {
        const h = 4.4 + 2.2 * a * a;
        jaw.push(hp(a, h, headRho(h) * 0.98));
      }
      for (const r of visRuns(jaw, 0.1)) brush(ctx, r, 0.9, SK.shade, 0.14, 0.8);
      // the years: across the brow, from the nose down past the moustache
      const brow: SP[] = [hp(-0.42, 16.2), hp(0, 16.5), hp(0.42, 16.2)];
      for (const r of visRuns(brow, 0.15)) brush(ctx, r, 0.18, SK.shade, 0.32, 0.9);
      for (const s of [-1, 1]) {
        const fold: SP[] = [hp(s * 0.22, 8.6, HR * 1.0), hp(s * 0.36, 6.6, HR * 0.99), hp(s * 0.38, 5.0, HR * 0.96)];
        for (const r of visRuns(fold, 0.12)) brush(ctx, r, 0.22, SK.shade, 0.3, 0.9);
      }
      ctx.restore();
      for (const s of [-1, 1]) {
        // an eye: the lid's dark line, the iris under it, a little white, the crease above and the bag below
        const e = hp(s * 0.37, 11.8, HR * 1.0);
        if (e.vis > 0.18) {
          const w = 0.55 + 0.75 * e.vis;
          ctx.fillStyle = 'rgba(246,238,226,0.7)';
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + 0.1, w, 0.42, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(58,44,34,0.9)';
          ctx.beginPath();
          ctx.ellipse(e.x + 0.18 * cp, e.y + 0.05, 0.3 + 0.18 * e.vis, 0.42, 0, 0, TAU);
          ctx.fill();
          brush(ctx, [[e.x - w, e.y + 0.05], [e.x - w * 0.2, e.y - 0.42], [e.x + w * 0.8, e.y - 0.3], [e.x + w * 1.05, e.y + 0.1]], 0.26, '#3A2A22', 0.85, 0.7);
          brush(ctx, [[e.x - w * 0.8, e.y - 0.95], [e.x + w * 0.8, e.y - 0.9]], 0.16, SK.shade, 0.35, 0.8);
          brush(ctx, [[e.x - w * 0.6, e.y + 0.62], [e.x + w * 0.7, e.y + 0.58]], 0.14, SK.shade, 0.3, 0.8);
        }
        // the brow: grey and heavy
        const bp: SP[] = [hp(s * 0.14, 13.4, HR * 1.01), hp(s * 0.38, 13.85, HR * 1.01), hp(s * 0.62, 13.4, HR * 1.0)];
        for (const run of visRuns(bp, 0.12)) {
          brush(ctx, run, 0.62, '#6E665C', 0.85, 0.75);
          brush(ctx, run.map(([x, y]) => [x - 0.1, y - 0.3] as Pt), 0.25, '#D8D0C4', 0.5, 0.8);
        }
      }
      paintNose();
      // the moustache: a full grey brush over the lip, turned down at the ends; the lower lip, the chin
      // the mouth: the line between the lips, a touch of shade under the lower lip
      const ml: SP[] = [];
      for (let a = -0.3; a <= 0.31; a += 0.06) ml.push(hp(a, 5.6 + 0.6 * a * a, HR * (0.985 - 0.05 * Math.abs(a))));
      for (const run of visRuns(ml, 0.1)) brush(ctx, run, 0.3, '#6E342A', 0.65, 0.85);
      const lip: SP[] = [hp(-0.16, 4.8, HR * 0.95), hp(0, 4.7, HR * 0.96), hp(0.16, 4.8, HR * 0.95)];
      for (const run of visRuns(lip, 0.1)) brush(ctx, run, 0.4, '#A0584A', 0.5, 0.8);
      const chin = hp(0, 3.6, HR * 0.72);
      if (chin.vis > 0.2) {
        ctx.fillStyle = 'rgba(122,70,52,0.18)';
        ctx.beginPath();
        ctx.ellipse(chin.x, chin.y + 0.2, 1.6 * chin.vis, 0.5, 0, 0, TAU);
        ctx.fill();
      }
    }
    // the pencil behind the right ear: yellow, sharpened, lying nearly level in the crease above the ear, its point
    // forward (level, so two neighbouring views dissolving into each other never cross it into an X)
    {
      const p0 = hp(1.2, 14.2, HR + 1.0);
      const p1 = hp(1.98, 13.8, HR + 0.9);
      if (Math.min(p0.vis, p1.vis) > 0.1) {
        brush(ctx, [[p0.x, p0.y], [p1.x, p1.y]], 0.95, '#D8A830', 0.95, 0.15);
        brush(ctx, [[p0.x, p0.y - 0.2], [p1.x, p1.y - 0.2]], 0.3, '#F8E4A0', 0.6, 0.2);
        const dx = p0.x - p1.x;
        const dy = p0.y - p1.y;
        const l = Math.hypot(dx, dy) || 1;
        brush(ctx, [[p0.x, p0.y], [p0.x + (dx / l) * 1.4, p0.y + (dy / l) * 1.4]], 0.55, '#E8C898', 0.95, 0.9);
        brush(ctx, [[p0.x + (dx / l) * 1.1, p0.y + (dy / l) * 1.1], [p0.x + (dx / l) * 1.8, p0.y + (dy / l) * 1.8]], 0.28, '#2A2420', 0.9, 0.9);
      }
    }
  }, 0.3, 251 + k);
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
    if (sp > -0.15) {
      for (const h of [2.2, 4.6, 7]) brush(ctx, [P(4.2, -1.8, h), P(4.2, 1.8, h)], 0.3, '#8A7A66', 0.7, 0.9);
    }
    const heel: Pt[] = [P(-5.5, -2.2, -4.1), P(-5.7, 0, -4.1), P(-5.5, 2.2, -4.1)];
    if (sp < 0.3) brush(ctx, heel, 1.5, '#100A06', 0.7, 0.6);
  }, 0.5, 293 + k);
}

/* ------------------------------------------------------------------ the limbs */

/** a profile along a limb (x along it) from its widths at stations: smooth, closed */
function profile(xs: number[], ws: number[], bow: number[] = []): number[] {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i < xs.length; i++) {
    const b = bow[i] ?? 0;
    top.push([xs[i]!, -ws[i]! / 2 + b]);
    bot.push([xs[i]!, ws[i]! / 2 + b]);
  }
  const n = xs.length - 1;
  return smoothPoly([[xs[0]! - ws[0]! * 0.35, bow[0] ?? 0], ...top, [xs[n]! + ws[n]! * 0.3, bow[n] ?? 0], ...bot.reverse()], 3, true);
}

function paintHand(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, S: Pig): void {
  // a working hand, half closed: the back of the hand from the wrist to the knuckles, the fingers curled under, the
  // thumb along the near side
  const so: FormOpts = { flip: false, light: S.light, shade: S.shade, alpha: 0.98, layers: 3, lightA: 0.32, shadeA: 0.3, inkW: 0.36, speck: 6 };
  const thumb = smoothPoly([[x0 + 1.6, 1.6], [x0 + 4.2, 3.6], [x0 + 7.4, 4.1], [x0 + 8.8, 3.1], [x0 + 7.6, 1.9], [x0 + 4.4, 1.2]], 3, true);
  paintForm(ctx, thumb, mix(S.base, S.shade, 0.08), rnd, so);
  const back = smoothPoly([[x0 - 0.4, -2.3], [x0 + 3.4, -3.0], [x0 + 7.2, -3.2], [x0 + 8.6, -2.4], [x0 + 8.9, 0], [x0 + 8.4, 2.5], [x0 + 4.4, 2.8], [x0 - 0.4, 2.3]], 3, true);
  paintForm(ctx, back, S.base, rnd, so);
  // the curled fingers: four rounded knuckle rolls past the back of the hand
  for (let i = 0; i < 4; i++) {
    const y = -2.3 + i * 1.5;
    const f = smoothPoly([[x0 + 8, y - 0.75], [x0 + 10.4, y - 0.7], [x0 + 11.2, y], [x0 + 10.4, y + 0.75], [x0 + 8, y + 0.75]], 3, true);
    paintForm(ctx, f, mix(S.base, '#D07A62', 0.08 + 0.04 * i), rnd, { ...so, inkW: 0.28 });
  }
  // the knuckles and the tendons on the back of the hand
  for (let i = 0; i < 4; i++) {
    const y = -2.2 + i * 1.5;
    ctx.fillStyle = 'rgba(150,84,60,0.3)';
    ctx.beginPath();
    ctx.ellipse(x0 + 8.2, y, 0.45, 0.35, 0, 0, TAU);
    ctx.fill();
    brush(ctx, [[x0 + 1.5, y * 0.6], [x0 + 7.4, y * 0.95]], 0.14, S.shade, 0.18, 0.9);
  }
}

function paintArm(q: number): { upper: Part; fore: Part; elbow: Part } {
  const rnd = new Rand(6540);
  const sleeve = SHIRT;
  const SK = SKIN;
  const so: FormOpts = { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 4, lightA: 0.32, shadeA: 0.3, inkW: 0.45, speck: 20 };
  const upper = part(36, 16, 6, 8, q, (ctx) => {
    // the sleeve over the shoulder and down the arm, pushed up and bunched above the elbow
    const p = profile([0, 5, 11, 17, 21.5, 25], [9.4, 9.0, 8.4, 8.0, 8.6, 8.2], [0, 0.1, 0.2, 0.2, 0.1, 0]);
    paintForm(ctx, p, sleeve.base, rnd, so);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    for (let y = -4.6; y < 4.8; y += 1.5) brush(ctx, [[0, y], [12, y * 0.95 + 0.1], [25, y * 0.9]], 0.14, STRIPE, 0.3, 0.95);
    // the fold under the arm in shade, the light along its top
    brush(ctx, [[2, 3.2], [10, 3.4], [20, 3.0]], 1.4, sleeve.shade, 0.2, 0.9);
    brush(ctx, [[3, -2.8], [12, -3.1], [20, -2.7]], 0.9, sleeve.light, 0.28, 0.9);
    // the bunching above the elbow: curved creases across the sleeve
    for (const x of [17.5, 19.6, 21.6, 23.4]) brush(ctx, [[x - 0.6, -3.8], [x + 0.6, -1], [x + 0.2, 1.8], [x - 0.6, 3.8]], 0.28, sleeve.shade, 0.32, 0.7);
    // a sleeve garter round the arm
    brush(ctx, [[13.2, -4.2], [13.5, 0], [13.2, 4.2]], 0.95, '#38384A', 0.85, 0.3);
    brush(ctx, [[13, -3.6], [13.2, -1.2]], 0.3, '#8A8AA0', 0.6, 0.5);
    ctx.restore();
  }, 0.4, 281);
  const fore = part(42, 18, 6, 9, q, (ctx) => {
    // the bare forearm: full below the elbow, narrowing to the wrist, brown from the shop's lamps and the street
    const arm = profile([1.5, 5, 9, 13, 17, 19.6], [7.6, 7.9, 7.0, 5.9, 5.0, 4.8], [0, -0.2, -0.2, -0.1, 0, 0]);
    paintForm(ctx, arm, SK.base, rnd, { flip: false, light: SK.light, shade: SK.shade, alpha: 0.97, layers: 3, lightA: 0.34, shadeA: 0.28, inkW: 0.4, speck: 12 });
    ctx.save();
    tracePoly(ctx, arm);
    ctx.clip();
    brush(ctx, [[4, -2.4], [9, -2.6], [15, -1.8]], 1.1, SK.light, 0.25, 0.9);
    brush(ctx, [[4, 2.8], [10, 2.6], [17, 2.0]], 1.2, SK.shade, 0.2, 0.9);
    for (let i = 0; i < 26; i++) {
      const x = rnd.range(5, 17);
      const y = rnd.range(-2.8, 2.6);
      brush(ctx, [[x, y], [x + 0.7, y + rnd.range(-0.15, 0.25)]], 0.08, '#5A3A2A', 0.35, 0.9);
    }
    ctx.restore();
    // the rolled cuff at the elbow: a soft roll of shirting with its turns
    const roll = profile([-1.6, 0.6, 2.8, 4.6], [8.2, 9.2, 9.4, 8.4]);
    paintForm(ctx, roll, sleeve.base, rnd, { ...so, speck: 8 });
    ctx.save();
    tracePoly(ctx, roll);
    ctx.clip();
    for (const x of [0.6, 2.6]) brush(ctx, [[x + 0.4, -4.4], [x - 0.2, -1.4], [x - 0.3, 1.6], [x + 0.3, 4.4]], 0.3, sleeve.shade, 0.5, 0.7);
    for (let y = -4.2; y < 4.4; y += 1.4) brush(ctx, [[-1.2, y], [4.2, y]], 0.12, STRIPE, 0.28, 0.9);
    brush(ctx, [[-0.5, -3.2], [3.6, -3.4]], 0.6, sleeve.light, 0.35, 0.9);
    ctx.restore();
    paintHand(ctx, rnd, 19.4, SK);
  }, 0.4, 282);
  const elbow = part(14, 14, 7, 7, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 12; i++) c.push([4.4 * Math.cos((i / 12) * TAU), 4.4 * Math.sin((i / 12) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), sleeve.base, rnd, { flip: false, light: sleeve.light, shade: sleeve.shade, alpha: 0.97, layers: 3, inkW: 0.4, speck: 8 });
  }, 0.4, 283);
  return { upper, fore, elbow };
}

function paintLeg(q: number): { thigh: Part; shin: Part; knee: Part } {
  const rnd = new Rand(6560);
  const T = TROUSER;
  const o: FormOpts = { flip: false, light: T.light, shade: T.shade, alpha: 0.97, layers: 4, lightA: 0.3, shadeA: 0.3, inkW: 0.45, speck: 10 };
  // dark wool: a few long soft strokes of the weave, the pressed crease down the front catching the light
  const wool = (ctx: CanvasRenderingContext2D, len: number, w: number) => {
    for (let i = 0; i < len * 0.8; i++) {
      const x = rnd.range(0, len - 3);
      const y = rnd.range(-w / 2 + 0.8, w / 2 - 0.8);
      brush(ctx, [[x, y], [x + rnd.range(2, 5), y + rnd.range(-0.1, 0.1)]], 0.12, rnd.chance(0.5) ? T.light : T.shade, 0.18, 0.9);
    }
    brush(ctx, [[0.5, -w * 0.2], [len * 0.5, -w * 0.17], [len - 0.5, -w * 0.16]], 0.3, mix(T.light, '#FFFFFF', 0.2), 0.42, 0.95);
  };
  const thigh = part(38, 20, 8, 10, q, (ctx) => {
    const p = profile([0, 7, 14, 21, 28.5], [11.2, 10.8, 10.0, 9.2, 8.8], [0, -0.2, -0.3, -0.2, 0]);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wool(ctx, 28.5, 12);
    brush(ctx, [[3, 2.8], [11, 3.2], [20, 2.6], [27, 2.0]], 1.8, T.shade, 0.26, 0.9);
    // the creases that gather toward the knee
    for (const x of [23, 25.5]) brush(ctx, [[x, 1], [x + 1.6, 3.4]], 0.3, T.shade, 0.4, 0.8);
    ctx.restore();
  }, 0.4, 291);
  const shin = part(38, 18, 7, 9, q, (ctx) => {
    const p = profile([0, 9, 18, 26, 28.5], [8.8, 8.4, 8.2, 8.5, 8.7], [0, 0.2, 0.2, 0.1, 0]);
    paintForm(ctx, p, T.base, rnd, o);
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    wool(ctx, 28.5, 9.8);
    brush(ctx, [[2, 2.4], [12, 2.6], [22, 2.2]], 1.4, T.shade, 0.24, 0.9);
    // the turn-up resting on the boot
    brush(ctx, [[24.4, -4.8], [24.7, 0], [24.4, 4.8]], 0.9, T.shade, 0.5, 0.6);
    brush(ctx, [[25.2, -4.4], [25.4, 0], [25.2, 4.4]], 0.4, T.light, 0.35, 0.6);
    ctx.restore();
  }, 0.4, 292);
  const knee = part(16, 16, 8, 8, q, (ctx) => {
    const c: Pt[] = [];
    for (let i = 0; i < 14; i++) c.push([5.2 * Math.cos((i / 14) * TAU), 5.2 * Math.sin((i / 14) * TAU)]);
    paintForm(ctx, smoothPoly(c, 2, true), T.base, rnd, { ...o, speck: 4 });
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
      foreFar: tinted(arm.fore, cool, 0.28),
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
