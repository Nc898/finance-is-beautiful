/**
 * Underground art: the root system, the root crown where the trunk continues below the ground line,
 * and the grass/soil detail that seats the trunk in the meadow.
 *
 * Painted with the trunk's own vocabulary (layered sienna/tan/umber/violet washes, granulation,
 * striations, wet edge, broken dry-brush sepia contour) so roots read as the same living wood.
 * Everything is a pure function of (model, maturity, view): jitter comes from an index hash, never
 * from a PRNG at render time, so the same maturity always paints the same roots.
 */
import { clamp, smoothstep } from './prng';
import { SOIL_DEPTH, type RootBranch } from './treeModel';

export interface RootView {
  /** screen px of the trunk base (world 0,0) */
  ox: number;
  oy: number;
  /** css px per world unit */
  s: number;
}

/** Main roots are drawn thicker than the model's pipe radius so they read as part of the trunk. */
const ROOT_THICK = 1.7;
/** Light comes from the upper left (screen space, y down). */
const LX = -0.6;
const LY = -0.8;

const MAXN = 400;
const X = new Float32Array(MAXN);
const Y = new Float32Array(MAXN);
const R = new Float32Array(MAXN);
const NX = new Float32Array(MAXN);
const NY = new Float32Array(MAXN);
const C = new Float32Array(MAXN);

function hash(a: number, b: number): number {
  const t = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

/** Point on a ribbon at cross-section f (−1 shadow edge … +1 lit edge). */
const px = (i: number, f: number) => X[i]! + NX[i]! * R[i]! * f;
const py = (i: number, f: number) => Y[i]! + NY[i]! * R[i]! * f;

/** Band between cross-sections f0 and f1 (both in −1…1) along the whole ribbon. */
function band(k: number, f0: number, f1: number, wob: number, seed: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < k; i++) {
    const j = 1 + (hash(i, seed) - 0.5) * wob;
    p.lineTo(px(i, f0), py(i, f0 * j));
  }
  for (let i = k - 1; i >= 0; i--) {
    const j = 1 + (hash(i + 97, seed) - 0.5) * wob;
    p.lineTo(px(i, f1 * j), py(i, f1 * j));
  }
  p.closePath();
  return p;
}

/**
 * Build the visible part of a root into the scratch arrays (screen space), with organic width
 * modulation and, for main roots, a flare where they leave the root crown. Returns point count.
 */
function build(r: RootBranch, g: number, rs: number, v: RootView, ri: number, drop = 0): number {
  const lv = g * r.len;
  let k = 0;
  const thick = r.depth === 0 ? ROOT_THICK : r.depth <= 2 ? 1.2 : 1;
  for (let i = 0; i < r.n && k < MAXN; i++) {
    let x = r.px[i]!;
    let y = r.py[i]!;
    let rd = r.rad[i]!;
    let c = r.cum[i]!;
    let last = false;
    if (c > lv) {
      if (i === 0) break;
      const a = (lv - r.cum[i - 1]!) / (c - r.cum[i - 1]!);
      x = r.px[i - 1]! + (x - r.px[i - 1]!) * a;
      y = r.py[i - 1]! + (y - r.py[i - 1]!) * a;
      rd = r.rad[i - 1]! + (rd - r.rad[i - 1]!) * a;
      c = lv;
      last = true;
    }
    const flare = r.depth === 0 ? 1 + 1.15 * Math.pow(1 - smoothstep(c / 34), 1.4) : 1;
    // main roots leave the root crown below the surface, then ease back to their modelled path
    if (drop > 0 && r.depth === 0) y -= drop * (0.35 + 0.65 * (1 - smoothstep(c / 40))) * (0.75 + 0.5 * hash(ri, 5));
    else if (drop > 0 && r.depth <= 2) y -= drop * 0.35;
    const wobble = 1 + 0.11 * Math.sin(c * 0.21 + ri * 1.7) + 0.06 * Math.sin(c * 0.57 + ri * 0.4);
    // the growing tip tapers to a point
    const tipT = clamp((lv - c) / 10, 0, 1);
    X[k] = v.ox + x * v.s;
    Y[k] = v.oy - y * v.s;
    R[k] = Math.max(0.22, rd * rs * thick * flare * wobble * (0.35 + 0.65 * tipT)) * v.s;
    C[k] = c;
    k++;
    if (last) break;
  }
  // normals, oriented so +1 is the lit side (towards the upper-left light)
  for (let i = 0; i < k; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < k - 1 ? i + 1 : k - 1;
    let tx = X[i1]! - X[i0]!;
    let ty = Y[i1]! - Y[i0]!;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    let nx = -ty;
    let ny = tx;
    if (nx * LX + ny * LY < 0) {
      nx = -nx;
      ny = -ny;
    }
    NX[i] = nx;
    NY[i] = ny;
  }
  return k;
}

function silhouette(k: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < k; i++) p.lineTo(px(i, 1), py(i, 1));
  for (let i = k - 1; i >= 0; i--) p.lineTo(px(i, -1), py(i, -1));
  p.closePath();
  return p;
}

/** One full bark-painted root ribbon (main and secondary roots). */
function paintBarkRoot(ctx: CanvasRenderingContext2D, k: number, seed: number, v: RootView, bark: CanvasPattern | null): void {
  const rMax = R[0]!;
  const sil = silhouette(k);
  const x0 = X[0]!, y0 = Y[0]!, x1 = X[k - 1]!, y1 = Y[k - 1]!;

  // base wash: trunk sienna near the crown, cooling and paling into the soil towards the tip
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, 'rgba(172,124,84,1)');
  gr.addColorStop(0.45, 'rgba(168,126,88,0.95)');
  gr.addColorStop(1, 'rgba(184,150,110,0.78)');
  ctx.fillStyle = gr;
  ctx.fill(sil);

  // lit side glazes (tan), shadow side glazes (umber, then violet-brown in the core shadow)
  ctx.fillStyle = 'rgba(236,206,154,0.28)';
  ctx.fill(band(k, 1, 0.45, 0.25, seed));
  ctx.fill(band(k, 1, 0.75, 0.2, seed + 1));
  ctx.fillStyle = 'rgba(96,62,44,0.24)';
  ctx.fill(band(k, -1, -0.1, 0.3, seed + 2));
  ctx.fill(band(k, -1, -0.5, 0.25, seed + 3));
  if (rMax > 3) {
    ctx.fillStyle = 'rgba(70,50,80,0.12)';
    ctx.fill(band(k, -1, -0.65, 0.2, seed + 4));
  }

  // granulation: the trunk's bark tile multiplied in
  if (bark && rMax > 2.6) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = bark;
    ctx.fill(sil);
    ctx.restore();
  }

  // striations along the root, and ring creases across it near the base
  const dark = new Path2D();
  const darkHeavy = new Path2D();
  const light = new Path2D();
  const rings = new Path2D();
  let nextRing = 8 + hash(seed, 3) * 10;
  for (let i = 1; i < k - 1; i++) {
    if (R[i]! < 1.3) break;
    const h1 = hash(i, seed + 11);
    const h2 = hash(i, seed + 23);
    // striation: a short stroke parallel to the root
    if (h1 < 0.75) {
      const f = -0.75 + h2 * 1.35;
      const len = Math.min((4 + hash(i, seed + 37) * 8) * Math.sqrt(v.s), R[i]! * 4);
      const tx = NY[i]!;
      const ty = -NX[i]!;
      const cx = px(i, f);
      const cy = py(i, f);
      const p = f > 0.35 ? light : h1 < 0.18 ? darkHeavy : dark;
      p.moveTo(cx - tx * len * 0.5, cy - ty * len * 0.5);
      p.lineTo(cx + tx * len * 0.5, cy + ty * len * 0.5);
    }
    // ring crease: a slightly curved line across the root
    if (C[i]! > nextRing && R[i]! > 2) {
      nextRing = C[i]! + 10 + hash(i, seed + 51) * 16;
      const bow = R[i]! * 0.35;
      const tx = NY[i]!;
      const ty = -NX[i]!;
      rings.moveTo(px(i, -0.95), py(i, -0.95));
      rings.quadraticCurveTo(X[i]! + tx * bow, Y[i]! + ty * bow, px(i, 0.4), py(i, 0.4));
    }
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = 'rgba(70,40,30,0.38)';
  ctx.stroke(dark);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(56,32,26,0.3)';
  ctx.stroke(darkHeavy);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(246,224,178,0.42)';
  ctx.stroke(light);
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = 'rgba(52,34,26,0.42)';
  ctx.stroke(rings);

  // pale highlight on the lit flank, broken
  if (rMax > 2.2) {
    const hl = new Path2D();
    let on = false;
    for (let i = 0; i < k; i++) {
      const vis = hash(i, seed + 61) > 0.22 && R[i]! > 1.4;
      const x = px(i, 0.62), y = py(i, 0.62);
      if (vis && on) hl.lineTo(x, y);
      else if (vis) hl.moveTo(x, y);
      on = vis;
    }
    ctx.lineWidth = clamp(rMax * 0.1, 0.5, 1.5);
    ctx.strokeStyle = 'rgba(248,234,200,0.55)';
    ctx.stroke(hl);
  }

  // wet edge: pigment pooled along the shadow flank
  const we = new Path2D();
  for (let i = 0; i < k; i++) {
    const f = -0.86 + hash(i, seed + 71) * 0.12;
    if (i === 0) we.moveTo(px(i, f), py(i, f));
    else we.lineTo(px(i, f), py(i, f));
  }
  ctx.lineWidth = Math.max(0.7, rMax * 0.13);
  ctx.strokeStyle = 'rgba(58,34,36,0.32)';
  ctx.stroke(we);

  // broken dry-brush sepia contour: heavier and more continuous on the shadow side
  const sc = clamp(0.65 + rMax * 0.06, 0.65, 1.3);
  for (let side = 0; side < 2; side++) {
    const f = side === 0 ? -1 : 1;
    const gap = side === 0 ? 0.1 : 0.24;
    const thin = new Path2D();
    const heavy = new Path2D();
    let prev = -1;
    for (let i = 0; i < k; i++) {
      const h = hash(i, seed + 81 + side * 13);
      const cls = h < gap ? 0 : h < 0.62 ? 1 : 2;
      const x = px(i, f), y = py(i, f);
      if (cls !== 0 && cls === prev) (cls === 1 ? thin : heavy).lineTo(x, y);
      else if (cls !== 0) {
        const p = cls === 1 ? thin : heavy;
        if (i > 0 && prev !== 0) p.moveTo(px(i - 1, f), py(i - 1, f));
        else p.moveTo(x, y);
        p.lineTo(x, y);
      }
      prev = cls;
    }
    const a = side === 0 ? 0.78 : 0.5;
    ctx.strokeStyle = `rgba(40,28,22,${a})`;
    ctx.lineWidth = 0.6 * sc;
    ctx.stroke(thin);
    ctx.lineWidth = 1.05 * sc;
    ctx.stroke(heavy);
  }
}

/** Thin secondary roots: two-tone line in the same umber, no full bark treatment. */
function paintThinRoot(ctx: CanvasRenderingContext2D, k: number, seed: number): void {
  const p = new Path2D();
  const lit = new Path2D();
  for (let i = 0; i < k; i++) {
    if (i === 0) {
      p.moveTo(X[i]!, Y[i]!);
      lit.moveTo(px(i, 0.55), py(i, 0.55));
    } else {
      p.lineTo(X[i]!, Y[i]!);
      lit.lineTo(px(i, 0.55), py(i, 0.55));
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.7, R[0]! * 2);
  ctx.strokeStyle = 'rgba(118,86,58,0.85)';
  ctx.stroke(p);
  if (R[0]! > 0.8) {
    ctx.lineWidth = Math.max(0.4, R[0]! * 0.6);
    ctx.strokeStyle = 'rgba(196,156,106,0.5)';
    ctx.stroke(lit);
  }
  // a few whiskers along thin roots
  const wh = new Path2D();
  for (let i = 2; i < k - 1; i += 2) {
    if (hash(i, seed + 5) > 0.45) continue;
    const sd = hash(i, seed + 9) < 0.5 ? 1 : -1;
    const len = 1.5 + hash(i, seed + 17) * 2.5;
    const tx = NY[i]!, ty = -NX[i]!;
    wh.moveTo(X[i]!, Y[i]!);
    wh.lineTo(X[i]! + (NX[i]! * sd * 0.8 + tx * 0.6) * len, Y[i]! + (NY[i]! * sd * 0.8 + ty * 0.6) * len);
  }
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = 'rgba(78,56,38,0.5)';
  ctx.stroke(wh);
}

/** Hair roots: fine sepia threads with tiny fibrous whiskers. */
function paintHairRoot(ctx: CanvasRenderingContext2D, k: number, seed: number, hair: Path2D, whisk: Path2D): void {
  for (let i = 0; i < k; i++) {
    if (i === 0) hair.moveTo(X[i]!, Y[i]!);
    else hair.lineTo(X[i]!, Y[i]!);
  }
  for (let i = 1; i < k; i++) {
    if (hash(i, seed + 3) > 0.6) continue;
    const sd = i % 2 === 0 ? 1 : -1;
    const len = 1.2 + hash(i, seed + 7) * 1.8;
    whisk.moveTo(X[i]!, Y[i]!);
    whisk.lineTo(X[i]! + NX[i]! * sd * len + NY[i]! * len * 0.5, Y[i]! + NY[i]! * sd * len - NX[i]! * len * 0.5);
  }
  void ctx;
}

/**
 * The whole root system. `rootG` is the per-root growth (0…1) from the model's root clock;
 * `rs` the maturity scale for root girth. Main roots get the full bark treatment.
 */
export function paintRoots(
  ctx: CanvasRenderingContext2D, v: RootView, roots: RootBranch[], rootG: Float32Array, rs: number, seed: number, bark: CanvasPattern | null, drop = 0,
): void {
  // 1. damp soil halo behind every visible root, so the roots sit IN the soil rather than on it
  const halo = new Path2D();
  let any = false;
  let haloW = 0;
  for (let ri = 0; ri < roots.length; ri++) {
    const g = rootG[ri]!;
    if (g <= 0.001 || roots[ri]!.depth > 1) continue;
    const k = build(roots[ri]!, g, rs, v, ri, drop);
    if (k < 2) continue;
    any = true;
    haloW = Math.max(haloW, R[0]!);
    for (let i = 0; i < k; i++) {
      if (i === 0) halo.moveTo(X[i]!, Y[i]!);
      else halo.lineTo(X[i]!, Y[i]!);
    }
  }
  if (!any) return;
  ctx.save();
  // everything underground stays underground: nothing smudges the meadow or the paper above
  ctx.beginPath();
  ctx.rect(v.ox - 4000, v.oy + 0.5, 8000, 4000);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // a narrow damp line in the soil along each root (sized to the root's body, not its flared base)
  const damp = Math.min(haloW, 6 * Math.sqrt(v.s));
  ctx.lineWidth = damp + 5 * Math.sqrt(v.s);
  ctx.strokeStyle = 'rgba(126,90,56,0.06)';
  ctx.stroke(halo);

  // 2. fine hair roots first (furthest back), then thin roots, then the main bark-painted roots on top
  const hair = new Path2D();
  const whisk = new Path2D();
  for (let ri = 0; ri < roots.length; ri++) {
    const r = roots[ri]!;
    const g = rootG[ri]!;
    if (g <= 0.001 || r.depth < 3) continue;
    const k = build(r, g, rs, v, ri, drop);
    if (k >= 2) paintHairRoot(ctx, k, seed + ri * 31, hair, whisk);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.min(1.1, 0.5 * Math.sqrt(Math.max(1, v.s)));
  ctx.strokeStyle = 'rgba(84,60,40,0.62)';
  ctx.stroke(hair);
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = 'rgba(84,60,40,0.4)';
  ctx.stroke(whisk);

  for (let pass = 0; pass < 2; pass++) {
    for (let ri = 0; ri < roots.length; ri++) {
      const r = roots[ri]!;
      const g = rootG[ri]!;
      if (g <= 0.001 || r.depth >= 3) continue;
      if ((pass === 0) !== (r.depth > 0)) continue;
      const k = build(r, g, rs, v, ri, drop);
      if (k < 2) continue;
      if (R[0]! >= 1.6) paintBarkRoot(ctx, k, seed + ri * 131, v, bark);
      else paintThinRoot(ctx, k, seed + ri * 131);
    }
  }
  ctx.restore();
}

/**
 * The root crown: the trunk continuing below the ground line as a lobed, tapering form whose
 * shoulders flare into the main roots, painted with the trunk's bark layers and bleeding into the
 * soil at its tip. `w` is the trunk half-width at the ground (screen px).
 */
export function paintRootCrown(ctx: CanvasRenderingContext2D, v: RootView, w: number, seed: number, alpha: number, bark: CanvasPattern | null): void {
  if (w < 1.5 || alpha <= 0.01) return;
  const x0 = v.ox;
  const y0 = v.oy;
  const d = Math.min(SOIL_DEPTH * 0.45 * v.s, w * 0.85);
  const hl = 1 + (hash(1, seed) - 0.5) * 0.3;
  const hr = 1 + (hash(2, seed) - 0.5) * 0.3;
  // flanks: from the trunk edge out over a broad shoulder where the main roots leave, then curving
  // in under a rounded, lobed base (no point, no rings)
  const pts: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sh = (side: number, h: number) =>
      (1 + 0.14 * h * Math.sin(Math.PI * Math.min(1, t / 0.55)) - 0.3 * Math.pow(t, 2)) * w * (1 + 0.03 * Math.sin(i * (1.9 + side * 0.4) + seed));
    pts.push([x0 - sh(-1, hl), y0 + t * d]);
    right.push([x0 + sh(1, hr), y0 + t * d]);
  }
  const body = new Path2D();
  body.moveTo(pts[0]![0], y0 - 2);
  for (const [x, y] of pts) body.lineTo(x, y);
  // lobed base: three soft lobes where the deeper roots carry on
  const bl = pts[N]!, br = right[N]!;
  const span = br[0] - bl[0];
  body.bezierCurveTo(bl[0] + span * 0.12, y0 + d * 1.18, bl[0] + span * 0.3, y0 + d * 1.2, bl[0] + span * 0.38, y0 + d * 1.06);
  body.bezierCurveTo(bl[0] + span * 0.45, y0 + d * 1.24, bl[0] + span * 0.6, y0 + d * 1.24, bl[0] + span * 0.66, y0 + d * 1.04);
  body.bezierCurveTo(bl[0] + span * 0.74, y0 + d * 1.16, bl[0] + span * 0.92, y0 + d * 1.14, br[0], br[1]);
  for (let i = N; i >= 0; i--) body.lineTo(right[i]![0], right[i]![1]);
  body.lineTo(right[0]![0], y0 - 2);
  body.closePath();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.clip(body);
  // base sienna, then lit tan on the left, umber and violet-brown on the right (light from upper-left)
  ctx.fillStyle = 'rgba(172,124,84,1)';
  ctx.fillRect(x0 - w * 2, y0 - 4, w * 4, d * 1.4 + 8);
  const across = ctx.createLinearGradient(x0 - w * 1.3, 0, x0 + w * 1.3, 0);
  across.addColorStop(0, 'rgba(226,190,134,0.5)');
  across.addColorStop(0.3, 'rgba(214,174,118,0.18)');
  across.addColorStop(0.55, 'rgba(110,70,48,0.15)');
  across.addColorStop(0.8, 'rgba(78,48,38,0.45)');
  across.addColorStop(1, 'rgba(58,40,62,0.4)');
  ctx.fillStyle = across;
  ctx.fillRect(x0 - w * 2, y0 - 4, w * 4, d * 1.4 + 8);
  // translucent wash blooms for a watercolor (not airbrushed) surface
  for (let q = 0; q < 6; q++) {
    const bx = x0 + (hash(q, seed + 5) - 0.5) * w * 1.4;
    const by = y0 + hash(q, seed + 9) * d * 0.8;
    const br = w * (0.25 + hash(q, seed + 13) * 0.3);
    ctx.fillStyle = q % 2 === 0 ? 'rgba(176,104,52,0.14)' : 'rgba(104,66,98,0.1)';
    ctx.beginPath();
    ctx.ellipse(bx, by, br * 0.6, br * 1.4, (hash(q, seed + 17) - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (bark) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = bark;
    ctx.fillRect(x0 - w * 2, y0 - 4, w * 4, d * 1.4 + 8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }
  // bark striations continuing the trunk's, converging towards the tip; and collar wrinkles
  const st = new Path2D();
  const stL = new Path2D();
  for (let q = 0; q < 26; q++) {
    const u = hash(q, seed + 21) * 2 - 1;
    const t0 = hash(q, seed + 25) * 0.7;
    const t1 = Math.min(1, t0 + 0.12 + hash(q, seed + 29) * 0.25);
    const wx = (t: number) => x0 + u * w * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, t / 0.55)) - 0.3 * Math.pow(t, 2)) * 0.85;
    (u < -0.35 ? stL : st).moveTo(wx(t0), y0 + t0 * d);
    (u < -0.35 ? stL : st).lineTo(wx(t1), y0 + t1 * d);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.6 * Math.max(1, Math.sqrt(v.s));
  ctx.strokeStyle = 'rgba(62,36,28,0.38)';
  ctx.stroke(st);
  ctx.strokeStyle = 'rgba(246,224,178,0.38)';
  ctx.stroke(stL);
  const wr = new Path2D();
  for (let q = 0; q < 2; q++) {
    const t = 0.25 + q * 0.3 + hash(q, seed + 41) * 0.1;
    const cx = x0 + (hash(q, seed + 43) - 0.3) * w * 0.8;
    const half = w * (0.18 + hash(q, seed + 47) * 0.2);
    wr.moveTo(cx - half, y0 + t * d);
    wr.quadraticCurveTo(cx, y0 + t * d + half * 0.35, cx + half, y0 + t * d + (hash(q, seed + 49) - 0.5) * 2);
  }
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(52,34,26,0.32)';
  ctx.stroke(wr);
  // bleed into the soil towards the tip
  const bleed = ctx.createLinearGradient(0, y0 + d * 0.45, 0, y0 + d * 1.25);
  bleed.addColorStop(0, 'rgba(190,150,104,0)');
  bleed.addColorStop(1, 'rgba(190,150,104,0.6)');
  ctx.fillStyle = bleed;
  ctx.fillRect(x0 - w * 2, y0, w * 4, d * 1.4 + 8);
  ctx.restore();

  // wet edge and broken ink on the two flanks only (no line along the ground)
  for (const [side, arr] of [[-1, pts], [1, right]] as const) {
    const ink = new Path2D();
    const wet = new Path2D();
    let on = false;
    for (let i = 1; i < arr.length; i++) {
      const [x, y] = arr[i]!;
      const vis = hash(i, seed + (side < 0 ? 53 : 59)) > (side < 0 ? 0.25 : 0.1) && i < arr.length * 0.72;
      if (vis && on) ink.lineTo(x, y);
      else if (vis) {
        const [xp, yp] = arr[i - 1]!;
        ink.moveTo(xp, yp);
        ink.lineTo(x, y);
      }
      on = vis;
      const inset = side * -1 * Math.max(1, w * 0.07);
      if (i === 1) wet.moveTo(x + inset, y);
      else wet.lineTo(x + inset, y);
    }
    ctx.lineWidth = Math.max(0.8, w * 0.07);
    ctx.strokeStyle = side > 0 ? 'rgba(58,34,36,0.32)' : 'rgba(58,34,36,0.16)';
    ctx.stroke(wet);
    ctx.lineWidth = side > 0 ? 1.1 : 0.75;
    ctx.strokeStyle = side > 0 ? 'rgba(40,28,22,0.72)' : 'rgba(40,28,22,0.5)';
    ctx.stroke(ink);
  }
  ctx.restore();
}

/**
 * Seat the trunk in the meadow: damp soil under the join, crumbs and pebbles at the ground line,
 * and layered grass tufts (back blades darker, front blades lighter, a few dry, a few inked) that
 * overlap the trunk foot. `w` is the trunk half-width at the ground (screen px); `k` fades it in.
 */
export function paintGroundJoin(ctx: CanvasRenderingContext2D, v: RootView, w: number, seed: number, k: number): void {
  if (k <= 0.01 || w < 1) return;
  const x0 = v.ox;
  const y0 = v.oy;
  const sc = Math.max(0.8, Math.sqrt(v.s));
  ctx.save();
  ctx.globalAlpha = k;

  // damp soil just under the ground line, darkest at the trunk, kept below the grass
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - w * 4, y0 + 1, w * 8, w * 2);
  ctx.clip();
  const damp = ctx.createRadialGradient(x0, y0, 0, x0, y0, w * 2.3);
  damp.addColorStop(0, 'rgba(98,68,44,0.5)');
  damp.addColorStop(0.5, 'rgba(124,90,58,0.24)');
  damp.addColorStop(1, 'rgba(150,116,78,0)');
  ctx.fillStyle = damp;
  ctx.beginPath();
  ctx.ellipse(x0, y0, w * 2.3, w * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // crumbs and pebbles along the ground line
  for (let i = 0; i < 26; i++) {
    const u = hash(i, seed + 101) * 2 - 1;
    const x = x0 + u * w * 2.1;
    const y = y0 + (hash(i, seed + 103) - 0.35) * w * 0.35;
    const r = (0.7 + hash(i, seed + 107) * 1.6) * sc;
    const dark = hash(i, seed + 109) < 0.5;
    ctx.fillStyle = dark ? 'rgba(86,60,40,0.6)' : 'rgba(176,142,98,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + hash(i, seed + 113) * 0.3), hash(i, seed + 127) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.6 * sc && hash(i, seed + 131) < 0.4) {
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(47,34,24,0.5)';
      ctx.stroke();
    }
  }

  // grass: tapered, curved blades in tufts either side of the trunk and across its foot
  const blade = (bx: number, len: number, lean: number, wd: number) => {
    const tipx = bx + lean * len;
    const tipy = y0 - len;
    const p = new Path2D();
    p.moveTo(bx - wd, y0 + 1);
    p.quadraticCurveTo(bx + lean * len * 0.25 - wd * 0.6, y0 - len * 0.55, tipx, tipy);
    p.quadraticCurveTo(bx + lean * len * 0.25 + wd * 0.6, y0 - len * 0.5, bx + wd, y0 + 1);
    p.closePath();
    return p;
  };
  const tufts = [-1.85, -1.25, -0.7, -0.15, 0.45, 1.05, 1.7];
  const backCol = ['rgba(64,112,52,0.85)', 'rgba(78,128,58,0.85)'];
  const frontCol = ['rgba(118,164,72,0.92)', 'rgba(142,180,84,0.9)', 'rgba(104,152,66,0.92)'];
  const inkBlades = new Path2D();
  for (let layer = 0; layer < 2; layer++) {
    for (let t = 0; t < tufts.length; t++) {
      const cx = x0 + (tufts[t]! + (hash(t, seed + 141 + layer) - 0.5) * 0.3) * w;
      const n = 4 + Math.floor(hash(t, seed + 149 + layer) * 4);
      for (let b = 0; b < n; b++) {
        const id = layer * 100 + t * 10 + b;
        const bx = cx + (hash(id, seed + 151) - 0.5) * w * 0.35;
        const len = (layer === 0 ? 7 : 5) * sc * (0.6 + hash(id, seed + 157) * 0.9) * Math.min(1.4, 0.55 + w / 30);
        const lean = (hash(id, seed + 163) - 0.5) * 1.1 + (bx - x0) / (w * 6);
        const wd = (0.7 + hash(id, seed + 167) * 0.6) * sc * 0.6;
        const dry = hash(id, seed + 173) < 0.1;
        ctx.fillStyle = dry ? 'rgba(188,166,96,0.85)' : layer === 0 ? backCol[b % 2]! : frontCol[b % 3]!;
        const p = blade(bx, len, lean, wd);
        ctx.fill(p);
        if (hash(id, seed + 179) < 0.22) {
          inkBlades.moveTo(bx - wd * 0.5, y0);
          inkBlades.quadraticCurveTo(bx + lean * len * 0.25, y0 - len * 0.55, bx + lean * len, y0 - len);
        }
      }
    }
  }
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(40,64,34,0.55)';
  ctx.stroke(inkBlades);
  ctx.restore();
}

/** Screen-space centreline of a root as currently drawn (same growth, girth and drop as paintRoots). */
export function rootCenterline(r: RootBranch, g: number, rs: number, v: RootView, ri: number, drop: number): { x: number[]; y: number[] } {
  const k = build(r, g, rs, v, ri, drop);
  return { x: Array.from(X.subarray(0, k)), y: Array.from(Y.subarray(0, k)) };
}
