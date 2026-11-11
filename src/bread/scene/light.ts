/**
 * The room's light, laid as a painter lays it: the surfaces are painted in their own colours first, then the shadow is
 * glazed over them, so it deepens what is under it (a transparent glaze multiplies) instead of veiling it. One glaze
 * covers the room and each sprite (the counter, the board, the crates) with the same light, so they sit in one room:
 * - two pendant lamps whose dome shades throw their light down in a fan (nothing above the rim but a little glow), a
 *   warm pool on the wall behind, the middle of the shelves, the counter top and the boards where the grocer stands;
 * - the window's cool daylight on the left, falling off across the wall and the floor;
 * - everywhere else a warm, violet-brown shade, deepest in the far corners, the ceiling and the front of the floor.
 * The glaze is not even: wet-in-wet blooms drift through it, and in the darks its pigment settles in the paper's tooth
 * (granulation). Applied per pixel once per size, together with a slight wander of every edge (a hand, not a ruler).
 */
import { clamp, makeNoise2D, mulberry32 } from '../../scene/prng';
import { LAMPS, WINDOW } from './geom';

/** how a surface faces the lamps: the back wall and what hangs on it, the counter top (faces up), the counter's front
 *  (faces us, away from the lamps), the floor */
export type Surface = 'wall' | 'top' | 'front' | 'floor';

const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** the shade's mouth, below each lamp's shadeY */
const MOUTH = 28;
/** the door's glass, at the far left (seen on wide screens) */
const DOOR_GLASS = { x0: -92, x1: -14, y0: 92, y1: 330 };

const rectDist = (x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }): number => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));

/** the light at a point of a surface: warm (the lamps), cool (the window), and the little that is left everywhere */
export function illumination(x: number, y: number, s: Surface): { warm: number; cool: number; amb: number } {
  // the boards just in front of the wall take the wall's light (and what stands there, sacks or a broom, is lit as one)
  if (s === 'floor' && y < 572) {
    const k = smooth(530, 572, y);
    const a = illumination(x, 530, 'wall');
    const b = illumination(x, 572, 'floor');
    return { warm: a.warm + (b.warm - a.warm) * k, cool: a.cool + (b.cool - a.cool) * k, amb: a.amb + (b.amb - a.amb) * k };
  }
  let warm = 0;
  let cool = 0;
  let amb = 0.13;
  if (s === 'wall') {
    // each lamp: a fan from inside the shade, cut off at the rim, falling off with distance
    let dark = 1;
    for (const L of LAMPS) {
      const ay = L.shadeY + MOUTH - 34;
      const dx = x - L.x;
      const dy = y - ay;
      const ang = Math.atan2(Math.abs(dx), Math.max(0.5, dy));
      const cone = dy <= 0 ? 0 : smooth(1.18, 0.62, ang);
      const fall = 1 / (1 + (dx * dx + dy * dy) / (310 * 310));
      // the bulb's own glow just round the shade
      const glow = 0.35 * Math.exp(-Math.hypot(dx / 60, (y - L.shadeY - MOUTH) / 34));
      dark *= 1 - clamp(cone * fall * 1.3 + glow, 0, 1);
    }
    warm = 1 - dark;
    const dw = rectDist(x, y, WINDOW);
    cool = Math.max(0.42 * Math.exp(-dw / 90) * (y < WINDOW.y1 + 30 ? 1 : 0.6), 0.28 * Math.exp(-rectDist(x, y, DOOR_GLASS) / 60));
    if (dw === 0) cool = 1;
    // the upper wall: grey daylight off the ceiling, a cool half-tone (the title and the notes sit on it)
    cool = 1 - (1 - cool) * (1 - 0.5 * smooth(110, -30, y));
    // the corners and the ceiling fall away
    amb = 0.15 - 0.06 * smooth(420, 760, Math.abs(x - 470)) - 0.1 * smooth(-60, -110, y);
  } else if (s === 'top') {
    let dark = 1;
    for (const L of LAMPS) dark *= 1 - Math.exp(-(((x - L.x) / 185) ** 2)) * 0.92;
    warm = 1 - dark;
    cool = 0.55 * smooth(240, 90, x);
    amb = 0.16;
  } else if (s === 'front') {
    // the face turns away from the lamps: only spill, strongest just under the lip, the window's cool on the left end
    let dark = 1;
    for (const L of LAMPS) dark *= 1 - 0.3 * Math.exp(-(((x - L.x) / 220) ** 2));
    warm = (1 - dark) * smooth(600, 470, y);
    cool = 0.28 * smooth(320, 100, x);
    amb = 0.27 - 0.06 * smooth(520, 600, y);
  } else {
    // the floor: dark under the counter's lee and toward us; the lamps' spill where the grocer stands at the board and
    // a little round the counter's ends; the window's cool on the boards at the left
    const L2 = LAMPS[1]!;
    const L1 = LAMPS[0]!;
    warm = 0.62 * Math.exp(-(((x - (L2.x + 140)) / 150) ** 2) - (((y - 552) / 50) ** 2));
    warm = 1 - (1 - warm) * (1 - 0.3 * Math.exp(-(((x - (L1.x - 260)) / 120) ** 2) - (((y - 560) / 40) ** 2)));
    cool = 0.5 * Math.exp(-Math.hypot((x - 90) / 170, (y - 560) / 70));
    amb = 0.14 - 0.06 * smooth(590, 700, y);
  }
  return { warm: clamp(warm, 0, 1), cool: clamp(cool, 0, 1), amb: Math.max(0.02, amb) };
}

/** a grid of the glaze over a world rect: per cell the multiplier (r, g, b), the light (0 dark … 1 lit) and the edge's
 *  wander (dx, dy in world units) */
export interface Glaze {
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
  /** r, g, b, light, dx, dy per cell */
  v: Float32Array;
}

/** the shade's colour as a multiplier: warm, a little violet (the room is warm-shadowed, never grey) */
const SHADE_TINT = [1.0, 0.86, 0.83];
const WARM_TINT = [1.0, 0.92, 0.77];
const COOL_TINT = [0.83, 0.92, 1.0];
/** the darkness at which each wash of the shade begins */
const LAYERS = [0.2, 0.4, 0.57, 0.72, 0.84];

/**
 * The glaze over a world rect. `surfaceAt` says which way the surface at a point faces; `lift` brightens the light
 * there (for things that stand out of the wall into the lamps' light, 0 … 1).
 */
export function buildGlaze(x0: number, y0: number, x1: number, y1: number, step: number, surfaceAt: (x: number, y: number) => Surface, seed = 7, lift?: (x: number, y: number) => number, wobble = 0.55): Glaze {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 2);
  const ny = Math.max(2, Math.ceil((y1 - y0) / step) + 2);
  const v = new Float32Array(nx * ny * 6);
  const bloom = makeNoise2D(seed * 31 + 1);
  const bloom2 = makeNoise2D(seed * 31 + 2);
  const wx = makeNoise2D(seed * 31 + 3);
  const wy = makeNoise2D(seed * 31 + 4);
  const edge = LAYERS.map((_, k) => makeNoise2D(seed * 31 + 10 + k));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      const { warm, cool, amb } = illumination(x, y, surfaceAt(x, y));
      let light = 1 - (1 - amb) * (1 - warm) * (1 - cool * 0.78);
      if (lift) light = 1 - (1 - light) * (1 - lift(x, y));
      // wet in wet: the glaze a little thicker here, thinner there
      light = clamp(light + (bloom(x / 80, y / 70) - 0.5) * 0.03 + (bloom2(x / 19, y / 23) - 0.5) * 0.025, 0, 1);
      // the shade is laid as a few overlapping washes, not a gradient: each covers what is darker than its threshold, its
      // edge wandering, and where it dried the pigment pooled into a faint darker line
      const dk = 1 - light;
      let acc = 0;
      let rim = 0;
      for (let k = 0; k < LAYERS.length; k++) {
        const e = dk + (edge[k]!(x / 52, y / 46) - 0.5) * 0.03 + (edge[k]!(x / 9 + 40, y / 8) - 0.5) * 0.012;
        const s = smooth(LAYERS[k]! - 0.03, LAYERS[k]! + 0.03, e);
        acc += s;
        rim += s * (1 - s) * 4;
      }
      light = clamp(1 - (0.3 * dk + 0.7 * (acc / LAYERS.length) * 0.95 + 0.035 * rim), 0, 1);
      const val = 0.25 + 0.75 * Math.pow(light, 0.85);
      const d = 1 - light;
      const cw = cool * (1 - warm);
      const o = (j * nx + i) * 6;
      for (let c = 0; c < 3; c++) {
        const tint = Math.pow(SHADE_TINT[c]!, d) * Math.pow(WARM_TINT[c]!, warm) * Math.pow(COOL_TINT[c]!, cw);
        v[o + c] = val * tint;
      }
      v[o + 3] = light;
      v[o + 4] = (wx(x / 38, y / 41) - 0.5) * 2 * wobble;
      v[o + 5] = (wy(x / 41, y / 37) - 0.5) * 2 * wobble;
    }
  }
  return { x0, y0, step, nx, ny, v };
}

/** the paper's tooth at device scale, where a glaze's pigment settles (0 peak … 1 valley); tileable */
let tooth: Float32Array | null = null;
const TOOTH = 256;
function toothTile(): Float32Array {
  if (tooth) return tooth;
  const t = new Float32Array(TOOTH * TOOTH);
  const r = mulberry32(90211);
  const lattice = (cells: number) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (x: number, y: number) => {
      const fx = (x / TOOTH) * cells;
      const fy = (y / TOOTH) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const sx = fx - ix;
      const sy = fy - iy;
      const a = g[(iy % cells) * cells + (ix % cells)]!;
      const b = g[(iy % cells) * cells + ((ix + 1) % cells)]!;
      const c = g[((iy + 1) % cells) * cells + (ix % cells)]!;
      const d = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)]!;
      const ux = sx * sx * (3 - 2 * sx);
      const uy = sy * sy * (3 - 2 * sy);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  };
  const A = lattice(64);
  const B = lattice(128);
  const C = lattice(24);
  for (let y = 0; y < TOOTH; y++) {
    for (let x = 0; x < TOOTH; x++) {
      const n = A(x, y) * 0.5 + B(x, y) * 0.3 + C(x, y) * 0.2;
      t[y * TOOTH + x] = clamp((n - 0.42) * 2.6, 0, 1);
    }
  }
  tooth = t;
  return t;
}

/**
 * Glaze a canvas's pixels (rows y0 … y1): world x = wx0 + px / k (likewise y). Each pixel is sampled from a little off
 * its place (the edge's wander), multiplied by the glaze, and darkened in the paper's valleys as the shade deepens.
 * Alpha is kept (sprites stay cut out, with no rim): the samples are blended premultiplied.
 */
export function glazePixels(src: Uint8ClampedArray, dst: Uint8ClampedArray, W: number, H: number, rows: [number, number], wx0: number, wy0: number, k: number, g: Glaze, gran = 0.22): void {
  const t = toothTile();
  const { v, nx, ny, step } = g;
  for (let py = rows[0]; py < rows[1]; py++) {
    const y = wy0 + (py + 0.5) / k;
    let gy = (y - g.y0) / step;
    if (gy < 0) gy = 0;
    if (gy > ny - 1.001) gy = ny - 1.001;
    const j0 = gy | 0;
    const fy = gy - j0;
    const trow = (py & (TOOTH - 1)) * TOOTH;
    for (let px = 0; px < W; px++) {
      const x = wx0 + (px + 0.5) / k;
      let gx = (x - g.x0) / step;
      if (gx < 0) gx = 0;
      if (gx > nx - 1.001) gx = nx - 1.001;
      const i0 = gx | 0;
      const fx = gx - i0;
      const o00 = (j0 * nx + i0) * 6;
      const o10 = o00 + 6;
      const o01 = o00 + nx * 6;
      const o11 = o01 + 6;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const mr = v[o00]! * w00 + v[o10]! * w10 + v[o01]! * w01 + v[o11]! * w11;
      const mg = v[o00 + 1]! * w00 + v[o10 + 1]! * w10 + v[o01 + 1]! * w01 + v[o11 + 1]! * w11;
      const mb = v[o00 + 2]! * w00 + v[o10 + 2]! * w10 + v[o01 + 2]! * w01 + v[o11 + 2]! * w11;
      const lt = v[o00 + 3]! * w00 + v[o10 + 3]! * w10 + v[o01 + 3]! * w01 + v[o11 + 3]! * w11;
      const dx = (v[o00 + 4]! * w00 + v[o10 + 4]! * w10 + v[o01 + 4]! * w01 + v[o11 + 4]! * w11) * k;
      const dy = (v[o00 + 5]! * w00 + v[o10 + 5]! * w10 + v[o01 + 5]! * w01 + v[o11 + 5]! * w11) * k;
      // the sample, a little off (bilinear, premultiplied so cut-out edges keep no rim)
      let sx = px + dx;
      let sy = py + dy;
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx > W - 1.001) sx = W - 1.001;
      if (sy > H - 1.001) sy = H - 1.001;
      const a0 = sx | 0;
      const b0 = sy | 0;
      const ax = sx - a0;
      const by = sy - b0;
      const p00 = (b0 * W + a0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + W * 4;
      const p11 = p01 + 4;
      const q00 = (1 - ax) * (1 - by) * src[p00 + 3]!;
      const q10 = ax * (1 - by) * src[p10 + 3]!;
      const q01 = (1 - ax) * by * src[p01 + 3]!;
      const q11 = ax * by * src[p11 + 3]!;
      const a = q00 + q10 + q01 + q11;
      const o = (py * W + px) * 4;
      if (a < 0.5) {
        dst[o] = 0;
        dst[o + 1] = 0;
        dst[o + 2] = 0;
        dst[o + 3] = 0;
        continue;
      }
      const ia = 1 / a;
      // the pigment that settles in the tooth: only in the shade, and more the deeper it is
      const gr = 1 - gran * (1 - lt) * t[trow + (px & (TOOTH - 1))]!;
      dst[o] = (src[p00]! * q00 + src[p10]! * q10 + src[p01]! * q01 + src[p11]! * q11) * ia * mr * gr;
      dst[o + 1] = (src[p00 + 1]! * q00 + src[p10 + 1]! * q10 + src[p01 + 1]! * q01 + src[p11 + 1]! * q11) * ia * mg * gr;
      dst[o + 2] = (src[p00 + 2]! * q00 + src[p10 + 2]! * q10 + src[p01 + 2]! * q01 + src[p11 + 2]! * q11) * ia * mb * gr;
      dst[o + 3] = a;
    }
  }
}

/** glaze a whole sprite canvas in place (world box at its corner, k px per world unit) */
export function glazeSprite(cv: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, k: number, surfaceAt: (x: number, y: number) => Surface, seed: number, lift?: (x: number, y: number) => number, gran = 0.22, wobble = 0.5): void {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  if (W < 2 || H < 2) return;
  const g = buildGlaze(box.x - 4, box.y - 4, box.x + box.w + 4, box.y + box.h + 4, 3, surfaceAt, seed, lift, wobble);
  const img = ctx.getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  glazePixels(img.data, out.data, W, H, [0, H], box.x, box.y, k, g, gran);
  ctx.putImageData(out, 0, 0);
}
