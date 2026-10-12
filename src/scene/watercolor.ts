/**
 * Watercolor / paper generation. Everything here is pre-rendered once into offscreen canvases
 * (clump sprites, paper tile, ground, shadow, soil mound). Never called per frame.
 *
 * Technique (Tyler Hobbs style): a base polygon is deformed by recursive midpoint displacement; a wash
 * is many (3-12 %) alpha layers of independently re-deformed copies, so the edge builds up
 * irregularly and overlaps deepen like real pigment. Edge darkening = pooled pigment stroke.
 */
import { Rand, clamp } from './prng';

export const PAL = {
  paper: '#FBF6EA',
  paperShade: '#EFE5CF',
  ink: '#2F2A22',
  muted: '#6B6152',
  fresh: '#7DB343',
  lime: '#C6DA55',
  yellow: '#E6E070',
  mid: '#58A03F',
  emerald: '#1E7F5C',
  deepEmerald: '#17604A',
  gold: '#F0B429',
  coral: '#EC7357',
  sky: '#4A9AD4',
  bark: '#6B4A2F',
} as const;

const rgbCache = new Map<string, [number, number, number]>();
export function hexToRgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = (i: number) => Math.round(A[i]! + (B[i]! - A[i]!) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Recursive midpoint displacement of a closed polygon (flat [x0,y0,x1,y1,...]). */
export function deform(poly: number[], rnd: Rand, levels: number, amp: number, decay = 0.62): number[] {
  let p = poly;
  let a = amp;
  for (let l = 0; l < levels; l++) {
    const n = p.length / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = p[2 * i]!;
      const y0 = p[2 * i + 1]!;
      const j = (i + 1) % n;
      const x1 = p[2 * j]!;
      const y1 = p[2 * j + 1]!;
      out.push(x0, y0);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const d = rnd.gauss() * a * len;
      out.push((x0 + x1) / 2 - (dy / len) * d, (y0 + y1) / 2 + (dx / len) * d);
    }
    p = out;
    a *= decay;
  }
  return p;
}

export function xform(poly: number[], cx: number, cy: number, sx: number, sy: number, dx = 0, dy = 0): number[] {
  const out = new Array<number>(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    out[i] = cx + (poly[i]! - cx) * sx + dx;
    out[i + 1] = cy + (poly[i + 1]! - cy) * sy + dy;
  }
  return out;
}

export function tracePoly(ctx: CanvasRenderingContext2D, p: number[]): void {
  ctx.beginPath();
  ctx.moveTo(p[0]!, p[1]!);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  ctx.closePath();
}

export function almond(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, bend = 0): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = (c * len) / 2;
  const hy = (s * len) / 2;
  const nx = -s * wid;
  const ny = c * wid;
  const bx = -s * bend;
  const by = c * bend;
  ctx.beginPath();
  ctx.moveTo(x - hx, y - hy);
  ctx.quadraticCurveTo(x + nx * 1.1 + bx, y + ny * 1.1 + by, x + hx, y + hy);
  ctx.quadraticCurveTo(x - nx * 0.9 + bx, y - ny * 0.9 + by, x - hx, y - hy);
  ctx.closePath();
}

/** Foliage sprite classes. Tone is chosen per clump from its crown position vs. the light (upper-left). */
export type SpriteKind = 'lit' | 'mid' | 'shade' | 'back' | 'gold' | 'coral';
export const SPRITE_KINDS: SpriteKind[] = ['lit', 'mid', 'shade', 'back', 'gold', 'coral'];
export const SPRITE_POOL: Record<SpriteKind, number> = { lit: 7, mid: 6, shade: 5, back: 4, gold: 3, coral: 2 };

interface Tone {
  base: string;
  baseA: number;
  top: boolean; // lit glaze on top-left
  mid: string;
  midA: number;
  deep: string;
  deepA: number;
  bloomLight: string;
  bloomDark: string;
  dabs: [string[], string[], string[]]; // by vertical zone
  edge: string;
}
const TONES: Record<'lit' | 'mid' | 'shade' | 'back', Tone> = {
  lit: {
    base: '#B9D85C', baseA: 0.13, top: true, mid: '#6FAE45', midA: 0.07, deep: '#2E8A55', deepA: 0.085,
    bloomLight: '#E9E67E', bloomDark: '#2E8A55',
    dabs: [['#D6E26A', '#C6DA55', '#E9E67E'], ['#8CBF4C', '#7DB343', '#A5CB58'], ['#4E9A3C', '#3E8F52', '#2E8A55']],
    edge: '#2A7A4C',
  },
  mid: {
    base: '#92C257', baseA: 0.13, top: true, mid: '#4E9A3C', midA: 0.08, deep: '#1E7F5C', deepA: 0.1,
    bloomLight: '#CFE06C', bloomDark: '#1E7F5C',
    dabs: [['#B5D45A', '#A5CB58', '#C6DA55'], ['#6FAE45', '#58A03F', '#7DB343'], ['#2F8F55', '#1E7F5C', '#3E8F52']],
    edge: '#1F6B49',
  },
  shade: {
    base: '#55964F', baseA: 0.14, top: false, mid: '#277A55', midA: 0.1, deep: '#134F3E', deepA: 0.15,
    bloomLight: '#7DB86A', bloomDark: '#1B6E6A',
    dabs: [['#5F9E55', '#4E9A5A', '#6FAE5A'], ['#277A55', '#2F8A6A', '#26766A'], ['#17604A', '#1B6E6A', '#134F3E']],
    edge: '#17604A',
  },
  back: {
    base: '#4F9156', baseA: 0.13, top: false, mid: '#2A7E52', midA: 0.1, deep: '#17604A', deepA: 0.13,
    bloomLight: '#5FA06A', bloomDark: '#1B6E6A',
    dabs: [['#4E9A5A', '#3E8F52', '#5FA06A'], ['#2A7E52', '#2F8A5A', '#2A7E62'], ['#17604A', '#1B6E6A', '#1E7F5C']],
    edge: '#134F3E',
  },
};

/**
 * One foliage clump sprite. Cloud-like lobed silhouette (round underside, no flat shelf), lit pale top-left,
 * deep underside, wet-in-wet blooms, few soft leaf dabs, broken dab fringe, feathered paper holes, granulation.
 * Warm kinds add separate translucent normal-blend glazes (clean gold / coral), never multiplied over green.
 * Sprite pivot (where the branch enters) is at (0.5W, 0.82H); visible body ~0.72W x 0.84H.
 */
export function makeClumpSprite(seed: number, W: number, H: number, kind: SpriteKind): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const u = W / 100;
  const warm = kind === 'gold' || kind === 'coral';
  const tn = TONES[warm ? 'lit' : (kind as 'lit' | 'mid' | 'shade' | 'back')];
  const back = kind === 'back';
  const cx = W * 0.5;
  const cy = H * 0.6;

  // ---- outline: domed lobed cloud, rounded underside
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
    const px = Math.sign(c) * Math.pow(Math.abs(c), 0.8) * W * 0.33 * rr;
    const topS = s < 0 ? 0.4 * H : 0.28 * H;
    const py = Math.sign(s) * Math.pow(Math.abs(s), 0.85) * topS * rr;
    base.push(cx + px, cy + py);
  }
  const body = deform(base, rnd, 3, 0.1);
  const wash = (poly: number[], color: string, a: number, count: number, amp: number, op: GlobalCompositeOperation = 'source-over') => {
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = rgba(color, a);
    for (let i = 0; i < count; i++) {
      tracePoly(ctx, deform(poly, rnd, 2, amp));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
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

  // 1. base wash
  wash(body, tn.base, tn.baseA, 4, 0.045);
  // 2. lit top-left glaze
  if (tn.top) {
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    const g = ctx.createLinearGradient(W * 0.2, H * 0.1, W * 0.62, H * 0.62);
    g.addColorStop(0, 'rgba(238,232,120,0.6)');
    g.addColorStop(0.5, 'rgba(214,224,100,0.24)');
    g.addColorStop(1, 'rgba(214,224,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // 3. mid green pushed to lower-right (multiply -> overlaps deepen, greens only)
  wash(xform(body, cx, cy, 0.9, 0.82, 0.035 * W, 0.07 * H), tn.mid, tn.midA, 5, 0.06, 'multiply');
  // 4. deep underside + wet-in-wet blooms
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  wash(xform(body, cx, cy + 0.2 * H, 1.05, back ? 0.78 : 0.6, 0, 0.06 * H), tn.deep, tn.deepA, back ? 8 : 6, 0.17, 'multiply');
  for (let i = 0; i < 5; i++) {
    const bx = rnd.range(0.22, 0.78) * W;
    const by = rnd.range(0.2, 0.8) * H;
    const br = rnd.range(9, 20) * u;
    const bloom: number[] = [];
    for (let k = 0; k < 8; k++) bloom.push(bx + Math.cos(k * 0.785) * br * rnd.range(0.7, 1.2), by + Math.sin(k * 0.785) * br * 0.75 * rnd.range(0.7, 1.2));
    const dark = by > H * 0.5 || rnd.chance(0.3);
    ctx.globalCompositeOperation = dark ? 'multiply' : 'source-over';
    ctx.fillStyle = dark ? rgba(tn.bloomDark, 0.07) : rgba(tn.bloomLight, 0.11);
    for (let q = 0; q < 3; q++) {
      tracePoly(ctx, deform(bloom, rnd, 3, 0.18));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // 5. pooled edge darkening (inner, clipped)
  ctx.strokeStyle = rgba(tn.edge, back ? 0.15 : 0.11);
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (2.2 + i * 1.5) * u;
    tracePoly(ctx, deform(body, rnd, 1, 0.02));
    ctx.stroke();
  }
  ctx.restore();

  // 6. few soft leaf dabs, size-varied (no ticks)
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const flow = rnd.range(-0.7, -0.2) * (rnd.chance(0.5) ? 1 : -1) - 0.3;
  const ndab = back ? 34 : 52;
  for (let i = 0; i < ndab; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 10; tries++) {
      x = rnd.range(0.12 * W, 0.88 * W);
      y = rnd.range(top, bot);
      if (inBody(x, y)) break;
    }
    const L = rnd.range(7, 21) * u;
    const pal = tn.dabs[zone(y)]!;
    ctx.fillStyle = rgba(rnd.pick(pal), rnd.range(0.07, 0.19));
    almond(ctx, x, y, flow + rnd.gauss() * 0.7, L, L * 0.42, rnd.gauss() * 0.4 * u);
    ctx.fill();
  }
  if (tn.top) {
    for (let i = 0; i < 16; i++) {
      const x = rnd.range(0.16, 0.55) * W;
      const y = rnd.range(0.14, 0.4) * H;
      ctx.fillStyle = rgba(warm ? '#F4EA90' : '#EEF09A', rnd.range(0.2, 0.42));
      const L = rnd.range(6, 14) * u;
      almond(ctx, x, y, flow + rnd.gauss() * 0.5, L, L * 0.4);
      ctx.fill();
    }
  }
  ctx.restore();

  // 7. warm glaze: small clean translucent normal-blend patches on the lit upper-left (gold mostly, coral some)
  if (warm) {
    ctx.save();
    tracePoly(ctx, body);
    ctx.clip();
    const gold = kind === 'gold';
    const c1 = gold ? PAL.gold : PAL.coral;
    const reg = xform(body, cx, cy, 0.5, 0.42, -0.1 * W, -0.16 * H);
    ctx.fillStyle = rgba(c1, 0.11);
    for (let i = 0; i < 3; i++) {
      tracePoly(ctx, deform(reg, rnd, 3, 0.14));
      ctx.fill();
    }
    ctx.fillStyle = rgba(gold ? PAL.gold : PAL.gold, 0.12);
    const reg2 = xform(body, cx, cy, 0.34, 0.3, 0.08 * W, -0.2 * H);
    for (let i = 0; i < 2; i++) {
      tracePoly(ctx, deform(reg2, rnd, 3, 0.16));
      ctx.fill();
    }
    ctx.restore();
  }

  // 8. feathered paper holes
  const nholes = back ? 3 : rnd.int(2, 4);
  for (let i = 0; i < nholes; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = rnd.range(0.2, 0.8) * W;
      y = rnd.range(0.2, 0.66) * H;
      if (inBody(x, y)) break;
    }
    const r = rnd.range(1.4, 4.2) * u;
    const hole = deform(
      [x - r, y - r * 0.6, x + r * 0.2, y - r, x + r, y - r * 0.2, x + r * 0.5, y + r * 0.8, x - r * 0.7, y + r * 0.6],
      rnd, 3, 0.16,
    );
    ctx.globalCompositeOperation = 'destination-out';
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      tracePoly(ctx, xform(hole, x, y, 1 + q * 0.14, 1 + q * 0.14));
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 9. broken dab fringe straddling the outline
  const nv = body.length / 2;
  const nfr = back ? 18 : 30;
  for (let i = 0; i < nfr; i++) {
    const k = rnd.int(0, nv - 1);
    const px = body[2 * k]!;
    const py = body[2 * k + 1]!;
    let nx = px - cx;
    let ny = (py - cy) * 1.3;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const off = rnd.range(-1.5, 4.5) * u;
    const x = px + nx * off;
    const y = py + ny * off;
    const L = rnd.range(5, 12) * u;
    let col = rnd.pick(tn.dabs[zone(y)]!);
    if (kind === 'gold' && rnd.chance(0.3) && ny < 0.3) col = PAL.gold;
    if (kind === 'coral' && rnd.chance(0.25) && ny < 0.3) col = rnd.chance(0.6) ? PAL.coral : PAL.gold;
    ctx.fillStyle = rgba(col, rnd.range(0.4, 0.75));
    almond(ctx, x, y, Math.atan2(ny, nx) + (rnd.chance(0.5) ? Math.PI / 2 : 0) + rnd.gauss() * 0.8, L, L * 0.4, rnd.gauss() * 0.35 * u);
    ctx.fill();
  }

  // 10. sparse fine ink leaf marks near the underside (ref 3)
  if (!back && !warm && kind !== 'shade' && rnd.chance(0.55)) {
    ctx.strokeStyle = rgba(PAL.ink, 0.5);
    ctx.lineWidth = 0.65 * u;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let k = 0;
      for (let tries = 0; tries < 10; tries++) {
        k = rnd.int(0, nv - 1);
        if (body[2 * k + 1]! > cy + 0.1 * H) break;
      }
      const x = body[2 * k]! + rnd.range(-2, 3) * u;
      const y = body[2 * k + 1]! + rnd.range(-2, 3) * u;
      const ang = Math.PI / 2 + rnd.range(-1.1, 1.1);
      const L = rnd.range(5, 8) * u;
      almond(ctx, x, y, ang, L, L * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - (Math.cos(ang) * L) / 2, y - (Math.sin(ang) * L) / 2);
      ctx.lineTo(x + (Math.cos(ang) * L) / 2.4, y + (Math.sin(ang) * L) / 2.4);
      ctx.stroke();
    }
  }

  // 11. granulation: paper tooth shows through the pigment
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const hsh = (x: number, y: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = d[i + 3]!;
      if (a === 0) continue;
      const lo = hsh((x >> 2) + 7, (y >> 2) + 3);
      const hi = hsh(x, y);
      const nn = lo * 0.55 + hi * 0.45;
      const gr = nn - 0.5;
      d[i + 3] = clamp(a * (1 + gr * 0.6) - (nn < 0.22 ? 12 : 0), 0, 255);
      const sh = 1 - gr * 0.12;
      d[i] = clamp(d[i]! * sh, 0, 255);
      d[i + 1] = clamp(d[i + 1]! * sh, 0, 255);
      d[i + 2] = clamp(d[i + 2]! * sh, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Soft cast shadow on the ground, to the right of the tree (light upper-left). */
export function makeShadowSprite(seed: number, W: number, H: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const poly: number[] = [];
  const N = 22;
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const wob = 1 + 0.12 * Math.sin(5 * th + 1.3) + 0.08 * Math.sin(3 * th);
    poly.push(
      W * 0.5 + Math.sign(c) * Math.pow(Math.abs(c), 0.7) * W * 0.46 * wob,
      H * 0.5 + Math.sign(s) * Math.pow(Math.abs(s), 0.9) * H * 0.4,
    );
  }
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 12; i++) {
    const f = 1 - i * 0.04;
    ctx.fillStyle = rgba('#5A7040', 0.05);
    tracePoly(ctx, deform(xform(poly, W * 0.5, H * 0.5, f, f), rnd, 3, 0.08));
    ctx.fill();
  }
  return cv;
}

/** Small mound of freshly turned soil with a few pebbles. */
export function makeMoundSprite(seed: number, W: number, H: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const poly: number[] = [];
  const N = 18;
  for (let k = 0; k <= N; k++) {
    const x = k / N;
    poly.push(W * (0.04 + 0.92 * x), H * (0.92 - 0.82 * Math.pow(Math.sin(Math.PI * x), 0.85)));
  }
  for (let k = 5; k >= 1; k--) poly.push(W * (0.04 + 0.92 * (k / 6)), H * (0.93 + 0.05 * Math.sin(k * 2)));
  const body = deform(poly, rnd, 2, 0.04);
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = rgba('#9A7650', 0.16);
    tracePoly(ctx, deform(body, rnd, 2, 0.03));
    ctx.fill();
  }
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
  g.addColorStop(0, 'rgba(76,53,35,0)');
  g.addColorStop(1, 'rgba(76,53,35,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba('#4C3523', 0.5);
  ctx.lineWidth = Math.max(0.8, W / 70);
  tracePoly(ctx, deform(body, rnd, 1, 0.02));
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const x = rnd.range(0.15, 0.85) * W;
    const y = rnd.range(0.4, 0.9) * H;
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#C9B08A' : '#4C3523', 0.5);
    const r = rnd.range(0.8, 2) * (W / 60);
    tracePoly(ctx, deform([x - r, y, x, y - r * 0.8, x + r, y, x + r * 0.2, y + r * 0.6], rnd, 1, 0.2));
    ctx.fill();
  }
  return cv;
}

/** Soft ground wash band: irregular dry-brush edge, dissolving into the paper toward both ends. */
export function makeGroundSprite(seed: number, W: number, H: number, u: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const cy = H * 0.5;
  const poly: number[] = [];
  const N = 40;
  for (let k = 0; k <= N; k++) {
    const x = k / N;
    poly.push(W * x, cy - H * (0.14 + 0.05 * Math.sin(x * 11 + 1) + 0.04 * Math.sin(x * 27)));
  }
  for (let k = N; k >= 0; k--) {
    const x = k / N;
    poly.push(W * x, cy + H * (0.18 + 0.1 * Math.sin(x * 7 + 2) + 0.05 * Math.sin(x * 19)));
  }
  const body = deform(poly, rnd, 3, 0.05);
  const layers: Array<[string, number, number]> = [
    ['#BCD27A', 0.09, 6],
    ['#93B65C', 0.07, 6],
    ['#6C9650', 0.055, 4],
  ];
  ctx.globalCompositeOperation = 'multiply';
  for (const [c, a, n] of layers) {
    ctx.fillStyle = rgba(c, a);
    for (let i = 0; i < n; i++) {
      const sy = rnd.range(0.55, 1);
      tracePoly(ctx, deform(xform(body, W / 2, cy, rnd.range(0.9, 1.02), sy, rnd.range(-0.03, 0.03) * W, rnd.range(-0.06, 0.02) * H), rnd, 3, 0.1));
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    const x = rnd.range(0.08, 0.92) * W;
    const y = cy + rnd.range(-0.2, 0.16) * H;
    ctx.strokeStyle = rgba(rnd.chance(0.3) ? '#8DAE52' : '#4E7A3E', rnd.range(0.25, 0.55));
    ctx.lineWidth = rnd.range(0.5, 0.9) * u;
    const hgt = rnd.range(3, 8) * u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rnd.range(-1, 2) * u, y - hgt * 0.6, x + rnd.range(-2.5, 3) * u, y - hgt);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.16, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.84, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

/** Tileable value noise on a wrapped lattice. */
function tileNoise(seed: number, cells: number): (x: number, y: number) => number {
  const r = new Rand(seed);
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % cells) + cells) % cells;
    const y0 = ((iy % cells) + cells) % cells;
    const x1 = (x0 + 1) % cells;
    const y1 = (y0 + 1) % cells;
    const a = g[y0 * cells + x0]!;
    const b = g[y0 * cells + x1]!;
    const c = g[y1 * cells + x0]!;
    const d = g[y1 * cells + x1]!;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export const PAPER_TILE = 512;
/** Seamless cold-press paper tile: grain, embossed tooth (light upper-left), faint fibers. */
export function makePaperTile(seed = 20241): HTMLCanvasElement {
  const S = PAPER_TILE;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const cA = 290;
  const cB = 400;
  const nA = tileNoise(seed, cA);
  const nB = tileNoise(seed + 11, cB);
  const kA = cA / S;
  const kB = cB / S;
  const [pr, pg, pb] = hexToRgb(PAL.paper);
  const field = (x: number, y: number) => nA(x * kA, y * kA) * 0.6 + nB(x * kB, y * kB) * 0.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const g0 = field(x, y);
      const g1 = field(x + 1, y + 1);
      const emb = (g0 - g1) * 2.4;
      const dark = (0.5 - g0) * 0.1 * 14;
      d[i] = pr - 4 + dark + emb * 5;
      d[i + 1] = pg - 5 + dark + emb * 5;
      d[i + 2] = pb - 8 + dark + emb * 5;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rnd = new Rand(seed + 5);
  ctx.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = rnd.range(0, S);
    const y = rnd.range(0, S);
    const a = rnd.range(0, Math.PI * 2);
    const L = rnd.range(5, 16);
    ctx.strokeStyle = rnd.chance(0.55) ? 'rgba(190,172,140,0.10)' : 'rgba(255,255,250,0.35)';
    ctx.lineWidth = rnd.range(0.3, 0.7);
    for (let ox = -S; ox <= S; ox += S) {
      for (let oy = -S; oy <= S; oy += S) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * L * 0.5, y + oy + Math.sin(a + 0.6) * L * 0.5, x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L);
        ctx.stroke();
      }
    }
  }
  return cv;
}

/** Full-size static backdrop: tiled paper + gentle mottling + vignette. Drawn once per resize. */
export function paintPaperBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, tile: CanvasImageSource, dpr: number): void {
  const pat = ctx.createPattern(tile, 'repeat')!;
  ctx.save();
  ctx.scale(1 / Math.max(1, 1), 1 / Math.max(1, 1));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // low-frequency warmth / mottling and vignette: pure soft tone, so it is painted at quarter
  // resolution and scaled up (indistinguishable, a sixteenth of the fill cost)
  const q = 4;
  const w = Math.max(1, Math.ceil(W / q));
  const h = Math.max(1, Math.ceil(H / q));
  const tone = makeCanvas(w, h);
  const tctx = tone.getContext('2d')!;
  const rnd = new Rand(404);
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(0, w);
    const y = rnd.range(0, h);
    const r = rnd.range(0.25, 0.55) * Math.max(w, h);
    const g = tctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd.chance(0.5);
    g.addColorStop(0, warm ? 'rgba(236,222,190,0.12)' : 'rgba(255,252,242,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = g;
    tctx.fillRect(0, 0, w, h);
  }
  const v = tctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  v.addColorStop(0, 'rgba(239,229,207,0)');
  v.addColorStop(1, `rgba(222,205,170,${0.34 + 0 * dpr})`);
  tctx.fillStyle = v;
  tctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tone, 0, 0, W, H);
}

/** Soft emerald/blue-green under-shadow blob, drawn beneath front clumps (source-atop, low alpha). */
export function makeUnderSprite(seed: number, W: number, H: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const poly: number[] = [];
  const N = 16;
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const r = 1 + 0.14 * Math.sin(5 * th + 1.1) + 0.08 * Math.sin(3 * th);
    poly.push(W * 0.5 + Math.cos(th) * W * 0.42 * r, H * 0.5 + Math.sin(th) * H * 0.4 * r);
  }
  for (let i = 0; i < 5; i++) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, W * 0.5);
    g.addColorStop(0, 'rgba(14,74,60,0.22)');
    g.addColorStop(0.7, 'rgba(18,86,70,0.1)');
    g.addColorStop(1, 'rgba(18,86,70,0)');
    ctx.fillStyle = g;
    tracePoly(ctx, deform(poly, rnd, 2, 0.1));
    ctx.fill();
  }
  return cv;
}

function tileNoiseRect(seed: number, cx: number, cy: number): (x: number, y: number) => number {
  const r = new Rand(seed);
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % cx) + cx) % cx;
    const y0 = ((iy % cy) + cy) % cy;
    const x1 = (x0 + 1) % cx;
    const y1 = (y0 + 1) % cy;
    const a = g[y0 * cx + x0]!;
    const b = g[y0 * cx + x1]!;
    const c = g[y1 * cx + x0]!;
    const d = g[y1 * cx + x1]!;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Seamless grey bark tile (multiplied over the bark wash): granulation + vertical striation streaks. */
export function makeBarkTile(seed = 77): HTMLCanvasElement {
  const W = 128;
  const H = 192;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const grain = tileNoiseRect(seed, 96, 144);
  const streak = tileNoiseRect(seed + 5, 34, 5);
  const blot = tileNoiseRect(seed + 9, 6, 8);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const g = grain((x * 96) / W, (y * 144) / H);
      const s = streak((x * 34) / W, (y * 5) / H);
      const b = blot((x * 6) / W, (y * 8) / H);
      const v = clamp(0.93 - (1 - s) * 0.16 * (s < 0.5 ? 1.4 : 0.5) - (1 - g) * 0.1 - (1 - b) * 0.06, 0.6, 1);
      const c = Math.round(v * 255);
      d[i] = c;
      d[i + 1] = Math.round(c * 0.97);
      d[i + 2] = Math.round(c * 0.95);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Warm ochre soil cut-away band (roots live here): irregular edges, faint hatching, fades downward and at both ends. */
export function makeSoilSprite(seed: number, W: number, H: number, u: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  // organic outline: wavy top (under the meadow), ends that round off irregularly, ragged blooming bottom
  const poly: number[] = [];
  const N = 40;
  for (let k = 0; k <= N; k++) {
    const x = k / N;
    const end = Math.pow(Math.sin(Math.PI * clamp(x * 0.94 + 0.03, 0, 1)), 0.45);
    poly.push(W * (0.02 + 0.96 * x), H * (0.02 + 0.012 * Math.sin(x * 23 + 1) + 0.01 * Math.sin(x * 9) + (1 - end) * 0.45));
  }
  for (let k = N; k >= 0; k--) {
    const x = k / N;
    const end = Math.pow(Math.sin(Math.PI * clamp(x * 0.94 + 0.03, 0, 1)), 0.5);
    poly.push(W * (0.02 + 0.96 * x), H * (0.9 + 0.1 * Math.sin(x * 17) - (1 - end) * 0.4));
  }
  const body = deform(poly, rnd, 4, 0.06);
  ctx.globalCompositeOperation = 'multiply';
  const layers: Array<[string, number, number]> = [['#E1C28E', 0.1, 6], ['#CDA570', 0.075, 6], ['#B98F58', 0.055, 5]];
  for (const [c, a, n] of layers) {
    ctx.fillStyle = rgba(c, a);
    for (let i = 0; i < n; i++) {
      tracePoly(ctx, deform(xform(body, W / 2, H * 0.4, rnd.range(0.86, 1), rnd.range(0.55, 0.95), rnd.range(-0.04, 0.04) * W, 0), rnd, 3, 0.1));
      ctx.fill();
    }
  }
  // wet edge on top, directly under the meadow
  ctx.strokeStyle = rgba('#9A6F3E', 0.18);
  ctx.lineWidth = 1.6 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 60; k++) {
    const x = k / 60;
    const y = H * (0.045 + 0.012 * Math.sin(x * 23 + 1) + 0.01 * Math.sin(x * 9)) + rnd.gauss() * 0.6 * u;
    if (k === 0) ctx.moveTo(W * x, y);
    else ctx.lineTo(W * x, y);
  }
  ctx.stroke();
  // blooming granulation
  ctx.fillStyle = rgba('#A9824E', 0.05);
  for (let i = 0; i < 260; i++) {
    const x = rnd.range(0.04, 0.96) * W;
    const y = rnd.range(0.04, 0.8) * H;
    const r = rnd.range(0.6, 1.6) * u;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalCompositeOperation = 'source-over';
  // restrained hatching (ref 2) and a few pebbles
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rnd.range(0.04, 0.96) * W;
    const y = rnd.range(0.06, 0.75) * H;
    const L = rnd.range(4, 12) * u;
    ctx.strokeStyle = rgba('#6B4A2F', rnd.range(0.08, 0.2));
    ctx.lineWidth = 0.6 * u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + L * 0.8, y + L * 0.5);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = rnd.range(0.05, 0.95) * W;
    const y = rnd.range(0.08, 0.7) * H;
    const r = rnd.range(1, 2.6) * u;
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#C9B08A' : '#8A6A47', 0.35);
    tracePoly(ctx, deform([x - r, y, x, y - r * 0.8, x + r, y, x + r * 0.2, y + r * 0.6], rnd, 1, 0.2));
    ctx.fill();
  }
  // feather: blooming fade to paper downward and toward the ends (irregular, not a straight ramp)
  ctx.globalCompositeOperation = 'destination-in';
  const gv = ctx.createLinearGradient(0, 0, 0, H);
  gv.addColorStop(0, 'rgba(0,0,0,0.95)');
  gv.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  gv.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gv;
  ctx.fillRect(0, 0, W, H);
  const gh = ctx.createLinearGradient(0, 0, W, 0);
  gh.addColorStop(0, 'rgba(0,0,0,0)');
  gh.addColorStop(0.14, 'rgba(0,0,0,0.85)');
  gh.addColorStop(0.3, 'rgba(0,0,0,1)');
  gh.addColorStop(0.7, 'rgba(0,0,0,1)');
  gh.addColorStop(0.86, 'rgba(0,0,0,0.85)');
  gh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gh;
  ctx.fillRect(0, 0, W, H);
  // ragged bites out of the faded ends so they never read as a straight cut
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? 0.04 : 0.96;
    const x = (side + rnd.range(-0.05, 0.05)) * W;
    const y = rnd.range(0.05, 0.9) * H;
    const r = rnd.range(8, 22) * u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    tracePoly(ctx, deform([x - r, y, x, y - r * 0.8, x + r, y, x, y + r * 0.9], rnd, 3, 0.2));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

/**
 * Soil cut-away that continues from the rich band under the meadow all the way down the page:
 * lighter ochre washes with faint strata and pebbles, feathered at the sides, easing lighter with depth.
 * `bandH` is the height of the richer root band at the top (drawn with makeSoilSprite on top).
 */
export function makeDeepSoil(seed: number, W: number, H: number, u: number, bandH: number): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed * 7 + 3);
  const poly: number[] = [];
  const N = 28;
  for (let k = 0; k <= N; k++) poly.push(W * (-0.06 + 1.12 * (k / N)), bandH * (0.05 + 0.03 * Math.sin(k * 1.7)));
  poly.push(W * 1.06, H * 1.08, W * -0.06, H * 1.08);
  const body = deform(poly, rnd, 3, 0.03);
  ctx.globalCompositeOperation = 'multiply';
  const layers: Array<[string, number, number]> = [['#E9D3A8', 0.2, 5], ['#DCC093', 0.12, 5], ['#CDA979', 0.07, 4]];
  for (const [c, a, n] of layers) {
    ctx.fillStyle = rgba(c, a);
    for (let i = 0; i < n; i++) {
      tracePoly(ctx, deform(xform(body, W / 2, H / 2, 1, 1, rnd.range(-0.01, 0.01) * W, 0), rnd, 2, 0.02));
      ctx.fill();
    }
  }
  // broad wet-in-wet blooms: warmer and cooler patches across the whole field
  for (let i = 0; i < 26; i++) {
    const bx = rnd.range(0, 1) * W;
    const by = bandH * 0.6 + rnd.range(0, 1) * (H - bandH * 0.6);
    const br = rnd.range(0.05, 0.14) * W;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    const col = rnd.chance(0.5) ? '#C79E68' : rnd.chance(0.5) ? '#B98A5C' : '#D9BE8C';
    g.addColorStop(0, rgba(col, rnd.range(0.08, 0.16)));
    g.addColorStop(0.7, rgba(col, rnd.range(0.03, 0.07)));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx, by, br, br * rnd.range(0.35, 0.6), rnd.range(-0.2, 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  // faint strata: soil layers drawn as soft wavy washes
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const y0 = bandH + rnd.range(0.05, 0.95) * (H - bandH);
    ctx.strokeStyle = rgba(rnd.chance(0.5) ? '#B8925E' : '#C9A877', rnd.range(0.05, 0.1));
    ctx.lineWidth = rnd.range(2, 6) * u;
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const x = W * (0.03 + 0.94 * (k / 40));
      const y = y0 + Math.sin(k * 0.45 + i) * 3 * u + rnd.gauss() * 0.5 * u;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // granulation and pebbles, denser near the top
  for (let i = 0; i < 900; i++) {
    const x = rnd.range(0.03, 0.97) * W;
    const y = bandH * 0.4 + Math.pow(rnd.next(), 1.6) * (H - bandH * 0.4);
    const r = rnd.range(0.6, 1.5) * u;
    ctx.fillStyle = rgba('#A9824E', 0.07);
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) {
    const x = rnd.range(0.05, 0.95) * W;
    const y = bandH + Math.pow(rnd.next(), 1.3) * (H - bandH);
    const r = rnd.range(1, 3.2) * u;
    ctx.fillStyle = rgba(rnd.chance(0.5) ? '#C9B08A' : '#8A6A47', rnd.range(0.14, 0.3));
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * rnd.range(0.55, 0.85), rnd.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  // ease lighter with depth, and feather the sides into the paper
  ctx.globalCompositeOperation = 'destination-in';
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,1)');
  vg.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // the richer root band on top; drawn wider than the canvas so its rounded ends stay off-page
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(makeSoilSprite(seed, Math.round(W * 1.3), bandH, u), -Math.round(W * 0.15), 0);
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

/**
 * A weathered split-rail fence along the back of the meadow, painted like the trees: warm wood washes
 * lit from the upper left, grain strokes, a broken sepia contour, and grass tufts at the post feet.
 * Kept a touch pale so it sits behind the trees. Draws into ctx at ground line gy (px), u = px per
 * world unit, spanning x from 0 to W. Deterministic for a seed.
 */
export function paintFence(ctx: CanvasRenderingContext2D, W: number, gy: number, u: number, seed = 61, avoid: number[] = []): void {
  const rnd = new Rand(seed);
  const base = gy - 7 * u; // set back a little from where the trees stand
  const gap = 74 * u;
  const posts: Array<{ x: number; top: number; lean: number; w: number }> = [];
  for (let x = -rnd.range(10, 40) * u; x < W + gap; x += gap * rnd.range(0.86, 1.12)) {
    // no post directly behind a trunk (it would compete with the seedling in the close-up)
    let px = x;
    for (const ax of avoid) if (Math.abs(px - ax) < 22 * u) px = ax + (px < ax ? -22 : 22) * u;
    posts.push({ x: px, top: base - rnd.range(33, 39) * u, lean: rnd.range(-0.05, 0.05), w: rnd.range(5.6, 6.8) * u });
  }
  const postX = (p: (typeof posts)[number], y: number) => p.x + (base - y) * p.lean;
  ctx.save();
  // back meadow: a soft, feathered strip of grass for the fence to stand in
  {
    const top = base - 7 * u;
    const g = ctx.createLinearGradient(0, top, 0, base + 9 * u);
    g.addColorStop(0, 'rgba(150,186,104,0)');
    g.addColorStop(0.45, 'rgba(146,184,100,0.42)');
    g.addColorStop(1, 'rgba(126,170,86,0.6)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, base + 9 * u);
    for (let x = 0; x <= W; x += 24 * u) ctx.lineTo(x, top + Math.sin(x / (37 * u) + seed) * 2.2 * u + rnd.range(-0.8, 0.8) * u);
    ctx.lineTo(W, base + 9 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 0.88;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // rails first (they pass behind the posts): two split rails per bay, gently sagging and uneven
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    for (const [h, th] of [[27, 4], [13.5, 4.4]] as const) {
      const ya = base - (h + rnd.range(-1.2, 1.2)) * u;
      const yb = base - (h + rnd.range(-1.2, 1.2)) * u;
      const xa = postX(a, ya);
      const xb = postX(b, yb);
      const sag = rnd.range(0.4, 1.8) * u;
      const t = th * u * rnd.range(0.85, 1.1);
      const mx = (xa + xb) / 2;
      const my = (ya + yb) / 2 + sag;
      const rail = new Path2D();
      rail.moveTo(xa, ya - t / 2);
      rail.quadraticCurveTo(mx, my - t / 2 - sag * 0.2, xb, yb - t / 2);
      rail.lineTo(xb, yb + t / 2);
      rail.quadraticCurveTo(mx, my + t / 2, xa, ya + t / 2);
      rail.closePath();
      // wash: weathered warm grey-brown, lighter on top
      const g = ctx.createLinearGradient(0, my - t, 0, my + t);
      g.addColorStop(0, 'rgba(196,164,122,0.95)');
      g.addColorStop(0.5, 'rgba(156,120,84,0.95)');
      g.addColorStop(1, 'rgba(112,82,58,0.95)');
      ctx.fillStyle = g;
      ctx.fill(rail);
      // grain: a few long thin strokes along the rail
      ctx.strokeStyle = 'rgba(82,58,40,0.35)';
      ctx.lineWidth = Math.max(0.6, 0.35 * u);
      for (let k = 0; k < 3; k++) {
        const off = rnd.range(-0.3, 0.3) * t;
        const s0 = rnd.range(0.05, 0.4);
        const s1 = rnd.range(0.55, 0.95);
        ctx.beginPath();
        ctx.moveTo(xa + (xb - xa) * s0, ya + (yb - ya) * s0 + off + sag * Math.sin(Math.PI * s0));
        ctx.quadraticCurveTo(mx, my + off, xa + (xb - xa) * s1, ya + (yb - ya) * s1 + off + sag * Math.sin(Math.PI * s1));
        ctx.stroke();
      }
      // broken ink contour, heavier underneath
      ctx.setLineDash([18 * u, 3 * u, 7 * u, 2 * u]);
      ctx.strokeStyle = 'rgba(52,38,28,0.6)';
      ctx.lineWidth = Math.max(0.7, 0.42 * u);
      ctx.stroke(rail);
      ctx.setLineDash([]);
    }
  }

  // posts
  for (const p of posts) {
    const w = p.w;
    const h = base - p.top;
    const pts: number[] = [];
    const N = 10;
    for (let k = 0; k <= N; k++) {
      const y = p.top + (h * k) / N;
      pts.push(postX(p, y) - w / 2 - (k / N) * 0.6 * u, y);
    }
    // slightly rounded, weathered top
    pts.push(postX(p, base) + w / 2 + 0.6 * u, base);
    for (let k = N; k >= 0; k--) {
      const y = p.top + (h * k) / N + (k === 0 ? 1.2 * u : 0);
      pts.push(postX(p, y) + w / 2 + (k / N) * 0.6 * u, y);
    }
    const poly = deform(pts, rnd, 2, 0.006);
    const path = new Path2D();
    path.moveTo(poly[0]!, poly[1]!);
    for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i]!, poly[i + 1]!);
    path.closePath();
    const cx = postX(p, (p.top + base) / 2);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, 'rgba(206,174,130,0.96)');
    g.addColorStop(0.45, 'rgba(160,122,84,0.96)');
    g.addColorStop(1, 'rgba(100,72,52,0.96)');
    ctx.fillStyle = g;
    ctx.fill(path);
    // grain and a check or two
    ctx.strokeStyle = 'rgba(78,54,38,0.38)';
    ctx.lineWidth = Math.max(0.6, 0.32 * u);
    for (let k = 0; k < 4; k++) {
      const off = rnd.range(-0.32, 0.3) * w;
      const y0 = p.top + rnd.range(0.05, 0.4) * h;
      const y1 = y0 + rnd.range(0.25, 0.55) * h;
      ctx.beginPath();
      ctx.moveTo(postX(p, y0) + off, y0);
      ctx.lineTo(postX(p, y1) + off + rnd.range(-0.3, 0.3) * u, Math.min(base - u, y1));
      ctx.stroke();
    }
    // weathered top: a darker end-grain cap
    ctx.fillStyle = 'rgba(96,70,50,0.5)';
    ctx.beginPath();
    ctx.ellipse(postX(p, p.top), p.top + 0.8 * u, w * 0.5, 0.9 * u, p.lean, 0, Math.PI * 2);
    ctx.fill();
    // broken sepia contour
    ctx.setLineDash([14 * u, 2.5 * u, 6 * u, 2 * u]);
    ctx.strokeStyle = 'rgba(46,34,26,0.65)';
    ctx.lineWidth = Math.max(0.7, 0.45 * u);
    ctx.stroke(path);
    ctx.setLineDash([]);
    // grass tufts hiding the foot of the post
    for (let k = 0; k < 7; k++) {
      const gx = postX(p, base) + rnd.range(-1.4, 1.4) * w;
      const len = rnd.range(3, 7.5) * u;
      const lean = rnd.range(-0.5, 0.5);
      ctx.strokeStyle = rnd.chance(0.5) ? 'rgba(98,142,62,0.85)' : 'rgba(132,168,80,0.8)';
      ctx.lineWidth = Math.max(0.6, 0.5 * u);
      ctx.beginPath();
      ctx.moveTo(gx, base + 1.2 * u);
      ctx.quadraticCurveTo(gx + lean * len * 0.3, base - len * 0.6, gx + lean * len, base - len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Watercolor sky for the demo: a variegated cerulean wash, richest at the top and fading to pale paper at
 * the horizon, with soft blue cumulus clouds (lighter lifted tops, deeper blue undersides, a faint dried
 * pigment rim). Painted once into the paper layer; d = device px per css px, horizon = css y.
 */
export function paintSky(ctx: CanvasRenderingContext2D, Wd: number, Hd: number, horizon: number, d: number, seed = 17): void {
  const rnd = new Rand(seed);
  const hy = Math.min(Hd, horizon * d);
  ctx.save();
  // 1. graded wash
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, 'rgba(92,162,220,0.38)');
  g.addColorStop(0.45, 'rgba(128,184,226,0.25)');
  g.addColorStop(0.85, 'rgba(178,208,226,0.1)');
  g.addColorStop(1, 'rgba(200,220,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, Wd, hy);
  // 2. variegation: a few broad blooms of slightly different blues
  const q = 4;
  const w = Math.ceil(Wd / q);
  const h = Math.ceil(hy / q);
  if (w > 0 && h > 0) {
    const v = makeCanvas(w, h);
    const vc = v.getContext('2d')!;
    const tints = ['rgba(80,140,200,0.12)', 'rgba(120,170,215,0.1)', 'rgba(150,170,210,0.08)'];
    for (let i = 0; i < 9; i++) {
      const x = rnd.range(0, w);
      const y = rnd.range(0, h * 0.7);
      const r = rnd.range(0.15, 0.35) * w;
      const b = vc.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, tints[i % 3]!);
      b.addColorStop(1, 'rgba(255,255,255,0)');
      vc.fillStyle = b;
      vc.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, 0, 0, Wd, hy);
  }
  // 3. soft horizontal brush streaks, as a wash laid in broad strokes
  for (let i = 0; i < 14; i++) {
    const y = rnd.range(0.02, 0.75) * hy;
    const sh = rnd.range(14, 40) * d;
    const sg = ctx.createLinearGradient(0, y - sh, 0, y + sh);
    sg.addColorStop(0, 'rgba(90,150,210,0)');
    sg.addColorStop(0.5, `rgba(90,150,210,${rnd.range(0.04, 0.08)})`);
    sg.addColorStop(1, 'rgba(90,150,210,0)');
    // feather the stroke's ends too, so it never shows a squared-off edge
    const x0 = rnd.range(-0.2, 0.4) * Wd;
    const sw = rnd.range(0.4, 0.9) * Wd;
    const st = makeCanvas(Math.max(2, Math.round(sw / 8)), Math.max(2, Math.round((sh * 2) / 8)));
    const sc = st.getContext('2d')!;
    const sgs = sc.createLinearGradient(0, 0, 0, st.height);
    sgs.addColorStop(0, 'rgba(90,150,210,0)');
    sgs.addColorStop(0.5, `rgba(90,150,210,${rnd.range(0.04, 0.08)})`);
    sgs.addColorStop(1, 'rgba(90,150,210,0)');
    sc.fillStyle = sgs;
    sc.fillRect(0, 0, st.width, st.height);
    sc.globalCompositeOperation = 'destination-in';
    const ends = sc.createLinearGradient(0, 0, st.width, 0);
    ends.addColorStop(0, 'rgba(0,0,0,0)');
    ends.addColorStop(0.2, 'rgba(0,0,0,1)');
    ends.addColorStop(0.8, 'rgba(0,0,0,1)');
    ends.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = ends;
    sc.fillRect(0, 0, st.width, st.height);
    void sg;
    ctx.drawImage(st, x0, y - sh, sw, sh * 2);
  }
  // 4. granulation, denser where the wash is richer
  for (let i = 0; i < 1400; i++) {
    const y = Math.pow(rnd.next(), 1.7) * hy * 0.9;
    ctx.fillStyle = `rgba(70,120,170,${rnd.range(0.04, 0.1)})`;
    ctx.fillRect(rnd.range(0, Wd), y, d, d);
  }
  ctx.globalCompositeOperation = 'source-over';

  // 4. clouds
  const n = 5;
  for (let c = 0; c < n; c++) {
    const cw = rnd.range(170, 300) * d;
    const ch = cw * rnd.range(0.3, 0.4);
    const cx = ((c + rnd.range(0.15, 0.85)) / n) * Wd;
    const cy = rnd.range(0.16, 0.5) * hy;
    paintCloud(ctx, cx, cy, cw, ch, d, rnd);
  }
  ctx.restore();
}

function paintCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, cw: number, ch: number, d: number, rnd: Rand): void {
  // A detailed watercolor cumulus, kept light against the blue sky. Built like an illustration: billows
  // with small puffs budding off their tops, each billow modelled with its own light-to-shade wash (lit from
  // the upper left), glazed in thin layers, a cool shadowed base trailing into wisps, lifted highlights,
  // granulation, and a fine broken ink line along the top edges to match the trees.
  const pad = Math.ceil(ch * 0.9);
  const W = Math.ceil(cw + pad * 2);
  const H = Math.ceil(ch * 1.9 + pad * 2);
  const ox = pad;
  const base = pad + ch * 1.35;
  type Lobe = { x: number; y: number; r: number; tier: number };
  const lobes: Lobe[] = [];
  // base row: medium billows along a broad, slightly flat base
  const nb = rnd.int(4, 6);
  for (let i = 0; i < nb; i++) {
    const t = (i + rnd.range(0.3, 0.7)) / nb;
    const r = ch * rnd.range(0.24, 0.36) * (0.78 + 0.22 * Math.sin(Math.PI * t));
    lobes.push({ x: ox + cw * (0.1 + 0.8 * t), y: base - r * rnd.range(0.88, 1.0), r, tier: 0 });
  }
  // the dome: larger billows stacked toward the middle
  const peak = rnd.range(0.38, 0.56);
  const nt = rnd.int(3, 4);
  for (let i = 0; i < nt; i++) {
    const t = peak + rnd.range(-0.24, 0.24);
    const lift = 1 - Math.min(1, Math.abs(t - peak) / 0.34);
    const r = ch * rnd.range(0.38, 0.5) * (0.72 + 0.28 * lift);
    lobes.push({ x: ox + cw * t, y: base - ch * (0.32 + 0.4 * lift) - r * 0.15, r, tier: 1 });
  }
  // small puffs budding off the upper rims of the dome billows
  for (const L of lobes.filter((q) => q.tier === 1)) {
    const n = rnd.int(0, 1);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd.range(-0.8, 0.8);
      const r = L.r * rnd.range(0.5, 0.66);
      lobes.push({ x: L.x + Math.cos(a) * L.r * 0.82, y: L.y + Math.sin(a) * L.r * 0.82, r, tier: 2 });
    }
  }
  lobes.sort((a, b) => b.y + b.r - (a.y + a.r)); // lower billows first, upper ones overlap them
  const lobePoly = (x: number, y: number, r: number, amp: number) => {
    const pts: number[] = [];
    for (let j = 0; j < 26; j++) {
      const a = (j / 26) * Math.PI * 2;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9);
    }
    return deform(pts, rnd, 3, amp);
  };
  const shapes = lobes.map((L) => lobePoly(L.x, L.y, L.r, 0.07));
  const flat: number[] = [];
  for (let j = 0; j < 26; j++) {
    const a = (j / 26) * Math.PI * 2;
    flat.push(ox + cw * (0.5 + 0.38 * Math.cos(a)), base - ch * 0.16 + Math.sin(a) * ch * 0.15);
  }
  const fill = (c: CanvasRenderingContext2D, grow = 1, amp = 0) => {
    lobes.forEach((L, i) => {
      tracePoly(c, grow === 1 && amp === 0 ? shapes[i]! : lobePoly(L.x, L.y, L.r * grow, amp || 0.07));
      c.fill();
    });
    tracePoly(c, deform(flat, rnd, 2, 0.04));
    c.fill();
    c.beginPath();
    c.ellipse(ox + cw * 0.5, base - ch * 0.4, cw * 0.34, ch * 0.33, 0, 0, Math.PI * 2);
    c.fill();
  };

  // silhouette with a soft (but not blurry) wet edge
  const mask = makeCanvas(W, H);
  const m = mask.getContext('2d')!;
  m.filter = `blur(${Math.max(0.8, ch * 0.012)}px)`;
  m.fillStyle = '#000';
  fill(m);
  m.filter = 'none';
  {
    // cumulus have soft, fairly flat bases: cut away anything below a gently uneven base line, feathered
    const cut = makeCanvas(W, H);
    const cc = cut.getContext('2d')!;
    cc.filter = `blur(${Math.max(1.5, ch * 0.03)}px)`;
    cc.fillStyle = '#000';
    cc.beginPath();
    cc.moveTo(0, H);
    for (let x = 0; x <= W; x += Math.max(6, W / 24)) cc.lineTo(x, base - ch * 0.04 + Math.sin(x / (cw * 0.13) + cw) * ch * 0.025);
    cc.lineTo(W, H);
    cc.closePath();
    cc.fill();
    m.globalCompositeOperation = 'destination-out';
    m.drawImage(cut, 0, 0);
    m.globalCompositeOperation = 'source-over';
  }

  const cv = makeCanvas(W, H);
  const c = cv.getContext('2d')!;
  const tmp = makeCanvas(W, H);
  const t = tmp.getContext('2d')!;
  const bodyTint = t.createLinearGradient(0, base - ch * 1.5, 0, base);
  bodyTint.addColorStop(0, 'rgb(253,251,246)');
  bodyTint.addColorStop(0.55, 'rgb(240,244,248)');
  bodyTint.addColorStop(1, 'rgb(218,229,240)');
  // 1. body in thin glazes, each a slightly different version of the whole cloud (soft layered edges)
  for (let i = 0; i < 5; i++) {
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, W, H);
    t.fillStyle = '#000';
    fill(t, 0.95 + 0.025 * i, 0.09);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = bodyTint;
    t.fillRect(0, 0, W, H);
    c.globalAlpha = 0.3;
    c.drawImage(tmp, 0, 0);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'destination-in';
  {
    // glazes keep their soft layered character but stop at the trimmed base
    const soft = makeCanvas(W, H);
    const sc = soft.getContext('2d')!;
    sc.filter = `blur(${Math.max(1, ch * 0.02)}px)`;
    sc.drawImage(mask, 0, 0);
    c.drawImage(soft, 0, 0);
  }
  c.globalCompositeOperation = 'source-over';
  {
    // a firmer body inside the silhouette, so the cloud reads as one solid form
    const b = makeCanvas(W, H);
    const bc = b.getContext('2d')!;
    bc.drawImage(mask, 0, 0);
    bc.globalCompositeOperation = 'source-in';
    bc.fillStyle = bodyTint;
    bc.fillRect(0, 0, W, H);
    c.globalAlpha = 0.6;
    c.drawImage(b, 0, 0);
    c.globalAlpha = 1;
  }

  // 2. the cloud is shaded as one form, lit from the upper left: warm light on the dome, cooler to the lower right
  c.globalCompositeOperation = 'source-atop';
  {
    const top = lobes.reduce((a, L) => (L.y - L.r < a.y - a.r ? L : a), lobes[0]!);
    const g = c.createRadialGradient(top.x - top.r * 0.5, top.y - top.r * 0.6, ch * 0.05, top.x, top.y, cw * 0.62);
    g.addColorStop(0, 'rgba(255,252,244,0.7)');
    g.addColorStop(0.45, 'rgba(246,247,248,0.25)');
    g.addColorStop(1, 'rgba(176,198,224,0.4)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  // billows are suggested, not drawn as balls: a soft shadow fold under the lower edge of each upper billow,
  // where it sits in front of the cloud behind it
  c.filter = `blur(${Math.max(1.5, ch * 0.035)}px)`;
  c.lineCap = 'round';
  for (const L of lobes) {
    if (L.tier === 0) continue;
    c.strokeStyle = 'rgba(150,176,210,0.32)';
    c.lineWidth = Math.max(2, L.r * 0.16);
    c.beginPath();
    c.ellipse(L.x + L.r * 0.06, L.y + L.r * 0.1, L.r * 0.92, L.r * 0.82, 0, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }
  c.filter = 'none';

  // 3. cool shadow along the base, with a little reflected light at the very bottom
  const sh = c.createLinearGradient(0, base - ch * 0.7, 0, base + 3);
  sh.addColorStop(0, 'rgba(150,176,210,0)');
  sh.addColorStop(0.55, 'rgba(146,172,208,0.28)');
  sh.addColorStop(0.9, 'rgba(128,158,200,0.5)');
  sh.addColorStop(1, 'rgba(170,192,220,0.35)');
  c.fillStyle = sh;
  c.fillRect(0, 0, W, H);

  // 4. lifted highlights on the sunlit tops of the upper billows and puffs
  c.filter = `blur(${Math.max(1.5, ch * 0.04)}px)`;
  for (const L of lobes) {
    if (L.tier === 0) continue;
    c.fillStyle = 'rgba(255,253,245,0.45)';
    c.beginPath();
    c.ellipse(L.x - L.r * 0.25, L.y - L.r * 0.45, L.r * 0.5, L.r * 0.2, -0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = 'none';

  // 5. granulation settling in the shaded parts
  for (let i = 0; i < 360; i++) {
    const y = base - Math.pow(rnd.next(), 1.6) * ch * 1.2;
    c.fillStyle = `rgba(104,136,178,${rnd.range(0.05, 0.14)})`;
    c.fillRect(rnd.range(ox, ox + cw), y, d, d);
  }
  c.globalCompositeOperation = 'source-over';

  // 6. soft wisps trailing off the base (behind the body)
  {
    const wisp = makeCanvas(W, H);
    const wc = wisp.getContext('2d')!;
    wc.filter = `blur(${Math.max(2, ch * 0.06)}px)`;
    const nw = rnd.int(2, 4);
    for (let i = 0; i < nw; i++) {
      const wx = ox + cw * rnd.range(0.05, 0.95);
      const wy = base - ch * rnd.range(0.02, 0.12);
      wc.fillStyle = `rgba(226,234,242,${rnd.range(0.45, 0.65)})`;
      wc.beginPath();
      wc.ellipse(wx, wy, cw * rnd.range(0.14, 0.26), ch * rnd.range(0.05, 0.08), rnd.range(-0.05, 0.05), 0, Math.PI * 2);
      wc.fill();
    }
    c.globalCompositeOperation = 'destination-over';
    c.drawImage(wisp, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  // 7. a faint dried-wash edge on the shaded lower right
  {
    const rim = makeCanvas(W, H);
    const rc = rim.getContext('2d')!;
    rc.drawImage(mask, 0, 0);
    rc.globalCompositeOperation = 'destination-out';
    rc.drawImage(mask, -Math.max(1.2, ch * 0.016), -Math.max(1.2, ch * 0.02));
    rc.globalCompositeOperation = 'source-in';
    rc.fillStyle = 'rgba(118,148,190,0.45)';
    rc.fillRect(0, 0, W, H);
    c.drawImage(rim, 0, 0);
  }

  // 8. a fine, broken ink line along the top edges (like the trees' contours), pale blue-grey
  {
    const ink = makeCanvas(W, H);
    const ic = ink.getContext('2d')!;
    ic.drawImage(mask, 0, 0);
    ic.globalCompositeOperation = 'destination-out';
    ic.drawImage(mask, 0, Math.max(1.2, 0.9 * d));
    ic.globalCompositeOperation = 'source-in';
    ic.fillStyle = 'rgba(92,112,142,0.42)';
    ic.fillRect(0, 0, W, H);
    // broken like a dry pen: gaps of varying length
    ic.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < W; ) {
      const on = rnd.range(10, 34) * d;
      const off = rnd.range(3, 12) * d;
      ic.fillRect(x + on, 0, off, H);
      x += on + off;
    }
    // only along the lit upper half of the cloud
    ic.globalCompositeOperation = 'destination-in';
    const keep = ic.createLinearGradient(0, base - ch * 1.4, 0, base - ch * 0.35);
    keep.addColorStop(0, 'rgba(0,0,0,1)');
    keep.addColorStop(1, 'rgba(0,0,0,0)');
    ic.fillStyle = keep;
    ic.fillRect(0, 0, W, H);
    c.drawImage(ink, 0, 0);
  }

  ctx.drawImage(cv, cx - W / 2, cy - H / 2);
}
