/**
 * (The climber's copy of the vine gardener's gait, with one addition: a FOLLOW mode, for walking in step with a
 * moving thing, a snowball being pushed. See `follow` below.)
 *
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
import { DIM, FOOT_W } from '../../vine/scene/gardenerDims';
import { clamp, lerp, lerpAngle, sstep } from '../../vine/scene/gardenerMath';
import { LEG, ROLL_AT_STRIKE, ROLL_AT_TOE_OFF, TOE_OFF, footRoll, swingAt, walkStyle } from '../../vine/scene/gardenerWalk';

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
const sw = { p: 0, h: 0 };
/** the measured walk's heel strike and push-off rolls (the measured foot lands nearly flat) */
const ROLL_HEEL_M = ROLL_AT_STRIKE;
const ROLL_TOE_M = Math.min(0.9, ROLL_AT_TOE_OFF);

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
  /** this step follows the measured walk (a turn or a side-step does not) */
  mo = false;
  /** the heel already rising off a planted foot as the other foot swings through (measured walk, set by the gait) */
  push = 0;
  /** the length of the step in progress, in rig units */
  stepLen = 0;
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

  begin(tx: number, td: number, yawT: number, toe: number, swing: number, rollK = 1, measured = false): void {
    this.mo = measured;
    this.stepLen = Math.hypot(tx - this.ax, td - this.ad) / Math.max(1e-6, this.S);
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

  private get heelRoll(): number {
    return (this.mo ? ROLL_HEEL_M : ROLL_HEEL) * this.rollK;
  }

  private land(): void {
    this.push = 0;
    rollAnkle(this.heelRoll, tmp);
    this.ax = this.tx;
    this.ad = this.td;
    this.yaw = this.tyaw;
    this.state = STANCE;
    this.tLand = 0;
    this.roll = this.heelRoll + this.tipRoll;
    this.x = this.tx + Math.cos(this.yaw) * tmp.dx * this.S;
    this.d = this.td + Math.sin(this.yaw) * tmp.dx * this.S;
    this.h = tmp.h;
    this.a = this.heelRoll;
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
      const heel = this.heelRoll * (1 - sstep(this.tLand / 0.09));
      this.roll = heel + this.tipRoll + this.push;
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
      this.roll = lerp(this.r0, (this.mo ? ROLL_TOE_M : ROLL_TOE) * this.rollK, u);
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
    rollAnkle(this.heelRoll, tmp);
    const ex = this.tx + Math.cos(this.tyaw) * tmp.dx * this.S;
    const ed = this.td + Math.sin(this.tyaw) * tmp.dx * this.S;
    const ez = tmp.h;
    if (this.mo) {
      // the measured swing: the heel kicks up behind early, the foot travels low and lands nearly flat; a short step
      // lifts less. The roll follows the measured foot, eased from the push-off and into the heel strike.
      swingAt(s, sw);
      const liftK = clamp(this.stepLen / STEP_M, 0.35, 1);
      this.x = lerp(this.sx, ex, sw.p);
      this.d = lerp(this.sd, ed, sw.p);
      this.h = lerp(this.sz, ez, s) + sw.h * LEG * liftK;
      const psi = TOE_OFF + s * (1 - TOE_OFF);
      const am = footRoll(psi) * liftK;
      this.a = am + (this.sa - ROLL_AT_TOE_OFF * liftK) * (1 - sstep(s / 0.35)) + (this.heelRoll - ROLL_AT_STRIKE * liftK) * sstep((s - 0.65) / 0.35);
      this.yaw = lerpAngle(this.syaw, this.tyaw, sstep(s));
      return;
    }
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

/**
 * Walk in step with something that moves: the spot the pelvis should be at now (true ground units), its velocity
 * and the unit heading it moves along. The gait picks each step's length and time from the speed (a long stride at
 * a brisk pace, short ones at a crawl) and lands it so the pelvis is where it should be at the next landing; it
 * stands still when the thing barely moves and takes a step when it has drifted too far.
 */
export interface FollowGoal {
  x: number;
  d: number;
  vx: number;
  vd: number;
  hx: number;
  hd: number;
}

/** following: below this speed along the heading (units/s) the walker stands, above it steps */
const FOLLOW_START_V = 9;
const FOLLOW_STOP_V = 5;
/** following: a lag beyond this (units) along the heading starts a step even from standing; below FOLLOW_STOP_LAG it may stop */
const FOLLOW_START_LAG = 13;
const FOLLOW_STOP_LAG = 8;
/** the longest stride (units, a step of a brisk jog) */
const FOLLOW_L_MAX = 62;
/** step time (s) for a ground speed (units/s): the measured walk's 0.6 s at its own pace, slower and shorter below it, quicker above */
const followStepTime = (v: number): number => clamp(TS_M * Math.pow(77 / Math.max(v, 1), 0.42), 0.4, 0.82);

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
/** the measured walk: a longer, slower stride (about 0.8 of a leg per step, 100 steps a minute, as the subject's stroll) */
const STEP_M = 46;
const TS_M = 0.6;
const SIDE_STEP = 24;

/** the figure scale the strides above are measured for (the vine's gardener at its path) */
const S_REF = 0.95;

export class Gait {
  /**
   * The figure's size against the one the strides were measured for: every step length and the follow thresholds are
   * scaled by it (a smaller figure takes shorter steps, and reads speed against its own size), so the legs are never
   * asked for a stride they cannot make.
   */
  private k = 1;

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
  /** the measured walk: the cycle phase (0 at foot 0's heel strike) and how much of the walk shows (0 standing .. 1 striding) */
  phase = 0;
  amp = 0;

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
  /** walk in step with this (null: not following); set by the director every frame */
  follow: FollowGoal | null = null;
  /** following: the step time (s) for a speed (units/s, against the figure's size); null for followStepTime. A
   *  figure may bring its own, measured, law (how much of a quicker walk comes from cadence rather than stride) */
  followLaw: ((v: number) => number) | null = null;
  /** the longest step it may take, following or walking to a spot (units, against the figure's size); null for no limit but
   *  the gait's own. A walker who has fallen behind takes quicker steps, not ones longer than the legs reach */
  stepMax: number | null = null;
  /** the plan under way is a follow plan (two steps ahead, never ending at rest) */
  private followPlan = false;
  /** the followed spot's lead ahead of the pelvis along the heading, and its lateral error */
  followLag = 0;
  followLat = 0;

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
    // measured (turns in place, CMU 69_16/69_18): the body starts round on both feet, the lead foot opens out most of
    // the way early, the other closes in the second half; each step is in the air for most of its share
    const mo = walkStyle === 'measured';
    for (let j = 1; j <= n; j++) {
      const ratio = j === n ? 1 : (j / Math.max(1, n - 1)) * 0.92;
      const foot = (((j - 1) % 2 === 0 ? lead : 1 - lead) as 0 | 1);
      const lift = mo ? dur * (0.05 + ((j - 1) * 0.92) / n) : (j - 1) * share + 0.02;
      const land = mo ? lift + dur * (0.8 * 0.92) / n : j * share;
      steps.push({ foot, lift, land, yaw: yaw0 + delta * ratio, begun: false });
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
    this.followPlan = false;
    const steps: Step[] = [];
    const knots: number[] = [0];
    const times: number[] = [0];
    if (this.side) {
      // lead with the foot on the side being moved to; each cycle the leader goes a stride out, the other closes up
      const lead: 0 | 1 = ux * this.lx + ud * this.ld >= 0 ? 0 : 1;
      const trail: 0 | 1 = lead === 0 ? 1 : 0;
      let X = Math.min(this.sOf(this.feet[lead]), this.sOf(this.feet[trail]));
      const cyc = Math.max(1, Math.round((dist - X) / (SIDE_STEP * this.k)));
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
        const Tl = j === 1 ? (moving ? 0.32 : 0.42) : 0.3;
        const Tt = j === cyc ? 0.4 : 0.3;
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
      const mo = walkStyle === 'measured';
      const Lnom = (mo ? STEP_M : STEP_NOM) * hurry * this.k;
      const ts = mo ? TS_M : TS;
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
        X += clamp((total * r[j - 1]!) / rs, 2.2, Math.min(mo ? 56 : 48, this.stepMax === null ? Infinity : this.stepMax * this.k));
        const T = mo ? (j === 1 ? (moving ? ts : ts + 0.06) : j === k ? ts + 0.03 : ts) : j === 1 ? (moving ? TS : 0.5) : j === k ? 0.47 : TS;
        steps.push({ foot, s: X, T });
        foot = foot === 0 ? 1 : 0;
      }
      // the closing step: the trailing foot comes up beside the other
      steps.push({ foot, s: X + e, T: mo ? ts + 0.08 : 0.58 });
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

  private distToFollow(): number {
    const f = this.follow;
    return f ? Math.hypot(f.x - this.px, f.d - this.pd) : 0;
  }

  /** how far the ideal spot is ahead of the pelvis along the heading (lag) and to the side of it (lat) */
  private measureFollow(): void {
    const f = this.follow;
    if (!f) {
      this.followLag = 0;
      this.followLat = 0;
      return;
    }
    const gx = f.x - this.px;
    const gd = f.d - this.pd;
    this.followLag = gx * f.hx + gd * f.hd;
    this.followLat = -gx * f.hd + gd * f.hx;
  }

  /** whether the walker should be taking steps now: it starts when the thing moves or has drifted away, and stops when it is at rest and close */
  private wantsFollowStep(fromStand: boolean): boolean {
    const f = this.follow!;
    const v = f.vx * f.hx + f.vd * f.hd;
    const off = Math.max(Math.abs(this.followLag), Math.abs(this.followLat) * 1.3);
    const k = this.k;
    if (fromStand) return v > FOLLOW_START_V * k || off > FOLLOW_START_LAG * k;
    return v > FOLLOW_STOP_V * k || off > FOLLOW_STOP_LAG * k;
  }

  /**
   * Plan the next step (and a second, only so the pelvis keeps its speed through the first landing) so that the
   * pelvis is at the followed spot at the next landing: the rear foot swings through to a stride past the front
   * one, half of it the pace the thing is going at and half the correction.
   */
  private planFollow(moving: boolean, vEnd: number): void {
    const f = this.follow!;
    const v = Math.max(0, f.vx * f.hx + f.vd * f.hd);
    // (the cadence for this speed relative to the figure's size)
    const T = (this.followLaw ?? followStepTime)(v / this.k);
    const Lnom = clamp(v * T, 5 * this.k, FOLLOW_L_MAX * this.k);
    const T1 = moving ? T : T * 0.92;
    // the spot the pelvis should be at when the step lands, and the line to it
    const tx = f.x + f.vx * T1;
    const td = f.d + f.vd * T1;
    const gx = tx - this.px;
    const gd = td - this.pd;
    const along = gx * f.hx + gd * f.hd;
    const lat = -gx * f.hd + gd * f.hx;
    let ux = f.hx * Math.max(along, 10) - f.hd * lat;
    let ud = f.hd * Math.max(along, 10) + f.hx * lat;
    const ul = Math.hypot(ux, ud) || 1;
    ux /= ul;
    ud /= ul;
    this.ox = this.px;
    this.od = this.pd;
    this.dx = ux;
    this.dd = ud;
    this.side = false;
    this.followPlan = true;
    const alongU = gx * ux + gd * ud;
    const s0 = this.sOf(this.feet[0]);
    const s1 = this.sOf(this.feet[1]);
    const rear = s0 <= s1 ? this.feet[0] : this.feet[1];
    const front = rear === this.feet[0] ? this.feet[1] : this.feet[0];
    const sFront = Math.max(s0, s1);
    this.goalS = alongU;
    // the stride that puts the pelvis (the midpoint of the feet) on the spot, blended with the nominal stride
    let L = 0.5 * Lnom + (alongU - sFront);
    const Lmax = FOLLOW_L_MAX * this.k;
    L = clamp(L, Math.max(2.2 * this.k, 0.3 * Lnom), moving ? Math.min(Lmax, 1.4 * Lnom + 6 * this.k) : Math.min(Lmax, 1.3 * Lnom + 6 * this.k));
    if (this.stepMax !== null) L = Math.min(L, this.stepMax * this.k);
    const sLand = sFront + L;
    const sNext = sLand + Math.max(Lnom, 2.2 * this.k);
    this.steps = [
      { foot: rear.i, s: sLand, T: T1 },
      { foot: front.i, s: sNext, T },
    ];
    const k1 = (sLand + sFront) / 2;
    this.knots = [0, k1, (sNext + sLand) / 2];
    this.times = [0, T1, T];
    this.knotIdx = 0;
    this.v0 = moving ? Math.min(vEnd, (2.2 * Math.max(k1, 1)) / T1) : 0;
    this.beginSegment();
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
    // the measured walk lifts the foot as the other lands (its heel is already up) and swings almost the whole step
    const mo = walkStyle === 'measured' && !this.side;
    const S = mo ? clamp(st.T - 0.01, 0.3, 0.8) : clamp(st.T - 0.02, 0.3, 0.52);
    this.liftAt = st.T - S;
    this.lifted = false;
    this.toeDur = (mo ? 0.1 : 0.24) * S;
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
    this.k = Math.max(0.2, S / S_REF);
    this.measureFollow();
    if (!this.walking && allowStart && !this.turning) {
      if (this.follow) {
        if (this.wantsFollowStep(true)) this.planFollow(false, 0);
      } else if (goal && this.distTo(goal) > (goal.minWalk ?? 5)) this.plan(goal, false, 0);
    }
    let rem = dt;
    for (let guard = 0; rem > 1e-9 && guard < 80; guard++) {
      const cur = this.steps[0];
      if (this.walking && cur) {
        if (!this.lifted && this.segT >= this.liftAt - 1e-9) {
          this.lifted = true;
          const f = this.feet[cur.foot];
          const o = this.latOff(cur.foot);
          f.begin(this.ox + this.dx * cur.s + o[0], this.od + this.dd * cur.s + o[1], this.yawNow, this.toeDur, this.swingDur, this.side ? 0.35 : 1, walkStyle === 'measured' && !this.side);
          this.stepping = f;
        }
        let h = Math.min(rem, this.segDur - this.segT);
        if (!this.lifted) h = Math.min(h, this.liftAt - this.segT);
        h = Math.max(h, 1e-9);
        this.segT += h;
        rem -= h;
        this.evalPelvis();
        this.walkPhase(cur.foot);
        for (const f of this.feet) f.update(h);
        if (this.segT >= this.segDur - 1e-9) this.landing(goal);
      } else {
        this.feet[0].push = 0;
        this.feet[1].push = 0;
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
    // how much of the measured walk shows: the stride's share of a full stroll, eased
    const ampT = walkStyle === 'measured' && this.walking && !this.side ? clamp(this.speed / ((STEP_M * this.k) / TS_M), 0, 1) : 0;
    if (dt > 0) this.amp += (ampT - this.amp) * (1 - Math.exp(-dt / 0.18));
  }

  /**
   * The cycle phase from the step in progress (the stepping foot is half way through its cycle when it lifts, the
   * other has just landed), and the planted foot's heel rising toward its own push-off.
   */
  private walkPhase(stepping: 0 | 1): void {
    const u = clamp(this.segT / this.segDur, 0, 1);
    this.phase = stepping === 0 ? 0.5 + 0.5 * u : 0.5 * u;
    const other = this.feet[stepping === 0 ? 1 : 0];
    other.push = walkStyle === 'measured' && !this.side && other.mo ? this.amp * Math.max(0, footRoll(0.5 * u)) * sstep((0.5 * u - 0.25) / 0.1) : 0;
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
    // following: plan the next step from the real state; or end (or hand over to a goal) when there is nothing to follow
    if (this.followPlan || (this.follow && this.distToFollow() < 36)) {
      if (this.follow) {
        this.measureFollow();
        if (this.wantsFollowStep(false)) {
          this.planFollow(true, vEnd);
          return;
        }
      } else if (goal && this.distTo(goal) > (goal.minWalk ?? 5)) {
        this.followPlan = false;
        if (this.plan(goal, true, vEnd)) return;
      }
      const D = clamp(vEnd * 0.5, 5, 34);
      this.followPlan = false;
      if (this.plan({ x: this.px + this.dx * D, d: this.pd + this.dd * D, spread: 3 }, true, vEnd)) return;
      this.steps = [];
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
