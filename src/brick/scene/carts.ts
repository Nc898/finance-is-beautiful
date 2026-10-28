/**
 * Each house's queue of lender's carts, run from the money (`carts`: interest paid / a cart's worth): the cart at the
 * gate (CART) holds the part of a load not yet full; when `carts` passes a whole number that cart is full and is
 * pulled away to the exit, the ones waiting behind it move up, and another is sent for down the road. Three wait behind
 * the one at the gate, so the gate is never left without a cart while a new one walks down from the village. When the
 * loan is paid off the last part-full cart and the empty ones behind it all leave, and none are sent for.
 * A jump of the timeline (a scrub, new inputs, reduced motion) sets the queue straight: the cart at the gate with its
 * fill and three waiting behind it, no traffic.
 *
 * Both houses' carts come down the one road, so a shared Road lets a new cart set off only once the last one is
 * clear of the hedge (they never walk through each other).
 */
import type { Carter } from './crewApi';
import { createCarter } from './carter';
import { CART, NEXT, ROAD_FAR, type Pt } from './geom';
import type { LoanId } from '../types';

/** how many carts wait behind the one at the gate */
const WAITING = 3;
/** a new cart sets off when the last one is this far down the road (world depth units) */
const ROAD_GAP = 18;

export class Road {
  private last: Carter | null = null;
  clear(): boolean {
    if (!this.last || this.last.gone) return true;
    return this.last.feet().y > ROAD_FAR.y + ROAD_GAP;
  }
  sent(c: Carter): void {
    this.last = c;
  }
  reset(): void {
    this.last = null;
  }
}

export class CartQueue {
  readonly id: LoanId;
  private q: number;
  private road: Road;
  /** [the cart at the gate, those waiting behind it, any on their way] */
  private line: Carter[] = [];
  private leaving: Array<{ c: Carter; fill: number }> = [];
  /** carts sent for that have not set off yet (waiting for the road) */
  private pending = 0;
  private full = -1;
  private last = -1;
  private done = false;

  constructor(id: LoanId, q: number, road: Road) {
    this.id = id;
    this.q = q;
    this.road = road;
  }

  /** development: what each cart in the line and leaving is doing */
  debug(): unknown {
    const d = (c: Carter) => ({ ...(c as unknown as { debug(): object }).debug() });
    return { full: this.full, pending: this.pending, line: this.line.map(d), leaving: this.leaving.map((l) => ({ fill: l.fill, ...d(l.c) })) };
  }

  /** everyone to draw (each sorts by its own depth) */
  all(): Carter[] {
    return [...this.line, ...this.leaving.map((l) => l.c)];
  }

  /** the cart being filled now (the builder tips into it), or null when none stands at the gate */
  filling(): Carter | null {
    const c = this.line[0];
    if (!c) return null;
    const f = c.feet();
    return Math.hypot(f.x - CART[this.id].x, f.y - CART[this.id].y) < 26 ? c : null;
  }

  /** the queue's places: the gate, then along the lane toward the junction */
  private spotFor(i: number): Pt {
    const inward = this.id === 'a' ? 1 : -1;
    return i === 0 ? CART[this.id] : { x: NEXT[this.id].x + inward * 74 * (i - 1), y: NEXT[this.id].y };
  }

  private reset(carts: number, paidOff: boolean): void {
    this.line = [];
    this.leaving = [];
    this.pending = 0;
    this.full = Math.floor(carts + 1e-9);
    this.done = paidOff;
    if (paidOff) return;
    const frac = carts - this.full;
    for (let i = 0; i <= WAITING; i++) {
      const spot = this.spotFor(i);
      const c = createCarter(this.id, spot, this.q);
      c.place({ activity: 'wait', spot, fill: i === 0 ? frac : 0 });
      this.line.push(c);
    }
  }

  update(dt: number, tSec: number, carts: number, paidOff: boolean, playing: boolean, reduced: boolean): void {
    const jump = this.last < 0 || reduced || !playing || Math.abs(carts - this.last) > 0.6;
    const changed = Math.abs(carts - this.last) > 1e-9 || paidOff !== this.done;
    if (jump && changed) {
      this.reset(carts, paidOff);
      this.road.reset();
    }
    this.last = carts;
    const full = Math.floor(carts + 1e-9);
    if (!jump) {
      // a cart filled: away it goes, the others move up, another is sent for
      while (this.full < full) {
        this.full++;
        const c = this.line.shift();
        if (c) this.leaving.push({ c, fill: 1 });
        if (!paidOff) this.pending++;
      }
      if (paidOff && !this.done) {
        this.done = true;
        this.line.forEach((c, i) => this.leaving.push({ c, fill: i === 0 ? carts - full : 0 }));
        this.line = [];
        this.pending = 0;
      }
      if (this.pending > 0 && this.road.clear()) {
        const fresh = createCarter(this.id, ROAD_FAR, this.q);
        this.road.sent(fresh);
        this.line.push(fresh);
        this.pending--;
      }
    }
    const frac = carts - full;
    this.line.forEach((c, i) => c.update(dt, { activity: 'arrive', spot: this.spotFor(i), fill: i === 0 ? frac : 0 }, tSec, reduced));
    for (const l of this.leaving) l.c.update(dt, { activity: 'leave', spot: null, fill: l.fill }, tSec, reduced);
    this.leaving = this.leaving.filter((l) => !l.c.gone);
  }
}
