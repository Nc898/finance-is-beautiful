/**
 * Shared painting pieces for the vine scene: autumn palettes, the autumn foliage clump sprite, small wash
 * helpers, and the wind. Everything here runs at build time except `wind`.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, makeCanvas, rgba, tracePoly, xform } from '../../scene/watercolor';

export type Pt = [number, number];

export const PAPER = '#FBF6EA';
export const INK = '#3A2A20';

export const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/** a lumpy closed blob (flat polygon) */
export function blob(cx: number, cy: number, rx: number, ry: number, rnd: Rand, n = 14, jit = 0.2): number[] {
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + (rnd.next() - 0.5) * 2 * jit;
    o.push(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j);
  }
  return o;
}

/** layered translucent washes of one polygon (each re-deformed so the edge builds up irregularly) */
export function glaze(ctx: CanvasRenderingContext2D, poly: number[], color: string, alpha: number, rnd: Rand, n = 3, amp = 0.04, levels = 2): void {
  ctx.fillStyle = rgba(color, alpha);
  for (let i = 0; i < n; i++) {
    tracePoly(ctx, deform(poly, rnd, levels, amp));
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ wind */

/** a smooth, gusty breeze in -1…1 that is the same for every user of it (the only time-dependent art input) */
export function wind(t: number): number {
  return 0.55 * Math.sin(t * 0.62) + 0.3 * Math.sin(t * 1.37 + 1.3) + 0.15 * Math.sin(t * 2.9 + 4.1);
}
/** local sway at a place (phase differs by position so the breeze rolls across the picture) */
export function sway(t: number, x: number, ph = 0): number {
  return 0.6 * Math.sin(t * 1.15 + x * 0.011 + ph) + 0.4 * Math.sin(t * 2.3 + x * 0.019 + ph * 1.7) + wind(t) * 0.9;
}

/* ------------------------------------------------------------------ autumn foliage */

export interface FoliagePal {
  base: string;
  baseA: number;
  mid: string;
  deep: string;
  light: string;
  dabs: [string[], string[], string[]];
  edge: string;
}

export const FOLIAGE: Record<string, FoliagePal> = {
  gold: {
    base: '#E8B94E', baseA: 0.2, mid: '#D08A2C', deep: '#94562A', light: '#F8E08C',
    dabs: [['#F8E08C', '#F2CC5E', '#FBEAA6'], ['#E5A843', '#DB9530', '#EDBC58'], ['#B8702A', '#A25C26', '#C98836']],
    edge: '#7D4A22',
  },
  amber: {
    base: '#E39B3A', baseA: 0.2, mid: '#C96F28', deep: '#82431F', light: '#F6C77E',
    dabs: [['#F6C77E', '#F0B25A', '#F9D698'], ['#E08A34', '#D67A2A', '#E99B48'], ['#A8582A', '#904A24', '#B96A30']],
    edge: '#74401E',
  },
  rust: {
    base: '#CB6B3C', baseA: 0.2, mid: '#A94D2C', deep: '#6E3026', light: '#EBA472',
    dabs: [['#EBA472', '#E48D58', '#F0B684'], ['#C8663A', '#B9572F', '#D27546'], ['#8A3C2A', '#763224', '#9A4A32']],
    edge: '#5C2A22',
  },
  crimson: {
    base: '#C24A3E', baseA: 0.2, mid: '#9C3232', deep: '#5E2030', light: '#EA8466',
    dabs: [['#EA8466', '#E06A54', '#F09A7A'], ['#BC4036', '#AA3430', '#C95646'], ['#7C2A32', '#682430', '#8E3638']],
    edge: '#521C2C',
  },
  olive: {
    base: '#B9B24E', baseA: 0.2, mid: '#8C9240', deep: '#4F5E34', light: '#DCD97C',
    dabs: [['#DCD97C', '#CDCB66', '#E8E492'], ['#A6A844', '#929A3C', '#B5B452'], ['#667A38', '#566A34', '#728640']],
    edge: '#3F5230',
  },
  ever: {
    base: '#4D7B59', baseA: 0.24, mid: '#2F5B49', deep: '#1D3D37', light: '#7FA67C',
    dabs: [['#6E9A70', '#5F8D68', '#7FA67C'], ['#3C6B54', '#33604C', '#457A5C'], ['#1F4538', '#1A3C34', '#255044']],
    edge: '#17342E',
  },
};
export const FOLIAGE_KINDS = ['gold', 'amber', 'rust', 'crimson', 'olive', 'ever'] as const;
export type FoliageKind = (typeof FOLIAGE_KINDS)[number];

/**
 * One autumn foliage clump: a cloud-like lobed silhouette, a lit upper-left glaze, deeper pigment sunk to the
 * lower right, wet-in-wet blooms, soft leaf dabs, a broken dab fringe, a few paper holes and granulation. The
 * pivot (where the branch enters) is at (0.5 W, 0.82 H).
 */
export function makeAutumnClump(seed: number, W: number, H: number, kind: FoliageKind): HTMLCanvasElement {
  const pal = FOLIAGE[kind]!;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const u = W / 100;
  const cx = W * 0.5;
  const cy = H * 0.6;
  const N = 24;
  const lobes = rnd.int(5, 8);
  const ph = rnd.range(0, 6.28);
  const ph2 = rnd.range(0, 6.28);
  const base: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const rr = 1 + 0.15 * Math.sin(lobes * th + ph) + 0.08 * Math.sin(lobes * 2 * th + ph2) + 0.09 * Math.sin(2 * th + ph * 0.7) + 0.05 * Math.sin(3 * th + ph2);
    base.push(cx + Math.sign(c) * Math.pow(Math.abs(c), 0.8) * W * 0.33 * rr, cy + Math.sign(s) * Math.pow(Math.abs(s), 0.85) * (s < 0 ? 0.4 * H : 0.28 * H) * rr);
  }
  const body = deform(base, rnd, 3, 0.1);
  const inBody = (x: number, y: number) => {
    let inside = false;
    const n = body.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = body[2 * i]!, yi = body[2 * i + 1]!, xj = body[2 * j]!, yj = body[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const top = H * 0.12;
  const bot = H * 0.96;
  const zone = (y: number) => {
    const t = clamp((y - top) / (bot - top), 0, 1);
    return t < 0.3 ? 0 : t < 0.62 ? 1 : 2;
  };
  const wash = (poly: number[], color: string, a: number, count: number, amp: number, op: GlobalCompositeOperation = 'source-over') => {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = rgba(color, a);
    for (let i = 0; i < count; i++) {
      tracePoly(ctx, deform(poly, rnd, 2, amp));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  wash(body, pal.base, pal.baseA, 4, 0.045);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const g = ctx.createLinearGradient(W * 0.2, H * 0.1, W * 0.62, H * 0.62);
  g.addColorStop(0, rgba(pal.light, 0.62));
  g.addColorStop(0.5, rgba(pal.light, 0.24));
  g.addColorStop(1, rgba(pal.light, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  wash(xform(body, cx, cy, 0.9, 0.82, 0.035 * W, 0.07 * H), pal.mid, 0.1, 5, 0.06, 'multiply');
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  wash(xform(body, cx, cy + 0.2 * H, 1.05, 0.6, 0, 0.06 * H), pal.deep, 0.13, 6, 0.17, 'multiply');
  for (let i = 0; i < 5; i++) {
    const bx = rnd.range(0.22, 0.78) * W;
    const by = rnd.range(0.2, 0.8) * H;
    const br = rnd.range(9, 20) * u;
    const bl: number[] = [];
    for (let k = 0; k < 8; k++) bl.push(bx + Math.cos(k * 0.785) * br * rnd.range(0.7, 1.2), by + Math.sin(k * 0.785) * br * 0.75 * rnd.range(0.7, 1.2));
    const dark = by > H * 0.5 || rnd.chance(0.3);
    ctx.globalCompositeOperation = dark ? 'multiply' : 'source-over';
    ctx.fillStyle = dark ? rgba(pal.deep, 0.08) : rgba(pal.light, 0.12);
    for (let q = 0; q < 3; q++) {
      tracePoly(ctx, deform(bl, rnd, 3, 0.18));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba(pal.edge, 0.12);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (2.2 + i * 1.5) * u;
    tracePoly(ctx, deform(body, rnd, 1, 0.02));
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const flow = rnd.range(-0.7, -0.2) * (rnd.chance(0.5) ? 1 : -1) - 0.3;
  for (let i = 0; i < 56; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 10; tries++) {
      x = rnd.range(0.12 * W, 0.88 * W);
      y = rnd.range(top, bot);
      if (inBody(x, y)) break;
    }
    const L = rnd.range(7, 21) * u;
    ctx.fillStyle = rgba(rnd.pick(pal.dabs[zone(y)]!), rnd.range(0.1, 0.24));
    almond(ctx, x, y, flow + rnd.gauss() * 0.7, L, L * 0.42, rnd.gauss() * 0.4 * u);
    ctx.fill();
  }
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = rgba(pal.light, rnd.range(0.22, 0.44));
    const L = rnd.range(6, 14) * u;
    almond(ctx, rnd.range(0.16, 0.55) * W, rnd.range(0.14, 0.4) * H, flow + rnd.gauss() * 0.5, L, L * 0.4);
    ctx.fill();
  }
  ctx.restore();
  // feathered paper holes
  for (let i = 0, n = rnd.int(2, 4); i < n; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = rnd.range(0.2, 0.8) * W;
      y = rnd.range(0.2, 0.66) * H;
      if (inBody(x, y)) break;
    }
    const r = rnd.range(1.4, 4.2) * u;
    const hole = deform([x - r, y - r * 0.6, x + r * 0.2, y - r, x + r, y - r * 0.2, x + r * 0.5, y + r * 0.8, x - r * 0.7, y + r * 0.6], rnd, 3, 0.16);
    ctx.globalCompositeOperation = 'destination-out';
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      tracePoly(ctx, xform(hole, x, y, 1 + q * 0.14, 1 + q * 0.14));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // broken dab fringe straddling the outline
  const nv = body.length / 2;
  for (let i = 0; i < 32; i++) {
    const k = rnd.int(0, nv - 1);
    const px = body[2 * k]!;
    const py = body[2 * k + 1]!;
    let nx = px - cx;
    let ny = (py - cy) * 1.3;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const off = rnd.range(-1.5, 4.5) * u;
    const L = rnd.range(5, 12) * u;
    ctx.fillStyle = rgba(rnd.pick(pal.dabs[zone(py + ny * off)]!), rnd.range(0.4, 0.75));
    almond(ctx, px + nx * off, py + ny * off, Math.atan2(ny, nx) + (rnd.chance(0.5) ? Math.PI / 2 : 0) + rnd.gauss() * 0.8, L, L * 0.4, rnd.gauss() * 0.35 * u);
    ctx.fill();
  }
  grain(cv, seed, 1);
  return cv;
}

/** paper tooth over a finished sprite: noise modulates alpha and value, like pigment settling in the grain */
export function grain(cv: HTMLCanvasElement, seed: number, amt = 1, cellPx = 4): void {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  if (W < 2 || H < 2) return;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const hsh = (x: number, y: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const cs = Math.max(1, Math.round(cellPx));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = d[i + 3]!;
      if (a === 0) continue;
      const lo = hsh(Math.floor(x / cs) + 7, Math.floor(y / cs) + 3);
      const hi = hsh(x, y);
      const nn = lo * 0.55 + hi * 0.45;
      const gr = nn - 0.5;
      d[i + 3] = clamp(a * (1 + gr * 0.55 * amt) - (nn < 0.22 ? 10 * amt : 0), 0, 255);
      const sh = 1 - gr * 0.12 * amt;
      d[i] = clamp(d[i]! * sh, 0, 255);
      d[i + 1] = clamp(d[i + 1]! * sh, 0, 255);
      d[i + 2] = clamp(d[i + 2]! * sh, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** a sprite with its pivot (world units) */
export interface Sprite {
  cv: HTMLCanvasElement;
  /** world size */
  w: number;
  h: number;
  /** pivot inside the sprite, world units */
  px: number;
  py: number;
}

/** a blank sprite canvas whose context works in world units with the pivot at (px, py) */
export function newSprite(w: number, h: number, px: number, py: number, q: number): { sp: Sprite; ctx: CanvasRenderingContext2D } {
  const cv = makeCanvas(Math.ceil(w * q), Math.ceil(h * q));
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(q, 0, 0, q, px * q, py * q);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { sp: { cv, w: cv.width / q, h: cv.height / q, px, py }, ctx };
}

export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, k = 1): void {
  ctx.drawImage(s.cv, x - s.px * k, y - s.py * k, s.w * k, s.h * k);
}
