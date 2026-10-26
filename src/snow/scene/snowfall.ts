/**
 * Ambient snow: gentle snowfall in three depths (far: fine and slow, ending at the distant ridge; middle; near: large
 * soft flakes that sway), a little powder blown off the crest now and then, and a puff shed from a pine bough now and
 * then. Every flake is a pure function of the clock (its own phase and cycle), so nothing pops: a flake fades in high
 * up, falls, settles on the ground and fades away there. The sprite is cached; no painting here.
 */
import { Rand, clamp } from '../../scene/prng';
import { crestLine } from './layout';

interface Flake {
  x0: number;
  vx: number;
  v: number;
  amp: number;
  freq: number;
  ph: number;
  size: number;
  landY: number;
  off: number;
  alpha: number;
  fall: number;
  cycle: number;
}

const LINGER = 1.6;

const hash01 = (a: number, b: number): number => {
  let h = (Math.imul(a + 1013904223, 1664525) + Math.imul(b + 7, 22695477)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Snowfall {
  private flakes: Flake[] = [];
  private yTop: number;
  constructor(
    private readonly sprite: HTMLCanvasElement,
    private readonly puffSpots: Array<{ x: number; y: number }>,
    xmin: number,
    xmax: number,
    ymax: number,
    viewTop: number,
  ) {
    const rnd = new Rand(6151);
    this.yTop = Math.min(-20, viewTop - 24);
    const wide = (xmax - xmin) / 1000;
    const make = (n: number, o: { v: [number, number]; size: [number, number]; land: [number, number]; amp: number; alpha: number }) => {
      for (let i = 0; i < Math.round(n * wide); i++) {
        const v = rnd.range(o.v[0], o.v[1]);
        const landY = rnd.range(o.land[0], o.land[1]);
        const fall = (landY - this.yTop) / v;
        this.flakes.push({
          x0: rnd.range(xmin - 60, xmax + 20),
          vx: rnd.range(1, 4) * (v / 20),
          v,
          amp: o.amp * rnd.range(0.5, 1.2),
          freq: rnd.range(0.5, 1.3),
          ph: rnd.range(0, 6.28),
          size: rnd.range(o.size[0], o.size[1]),
          landY,
          off: rnd.range(0, 1),
          alpha: o.alpha * rnd.range(0.7, 1),
          fall,
          cycle: fall + LINGER,
        });
      }
    };
    make(150, { v: [10, 15], size: [0.8, 1.3], land: [262, 318], amp: 0.9, alpha: 0.78 });
    make(80, { v: [21, 30], size: [1.4, 2.2], land: [322, 560], amp: 2.4, alpha: 0.9 });
    make(30, { v: [40, 58], size: [2.6, 3.8], land: [545, ymax + 8], amp: 5.2, alpha: 0.95 });
  }

  /** (x0, x1, y1: the part of the world on screen, so flakes outside it cost nothing) */
  draw(ctx: CanvasRenderingContext2D, t: number, x0 = -1e9, x1 = 1e9, y1 = 1e9): void {
    const sp = this.sprite;
    for (const f of this.flakes) {
      const age = (t + f.off * f.cycle) % f.cycle;
      let a = f.alpha;
      let y: number;
      let k = 1;
      const x = f.x0 + f.vx * Math.min(age, f.fall) + f.amp * Math.sin(f.freq * (t + f.off * 40) + f.ph);
      if (age < f.fall) {
        y = this.yTop + f.v * age;
        const fade = Math.min(1, age / Math.max(0.5, 44 / f.v));
        a *= fade;
      } else {
        // settled: it lies where it landed and melts into the snow
        const k2 = (age - f.fall) / LINGER;
        y = f.landY;
        a *= 0.55 * (1 - k2);
        k = 1 - 0.3 * k2;
      }
      if (a < 0.02 || x < x0 - 8 || x > x1 + 8 || y > y1 + 8) continue;
      ctx.globalAlpha = a;
      const S = f.size * k;
      ctx.drawImage(sp, x - S, y - S, S * 2, S * 2);
    }
    // powder off the crest: every so often a gust lifts a little along the ridge and drifts away
    const GP = 13.7;
    const gt = t + 5;
    const g = Math.floor(gt / GP);
    const ga = gt - g * GP;
    if (ga < 6) {
      const gx = 70 + hash01(g, 1) * 860;
      const cy = crestLine(gx);
      for (let j = 0; j < 26; j++) {
        const delay = (j / 26) * 2.2;
        const age = ga - delay;
        const life = 2.2 + hash01(g, 100 + j) * 1.6;
        if (age < 0 || age > life) continue;
        const e = age / life;
        const vx = 20 + hash01(g, 200 + j) * 26;
        const x = gx + (hash01(g, 300 + j) - 0.3) * 40 + vx * age;
        const y = cy - 2 - (hash01(g, 400 + j) * 5 + 9 * Math.sin(Math.PI * Math.min(1, e * 1.2)) * hash01(g, 500 + j)) + 14 * e * e;
        ctx.globalAlpha = 0.8 * Math.sin(Math.PI * e) ** 0.7;
        const S = 0.9 + hash01(g, 600 + j) * 1.3;
        ctx.drawImage(sp, x - S, y - S, S * 2, S * 2);
      }
    }
    // a pine lets go a puff of snow
    if (this.puffSpots.length) {
      const PP = 17;
      const pt = t + 9;
      const pg = Math.floor(pt / PP);
      const pa = pt - pg * PP;
      if (pa < 3.6) {
        const spot = this.puffSpots[Math.floor(hash01(pg, 9) * this.puffSpots.length) % this.puffSpots.length]!;
        const e = pa / 3.6;
        // the cloud
        const S = 4 + 12 * Math.sqrt(e);
        ctx.globalAlpha = 0.5 * Math.sin(Math.PI * Math.min(1, e * 1.1)) ** 0.8;
        ctx.drawImage(sp, spot.x - S, spot.y - S - e * 5, S * 2, S * 2);
        // the lumps falling from it
        for (let j = 0; j < 9; j++) {
          const age = pa - j * 0.07;
          const life = 1.6 + hash01(pg, 30 + j) * 1.2;
          if (age < 0 || age > life) continue;
          const ee = age / life;
          const x = spot.x + (hash01(pg, 40 + j) - 0.5) * 16 + (hash01(pg, 50 + j) - 0.3) * 8 * age;
          const y = spot.y + 4 + 32 * age * age * 0.45 + 12 * age;
          ctx.globalAlpha = 0.85 * (1 - ee ** 2) * Math.min(1, age * 6);
          const s2 = 0.9 + hash01(pg, 60 + j) * 1.4;
          ctx.drawImage(sp, x - s2, y - s2, s2 * 2, s2 * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    void clamp;
  }
}
