/**
 * Occasional birds crossing the hero sky, each carrying a bill it lets go of over a tree; the bill
 * flutters down and settles into a resting place in that canopy (the canopy keeps it).
 *
 * Birds are painted once into a cycle of wing poses in the same ink-and-wash language as the trees.
 * All motion is eased and continuous: the carried bill swings from the bird, leaves it with the bird's
 * forward speed, tumbles down on a smooth curve and eases into its exact resting pose, where it hands
 * over to the canopy's own tucked-in bill with a short crossfade.
 */
import { Rand, clamp, smoothstep } from '../scene/prng';
import { drawLooseBill, type BillPose } from '../scene/bills';
import { deform, makeCanvas, rgba, tracePoly } from '../scene/watercolor';

/* ------------------------------------------------------------------ bird sprites */

const BW = 170;
const BH = 120;
const FRAMES = 9;
/**
 * Wing angle per frame, degrees from the shoulder: raised up-and-back (-105) to lowered down-and-back (+110),
 * passing behind the body, where the wing is seen foreshortened.
 */
const WING = Array.from({ length: FRAMES }, (_, k) => -105 - (145 * k) / (FRAMES - 1));

interface BirdLook {
  back: string;
  wing: string;
  belly: string;
  breast?: string;
}
const LOOKS: BirdLook[] = [
  { back: '#566B82', wing: '#4D6178', belly: '#EFE4CF', breast: '#E58A6A' }, // slate swallow, coral throat
  { back: '#7A6250', wing: '#6B5444', belly: '#F1E6D2' }, // warm sparrow brown
  { back: '#5E7F8C', wing: '#4F6E7B', belly: '#EEE6D3', breast: '#E9B55A' }, // teal with a golden breast
];

const birdCache = new Map<number, HTMLCanvasElement[]>();

/** The wing-pose cycle for a look (bird facing right, body centred on the canvas). */
export function birdFrames(look: number): HTMLCanvasElement[] {
  const hit = birdCache.get(look);
  if (hit) return hit;
  const frames = WING.map((deg, k) => paintBird(LOOKS[look % LOOKS.length]!, deg, 400 + look * 31 + k));
  birdCache.set(look, frames);
  return frames;
}

function wingPath(ctx: CanvasRenderingContext2D, rx: number, ry: number, deg: number, len: number, wid: number, rnd: Rand): void {
  const a = (deg * Math.PI) / 180;
  // foreshortened as it sweeps past the horizontal (seen edge-on), full length when up or down
  const fore = 0.5 + 0.5 * Math.abs(Math.sin(a));
  len *= fore;
  wid *= 0.75 + 0.25 * fore;
  // a long, slightly swept, pointed wing: leading edge curves, trailing edge carries the primaries
  const pts: number[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t);
    pts.push(t * len, -w * 0.35 - t * t * len * 0.08);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const w = wid * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.35 * t);
    const notch = t > 0.55 ? Math.sin(t * 38) * wid * 0.06 : 0; // ragged primaries
    pts.push(t * len, w * 0.65 + notch - t * t * len * 0.08);
  }
  const c = Math.cos(a), s = Math.sin(a);
  const rot: number[] = [];
  for (let i = 0; i < pts.length; i += 2) rot.push(rx + pts[i]! * c - pts[i + 1]! * s, ry + pts[i]! * s + pts[i + 1]! * c);
  tracePoly(ctx, deform(rot, rnd, 1, 0.012));
}

function paintBird(look: BirdLook, deg: number, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(BW, BH);
  const ctx = cv.getContext('2d')!;
  const rnd = new Rand(seed);
  const cx = 84;
  const cy = 62;
  const ink = 'rgba(47,42,34,0.82)';
  // far wing: behind the body, foreshortened and paler
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = rgba(look.wing, 0.75);
  wingPath(ctx, cx + 4, cy - 3, deg + 8, 54, 15, rnd);
  ctx.fill();
  ctx.restore();
  // tail: two slim forked feathers
  ctx.fillStyle = rgba(look.wing, 0.85);
  for (const [dy, len] of [[-3, 30], [3, 26]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy + dy * 0.4);
    ctx.quadraticCurveTo(cx - 34, cy + dy * 1.2, cx - 22 - len, cy + dy * 3.2);
    ctx.quadraticCurveTo(cx - 32, cy + dy * 0.2, cx - 22, cy + 2);
    ctx.fill();
  }
  // body: tapered, slate back over a cream belly (layered washes)
  const body = new Path2D();
  body.moveTo(cx - 24, cy);
  body.bezierCurveTo(cx - 10, cy - 11, cx + 14, cy - 12, cx + 24, cy - 7);
  body.bezierCurveTo(cx + 30, cy - 4, cx + 30, cy + 5, cx + 22, cy + 8);
  body.bezierCurveTo(cx + 8, cy + 12, cx - 12, cy + 8, cx - 24, cy);
  ctx.fillStyle = rgba(look.belly, 0.95);
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  const g = ctx.createLinearGradient(0, cy - 12, 0, cy + 10);
  g.addColorStop(0, rgba(look.back, 0.95));
  g.addColorStop(0.5, rgba(look.back, 0.55));
  g.addColorStop(0.75, rgba(look.back, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - 30, cy - 14, 64, 26);
  if (look.breast) {
    ctx.fillStyle = rgba(look.breast, 0.55);
    ctx.beginPath();
    ctx.ellipse(cx + 20, cy + 3, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rgba(look.back, rnd.range(0.05, 0.16));
    ctx.fillRect(rnd.range(cx - 24, cx + 26), rnd.range(cy - 12, cy + 10), 1, 1);
  }
  ctx.restore();
  // head and beak
  ctx.fillStyle = rgba(look.back, 0.95);
  ctx.beginPath();
  ctx.ellipse(cx + 27, cy - 6, 8.5, 7.5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(201,154,58,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx + 34, cy - 7);
  ctx.lineTo(cx + 42, cy - 4.5);
  ctx.lineTo(cx + 34, cy - 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(30,26,22,0.95)';
  ctx.beginPath();
  ctx.arc(cx + 30, cy - 8, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,236,0.9)';
  ctx.beginPath();
  ctx.arc(cx + 30.5, cy - 8.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // ink: broken contour on the back and head, lighter on the belly
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([16, 2, 7, 2]);
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy);
  ctx.bezierCurveTo(cx - 10, cy - 11, cx + 14, cy - 12, cx + 22, cy - 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + 27, cy - 6, 8.5, 7.5, 0.1, Math.PI * 0.95, Math.PI * 2.25);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(47,42,34,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy + 8);
  ctx.bezierCurveTo(cx + 8, cy + 12, cx - 12, cy + 8, cx - 24, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  // near wing over the body: wash, feather lines, inked leading edge
  ctx.fillStyle = rgba(look.wing, 0.9);
  wingPath(ctx, cx + 2, cy - 2, deg, 62, 17, rnd);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const a = (deg * Math.PI) / 180;
  const L = 62 * (0.5 + 0.5 * Math.abs(Math.sin(a)));
  const wg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
  wg.addColorStop(0, 'rgba(255,255,255,0)');
  wg.addColorStop(1, 'rgba(240,236,224,0.35)');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, BW, BH);
  ctx.strokeStyle = 'rgba(40,36,30,0.35)';
  ctx.lineWidth = 0.8;
  for (let f = 0; f < 4; f++) {
    const t0 = 0.35 + f * 0.15;
    const px = cx + 2 + Math.cos(a) * L * t0;
    const py = cy - 2 + Math.sin(a) * L * t0;
    // feather edges trail toward the tail side of the wing
    const tr = a + (Math.sin(a) < 0 ? -1.35 : 1.35);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(tr) * 9, py + Math.sin(tr) * 9);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 2);
  ctx.lineTo(cx + 2 + Math.cos(a - 0.06) * L * 0.97, cy - 2 + Math.sin(a - 0.06) * L * 0.97);
  ctx.stroke();
  return cv;
}

/* ------------------------------------------------------------------ flock */

export interface AviaryHooks {
  /** current canvas size (css px) and where the sky band for flight sits */
  sky(): { w: number; yTop: number; yBottom: number; scale: number };
  /** main-row trees that can take another bill, with their canopy centre x (css px) */
  targets(): Array<{ tree: number; x: number; variant: number }>;
  /** where tree's next canopy bill will rest, in canvas css px (moves with the wind) */
  restPose(tree: number): BillPose | null;
  /** the bill has settled: the canopy now holds it */
  landed(tree: number): void;
}

interface Bird {
  id: number;
  look: number;
  dir: 1 | -1;
  t0: number;
  speed: number;
  baseY: number;
  drift: number;
  phase: number;
  flapRate: number;
  scale: number;
  carry: { tree: number; variant: number; releaseX: number } | null;
}

interface Fall {
  id: number;
  tree: number;
  variant: number;
  t0: number;
  dur: number;
  x0: number;
  y0: number;
  vx: number;
  ang0: number;
  sway: number;
  landedAt: number;
}

const hermite = (p0: number, p1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

export class Aviary {
  private rnd = new Rand(8128);
  private birds: Bird[] = [];
  private falls: Fall[] = [];
  private nextAt = -1;
  private id = 0;
  /** trees with a bill on its way (one at a time per tree, so its landing spot stays put) */
  readonly reserved = new Set<number>();
  constructor(private hooks: AviaryHooks) {}

  /** Advance and draw; `now` is wall-clock ms. Call only once the grove has grown and motion is allowed. */
  frame(ctx: CanvasRenderingContext2D, now: number): void {
    const sky = this.hooks.sky();
    if (this.nextAt < 0) this.nextAt = now + 2200;
    if (now >= this.nextAt && this.birds.length < 2) {
      this.spawn(now, sky);
      this.nextAt = now + this.rnd.range(7000, 14000);
    }
    // falling bills first (they sit below the birds)
    for (const f of this.falls) this.drawFall(ctx, f, now);
    this.falls = this.falls.filter((f) => f.landedAt < 0 || now - f.landedAt < 450);
    for (const b of this.birds) this.drawBird(ctx, b, now, sky);
    this.birds = this.birds.filter((b) => this.birdX(b, now, sky.w) > -120 && this.birdX(b, now, sky.w) < sky.w + 120);
  }

  private spawn(now: number, sky: ReturnType<AviaryHooks['sky']>): void {
    const dir: 1 | -1 = this.rnd.chance(0.5) ? 1 : -1;
    const targets = this.hooks.targets();
    let carry: Bird['carry'] = null;
    if (targets.length && this.rnd.chance(0.85)) {
      const t = targets[this.rnd.int(0, targets.length - 1)]!;
      // let go a little before the tree: the bill keeps some forward speed as it falls
      carry = { tree: t.tree, variant: t.variant, releaseX: t.x - dir * 70 * sky.scale };
      this.reserved.add(t.tree);
    }
    const band = Math.max(10, sky.yBottom - sky.yTop);
    this.birds.push({
      id: this.id++,
      look: this.rnd.int(0, LOOKS.length - 1),
      dir,
      t0: now,
      speed: this.rnd.range(120, 165) * sky.scale,
      baseY: sky.yTop + this.rnd.range(0.2, 0.8) * band,
      drift: this.rnd.range(-0.25, 0.25) * band,
      phase: this.rnd.range(0, Math.PI * 2),
      flapRate: this.rnd.range(8.5, 10.5),
      scale: this.rnd.range(0.85, 1.05) * sky.scale,
      carry,
    });
  }

  private birdX(b: Bird, now: number, w: number): number {
    const t = (now - b.t0) / 1000;
    return b.dir > 0 ? -80 + b.speed * t : w + 80 - b.speed * t;
  }

  private drawBird(ctx: CanvasRenderingContext2D, b: Bird, now: number, sky: ReturnType<AviaryHooks['sky']>): void {
    const t = (now - b.t0) / 1000;
    const x = this.birdX(b, now, sky.w);
    const across = clamp(b.dir > 0 ? x / sky.w : 1 - x / sky.w, 0, 1);
    // flaps with occasional glides; the glide envelope is smooth so wings settle rather than snap
    const glide = smoothstep((Math.sin(t * 0.55 + b.phase) - 0.35) / 0.5);
    const amp = 1 - 0.85 * glide;
    const ph = t * b.flapRate + b.phase;
    const wing = -Math.sin(ph) * amp - 0.15 * glide; // -1 raised … +1 lowered
    const bob = Math.sin(ph) * 2.2 * amp * b.scale + Math.sin(t * 1.2 + b.phase) * 5 * b.scale;
    const y = b.baseY + b.drift * (across - 0.5) + bob;
    const k = clamp(Math.round(((wing + 1) / 2) * (FRAMES - 1)), 0, FRAMES - 1);
    const img = birdFrames(b.look)[k]!;
    const w = 84 * b.scale;
    const h = w * (BH / BW);
    const pitch = (b.drift / Math.max(1, sky.w)) * 0.6 * b.dir + Math.sin(t * 1.2 + b.phase) * 0.05;

    // the carried bill swings beneath the bird until it is released over its tree
    if (b.carry) {
      const reached = b.dir > 0 ? x >= b.carry.releaseX : x <= b.carry.releaseX;
      const swing = Math.sin(t * 3.1 + b.phase) * 0.22;
      const bx = x + b.dir * 6 * b.scale;
      const by = y + 17 * b.scale;
      const size = 22 * b.scale;
      if (reached) {
        this.falls.push({
          id: b.id, tree: b.carry.tree, variant: b.carry.variant, t0: now, dur: 0,
          x0: bx, y0: by, vx: b.dir * b.speed, ang0: swing, sway: (b.id % 2 ? 1 : -1) * 13 * b.scale, landedAt: -1,
        });
        b.carry = null;
      } else {
        drawLooseBill(ctx, bx, by, swing, 1, size, b.carry.variant, 1);
      }
    }

    const tr = ctx.getTransform();
    ctx.translate(x, y);
    ctx.rotate(pitch);
    ctx.scale(b.dir, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.setTransform(tr);
  }

  private drawFall(ctx: CanvasRenderingContext2D, f: Fall, now: number): void {
    const rest = this.hooks.restPose(f.tree);
    if (!rest) return;
    if (f.dur === 0) f.dur = clamp(1100 + Math.max(0, rest.y - f.y0) * 6, 1500, 2600);
    const u = clamp((now - f.t0) / f.dur, 0, 1);
    const T = f.dur / 1000;
    // smooth curve from the bird's beak to the resting place: leaves with the bird's forward speed,
    // drifts down like paper and arrives at rest; a tumbling sway fades out as it settles
    const settle = smoothstep((u - 0.72) / 0.28);
    const fade = 1 - smoothstep(u / 0.85);
    let x = hermite(f.x0, rest.x, f.vx * T * 0.55, 0, u) + Math.sin(u * Math.PI * 2 * 1.4 + f.id) * f.sway * fade;
    let y = hermite(f.y0, rest.y, 0, 0, u) + Math.sin(u * Math.PI * 2 * 2.8 + f.id) * 2.5 * fade;
    let ang = f.ang0 * (1 - u) + Math.sin(u * Math.PI * 2 * 1.1 + f.id) * 0.7 * fade;
    let flip = Math.cos(u * Math.PI * 2 * 0.9 + f.id * 0.7);
    let size = 22 + (rest.size - 22) * u;
    // ease into the exact resting pose (angle, side, size) over the last stretch
    ang = ang + (rest.ang - ang) * settle;
    flip = flip + (rest.mirror - flip) * settle;
    x = x + (rest.x - x) * settle * settle;
    y = y + (rest.y - y) * settle * settle;
    size = size + (rest.size - size) * settle;
    let alpha = 1;
    if (u >= 1) {
      if (f.landedAt < 0) {
        f.landedAt = now;
        this.hooks.landed(f.tree);
        this.reserved.delete(f.tree);
      }
      // hand over to the canopy's own tucked-in bill (it fades in over the same moment)
      alpha = 1 - smoothstep((now - f.landedAt) / 420);
    }
    drawLooseBill(ctx, x, y, ang, flip, size, f.variant, alpha);
  }
}
