/**
 * Footstep locomotion for the gardener, on the ground plane in true units (x across, d toward the viewer). Feet
 * are placed first and the body follows them, so a planted foot is exactly still in the world (no sliding)
 * whatever the walking speed or the way the figure faces. A walk is a short plan of steps:
 *
 *   - each step lands one foot at a world spot; the pelvis passes through the midpoint of the two feet at every
 *     landing, along a cubic Hermite path whose end velocities come from the neighbouring steps, so the body speed
 *     is smooth: eased start (short first step), steady, eased stop (last steps shorten, the closing step brings
 *     the trailing foot up beside the other and lands on the spot);
 *   - the plan is re-made at every landing from the real state, so the goal can move while walking;
 *   - a foot rolls: heel pivot at the strike (toe up, rolling flat), toe pivot at the push-off (heel up), then a
 *     swing with a lifted arc. The contact point (heel or toe) never moves while it is on the ground;
 *   - feet stand either side of the pelvis along the body's lateral axis (so a walk toward the viewer shows two
 *     feet alternating, and a walk across shows them nearly in line);
 *   - a side-step (shuffling along a wall while facing it) lands the leading foot a stride out and brings the
 *     other up beside it, never crossing the legs;
 *   - a turn on the spot is a few pivot steps: each foot is lifted and set down turned, in turn, so no planted
 *     foot ever skids round.
 */
import { DIM, FOOT_W } from './gardenerDims';
import { clamp, lerp, lerpAngle, sstep } from './gardenerMath';

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
  /** planted flat-foot ankle ground position (x, and depth d in true ground units) */
  ax = 0;
  ad = 0;
  /** the way the foot points on the ground (0 = +x, pi/2 = toward the viewer) */
  yaw = 0;
  state = STANCE;
  tLand = 10;
  /** extra roll held while planted (standing on tiptoe) */
  tipRoll = 0;
  roll = 0;
  /** scales the roll of a step (a sidestep barely rolls) */
  rollK = 1;
  /** world scale of the figure, for the ankle's roll displacement */
  S = 1;
  // the step in progress
  t = 0;
  tToe = 0.1;
  tSwing = 0.3;
  r0 = 0;
  tx = 0;
  td = 0;
  tyaw = 0;
  lift = 5.2;
  // swing start pose
  sx = 0;
  sd = 0;
  sz = 0;
  sa = 0;
  syaw = 0;
  // outputs: ankle ground x and depth d, height above the ground (rig units), roll angle
  x = 0;
  d = 0;
  h = DIM.FH;
  a = 0;

  constructor(readonly i: 0 | 1) {}

  place(ax: number, ad: number, yaw: number): void {
    this.ax = ax;
    this.ad = ad;
    this.yaw = yaw;
    this.state = STANCE;
    this.tLand = 10;
    this.roll = this.tipRoll;
    this.x = ax;
    this.d = ad;
    this.h = DIM.FH;
    this.a = 0;
  }

  get grounded(): boolean {
    return this.state !== SWING;
  }

  begin(tx: number, td: number, yawT: number, toe: number, swing: number, rollK = 1): void {
    this.state = TOE;
    this.t = 0;
    this.tToe = toe;
    this.tSwing = swing;
    this.r0 = this.roll;
    this.tx = tx;
    this.td = td;
    this.tyaw = yawT;
    this.rollK = rollK;
    this.lift = 5.2 * clamp(swing / 0.26, 0.45, 1);
    this.syaw = this.yaw;
  }

  private land(): void {
    rollAnkle(ROLL_HEEL * this.rollK, tmp);
    this.ax = this.tx;
    this.ad = this.td;
    this.yaw = this.tyaw;
    this.state = STANCE;
    this.tLand = 0;
    this.roll = ROLL_HEEL * this.rollK + this.tipRoll;
    this.x = this.tx + Math.cos(this.yaw) * tmp.dx * this.S;
    this.d = this.td + Math.sin(this.yaw) * tmp.dx * this.S;
    this.h = tmp.h;
    this.a = ROLL_HEEL * this.rollK;
  }

  /** end a swing that is within rounding of its end */
  forceLand(): void {
    if (this.state !== STANCE) this.land();
  }

  update(dt: number): void {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    if (this.state === STANCE) {
      this.tLand += dt;
      const heel = ROLL_HEEL * this.rollK * (1 - sstep(this.tLand / 0.09));
      this.roll = heel + this.tipRoll;
      rollAnkle(this.roll, tmp);
      this.x = this.ax + cy * tmp.dx * this.S;
      this.d = this.ad + sy * tmp.dx * this.S;
      this.h = tmp.h;
      this.a = this.roll;
      return;
    }
    if (this.state === TOE) {
      this.t += dt;
      const u = sstep(this.t / this.tToe);
      this.roll = lerp(this.r0, ROLL_TOE * this.rollK, u);
      rollAnkle(this.roll, tmp);
      this.x = this.ax + cy * tmp.dx * this.S;
      this.d = this.ad + sy * tmp.dx * this.S;
      this.h = tmp.h;
      this.a = this.roll;
      if (this.t < this.tToe) return;
      this.state = SWING;
      this.t -= this.tToe;
      this.sx = this.x;
      this.sd = this.d;
      this.sz = this.h;
      this.sa = this.roll;
    } else this.t += dt;
    // swing
    const s = Math.min(1, this.t / this.tSwing);
    if (s >= 1 - 1e-7) {
      this.land();
      return;
    }
    rollAnkle(ROLL_HEEL * this.rollK, tmp);
    const ex = this.tx + Math.cos(this.tyaw) * tmp.dx * this.S;
    const ed = this.td + Math.sin(this.tyaw) * tmp.dx * this.S;
    const ez = tmp.h;
    // horizontal: starts and ends at rest relative to the ground, fastest mid-swing
    const eh = s - Math.sin(2 * Math.PI * s) / (2 * Math.PI);
    this.x = lerp(this.sx, ex, eh);
    this.d = lerp(this.sd, ed, eh);
    this.h = lerp(this.sz, ez, sstep(s)) + this.lift * Math.sin(Math.PI * Math.pow(s, 0.85));
    this.a = lerp(this.sa, ROLL_HEEL * this.rollK, sstep(s));
    this.yaw = lerpAngle(this.syaw, this.tyaw, sstep(s));
  }
}

interface Step {
  foot: 0 | 1;
  /** landing spot along the path (s), of the foot's centre line */
  s: number;
  /** seconds from the previous landing to this one */
  T: number;
}

export interface GaitGoal {
  x: number;
  d: number;
  /** how far ahead of the other foot the closing foot ends (the stance width) */
  spread?: number;
  /** the shortest distance worth a walk (default 5) */
  minWalk?: number;
  /** shuffle there sideways (the figure keeps facing where it faces) instead of walking forward */
  side?: boolean;
}

interface TurnStep {
  foot: 0 | 1;
  lift: number;
  land: number;
  yaw: number;
  begun: boolean;
}

/** a relaxed garden stroll: about 0.55 m per step for a 1.75 m figure 122 units tall */
const STEP_NOM = 39;
const TS = 0.44;
const SIDE_STEP = 15;

export class Gait {
  /** the pelvis, on the ground (true units) */
  px = 0;
  pd = 0;
  /** pelvis velocity (true units per second) */
  vx = 0;
  vd = 0;
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
  private od = 0;
  private dx = 1;
  private dd = 0;
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
  private side = false;
  /** the body's lateral axis (to its right) and facing, from the yaw given at the last update */
  private lx = 0;
  private ld = 1;
  private yawNow = 0;
  private turnSteps: TurnStep[] = [];
  private turnClock = 0;

  constructor(x: number, d: number, yaw = 0) {
    this.stand(x, d, yaw);
  }

  /** put both feet down beside each other under a pelvis at (x, d), facing `yaw` */
  stand(x: number, d: number, yaw: number, stagger = 3): void {
    this.px = x;
    this.pd = d;
    this.vx = 0;
    this.vd = 0;
    this.walking = false;
    this.stepping = null;
    this.steps = [];
    this.turnSteps = [];
    this.yawNow = yaw;
    this.lx = -Math.sin(yaw);
    this.ld = Math.cos(yaw);
    this.feet[0].tipRoll = 0;
    this.feet[1].tipRoll = 0;
    for (const f of this.feet) {
      const sg = f.i === 0 ? 1 : -1;
      const p = this.slot(f.i, yaw, stagger);
      f.place(p[0], p[1], yaw + sg * 0.1);
    }
  }

  /** where a foot's ankle stands for a pelvis facing `yaw`: staggered along the facing, apart along the lateral axis */
  slot(i: 0 | 1, yaw: number, stagger = 3): [number, number] {
    const sg = i === 0 ? 1 : -1;
    const fx = Math.cos(yaw);
    const fd = Math.sin(yaw);
    return [this.px + sg * (stagger * fx - FOOT_W * fd), this.pd + sg * (stagger * fd + FOOT_W * fx)];
  }

  /** remaining distance to a goal point */
  distTo(g: { x: number; d: number }): number {
    return Math.hypot(g.x - this.px, g.d - this.pd);
  }

  setTip(roll: number): void {
    this.feet[0].tipRoll = roll;
    this.feet[1].tipRoll = roll;
  }

  /** speed along the ground */
  get speed(): number {
    return Math.hypot(this.vx, this.vd);
  }

  /** the walk under way is a side-step */
  get sidePlan(): boolean {
    return this.walking && this.side;
  }

  /** a turn on the spot is under way */
  get turning(): boolean {
    return this.turnSteps.length > 0;
  }

  /** a foot's offset from the line of the walk: across the path when walking forward, across the body when side-stepping */
  private latOff(i: 0 | 1): [number, number] {
    const sg = i === 0 ? 1 : -1;
    if (this.side) return [sg * FOOT_W * this.lx, sg * FOOT_W * this.ld];
    return [sg * FOOT_W * -this.dd, sg * FOOT_W * this.dx];
  }

  private sOf(f: Foot): number {
    const o = this.latOff(f.i);
    return (f.ax - o[0] - this.ox) * this.dx + (f.ad - o[1] - this.od) * this.dd;
  }

  /**
   * Plan a turn on the spot through `delta` radians (from the current facing) over `dur` seconds: n pivot steps,
   * alternating feet, the first with the foot on the side being turned to. Each lifts, turns and lands in its
   * share of the time; the last lands exactly on the new facing.
   */
  startTurn(yaw0: number, delta: number, dur: number, n: number): void {
    const lead: 0 | 1 = delta >= 0 ? 0 : 1;
    const steps: TurnStep[] = [];
    const share = dur / n;
    for (let j = 1; j <= n; j++) {
      const ratio = j === n ? 1 : (j / Math.max(1, n - 1)) * 0.92;
      const foot = (((j - 1) % 2 === 0 ? lead : 1 - lead) as 0 | 1);
      steps.push({ foot, lift: (j - 1) * share + 0.02, land: j * share, yaw: yaw0 + delta * ratio, begun: false });
    }
    this.turnSteps = steps;
    this.turnClock = 0;
  }

  /** make a plan from the current stance toward the goal */
  private plan(goal: GaitGoal, moving: boolean, v0: number): boolean {
    const gx = goal.x - this.px;
    const gd = goal.d - this.pd;
    const dist = Math.hypot(gx, gd);
    if (dist < 1e-3) return false;
    const ux = gx / dist;
    const ud = gd / dist;
    this.ox = this.px;
    this.od = this.pd;
    this.dx = ux;
    this.dd = ud;
    this.goalS = dist;
    this.side = !!goal.side;
    const steps: Step[] = [];
    const knots: number[] = [0];
    const times: number[] = [0];
    if (this.side) {
      // lead with the foot on the side being moved to; each cycle the leader goes a stride out, the other closes up
      const lead: 0 | 1 = ux * this.lx + ud * this.ld >= 0 ? 0 : 1;
      const trail: 0 | 1 = lead === 0 ? 1 : 0;
      let X = Math.min(this.sOf(this.feet[lead]), this.sOf(this.feet[trail]));
      const cyc = Math.max(1, Math.round((dist - X) / SIDE_STEP));
      const r: number[] = [];
      let rs = 0;
      for (let j = 1; j <= cyc; j++) {
        const rj = Math.min(0.6 + 0.4 * (j - 1), 1, 0.6 + 0.4 * (cyc - j));
        r.push(rj);
        rs += rj;
      }
      const total = Math.max(dist - X, 2.5);
      let prev = X;
      for (let j = 1; j <= cyc; j++) {
        X += (total * r[j - 1]!) / rs;
        const Tl = j === 1 ? (moving ? 0.38 : 0.5) : 0.36;
        const Tt = j === cyc ? 0.5 : 0.36;
        steps.push({ foot: lead, s: X, T: Tl });
        knots.push((X + prev) / 2);
        times.push(Tl);
        steps.push({ foot: trail, s: X, T: Tt });
        knots.push(X);
        times.push(Tt);
        prev = X;
      }
    } else {
      const e = goal.spread ?? 3;
      const s0 = this.sOf(this.feet[0]);
      const s1 = this.sOf(this.feet[1]);
      const rearFoot = s0 <= s1 ? this.feet[0] : this.feet[1];
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
      let X = frontS;
      let foot: 0 | 1 = rearFoot.i;
      for (let j = 1; j <= k; j++) {
        X += clamp((total * r[j - 1]!) / rs, 2.2, 48);
        const T = j === 1 ? (moving ? TS : 0.5) : j === k ? 0.47 : TS;
        steps.push({ foot, s: X, T });
        foot = foot === 0 ? 1 : 0;
      }
      // the closing step: the trailing foot comes up beside the other
      steps.push({ foot, s: X + e, T: 0.58 });
      // pelvis knots: where the body is now, then the midpoint of the two feet after each landing
      let prev = frontS;
      for (const st of steps) {
        knots.push((st.s + prev) / 2);
        times.push(st.T);
        prev = st.s;
      }
    }
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
   * Advance by dt. `goal` is where the pelvis should end up (or null to stay), `yaw` the way the body faces (the
   * feet land pointing that way), `allowStart` whether a new walk may begin now (the director holds it back while
   * the arms are busy or a turn is not done), `S` the figure's world scale.
   */
  update(dt: number, goal: GaitGoal | null, yaw: number, allowStart: boolean, S: number): void {
    const ox = this.px;
    const od = this.pd;
    this.landedNow = false;
    this.yawNow = yaw;
    this.lx = -Math.sin(yaw);
    this.ld = Math.cos(yaw);
    this.feet[0].S = S;
    this.feet[1].S = S;
    if (!this.walking && allowStart && goal && !this.turning && this.distTo(goal) > (goal.minWalk ?? 5)) this.plan(goal, false, 0);
    let rem = dt;
    for (let guard = 0; rem > 1e-9 && guard < 80; guard++) {
      const cur = this.steps[0];
      if (this.walking && cur) {
        if (!this.lifted && this.segT >= this.liftAt - 1e-9) {
          this.lifted = true;
          const f = this.feet[cur.foot];
          const o = this.latOff(cur.foot);
          f.begin(this.ox + this.dx * cur.s + o[0], this.od + this.dd * cur.s + o[1], this.yawNow, this.toeDur, this.swingDur, this.side ? 0.35 : 1);
          this.stepping = f;
        }
        let h = Math.min(rem, this.segDur - this.segT);
        if (!this.lifted) h = Math.min(h, this.liftAt - this.segT);
        h = Math.max(h, 1e-9);
        this.segT += h;
        rem -= h;
        this.evalPelvis();
        for (const f of this.feet) f.update(h);
        if (this.segT >= this.segDur - 1e-9) this.landing(goal);
      } else {
        this.runTurn(rem);
        for (const f of this.feet) f.update(rem);
        rem = 0;
      }
    }
    if (dt > 0) {
      this.vx = (this.px - ox) / dt;
      this.vd = (this.pd - od) / dt;
    }
    this.still = Math.abs(this.px - ox) + Math.abs(this.pd - od) > 1e-5 || this.walking ? 0 : this.still + dt;
  }

  /** the pivot steps of a turn on the spot: lift each foot at its time, set it down turned in its slot */
  private runTurn(dt: number): void {
    if (this.turnSteps.length === 0) return;
    this.turnClock += dt;
    let done = true;
    for (const st of this.turnSteps) {
      if (!st.begun && this.turnClock >= st.lift) {
        st.begun = true;
        const p = this.slot(st.foot, st.yaw);
        const S = Math.max(0.12, st.land - st.lift);
        const f = this.feet[st.foot];
        // the part of the step spent rolling onto the toe, and the swing; whatever is left of the clock is spent already
        f.begin(p[0], p[1], st.yaw, 0.24 * S, 0.76 * S, 0.5);
        this.stepping = f;
      }
      if (!st.begun || this.turnClock < st.land + 0.02) done = false;
    }
    if (done && this.feet[0].state === STANCE && this.feet[1].state === STANCE) {
      this.turnSteps = [];
      this.stepping = null;
    }
  }

  private evalPelvis(): void {
    const T = this.segDur;
    const u = clamp(this.segT / T, 0, 1);
    const u2 = u * u;
    const u3 = u2 * u;
    const p = (2 * u3 - 3 * u2 + 1) * this.p0 + (u3 - 2 * u2 + u) * T * this.v0 + (-2 * u3 + 3 * u2) * this.p1 + (u3 - u2) * T * this.v1;
    this.px = this.ox + this.dx * p;
    this.pd = this.od + this.dd * p;
  }

  private landing(goal: GaitGoal | null): void {
    const cur = this.steps[0]!;
    // make sure the landing foot is down exactly on its spot
    this.feet[cur.foot].forceLand();
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
      this.vd = 0;
      return;
    }
    // re-plan from the real state if the goal has moved, else carry on
    if (goal) {
      const along = (goal.x - this.ox) * this.dx + (goal.d - this.od) * this.dd;
      const lateral = Math.abs((goal.x - this.ox) * -this.dd + (goal.d - this.od) * this.dx);
      // a goal that has swung round behind the walker waits for this walk to finish (no walking back through oneself)
      const ahead = (goal.x - this.px) * this.dx + (goal.d - this.pd) * this.dd > 0;
      if (ahead && (Math.abs(this.goalS - along) > 3.5 || lateral > 3.5)) {
        const keep = { steps: this.steps, knots: this.knots, times: this.times, knotIdx: this.knotIdx, ox: this.ox, od: this.od, dx: this.dx, dd: this.dd, goalS: this.goalS, side: this.side };
        // a plan that would leave the closing stride unbalanced (mid sidestep) just carries on
        if (!this.side && this.plan(goal, true, vEnd)) return;
        Object.assign(this, keep);
      }
    }
    this.v0 = vEnd;
    this.beginSegment();
  }
}
