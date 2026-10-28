/**
 * The bricklayer, on the scaffold along the front wall.
 *
 * 'lay': he works from the lift whose reach covers the place the next brick goes, standing on its boards facing the
 * wall, and lays in a steady rhythm: a brick from the stack at his feet, a stroke of mortar from the trowel, the
 * brick set in its place and tapped down with the trowel's handle. As the course runs along he walks along the boards
 * after it; when the work needs another lift he walks to the ladder at the inner end and climbs (or comes down) rung
 * by rung, hands on the rails. The roof and the chimney are worked from the top lift at full stretch.
 * 'rest': he comes down to the ground, walks out to the bench and sits beside the builder.
 * 'idle': he stands at the foot of the ladder, trowel in hand.
 * The bricks themselves are laid on the house by the money; his hands show it happening.
 */
import { clamp } from '../../vine/scene/gardenerMath';
import { rgba, tracePoly } from '../../scene/watercolor';
import type { Bricklayer, BricklayerIntent, CreateBricklayer } from './crewApi';
import { BENCH, GROUND_Y, HOUSE, SCAFFOLD, SCAFFOLD_X, depthScale } from './geom';
import { Figure, UNIT, type W3 } from './figure';
import { SEAT_H } from './props';
import type { LoanId } from '../types';

const STEP = 1 / 60;
/** depth on the boards, at the ladder, and on the ground in front of the scaffold */
const BOARD_Y = 474;
const LADDER_Y = 475;
const GROUND_STAND = 486;
/** a rung's spacing, and the climbing speed (world units a second) */
const RUNG = 6.5;
const CLIMB_V = 22;
const FACE_WALL = -Math.PI / 2;

type Phase = 'work' | 'toLadder' | 'climb' | 'offLadder' | 'toBench' | 'sit';

class BricklayerImpl implements Bricklayer {
  readonly id: LoanId;
  readonly fig: Figure;
  private phase: Phase = 'work';
  /** the lift he stands on (index), and the one a climb goes to */
  private lift = 0;
  private dest = 0;
  private climbFrom = 0;
  private t = 0;
  /** where along the boards he is working */
  private workX: number;
  private carrying = false;

  constructor(id: LoanId, q: number) {
    this.id = id;
    const S = SCAFFOLD_X[id];
    this.workX = S.ladderX;
    this.fig = new Figure('bricklayer', id, q, S.ladderX, GROUND_STAND, FACE_WALL, id === 'a' ? 37 : 43);
    this.fig.placeAt(S.ladderX, GROUND_STAND, FACE_WALL);
  }

  private get onGround(): boolean {
    return this.lift === 0;
  }

  /** the depth he stands at on lift i */
  private standY(i: number): number {
    return i === 0 ? GROUND_STAND : BOARD_Y;
  }

  /** the place to stand to work on `target` (clamped inside the scaffold) */
  private workSpot(x: number): number {
    const S = SCAFFOLD_X[this.id];
    const a = Math.min(S.x0, S.x1) + 10;
    const b = Math.max(S.x0, S.x1) - 10;
    return clamp(x, a, b);
  }

  /** the lift whose reach covers a height on the wall */
  private liftFor(h: number): number {
    const lifts = SCAFFOLD.lifts;
    let best = 0;
    for (let i = 0; i < lifts.length; i++) if (h >= lifts[i]! + SCAFFOLD.reach.low - 4) best = i;
    return best;
  }

  update(dtSec: number, it: BricklayerIntent, tSec: number, reduced: boolean): void {
    void tSec;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    if (reduced) {
      this.place(it);
      return;
    }
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n, it);
    this.fig.finish();
  }

  private step(h: number, it: BricklayerIntent): void {
    const f = this.fig;
    const S = SCAFFOLD_X[this.id];
    f.begin();
    this.t += h;
    const want = it.activity === 'rest' ? 0 : it.activity === 'lay' && it.target ? this.liftFor(it.target.h) : 0;
    if (this.phase !== 'climb' && this.phase !== 'sit' && this.phase !== 'toBench' && want !== this.lift) this.phase = 'toLadder';
    switch (this.phase) {
      case 'toLadder': {
        this.relax();
        if (f.goTo({ x: S.ladderX, y: this.onGround ? LADDER_Y + 9 : LADDER_Y }, FACE_WALL, 2)) {
          if (this.onGround) {
            // the last step in to the ladder's foot
            if (f.goTo({ x: S.ladderX, y: LADDER_Y }, FACE_WALL, 1.5)) this.startClimb(want);
          } else this.startClimb(want);
        }
        break;
      }
      case 'climb': {
        // up or down one rung at a time: the feet step from rung to rung, the hands go up the rails in turn
        const from = SCAFFOLD.lifts[this.climbFrom]!;
        const to = SCAFFOLD.lifts[this.dest]!;
        const e = f.elev.v;
        const phi = Math.abs(e - from) / RUNG;
        const k0 = Math.floor(phi);
        const fr = phi - k0;
        const dir = to > from ? 1 : -1;
        const S0 = f.frame().S;
        const rel = (rungIdx: number) => (from + dir * rungIdx * RUNG - e) / S0;
        const lead = k0 % 2;
        const stance = rel(k0);
        const swing = rel(k0 - 1 + 2 * fr) + Math.sin(Math.PI * fr) * 3;
        f.liftFeet(lead === 0 ? stance : swing, lead === 0 ? swing : stance, h);
        const railH = (i: number) => e + 46 + 4 * Math.sin(Math.PI * phi + i * Math.PI);
        f.hold(0, { x: S.ladderX - 4, y: LADDER_Y - 3, h: railH(0) }, 1, 0.3);
        f.hold(1, { x: S.ladderX + 4, y: LADDER_Y - 3, h: railH(1) }, 1, 0.3);
        f.face(FACE_WALL);
        if (!f.elev.moving) {
          this.lift = this.dest;
          f.liftFeet(0, 0, 1);
          f.holdBoth(null, null, 0, 0.35);
          this.phase = 'offLadder';
          this.t = 0;
        }
        break;
      }
      case 'offLadder': {
        // step off the ladder onto the boards (or the ground)
        const y = this.standY(this.lift);
        if (f.goTo({ x: S.ladderX + (HOUSE[this.id].outer === 1 ? -14 : 14), y }, null, 3)) this.phase = it.activity === 'rest' ? 'toBench' : 'work';
        break;
      }
      case 'work': {
        if (it.activity === 'rest') {
          this.phase = this.onGround ? 'toBench' : 'toLadder';
          break;
        }
        if (it.activity !== 'lay' || !it.target || this.onGround && it.activity === 'lay' && SCAFFOLD.lifts[want]! > 0) {
          this.relax();
          if (this.onGround) f.goTo({ x: S.ladderX + (HOUSE[this.id].outer === 1 ? -16 : 16), y: GROUND_STAND }, FACE_WALL, 3);
          break;
        }
        const tgt = it.target;
        const x = this.workSpot(tgt.x);
        // follow the course along the boards, a few steps at a time (never for every brick)
        if (Math.abs(x - this.workX) > 18) this.workX = x;
        const y = this.standY(this.lift);
        const there = f.goTo({ x: this.workX, y }, FACE_WALL, 3);
        if (!there || it.pace <= 0) {
          this.relax();
          break;
        }
        this.lay(tgt, it.pace);
        break;
      }
      case 'toBench': {
        this.relax();
        const b = BENCH[this.id];
        const k = depthScale(b.y);
        const s = { x: b.x + (this.id === 'a' ? 10 : -10), y: b.y + 3 * k };
        if (f.goTo(s, Math.PI / 2, 2)) this.phase = 'sit';
        break;
      }
      case 'sit': {
        f.seatHip = (SEAT_H + 2) / f.frame().S;
        f.sit(it.activity === 'rest', 1.4);
        f.lookT = it.activity === 'rest' ? { pitch: -0.35, yaw: this.id === 'a' ? -0.4 : 0.4 } : null;
        if (it.activity !== 'rest' && f.seat.v < 0.01 && !f.seat.moving) this.phase = 'work';
        break;
      }
    }
    f.step(h);
  }

  private startClimb(to: number): void {
    const f = this.fig;
    const next = to > this.lift ? this.lift + 1 : this.lift - 1;
    this.climbFrom = this.lift;
    this.dest = next;
    const dh = Math.abs(SCAFFOLD.lifts[next]! - SCAFFOLD.lifts[this.lift]!);
    // coming down is quicker than going up
    f.setElev(SCAFFOLD.lifts[next]!, dh / (next < this.lift ? CLIMB_V * 1.6 : CLIMB_V));
    this.phase = 'climb';
  }

  private relax(): void {
    const f = this.fig;
    f.crouchT = 0;
    f.leanT = 0;
    this.carrying = false;
    f.holdBoth(null, null, 0, 0.4);
  }

  /** one lay after another: brick from the stack, mortar, set it, tap it down */
  private lay(tgt: { x: number; h: number }, pace: number): void {
    const f = this.fig;
    const fr = f.frame();
    const cyc = clamp(1.25 / Math.max(0.6, Math.min(pace, 2.2)), 0.6, 1.6);
    const k = (this.t / cyc) % 1;
    const reachTop = fr.elev + SCAFFOLD.reach.high;
    const th = clamp(tgt.h, fr.elev + 10, reachTop);
    const wall: W3 = { x: clamp(tgt.x, fr.x - 24, fr.x + 24), y: GROUND_Y + 2, h: th };
    const stack: W3 = { x: fr.x + 12, y: fr.y - 1, h: fr.elev + 4 };
    const low = th - fr.elev < 30;
    if (k < 0.35) {
      // down to the stack for a brick
      f.crouchT = 0.6;
      f.leanT = 0.3;
      f.hold(0, stack, 1, 0.25);
      f.hold(1, { x: fr.x + 5, y: fr.y - 3, h: fr.elev + 32 }, 1, 0.3);
      this.carrying = k > 0.25;
    } else if (k < 0.7) {
      // the brick to its place, the trowel buttering beside it
      f.crouchT = low ? 0.45 : 0;
      f.leanT = low ? 0.25 : 0.05;
      f.hold(0, wall, 1, 0.25);
      f.hold(1, { x: wall.x + 5, y: wall.y + 2, h: wall.h + 2 }, 1, 0.25);
      this.carrying = true;
    } else {
      // let go, a tap with the trowel's handle
      this.carrying = false;
      f.hold(0, { x: wall.x - 3, y: wall.y + 4, h: wall.h - 4 }, 1, 0.25);
      const tap = Math.sin((k - 0.7) / 0.3 * Math.PI * 2) * 2;
      f.hold(1, { x: wall.x + 1, y: wall.y + 1, h: wall.h + 3 + tap }, 1, 0.12);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const f = this.fig;
    f.drawShadow(ctx);
    f.drawCached(ctx);
    // the trowel in the right hand, a brick in the left while he carries one
    const fr = f.frame();
    const k = fr.S / UNIT;
    const scr = (p: W3): [number, number] => [p.x, p.y - p.h];
    const t = scr(f.hand(1));
    ctx.save();
    ctx.translate(t[0], t[1]);
    ctx.rotate(-0.4);
    ctx.fillStyle = 'rgba(150,156,166,0.95)';
    tracePoly(ctx, [0, 0, 6 * k, -1.6 * k, 7.6 * k, 0, 6 * k, 1.6 * k]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,80,50,0.95)';
    ctx.lineWidth = 1.1 * k;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 * k, 0.3 * k);
    ctx.stroke();
    ctx.restore();
    if (this.carrying) {
      const b = scr(f.hand(0));
      ctx.fillStyle = rgba('#B85A3E', 0.96);
      ctx.fillRect(b[0] - 3 * k, b[1] - 2.2 * k, 6 * k, 2.4 * k);
      ctx.fillStyle = 'rgba(60,30,30,0.3)';
      ctx.fillRect(b[0] - 3 * k, b[1] - 0.4 * k, 6 * k, 0.6 * k);
    }
  }

  feet(): { x: number; y: number; h: number } {
    return this.fig.feet();
  }

  debug(): object {
    const f = this.fig.feet();
    return { phase: this.phase, lift: this.lift, dest: this.dest, x: Math.round(f.x), y: Math.round(f.y), elev: Math.round(f.h), walking: this.fig.walking, yaw: +this.fig.yaw.v.toFixed(2) };
  }

  place(it: BricklayerIntent): void {
    const S = SCAFFOLD_X[this.id];
    if (it.activity === 'rest') {
      const b = BENCH[this.id];
      const k = depthScale(b.y);
      this.lift = 0;
      this.fig.seatHip = (SEAT_H + 2) / (depthScale(b.y + 3 * k) * UNIT);
      this.fig.placeAt(b.x + (this.id === 'a' ? 10 : -10), b.y + 3 * k, Math.PI / 2, { seat: true });
      this.phase = 'sit';
      return;
    }
    if (it.activity === 'lay' && it.target) {
      this.lift = this.liftFor(it.target.h);
      this.workX = this.workSpot(it.target.x);
      this.fig.placeAt(this.workX, this.standY(this.lift), FACE_WALL, { elev: SCAFFOLD.lifts[this.lift]! });
      this.phase = 'work';
      return;
    }
    this.lift = 0;
    this.fig.placeAt(S.ladderX + (HOUSE[this.id].outer === 1 ? -16 : 16), GROUND_STAND, FACE_WALL);
    this.phase = 'work';
  }
}

export const createBricklayer: CreateBricklayer = (id: LoanId, spriteQ: number): Bricklayer => new BricklayerImpl(id, Math.max(1, spriteQ));
