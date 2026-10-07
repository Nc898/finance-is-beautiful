/** Seeded PRNG utilities. All randomness lives in generation; render never draws from these. */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...n: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of n) {
    h ^= (v | 0) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rand {
  private r: Rng;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  next(): number {
    return this.r();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.r();
  }
  int(a: number, b: number): number {
    return Math.floor(a + (b - a + 1) * this.r());
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  sign(): 1 | -1 {
    return this.r() < 0.5 ? -1 : 1;
  }
  gauss(): number {
    let u = 0;
    for (let i = 0; i < 4; i++) u += this.r();
    return (u - 2) * 1.7320508; // ~N(0,1)
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)]!;
  }
}

/** Smooth 2-D value noise (deterministic, seedable). Returns 0…1. */
export function makeNoise2D(seed: number): (x: number, y: number) => number {
  const size = 256;
  const g = new Float32Array(size * size);
  const r = mulberry32(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (ix: number, iy: number) => g[((iy & 255) << 8) | (ix & 255)]!;
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
