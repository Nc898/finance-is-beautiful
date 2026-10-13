/**
 * Fish: a few river fish swimming downstream under the surface, carried by the current, that now and then rise,
 * leap clear of the water in a short arc and dive back in, throwing a crown of spray and leaving ripple rings
 * that drift away on the current.
 *
 * Art: each kind (trout, chub, perch) is painted once per size as two sprites, a full-colour watercolor fish
 * for the air and a soft dark silhouette for under the water. Per frame a fish is drawn as a dozen vertical
 * strips of its sprite, each lifted a little, so the body undulates from the head back to the tail (and arches
 * in mid-air) without repainting anything.
 *
 * All motion is wall-clock and decorative. A leap is only started on screen, clear of every boat, the start
 * line and the jetty, so a fish never passes through anything.
 */
import { Rand, clamp } from '../../scene/prng';
import { deform, rgba, tracePoly } from '../../scene/watercolor';
import { PAPER, SEPIA, brush, granulate, mix, paintForm, smoothPoly, spriteCtx, type Pt } from './boatInk';
import { BOAT_SCALE, LANE_Y, PIER, farEdge, nearEdge, xOfU } from './geom';
import type { BoatVisual } from '../types';

/* ---------------------------------------------------------------- the painted fish */

/** sprite space: the fish faces +x, nose at x = 21, tail tips at x = -23.5; the sprite spans x -25…25, y -12…12 */
const SW = 50;
const SH = 24;
const SOX = 25;
const SOY = 12;
/** a fish's length in sprite units (nose to tail tips), and its usual length in the river (world units) */
const LEN = 44.5;
const FISH_LEN = 27;

interface Kind {
  name: 'trout' | 'chub' | 'perch';
  /** body depth (1 = slender) */
  h: number;
  base: string;
  back: string;
  belly: string;
  fin: string;
  stripe?: string;
  spots?: string;
  bars?: string;
}

const KINDS: Kind[] = [
  { name: 'trout', h: 1, base: '#7F8C4C', back: '#4E5A30', belly: '#F2E6C4', fin: '#A99B68', stripe: '#E09A92', spots: '#3A3424' },
  { name: 'chub', h: 1.08, base: '#6A8590', back: '#3F5866', belly: '#EEEADB', fin: '#D98A52' },
  { name: 'perch', h: 1.28, base: '#8A983F', back: '#55602A', belly: '#F2E3B6', fin: '#E0874A', bars: '#3A4524' },
];

export interface FishSprite {
  dry: HTMLCanvasElement;
  wet: HTMLCanvasElement;
  q: number;
}

const P = (pts: Array<[number, number]>, h = 1): Pt[] => pts.map(([x, y]) => [x, y * h] as Pt);

function outlines(k: Kind) {
  const h = k.h;
  const body = smoothPoly(
    P(
      [
        [21, 0.6],
        [19.6, -1.9],
        [16, -3.7],
        [10, -4.9],
        [3, -5.3],
        [-5, -4.4],
        [-12, -2.6],
        [-15.6, -1.7],
        [-15.6, 1.7],
        [-12, 2.6],
        [-5, 4.0],
        [3, 4.9],
        [10, 4.5],
        [16, 3.1],
        [19.6, 1.9],
      ],
      h,
    ),
    5,
  );
  const tail = smoothPoly(
    [
      [-14.6, -1.5 * h],
      [-19, -4.8],
      [-23.5, -7.4],
      [-22.2, -3.2],
      [-20.6, 0],
      [-22.2, 3.2],
      [-23.5, 7.4],
      [-19, 4.8],
      [-14.6, 1.5 * h],
    ],
    4,
  );
  // fins are swept-back fans: a firm leading edge, a soft trailing one
  const dorsal =
    k.name === 'perch'
      ? // the perch's spiny crest: a row of points with the membrane dipping between them
        smoothPoly(
          P(
            [
              [8.6, -4.7],
              [7.4, -8.6],
              [6.3, -7.5],
              [5.1, -8.9],
              [3.9, -7.7],
              [2.6, -8.6],
              [1.3, -7.4],
              [0, -8],
              [-1.4, -6.9],
              [-3, -7.1],
              [-5.4, -6.6],
              [-7.6, -4.3],
            ],
            h * 0.92,
          ),
          2,
        )
      : smoothPoly(P([[4.4, -5.1], [1.2, -9.4], [-0.6, -9.2], [-3, -7.6], [-5.8, -4.6]], h), 3);
  const anal = smoothPoly(P([[-7.2, 3.7], [-11.4, 7.4], [-12.8, 6.9], [-12.6, 5], [-12.2, 2.9]], h), 2);
  const pelvic = smoothPoly(P([[0.8, 4.5], [-3.8, 8.4], [-5.5, 7.9], [-4.8, 6.3], [-3.4, 4.4]], h), 2);
  const pect = smoothPoly([[11.6, 2.2 * h], [7.2, 6.2 * h], [5.6, 5.8 * h], [6.4, 4.4 * h], [8.6, 2.6 * h]], 2);
  const adipose = k.name === 'trout' ? smoothPoly([[-9, -3.6], [-10.6, -5.6], [-12.4, -5.2], [-12, -3]], 3) : null;
  return { body, tail, dorsal, anal, pelvic, pect, adipose };
}

/** fin rays: thin strokes fanning from a fin's base to its edge */
function rays(ctx: CanvasRenderingContext2D, from: Pt, edge: Pt[], color: string, rnd: Rand): void {
  ctx.strokeStyle = rgba(color, 0.32);
  ctx.lineWidth = 0.16;
  for (const e of edge) {
    ctx.beginPath();
    ctx.moveTo(from[0] + rnd.range(-0.3, 0.3), from[1]);
    ctx.quadraticCurveTo((from[0] + e[0]) / 2 + rnd.range(-0.3, 0.3), (from[1] + e[1]) / 2, e[0], e[1]);
    ctx.stroke();
  }
}

function paintKind(k: Kind, q: number, seed: number): FishSprite {
  const rnd = new Rand(seed);
  const o = outlines(k);
  const h = k.h;
  const finOpts = (a = 0.62) => ({
    light: mix(k.fin, '#FFF3D6', 0.5),
    shade: mix(k.fin, '#2A2038', 0.45),
    alpha: a,
    layers: 2,
    amp: 0.05,
    inkA: 0.34,
    inkW: 0.18,
    speck: 6,
    pool: 0.7,
  });

  /* ---- the fish in the air: full colour */
  const { cv: dry, ctx } = spriteCtx(SW, SH, q, SOX, SOY);
  // fins behind the body, the tail first
  paintForm(ctx, o.tail, mix(k.fin, k.base, 0.35), rnd, { ...finOpts(0.7), inkA: 0.4 });
  rays(ctx, [-15, 0], [[-23, -7], [-22, -4.5], [-21, -2], [-20.6, 0], [-21, 2], [-22, 4.5], [-23, 7]], SEPIA, rnd);
  paintForm(ctx, o.dorsal, k.name === 'perch' ? k.fin : mix(k.fin, k.base, 0.3), rnd, finOpts(0.66));
  rays(
    ctx,
    [-1, -4.8 * h],
    k.name === 'perch'
      ? [[7.4, -8.6], [5.1, -8.9], [2.6, -8.6], [0, -8], [-3, -7.1], [-5.4, -6.6]]
      : [[1.2, -9.2], [-0.4, -9], [-2, -8.3], [-3.6, -7]],
    SEPIA,
    rnd,
  );
  paintForm(ctx, o.anal, k.fin, rnd, finOpts(0.55));
  rays(ctx, [-9.5, 3.2 * h], [[-11.2, 7.2 * h], [-12.4, 6.8 * h], [-12.6, 5.2 * h]], SEPIA, rnd);
  paintForm(ctx, o.pelvic, k.fin, rnd, finOpts(0.55));
  rays(ctx, [-1.2, 4.5 * h], [[-3.8, 8.2 * h], [-5.2, 7.8 * h], [-4.9, 6.5 * h]], SEPIA, rnd);
  if (o.adipose) paintForm(ctx, o.adipose, k.base, rnd, finOpts(0.7));

  // the body: glazes, light bloom on the back, pooled edges, broken contour
  paintForm(ctx, o.body, k.base, rnd, {
    light: mix(k.base, '#FFF6DA', 0.55),
    shade: k.back,
    alpha: 0.95,
    layers: 3,
    amp: 0.025,
    inkA: 0.52,
    inkW: 0.3,
    speck: 60,
  });
  ctx.save();
  tracePoly(ctx, o.body);
  ctx.clip();
  // a darker back and a pale belly, each a few soft wet washes
  const back = smoothPoly(P([[21, -0.4], [12, -3.2], [0, -3.4], [-10, -1.6], [-17, -0.6], [-17, -8], [22, -8]], h), 3);
  const belly = smoothPoly(P([[20, 1.6], [12, 1.9], [2, 2.3], [-8, 1.6], [-16, 0.9], [-16, 8], [21, 8]], h), 3);
  ctx.fillStyle = rgba(k.back, 0.2);
  for (let i = 0; i < 4; i++) {
    tracePoly(ctx, deform(back, rnd, 2, 0.04));
    ctx.fill();
  }
  ctx.fillStyle = rgba(k.belly, 0.34);
  for (let i = 0; i < 4; i++) {
    tracePoly(ctx, deform(belly, rnd, 2, 0.04));
    ctx.fill();
  }
  // the lateral line (and the trout's rose stripe, the chub's silver sheen)
  if (k.stripe) brush(ctx, [[17, 0.1], [8, 0.4], [0, 0.6], [-8, 0.3], [-15, 0]], 2.1 * h, k.stripe, 0.42);
  if (k.name === 'chub') brush(ctx, [[16, -0.4], [6, -0.6], [-4, -0.3], [-14, -0.1]], 2.6, '#E4ECEA', 0.4);
  brush(ctx, [[14, -0.6], [4, -0.2], [-6, 0], [-14.5, -0.1]], 0.22, SEPIA, 0.24, 0.9);
  // the perch's dark bars
  if (k.bars) {
    for (const x of [8.5, 4, -0.5, -5, -9.5]) {
      brush(ctx, [[x + 0.4, -5.6 * h], [x, -2 * h], [x - 0.3, 1.2 * h]], 1.6, k.bars, 0.38);
    }
  }
  // speckles
  if (k.spots) {
    ctx.fillStyle = rgba(k.spots, 0.55);
    for (let i = 0; i < 26; i++) {
      const x = rnd.range(-14, 14);
      const y = rnd.range(-4.4, 0.6) * h * (1 - Math.abs(x) / 30);
      ctx.beginPath();
      ctx.ellipse(x, y, rnd.range(0.28, 0.5), rnd.range(0.22, 0.4), rnd.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the gill cover: a shadow wash behind it and a broken pen line
  ctx.fillStyle = rgba(k.back, 0.16);
  ctx.beginPath();
  ctx.ellipse(13.6, 0.2, 2.2, 3.6 * h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  brush(ctx, [[14.2, -3 * h], [13, -1], [12.9, 1], [13.8, 2.9 * h]], 0.32, SEPIA, 0.5);
  // the pectoral fin over the body
  paintForm(ctx, o.pect, k.fin, rnd, finOpts(0.68));
  rays(ctx, [11, 2.6 * h], [[7.4, 6.1 * h], [6.4, 5.9 * h], [5.9, 5.2 * h]], SEPIA, rnd);
  // eye and mouth
  ctx.fillStyle = rgba('#E6D49A', 0.95);
  ctx.beginPath();
  ctx.arc(17.1, -1.05, 1.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#1E1A14', 0.92);
  ctx.beginPath();
  ctx.arc(17.25, -1.0, 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(PAPER, 0.9);
  ctx.beginPath();
  ctx.arc(16.95, -1.32, 0.22, 0, Math.PI * 2);
  ctx.fill();
  brush(ctx, [[20.8, 0.9], [19.6, 1.25], [18.4, 1.3]], 0.3, SEPIA, 0.55);
  // a wet glint along the back
  brush(ctx, [[15.5, -3.2 * h], [9, -4.3 * h], [2, -4.6 * h]], 0.55, PAPER, 0.55);
  granulate(dry, seed + 7, q, 0.8);

  /* ---- the fish under the water: a soft, dark, cool silhouette with no edges */
  const { cv: wet, ctx: w } = spriteCtx(SW, SH, q, SOX, SOY);
  const shapes = [o.tail, o.dorsal, o.anal, o.pelvic, o.body];
  for (let i = 0; i < 6; i++) {
    w.fillStyle = rgba(i < 3 ? '#183F4C' : '#24566A', 0.2);
    for (const s of shapes) {
      tracePoly(w, deform(s, rnd, 2, 0.06));
      w.fill();
    }
  }
  // the back a shade deeper, so even the silhouette has a top and a bottom
  w.save();
  tracePoly(w, o.body);
  w.clip();
  w.fillStyle = rgba('#10313C', 0.3);
  tracePoly(w, deform(back, rnd, 2, 0.05));
  w.fill();
  w.restore();
  return { dry, wet, q };
}

export function buildFishSprites(q: number): FishSprite[] {
  return KINDS.map((k, i) => paintKind(k, q, 4100 + i * 97));
}

/**
 * Draw a fish sprite as vertical strips, each lifted by `lift(xu)` sprite units (xu from the tail at -25 to the
 * nose at 25), in the current transform (sprite units, origin at the fish's centre).
 */
const STRIPS = 12;
function drawStrips(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, q: number, lift: (xu: number) => number): void {
  const swu = SW / STRIPS;
  const swp = cv.width / STRIPS;
  for (let i = 0; i < STRIPS; i++) {
    const xu = -SOX + (i + 0.5) * swu;
    ctx.drawImage(cv, i * swp, 0, swp + 1, cv.height, -SOX + i * swu, -SOY + lift(xu), swu + 1 / q, SH);
  }
}

/* ---------------------------------------------------------------- the school and its splashes */

interface Leap {
  /** wall-clock seconds the fish leaves the water */
  t0: number;
  x0: number;
  y0: number;
  vx: number;
  T: number;
  H: number;
  /** drips shed so far */
  drips: number;
}

interface Fish {
  x: number;
  /** the river-plane y the fish swims under (sets its depth in the picture, its scale and its current) */
  y: number;
  kind: number;
  size: number;
  /** its own swimming speed (world units per second), on top of the current */
  swim: number;
  ph: number;
  beat: number;
  /** depth below the surface, 0…1, and where it is heading */
  depth: number;
  depthTo: number;
  depthNext: number;
  /** wall-clock seconds of its next leap attempt */
  nextLeap: number;
  leap: Leap | null;
  /** a leap that is decided: the fish is rising toward the surface to make it */
  pending: Leap | null;
  /** the leap that just ended, for the dive back down */
  dive: { t: number; ang: number } | null;
  rose: boolean;
}

interface Ring {
  t: number;
  x: number;
  y: number;
  k: number;
  big: number;
  flow: number;
}

interface Drop {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** the water surface it falls back to */
  ys: number;
  ring: boolean;
  flow: number;
}

interface Crown {
  t: number;
  x: number;
  y: number;
  k: number;
  big: number;
  seed: number;
  flow: number;
}

/** gravity for leaps and spray, world units per second squared (a 34-unit leap takes about 0.85 s) */
const G = 380;
/** the fewest seconds between two leaps anywhere on the river */
const LEAP_GAP = 3.2;

export class School {
  private fish: Fish[] = [];
  private rings: Ring[] = [];
  private drops: Drop[] = [];
  private crowns: Crown[] = [];
  private rnd = new Rand(8128);
  private lastT = -1;
  private lastLeap = -99;
  private count = 0;
  /** the part of the river actually on screen (world units): leaps happen only where they can be seen */
  private view = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 1e9 };

  constructor(
    private sprites: FishSprite[],
    private xmin: number,
    private xmax: number,
  ) {
    // a few fish already in the river when it appears, spread along it
    const n = Math.max(3, Math.round((xmax - xmin) / 250));
    for (let i = 0; i < n; i++) this.fish.push(this.spawn(xmin + ((i + this.rnd.range(0.2, 0.8)) / n) * (xmax - xmin), 0));
  }

  private spawn(x: number, now: number): Fish {
    const r = this.rnd;
    const kind = r.int(0, KINDS.length - 1);
    const fx = clamp(x, -200, 1400);
    const y = r.range(farEdge(fx) + 16, nearEdge(fx) - 12);
    return {
      x,
      y,
      kind,
      size: r.range(0.85, 1.12) * (KINDS[kind]!.name === 'perch' ? 0.86 : 1),
      swim: r.range(7, 15),
      ph: r.range(0, 6.28),
      beat: r.range(5.5, 7.5),
      depth: r.range(0.4, 1),
      depthTo: r.range(0.3, 1),
      depthNext: now + r.range(2, 6),
      nextLeap: now + r.range(3, 16),
      leap: null,
      pending: null,
      dive: null,
      rose: false,
    };
  }

  setView(x0: number, x1: number, y0: number, y1: number): void {
    this.view = { x0, x1, y0, y1 };
  }

  /** where the river carries things at this y, as a fraction of the mid-river current (matches the lanes) */
  private flowAt(x: number, y: number, flow: number): number {
    const f = clamp((y - farEdge(x)) / (nearEdge(x) - farEdge(x)), 0, 1);
    return flow * (0.72 + 0.55 * f);
  }

  /** perspective: things farther up the picture are smaller */
  private depthScale(x: number, y: number): number {
    const f = clamp((y - farEdge(x)) / (nearEdge(x) - farEdge(x)), 0, 1);
    return 0.74 + 0.42 * f;
  }

  /** a leap here would cross a boat (in front of it or behind it), the start line or the jetty */
  private blocked(x0: number, x1: number, y0: number, H: number, boats: readonly BoatVisual[]): boolean {
    const top = y0 - H - 12;
    for (const b of boats) {
      const ly = LANE_Y[b.id];
      const bx = xOfU(b.u);
      const half = 92 * BOAT_SCALE;
      if (x1 > bx - half && x0 < bx + half && y0 + 6 > ly - 80 && top < ly + 12) return true;
    }
    const sx = xOfU(0);
    if (x1 > sx - 16 && x0 < sx + 16) return true;
    if (x1 > PIER.x0 - 30 && x0 < PIER.x1 + 30 && y0 > PIER.yTip - 60) return true;
    return false;
  }

  /**
   * Advance the school. `flow` is the current at mid-river in world units per second (0 when the river is
   * still or the timeline is paused: the fish keep swimming downstream on their own then).
   */
  step(timeMs: number, flow: number, boats: readonly BoatVisual[]): void {
    const now = timeMs / 1000;
    const dt = this.lastT < 0 || now < this.lastT || now - this.lastT > 0.25 ? 0 : now - this.lastT;
    this.lastT = now;
    if (dt === 0) return;
    const r = this.rnd;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i]!;
      const k = this.depthScale(f.x, f.y);
      const cur = this.flowAt(f.x, f.y, flow);
      f.ph += dt * f.beat * (f.leap ? 2.4 : 1);
      if (f.leap) {
        const L = f.leap;
        const tau = now - L.t0;
        f.x = L.x0 + L.vx * Math.min(tau, L.T);
        // drips shed from the tail on the way over
        while (L.drips < 3 && tau > L.T * (0.28 + 0.2 * L.drips)) {
          L.drips++;
          const p = this.leapPos(L, L.T * (0.28 + 0.2 * (L.drips - 1)));
          // from the tail, about 20 sprite units behind the centre
          const back = 20 * (FISH_LEN / LEN) * f.size * k;
          const tx = p.x - Math.cos(p.ang) * back;
          const ty = p.y - Math.sin(p.ang) * back;
          this.drops.push({ t: now, x: tx, y: ty, vx: L.vx * 0.6, vy: 10, r: r.range(0.55, 0.9) * k, ys: L.y0, ring: true, flow: cur });
        }
        if (tau >= L.T) {
          // back in: a bigger splash, and the fish dives away nose down
          this.splash(f.x, L.y0, k, 1, cur, now);
          f.dive = { t: now, ang: this.leapPos(L, L.T).ang };
          f.leap = null;
          f.depth = 0.15;
          f.depthTo = r.range(0.7, 1);
          f.depthNext = now + r.range(3, 6);
          f.nextLeap = now + r.range(10, 22);
          f.rose = false;
        }
        continue;
      }
      // swimming: the current carries it, it adds its own pace, and it wanders gently up and down
      f.x += (cur + f.swim) * dt;
      if (now > f.depthNext) {
        f.depthTo = r.range(0.25, 1);
        f.depthNext = now + r.range(3, 7);
      }
      // a leap: rise for half a second toward the surface, then go
      if (!f.rose && now > f.nextLeap - 0.55 && now - this.lastLeap > LEAP_GAP - 0.55) {
        const H = r.range(26, 38) * k * f.size;
        // up and back down under the same gravity as the spray
        const T = Math.sqrt((8 * H) / G);
        const vx = cur + f.swim + r.range(26, 36);
        const x0 = f.x + (cur + f.swim) * 0.55;
        const v = this.view;
        const visible = x0 > v.x0 + 40 && x0 + vx * T < v.x1 - 40 && f.y - H > v.y0 + 10 && f.y < v.y1 - 10;
        if (!visible || this.blocked(x0 - 20, x0 + vx * T + 20, f.y, H, boats)) f.nextLeap = now + r.range(1.5, 4);
        else {
          f.rose = true;
          f.depthTo = 0;
          this.lastLeap = now + 0.55;
          this.rings.push({ t: now + 0.3, x: x0, y: f.y, k, big: 0.35, flow: cur });
          f.pending = { t0: now + 0.55, x0, y0: f.y, vx, T, H, drips: 0 };
        }
      }
      const pend = f.pending;
      if (pend && now >= pend.t0) {
        f.leap = { ...pend, x0: f.x };
        f.pending = null;
        this.splash(f.x, f.y, k, 0.6, cur, now);
      }
      const ease = 1 - Math.exp(-dt / (f.rose ? 0.18 : 1.2));
      f.depth += (f.depthTo - f.depth) * ease;
      if (f.x > this.xmax + 60) {
        // out of sight downstream: a new fish comes in from upstream
        this.fish[i] = this.spawn(this.xmin - 60 - r.range(0, 120), now);
      }
    }
    // spray
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.vy += G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= d.ys && d.vy > 0) {
        if (d.ring) this.rings.push({ t: now, x: d.x, y: d.ys, k: d.r * 0.6, big: 0.12, flow: d.flow });
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if (now - this.rings[i]!.t > 2.4) this.rings.splice(i, 1);
    for (let i = this.crowns.length - 1; i >= 0; i--) if (now - this.crowns[i]!.t > 0.6) this.crowns.splice(i, 1);
  }

  private splash(x: number, y: number, k: number, big: number, flow: number, now: number): void {
    const r = this.rnd;
    this.crowns.push({ t: now, x, y, k, big, seed: this.count++, flow });
    this.rings.push({ t: now, x, y, k, big, flow });
    this.rings.push({ t: now + 0.22, x, y, k, big: big * 0.7, flow });
    const n = Math.round(6 + 8 * big);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + r.range(-1.05, 1.05);
      const v = r.range(40, 95) * (0.65 + 0.5 * big) * k;
      this.drops.push({
        t: now,
        x: x + r.range(-3, 3) * k,
        y: y - 0.5,
        vx: Math.cos(a) * v + flow * 0.5,
        vy: Math.sin(a) * v,
        r: r.range(0.4, 0.95) * k * (0.8 + 0.4 * big),
        ys: y + r.range(-1.5, 2.5) * k,
        ring: false,
        flow,
      });
    }
  }

  /** a leap's centre and heading at tau seconds after leaving the water */
  private leapPos(L: Leap, tau: number): { x: number; y: number; ang: number } {
    const s = clamp(tau / L.T, 0, 1);
    const x = L.x0 + L.vx * tau;
    const y = L.y0 - 4 * L.H * s * (1 - s);
    const vy = (-4 * L.H * (1 - 2 * s)) / L.T;
    // a fish turns less steeply than its path: it leaps nose up and dives nose down
    const ang = Math.atan2(vy, L.vx) * 0.82;
    return { x, y, ang };
  }

  /** the fish under the water (drawn inside the water clip, before the boats) */
  drawUnder(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const now = timeMs / 1000;
    ctx.save();
    for (const f of this.fish) {
      if (f.leap) continue;
      const sp = this.sprites[f.kind]!;
      const k = this.depthScale(f.x, f.y);
      const s = (FISH_LEN / LEN) * f.size * k;
      let ang = 0;
      // nearer the surface, darker and clearer; deeper, fainter (but always findable)
      let alpha = 0.55 * (1 - 0.5 * f.depth);
      if (f.dive) {
        const a = (now - f.dive.t) / 0.5;
        if (a >= 1) f.dive = null;
        else {
          ang = f.dive.ang * (1 - a) * (1 - a);
          alpha = lerp(0.62, alpha, a);
        }
      }
      // rising: the shape sharpens and tips its nose up toward the surface
      const pend = f.pending;
      if (pend) {
        const a = clamp(1 - (pend.t0 - now) / 0.55, 0, 1);
        ang = -0.35 * a * a;
        alpha = lerp(alpha, 0.6, a);
      }
      const amp = 0.55 + 0.25 * (1 - f.depth);
      ctx.globalAlpha = alpha;
      ctx.save();
      // deeper fish sit a little lower in the picture
      ctx.translate(f.x, f.y + 2.5 + 5 * f.depth * k);
      ctx.rotate(ang);
      ctx.scale(s, s);
      // the water bends the light a little: a slow sideways ripple on top of the swim
      drawStrips(ctx, sp.wet, sp.q, (xu) => {
        const tail = Math.pow(clamp((14 - xu) / 38, 0, 1), 1.5);
        return amp * Math.sin(f.ph - xu * 0.17) * tail + 0.35 * Math.sin(now * 2.2 + xu * 0.3 + f.ph * 0.2);
      });
      ctx.restore();
      // a fish swimming just under the surface pushes up a faint ripple
      if (f.depth < 0.3) {
        ctx.globalAlpha = 0.25 * (1 - f.depth / 0.3);
        ctx.strokeStyle = 'rgba(250,253,248,1)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(f.x + 5 * k, f.y + 0.5, 9 * k, 1.6 * k, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Everything at and above the surface: rings, crowns of spray, droplets, the leaping fish and its
   * reflection. Drawn after the boats (a leap never happens where it would cross a boat).
   */
  drawAbove(ctx: CanvasRenderingContext2D, timeMs: number, waterClip: Path2D): void {
    const now = timeMs / 1000;
    ctx.save();
    ctx.lineCap = 'round';
    // ripple rings, carried downstream by the current
    for (const g of this.rings) {
      const age = now - g.t;
      if (age < 0) continue;
      const px = g.x + g.flow * age * 0.9;
      const life = 1.6 + 0.8 * g.big;
      for (let j = 0; j < 2; j++) {
        const a2 = age - j * 0.18;
        if (a2 < 0 || a2 > life) continue;
        const rad = (2 + (10 + 18 * g.big) * Math.pow(a2 / life, 0.6)) * g.k;
        const al = (0.45 + 0.35 * g.big) * Math.pow(1 - a2 / life, 1.5) * (j ? 0.6 : 1);
        ctx.strokeStyle = `rgba(252,254,250,${al})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.ellipse(px, g.y, rad, rad * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(30,92,124,${al * 0.5})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(px, g.y + 0.8, rad, rad * 0.32, 0, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      }
    }
    // the leaping fish: its reflection, the part still in the water, and the part in the air
    for (const f of this.fish) {
      const L = f.leap;
      if (!L) continue;
      const sp = this.sprites[f.kind]!;
      const k = this.depthScale(L.x0, L.y0);
      const s = (FISH_LEN / LEN) * f.size * k;
      const p = this.leapPos(L, now - L.t0);
      const air = Math.sin(Math.PI * clamp((now - L.t0) / L.T, 0, 1));
      const lift = (xu: number) => {
        const tail = Math.pow(clamp((14 - xu) / 38, 0, 1), 1.4);
        // a strong tail beat, and the body arched over the top of the leap
        return 1.1 * Math.sin(f.ph - xu * 0.17) * tail + 1.6 * air * ((xu / 22) * (xu / 22) - 0.35);
      };
      const place = () => {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.scale(s, s);
      };
      const reach = 30 * s;
      // reflection: mirrored in the surface, faint and cool, only while clear of the water
      ctx.save();
      ctx.clip(waterClip);
      ctx.beginPath();
      ctx.rect(p.x - reach * 1.6, L.y0 + 0.6, reach * 3.2, 120);
      ctx.clip();
      ctx.globalAlpha = 0.2 * air;
      ctx.translate(0, 2 * L.y0);
      ctx.scale(1, -1);
      place();
      drawStrips(ctx, sp.dry, sp.q, lift);
      ctx.restore();
      // under the surface: the silhouette
      ctx.save();
      ctx.clip(waterClip);
      ctx.beginPath();
      ctx.rect(p.x - reach * 1.6, L.y0 + 0.4, reach * 3.2, 120);
      ctx.clip();
      ctx.globalAlpha = 0.6;
      place();
      drawStrips(ctx, sp.wet, sp.q, lift);
      ctx.restore();
      // in the air: the painted fish, with a white wet line where it breaks the surface
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - reach * 1.6, L.y0 - 200, reach * 3.2, 200.6);
      ctx.clip();
      place();
      drawStrips(ctx, sp.dry, sp.q, lift);
      ctx.restore();
      const cut = Math.abs(L.y0 - p.y) < reach * 0.9;
      if (cut) {
        ctx.strokeStyle = 'rgba(252,254,250,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(p.x, L.y0 + 0.3, 6 * k, 1.4 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // crowns: a ring of tapered white strokes thrown up where a fish breaks the surface, then falling back
    for (const c of this.crowns) {
      const age = now - c.t;
      const life = 0.32 + 0.22 * c.big;
      if (age > life) continue;
      const u = age / life;
      const hgt = (5 + 9 * c.big) * c.k * Math.sin(Math.PI * Math.min(1, u * 1.2));
      const px = c.x + c.flow * age * 0.9;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const sd = Math.sin((c.seed * 7 + i * 13.37) * 12.9898) * 43758.5453;
        const fr = sd - Math.floor(sd);
        const a = -Math.PI / 2 + ((i - (n - 1) / 2) / (n - 1)) * 2.0 + (fr - 0.5) * 0.3;
        const spread = (2.5 + 5 * u) * c.k * (0.8 + 0.4 * c.big);
        const bx = px + Math.cos(a) * spread * 0.6;
        const tipx = px + Math.cos(a) * (spread + hgt * 0.4);
        const tipy = c.y + Math.sin(a) * hgt * (0.7 + 0.5 * fr) - 0.5;
        const al = 0.8 * (1 - u);
        ctx.fillStyle = `rgba(252,254,250,${al})`;
        // a slim tapered splash blade
        ctx.beginPath();
        ctx.moveTo(bx - 0.9 * c.k, c.y);
        ctx.quadraticCurveTo((bx + tipx) / 2 - 0.4 * c.k, (c.y + tipy) / 2, tipx, tipy);
        ctx.quadraticCurveTo((bx + tipx) / 2 + 0.4 * c.k, (c.y + tipy) / 2, bx + 0.9 * c.k, c.y);
        ctx.closePath();
        ctx.fill();
      }
      // froth on the water where it went in
      ctx.fillStyle = `rgba(250,253,250,${0.5 * (1 - u)})`;
      ctx.beginPath();
      ctx.ellipse(px, c.y + 0.4, (4 + 5 * u) * c.k * (0.8 + 0.4 * c.big), (1.2 + 1.2 * u) * c.k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // droplets: small bright beads with a darker underside
    for (const d of this.drops) {
      ctx.fillStyle = 'rgba(30,92,124,0.35)';
      ctx.beginPath();
      ctx.arc(d.x + 0.12, d.y + 0.18, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(252,254,252,0.9)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
