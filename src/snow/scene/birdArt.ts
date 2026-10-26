/**
 * The winter birds' paintings, in the collection's hand: translucent washes laid twice (each pass a little
 * deformed, so the edges breathe), the light from the upper left (a lit back, a shaded belly), and a broken ink
 * contour. Two kinds: a black-capped chickadee (grey back, black cap and bib, white cheek, buff flank) and a
 * cardinal (red, its crest and black mask, a stout orange beak).
 *
 * Painted once into small sprites, facing right: the wingbeat (8 frames, from wings high to wings low), a glide
 * with the wings tucked, a landing flare (wings raised, body tilted back, feet reaching), and three perched poses
 * (upright; looking down; a tail flick). The drawing works in units of the bird's length (beak tip to tail tip = 1).
 */
import { Rand } from '../../scene/prng';
import { deform, makeCanvas, rgba, tracePoly } from '../../scene/watercolor';

export type Species = 'chickadee' | 'cardinal';

export interface BirdFrame {
  cv: HTMLCanvasElement;
  /** the anchor in sprite px: the feet for perched frames, the body's middle for flight */
  ax: number;
  ay: number;
  /** the bird's length in sprite px */
  len: number;
}

export interface BirdArt {
  fly: BirdFrame[];
  glide: BirdFrame;
  flare: BirdFrame;
  perch: [BirdFrame, BirdFrame, BirdFrame];
}

interface Pal {
  back: string;
  backLit: string;
  belly: string;
  flank: string;
  shade: string;
  wing: string;
  wingEdge: string;
  tail: string;
  cap: string;
  cheek: string;
  bib: string | null;
  mask: string | null;
  beak: string;
  legs: string;
  ink: string;
}

const PAL: Record<Species, Pal> = {
  chickadee: {
    back: '#8e9096',
    backLit: '#b7b9bd',
    belly: '#f4efe4',
    flank: '#d8b88c',
    shade: '#7d7a92',
    wing: '#6c7077',
    wingEdge: '#e9e8e4',
    tail: '#73767c',
    cap: '#202126',
    cheek: '#fcfbf6',
    bib: '#25262b',
    mask: null,
    beak: '#2b2b2e',
    legs: '#4a4648',
    ink: '#1f2228',
  },
  cardinal: {
    back: '#c2342c',
    backLit: '#e2564a',
    belly: '#d54236',
    flank: '#cf3e32',
    shade: '#7e1d22',
    wing: '#a62a26',
    wingEdge: '#c9473c',
    tail: '#9c2723',
    cap: '#c93a30',
    cheek: '#c93a30',
    bib: null,
    mask: '#1b1517',
    beak: '#e8763a',
    legs: '#6a463e',
    ink: '#3a1416',
  },
};

type P = number[];

const ellipsePoly = (cx: number, cy: number, rx: number, ry: number, rot = 0, n = 22): P => {
  const out: P = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
};

const rotPoly = (p: P, ox: number, oy: number, a: number, sx = 1, sy = 1): P => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: P = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i]! * sx;
    const y = p[i + 1]! * sy;
    out.push(ox + x * c - y * s, oy + x * s + y * c);
  }
  return out;
};

interface Pose {
  /** body pitch (rad, negative = head up) */
  pitch: number;
  /** null: wings folded; else the near wing's direction in the side view (rad; -PI/2 straight up) */
  wing: number | null;
  /** how far the head bows (0 .. 1) */
  look: number;
  /** tail lift (rad, negative = up) */
  tail: number;
  /** the tail fanned (0 .. 1) */
  fan: number;
  /** feet showing: 'stand' under the body, 'reach' forward for landing, or none */
  legs: 'stand' | 'reach' | null;
}

/** paint one bird in units of its length, its body's middle at (0, 0); returns where its feet are */
function paintBird(ctx: CanvasRenderingContext2D, sp: Species, pose: Pose, rnd: Rand): { fx: number; fy: number } {
  const pal = PAL[sp];
  const card = sp === 'cardinal';
  const ink = (p: P, a: number, w = 0.016) => {
    ctx.strokeStyle = rgba(pal.ink, a);
    ctx.lineWidth = w;
    tracePoly(ctx, deform(p, rnd, 1, 0.01));
    ctx.stroke();
  };
  const wash = (p: P, col: string, a: number) => {
    ctx.fillStyle = rgba(col, a);
    for (let i = 0; i < 2; i++) {
      tracePoly(ctx, deform(p, rnd, 2, 0.018));
      ctx.fill();
    }
  };
  const B = rotPoly; // shorthand: a shape in the body's frame, turned by the pitch about the body's middle
  const pc = Math.cos(pose.pitch);
  const ps = Math.sin(pose.pitch);
  const at = (x: number, y: number): [number, number] => [x * pc - y * ps, x * ps + y * pc];

  // the wing shape, from the shoulder out along +x (the leading edge on top), primaries fingered at the tip
  const wingShape: P = [0, 0, 0.14, -0.05, 0.3, -0.06, 0.44, -0.03, 0.5, 0.0, 0.46, 0.03, 0.42, 0.02, 0.4, 0.06, 0.34, 0.06, 0.3, 0.09, 0.2, 0.1, 0.08, 0.09, 0.0, 0.06];
  const [shx, shy] = at(0.05, -0.07);
  const drawWing = (dir: number, far: boolean) => {
    // seen edge on as it sweeps through level, the wing is foreshortened; seen up or down it is full length
    const f = 0.34 + 0.66 * Math.abs(Math.sin(dir));
    const p = B(wingShape, shx + (far ? -0.02 : 0), shy + (far ? -0.015 : 0), dir, f, far ? 0.9 : 1);
    wash(p, far ? pal.shade : pal.wing, far ? 0.55 : 0.85);
    if (!far) {
      // the pale edges of the coverts and flight feathers (chickadee), a darker trailing edge (cardinal)
      const edge = B([0.12, 0.05, 0.42, 0.03], shx, shy, dir, f, 1);
      ctx.strokeStyle = rgba(pal.wingEdge, 0.7);
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.moveTo(edge[0]!, edge[1]!);
      ctx.lineTo(edge[2]!, edge[3]!);
      ctx.stroke();
    }
    ink(p, far ? 0.35 : 0.7, 0.014);
  };

  // ---- the far wing (behind the body)
  if (pose.wing !== null) drawWing(pose.wing + 0.18, true);

  // ---- the tail
  const tailRoot = at(-0.2, 0.02);
  const tailLen = card ? 0.4 : 0.36;
  const tw = 0.05 + 0.05 * pose.fan;
  const tail: P = [0, -0.035, tailLen, -tw, tailLen + 0.015, 0, tailLen, tw, 0, 0.035];
  const tp = B(tail, tailRoot[0], tailRoot[1], Math.PI + pose.pitch - pose.tail);
  wash(tp, pal.tail, 0.85);
  ink(tp, 0.6, 0.013);

  // ---- the body: back above, belly below, the flank warmer (chickadee)
  const body = ellipsePoly(0, 0, 0.27, card ? 0.17 : 0.16, pose.pitch);
  wash(body, pal.belly, 0.92);
  ctx.save();
  tracePoly(ctx, body);
  ctx.clip();
  wash(ellipsePoly(...at(-0.02, -0.1), 0.3, 0.12, pose.pitch), pal.back, 0.9);
  wash(ellipsePoly(...at(-0.06, -0.13), 0.18, 0.05, pose.pitch), pal.backLit, 0.55);
  if (!card) wash(ellipsePoly(...at(-0.08, 0.07), 0.16, 0.07, pose.pitch), pal.flank, 0.6);
  // the shade under the belly (the light is from the upper left)
  wash(ellipsePoly(...at(0.03, 0.15), 0.3, 0.08, pose.pitch), pal.shade, 0.3);
  ctx.restore();
  ink(body, 0.65);

  // ---- the head
  const bow = pose.look;
  const [hx, hy] = at(0.25 + bow * 0.02, -0.07 + bow * 0.08);
  const hr = card ? 0.12 : 0.115;
  const head = ellipsePoly(hx, hy, hr, hr * 0.96, pose.pitch + bow * 0.5);
  wash(head, pal.cap, 0.92);
  const hp = pose.pitch + bow * 0.55;
  const hpt = (x: number, y: number): [number, number] => [hx + x * Math.cos(hp) - y * Math.sin(hp), hy + x * Math.sin(hp) + y * Math.cos(hp)];
  if (card) {
    // the crest, swept back
    const crest = rotPoly([-0.02, -0.08, -0.12, -0.2, -0.1, -0.06], hx, hy, hp);
    wash(crest, pal.cap, 0.92);
    ink(crest, 0.55, 0.012);
  } else {
    // the white cheek under the black cap
    ctx.save();
    tracePoly(ctx, head);
    ctx.clip();
    wash(ellipsePoly(...hpt(-0.01, 0.045), 0.1, 0.055, hp), pal.cheek, 0.95);
    ctx.restore();
  }
  // the beak
  const bl = card ? 0.11 : 0.075;
  const bh = card ? 0.05 : 0.026;
  const beak = rotPoly([0, -bh, bl, 0.005, 0, bh], ...hpt(hr * 0.9, 0.01), hp);
  wash(beak, pal.beak, 0.95);
  ink(beak, 0.6, 0.011);
  // the mask (cardinal) or the bib (chickadee), and the eye
  if (pal.mask) {
    const mask = rotPoly([-0.02, -0.04, 0.07, -0.045, 0.1, 0.03, 0.04, 0.07, -0.03, 0.03], hx, hy, hp);
    wash(mask, pal.mask, 0.85);
  }
  if (pal.bib) {
    const bib = rotPoly([0.02, 0.05, 0.1, 0.06, 0.07, 0.13, 0.0, 0.11], hx, hy, hp);
    wash(bib, pal.bib, 0.85);
  }
  const [ex, ey] = hpt(0.045, -0.02);
  ctx.fillStyle = rgba('#0c0c10', 0.95);
  ctx.beginPath();
  ctx.arc(ex, ey, 0.019, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(ex - 0.006, ey - 0.007, 0.006, 0, Math.PI * 2);
  ctx.fill();
  ink(head, 0.6, 0.014);

  // ---- the near wing: folded along the side, or spread
  if (pose.wing === null) {
    const fold = ellipsePoly(...at(-0.05, -0.02), 0.2, 0.075, pose.pitch + 0.12);
    wash(fold, pal.wing, 0.85);
    const [a0, a1] = at(-0.18, 0.01);
    const [b0, b1] = at(0.06, -0.04);
    ctx.strokeStyle = rgba(pal.wingEdge, 0.65);
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(a0, a1);
    ctx.lineTo(b0, b1);
    ctx.stroke();
    ink(fold, 0.5, 0.012);
  } else {
    drawWing(pose.wing, false);
  }

  // ---- the feet
  let fx = 0;
  let fy = 0.2;
  if (pose.legs) {
    const [lx, ly] = at(0.02, 0.13);
    const reach = pose.legs === 'reach';
    fx = lx + (reach ? 0.08 : 0);
    fy = ly + (reach ? 0.1 : 0.11);
    ctx.strokeStyle = rgba(pal.legs, 0.95);
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(lx - 0.03, ly);
    ctx.lineTo(fx - 0.02, fy);
    ctx.moveTo(lx + 0.02, ly);
    ctx.lineTo(fx + 0.03, fy);
    // toes gripping
    ctx.moveTo(fx - 0.06, fy);
    ctx.lineTo(fx + 0.07, fy);
    ctx.stroke();
  }
  return { fx, fy };
}

function frame(sp: Species, pose: Pose, len: number, seed: number, perched: boolean): BirdFrame {
  const W = Math.ceil(len * 1.5);
  const H = Math.ceil(len * 1.5);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const cx = W * 0.5;
  const cy = perched ? H * 0.48 : H * 0.5;
  ctx.setTransform(len, 0, 0, len, cx, cy);
  const f = paintBird(ctx, sp, pose, new Rand(seed));
  return perched ? { cv, ax: cx + f.fx * len, ay: cy + f.fy * len, len } : { cv, ax: cx, ay: cy, len };
}

/** the sprites for one kind of bird, `len` px long */
export function makeBirdArt(sp: Species, len: number): BirdArt {
  const seed = sp === 'cardinal' ? 7301 : 7411;
  const fly: BirdFrame[] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    // from wings high (up and a little back) to wings low (down and a little back), sweeping through the back: at
    // mid-stroke the wing points toward us and is seen as a short stub along the body
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const dir = -Math.PI / 2 - 0.35 - k * (Math.PI - 0.7);
    fly.push(frame(sp, { pitch: -0.08, wing: dir, look: 0, tail: 0.05, fan: 0.2, legs: null }, len, seed + i, false));
  }
  const glide = frame(sp, { pitch: -0.04, wing: null, look: 0, tail: 0, fan: 0, legs: null }, len, seed + 20, false);
  const flare = frame(sp, { pitch: -0.5, wing: -Math.PI / 2 - 0.55, look: 0, tail: 0.45, fan: 1, legs: 'reach' }, len, seed + 21, false);
  const perch: [BirdFrame, BirdFrame, BirdFrame] = [
    frame(sp, { pitch: -0.42, wing: null, look: 0, tail: 0.18, fan: 0, legs: 'stand' }, len, seed + 30, true),
    frame(sp, { pitch: -0.2, wing: null, look: 1, tail: 0.05, fan: 0, legs: 'stand' }, len, seed + 31, true),
    frame(sp, { pitch: -0.42, wing: null, look: 0, tail: -0.4, fan: 0.6, legs: 'stand' }, len, seed + 32, true),
  ];
  return { fly, glide, flare, perch };
}
