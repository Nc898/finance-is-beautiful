/**
 * The grocer's hand: a small set of hand-made stroke paths (digits, "$", ".", the apostrophe and the letters of the
 * six item names, the title and "Total"), not a font. A glyph is a list of strokes in em units (x right, y UP, the
 * baseline at 0, x-height ≈ 0.52, cap height 1); the writing is slightly slanted and a little old-fashioned (open
 * round forms, a tick on the one, tails that run on). Laying out a text gives every glyph
 * its own small variation (scale, baseline, slant, wander of each point), deterministic for the same seed and text,
 * so repeated digits are never clones; the result is one continuous path of pen-down strokes and pen-up moves with
 * a weighted length, from which the chalk's dabs and the chalk tip's position at any progress are taken.
 */
import { Rand, hashSeed, makeNoise2D } from '../../scene/prng';
import { smoothPoly, type Pt } from '../../river/scene/boatInk';

interface Glyph {
  adv: number;
  strokes: number[][];
}

const G: Record<string, Glyph> = {
  '0': { adv: 0.6, strokes: [[0.28, 0.97, 0.1, 0.8, 0.05, 0.48, 0.1, 0.18, 0.28, 0, 0.46, 0.18, 0.52, 0.5, 0.47, 0.8, 0.28, 0.97, 0.22, 0.99]] },
  '1': { adv: 0.46, strokes: [[0.08, 0.74, 0.28, 0.99, 0.3, 0.5, 0.29, 0.02]] },
  '2': { adv: 0.58, strokes: [[0.06, 0.78, 0.16, 0.95, 0.34, 0.97, 0.47, 0.82, 0.42, 0.62, 0.22, 0.32, 0.05, 0.04, 0.3, 0.07, 0.52, 0.04]] },
  '3': { adv: 0.56, strokes: [[0.07, 0.88, 0.22, 0.98, 0.4, 0.93, 0.43, 0.76, 0.3, 0.58, 0.19, 0.54, 0.34, 0.5, 0.48, 0.36, 0.46, 0.15, 0.3, 0.01, 0.12, 0.03, 0.04, 0.17]] },
  '4': {
    adv: 0.6,
    strokes: [
      [0.4, 0.99, 0.04, 0.3, 0.52, 0.3],
      [0.38, 0.8, 0.36, 0],
    ],
  },
  '5': { adv: 0.56, strokes: [[0.46, 0.97, 0.14, 0.97, 0.1, 0.58, 0.28, 0.64, 0.46, 0.52, 0.5, 0.3, 0.4, 0.08, 0.22, 0, 0.06, 0.1]] },
  '6': { adv: 0.56, strokes: [[0.44, 0.95, 0.24, 0.88, 0.1, 0.6, 0.06, 0.3, 0.14, 0.07, 0.3, 0, 0.46, 0.12, 0.48, 0.34, 0.34, 0.5, 0.18, 0.44, 0.08, 0.3]] },
  '7': { adv: 0.54, strokes: [[0.05, 0.94, 0.3, 0.98, 0.52, 0.95, 0.38, 0.55, 0.24, 0]] },
  '8': { adv: 0.56, strokes: [[0.28, 0.5, 0.1, 0.66, 0.12, 0.88, 0.28, 0.98, 0.44, 0.88, 0.46, 0.66, 0.28, 0.5, 0.07, 0.32, 0.07, 0.1, 0.26, 0, 0.46, 0.1, 0.48, 0.32, 0.28, 0.5]] },
  '9': { adv: 0.56, strokes: [[0.46, 0.7, 0.38, 0.92, 0.22, 0.98, 0.08, 0.82, 0.1, 0.6, 0.26, 0.5, 0.42, 0.58, 0.48, 0.78, 0.45, 0.5, 0.35, 0.2, 0.2, 0.03, 0.06, 0.1]] },
  $: {
    adv: 0.5,
    strokes: [
      [0.44, 0.8, 0.3, 0.9, 0.12, 0.82, 0.14, 0.62, 0.3, 0.5, 0.44, 0.36, 0.42, 0.14, 0.24, 0.06, 0.08, 0.18],
      [0.27, 1.1, 0.26, -0.1],
    ],
  },
  '.': { adv: 0.24, strokes: [[0.1, 0, 0.15, 0.05, 0.1, 0.1, 0.05, 0.05, 0.1, 0]] },
  '~': { adv: 0.5, strokes: [[0.03, 0.3, 0.12, 0.5, 0.26, 0.44, 0.38, 0.3, 0.5, 0.42, 0.55, 0.52]] },
  "'": { adv: 0.2, strokes: [[0.08, 1, 0.04, 0.72]] },
  a: { adv: 0.52, strokes: [[0.38, 0.46, 0.2, 0.52, 0.07, 0.36, 0.09, 0.13, 0.24, 0.02, 0.38, 0.16, 0.4, 0.5, 0.4, 0.14, 0.44, 0.04, 0.54, 0.02]] },
  b: {
    adv: 0.5,
    strokes: [
      [0.1, 1.02, 0.08, 0.6, 0.07, 0],
      [0.07, 0.3, 0.2, 0.5, 0.38, 0.46, 0.46, 0.26, 0.36, 0.04, 0.18, 0.04, 0.07, 0.14],
    ],
  },
  c: { adv: 0.44, strokes: [[0.42, 0.42, 0.28, 0.52, 0.1, 0.4, 0.06, 0.2, 0.16, 0.04, 0.34, 0.04, 0.44, 0.14]] },
  d: {
    adv: 0.52,
    strokes: [
      [0.4, 0.46, 0.22, 0.52, 0.08, 0.36, 0.1, 0.12, 0.26, 0.02, 0.4, 0.14],
      [0.42, 1.02, 0.4, 0.5, 0.4, 0.1, 0.5, 0.02],
    ],
  },
  e: { adv: 0.46, strokes: [[0.08, 0.28, 0.38, 0.3, 0.42, 0.42, 0.3, 0.52, 0.14, 0.46, 0.07, 0.28, 0.12, 0.08, 0.28, 0.02, 0.42, 0.1]] },
  f: {
    adv: 0.34,
    strokes: [
      [0.46, 0.95, 0.32, 1.02, 0.2, 0.9, 0.18, 0.6, 0.17, 0, 0.14, -0.38],
      [0.03, 0.52, 0.38, 0.54],
    ],
  },
  g: {
    adv: 0.5,
    strokes: [
      [0.4, 0.46, 0.22, 0.52, 0.08, 0.36, 0.1, 0.14, 0.26, 0.04, 0.4, 0.16, 0.4, 0.5],
      [0.4, 0.5, 0.42, 0.1, 0.38, -0.3, 0.2, -0.44, 0.06, -0.34],
    ],
  },
  h: {
    adv: 0.5,
    strokes: [
      [0.08, 1.02, 0.07, 0.5, 0.06, 0],
      [0.07, 0.34, 0.2, 0.5, 0.36, 0.46, 0.42, 0.3, 0.42, 0],
    ],
  },
  i: {
    adv: 0.22,
    strokes: [
      [0.12, 0.5, 0.1, 0],
      [0.14, 0.77, 0.15, 0.81],
    ],
  },
  k: {
    adv: 0.46,
    strokes: [
      [0.08, 1.02, 0.07, 0],
      [0.42, 0.5, 0.1, 0.22],
      [0.2, 0.3, 0.44, 0],
    ],
  },
  l: { adv: 0.26, strokes: [[0.1, 1.02, 0.08, 0.3, 0.14, 0.05, 0.26, 0.02]] },
  n: {
    adv: 0.48,
    strokes: [
      [0.08, 0.5, 0.07, 0],
      [0.07, 0.32, 0.2, 0.5, 0.36, 0.46, 0.4, 0.3, 0.4, 0],
    ],
  },
  o: { adv: 0.46, strokes: [[0.24, 0.5, 0.08, 0.36, 0.06, 0.16, 0.2, 0.02, 0.36, 0.08, 0.42, 0.28, 0.36, 0.46, 0.24, 0.5, 0.18, 0.52]] },
  r: {
    adv: 0.38,
    strokes: [
      [0.08, 0.5, 0.07, 0],
      [0.07, 0.3, 0.18, 0.48, 0.36, 0.5],
    ],
  },
  s: { adv: 0.4, strokes: [[0.38, 0.44, 0.24, 0.52, 0.1, 0.44, 0.12, 0.3, 0.3, 0.24, 0.4, 0.12, 0.28, 0.02, 0.1, 0.06]] },
  t: {
    adv: 0.36,
    strokes: [
      [0.18, 0.84, 0.16, 0.2, 0.24, 0.03, 0.38, 0.06],
      [0.04, 0.52, 0.36, 0.52],
    ],
  },
  u: {
    adv: 0.5,
    strokes: [
      [0.07, 0.5, 0.08, 0.18, 0.2, 0.03, 0.34, 0.1, 0.4, 0.3],
      [0.41, 0.5, 0.4, 0.15, 0.46, 0.02],
    ],
  },
  w: { adv: 0.62, strokes: [[0.04, 0.5, 0.1, 0.08, 0.2, 0.02, 0.27, 0.3, 0.34, 0.08, 0.44, 0.02, 0.52, 0.2, 0.56, 0.5]] },
  B: {
    adv: 0.55,
    strokes: [
      [0.1, 1, 0.08, 0.5, 0.07, 0],
      [0.1, 1, 0.36, 0.98, 0.46, 0.84, 0.36, 0.6, 0.1, 0.54, 0.4, 0.5, 0.5, 0.3, 0.42, 0.08, 0.2, 0, 0.07, 0.02],
    ],
  },
  C: { adv: 0.56, strokes: [[0.54, 0.86, 0.4, 0.98, 0.2, 0.94, 0.07, 0.7, 0.06, 0.34, 0.2, 0.06, 0.4, 0.02, 0.52, 0.14]] },
  E: { adv: 0.5, strokes: [[0.5, 0.96, 0.3, 1, 0.12, 0.94, 0.08, 0.6, 0.3, 0.54, 0.1, 0.5, 0.08, 0.2, 0.2, 0.04, 0.4, 0.02, 0.52, 0.1]] },
  F: {
    adv: 0.5,
    strokes: [
      [0.5, 0.98, 0.28, 1, 0.1, 0.98, 0.08, 0.5, 0.07, 0],
      [0.06, 0.58, 0.4, 0.6],
    ],
  },
  T: {
    adv: 0.56,
    strokes: [
      [0.04, 0.96, 0.3, 1, 0.56, 0.97],
      [0.3, 1, 0.28, 0.5, 0.27, 0],
    ],
  },
};

/** the characters the hand knows */
export const HAND_CHARS = Object.keys(G).join('');

export interface Laid {
  /** each stroke as a flat world polyline, in writing order */
  strokes: number[][];
  /** the text's world extent */
  x0: number;
  x1: number;
  /** baseline y and the size it was laid out at */
  y: number;
  size: number;
  /** weighted path length (pen-up moves count a little) */
  len: number;
  /** the path as segments for the tip: [x0, y0, x1, y1, s0, s1] each */
  segs: number[];
  /** chalk dabs: x, y, r, alpha, u (progress 0 … 1, which writes it) */
  dabs: Float32Array;
  nDabs: number;
}

const EMPTY: Laid = { strokes: [], x0: 0, x1: 0, y: 0, size: 1, len: 1, segs: [], dabs: new Float32Array(0), nDabs: 0 };

export interface LayoutSpec {
  text: string;
  /** align point: x of the left, right or centre, per `align` */
  x: number;
  y: number;
  size: number;
  align: 'left' | 'right' | 'center';
  seed: number;
  /** chalk pressure (line weight) */
  weight?: number;
}

/** how wide the text lays out at a size (without the per-glyph wander): for the layout to find its left edge */
function nominalWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += (G[ch]?.adv ?? 0.3) + 0.07;
  return w - 0.07;
}

export function layoutText(spec: LayoutSpec): Laid {
  const { text, size } = spec;
  if (!text) return { ...EMPTY, y: spec.y, size, x0: spec.x, x1: spec.x };
  const base = hashSeed(spec.seed, ...Array.from(text, (c) => c.charCodeAt(0)));
  const line = new Rand(base);
  // the line as a whole: a faint tilt and sag, as a hand that has written this line a thousand times
  const tilt = line.range(-0.012, 0.012);
  const sag = line.range(-0.02, 0.02);
  const width = nominalWidth(text) * size;
  const left = spec.align === 'left' ? spec.x : spec.align === 'right' ? spec.x - width : spec.x - width / 2;
  const slant0 = 0.17 + line.range(-0.03, 0.03);
  const strokes: number[][] = [];
  let pen = 0;
  let idx = 0;
  const chars = Array.from(text);
  for (const ch of chars) {
    const gl = G[ch];
    const r = new Rand(hashSeed(base, idx, ch.charCodeAt(0)));
    idx++;
    if (!gl) {
      pen += 0.3;
      continue;
    }
    const sc = 1 + r.range(-0.06, 0.06);
    const dy = r.range(-0.035, 0.035);
    const sl = slant0 + r.range(-0.045, 0.045);
    const wob = 0.014;
    for (const st of gl.strokes) {
      const pts: Pt[] = [];
      for (let i = 0; i < st.length; i += 2) {
        const px = st[i]! * sc + r.range(-wob, wob);
        const py = st[i + 1]! * sc + dy + r.range(-wob, wob);
        const ex = left / size + pen + px + py * sl;
        const xw = ex * size;
        // the line's tilt and sag: more drift further along
        const along = (xw - left) / (width || 1);
        const yy = spec.y - py * size - (tilt * (xw - left) + sag * size * Math.sin(Math.PI * Math.min(1, Math.max(0, along))));
        pts.push([xw, yy]);
      }
      strokes.push(smoothPoly(pts, 5, false));
    }
    pen += gl.adv * sc + 0.07 + r.range(-0.025, 0.04);
  }
  return finish(strokes, spec.y, size, base, spec.weight ?? 1);
}

/** a single chalked stroke (a ruled line, a flourish) as a path of its own */
export function chalkStroke(pts: number[], y: number, size: number, seed: number, weight = 1): Laid {
  return finish([pts], y, size, seed, weight);
}

/** from the strokes: the weighted path for the tip, and the chalk dabs (a dab every 0.4 units, wandering a hair
 *  either side, broken by a slow noise where the slate's tooth is high) */
function finish(strokes: number[][], yBase: number, size: number, base: number, wgt: number): Laid {
  const nz = makeNoise2D(base ^ 0x5bd1);
  // the path: strokes and the pen-up moves between them
  const segs: number[] = [];
  let s = 0;
  const pieces: { pts: number[]; s0: number }[] = [];
  let px = 0;
  let py = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  strokes.forEach((st, i) => {
    if (i > 0) {
      const d = Math.hypot(st[0]! - px, st[1]! - py);
      const w = d * 0.5;
      segs.push(px, py, st[0]!, st[1]!, s, s + w);
      s += w;
    }
    pieces.push({ pts: st, s0: s });
    for (let k = 0; k + 3 < st.length; k += 2) {
      const d = Math.hypot(st[k + 2]! - st[k]!, st[k + 3]! - st[k + 1]!);
      segs.push(st[k]!, st[k + 1]!, st[k + 2]!, st[k + 3]!, s, s + d);
      s += d;
    }
    for (let k = 0; k < st.length; k += 2) {
      minX = Math.min(minX, st[k]!);
      maxX = Math.max(maxX, st[k]!);
    }
    px = st[st.length - 2]!;
    py = st[st.length - 1]!;
  });
  const len = Math.max(1e-6, s);
  // the chalk: a dab every 0.4 units along each stroke, wandering a hair either side, broken by a slow noise
  const out: number[] = [];
  const r = new Rand(base ^ 0xc0ffee);
  const rad = 0.62 * wgt * (size / 18) ** 0.5;
  for (const pc of pieces) {
    const p = pc.pts;
    let acc = 0;
    let next = 0;
    let first = true;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const dx = p[k + 2]! - p[k]!;
      const dyy = p[k + 3]! - p[k + 1]!;
      const d = Math.hypot(dx, dyy);
      if (d < 1e-6) continue;
      const nx = -dyy / d;
      const ny = dx / d;
      while (next <= acc + d) {
        const f = (next - acc) / d;
        const x = p[k]! + dx * f;
        const y = p[k + 1]! + dyy * f;
        const u = (pc.s0 + next) / len;
        const q = nz(next * 0.22 + pc.s0 * 0.01, pc.s0 * 0.05);
        // dry spots: the chalk skips where the slate's tooth is high
        let a = 0.82 * (0.62 + 0.38 * r.next());
        if (q < 0.3) a *= 0.18 + 0.82 * (q / 0.3);
        if (first && next < 2) a *= 1.15;
        const off = r.gauss() * 0.16;
        out.push(x + nx * off, y + ny * off, rad * (0.78 + 0.5 * r.next()), Math.min(1, a), u);
        if (r.chance(0.16)) {
          const o2 = r.range(-1.8, 1.8);
          out.push(x + nx * o2 + r.range(-0.4, 0.4), y + ny * o2 + r.range(-0.4, 0.4), 0.22 + r.next() * 0.2, 0.28 + r.next() * 0.25, u);
        }
        next += 0.4;
      }
      acc += d;
      first = false;
    }
  }
  return { strokes, x0: minX, x1: maxX, y: yBase, size, len, segs, dabs: new Float32Array(out), nDabs: out.length / 5 };
}

/** the chalk tip's world position at progress t (0 … 1) along the whole path */
export function tipAt(l: Laid, t: number): Pt {
  const n = l.segs.length / 6;
  if (n === 0) return [l.x1, l.y];
  const s = Math.min(1, Math.max(0, t)) * l.len;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (l.segs[mid * 6 + 5]! < s) lo = mid + 1;
    else hi = mid;
  }
  const b = lo * 6;
  const s0 = l.segs[b + 4]!;
  const s1 = l.segs[b + 5]!;
  const f = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 1;
  return [l.segs[b]! + (l.segs[b + 2]! - l.segs[b]!) * f, l.segs[b + 1]! + (l.segs[b + 3]! - l.segs[b + 1]!) * f];
}
