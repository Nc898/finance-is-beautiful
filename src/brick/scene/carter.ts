/**
 * The lender's carter and his cart. The cart is a two-wheeled wooden handcart with shafts, its side board lettered
 * LENDER, its heap of bricks (the interest) painted with an area proportional to how full it is. It is pulled like a
 * trailer: the carter walks between the shafts holding their ends, and the cart's axle follows that hitch at a fixed
 * distance, so it swings round behind him on a turn and its wheels roll exactly with the distance it travels. It is
 * always pulled forward, never pushed back.
 *
 * The carter (a Figure dressed in a dark coat and a bowler): 'arrive' pulls the cart along the route (down the road
 * from the village, round the junction, along the lane) to its spot and sets the shafts down; 'wait' stands by them
 * at ease, a look at the pocket watch now and then; 'leave' takes the shafts up again and pulls the cart out of the
 * picture at the exit.
 */
import { Rand } from '../../scene/prng';
import { rgba, tracePoly } from '../../scene/watercolor';
import { mix } from '../../river/scene/boatInk';
import { Mover, clamp } from '../../vine/scene/gardenerMath';
import { KAPPA } from '../../vine/scene/gardenerDims';
import type { Carter, CarterIntent, CreateCarter } from './crewApi';
import { EXIT, JUNCTION, ROAD_FAR, depthScale, type Pt } from './geom';
import { Figure, type W3 } from './figure';
import { Cached, r4 } from './cache';
import type { LoanId } from '../types';

const INK = '#3B2A22';
/** the cart (world units at the reference depth, scaled with depth) */
const BED_L = 40;
const BED_W = 22;
const BED_H = 13;
const SIDE_H = 7;
const WHEEL_R = 11;
/** from the axle to the hitch (the carter's hands) along the shafts */
const DRAW = 50;
/** the shafts' ends: held, and resting on the ground */
const HELD_H = 26;
const REST_H = 4;
const STEP = 1 / 60;

/** a 2D point in true ground units (d = depth y / KAPPA) */
interface G {
  x: number;
  d: number;
}

export class Cart {
  /** the axle (true ground units) and the unit heading the shafts point along */
  a: G;
  h: G;
  /** how far the wheels have turned (radians) */
  roll = 0;
  /** the shafts' end height (world), from held to resting */
  readonly shaft = new Mover(REST_H);
  fill = 0;
  private seed: number;
  private readonly cache = new Cached();

  constructor(axle: Pt, heading: G, seed: number) {
    this.a = { x: axle.x, d: axle.y / KAPPA };
    const l = Math.hypot(heading.x, heading.d) || 1;
    this.h = { x: heading.x / l, d: heading.d / l };
    this.seed = seed;
  }

  /** the hitch (between the shaft ends), true ground units */
  hitch(): G {
    return { x: this.a.x + this.h.x * DRAW, d: this.a.d + this.h.d * DRAW };
  }

  /** follow the hitch as a trailer: the axle trails it at DRAW */
  pull(to: G): void {
    const vx = to.x - this.a.x;
    const vd = to.d - this.a.d;
    const l = Math.hypot(vx, vd) || 1;
    const nh = { x: vx / l, d: vd / l };
    const na = { x: to.x - nh.x * DRAW, d: to.d - nh.d * DRAW };
    const moved = (na.x - this.a.x) * nh.x + (na.d - this.a.d) * nh.d;
    this.roll += moved / WHEEL_R;
    this.a = na;
    this.h = nh;
  }

  axleWorld(): Pt {
    return { x: this.a.x, y: this.a.d * KAPPA };
  }

  /** world point at (along the heading, across to its left, height) from the axle, scaled for depth */
  private P(u: number, v: number, z: number): [number, number] {
    const k = depthScale(this.a.d * KAPPA);
    const lx = -this.h.d;
    const ld = this.h.x;
    const x = this.a.x + (this.h.x * u + lx * v) * k;
    const d = this.a.d + (this.h.d * u + ld * v) * k;
    return [x, d * KAPPA - z * k];
  }

  /** the point on the bed's side nearer the gardens (smaller depth) where the builder tips */
  tipPoint(): Pt {
    const k = depthScale(this.a.d * KAPPA);
    const lx = -this.h.d;
    const ld = this.h.x;
    const sg = ld < 0 ? 1 : -1;
    return { x: this.a.x + lx * sg * (BED_W / 2 + 4) * k, y: (this.a.d + ld * sg * (BED_W / 2 + 4) * k) * KAPPA };
  }

  /** the shaft ends (world) for the carter's two hands */
  shaftEnds(): [W3, W3] {
    const k = depthScale(this.a.d * KAPPA);
    const lx = -this.h.d;
    const ld = this.h.x;
    const c = this.hitch();
    const w = (BED_W / 2 - 2) * k;
    return [
      { x: c.x + lx * w, y: (c.d + ld * w) * KAPPA, h: this.shaft.v * k },
      { x: c.x - lx * w, y: (c.d - ld * w) * KAPPA, h: this.shaft.v * k },
    ];
  }

  /** draw through a cached picture (a parked cart is painted once) */
  drawCached(ctx: CanvasRenderingContext2D): void {
    const sig = [r4(this.a.x, 0.1), r4(this.a.d, 0.1), r4(this.h.x, 0.004), r4(this.h.d, 0.004), r4(this.roll, 0.04), r4(this.shaft.v, 0.2), r4(this.fill, 0.01)].join('|');
    const a = this.axleWorld();
    this.cache.draw(ctx, { x: a.x - 80, y: a.y - 70, w: 160, h: 90 }, sig, (c) => this.draw(c));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const rnd = new Rand(this.seed);
    const k = depthScale(this.a.d * KAPPA);
    // the bed tilts on its axle with the shafts: down at the front when they rest on the ground
    const front = this.shaft.v;
    const tilt = (front - HELD_H) / DRAW;
    const z = (u: number, base: number) => base + u * tilt * 0.6;
    const P = (u: number, v: number, h: number) => this.P(u, v, z(u, h));
    // which side faces us: the left side (v > 0) is nearer when it points toward larger depth
    const nearV = this.h.x >= 0 ? 1 : -1;
    const nearSide = nearV * (BED_W / 2);
    const farSide = -nearSide;
    const wheel = (v: number, near: boolean) => {
      const cx = this.P(0, v, WHEEL_R);
      const pts: number[] = [];
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const p = this.P(Math.cos(t) * WHEEL_R, v, WHEEL_R + Math.sin(t) * WHEEL_R);
        pts.push(p[0], p[1]);
      }
      ctx.strokeStyle = rgba(near ? '#5A3E28' : '#6E5640', 0.95);
      ctx.lineWidth = 1.8 * k;
      tracePoly(ctx, pts);
      ctx.stroke();
      ctx.strokeStyle = rgba('#2E2420', 0.7);
      ctx.lineWidth = 0.5 * k;
      tracePoly(ctx, pts);
      ctx.stroke();
      // spokes, turning with the roll
      ctx.strokeStyle = rgba(near ? '#7A5A3C' : '#8A7058', 0.9);
      ctx.lineWidth = 0.9 * k;
      for (let s = 0; s < 6; s++) {
        const t = this.roll + (s / 6) * Math.PI;
        const a = this.P(Math.cos(t) * WHEEL_R, v, WHEEL_R + Math.sin(t) * WHEEL_R);
        const b = this.P(-Math.cos(t) * WHEEL_R, v, WHEEL_R - Math.sin(t) * WHEEL_R);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#3A2A22', 0.9);
      ctx.beginPath();
      ctx.arc(cx[0], cx[1], 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    };
    const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], col: string, alpha: number) => {
      ctx.fillStyle = rgba(col, alpha);
      tracePoly(ctx, [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]);
      ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.4);
      ctx.lineWidth = 0.4 * k;
      ctx.stroke();
    };
    // its shadow on the ground
    const g = this.P(0, 0, 0);
    ctx.fillStyle = 'rgba(60,56,64,0.16)';
    ctx.beginPath();
    ctx.ellipse(g[0] + 6 * k, g[1] + 1, (BED_L * 0.5 + 10) * k, 6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    wheel(farSide + nearV * -1.5, false);
    const L2 = BED_L / 2;
    const wood = '#B88A58';
    // the bed: its floor, the far side's inside, the ends, the near side
    quad(P(-L2, farSide, BED_H), P(L2, farSide, BED_H), P(L2, nearSide, BED_H), P(-L2, nearSide, BED_H), mix(wood, '#5A4030', 0.35), 0.95);
    quad(P(-L2, farSide, BED_H), P(L2, farSide, BED_H), P(L2, farSide, BED_H + SIDE_H), P(-L2, farSide, BED_H + SIDE_H), mix(wood, '#7A5A3C', 0.3), 0.95);
    // the heap of bricks: a mound in the bed, its area following the fill
    if (this.fill > 0.005) {
      const f = clamp(this.fill, 0, 1);
      const hgt = SIDE_H + 6 * Math.sqrt(f);
      const spread = 0.55 + 0.45 * Math.sqrt(f);
      const n = Math.max(2, Math.round(26 * f));
      for (let i = 0; i < n; i++) {
        const u = rnd.range(-L2 + 3, L2 - 3) * spread;
        const v = rnd.range(-BED_W / 2 + 3, BED_W / 2 - 3) * spread;
        const top = BED_H + 1 + hgt * (1 - Math.min(1, Math.abs(u) / (L2 * spread)) * 0.6) * rnd.range(0.4, 1);
        const p = P(u, v, top);
        ctx.fillStyle = rgba(rnd.pick(['#B4533B', '#BF6142', '#A94B37', '#C46B46', '#9F4535']), 0.95);
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(rnd.range(-0.5, 0.5));
        ctx.fillRect(-3.4 * k, -1.2 * k, 6.8 * k, 2.4 * k);
        ctx.fillStyle = 'rgba(60,30,30,0.3)';
        ctx.fillRect(-3.4 * k, 0.6 * k, 6.8 * k, 0.6 * k);
        ctx.restore();
      }
    }
    quad(P(-L2, farSide, BED_H), P(-L2, nearSide, BED_H), P(-L2, nearSide, BED_H + SIDE_H), P(-L2, farSide, BED_H + SIDE_H), mix(wood, '#5A4030', 0.2), 0.95);
    quad(P(L2, farSide, BED_H), P(L2, nearSide, BED_H), P(L2, nearSide, BED_H + SIDE_H), P(L2, farSide, BED_H + SIDE_H), mix(wood, '#F2D8AA', 0.15), 0.95);
    quad(P(-L2, nearSide, BED_H), P(L2, nearSide, BED_H), P(L2, nearSide, BED_H + SIDE_H), P(-L2, nearSide, BED_H + SIDE_H), wood, 0.97);
    // the lettering on the near side board, in faded paint (only when we see the side well)
    const side0 = P(-L2, nearSide, BED_H + SIDE_H * 0.5);
    const side1 = P(L2, nearSide, BED_H + SIDE_H * 0.5);
    const sl = Math.hypot(side1[0] - side0[0], side1[1] - side0[1]);
    if (sl > 22 * k) {
      ctx.save();
      ctx.translate((side0[0] + side1[0]) / 2, (side0[1] + side1[1]) / 2);
      ctx.rotate(Math.atan2(side1[1] - side0[1], side1[0] - side0[0]) + (side1[0] < side0[0] ? Math.PI : 0));
      ctx.scale(sl / (BED_L * k), 1);
      ctx.fillStyle = 'rgba(244,236,214,0.82)';
      ctx.font = `600 ${5.4 * k}px Figtree, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LENDER', 0, 0.4 * k);
      ctx.restore();
    }
    // the shafts, from the bed's front corners out to their ends
    for (const v of [farSide + nearV * 2, nearSide - nearV * 2]) {
      const a = P(L2, v * 0.85, BED_H + 2);
      const c = this.hitch();
      const lx = -this.h.d;
      const ld = this.h.x;
      const w = (v * 0.85) / (BED_W / 2) * (BED_W / 2 - 2) * k;
      const e: [number, number] = [c.x + lx * w, (c.d + ld * w) * KAPPA - front * k];
      ctx.strokeStyle = rgba('#8A6440', 0.96);
      ctx.lineWidth = 1.6 * k;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
    }
    wheel(nearSide + nearV * 1.5, true);
  }
}

/* ------------------------------------------------------------------ the carter */

type Phase = 'route' | 'down' | 'stand' | 'take' | 'pull';

class CarterImpl implements Carter {
  readonly id: LoanId;
  readonly fig: Figure;
  readonly cart: Cart;
  gone = false;
  private phase: Phase = 'route';
  private route: Pt[] = [];
  private spot: Pt | null = null;
  private watchAt = 4;
  private watchUntil = 0;
  private leaving = false;

  constructor(id: LoanId, start: Pt, q: number, seed: number) {
    this.id = id;
    const out = id === 'a' ? -1 : 1;
    // on the road the cart comes down toward us; already in the lane it faces along it toward the exit
    const onRoad = start.y < JUNCTION.y - 10;
    const heading: G = onRoad ? { x: 0, d: 1 } : { x: out, d: 0 };
    this.cart = new Cart(start, heading, seed);
    const hit = this.cart.hitch();
    this.fig = new Figure('carter', id, q, hit.x, hit.d * KAPPA, Math.atan2(heading.d, heading.x), seed);
    this.cart.shaft.snap(HELD_H);
    this.fig.placeAt(hit.x, hit.d * KAPPA, Math.atan2(heading.d, heading.x), { hands: this.cart.shaftEnds() });
  }

  /** the waypoints from where the cart is to a spot in the lane (round the junction if it is still on the road) */
  private plan(spot: Pt): Pt[] {
    const a = this.cart.hitch();
    const pts: Pt[] = [];
    if (a.d * KAPPA < JUNCTION.y - 8) pts.push({ x: JUNCTION.x, y: JUNCTION.y });
    pts.push(spot);
    return pts;
  }

  update(dtSec: number, it: CarterIntent, tSec: number, reduced: boolean): void {
    void tSec;
    this.cart.fill = it.fill;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    if (reduced) {
      this.place(it);
      return;
    }
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let i = 0; i < n; i++) this.step(dt / n, it);
    this.fig.finish();
  }

  /** where he waits: between the shaft ends, facing on along the way the cart will go */
  private stepAside(): { x: number; y: number; yaw: number } {
    const c = this.cart.hitch();
    return { x: c.x - this.cart.h.x * 3, y: (c.d - this.cart.h.d * 3) * KAPPA, yaw: Math.atan2(this.cart.h.d, this.cart.h.x) };
  }

  private step(h: number, it: CarterIntent): void {
    const f = this.fig;
    const cart = this.cart;
    f.begin();
    cart.shaft.update(h);
    const target = it.activity === 'leave' ? EXIT[this.id] : it.spot;
    if (it.activity === 'leave' && !this.leaving) {
      this.leaving = true;
      // still on the road: down to the junction first, never across the gardens
      this.route = this.plan(EXIT[this.id]);
      if (this.phase !== 'pull' && this.phase !== 'route') this.phase = 'take';
    } else if (it.activity !== 'leave' && target && (!this.spot || Math.hypot(target.x - this.spot.x, target.y - this.spot.y) > 2)) {
      // a new spot to go to (moving up the queue)
      this.spot = target;
      this.route = this.plan(target);
      if (this.phase === 'down' || this.phase === 'stand') this.phase = 'take';
    }
    switch (this.phase) {
      case 'take': {
        // back between the shafts, facing the way to go, and take them up
        const c = cart.hitch();
        const yaw = Math.atan2(cart.h.d, cart.h.x);
        // already between the shafts (he waits there): just take hold; otherwise walk in to them first
        const fr0 = f.frame();
        const near = Math.hypot(fr0.x - (c.x - cart.h.x * 3), fr0.y / KAPPA - (c.d - cart.h.d * 3)) < 6;
        const at = near ? f.face(yaw) || Math.abs(Math.atan2(Math.sin(yaw - fr0.yaw), Math.cos(yaw - fr0.yaw))) < 0.3 : f.goTo({ x: c.x - cart.h.x * 3, y: (c.d - cart.h.d * 3) * KAPPA }, yaw, 2.5);
        if (at) {
          f.holdBoth(...cart.shaftEnds(), 1, 0.45);
          if (f.wHold[0].v > 0.95) {
            cart.shaft.go(HELD_H, 0.55);
            if (!cart.shaft.moving && cart.shaft.v > HELD_H - 0.5) this.phase = 'pull';
          }
        }
        f.holdBoth(...cart.shaftEnds(), f.wHold[0].target, 0.45);
        break;
      }
      case 'route':
      case 'pull': {
        f.holdBoth(...cart.shaftEnds(), 1, 0.3);
        const wp = this.route[0];
        if (!wp) {
          this.phase = 'down';
          break;
        }
        const last = this.route.length === 1;
        const fr = f.frame();
        // the hands lead the cart: the hitch stays just behind the pelvis
        const arrived = f.goTo(wp, null, last ? 3 : 14);
        const hitch = { x: fr.x - Math.cos(fr.yaw) * 2, d: fr.y / KAPPA - Math.sin(fr.yaw) * 2 };
        cart.pull(hitch);
        if (arrived && f.still) {
          this.route.shift();
          if (this.route.length === 0) {
            if (this.leaving) this.gone = true;
            else this.phase = 'down';
          }
        }
        if (this.leaving && (fr.x < EXIT.a.x + 40 || fr.x > EXIT.b.x - 40)) this.gone = fr.x < -60 || fr.x > 1060;
        break;
      }
      case 'down': {
        // set the shafts down, let go, and step aside
        cart.shaft.go(REST_H, 0.6);
        f.holdBoth(...cart.shaftEnds(), cart.shaft.moving ? 1 : 0, 0.4);
        if (!cart.shaft.moving && f.wHold[0].v < 0.05) this.phase = 'stand';
        break;
      }
      case 'stand': {
        const s = this.stepAside();
        f.holdBoth(null, null, 0, 0.4);
        if (f.goTo(s, s.yaw, 4)) {
          // now and then the watch comes out of the waistcoat pocket and is looked at
          if (f.clock > this.watchAt && this.watchUntil < f.clock) {
            this.watchUntil = f.clock + 2.2;
            this.watchAt = f.clock + 7 + 4 * Math.abs(Math.sin(f.clock * 1.7));
          }
          if (f.clock < this.watchUntil) {
            const fr = f.frame();
            const w: W3 = { x: fr.x + fr.fwd.x * 9 * fr.S - fr.side.x * 2, y: fr.y + fr.fwd.y * 9 * fr.S, h: 64 * fr.S };
            f.hold(1, w, 1, 0.5);
            f.lookT = { pitch: 0.45, yaw: 0 };
          } else {
            f.hold(1, null, 0, 0.5);
            f.lookT = null;
          }
        }
        break;
      }
    }
    f.step(h);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // the carter between the shafts is in front of the cart when it trails away from us, behind it otherwise
    const fr = this.fig.feet();
    const a = this.cart.axleWorld();
    if (a.y > fr.y + 2) {
      this.fig.drawShadow(ctx);
      this.fig.drawCached(ctx);
      this.cart.drawCached(ctx);
    } else {
      this.cart.drawCached(ctx);
      this.fig.drawShadow(ctx);
      this.fig.drawCached(ctx);
    }
  }

  feet(): Pt {
    const a = this.cart.axleWorld();
    const f = this.fig.feet();
    return { x: a.x, y: Math.max(a.y, f.y) };
  }

  tipPoint(): Pt {
    return this.cart.tipPoint();
  }

  debug(): object {
    const f = this.fig.feet();
    return { phase: this.phase, fill: +this.cart.fill.toFixed(2), x: Math.round(f.x), y: Math.round(f.y), route: this.route.length, leaving: this.leaving };
  }

  place(it: CarterIntent): void {
    this.cart.fill = it.fill;
    if (it.activity === 'leave') {
      this.gone = true;
      return;
    }
    const spot = it.spot;
    if (!spot) return;
    const out = this.id === 'a' ? -1 : 1;
    this.cart.h = { x: out, d: 0 };
    this.cart.a = { x: spot.x, d: spot.y / KAPPA };
    this.cart.shaft.snap(REST_H);
    this.spot = spot;
    this.route = [];
    this.phase = 'stand';
    const s = this.stepAside();
    this.fig.placeAt(s.x, s.y, s.yaw);
  }
}

export const createCarter: CreateCarter = (id: LoanId, start: Pt, spriteQ: number): Carter => new CarterImpl(id, start, Math.max(1, spriteQ), 300 + Math.floor(Math.abs(start.x * 7 + start.y * 13)) % 997);

/** the carts come down this road (exported for the scene's route) */
export const ROUTE = { from: ROAD_FAR, via: JUNCTION };
