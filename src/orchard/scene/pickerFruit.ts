/**
 * The fruit a picker's hands deal with, apart from the basket: the farmer's free apples ripening on the low bough of
 * its side (BOUGH), the ones nobody picks dropping into the grass beneath (WINDFALL) and lying there browning and
 * fading, and the apples tipped out at the foot of a newly planted tree, sinking into the grass as it comes up.
 *
 * The bough has a fixed set of hanging places per side (deterministic), in picking order from the tip inward: the
 * picker takes the first ones, the rest are what is left on the branch. An apple swells and reddens where it hangs
 * (it never appears full grown), and a picked one leaves with the hand. A falling apple drops from its place with a
 * small bounce and a short roll, then lies; a lying apple's age runs 0 … 1 (its life, set by the caller from the
 * months passing) and it browns, sinks a little into the grass and fades away.
 */
import { clamp, sstep } from '../../vine/scene/gardenerMath';
import { KAPPA } from '../../vine/scene/gardenerDims';
import { BOUGH, WINDFALL, depthScale } from './geom';
import { APPLE_R, ROT, RIPE, type AppleSprites } from './pickerArt';
import type { Item } from './partsApi';
import type { PickerId } from '../types';

/** gravity in world units / s² (the pickers are 64 units for 1.75 m) */
const G = 360;

/** a point in the world: x, depth y, and h above the ground */
export interface W3 {
  x: number;
  y: number;
  h: number;
}

/** a small deterministic hash in 0 … 1 */
export const hash01 = (i: number, seed: number): number => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** draw one apple sprite centred at a screen point, `r` world units in radius */
export function drawApple(ctx: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, sy: number, r: number, alpha = 1): void {
  if (alpha <= 0.01 || r <= 0.05) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(spr, x - 1.5 * r, sy - 1.5 * r, 3 * r, 3 * r);
  if (alpha < 1) ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ the low bough's fruit */

/** the number of hanging places on each side's low bough */
export const NPOS = 12;

/**
 * The low bough's centre line as farmTree.ts paints it (screen points: x, and y = BOUGH.y − height), from the fork
 * out to the tip. Kept in step with its BOUGHS by hand; the fruit hangs below it on pendant twigs drawn here.
 */
const LINE: Record<PickerId, Array<[number, number]>> = {
  a: [[493, 392], [474, 386], [452, 389], [430, 396], [410, 405], [392, 414], [380, 420]],
  b: [[506, 390], [526, 384], [550, 388], [572, 396], [592, 405], [610, 413], [622, 418]],
};

/** the bough's height above the grass (at BOUGH.y) at world x */
export function boughH(id: PickerId, x: number): number {
  const L = LINE[id];
  const y0 = BOUGH[id].y;
  for (let i = 1; i < L.length; i++) {
    const [ax, ay] = L[i - 1]!;
    const [bx, by] = L[i]!;
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return y0 - (ay + ((by - ay) * (x - ax)) / (bx - ax));
  }
  return y0 - L[L.length - 1]![1];
}

export interface HangPlace {
  /** the apple's centre, full grown (world) */
  at: W3;
  /** where its twig leaves the bough */
  stem: W3;
  /** the twig's sway (a bend to one side) */
  sway: number;
}

/**
 * The hanging places of one side, in picking order (from the tip inward), the same every time: on pendant twigs
 * hanging from the outer part of the bough, drawn down by the fruit to within reach of someone standing in the
 * grass (at most about 64 above it).
 */
export function hangPlaces(id: PickerId): HangPlace[] {
  const seed = id === 'a' ? 5101 : 5107;
  const dirIn = id === 'a' ? 1 : -1;
  const tip = id === 'a' ? 384 : 616;
  const out: HangPlace[] = [];
  for (let i = 0; i < NPOS; i++) {
    const u = i / (NPOS - 1);
    // in twos and threes: a spur every few apples
    const x = tip + dirIn * (40 * u + 2.5 * (hash01(i, seed) - 0.5));
    const y = BOUGH[id].y + 1 + 3.2 * hash01(i + 120, seed);
    const bh = boughH(id, x);
    // head to shoulder height for someone standing in the grass
    const h = Math.min(bh - 9, 50 + 9 * hash01(i + 40, seed) + 2 * u);
    out.push({ stem: { x: x - dirIn * 1.2, y, h: bh - 1 }, at: { x, y, h }, sway: (hash01(i + 80, seed) - 0.5) * 4 });
  }
  return out;
}

interface Hanging {
  /** 0 nothing there … 1 full grown and red */
  grow: number;
  /** growth per second, and whether it grows on the crew's clock (a round's ripening) or the wall clock */
  rate: number;
  crew: boolean;
}

export class LowFruit {
  readonly id: PickerId;
  readonly places: HangPlace[];
  private readonly hang: Hanging[] = [];

  constructor(id: PickerId) {
    this.id = id;
    this.places = hangPlaces(id);
    for (let i = 0; i < NPOS; i++) this.hang.push({ grow: 0, rate: 0, crew: true });
  }

  /** an apple hangs at place i (growing or grown) */
  has(i: number): boolean {
    return this.hang[i]!.grow > 0 || this.hang[i]!.rate > 0;
  }

  /** how far grown the apple at place i is (0 … 1) */
  growth(i: number): number {
    return this.hang[i]!.grow;
  }

  /** start an apple swelling at place i, full grown in `dur` seconds of the given clock (a no-op if one is there) */
  ripen(i: number, dur: number, crew: boolean): void {
    const h = this.hang[i]!;
    if (this.has(i)) return;
    h.grow = 0.001;
    h.rate = 1 / Math.max(0.05, dur);
    h.crew = crew;
  }

  /** take the apple from place i (picked, or falling): it leaves the bough */
  take(i: number): void {
    const h = this.hang[i]!;
    h.grow = 0;
    h.rate = 0;
  }

  /** settle: exactly the places in `ripe` hang full grown, nothing else */
  set(ripe: (i: number) => boolean): void {
    for (let i = 0; i < NPOS; i++) {
      const h = this.hang[i]!;
      h.grow = ripe(i) ? 1 : 0;
      h.rate = 0;
    }
  }

  update(crewDt: number, wallDt: number): void {
    for (const h of this.hang) {
      if (h.rate <= 0) continue;
      h.grow = Math.min(1, h.grow + h.rate * (h.crew ? crewDt : wallDt));
      if (h.grow >= 1) h.rate = 0;
    }
  }

  /** the hanging apples (each on a short stalk with a leaf or two) as one item at the bough's depth (in front of the branch) */
  item(spr: () => AppleSprites | null): Item {
    return {
      // (just in front of the tree's own sprays of leaf along the bough, BOUGH.y + 0.5)
      depth: BOUGH[this.id].y + 0.6,
      draw: (ctx) => {
        const s = spr();
        for (let i = 0; i < NPOS; i++) {
          const p = this.places[i]!;
          const k = depthScale(p.at.y);
          const g = this.hang[i]!.grow;
          // swelling: small and green, then full and red, hanging from its stalk
          const size = 0.35 + 0.65 * sstep(g / 0.8);
          const r = APPLE_R * size * k;
          if (g <= 0) continue;
          const top = p.at.y - p.at.h - APPLE_R * k;
          // a short stalk up into a little leafy spur (the shoots and leaf above are the tree's own)
          const sx = p.at.x + p.sway * 0.25;
          const sy = top - 3.4 * k;
          // (the spur fades in as the fruit sets, and goes with it)
          ctx.globalAlpha = sstep(g / 0.3);
          for (let j = 0; j < 3; j++) {
            const ang = -Math.PI / 2 + (j - 1) * 1.05 + (i % 2 ? 0.25 : -0.2);
            ctx.fillStyle = j === 1 ? 'rgba(146,156,76,0.85)' : 'rgba(104,126,62,0.85)';
            ctx.beginPath();
            ctx.ellipse(sx + Math.cos(ang) * 1.7 * k, sy + Math.sin(ang) * 1.3 * k, 2.2 * k, 0.95 * k, ang, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = 'rgba(96,76,44,0.85)';
          ctx.lineWidth = 0.32 * k;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(p.at.x + p.sway * 0.1, top - 1.4 * k, p.at.x, top + 0.4 * k);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (!s) continue;
          const st = Math.min(RIPE - 1, Math.floor(clamp((g - 0.15) / 0.8, 0, 1) * (RIPE - 1) + 0.5));
          drawApple(ctx, s.ripe[st]!, p.at.x, top + r, r);
        }
      },
    };
  }

  /** where the apple at place i is drawn now (world), for a hand reaching to it */
  apple(i: number): W3 {
    const p = this.places[i]!;
    const g = this.hang[i]!.grow;
    const size = 0.35 + 0.65 * sstep(g / 0.8);
    const k = depthScale(p.at.y);
    return { x: p.at.x, y: p.at.y, h: p.at.h + APPLE_R * k * (1 - size) };
  }
}

/* ------------------------------------------------------------------ apples on the ground */

/** an apple falling, rolling or lying on the grass */
export interface GroundApple {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  /** 0 in the air, 1 rolling, 2 lying */
  phase: 0 | 1 | 2;
  bounces: number;
  /** life (0 … 1) once lying; the windfalls brown and fade by it, the tipped apples sink and fade */
  age: number;
  /** golden (the picker's) or red */
  gold: boolean;
  seed: number;
  /** where it is meant to come to rest (it rolls toward it) */
  rest: { x: number; y: number };
}

function stepApple(a: GroundApple, dt: number): void {
  if (a.phase === 0) {
    a.vh -= G * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.h += a.vh * dt;
    if (a.h <= 0) {
      a.h = 0;
      a.bounces++;
      if (a.bounces >= 2 || Math.abs(a.vh) < 30) {
        a.vh = 0;
        a.phase = 1;
      } else {
        a.vh = -a.vh * 0.28;
        a.vx *= 0.5;
        a.vy *= 0.5;
      }
    }
  } else if (a.phase === 1) {
    // a short roll into its resting place, slowing in the grass
    const dx = a.rest.x - a.x;
    const dy = a.rest.y - a.y;
    const d = Math.hypot(dx, dy / KAPPA);
    const k = 1 - Math.exp(-dt * 6);
    a.x += dx * k;
    a.y += dy * k;
    if (d < 0.08) {
      a.x = a.rest.x;
      a.y = a.rest.y;
      a.phase = 2;
    }
  }
}

/** the screen point of a ground apple's centre */
const centreY = (a: GroundApple, r: number): number => a.y - a.h - r;

/** a few blades of dry grass in front of something lying in it */
function grassOver(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, seed: number, a: number): void {
  ctx.strokeStyle = `rgba(122,128,62,${0.75 * a})`;
  ctx.lineWidth = 0.28 * k;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const bx = x + (hash01(i, seed) - 0.5) * 3.6 * k;
    const hh = (1.4 + 1.6 * hash01(i + 9, seed)) * k;
    ctx.moveTo(bx, y + 0.3);
    ctx.quadraticCurveTo(bx + 0.2 * k, y - hh * 0.6, bx + (hash01(i + 17, seed) - 0.4) * 1.4 * k, y - hh);
  }
  ctx.stroke();
}

/**
 * The windfalls of one side: apples dropping from the bough into the grass under it, lying there for their life
 * (browning, then sinking and fading). The caller decides when one drops and how long a life is.
 */
export class Windfalls {
  readonly id: PickerId;
  readonly list: GroundApple[] = [];
  private n = 0;
  private readonly seed: number;

  constructor(id: PickerId) {
    this.id = id;
    this.seed = id === 'a' ? 6101 : 6113;
  }

  /** the resting place of the n-th windfall, under the bough, inside WINDFALL (mostly behind where the picker stands) */
  private spot(from: W3, n: number): { x: number; y: number } {
    const r = WINDFALL[this.id];
    const x = clamp(from.x + (hash01(n, this.seed) - 0.5) * 9, r.x0 + 2, r.x1 - 2);
    const y = clamp(from.y - 4 + 9 * hash01(n + 31, this.seed), r.y0 + 1, r.y1 - 2);
    return { x, y };
  }

  /** an apple leaves the bough at `from` and falls */
  drop(from: W3): void {
    const n = this.n++;
    const rest = this.spot(from, n);
    const land = { x: from.x + (rest.x - from.x) * 0.5, y: from.y + (rest.y - from.y) * 0.5 };
    const tf = Math.sqrt((2 * Math.max(1, from.h)) / G);
    this.list.push({ x: from.x, y: from.y, h: from.h, vx: (land.x - from.x) / tf, vy: (land.y - from.y) / tf, vh: 0, phase: 0, bounces: 0, age: 0, gold: false, seed: n * 7 + this.seed, rest });
  }

  /**
   * The heap as it lies at steady state: `count` apples with their ages spread evenly over a life (the oldest nearly
   * gone), at the places the next drops would take; nothing in the air. Deterministic for a count.
   */
  settle(count: number, from: (k: number) => W3): void {
    this.list.length = 0;
    for (let k = 0; k < count; k++) {
      const f = from(k);
      const rest = this.spot(f, 1000 + k);
      this.list.push({ x: rest.x, y: rest.y, h: 0, vx: 0, vy: 0, vh: 0, phase: 2, bounces: 2, age: (k + 0.5) / count, gold: false, seed: (1000 + k) * 7 + this.seed, rest });
    }
    this.n = 0;
  }

  /** fall and roll by the wall clock; age by `ageRate` (life per second, 0 when the months stand still) */
  update(dt: number, ageRate: number): void {
    for (const a of this.list) {
      if (a.phase < 2) stepApple(a, dt);
      else a.age += dt * ageRate;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.age >= 1) this.list.splice(i, 1);
  }

  get falling(): number {
    let n = 0;
    for (const a of this.list) if (a.phase < 2) n++;
    return n;
  }

  get lying(): number {
    return this.list.length - this.falling;
  }

  items(spr: () => AppleSprites | null, out: Item[]): void {
    for (const a of this.list) {
      out.push({
        depth: a.phase === 0 ? Math.max(a.y, BOUGH[this.id].y + 0.6) : a.y,
        draw: (ctx) => {
          const s = spr();
          if (!s) return;
          const k = depthScale(a.y);
          const r = APPLE_R * k;
          // brown over the first two thirds of its life, then sink into the grass and fade
          const brown = clamp(a.age / 0.62, 0, 1);
          const fade = 1 - sstep((a.age - 0.6) / 0.4);
          const sink = a.phase === 2 ? 0.7 * r * sstep((a.age - 0.4) / 0.6) : 0;
          if (a.h < 6) {
            ctx.fillStyle = `rgba(56,52,40,${0.22 * fade * (1 - a.h / 6)})`;
            ctx.beginPath();
            ctx.ellipse(a.x + 0.5 * k, a.y + 0.2, r * 1.15, r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          const st = Math.min(ROT - 1, Math.floor(brown * (ROT - 1) + 0.5));
          drawApple(ctx, s.rot[st]!, a.x, centreY(a, r) + sink, r, fade);
          if (a.phase === 2) grassOver(ctx, a.x, a.y, k, a.seed, fade);
        },
      });
    }
  }
}

/**
 * The apples tipped out of the basket at a tree's foot: each pours out of the basket's mouth, drops into the grass
 * and rolls a little, then lies for a few seconds, sinking and fading as the seedling comes up.
 */
export class Tipped {
  readonly list: GroundApple[] = [];
  private n = 0;

  /** an apple leaves the basket at `from` for a place near the tree's foot */
  pour(from: W3, foot: { x: number; y: number }, gold: boolean, toward: number): void {
    const n = this.n++;
    const ang = hash01(n, 71) * Math.PI * 2;
    const rad = 2 + 4.5 * hash01(n, 73);
    const rest = { x: foot.x + Math.cos(ang) * rad + toward * 1.5, y: foot.y + 1.5 + Math.abs(Math.sin(ang)) * rad * KAPPA * 1.6 };
    const land = { x: from.x + (rest.x - from.x) * 0.75, y: from.y + (rest.y - from.y) * 0.75 };
    const vh0 = 12;
    // time to fall from h with an initial rise of vh0
    const tf = (vh0 + Math.sqrt(vh0 * vh0 + 2 * G * Math.max(0.5, from.h))) / G;
    this.list.push({ x: from.x, y: from.y, h: from.h, vx: (land.x - from.x) / tf, vy: (land.y - from.y) / tf, vh: vh0, phase: 0, bounces: 0, age: 0, gold, seed: n * 13 + 5, rest });
  }

  clear(): void {
    this.list.length = 0;
  }

  /** `life` seconds of lying before they are gone */
  update(dt: number, life: number): void {
    for (const a of this.list) {
      if (a.phase < 2) stepApple(a, dt);
      else a.age += dt / life;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.age >= 1) this.list.splice(i, 1);
  }

  items(spr: () => AppleSprites | null, out: Item[]): void {
    for (const a of this.list) {
      out.push({
        depth: a.y,
        draw: (ctx) => {
          const s = spr();
          if (!s) return;
          const k = depthScale(a.y);
          const r = APPLE_R * k;
          const fade = 1 - sstep((a.age - 0.35) / 0.65);
          const sink = a.phase === 2 ? 0.9 * r * sstep(a.age / 0.9) : 0;
          if (a.h < 6) {
            ctx.fillStyle = `rgba(56,52,40,${0.2 * fade * (1 - a.h / 6)})`;
            ctx.beginPath();
            ctx.ellipse(a.x + 0.5 * k, a.y + 0.2, r * 1.15, r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          drawApple(ctx, a.gold ? s.gold : s.ripe[RIPE - 1]!, a.x, centreY(a, r) + sink, r, fade);
          if (a.phase === 2) grassOver(ctx, a.x, a.y, k, a.seed, fade);
        },
      });
    }
  }
}
