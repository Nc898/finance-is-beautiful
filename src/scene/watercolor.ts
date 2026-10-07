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
  // low-frequency warmth / mottling
  const rnd = new Rand(404);
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(0, W);
    const y = rnd.range(0, H);
    const r = rnd.range(0.25, 0.55) * Math.max(W, H);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd.chance(0.5);
    g.addColorStop(0, warm ? 'rgba(236,222,190,0.12)' : 'rgba(255,252,242,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  v.addColorStop(0, 'rgba(239,229,207,0)');
  v.addColorStop(1, `rgba(222,205,170,${0.34 + 0 * dpr})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
