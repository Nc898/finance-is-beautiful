/**
 * The scaffold along each front wall: timber standards lashed with rope to ledgers, boards at each lift with toe
 * boards, guard rails, ladders between the lifts at the inner end, a gin wheel on a pole at the outer end. Painted
 * once per size in two layers (back: the inner standards, the boards, the ladders; front: the outer standards, the
 * toe boards, the rails and the gin wheel) so the bricklayer stands between them, and per lift, so it can be struck
 * top first: when a house is paid off, each lift's timber is carried down in turn and stacked on the ground beside
 * the house (the stack grows as the scaffold goes). Scrubbed to, it is simply gone and the stack is there.
 */
import { Rand, clamp } from '../../scene/prng';
import { makeCanvas, rgba, tracePoly } from '../../scene/watercolor';
import { mix, ribbon } from '../../river/scene/boatInk';
import { GROUND_Y, HOIST, HOUSE, SCAFFOLD, SCAFFOLD_X, type Pt } from './geom';
import type { LoanId } from '../types';

const INK = '#3B2A22';
const WOOD = ['#C9A06A', '#BE9460', '#D2AC76', '#B88C5A'];
/** the boards' depth: from just off the wall to the front standards */
export const BOARD_Y0 = 468;
export const BOARD_Y1 = SCAFFOLD.y + 2;
const TOP = SCAFFOLD.lifts[SCAFFOLD.lifts.length - 1]! + 32;
/** each lift band's sprites span from this far below its boards to the next lift (or the rail top) */
const LIFTS = SCAFFOLD.lifts.length;

interface Band {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function scaffoldBox(id: LoanId): Box {
  const S = SCAFFOLD_X[id];
  return { x: Math.min(S.x0, HOIST[id].x) - 16, y: SCAFFOLD.y - HOIST[id].wheelH - 18, w: Math.abs(S.x1 - S.x0) + 40, h: HOIST[id].wheelH + 26 };
}

/** the timber of one lift, the part between heights h0 and h1 above the ground */
const bandRange = (i: number): [number, number] => {
  const lifts = SCAFFOLD.lifts;
  const h0 = i === 0 ? -4 : lifts[i]! - 2;
  const h1 = i === LIFTS - 1 ? TOP + 60 : lifts[i + 1]! - 2;
  return [h0, h1];
};

function pole(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, y0: number, x1: number, y1: number, w: number, lit: number): void {
  const base = mix(rnd.pick(WOOD), '#7E5A3C', 0.25);
  ctx.fillStyle = rgba(mix(base, '#F2D8AA', lit * 0.3), 0.9);
  ribbon(ctx, [x0, y0, (x0 + x1) / 2 + rnd.range(-0.2, 0.2), (y0 + y1) / 2, x1, y1], w, 0.05);
  // the shaded side of a round pole, the light down its left
  const dx = y1 - y0;
  const dy = x0 - x1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (dx / L) * w * 0.3;
  const ny = (dy / L) * w * 0.3;
  ctx.fillStyle = rgba('#4A3426', 0.32);
  ribbon(ctx, [x0 - nx, y0 - ny, x1 - nx, y1 - ny], w * 0.35, 0.05);
  ctx.fillStyle = rgba('#FFF0D0', 0.28);
  ribbon(ctx, [x0 + nx, y0 + ny, x1 + nx, y1 + ny], w * 0.22, 0.2);
}

function lash(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = rgba('#8A7A5A', 0.85);
  ctx.lineWidth = 0.55;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x - 1.8, y - 1.6 + k * 1.1);
    ctx.lineTo(x + 1.8, y - 0.8 + k * 1.1);
    ctx.stroke();
  }
}

function board(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, h: number): void {
  // the top surface (seen from a little above) from just off the wall to the front, then its front edge
  const y0 = BOARD_Y0 - h;
  const y1 = BOARD_Y1 - h;
  const n = 3;
  for (let k = 0; k < n; k++) {
    const a = y0 + ((y1 - y0) * k) / n;
    const b = y0 + ((y1 - y0) * (k + 1)) / n;
    const base = mix(rnd.pick(WOOD), '#F4DCAE', 0.25);
    ctx.fillStyle = rgba(base, 0.92);
    tracePoly(ctx, [x0, a + 0.15, x1, a + 0.1, x1, b - 0.1, x0, b - 0.15]);
    ctx.fill();
    ctx.strokeStyle = rgba('#6A4C34', 0.25);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x0, b);
    ctx.lineTo(x1, b);
    ctx.stroke();
    // grain and the odd splash of mortar
    for (let g = 0; g < (x1 - x0) / 18; g++) {
      ctx.strokeStyle = rgba('#8A6844', 0.18);
      const gx = rnd.range(x0, x1 - 8);
      ctx.beginPath();
      ctx.moveTo(gx, rnd.range(a + 0.6, b - 0.6));
      ctx.lineTo(gx + rnd.range(5, 14), rnd.range(a + 0.6, b - 0.6));
      ctx.stroke();
      if (rnd.chance(0.15)) {
        ctx.fillStyle = rgba('#E8E0D0', 0.7);
        ctx.beginPath();
        ctx.ellipse(rnd.range(x0, x1), rnd.range(a, b), rnd.range(0.6, 1.6), 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // the underside in shade (seen just under the front edge)
  ctx.fillStyle = rgba('#5A4232', 0.35);
  ctx.fillRect(x0, y1, x1 - x0, 1.2);
}

function toeBoard(ctx: CanvasRenderingContext2D, rnd: Rand, x0: number, x1: number, h: number): void {
  const y1 = BOARD_Y1 - h + 1.2;
  const y0 = y1 - 4.2;
  ctx.fillStyle = rgba(mix(rnd.pick(WOOD), '#7E5A3C', 0.15), 0.94);
  tracePoly(ctx, [x0, y0, x1, y0 + 0.2, x1, y1, x0, y1]);
  ctx.fill();
  ctx.fillStyle = rgba('#FFF0D0', 0.25);
  ctx.fillRect(x0, y0, x1 - x0, 0.6);
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.3;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

function ladder(ctx: CanvasRenderingContext2D, rnd: Rand, x: number, h0: number, h1: number): void {
  // a timber ladder leaning on the ledger above, its foot on the boards below (at the middle of the boards' depth)
  const yb = (BOARD_Y0 + BOARD_Y1) / 2 - h0;
  const yt = BOARD_Y0 - 1 - h1 - 12;
  const lean = 3;
  for (const s of [-4.2, 4.2]) pole(ctx, rnd, x + s, yb, x + s + lean, yt, 1.4, s < 0 ? 0.8 : 0.3);
  for (let y = yb - 5; y > yt + 3; y -= 6.5) {
    const t = (yb - y) / (yb - yt);
    pole(ctx, rnd, x - 4.2 + lean * t, y, x + 4.2 + lean * t, y, 0.9, 0.6);
  }
}

/** the hoist: a pole up the outer standard with an arm, a gin wheel under it, a cleat lower down */
function hoistFrame(ctx: CanvasRenderingContext2D, rnd: Rand, id: LoanId): void {
  const H = HOIST[id];
  const S = SCAFFOLD_X[id];
  // the pole is lashed up the end standard and an arm reaches out over the ground beyond the scaffold's end
  const px = HOUSE[id].outer === 1 ? Math.min(S.x0, S.x1) : Math.max(S.x0, S.x1);
  const wy = SCAFFOLD.y - H.wheelH;
  pole(ctx, rnd, px, SCAFFOLD.y - TOP + 30, px, wy - 12, 2, 0.6);
  pole(ctx, rnd, px, wy - 10, H.x - (px - H.x) * 0.3, wy - 10, 1.6, 0.7);
  lash(ctx, px, wy - 10);
  // the wheel: an iron sheave in a yoke
  ctx.strokeStyle = rgba('#2E2A30', 0.9);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(H.x, wy, 4.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.5;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(H.x + Math.cos(a) * 4, wy + Math.sin(a) * 4);
    ctx.lineTo(H.x - Math.cos(a) * 4, wy - Math.sin(a) * 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(H.x, wy - 10);
  ctx.lineTo(H.x, wy - 4.2);
  ctx.stroke();
}
/** the wheel's centre (world) */
export function wheel(id: LoanId): Pt {
  return { x: HOIST[id].x, y: SCAFFOLD.y - HOIST[id].wheelH };
}

/** standards along the scaffold (x) */
function standardsX(id: LoanId): number[] {
  const S = SCAFFOLD_X[id];
  const a = Math.min(S.x0, S.x1);
  const b = Math.max(S.x0, S.x1);
  const n = 6;
  return Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
}

export class ScaffoldView {
  readonly id: LoanId;
  private bands: Band[] = [];
  private box: Box;
  private q: number;
  /** the stack of struck timber on the ground (one sprite per lift's worth) */
  private stack: HTMLCanvasElement[] = [];
  /** the place of the struck timber on the ground (beside the house, outer end) */
  readonly stackAt: Pt;

  constructor(id: LoanId, q: number) {
    this.id = id;
    this.q = q;
    this.box = scaffoldBox(id);
    const H = HOUSE[id];
    this.stackAt = { x: H.outer === 1 ? H.wall.x0 - 6 : H.wall.x1 + 6, y: GROUND_Y + 30 };
    for (let i = 0; i < LIFTS; i++) this.bands.push(this.paintBand(i));
    for (let i = 0; i < LIFTS; i++) this.stack.push(this.paintStack(i));
  }

  private canvas(): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const b = this.box;
    const cv = makeCanvas(Math.ceil(b.w * this.q), Math.ceil(b.h * this.q));
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(this.q, 0, 0, this.q, -b.x * this.q, -b.y * this.q);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { cv, ctx };
  }

  private paintBand(i: number): Band {
    const id = this.id;
    const S = SCAFFOLD_X[id];
    const rnd = new Rand((id === 'a' ? 8100 : 8200) + i * 17);
    const [h0, h1] = bandRange(i);
    const xs = standardsX(id);
    const a = Math.min(S.x0, S.x1);
    const b = Math.max(S.x0, S.x1);
    const clip = (ctx: CanvasRenderingContext2D, yTop: number, yBot: number) => {
      ctx.beginPath();
      ctx.rect(a - 30, yTop, b - a + 60, yBot - yTop);
      ctx.clip();
    };
    // back: the inner standards (just off the wall), the ledger under the boards, the boards, the ladder up
    const back = this.canvas();
    back.ctx.save();
    clip(back.ctx, BOARD_Y0 - h1 - 2, BOARD_Y1 - h0 + 6);
    for (const x of xs) pole(back.ctx, rnd, x + 1.5, BOARD_Y0 - 1, x + 1.5, BOARD_Y0 - 1 - TOP, 1.6, 0.4);
    const lift = SCAFFOLD.lifts[i]!;
    if (lift > 0) {
      pole(back.ctx, rnd, a - 3, BOARD_Y0 - lift + 1.5, b + 3, BOARD_Y0 - lift + 1.5, 1.6, 0.6);
      board(back.ctx, rnd, a - 2, b + 2, lift);
    }
    if (i < LIFTS - 1) ladder(back.ctx, rnd, S.ladderX, lift, SCAFFOLD.lifts[i + 1]!);
    back.ctx.restore();
    // front: the outer standards, the ledger, the toe board, the guard rail
    const front = this.canvas();
    front.ctx.save();
    clip(front.ctx, SCAFFOLD.y - h1 - 2, SCAFFOLD.y - h0 + 8);
    for (const x of xs) {
      pole(front.ctx, rnd, x, SCAFFOLD.y + 2, x + rnd.range(-0.3, 0.3), SCAFFOLD.y - TOP, 2.1, 0.7);
      // a sole plate under each standard on the ground
      if (i === 0) {
        front.ctx.fillStyle = rgba('#8A6A4A', 0.8);
        front.ctx.fillRect(x - 4, SCAFFOLD.y + 1.2, 8, 1.8);
      }
    }
    if (lift > 0) {
      pole(front.ctx, rnd, a - 3, SCAFFOLD.y - lift + 1, b + 3, SCAFFOLD.y - lift + 1, 1.8, 0.7);
      toeBoard(front.ctx, rnd, a - 2, b + 2, lift);
      const rail = SCAFFOLD.y - lift - 30;
      pole(front.ctx, rnd, a - 3, rail, b + 3, rail, 1.4, 0.8);
      for (const x of xs) lash(front.ctx, x, rail);
      for (const x of xs) lash(front.ctx, x, SCAFFOLD.y - lift + 1);
    }
    // braces: a diagonal across each lift's outer bay
    if (i < LIFTS - 1) {
      const top = SCAFFOLD.lifts[i + 1]!;
      pole(front.ctx, rnd, xs[0]!, SCAFFOLD.y - lift, xs[1]!, SCAFFOLD.y - top, 1.2, 0.5);
      pole(front.ctx, rnd, xs[xs.length - 1]!, SCAFFOLD.y - lift, xs[xs.length - 2]!, SCAFFOLD.y - top, 1.2, 0.5);
    }
    if (i === LIFTS - 1) hoistFrame(front.ctx, rnd, id);
    front.ctx.restore();
    return { back: back.cv, front: front.cv };
  }

  /** the struck timber of one lift, stacked: a few boards and poles laid crosswise */
  private paintStack(i: number): HTMLCanvasElement {
    const { cv, ctx } = this.canvas();
    const rnd = new Rand((this.id === 'a' ? 8900 : 8950) + i * 7);
    const { x, y } = this.stackAt;
    const out = HOUSE[this.id].outer;
    const yy = y - i * 4.4;
    for (let k = 0; k < 2; k++) {
      const x0 = x - out * 4 - 26 + rnd.range(-2, 2);
      pole(ctx, rnd, x0, yy - k * 2.2, x0 + 54, yy - k * 2.2 + rnd.range(-0.6, 0.6), 2, 0.7);
    }
    ctx.strokeStyle = rgba(INK, 0.25);
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x - 30, yy + 1.2);
    ctx.lineTo(x + 30, yy + 1.2);
    ctx.stroke();
    return cv;
  }

  /**
   * How much of the scaffold is still up, from the strike's progress (0 standing … 1 all struck): the lifts come
   * down top first, each in its own slot; the one coming down is drawn moving toward the stack.
   */
  private state(p: number): { up: number; moving: number; k: number } {
    const slots = LIFTS;
    const f = clamp(p, 0, 1) * slots;
    const done = Math.floor(f);
    return { up: slots - done, moving: done < slots ? slots - 1 - done : -1, k: f - done };
  }

  private blit(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, dx = 0, dy = 0, alpha = 1): void {
    const b = this.box;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(cv, b.x + dx, b.y + dy, b.w, b.h);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  /** the lift being carried down: it slides down to the ground and across to the stack as it goes */
  private carried(i: number, k: number): { dx: number; dy: number; a: number } {
    const lift = SCAFFOLD.lifts[i]!;
    const e = k * k * (3 - 2 * k);
    const S = SCAFFOLD_X[this.id];
    const cx = (S.x0 + S.x1) / 2;
    return { dx: (this.stackAt.x - cx) * e * 0.2, dy: (lift + 30) * e, a: 1 - Math.max(0, (k - 0.7) / 0.3) };
  }

  /** the back layer (behind the bricklayer); `strike` 0 … 1 */
  drawBack(ctx: CanvasRenderingContext2D, strike: number): void {
    const s = this.state(strike);
    for (let i = 0; i < s.up; i++) {
      if (i === s.moving) {
        const m = this.carried(i, s.k);
        this.blit(ctx, this.bands[i]!.back, m.dx, m.dy, m.a);
      } else this.blit(ctx, this.bands[i]!.back);
    }
  }

  /** the front layer (in front of the bricklayer) */
  drawFront(ctx: CanvasRenderingContext2D, strike: number): void {
    const s = this.state(strike);
    for (let i = 0; i < s.up; i++) {
      if (i === s.moving) {
        const m = this.carried(i, s.k);
        this.blit(ctx, this.bands[i]!.front, m.dx, m.dy, m.a);
      } else this.blit(ctx, this.bands[i]!.front);
    }
  }

  /** the struck timber on the ground (grows as the lifts come down) */
  drawStack(ctx: CanvasRenderingContext2D, strike: number): void {
    const s = this.state(strike);
    const n = LIFTS - s.up + (s.moving >= 0 && s.k > 0.85 ? 1 : 0);
    for (let i = 0; i < Math.min(LIFTS, n); i++) this.blit(ctx, this.stack[i]!);
  }

  /** the lift (index) whose reach covers a height on the wall */
  static liftFor(h: number): number {
    const lifts = SCAFFOLD.lifts;
    let best = 0;
    for (let i = 0; i < lifts.length; i++) if (h >= lifts[i]! + SCAFFOLD.reach.low - 4) best = i;
    return best;
  }
}

/** the bricks stacked along the boards of the lift being worked, and the mortar board (drawn with the back layer) */
export function drawWorkingStock(ctx: CanvasRenderingContext2D, id: LoanId, lift: number, seed: number): void {
  const S = SCAFFOLD_X[id];
  const a = Math.min(S.x0, S.x1);
  const b = Math.max(S.x0, S.x1);
  const h = SCAFFOLD.lifts[lift]!;
  const y = BOARD_Y1 - h - 1;
  const rnd = new Rand(seed + lift * 31);
  for (let x = a + 20; x < b - 20; x += 64) {
    const sx = x + rnd.range(-6, 6);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3 - (r === 2 ? 1 : 0); c++) {
        ctx.fillStyle = rgba(rnd.pick(['#B4533B', '#BF6142', '#A94B37', '#C46B46']), 0.92);
        ctx.fillRect(sx + c * 6.2 + r * 1.4, y - 2.8 * (r + 1), 5.8, 2.6);
      }
    }
  }
  // the spot board with its heap of mortar
  const mx = (a + b) / 2 + 30;
  ctx.fillStyle = rgba('#B8946A', 0.9);
  ctx.fillRect(mx - 7, y - 1.6, 14, 1.6);
  ctx.fillStyle = rgba('#DCD4C4', 0.95);
  ctx.beginPath();
  ctx.ellipse(mx, y - 2.4, 5, 2, 0, Math.PI, 0);
  ctx.fill();
}
