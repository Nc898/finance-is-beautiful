/**
 * Footstep locomotion for the gardener. Feet are placed first and the body follows them, so a planted foot is
 * exactly still in the world (no sliding) whatever the walking speed. A walk is a short plan of steps:
 *
 *   - each step lands one foot at a world spot; the pelvis passes through the midpoint of the two feet at every
 *     landing, along a cubic Hermite path whose end velocities come from the neighbouring steps, so the body speed
 *     is smooth: eased start (short first step), steady, eased stop (last steps shorten, the closing step brings
 *     the trailing foot up beside the other and lands on the spot);
 *   - the plan is re-made at every landing from the real state, so the goal can move while walking;
 *   - a foot rolls: heel pivot at the strike (toe up, rolling flat), toe pivot at the push-off (heel up), then a
 *     swing with a lifted arc. The contact point (heel or toe) never moves while it is on the ground.
 */
import { DIM } from './gardenerDims';
import { clamp, lerp, sstep } from './gardenerMath';

export const ROLL_TOE = 0.55;
export const ROLL_HEEL = -0.3;

/** ankle offset from the flat position (forward x, height above ground) for a foot rolled by alpha about its heel (alpha < 0) or toe (alpha > 0) */
export function rollAnkle(alpha: number, out: { dx: number; h: number }): void {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  if (alpha >= 0) {
    out.dx = DIM.TOE * (1 - c) + DIM.FH * s;
    out.h = DIM.TOE * s + DIM.FH * c;
  } else {
    // heel pivot at (HEEL, 0); the ankle sits (-HEEL, FH) up and over from it
    const vx = -DIM.HEEL;
    const vy = -DIM.FH;
    out.dx = DIM.HEEL + vx * c - vy * s;
    out.h = -(vx * s + vy * c);
  }
}

const tmp = { dx: 0, h: 0 };

export const STANCE = 0;
export const TOE = 1;
export const SWING = 2;

export class Foot {
  /** planted flat-foot ankle ground position (world) */
  ax = 0;
  ay = 0;
  state = STANCE;
  tLand = 10;
  /** extra roll held while planted (standing on tiptoe) */
  tipRoll = 0;
  roll = 0;
  // the step in progress
  t = 0;
  tToe = 0.1;
  tSwing = 0.3;
  r0 = 0;
  tx = 0;
  ty = 0;
  // swing start pose
  sx = 0;
  sy = 0;
  sz = 0;
  sa = 0;
  // outputs: ankle world x, ground y under it, height above ground, foot angle
  x = 0;
  y = 0;
  z = DIM.FH;
  a = 0;

  constructor(readonly i: 0 | 1) {}

  place(ax: number, ay: number): void {
    this.ax = ax;
    this.ay = ay;
    this.state = STANCE;
    this.tLand = 10;
    this.roll = this.tipRoll;
    this.x = ax;
    this.y = ay;
    this.z = DIM.FH;
    this.a = 0;
  }

  get grounded(): boolean {
    return this.state !== SWING;
  }

  begin(tx: number, ty: number, toe: number, swing: number): void {
    this.state = TOE;
    this.t = 0;
    this.tToe = toe;
    this.tSwing = swing;
    this.r0 = this.roll;
    this.tx = tx;
    this.ty = ty;
  }

  private land(m: number): void {
    rollAnkle(ROLL_HEEL, tmp);
    this.ax = this.tx;
    this.ay = this.ty;
    this.state = STANCE;
    this.tLand = 0;
    this.roll = ROLL_HEEL + this.tipRoll;
    this.x = this.tx + m * tmp.dx;
    this.y = this.ty;
    this.z = tmp.h;
    this.a = ROLL_HEEL;
  }

  /** end a swing that is within rounding of its end */
  forceLand(m: number): void {
    if (this.state !== STANCE) this.land(m);
  }

  update(dt: number, m: number): void {
    if (this.state === STANCE) {
      this.tLand += dt;
      const heel = ROLL_HEEL * (1 - sstep(this.tLand / 0.09));
      this.roll = heel + this.tipRoll;
      rollAnkle(this.roll, tmp);
      this.x = this.ax + m * tmp.dx;
      this.y = this.ay;
      this.z = tmp.h;
      this.a = this.roll;
      return;
    }
    if (this.state === TOE) {
      this.t += dt;
      const u = sstep(this.t / this.tToe);
      this.roll = lerp(this.r0, ROLL_TOE, u);
      rollAnkle(this.roll, tmp);
      this.x = this.ax + m * tmp.dx;
      this.y = this.ay;
      this.z = tmp.h;
      this.a = this.roll;
      if (this.t < this.tToe) return;
      this.state = SWING;
      this.t -= this.tToe;
      this.sx = this.x;
      this.sy = this.y;
      this.sz = this.z;
      this.sa = this.roll;
    } else this.t += dt;
    // swing
    const s = Math.min(1, this.t / this.tSwing);
    if (s >= 1 - 1e-7) {
      this.land(m);
      return;
    }
    rollAnkle(ROLL_HEEL, tmp);
    const ex = this.tx + m * tmp.dx;
    const ez = tmp.h;
    // horizontal: starts and ends at rest relative to the ground, fastest mid-swing
    const eh = s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
    this.x = lerp(this.sx, ex, eh);
    this.y = lerp(this.sy, this.ty, eh);
    this.z = lerp(this.sz, ez, sstep(s)) + 5.2 * Math.sin(Math.PI * Math.pow(s, 0.85));
    this.a = lerp(this.sa, ROLL_HEEL, sstep(s));
  }
}

interface Step {
  foot: 0 | 1;
  /** landing spot along the path (s) */
  s: number;
  /** seconds from the previous landing to this one */
  T: number;
}

export interface GaitGoal {
  x: number;
  y: number;
  /** how far ahead of the other foot the closing foot ends (the stance width) */
  spread?: number;
  /** the shortest distance worth a walk (default 5) */
  minWalk?: number;
}

const STEP_NOM = 30;
const TS = 0.44;

/** lateral (world y) offset of each foot so the near leg sits a hair in front of the far one */
const LAT = [1.6, -1.6] as const;

export class Gait {
  /** the pelvis, on the ground (world) */
  px = 0;
  py = 0;
  /** pelvis velocity (world units per second) */
  vx = 0;
  vy = 0;
  readonly feet: [Foot, Foot] = [new Foot(0), new Foot(1)];
  /** a walk is under way */
  walking = false;
  /** the foot that is lifting or swinging now, if any */
  stepping: Foot | null = null;
  /** seconds since the body last moved */
  still = 10;
  /** true on the frame a foot lands */
  landedNow = false;

  private ox = 0;
  private oy = 0;
  private dx = 1;
  private dy = 0;
  private steps: Step[] = [];
  private knots: number[] = [];
  private times: number[] = [];
  private knotIdx = 0;
  // the current segment (previous landing to the next)
  private segT = 0;
  private segDur = 1;
  private p0 = 0;
  private v0 = 0;
  private p1 = 0;
  private v1 = 0;
  private liftAt = 0;
  private lifted = false;
  private toeDur = 0.1;
  private swingDur = 0.3;
  private goalS = 0;

  constructor(x: number, y: number) {
    this.stand(x, y, 1);
  }

  /** put both feet down beside each other under a pelvis at (x, y) */
  stand(x: number, y: number, m: number, stagger = 3): void {
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.walking = false;
    this.stepping = null;
    this.steps = [];
    this.feet[0].tipRoll = 0;
    this.feet[1].tipRoll = 0;
    this.feet[0].place(x + m * stagger, y + LAT[0]);
    this.feet[1].place(x - m * stagger, y + LAT[1]);
  }

  /** remaining distance to a goal point */
  distTo(g: { x: number; y: number }): number {
    return Math.hypot(g.x - this.px, g.y - this.py);
  }

  setTip(roll: number): void {
    this.feet[0].tipRoll = roll;
    this.feet[1].tipRoll = roll;
  }

  /** speed along the ground */
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  private sOf(f: Foot): number {
    return (f.ax - this.ox) * this.dx + (f.ay - LAT[f.i] - this.oy) * this.dy;
  }

  /** make a plan from the current stance toward the goal; false if it would mean walking backwards */
  private plan(goal: GaitGoal, m: number, moving: boolean, v0: number): boolean {
    const gx = goal.x - this.px;
    const gy = goal.y - this.py;
    const dist = Math.hypot(gx, gy);
    if (dist < 1e-3) return false;
    const ux = gx / dist;
    const uy = gy / dist;
    if (Math.abs(ux) > 0.12 && Math.sign(ux) !== m) return false;
    this.ox = this.px;
    this.oy = this.py;
    this.dx = ux;
    this.dy = uy;
    this.goalS = dist;
    const e = goal.spread ?? 3;
    const s0 = this.sOf(this.feet[0]);
    const s1 = this.sOf(this.feet[1]);
    const rearFoot = s0 <= s1 ? this.feet[0] : this.feet[1];
    const rearS = Math.min(s0, s1);
    const frontS = Math.max(s0, s1);
    const Ltot = this.goalS - e / 2 - frontS;
    const hurry = dist > 160 ? 1.12 : 1;
    const Lnom = STEP_NOM * hurry;
    const ramp0 = moving ? clamp(0.55 + (0.45 * Math.abs(v0)) / 45, 0.55, 1) : 0.62;
    let k = Ltot < 2 ? 1 : Math.max(1, Math.round(Ltot / (Lnom * 0.84)));
    k = Math.min(k, 60);
    const r: number[] = [];
    let rs = 0;
    for (let j = 1; j <= k; j++) {
      const rj = Math.min(ramp0 + 0.3 * (j - 1), 1, 0.52 + 0.28 * (k - j));
      r.push(rj);
      rs += rj;
    }
    const total = Math.max(Ltot, 2.5);
    const steps: Step[] = [];
    let X = frontS;
    let foot: 0 | 1 = rearFoot.i;
    for (let j = 1; j <= k; j++) {
      X += clamp((total * r[j - 1]!) / rs, 2.2, 42);
      const T = j === 1 ? (moving ? TS : 0.5) : j === k ? 0.47 : TS;
      steps.push({ foot, s: X, T });
      foot = foot === 0 ? 1 : 0;
    }
    // the closing step: the trailing foot comes up beside the other
    steps.push({ foot, s: X + e, T: 0.58 });
    // pelvis knots: where the body is now, then the midpoint of the two feet after each landing
    const knots: number[] = [0];
    const times: number[] = [0];
    let prev = frontS;
    for (const st of steps) {
      knots.push((st.s + prev) / 2);
      times.push(st.T);
      prev = st.s;
    }
    void rearS;
    this.steps = steps;
    this.knots = knots;
    this.times = times;
    this.knotIdx = 0;
    this.v0 = v0;
    this.beginSegment();
    return true;
  }

  private beginSegment(): void {
    const j = this.knotIdx;
    const st = this.steps[0];
    if (!st) {
      this.walking = false;
      this.stepping = null;
      return;
    }
    this.segT = 0;
    this.segDur = st.T;
    this.p0 = this.knots[j]!;
    this.p1 = this.knots[j + 1]!;
    // end velocity: Catmull-Rom through the next knot, zero at the end of the plan
    this.v1 = j + 2 < this.knots.length ? (this.knots[j + 2]! - this.knots[j]!) / (st.T + this.times[j + 2]!) : 0;
    const S = clamp(st.T - 0.02, 0.3, 0.52);
    this.liftAt = st.T - S;
    this.lifted = false;
    this.toeDur = 0.24 * S;
    this.swingDur = S - this.toeDur;
    this.walking = true;
  }

  /**
   * Advance by dt. `goal` is where the pelvis should end up (or null to stay), `m` the facing, and `allowStart`
   * whether a new walk may begin now (the director holds it back while the arms are busy).
   */
  update(dt: number, goal: GaitGoal | null, m: number, allowStart: boolean): void {
    const ox = this.px;
    const oy = this.py;
    this.landedNow = false;
    if (!this.walking && allowStart && goal && this.distTo(goal) > (goal.minWalk ?? 5)) this.plan(goal, m, false, 0);
    let rem = dt;
    for (let guard = 0; rem > 1e-9 && guard < 80; guard++) {
      const cur = this.steps[0];
      if (this.walking && cur) {
        if (!this.lifted && this.segT >= this.liftAt - 1e-9) {
          this.lifted = true;
          const f = this.feet[cur.foot];
          f.begin(this.ox + this.dx * cur.s, this.oy + this.dy * cur.s + LAT[cur.foot], this.toeDur, this.swingDur);
          this.stepping = f;
        }
        let h = Math.min(rem, this.segDur - this.segT);
        if (!this.lifted) h = Math.min(h, this.liftAt - this.segT);
        h = Math.max(h, 1e-9);
        this.segT += h;
        rem -= h;
        this.evalPelvis();
        for (const f of this.feet) f.update(h, m);
        if (this.segT >= this.segDur - 1e-9) this.landing(goal, m);
      } else {
        for (const f of this.feet) f.update(rem, m);
        rem = 0;
      }
    }
    if (dt > 0) {
      this.vx = (this.px - ox) / dt;
      this.vy = (this.py - oy) / dt;
    }
    this.still = Math.abs(this.px - ox) + Math.abs(this.py - oy) > 1e-5 || this.walking ? 0 : this.still + dt;
  }

  private evalPelvis(): void {
    const T = this.segDur;
    const u = clamp(this.segT / T, 0, 1);
    const u2 = u * u;
    const u3 = u2 * u;
    const p = (2 * u3 - 3 * u2 + 1) * this.p0 + (u3 - 2 * u2 + u) * T * this.v0 + (-2 * u3 + 3 * u2) * this.p1 + (u3 - u2) * T * this.v1;
    this.px = this.ox + this.dx * p;
    this.py = this.oy + this.dy * p;
  }

  private landing(goal: GaitGoal | null, m: number): void {
    const cur = this.steps[0]!;
    // make sure the landing foot is down exactly on its spot
    this.feet[cur.foot].forceLand(m);
    this.landedNow = true;
    this.stepping = null;
    this.segT = this.segDur;
    this.evalPelvis();
    this.steps.shift();
    this.knotIdx++;
    const vEnd = this.v1;
    if (this.steps.length === 0) {
      this.walking = false;
      this.vx = 0;
      this.vy = 0;
      return;
    }
    // re-plan from the real state if the goal has moved, else carry on
    if (goal) {
      const along = (goal.x - this.ox) * this.dx + (goal.y - this.oy) * this.dy;
      const lateral = Math.abs((goal.x - this.ox) * -this.dy + (goal.y - this.oy) * this.dx);
      if (Math.abs(this.goalS - along) > 3.5 || lateral > 3.5) {
        const keep = { steps: this.steps, knots: this.knots, times: this.times, knotIdx: this.knotIdx, ox: this.ox, oy: this.oy, dx: this.dx, dy: this.dy, goalS: this.goalS };
        if (this.plan(goal, m, true, vEnd)) return;
        Object.assign(this, keep);
      }
    }
    this.v0 = vEnd;
    this.beginSegment();
  }
}
