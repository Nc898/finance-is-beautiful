/**
 * The young apple trees' paint box: the late-summer leaf, the two kinds of apple, the stake, the tie, the farmer's
 * label and the soft cast shadow. Everything here is painted once per pixel density (orchard.ts lays it out).
 *
 * The leaf is Time to Grow's six clump kinds (lit, mid, shade, back, gold, coral, chosen by where a clump sits
 * against the light) painted with the vine's clump painter (makeTreeClump) in late-summer colour: deep greens going
 * a little olive and tired, the lit tops warm with the low afternoon sun, the shade a cool blue-olive, and a few
 * yellowing leaves for the 'coral' accents.
 */
import { Rand, clamp } from '../../scene/prng';
import { almond, deform, makeCanvas, rgba, tracePoly, xform, SPRITE_KINDS, type SpriteKind } from '../../scene/watercolor';
import type { Spr, Sprites } from '../../scene/sprites';
import { grain, type FoliagePal } from '../../vine/scene/art';
import { makeTreeClump } from '../../vine/scene/treesArt';
import { APPLE } from './geom';
import type { Variety } from '../types';

/* ------------------------------------------------------------------ the late-summer leaf */

const hx = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
/** a hex colour moved toward another (dabs need hex: the clump painter parses them) */
function mixH(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number) => ((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t;
  return `#${hx(c(16))}${hx(c(8))}${hx(c(0))}`;
}

/** a palette: the dabs in each zone are the zone's colour and two near neighbours (only the lit kinds warmed) */
const pal = (base: string, light: string, mid: string, deep: string, edge: string, warm = false, baseA = 0.2): FoliagePal => ({
  base,
  baseA,
  mid,
  deep,
  light,
  dabs: [
    warm ? [light, mixH(light, '#E8C878', 0.22), mixH(light, '#FFF8E0', 0.3)] : [mixH(light, mid, 0.3), mixH(light, mid, 0.5), light],
    [mixH(mid, light, 0.2), mid, mixH(mid, '#A0A040', 0.14)],
    [mixH(deep, mid, 0.3), mixH(deep, mid, 0.12), mixH(deep, '#3A5048', 0.25)],
  ],
  edge,
});

type Kit = Record<SpriteKind, FoliagePal[]>;

const LATE: Kit = {
  lit: [
    pal('#A0AC56', '#DADA8E', '#829444', '#546A34', '#44562A', true),
    pal('#A8AE5A', '#DEDC92', '#8A9848', '#5A6C36', '#48582C', true),
  ],
  mid: [
    pal('#7E984A', '#B6C47E', '#62803E', '#3A5430', '#2E4428'),
    pal('#86984C', '#BEC484', '#6A8040', '#405630', '#344828'),
    pal('#749048', '#A8BC7C', '#5A783E', '#344E30', '#2A4228'),
  ],
  shade: [
    pal('#587A4C', '#86A276', '#44663E', '#264232', '#1E362A'),
    pal('#5E7448', '#8C9E70', '#4A5E3C', '#2A3E2E', '#203226'),
  ],
  back: [
    pal('#40583A', '#6A8660', '#304A36', '#1C3028', '#162820'),
    pal('#4A5A38', '#76865C', '#384A30', '#223024', '#1A281E'),
  ],
  gold: [pal('#BEBA60', '#EADC9A', '#A0A050', '#6A6E38', '#52562A', true)],
  coral: [pal('#A8A452', '#D6CE8E', '#8A8A44', '#5A5E32', '#464A28')],
};

const POOL: Record<SpriteKind, number> = { lit: 5, mid: 5, shade: 4, back: 3, gold: 2, coral: 2 };
const whole = (c: HTMLCanvasElement): Spr => ({ src: c, sx: 0, sy: 0, sw: c.width, sh: c.height });

/** the soft wash under a front clump where it overlaps what is behind it */
function makeUnder(W: number, H: number, col: string): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 0, W * 0.5, H * 0.52, W * 0.5);
  g.addColorStop(0, rgba(col, 0.3));
  g.addColorStop(0.7, rgba(col, 0.12));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.52, W * 0.46, H * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  return cv;
}

const leafCache = new Map<number, Promise<Sprites>>();

/** the late-summer clump set at a sprite density sd (sprite width = 100 sd px) */
export function leafSprites(sd: number, tick: () => Promise<void>, check: () => boolean): Promise<Sprites> {
  let p = leafCache.get(sd);
  if (!p) {
    p = (async () => {
      const W = Math.round(100 * sd);
      const H = Math.round(W * 0.53);
      const kinds = {} as Record<SpriteKind, Spr[]>;
      let ki = 0;
      for (const k of SPRITE_KINDS) {
        kinds[k] = [];
        const pals = LATE[k];
        for (let v = 0; v < POOL[k]; v++) {
          kinds[k].push(whole(makeTreeClump(20300 + ki * 101 + v * 7919, W, H, pals[v % pals.length]!, k)));
          if (v % 2 === 1) await tick();
        }
        ki++;
      }
      const under = whole(makeUnder(Math.round(130 * sd), Math.round(80 * sd), '#2A3E2C'));
      const empty = makeCanvas(2, 2);
      if (!check()) leafCache.delete(sd);
      return { sd, kinds, under, mound: whole(empty), shadow: whole(empty) } as Sprites;
    })();
    leafCache.set(sd, p);
  }
  return p;
}

/** a leaf's colours by clump kind (for the leaves that tuck over an apple) */
export function leafTone(kind: SpriteKind, variant: number): FoliagePal {
  const l = LATE[kind];
  return l[variant % l.length]!;
}

/* ------------------------------------------------------------------ apples */

/** an apple's width in world units at depth scale 1 (a little over life size, so it reads at 1x) */
export const APPLE_D = 4.2;

/** an apple sprite: the apple is `d` px across, centred at (cx, cy) */
export interface AppleSpr {
  cv: HTMLCanvasElement;
  cx: number;
  cy: number;
  d: number;
}

/**
 * One apple: a small round wash, lit pale from the upper left, its underside pooled darker, a warm bounce from the
 * grass along the bottom, a wet edge on the shadow side, a bright highlight and a stalk; the red ones streaked.
 */
function makeApple(seed: number, d: number, v: Variety): AppleSpr {
  const S = Math.ceil(d * 1.6);
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const rnd = new Rand(seed);
  const c = APPLE[v];
  const R = d / 2;
  const cx = S / 2;
  const cy = S * 0.54;
  const N = 20;
  const ph = rnd.range(0, 6.28);
  const body: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    // a little broader than tall, the top dimpled where the stalk goes in
    const dim = 1 - 0.09 * Math.exp(-Math.pow((th - Math.PI * 1.5) / 0.32, 2));
    const r = R * (1 + 0.035 * Math.sin(2 * th + ph) + 0.02 * Math.sin(3 * th + ph * 1.7)) * dim;
    body.push(cx + Math.cos(th) * r * 1.04, cy + Math.sin(th) * r * 0.95);
  }
  ctx.fillStyle = rgba(c.mid, 0.5);
  for (let i = 0; i < 3; i++) {
    tracePoly(ctx, deform(body, rnd, 2, 0.025));
    ctx.fill();
  }
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  const g = ctx.createRadialGradient(cx - 0.42 * R, cy - 0.46 * R, 0, cx - 0.3 * R, cy - 0.3 * R, 1.35 * R);
  g.addColorStop(0, rgba(c.light, 0.95));
  g.addColorStop(0.42, rgba(c.light, 0.42));
  g.addColorStop(1, rgba(c.light, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  if (v === 'match') {
    // the streaks of a red apple, darker toward the shade
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 9; i++) {
      const x = cx + rnd.range(-0.7, 0.9) * R;
      ctx.fillStyle = rgba(c.deep, rnd.range(0.12, 0.26));
      almond(ctx, x, cy + rnd.range(-0.1, 0.25) * R, Math.PI / 2 + rnd.range(-0.25, 0.25) + (x - cx) / R * 0.3, rnd.range(0.9, 1.5) * R, 0.07 * R);
      ctx.fill();
    }
  } else {
    // a faint warm blush on the sunny cheek of a golden apple, and a green-gold hint in the shade
    ctx.fillStyle = rgba('#E0A04A', 0.2);
    ctx.beginPath();
    ctx.ellipse(cx - 0.15 * R, cy - 0.05 * R, 0.5 * R, 0.42 * R, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba('#B4B048', 0.22);
    ctx.beginPath();
    ctx.ellipse(cx + 0.45 * R, cy + 0.35 * R, 0.6 * R, 0.5 * R, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the underside: the shade pooled to the lower right
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = rgba(c.deep, 0.42);
    ctx.beginPath();
    ctx.ellipse(cx + 0.36 * R + i * 0.06 * R, cy + 0.5 * R + i * 0.05 * R, 0.98 * R, 0.78 * R, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // a warm bounce of light from the grass along the very bottom
  ctx.strokeStyle = rgba('#E2C878', 0.32);
  ctx.lineWidth = 0.14 * R;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 0.9 * R, 0.84 * R, 0, Math.PI * 0.35, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
  // the wet edge pooled on the shadow side, and a broken ink accent under it
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(c.deep, 0.8);
  ctx.lineWidth = Math.max(0.6, 0.1 * R);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 1.0 * R, 0.92 * R, 0, -0.35, Math.PI * 0.85);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(47,34,28,0.5)';
  ctx.lineWidth = Math.max(0.5, 0.06 * R);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 1.03 * R, 0.95 * R, 0, 0.05, Math.PI * 0.62);
  ctx.stroke();
  // the highlight, with a soft halo
  ctx.fillStyle = 'rgba(255,248,226,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx - 0.38 * R, cy - 0.4 * R, 0.32 * R, 0.24 * R, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,236,0.95)';
  ctx.beginPath();
  ctx.ellipse(cx - 0.4 * R, cy - 0.42 * R, 0.16 * R, 0.11 * R, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // the stalk
  ctx.strokeStyle = 'rgba(70,48,32,0.9)';
  ctx.lineWidth = Math.max(0.5, 0.1 * R);
  ctx.beginPath();
  ctx.moveTo(cx + 0.02 * R, cy - 0.78 * R);
  ctx.quadraticCurveTo(cx + 0.04 * R, cy - 1.05 * R, cx + 0.2 * R, cy - 1.22 * R);
  ctx.stroke();
  grain(cv, seed, 0.7, Math.max(1, d / 10));
  return { cv, cx, cy, d };
}

/** a few apples of each variety, painted `d` px across */
export function makeApples(d: number): Record<Variety, AppleSpr[]> {
  const out = { own: [] as AppleSpr[], match: [] as AppleSpr[] };
  for (let i = 0; i < 4; i++) {
    out.own.push(makeApple(31700 + i * 977, d, 'own'));
    out.match.push(makeApple(35900 + i * 977, d, 'match'));
  }
  return out;
}

/** stamp an apple centred at (x, y), `d` px across (`xs`: the widening it will be drawn with, undone here) */
export function stampApple(ctx: CanvasRenderingContext2D, a: AppleSpr, x: number, y: number, d: number, xs = 1): void {
  const k = d / a.d;
  ctx.drawImage(a.cv, x - (a.cx * k) / xs, y - a.cy * k, (a.cv.width * k) / xs, a.cv.height * k);
}

/** a leaf tucked over part of an apple (so the fruit hangs among the leaves rather than sitting on them) */
export function tuckLeaf(ctx: CanvasRenderingContext2D, p: FoliagePal, x: number, y: number, d: number, ang: number, lit: boolean, xs = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / xs, 1);
  ctx.translate(-x, -y);
  ctx.fillStyle = rgba(lit ? p.dabs[0]![0]! : p.mid, 0.9);
  almond(ctx, x, y, ang, d * 0.95, d * 0.26, d * 0.04);
  ctx.fill();
  ctx.fillStyle = rgba(p.deep, 0.35);
  almond(ctx, x + Math.cos(ang + 1.57) * d * 0.06, y + Math.sin(ang + 1.57) * d * 0.06, ang, d * 0.8, d * 0.12);
  ctx.fill();
  ctx.strokeStyle = rgba(p.edge, 0.55);
  ctx.lineWidth = Math.max(0.5, d * 0.05);
  almond(ctx, x, y, ang, d * 0.95, d * 0.26, d * 0.04);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ the stake, the tie and the label */

/** the stake: how tall above the grass, how far right of the trunk (world units at depth scale 1), the tie's height */
export const STAKE = { h: 25, dx: 4.6, w: 1.4, tie: 21 } as const;

/** a sprite with an anchor point (px) and its density (px per world unit) */
export interface Anchored {
  cv: HTMLCanvasElement;
  ax: number;
  ay: number;
  A: number;
}

/** a weathered chestnut stake driven into the grass, lit on the left; anchor: its foot */
export function makeStake(A: number): Anchored {
  const pad = 3;
  const W = Math.ceil((STAKE.w + 2 * pad) * A);
  const H = Math.ceil((STAKE.h + 2 * pad) * A);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const rnd = new Rand(4417);
  const ax = W / 2;
  const ay = H - pad * A;
  ctx.scale(A, A);
  const fx = ax / A;
  const fy = ay / A;
  const hw = STAKE.w / 2;
  const lean = 0.02;
  const at = (x: number, h: number): [number, number] => [fx + x + lean * h, fy - h];
  // a soft contact shade where it goes into the grass
  ctx.fillStyle = 'rgba(52,58,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(fx + 0.6, fy + 0.2, 2.2, 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  const face = (x0: number, x1: number, col: string) => {
    const [a0, b0] = at(x0, 0);
    const [a1, b1] = at(x1, 0);
    const [a2, b2] = at(x1, STAKE.h - (x1 > 0 ? 0.5 : 0));
    const [a3, b3] = at(x0, STAKE.h - (x0 > 0 ? 0.5 : 0));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(a0, b0);
    ctx.lineTo(a1, b1);
    ctx.lineTo(a2, b2);
    ctx.lineTo(a3, b3);
    ctx.closePath();
    ctx.fill();
  };
  face(-hw, 0.1, '#D6C4A0');
  face(0.1, hw, '#A08C6E');
  // weathering: grey washes and grain
  ctx.fillStyle = 'rgba(120,118,112,0.18)';
  for (let i = 0; i < 4; i++) {
    const h0 = rnd.range(0, STAKE.h - 4);
    const [x, y] = at(-hw, h0);
    ctx.fillRect(x, y - rnd.range(2, 6), STAKE.w, rnd.range(2, 6));
  }
  ctx.strokeStyle = 'rgba(82,60,40,0.4)';
  ctx.lineWidth = 0.12;
  for (let i = 0; i < 5; i++) {
    const x = rnd.range(-hw * 0.8, hw * 0.8);
    const h0 = rnd.range(0, STAKE.h * 0.6);
    const [a, b] = at(x, h0);
    const [c, d] = at(x + rnd.range(-0.1, 0.1), h0 + rnd.range(4, 10));
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  }
  // the sawn top, catching the light
  const [t0x, t0y] = at(-hw, STAKE.h);
  const [t1x, t1y] = at(hw, STAKE.h - 0.5);
  ctx.fillStyle = '#E2CFA4';
  ctx.beginPath();
  ctx.moveTo(t0x, t0y);
  ctx.lineTo(t1x, t1y);
  ctx.lineTo(t1x - 0.2, t1y + 0.5);
  ctx.lineTo(t0x + 0.2, t0y + 0.45);
  ctx.closePath();
  ctx.fill();
  // ink: a firm line down the shadow side, a lighter broken one on the lit side
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(47,38,30,0.8)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(...at(hw, 0));
  ctx.lineTo(...at(hw, STAKE.h - 0.5));
  ctx.lineTo(t0x, t0y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(47,38,30,0.45)';
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(...at(-hw, STAKE.h));
  ctx.lineTo(...at(-hw, STAKE.h * 0.62));
  ctx.moveTo(...at(-hw, STAKE.h * 0.48));
  ctx.lineTo(...at(-hw, STAKE.h * 0.12));
  ctx.stroke();
  // the grass closing over its foot
  ctx.strokeStyle = 'rgba(96,112,58,0.7)';
  ctx.lineWidth = 0.22;
  for (let i = 0; i < 6; i++) {
    const x = fx + rnd.range(-1.6, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, fy + 0.3);
    ctx.quadraticCurveTo(x + rnd.range(-0.3, 0.3), fy - 1, x + rnd.range(-0.9, 0.9), fy - rnd.range(1.4, 2.6));
    ctx.stroke();
  }
  grain(cv, 4417, 0.6, Math.max(1, A));
  return { cv, ax, ay, A };
}

/**
 * The farmer's label on a red tree's stake: a cream card tied on with a red band, a small red apple and a leaf
 * painted on it (the farmer's colours: identity is the label, never the fruit's colour alone). Anchor: the band, at
 * the middle of the stake.
 */
export function makeLabel(A: number): Anchored {
  const W = Math.ceil(9 * A);
  const H = Math.ceil(9 * A);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const ax = W * 0.62;
  const ay = H * 0.22;
  ctx.scale(A, A);
  const bx = ax / A;
  const by = ay / A;
  const red = APPLE.match;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the band round the stake
  ctx.fillStyle = red.mid;
  ctx.beginPath();
  ctx.moveTo(bx - 0.95, by - 0.55);
  ctx.quadraticCurveTo(bx, by - 0.3, bx + 0.95, by - 0.6);
  ctx.lineTo(bx + 0.95, by + 0.25);
  ctx.quadraticCurveTo(bx, by + 0.55, bx - 0.95, by + 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(red.light, 0.7);
  ctx.fillRect(bx - 0.9, by - 0.4, 0.5, 0.6);
  ctx.strokeStyle = rgba(red.deep, 0.9);
  ctx.lineWidth = 0.18;
  ctx.stroke();
  // the loop down to the card
  const cx = bx - 2.1;
  const cy = by + 3.2;
  ctx.strokeStyle = rgba(red.deep, 0.95);
  ctx.lineWidth = 0.28;
  ctx.beginPath();
  ctx.moveTo(bx - 0.7, by + 0.2);
  ctx.quadraticCurveTo(bx - 1.6, by + 0.9, cx + 0.9, cy - 1.45);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  // the card, with a clipped corner where the string goes through
  const card = new Path2D();
  card.moveTo(-2.2, -1.1);
  card.lineTo(-1.2, -1.75);
  card.lineTo(2.3, -1.75);
  card.lineTo(2.3, 1.75);
  card.lineTo(-2.2, 1.75);
  card.closePath();
  ctx.fillStyle = '#F5EBD0';
  ctx.fill(card);
  ctx.fillStyle = 'rgba(214,190,140,0.5)';
  ctx.fillRect(-2.2, 0.7, 4.5, 1.05);
  ctx.strokeStyle = 'rgba(47,38,30,0.85)';
  ctx.lineWidth = 0.2;
  ctx.stroke(card);
  ctx.fillStyle = 'rgba(47,38,30,0.75)';
  ctx.beginPath();
  ctx.arc(-1.25, -1.05, 0.22, 0, Math.PI * 2);
  ctx.fill();
  // the painted apple and leaf
  ctx.fillStyle = red.mid;
  ctx.beginPath();
  ctx.ellipse(0.35, 0.25, 1.05, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(red.deep, 0.6);
  ctx.beginPath();
  ctx.ellipse(0.6, 0.55, 0.75, 0.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,226,0.9)';
  ctx.beginPath();
  ctx.ellipse(-0.05, -0.15, 0.24, 0.17, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,48,32,0.9)';
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(0.35, -0.6);
  ctx.lineTo(0.5, -1.1);
  ctx.stroke();
  ctx.fillStyle = '#6E8A3C';
  almond(ctx, 1.05, -0.95, -0.35, 1.0, 0.3);
  ctx.fill();
  ctx.restore();
  grain(cv, 5521, 0.5, Math.max(1, A * 0.6));
  return { cv, ax, ay, A };
}

/** the tie: a black rubber strap from the trunk round the stake */
export function drawTie(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, ds: number, a: number): void {
  ctx.globalAlpha = a;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(36,32,30,0.92)';
  ctx.lineWidth = 0.75 * ds;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + 0.45 * ds, x1 + 0.7 * ds, y - 0.1 * ds);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,146,140,0.6)';
  ctx.lineWidth = 0.22 * ds;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.2 * ds, y - 0.2 * ds);
  ctx.quadraticCurveTo((x0 + x1) / 2, y + 0.2 * ds, x1, y - 0.35 * ds);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ the seedling */

/**
 * A seedling just come up: a pale shoot with two seed leaves, a little turned earth round it. `k` 0…1 is how far it
 * has come up; drawn in world units at the trunk foot (x, y), scaled by the depth scale ds.
 */
export function drawSeedling(ctx: CanvasRenderingContext2D, x: number, y: number, ds: number, k: number, sway: number, a: number): void {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.scale(ds, ds);
  // turned earth
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 4.2);
  g.addColorStop(0, 'rgba(112,80,52,0.55)');
  g.addColorStop(0.6, 'rgba(140,104,68,0.28)');
  g.addColorStop(1, 'rgba(150,116,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -0.1, 4.2, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const up = clamp(k * 1.4, 0, 1);
  const open = clamp((k - 0.25) / 0.75, 0, 1);
  if (up > 0.02) {
    const h = 1 + 5.6 * up;
    const tx = sway * h * 0.08 + 0.3 * up;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(104,118,58,0.95)';
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-0.5, -h * 0.5, tx, -h);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,226,150,0.6)';
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.2);
    ctx.quadraticCurveTo(-0.62, -h * 0.5, tx - 0.12, -h);
    ctx.stroke();
    // the two leaves, the left lit, the right in shade
    const L = 1.2 + 2.4 * open;
    for (const side of [-1, 1]) {
      const ang = -Math.PI / 2 + side * (0.25 + 0.95 * open);
      const cx = tx + Math.cos(ang) * L * 0.5;
      const cy = -h + Math.sin(ang) * L * 0.5;
      ctx.fillStyle = side < 0 ? 'rgba(156,180,84,0.95)' : 'rgba(104,136,64,0.95)';
      almond(ctx, cx, cy, ang, L, L * 0.34, side * 0.15);
      ctx.fill();
      ctx.fillStyle = side < 0 ? 'rgba(232,230,160,0.55)' : 'rgba(60,88,52,0.35)';
      almond(ctx, cx - 0.1, cy - 0.12, ang, L * 0.7, L * 0.16, side * 0.1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(47,52,34,0.75)';
      ctx.lineWidth = 0.16;
      almond(ctx, cx, cy, ang, L, L * 0.34, side * 0.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ the cast shadow */

/**
 * A tree's soft shadow on the grass, falling to the lower right (the low sun is upper left), painted for a tree one
 * unit tall: the crown's pool and the trunk's band running back to the foot. Anchor: the foot; `A` px per unit.
 */
export function makeTreeShadow(A: number): Anchored {
  const W = Math.ceil(1.05 * A);
  const H = Math.ceil(0.26 * A);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(6113);
  const ax = 0.06 * A;
  const ay = 0.08 * A;
  const col = '#3E4632';
  // the crown's shadow: a lumpy pool, densest in the middle, its near edge a little firmer
  const cx = ax + 0.5 * A;
  const cy = ay + 0.06 * A;
  const N = 22;
  const pool: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const wob = 1 + 0.1 * Math.sin(5 * th + 0.7) + 0.06 * Math.sin(3 * th + 2.1);
    pool.push(cx + Math.cos(th) * 0.4 * A * wob, cy + Math.sin(th) * 0.075 * A * wob);
  }
  for (let i = 0; i < 10; i++) {
    const f = 1.04 - i * 0.07;
    ctx.fillStyle = rgba(col, 0.035 + i * 0.006);
    tracePoly(ctx, deform(xform(pool, cx, cy, f, f, -i * 0.01 * A, 0), rnd, 3, 0.07));
    ctx.fill();
  }
  // the trunk's band, from the foot out to the pool
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rgba(col, 0.09);
    const w = (0.016 - i * 0.003) * A;
    tracePoly(ctx, deform([ax - w * 0.6, ay - w * 0.6, cx - 0.2 * A, cy - w * 1.6, cx - 0.2 * A, cy + w * 1.6, ax + w * 0.6, ay + w * 0.6], rnd, 2, 0.04));
    ctx.fill();
  }
  return { cv, ax, ay, A };
}
