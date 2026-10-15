/**
 * Small, allocation-light maths for the gardener's skeleton: two-bone IK, minimum-jerk movers (every blend and
 * every sit or stand is one, so reversing mid-way is still smooth), and a critically damped follower.
 * Pure functions, no DOM.
 */
export type V2 = [number, number];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** smoothstep of t clamped to 0..1 */
export const sstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
/** smootherstep (zero first and second derivative at both ends) */
export const sstep5 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
};
/** a smooth minimum (rounds the corner where two values cross) */
export const softMin = (a: number, b: number, k: number): number => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};
export const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * Two-bone IK in 2D (y down). Root R, target T, bone lengths a (root to joint) and b (joint to end).
 * `side` +1 puts the joint on the clockwise side of the root-to-target line (an elbow pointing down and back
 * for a figure facing +x), -1 the other (a knee pointing forward); `k` scales the bend (1 = full). If the target is out of reach the chain
 * straightens toward it; `end` is where the chain actually ends. Writes into `out`.
 */
export function ik2(rx: number, ry: number, tx: number, ty: number, a: number, b: number, side: 1 | -1, out: { jx: number; jy: number; ex: number; ey: number; reach: boolean }, k = 1): void {
  let dx = tx - rx;
  let dy = ty - ry;
  let d = Math.hypot(dx, dy);
  const max = (a + b) * 0.9995;
  const min = Math.abs(a - b) * 1.001 + 0.02;
  out.reach = d <= max;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  } else if (d < min) {
    if (d < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx *= min / d;
      dy *= min / d;
    }
    d = min;
  }
  const ang = Math.atan2(dy, dx);
  const c = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const A = Math.acos(c);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  // the joint sits out to one side of the root-to-target line; k < 1 folds the bend toward the viewer (a knee in a front view)
  out.jx = rx + a * (ux * Math.cos(A) - side * k * uy * Math.sin(A));
  out.jy = ry + a * (uy * Math.cos(A) + side * k * ux * Math.sin(A));
  out.ex = rx + dx;
  out.ey = ry + dy;
}

/**
 * A value that glides to a target along a minimum-jerk quintic. Asking for a new target while moving
 * re-plans from the current position, velocity and acceleration, so the motion stays smooth when it reverses.
 */
export class Mover {
  v: number;
  target: number;
  private x0: number;
  private v0 = 0;
  private a0 = 0;
  private T = 0;
  private t = 0;
  private c3 = 0;
  private c4 = 0;
  private c5 = 0;
  vel = 0;
  constructor(v = 0) {
    this.v = v;
    this.target = v;
    this.x0 = v;
  }
  /** glide to `target` over `dur` seconds (ignored if the target is unchanged) */
  go(target: number, dur: number): void {
    if (target === this.target) return;
    this.retarget(target, dur);
  }
  /** (re-)plan unconditionally */
  retarget(target: number, dur: number): void {
    // current state
    const acc = this.acc();
    this.x0 = this.v;
    this.v0 = this.vel;
    this.a0 = acc;
    this.target = target;
    this.T = Math.max(0.05, dur);
    this.t = 0;
    const T = this.T;
    const h = target - this.x0;
    this.c3 = (20 * h - 12 * this.v0 * T - 3 * this.a0 * T * T) / (2 * T * T * T);
    this.c4 = (-30 * h + 16 * this.v0 * T + 3 * this.a0 * T * T) / (2 * T * T * T * T);
    this.c5 = (12 * h - 6 * this.v0 * T - this.a0 * T * T) / (2 * T * T * T * T * T);
  }
  private acc(): number {
    if (this.t >= this.T) return 0;
    const t = this.t;
    return this.a0 + 6 * this.c3 * t + 12 * this.c4 * t * t + 20 * this.c5 * t * t * t;
  }
  /** jump to a value with no motion */
  snap(v: number): void {
    this.v = v;
    this.target = v;
    this.x0 = v;
    this.v0 = 0;
    this.a0 = 0;
    this.vel = 0;
    this.T = 0;
    this.t = 0;
  }
  get moving(): boolean {
    return this.t < this.T;
  }
  update(dt: number): number {
    if (this.t >= this.T) return this.v;
    this.t = Math.min(this.T, this.t + dt);
    if (this.t >= this.T) {
      this.v = this.target;
      this.vel = 0;
      return this.v;
    }
    const t = this.t;
    this.v = this.x0 + this.v0 * t + 0.5 * this.a0 * t * t + this.c3 * t * t * t + this.c4 * t * t * t * t + this.c5 * t * t * t * t * t;
    this.vel = this.v0 + this.a0 * t + 3 * this.c3 * t * t + 4 * this.c4 * t * t * t + 5 * this.c5 * t * t * t * t;
    return this.v;
  }
}

/** a critically damped follower in 2D (used for the shears' tip tracking its target) */
export class Spring2 {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }
  /** exact critically damped step toward (tx, ty) with angular frequency w (rad/s) */
  update(dt: number, tx: number, ty: number, w: number): void {
    const e = Math.exp(-w * dt);
    const step = (x: number, v: number, t: number): [number, number] => {
      const dx = x - t;
      const tmp = (v + w * dx) * dt;
      return [t + (dx + tmp) * e, (v - w * tmp) * e];
    };
    const sx = step(this.x, this.vx, tx);
    const sy = step(this.y, this.vy, ty);
    this.x = sx[0];
    this.vx = sx[1];
    this.y = sy[0];
    this.vy = sy[1];
  }
}

/** hash noise in -1..1 from an integer and a seed (deterministic) */
export const hash1 = (i: number, seed: number): number => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
};

/** a critically damped follower for one value (C1 smooth: a new target never makes the value jump or kink) */
export class Spring1 {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  snap(x: number): void {
    this.x = x;
    this.v = 0;
  }
  update(dt: number, target: number, w: number): number {
    const e = Math.exp(-w * dt);
    const dx = this.x - target;
    const tmp = (this.v + w * dx) * dt;
    this.x = target + (dx + tmp) * e;
    this.v = (this.v - w * tmp) * e;
    return this.x;
  }
}

/** shortest-arc interpolation of angles */
export const lerpAngle = (a: number, b: number, t: number): number => a + wrapPi(b - a) * t;
