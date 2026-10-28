/**
 * The builder, his wheelbarrow, and the hoist's rope and bucket.
 *
 * The round trip ('haul'), each step finished before the next begins:
 *   load    the barrow stands by the pallet; he steps to its side and moves bricks into it one at a time
 *   out     he takes up the handles and wheels it out of the gate to the lender's cart
 *   tip     he lifts the handles high: the interest share of the load slides over the wheel into the cart
 *   hoist   he wheels the rest back in to the foot of the hoist and sets the barrow down
 *   bucket  he moves those bricks into the bucket
 *   haul    he hauls the rope hand over hand; the bucket rises to the bricklayer's lift and tips onto the landing
 *   lower   he pays the rope out and the empty bucket comes down
 *   back    he takes up the handles and wheels the empty barrow back to the pallet
 * Paid off ('rest'): the barrow is set down by the pallet and he sits on the bench. Everything is done in order and
 * at a person's pace (the scene runs his clock at the playback speed); the money lays the bricks on the house, his
 * work is how we see where each payment goes.
 */
import { Rand } from '../../scene/prng';
import { rgba, tracePoly } from '../../scene/watercolor';
import { Mover, clamp } from '../../vine/scene/gardenerMath';
import { KAPPA } from '../../vine/scene/gardenerDims';
import type { Builder, BuilderIntent, CreateBuilder } from './crewApi';
import { BENCH, HOIST, SCAFFOLD, STACK, depthScale, type Pt } from './geom';
import { Figure, type W3 } from './figure';
import { SEAT_H } from './props';
import type { LoanId } from '../types';

const STEP = 1 / 60;
/** bricks in a full barrow load */
const LOAD = 4;
/** the barrow, in world units at the reference depth: from the grips to the wheel's axle, the wheel's radius */
const GRIP_TO_WHEEL = 46;
const WHEEL_R = 6;
/** from the builder's pelvis forward to the grips */
const REACH = 12;
/** the grips' height: held for wheeling, resting on the legs, lifted to tip */
const GRIP_HELD = 21;
const GRIP_REST = 9;
const GRIP_TIP = 36;

type Phase =
  | 'stand'
  | 'toLoad'
  | 'load'
  | 'takeUp'
  | 'out'
  | 'tip'
  | 'toHoist'
  | 'putDown'
  | 'toBucket'
  | 'bucket'
  | 'toRope'
  | 'haul'
  | 'top'
  | 'lower'
  | 'toGrips'
  | 'back'
  | 'toRest'
  | 'sit';

interface Falling {
  from: W3;
  to: W3;
  t: number;
  dur: number;
  seed: number;
}

/** the barrow: where its wheel touches the ground, the way it points, how high its grips are, what it carries */
class Barrow {
  /** the wheel's ground point (true ground units) and heading (unit, ground) */
  w = { x: 0, d: 0 };
  h = { x: 1, d: 0 };
  roll = 0;
  readonly grip = new Mover(GRIP_REST);
  load = 0;

  /** the grips' middle point (world, with height) */
  grips(): W3 {
    const k = depthScale(this.w.d * KAPPA);
    return { x: this.w.x - this.h.x * GRIP_TO_WHEEL * k, y: (this.w.d - this.h.d * GRIP_TO_WHEEL * k) * KAPPA, h: this.grip.v * k };
  }

  /** the two grips (world) for the hands: hand 0 on the figure's left */
  hands(): [W3, W3] {
    const g = this.grips();
    const k = depthScale(this.w.d * KAPPA);
    const lx = -this.h.d;
    const ld = this.h.x;
    const w = 6.5 * k;
    return [
      { x: g.x + lx * w, y: g.y + ld * w * KAPPA, h: g.h },
      { x: g.x - lx * w, y: g.y - ld * w * KAPPA, h: g.h },
    ];
  }

  /** set from a pelvis frame (held): the grips just ahead of the pelvis, the wheel beyond */
  fromFrame(px: number, py: number, yaw: number): void {
    const k = depthScale(py);
    const hx = Math.cos(yaw);
    const hd = Math.sin(yaw);
    const nw = { x: px + hx * (REACH + GRIP_TO_WHEEL) * k, d: py / KAPPA + hd * (REACH + GRIP_TO_WHEEL) * k };
    const moved = (nw.x - this.w.x) * hx + (nw.d - this.w.d) * hd;
    this.roll += moved / (WHEEL_R * k);
    this.w = nw;
    this.h = { x: hx, d: hd };
  }

  /** the tray's middle (world, with height), where bricks go in and come out */
  tray(): W3 {
    const k = depthScale(this.w.d * KAPPA);
    const u = 17 * k;
    const z = WHEEL_R + (this.grip.v - WHEEL_R) * (17 / GRIP_TO_WHEEL);
    return { x: this.w.x - this.h.x * u, y: (this.w.d - this.h.d * u) * KAPPA, h: (z + 6) * k };
  }

  /** the tray's front lip (world): where a tipped load leaves it */
  lip(): W3 {
    const k = depthScale(this.w.d * KAPPA);
    return { x: this.w.x - this.h.x * 4 * k, y: (this.w.d - this.h.d * 4 * k) * KAPPA, h: (WHEEL_R + 8) * k };
  }

  draw(ctx: CanvasRenderingContext2D, seed: number): void {
    const k = depthScale(this.w.d * KAPPA);
    const lx = -this.h.d;
    const ld = this.h.x;
    // a point along the barrow (u back from the wheel's axle), across it (v, to its left) and up (z above the line
    // from the axle to the grips)
    const gz = this.grip.v;
    const zl = (u: number) => WHEEL_R + (gz - WHEEL_R) * (u / GRIP_TO_WHEEL);
    const P = (u: number, v: number, z: number): [number, number] => {
      const x = this.w.x - this.h.x * u * k + lx * v * k;
      const d = this.w.d - this.h.d * u * k + ld * v * k;
      return [x, d * KAPPA - (zl(u) + z) * k];
    };
    const ground = (u: number, v: number): [number, number] => {
      const x = this.w.x - this.h.x * u * k + lx * v * k;
      const d = this.w.d - this.h.d * u * k + ld * v * k;
      return [x, d * KAPPA];
    };
    const near = ld >= 0 ? 1 : -1;
    const poly = (pts: Array<[number, number]>, col: string, a: number, ink = 0.45) => {
      ctx.fillStyle = rgba(col, a);
      tracePoly(ctx, pts.flat());
      ctx.fill();
      if (ink > 0) {
        ctx.strokeStyle = rgba('#3B2A22', ink);
        ctx.lineWidth = 0.35 * k;
        ctx.stroke();
      }
    };
    // its shadow
    const s0 = ground(-20, 0);
    ctx.fillStyle = 'rgba(60,56,64,0.15)';
    ctx.beginPath();
    ctx.ellipse(s0[0] + 3 * k, s0[1] + 0.8, 22 * k, 3.6 * k, Math.atan2(this.h.d * KAPPA, this.h.x) * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // the far handle and leg
    const handle = (v: number, col: string) => {
      const a = P(GRIP_TO_WHEEL + 2, v, 0);
      const b = P(4, v * 0.8, 0);
      ctx.strokeStyle = rgba(col, 0.95);
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      const l0 = P(30, v * 0.9, 0);
      const lb = [l0[0], l0[1] + (zl(30) - 0.2) * k] as [number, number];
      ctx.lineWidth = 1.1 * k;
      ctx.beginPath();
      ctx.moveTo(l0[0], l0[1]);
      ctx.lineTo(lb[0], lb[1]);
      ctx.stroke();
    };
    handle(-near * 6.5, '#7A5A3C');
    // the tray: a steel pan, deeper at the front, its far side's inside, the load, then its near side
    const T0 = 6;
    const T1 = 30;
    const tray = (u: number, v: number, top: boolean) => P(u, v, top ? (u < 12 ? 10 : 8) : 1.5);
    poly([tray(T0, -near * 9, true), tray(T1, -near * 9, true), tray(T1, near * 9, true), tray(T0, near * 9, true)], '#56606E', 0.95, 0.5);
    poly([tray(T0, -near * 9, false), tray(T1, -near * 8, false), tray(T1, -near * 9, true), tray(T0, -near * 9, true)], '#6E7886', 0.95, 0.3);
    if (this.load > 0) {
      const rnd = new Rand(seed);
      for (let i = 0; i < this.load; i++) {
        const u = T0 + 5 + (i % 3) * 7 + rnd.range(-1, 1);
        const v = (Math.floor(i / 3) - 0.5) * 7 + rnd.range(-1, 1);
        const p = P(u, v, 7 + Math.floor(i / 3) * 1.5);
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(rnd.range(-0.25, 0.25));
        ctx.fillStyle = rgba(rnd.pick(['#B4533B', '#BF6142', '#A94B37', '#C46B46']), 0.96);
        ctx.fillRect(-3 * k, -1.1 * k, 6 * k, 2.2 * k);
        ctx.fillStyle = 'rgba(60,30,30,0.3)';
        ctx.fillRect(-3 * k, 0.5 * k, 6 * k, 0.6 * k);
        ctx.restore();
      }
    }
    poly([tray(T0, near * 9, false), tray(T1, near * 8, false), tray(T1, near * 9, true), tray(T0, near * 9, true)], '#7E8A98', 0.96, 0.45);
    poly([tray(T0 - 0.5, -near * 9, true), tray(T0 - 0.5, near * 9, true), tray(T0 + 1, near * 8, false), tray(T0 + 1, -near * 8, false)], '#6A7482', 0.95, 0.4);
    // the wheel: a spoked iron-rimmed wheel turning with the distance rolled
    const wc = ground(0, 0);
    const cy = wc[1] - WHEEL_R * k;
    const pts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 2;
      pts.push(wc[0] + Math.cos(t) * WHEEL_R * k * Math.abs(this.h.x) * 0.9 + Math.cos(t) * WHEEL_R * k * 0.12, cy + Math.sin(t) * WHEEL_R * k);
    }
    ctx.strokeStyle = 'rgba(46,40,40,0.95)';
    ctx.lineWidth = 1.3 * k;
    tracePoly(ctx, pts);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,96,70,0.9)';
    ctx.lineWidth = 0.6 * k;
    for (let s = 0; s < 4; s++) {
      const t = this.roll + (s / 4) * Math.PI;
      const rx = Math.cos(t) * WHEEL_R * k * (Math.abs(this.h.x) * 0.9 + 0.12);
      const ry = Math.sin(t) * WHEEL_R * k;
      ctx.beginPath();
      ctx.moveTo(wc[0] - rx, cy - ry);
      ctx.lineTo(wc[0] + rx, cy + ry);
      ctx.stroke();
    }
    handle(near * 6.5, '#8A6844');
  }
}

/** the hoist's bucket and its rope */
class Bucket {
  /** its height above the ground (world) */
  readonly h = new Mover(0);
  /** how far it is tipped (0 … 1) */
  readonly tip = new Mover(0);
  load = 0;
  readonly x: number;
  readonly y = SCAFFOLD.y + 3;
  readonly wheelY: number;
  constructor(id: LoanId) {
    this.x = HOIST[id].x;
    this.wheelY = SCAFFOLD.y - HOIST[id].wheelH;
  }
  /** the rope's fall on the haul side (where the hands take it), at a height */
  fall(id: LoanId, h: number): W3 {
    return { x: this.x + (id === 'a' ? -4 : 4), y: this.y, h };
  }
  draw(ctx: CanvasRenderingContext2D, id: LoanId, hands: W3[] | null): void {
    const k = depthScale(this.y);
    const by = this.y - this.h.v;
    const out = id === 'a' ? -1 : 1;
    // the rope: up from the bucket's bail to the wheel, over it, and down the other side to the hands (or slack)
    ctx.strokeStyle = 'rgba(150,130,96,0.95)';
    ctx.lineWidth = 0.7 * k;
    ctx.beginPath();
    ctx.moveTo(this.x + 4 * -out * 0, by - 9 * k);
    ctx.lineTo(this.x - out * 4 * 0 + 4 * -out * -1 * 0, this.wheelY);
    ctx.stroke();
    ctx.beginPath();
    const fx = this.x + out * 4;
    ctx.moveTo(fx, this.wheelY);
    if (hands && hands.length) {
      const hi = hands.reduce((a, b) => (b.h > a.h ? b : a));
      const lo = hands.reduce((a, b) => (b.h < a.h ? b : a));
      ctx.lineTo(hi.x, hi.y - hi.h);
      ctx.lineTo(lo.x, lo.y - lo.h);
      ctx.quadraticCurveTo(lo.x + out * 2, lo.y - lo.h + 8, lo.x + out * 5, this.y + 6);
    } else {
      // slack: hanging down the standard and coiled at its foot
      ctx.lineTo(fx + out * 0.5, this.y - 6);
      ctx.quadraticCurveTo(fx + out * 3, this.y + 1, fx + out * 7, this.y + 4);
    }
    ctx.stroke();
    // the bucket: a galvanised pail, tipped toward the scaffold at the top
    ctx.save();
    ctx.translate(this.x, by);
    ctx.rotate(-out * this.tip.v * 0.9);
    const w0 = 4.4 * k;
    const w1 = 3.4 * k;
    const hh = 7 * k;
    ctx.fillStyle = 'rgba(136,146,156,0.97)';
    tracePoly(ctx, [-w0, -hh, w0, -hh, w1, 0, -w1, 0]);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,64,74,0.35)';
    tracePoly(ctx, [w0 * 0.2, -hh, w0, -hh, w1, 0, w1 * 0.2, 0]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(46,44,50,0.7)';
    ctx.lineWidth = 0.4 * k;
    tracePoly(ctx, [-w0, -hh, w0, -hh, w1, 0, -w1, 0]);
    ctx.stroke();
    for (let i = 0; i < this.load; i++) {
      ctx.fillStyle = rgba(['#B4533B', '#BF6142', '#A94B37'][i % 3]!, 0.96);
      ctx.fillRect(-w0 + 0.6 * k + (i % 2) * 3.6 * k, -hh - 1.6 * k - Math.floor(i / 2) * 1.6 * k, 3.4 * k, 1.6 * k);
    }
    // the bail up to the rope
    ctx.strokeStyle = 'rgba(70,70,80,0.9)';
    ctx.lineWidth = 0.45 * k;
    ctx.beginPath();
    ctx.moveTo(-w0, -hh);
    ctx.quadraticCurveTo(0, -hh - 4 * k, w0, -hh);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ the builder */

/** a station of house A, mirrored for B (x reflected, facing reflected) */
const station = (id: LoanId, x: number, y: number, yaw: number): { x: number; y: number; yaw: number } =>
  id === 'a' ? { x, y, yaw } : { x: 1000 - x, y, yaw: Math.PI - yaw };

class BuilderImpl implements Builder {
  readonly id: LoanId;
  readonly fig: Figure;
  private barrow = new Barrow();
  private bucket: Bucket;
  private phase: Phase = 'stand';
  private holding = false;
  private t = 0;
  private reps = 0;
  private toCart = 0;
  private falling: Falling[] = [];
  private nfall = 0;
  private hauling = false;
  private seed: number;

  constructor(id: LoanId, q: number) {
    this.id = id;
    this.seed = id === 'a' ? 71 : 79;
    this.bucket = new Bucket(id);
    const p = this.park();
    this.fig = new Figure('builder', id, q, p.x, p.y, p.yaw, this.seed);
    this.parkBarrow();
    this.fig.placeAt(p.x, p.y, p.yaw, { hands: this.barrow.hands() });
    this.holding = true;
  }

  /* stations (world): where he stands at each step */
  private park() {
    return station(this.id, 108, 522, 0);
  }
  private loadStand() {
    return station(this.id, 140, 510, Math.PI / 2);
  }
  private hoistPark() {
    return station(this.id, 128, 492, Math.PI);
  }
  private bucketStand() {
    return station(this.id, 100, 482, Math.PI * 0.86);
  }
  private ropeStand() {
    return station(this.id, 76, 494, -Math.PI / 2 + 0.35);
  }
  private gateIn() {
    return station(this.id, 168, 520, Math.PI / 2);
  }

  private parkBarrow(): void {
    const p = this.park();
    this.barrow.fromFrame(p.x, p.y, p.yaw);
    this.barrow.grip.snap(GRIP_REST);
  }

  /** the pelvis spot that puts the barrow's wheel just short of the cart's side, wheeling straight at it */
  private cartStand(tip: Pt): { x: number; y: number; yaw: number } {
    const k = depthScale(tip.y);
    const yaw = Math.PI / 2;
    return { x: tip.x, y: tip.y - KAPPA * (REACH + GRIP_TO_WHEEL + 3) * k, yaw };
  }

  private next(p: Phase): void {
    this.phase = p;
    this.t = 0;
    this.reps = 0;
  }

  update(dtSec: number, it: BuilderIntent, tSec: number, reduced: boolean): void {
    void tSec;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    if (reduced) {
      this.place(it);
      return;
    }
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n, it);
    this.fig.finish();
    if (this.holding) {
      const fr = this.fig.frame();
      this.barrow.fromFrame(fr.x, fr.y, fr.yaw);
    }
  }

  private step(h: number, it: BuilderIntent): void {
    const f = this.fig;
    const B = this.barrow;
    f.begin();
    this.t += h;
    B.grip.update(h);
    this.bucket.h.update(h);
    this.bucket.tip.update(h);
    for (const fl of this.falling) fl.t += h;
    this.falling = this.falling.filter((fl) => fl.t < fl.dur);
    // hands on the grips whenever he has the barrow (the grips' height follows the Mover)
    if (this.holding) f.holdBoth(...B.hands(), 1, 0.35);
    const rest = it.activity === 'rest';
    if (rest && !['toRest', 'sit', 'putDown'].includes(this.phase) && !this.hauling) {
      this.next(this.holding ? 'putDown' : 'toRest');
    }
    switch (this.phase) {
      case 'stand': {
        f.crouchT = 0;
        f.leanT = 0;
        if (it.activity === 'haul' && it.pace > 0) this.next(B.load > 0 ? 'takeUp' : this.holding ? 'putDown' : 'toLoad');
        break;
      }
      case 'putDown': {
        // lower the barrow onto its legs, let go
        B.grip.go(GRIP_REST, 0.5);
        if (!B.grip.moving && B.grip.v <= GRIP_REST + 0.01) {
          this.holding = false;
          f.holdBoth(null, null, 0, 0.35);
          if (f.wHold[0].v < 0.05) {
            if (rest) this.next('toRest');
            else if (B.load === 0) this.next('toLoad');
            else this.next('toBucket');
          }
        }
        break;
      }
      case 'toLoad': {
        const s = this.loadStand();
        if (f.goTo(s, s.yaw, 2.5)) this.next('load');
        break;
      }
      case 'load': {
        // a brick from the pallet (hand 0, crouched), into the tray (both hands); LOAD times
        const cyc = 0.75;
        const ph = this.t / cyc;
        const pal: W3 = { x: STACK[this.id].x, y: STACK[this.id].y, h: 13 };
        const tr = B.tray();
        f.crouchT = 0.55;
        f.leanT = 0.35;
        const k = ph % 1;
        if (k < 0.45) {
          f.hold(0, pal, 1, 0.3);
          f.hold(1, null, 0, 0.3);
        } else {
          f.hold(0, { x: tr.x - 2, y: tr.y, h: tr.h + 2 }, 1, 0.3);
          f.hold(1, { x: tr.x + 2, y: tr.y, h: tr.h + 2 }, 1, 0.3);
        }
        const done = Math.floor(ph + 0.3);
        if (done > this.reps && this.reps < LOAD) {
          this.reps = done;
          B.load = Math.min(LOAD, done);
        }
        if (ph >= LOAD + 0.25) {
          B.load = LOAD;
          f.crouchT = 0;
          f.leanT = 0;
          f.holdBoth(null, null, 0, 0.4);
          this.next('takeUp');
        }
        break;
      }
      case 'takeUp': {
        // to the grips, facing along the barrow, and lift it
        const g = B.grips();
        const k = depthScale(g.y);
        const yaw = Math.atan2(B.h.d, B.h.x);
        const at = { x: g.x - B.h.x * REACH * k, y: g.y - B.h.d * REACH * k * KAPPA };
        if (!this.holding) {
          if (f.goTo(at, yaw, 2)) {
            f.holdBoth(...B.hands(), 1, 0.4);
            f.crouchT = 0.25;
            if (f.wHold[0].v > 0.95) {
              this.holding = true;
              f.crouchT = 0;
            }
          }
        } else {
          B.grip.go(GRIP_HELD, 0.45);
          if (!B.grip.moving) this.next(B.load > 0 ? 'out' : 'back');
        }
        break;
      }
      case 'out': {
        // out of the gate to the cart (or wait in the gateway for one)
        if (!it.cart) {
          const g = this.gateIn();
          f.goTo(g, g.yaw, 3);
          break;
        }
        const s = this.cartStand(it.cart);
        const g = this.gateIn();
        if (this.reps === 0) {
          if (f.goTo(g, null, 8)) this.reps = 1;
        } else if (f.goTo(s, s.yaw, 2.5)) {
          this.toCart = Math.round(LOAD * clamp(it.split, 0, 1));
          this.next('tip');
        }
        break;
      }
      case 'tip': {
        // lift the grips high: the load slides forward over the wheel; the interest share goes into the cart
        if (this.reps === 0) {
          B.grip.go(GRIP_TIP, 0.6);
          f.leanT = 0.1;
          if (!B.grip.moving) {
            this.reps = 1;
            const tipTo = it.cart;
            for (let i = 0; i < this.toCart; i++) {
              const lip = B.lip();
              this.falling.push({ from: lip, to: { x: (tipTo?.x ?? lip.x) + (i - this.toCart / 2) * 3, y: (tipTo?.y ?? lip.y) + 3, h: 14 }, t: -i * 0.09, dur: 0.38 + i * 0.09, seed: this.nfall++ });
            }
            B.load -= this.toCart;
          }
        } else {
          if (this.t > 0.9) {
            B.grip.go(GRIP_HELD, 0.5);
            f.leanT = 0;
            if (!B.grip.moving) this.next(B.load > 0 ? 'toHoist' : 'back');
          }
        }
        break;
      }
      case 'toHoist': {
        const g = this.gateIn();
        const s = this.hoistPark();
        if (this.reps === 0) {
          if (f.goTo(g, null, 8)) this.reps = 1;
        } else if (f.goTo(s, s.yaw, 2.5)) this.next('putDown');
        break;
      }
      case 'toBucket': {
        const s = this.bucketStand();
        if (f.goTo(s, s.yaw, 2.5)) this.next('bucket');
        break;
      }
      case 'bucket': {
        const cyc = 0.7;
        const ph = this.t / cyc;
        const tr = B.tray();
        const bk: W3 = { x: this.bucket.x, y: this.bucket.y, h: 8 };
        f.crouchT = 0.6;
        f.leanT = 0.35;
        const k = ph % 1;
        f.holdBoth(k < 0.45 ? { x: tr.x - 1.5, y: tr.y, h: tr.h + 1 } : { x: bk.x - 1.5, y: bk.y, h: bk.h }, k < 0.45 ? { x: tr.x + 1.5, y: tr.y, h: tr.h + 1 } : { x: bk.x + 1.5, y: bk.y, h: bk.h }, 1, 0.28);
        const done = Math.floor(ph + 0.45);
        if (done > this.reps && B.load > 0) {
          this.reps = done;
          B.load--;
          this.bucket.load++;
        }
        if (B.load === 0 && k > 0.8) {
          f.crouchT = 0;
          f.leanT = 0;
          f.holdBoth(null, null, 0, 0.4);
          this.next('toRope');
        }
        break;
      }
      case 'toRope': {
        const s = this.ropeStand();
        if (f.goTo(s, s.yaw, 2.5)) {
          this.hauling = true;
          this.next('haul');
        }
        break;
      }
      case 'haul': {
        // hand over hand: each pull brings the bucket up a stroke; the hands take turns high and low on the rope
        const lift = Math.max(SCAFFOLD.lifts[1]!, it.lift) + 10;
        const stroke = 0.55;
        const ph = this.t / stroke;
        const k = ph % 1;
        const top = 50;
        const low = 30;
        const hiHand = Math.floor(ph) % 2;
        const a = top - (top - low) * k;
        const b = low + (top - low) * k;
        const fl = (hh: number) => this.bucket.fall(this.id, hh);
        f.hold(hiHand as 0 | 1, fl(a), 1, 0.2);
        f.hold((1 - hiHand) as 0 | 1, fl(k < 0.5 ? low : b), 1, 0.2);
        f.leanT = -0.08 + 0.06 * Math.sin(k * Math.PI);
        const want = Math.min(lift, ph * 22);
        if (want > this.bucket.h.target) this.bucket.h.go(want, stroke);
        if (this.bucket.h.v >= lift - 0.5) this.next('top');
        break;
      }
      case 'top': {
        // the bucket swings in and tips its bricks onto the landing
        this.bucket.tip.go(1, 0.45);
        if (this.t > 0.5) this.bucket.load = 0;
        if (this.t > 0.9) {
          this.bucket.tip.go(0, 0.4);
          this.next('lower');
        }
        break;
      }
      case 'lower': {
        // paying the rope out: the hands slide down it together as the empty bucket comes down
        const fl = (hh: number) => this.bucket.fall(this.id, hh);
        f.holdBoth(fl(46), fl(36), 1, 0.25);
        if (this.reps === 0) {
          this.bucket.h.go(0, Math.max(0.8, this.bucket.h.v / 70));
          this.reps = 1;
        }
        if (!this.bucket.h.moving && this.bucket.h.v <= 0.01) {
          this.hauling = false;
          f.holdBoth(null, null, 0, 0.4);
          f.leanT = 0;
          this.next('takeUp');
        }
        break;
      }
      case 'back': {
        const p = this.park();
        const g = this.gateIn();
        if (this.reps === 0 && f.frame().y > g.y + 6) {
          if (f.goTo(g, null, 8)) this.reps = 1;
        } else if (f.goTo(p, p.yaw, 2.5)) this.next('putDown');
        break;
      }
      case 'toRest': {
        f.holdBoth(null, null, 0, 0.4);
        const b = BENCH[this.id];
        const k = depthScale(b.y);
        const s = { x: b.x - (this.id === 'a' ? 9 : -9), y: b.y + 3 * k };
        if (f.goTo(s, Math.PI / 2, 2)) this.next('sit');
        break;
      }
      case 'sit': {
        f.seatHip = (SEAT_H + 2) / f.frame().S;
        f.sit(rest, 1.4);
        f.lookT = rest ? { pitch: -0.35, yaw: this.id === 'a' ? -0.5 : 0.5 } : null;
        if (!rest && f.seat.v < 0.01 && !f.seat.moving) this.next('stand');
        break;
      }
      default:
        break;
    }
    f.step(h);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const f = this.fig;
    const B = this.barrow;
    const fr = f.frame();
    // the bucket and rope first (they hang beside the scaffold), then barrow and builder in depth order
    // (the hoist comes down with the scaffold: no rope or bucket once he is resting)
    if (this.phase !== 'toRest' && this.phase !== 'sit') this.bucket.draw(ctx, this.id, this.hauling ? [f.hand(0), f.hand(1)] : null);
    const behind = B.w.d * KAPPA < fr.y;
    if (behind) B.draw(ctx, this.seed);
    f.drawShadow(ctx);
    f.drawCached(ctx);
    if (!behind) B.draw(ctx, this.seed);
    // bricks tumbling from the tray into the cart
    for (const fl of this.falling) {
      if (fl.t < 0) continue;
      const u = clamp(fl.t / (fl.dur - (fl.dur - 0.38)), 0, 1);
      const x = fl.from.x + (fl.to.x - fl.from.x) * u;
      const y = fl.from.y + (fl.to.y - fl.from.y) * u;
      const hh = fl.from.h + (fl.to.h - fl.from.h) * u + 10 * Math.sin(Math.PI * u) * 0.5;
      const k = depthScale(y);
      ctx.save();
      ctx.translate(x, y - hh);
      ctx.rotate(u * 2.4 + fl.seed);
      ctx.fillStyle = rgba(['#B4533B', '#BF6142', '#A94B37'][fl.seed % 3]!, 0.96);
      ctx.fillRect(-3 * k, -1.1 * k, 6 * k, 2.2 * k);
      ctx.restore();
    }
  }

  debug(): object {
    const f = this.fig.feet();
    return { phase: this.phase, t: +this.t.toFixed(2), reps: this.reps, load: this.barrow.load, holding: this.holding, x: Math.round(f.x), y: Math.round(f.y), yaw: +this.fig.yaw.v.toFixed(2) };
  }

  feet(): Pt {
    const f = this.fig.feet();
    return { x: f.x, y: f.y };
  }

  place(it: BuilderIntent): void {
    this.falling = [];
    this.hauling = false;
    this.bucket.h.snap(0);
    this.bucket.tip.snap(0);
    this.bucket.load = 0;
    this.barrow.load = 0;
    this.parkBarrow();
    if (it.activity === 'rest') {
      this.holding = false;
      const b = BENCH[this.id];
      const k = depthScale(b.y);
      const x = b.x - (this.id === 'a' ? 9 : -9);
      this.fig.seatHip = (SEAT_H + 2) / (depthScale(b.y + 3 * k) * (64 / 122));
      this.fig.placeAt(x, b.y + 3 * k, Math.PI / 2, { seat: true });
      this.next('sit');
      return;
    }
    const p = this.park();
    this.holding = true;
    this.barrow.grip.snap(GRIP_REST);
    this.fig.placeAt(p.x, p.y, p.yaw, { hands: this.barrow.hands() });
    this.next('stand');
  }
}

export const createBuilder: CreateBuilder = (id: LoanId, spriteQ: number): Builder => new BuilderImpl(id, Math.max(1, spriteQ));
