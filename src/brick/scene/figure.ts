/**
 * One of the crew (the builder, the bricklayer, a carter): the vine gardener's jointed figure as the snow's climber
 * uses it (a real 3D skeleton drawn in the world's oblique projection, parts cached as sprites, see crewArt.ts),
 * driven by the climber's footstep gait (with its FOLLOW mode, for walking in step with something that moves).
 *
 * The figure is a body that a director (builder.ts, bricklayer.ts, carter.ts) steers every step: where to walk and
 * which way to face (goTo), where each hand should be (hold, in world coordinates) and how firmly (a weight that
 * blends the arms in from their free swing), how much to crouch and lean, whether to sit, how high the boards it
 * stands on are (elev), and how high each foot is lifted off them (for ladders). Every one of these moves along its
 * own eased path, so a director changing its mind never snaps anything: the figure finishes or blends out of what it
 * was doing. Turning round is a few pivot steps through a three-quarter view; feet never slide.
 */
import type { LoanId } from '../types';
import { DIM, FOREARM, KAPPA, VIEWS } from '../../vine/scene/gardenerDims';
import { Gait, STANCE, type FollowGoal, type GaitGoal } from '../../snow/scene/climberGait';
import { LEG, WALK_BOB, WALK_PELVIS_ROLL, WALK_PELVIS_YAW, WALK_SWAY, WALK_THORAX_YAW, cyc, wristSwing } from '../../vine/scene/gardenerWalk';
import { Mover, Spring1, clamp, hash1, ik3, lerp, lerp3, norm3, softMin, sstep, sstep5, swing3, wrapPi, type IK3Out, type V3 } from '../../vine/scene/gardenerMath';
import { buildCrewSet, type Part, type Role, type Sprites } from './crewArt';
import { CREW_H, depthScale, type Pt } from './geom';
import { Cached, r4 } from './cache';

const PI = Math.PI;
/** rig units to world units at the reference depth: the crew are CREW_H tall, the gardener's rig 122 */
export const UNIT = CREW_H / 122;
const CROUCH_DROP = 24;
const WALK_DROP = 3.5;
const ARM = 49;
const TORSO_W = 9.4;
const TORSO_D = 8;
const WALK_TURN = 2.0;

const mk = (): IK3Out => ({ joint: [0, 0, 0], end: [0, 0, 0], reach: true });

/** a point in the world: x, depth y, and h above the ground */
export interface W3 {
  x: number;
  y: number;
  h: number;
}

export interface Frame {
  /** the pelvis's ground point (world) */
  x: number;
  y: number;
  /** the height of the boards stood on */
  elev: number;
  yaw: number;
  /** unit vectors in world units (x, depth y) forward and to the figure's left (hand 0's side) */
  fwd: Pt;
  side: Pt;
  /** world units per rig unit here */
  S: number;
}

export class Figure {
  readonly role: Role;
  readonly id: LoanId;
  private readonly set: Sprites;
  readonly gait: Gait;
  private readonly seed: number;

  // continuous quantities
  readonly yaw = new Mover(0);
  private readonly twist = new Spring1(0);
  private readonly headYaw = new Spring1(0);
  private readonly look = new Spring1(0);
  readonly seat = new Mover(0);
  private readonly wWalk = new Mover(0);
  /** how firmly each hand is on its target (0 free … 1 there) */
  readonly wHold: [Mover, Mover] = [new Mover(0), new Mover(0)];
  private readonly crouchS = new Spring1(0);
  private readonly leanS = new Spring1(0);
  private readonly sway = new Spring1(0);
  private readonly speed = new Spring1(0);
  private readonly swingN = new Spring1(0);
  private readonly swingF = new Spring1(0);
  /** the boards' height under the feet (world units) */
  readonly elev = new Mover(0);
  /** each foot lifted above the boards (rig units), for climbing */
  readonly footLift: [Spring1, Spring1] = [new Spring1(0), new Spring1(0)];

  // what the director asks for this step
  private goal: GaitGoal | null = null;
  private followGoal: FollowGoal | null = null;
  private yawWant: number | null = null;
  private yawTrack = false;
  private walkOK = true;
  following = false;
  /** hand targets (world), held from the last time they were given */
  private handT: [W3 | null, W3 | null] = [null, null];
  crouchT = 0;
  leanT = 0;
  /** where to look: a pitch (negative up) and a yaw offset, or null for the idle glances */
  lookT: { pitch: number; yaw: number } | null = null;
  /** the seated hip height (rig units) */
  seatHip = 20;
  /** how far behind the seat's front edge the hips sit (rig units) */
  sitBack = 24;

  clock = 0;
  private glanceAt = 3.2;
  private glanceUntil = 0;
  private glanceN = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private frameDt = 1 / 60;

  // the solved pose
  private S = 1;
  private wy = 500;
  private hipC: V3 = [0, 0, 60];
  private hips: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private knee: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private ankle: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private sUp: V3 = [0, 0, 1];
  private neck: V3 = [0, 0, 100];
  private shoulder: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private elbow: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private glove: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private breath = 1;
  private fx = 0;
  private yawT = 0;
  private yawH = 0;
  reachErr = 0;
  private ikA = mk();
  private ikB = mk();
  private wsw: [number, number, number] = [0, 0, 0];
  private elbowDir: [V3, V3] = [[0, 0, -1], [0, 0, -1]];
  private snapElbows = true;
  private readonly cache = new Cached();

  constructor(role: Role, id: LoanId, q: number, x: number, y: number, yaw: number, seed: number) {
    this.role = role;
    this.id = id;
    this.set = buildCrewSet(role, id, q);
    this.seed = seed;
    this.gait = new Gait(x, y / KAPPA, yaw);
    this.yaw.snap(yaw);
    this.solve();
  }

  /* ---------------------------------------------------------------- what a director reads */

  /** the pelvis's ground point and the way the figure faces, in world units */
  frame(): Frame {
    const gp = this.gait;
    const y = this.yaw.v;
    const S = depthScale(KAPPA * gp.pd) * UNIT;
    const f = { x: Math.cos(y), y: Math.sin(y) * KAPPA };
    const s = { x: -Math.sin(y), y: Math.cos(y) * KAPPA };
    return { x: gp.px, y: KAPPA * gp.pd, elev: this.elev.v, yaw: y, fwd: f, side: s, S };
  }

  /** where a hand is now (world) */
  hand(i: 0 | 1): W3 {
    const g = this.glove[i]!;
    const p = this.scr(g);
    return { x: p[0], y: this.wy + this.S * KAPPA * g[1], h: this.S * g[2] + this.elev.v };
  }

  feet(): { x: number; y: number; h: number } {
    return { x: this.fx, y: this.wy, h: this.elev.v };
  }

  get walking(): boolean {
    return this.gait.walking;
  }

  get still(): boolean {
    if (this.gait.walking || this.gait.turning) return false;
    for (const f of this.gait.feet) if (f.state !== STANCE) return false;
    return !this.yaw.moving;
  }

  facing(yaw: number, tol = 0.15): boolean {
    return Math.abs(wrapPi(yaw - this.yaw.v)) < tol && !this.yaw.moving && !this.gait.turning;
  }

  /** the facing (yaw) of a direction given in world units */
  static yawOf(dx: number, dy: number): number {
    return Math.atan2(dy / KAPPA, dx);
  }

  /* ---------------------------------------------------------------- what a director sets, every step */

  /** start of a step: clear the per-step requests */
  begin(): void {
    this.goal = null;
    this.followGoal = null;
    this.yawWant = null;
    this.yawTrack = false;
    this.walkOK = true;
  }

  /**
   * Head for a spot: returns true once there (within `tol`) and facing as asked (null: any way). The body turns into
   * the way of travel as the walk begins (or in one turn on the spot if that is more than about 115 degrees), and
   * swings round to the final facing over the last strides.
   */
  goTo(spot: { x: number; y: number }, finalYaw: number | null, tolIn = 3): boolean {
    const gp = this.gait;
    const tol = Math.max(tolIn, 2);
    const sd = spot.y / KAPPA;
    const d = Math.hypot(spot.x - gp.px, sd - gp.pd);
    if (d > tol || gp.walking) {
      const heading = Math.atan2(sd - gp.pd, spot.x - gp.px);
      // a goal that has swung round behind a walk under way: come to a stop a short way ahead, still facing the way
      // of the walk, and turn round after (never walking backwards to finish the old walk)
      const vl = Math.hypot(gp.vx, gp.vd);
      if (gp.walking && vl > 4) {
        const wy = Math.atan2(gp.vd, gp.vx);
        if (Math.abs(wrapPi(heading - wy)) > 1.9) {
          this.goal = { x: gp.px + (gp.vx / vl) * 10, d: gp.pd + (gp.vd / vl) * 10, spread: 3, minWalk: 2 };
          this.yawWant = wy;
          this.yawTrack = true;
          return false;
        }
      }
      this.goal = { x: spot.x, d: sd, spread: 3, minWalk: tol };
      if (gp.walking) {
        let want = heading;
        if (finalYaw !== null && (d < 12 || (d < 45 && Math.abs(wrapPi(finalYaw - heading)) <= 1.8))) want = finalYaw;
        this.yawWant = want;
        this.yawTrack = true;
        this.walkOK = true;
      } else {
        const dyaw = wrapPi(heading - this.yaw.v);
        this.walkOK = Math.abs(dyaw) <= WALK_TURN;
        this.yawWant = this.walkOK ? null : heading;
        this.yawTrack = true;
      }
      return false;
    }
    if (finalYaw === null) return true;
    this.yawWant = finalYaw;
    return this.facing(finalYaw, 0.12);
  }

  /** turn on the spot to face `yaw` (no walk); true once facing */
  face(yaw: number): boolean {
    this.yawWant = yaw;
    return this.facing(yaw, 0.12);
  }

  /** walk in step with a moving place (FOLLOW): its position and velocity in world units, heading as `yaw` */
  follow(x: number, y: number, vx: number, vy: number, yaw: number): void {
    this.followGoal = { x, d: y / KAPPA, vx, vd: vy / KAPPA, hx: Math.cos(yaw), hd: Math.sin(yaw) };
    this.yawWant = yaw;
    this.yawTrack = false;
    this.following = true;
  }

  /** put hand i on a world point (null keeps the last one), blending in over `dur` seconds; w 0 lets go */
  hold(i: 0 | 1, at: W3 | null, w: number, dur = 0.5): void {
    if (at) this.handT[i] = at;
    if (this.wHold[i].target !== w) this.wHold[i].go(w, dur);
  }

  /** both hands at once */
  holdBoth(a: W3 | null, b: W3 | null, w: number, dur = 0.5): void {
    this.hold(0, a, w, dur);
    this.hold(1, b, w, dur);
  }

  /** sit (1) or stand (0) where the figure is */
  sit(on: boolean, dur = 1.4): void {
    if (this.seat.target !== (on ? 1 : 0)) this.seat.go(on ? 1 : 0, dur);
  }

  /** stand on boards `h` high (world units), getting there over `dur` seconds */
  setElev(h: number, dur: number): void {
    if (Math.abs(this.elev.target - h) > 1e-6) this.elev.go(h, dur);
  }

  /* ---------------------------------------------------------------- stepping */

  /** advance by h seconds (call after the director's requests for this step) */
  step(h: number): void {
    this.frameDt = h;
    this.clock += h;
    this.driveYaw();
    this.yaw.update(h);
    this.seat.update(h);
    this.elev.update(h);
    this.wHold[0].update(h);
    this.wHold[1].update(h);
    const allow = this.seat.v < 0.004 && !this.seat.moving && !this.gait.turning && this.walkOK && this.gait.feet[0].tipRoll < 0.02 && (!this.yaw.moving || this.following);
    this.gait.follow = this.followGoal;
    if (!this.followGoal) this.following = false;
    this.gait.update(h, this.goal, this.yaw.v, allow, this.S);
    this.wWalk.go(this.gait.walking ? 1 : 0, 0.3);
    this.wWalk.update(h);
    this.speed.update(h, this.gait.speed, 12);
    const f0 = this.gait.feet[0].state === STANCE ? 1 : 0;
    const f1 = this.gait.feet[1].state === STANCE ? 1 : 0;
    this.sway.update(h, (this.gait.walking ? 1.7 : this.gait.turning ? 2.6 : 0) * (f0 - f1), 12);
    this.crouchS.update(h, this.crouchT, 7);
    this.leanS.update(h, this.leanT, 7);
    this.idleLife(h);
    let tw = 0;
    if (this.yaw.moving || this.gait.turning) tw = clamp(0.12 * wrapPi(this.yaw.target - this.yaw.v), -0.12, 0.12);
    this.twist.update(h, tw, 9);
  }

  /** set each foot's lift (rig units) toward a value (the ladder) */
  liftFeet(a: number, b: number, h: number): void {
    this.footLift[0].update(h, a, 14);
    this.footLift[1].update(h, b, 14);
  }

  /** straight into a pose where it happens: standing at (x, y) facing yaw (scrubbing, reduced motion) */
  placeAt(x: number, y: number, yaw: number, o: { elev?: number; seat?: boolean; crouch?: number; lean?: number; hands?: [W3 | null, W3 | null] } = {}): void {
    this.goal = null;
    this.followGoal = null;
    this.following = false;
    this.yawWant = null;
    this.seat.snap(o.seat ? 1 : 0);
    this.elev.snap(o.elev ?? 0);
    this.wWalk.snap(0);
    this.look.snap(0);
    this.headYaw.snap(0);
    this.sway.snap(0);
    this.speed.snap(0);
    this.swingN.snap(0);
    this.swingF.snap(0);
    this.crouchT = o.crouch ?? 0;
    this.leanT = o.lean ?? 0;
    this.crouchS.snap(this.crouchT);
    this.leanS.snap(this.leanT);
    this.footLift[0].snap(0);
    this.footLift[1].snap(0);
    const hands = o.hands ?? [null, null];
    for (const i of [0, 1] as const) {
      this.handT[i] = hands[i];
      this.wHold[i].snap(hands[i] ? 1 : 0);
    }
    this.yaw.snap(yaw);
    this.twist.snap(0);
    this.gait.stand(x, y / KAPPA, yaw);
    for (const f of this.gait.feet) f.place(f.ax, f.ad, f.yaw);
    for (const f of this.gait.feet) f.update(0);
    this.snapElbows = true;
    this.solve();
  }

  /** settle the pose after stepping (call once per frame) */
  finish(): void {
    this.solve();
  }

  /* ---------------------------------------------------------------- internals */

  private scr(u: V3): [number, number] {
    return [this.gait.px + this.S * u[0], this.wy - this.elev.v + this.S * (KAPPA * u[1] - u[2])];
  }

  private driveYaw(): void {
    const gp = this.gait;
    if (this.yawWant === null) return;
    const d = wrapPi(this.yawWant - this.yaw.target);
    if (gp.walking) {
      if (this.yawTrack && Math.abs(d) > 0.03 && Math.abs(d) < 1.9) this.yaw.retarget(this.yaw.target + d, 0.5);
      return;
    }
    if (gp.turning) return;
    const dv = wrapPi(this.yawWant - this.yaw.v);
    if (this.yaw.moving) {
      if (this.following && Math.abs(d) > 0.03 && Math.abs(d) < 0.5) this.yaw.retarget(this.yaw.target + d, 0.45);
      return;
    }
    if (Math.abs(dv) <= 0.09) return;
    const calm = this.seat.v < 0.004 && !this.seat.moving && gp.feet[0].tipRoll < 0.02 && gp.feet[0].state === STANCE && gp.feet[1].state === STANCE && gp.feet[0].tLand > 0.12 && gp.feet[1].tLand > 0.12;
    if (!calm) return;
    const dur = Math.abs(dv) > 0.35 ? 0.5 + 0.42 * Math.abs(dv) : 0.6;
    this.yaw.retarget(this.yaw.v + dv, dur);
    if (Math.abs(dv) > 0.35) gp.startTurn(this.yaw.v, dv, dur, Math.abs(dv) < 1.22 ? 2 : Math.abs(dv) < 2.44 ? 3 : 4);
  }

  private idleLife(h: number): void {
    const calm = !this.gait.walking && !this.yaw.moving && !this.gait.turning && this.wHold[0].v < 0.05 && this.wHold[1].v < 0.05;
    if (this.clock >= this.glanceAt && calm) {
      this.glanceN++;
      this.glanceUntil = this.clock + 1.7 + 0.8 * (hash1(this.glanceN, this.seed) * 0.5 + 0.5);
      this.glanceAt = this.glanceUntil + 3.5 + 4.5 * (hash1(this.glanceN + 50, this.seed) * 0.5 + 0.5);
      const side = hash1(this.glanceN + 3, this.seed) > 0 ? 1 : -1;
      this.lookYaw = side * (0.3 + 0.3 * hash1(this.glanceN + 9, this.seed));
      this.lookPitch = -0.2 - 0.15 * hash1(this.glanceN + 19, this.seed);
    }
    if (this.clock >= this.glanceUntil || !calm) {
      this.lookYaw = 0;
      this.lookPitch = 0;
    }
    let tgt = this.lookT ? this.lookT.pitch : this.lookPitch;
    let tYaw = this.lookT ? this.lookT.yaw : this.lookYaw;
    if (this.yaw.moving || this.gait.turning) tYaw = clamp(0.5 * wrapPi(this.yaw.target - this.yaw.v), -0.45, 0.45);
    if (this.crouchS.x > 0.3) tgt = Math.max(tgt, 0.25);
    this.look.update(h, tgt, 7);
    this.headYaw.update(h, tYaw, 8);
  }

  private solve(): void {
    const gp = this.gait;
    const wy = KAPPA * gp.pd;
    const S = depthScale(wy) * UNIT;
    this.S = S;
    this.wy = wy;
    const yaw = this.yaw.v;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fP: V3 = [cy, sy, 0];
    const lP: V3 = [-sy, cy, 0];
    const wa = gp.amp;
    const phi = gp.phase;
    const pelYaw = wa * cyc(WALK_PELVIS_YAW, phi);
    const pelRoll = wa * cyc(WALK_PELVIS_ROLL, phi);
    const yT = yaw + this.twist.x + pelYaw + wa * cyc(WALK_THORAX_YAW, phi);
    this.yawT = yT;
    this.yawH = yT + this.headYaw.x;
    const fT: V3 = [Math.cos(yT), Math.sin(yT), 0];
    const lT: V3 = [-Math.sin(yT), Math.cos(yT), 0];
    const sigma = this.seat.v;
    const calm = 1 - this.wWalk.v;
    const wH = Math.max(this.wHold[0].v, this.wHold[1].v);
    const idleShift = (0.7 * Math.sin(this.clock * 0.55 + this.seed) + 0.3 * Math.sin(this.clock * 1.31 + 2)) * calm * (1 - sigma) * (1 - wH * 0.6);
    const sitBack = this.sitBack * sstep(sigma / 0.8);
    const shiftA = 0.35 * idleShift - sitBack;
    const shiftB = this.sway.x + 1.0 * idleShift + wa * cyc(WALK_SWAY, phi) * LEG;
    const ho: V3 = [fP[0] * shiftA + lP[0] * shiftB, fP[1] * shiftA + lP[1] * shiftB, 0];
    const A: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 2; i++) {
      const f = gp.feet[i]!;
      A[i] = [(f.x - gp.px) / S, (f.d - gp.pd) / S, f.h + this.footLift[i]!.x];
    }
    let H0 = 1e9;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const hx = ho[0] + lP[0] * sg * DIM.HIPW;
      const hz = ho[1] + lP[1] * sg * DIM.HIPW;
      const dh = Math.hypot(A[i]![0] - hx, A[i]![1] - hz);
      const need = A[i]![2] + Math.sqrt(Math.max(1, DIM.LMAX * DIM.LMAX - dh * dh));
      H0 = H0 > 1e8 ? need : softMin(H0, need, 1.2);
    }
    const crouch = this.crouchS.x * CROUCH_DROP;
    const fy = sstep5(clamp((sigma - 0.1) / 0.9, 0, 1));
    const Hw = wa > 0.001 ? softMin(H0, DIM.FH + DIM.LMAX - WALK_DROP * wa + wa * cyc(WALK_BOB, phi) * LEG, 1.2) : H0;
    const H = lerp(Hw - crouch, this.seatHip, fy);
    const hipC: V3 = [ho[0], ho[1], H];
    this.hipC = hipC;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const f = gp.feet[i]!;
      const cP = Math.cos(pelYaw) * DIM.HIPW * sg;
      const sP = Math.sin(pelYaw) * DIM.HIPW * sg;
      const hip: V3 = [hipC[0] + lP[0] * cP + fP[0] * sP, hipC[1] + lP[1] * cP + fP[1] * sP, H + sg * DIM.HIPW * Math.sin(pelRoll)];
      this.hips[i] = hip;
      const dy = wrapPi(f.yaw - yaw);
      const py = yaw + dy * 0.5 * (1 - sstep((Math.abs(dy) - 1.0) / 0.9));
      const pole: V3 = [Math.cos(py) + lP[0] * sg * 0.15, Math.sin(py) + lP[1] * sg * 0.15, 0];
      ik3(hip, A[i]!, DIM.THIGH, DIM.SHIN, pole, this.ikA);
      this.knee[i] = this.ikA.joint;
      this.ankle[i] = this.ikA.end;
    }
    const walkLean = 0.05 + 0.08 * sstep(this.speed.x / 70);
    const sitLean = 0.42 * Math.sin(PI * clamp(sigma / 0.75, 0, 1)) - 0.12 * sstep((sigma - 0.75) / 0.25);
    const lean = walkLean * this.wWalk.v + 0.03 * (1 - this.wWalk.v) + sitLean + 0.02 * Math.sin(this.clock * 0.9) * calm + this.leanS.x;
    const br = 1 + 0.011 * Math.sin(this.clock * 1.45 + this.seed) * (1 - 0.7 * this.wWalk.v);
    this.breath = br;
    const sUp: V3 = [Math.sin(lean) * fT[0], Math.sin(lean) * fT[1], Math.cos(lean)];
    this.sUp = sUp;
    const fTp: V3 = [Math.cos(lean) * fT[0], Math.cos(lean) * fT[1], -Math.sin(lean)];
    const along = (a: number, b: number, h: number): V3 => [hipC[0] + fTp[0] * a + lT[0] * b + sUp[0] * h, hipC[1] + fTp[1] * a + lT[1] * b + sUp[1] * h, hipC[2] + fTp[2] * a + sUp[2] * h];
    this.neck = along(0, 0, DIM.TORSO * br);
    const shC = along(0, 0, DIM.SHOULDER * br);
    this.shoulder[0] = [shC[0] + lT[0] * DIM.SHW, shC[1] + lT[1] * DIM.SHW, shC[2]];
    this.shoulder[1] = [shC[0] - lT[0] * DIM.SHW, shC[1] - lT[1] * DIM.SHW, shC[2]];
    const sh0 = this.shoulder[0];
    const sh1 = this.shoulder[1];
    const wKnee = sstep((sigma - 0.45) / 0.45);
    const swingK = this.wWalk.v;
    const rel = (i: number): number => (A[i]![0] - ho[0]) * fP[0] + (A[i]![1] - ho[1]) * fP[1];
    const tN = clamp(rel(1) / 17, -1, 1) * 0.62 * swingK * (1 - wa);
    const tF = clamp(rel(0) / 17, -1, 1) * 0.62 * swingK * (1 - wa);
    if (this.snapElbows) {
      this.swingN.snap(tN);
      this.swingF.snap(tF);
    } else {
      this.swingN.update(this.frameDt, tN, 11);
      this.swingF.update(this.frameDt, tF, 11);
    }
    const hang = (i: number, beta: number, bias: number): V3 => {
      const sg = i === 0 ? 1 : -1;
      const sh = this.shoulder[i]!;
      const b = beta + lean * 0.3;
      return [sh[0] + fT[0] * (Math.sin(b) * ARM + bias) + lT[0] * sg * 2.2, sh[1] + fT[1] * (Math.sin(b) * ARM + bias) + lT[1] * sg * 2.2, sh[2] - Math.cos(b) * ARM];
    };
    let gN = hang(0, this.swingN.x, 3.2);
    let gF = hang(1, this.swingF.x, 2.2);
    if (wa > 0.001) {
      for (let i = 0; i < 2; i++) {
        const sg = i === 0 ? 1 : -1;
        wristSwing(phi + 0.5 * i, this.wsw);
        const g = i === 0 ? gN : gF;
        const o: V3 = [fT[0] * this.wsw[0] + lT[0] * sg * this.wsw[1], fT[1] * this.wsw[0] + lT[1] * sg * this.wsw[1], this.wsw[2]];
        const gg: V3 = [g[0] + o[0] * wa * (1 - this.wHold[i]!.v), g[1] + o[1] * wa * (1 - this.wHold[i]!.v), g[2] + o[2] * wa * (1 - this.wHold[i]!.v)];
        if (i === 0) gN = gg;
        else gF = gg;
      }
    }
    // the hands on what they hold (world targets, into the figure's units)
    for (let i = 0; i < 2; i++) {
      const w = this.wHold[i]!.v;
      const t = this.handT[i];
      if (w <= 0.001 || !t) continue;
      const u: V3 = [(t.x - gp.px) / S, (t.y / KAPPA - gp.pd) / S, (t.h - this.elev.v) / S];
      if (i === 0) gN = swing3(sh0, gN, u, w);
      else gF = swing3(sh1, gF, u, w);
    }
    const thigh = (i: number, k: number): V3 => {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      return [hip[0] + (kn[0] - hip[0]) * k, hip[1] + (kn[1] - hip[1]) * k, hip[2] + (kn[2] - hip[2]) * k + 5.5];
    };
    gN = swing3(sh0, gN, thigh(0, 19 / DIM.THIGH), wKnee * (1 - this.wHold[0].v));
    gF = swing3(sh1, gF, thigh(1, 22 / DIM.THIGH), wKnee * (1 - this.wHold[1].v));
    const kEl = this.snapElbows ? 1 : 1 - Math.exp(-this.frameDt / 0.25);
    this.snapElbows = false;
    const hint: [V3, V3] = [this.armHint(0, fT, lT, kEl), this.armHint(1, fT, lT, kEl)];
    let err = 0;
    for (let i = 0; i < 2; i++) {
      const want = i === 0 ? gN : gF;
      ik3(this.shoulder[i]!, want, DIM.UA, FOREARM, hint[i]!, this.ikB);
      this.elbow[i] = this.ikB.joint;
      this.glove[i] = this.ikB.end;
      err = Math.max(err, Math.hypot(this.ikB.end[0] - want[0], this.ikB.end[1] - want[1], this.ikB.end[2] - want[2]));
      const r = this.shoulder[i]!;
      const e = this.ikB.end;
      let ux = e[0] - r[0];
      let uz = e[1] - r[1];
      let uh = e[2] - r[2];
      const ul = Math.hypot(ux, uz, uh) || 1;
      ux /= ul;
      uz /= ul;
      uh /= ul;
      const j = this.ikB.joint;
      const vx = j[0] - r[0];
      const vz = j[1] - r[1];
      const vh = j[2] - r[2];
      const vd = vx * ux + vz * uz + vh * uh;
      const px = vx - vd * ux;
      const pz = vz - vd * uz;
      const ph = vh - vd * uh;
      const pl = Math.hypot(px, pz, ph);
      if (pl > 1e-3) this.elbowDir[i] = [px / pl, pz / pl, ph / pl];
    }
    this.reachErr = err * S;
    this.fx = gp.px + ho[0] * S;
    void lerp3;
  }

  private armHint(i: number, fT: V3, lT: V3, k: number): V3 {
    const sg = i === 0 ? 1 : -1;
    const pref: V3 = norm3([-0.45 * fT[0] + 0.2 * sg * lT[0], -0.45 * fT[1] + 0.2 * sg * lT[1], -0.85]);
    if (k >= 1) return pref;
    return norm3(lerp3(this.elbowDir[i]!, pref, k));
  }

  /* ---------------------------------------------------------------- painting */

  draw(ctx: CanvasRenderingContext2D): void {
    const set = this.set;
    const S = this.S;
    const base = ctx.getTransform();
    ctx.save();
    const items: Array<{ k: number; f: () => void }> = [];
    const hipC = this.hipC;
    const put = (p: Part, x: number, y: number, ang: number, sl = 1, sw = 1, alpha = 1) => {
      ctx.setTransform(base);
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(S * sl, S * sw);
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
      if (alpha !== 1) ctx.globalAlpha = 1;
    };
    /** the nearest painted view only (small parts: at their size a dissolve between two views does not show) */
    const nearest = (parts: Part[], psi: number, x: number, y: number, ang: number) => {
      const t = ((((psi / (2 * PI)) % 1) + 1) % 1) * VIEWS;
      put(parts[Math.round(t) % VIEWS]!, x, y, ang);
    };
    const view = (parts: Part[], psi: number, x: number, y: number, ang: number, sw = 1) => {
      const t = ((((psi / (2 * PI)) % 1) + 1) % 1) * VIEWS;
      const k0 = Math.floor(t) % VIEWS;
      const k1 = (k0 + 1) % VIEWS;
      const fr = t - Math.floor(t);
      if (fr < 0.5) {
        put(parts[k0]!, x, y, ang, 1, sw);
        if (fr > 0.001) put(parts[k1]!, x, y, ang, 1, sw, Math.min(1, fr * 2));
      } else {
        put(parts[k0]!, x, y, ang, 1, sw, Math.min(1, (1 - fr) * 2));
        put(parts[k1]!, x, y, ang, 1, sw);
      }
    };
    const bone = (p: Part, pt: Part, A: V3, B: V3, len: number, far: number, capP: Part | null, capR: number) => {
      const a = this.scr(A);
      const b = this.scr(B);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (L < 1e-3) return;
      const ang = Math.atan2(dy, dx);
      const r = clamp(L / (len * S), 0.42, 1.5);
      // (the far limbs use their own cooler painting rather than a second, tinted draw)
      put(far > 0.4 ? pt : p, a[0], a[1], ang, r, 1);
      if (capP && r < capR && B[1] > A[1] + 1) put(capP, b[0], b[1], 0, 1, 1, clamp((capR - r) / 0.25, 0, 1) * clamp((B[1] - A[1] - 1) / 4, 0, 1));
    };
    const halfOf = (A: V3, B: V3, nearA: boolean, draw: () => void) => {
      const a = this.scr(A);
      const b = this.scr(B);
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const sg = nearA ? -1 : 1;
      ctx.save();
      ctx.setTransform(base);
      ctx.beginPath();
      ctx.moveTo(mx - dy * 400, my + dx * 400);
      ctx.lineTo(mx + dy * 400, my - dx * 400);
      ctx.lineTo(mx + dy * 400 + sg * dx * 400, my - dx * 400 + sg * dy * 400);
      ctx.lineTo(mx - dy * 400 + sg * dx * 400, my + dx * 400 + sg * dy * 400);
      ctx.closePath();
      ctx.clip();
      draw();
      ctx.restore();
    };
    const torsoKey = hipC[1] + 20 * this.sUp[1] + 4;
    const torsoZ = hipC[1] + 20 * this.sUp[1];
    const farOf = (z: number): number => clamp((torsoZ - 1.5 - z) / 6, 0, 0.85);
    const cT = Math.cos(this.yawT);
    const sT = Math.sin(this.yawT);
    const kMid = ((TORSO_D * TORSO_D - TORSO_W * TORSO_W) * cT * sT) / (TORSO_D * TORSO_D * cT * cT + TORSO_W * TORSO_W * sT * sT);
    const silW = Math.sqrt(TORSO_W * TORSO_W * sT * sT + TORSO_D * TORSO_D * cT * cT);
    const torsoX = hipC[0] + 20 * this.sUp[0];
    const keyAt = (P: V3): number => {
      const dx = P[0] - torsoX;
      const rel = P[1] - torsoZ - kMid * dx;
      const beside = sstep((Math.abs(dx) - silW + 1.5) / 3) * sstep((7 - Math.abs(rel)) / 4);
      return torsoKey + lerp(rel, Math.max(rel, 2), beside);
    };
    const keySeg = (A: V3, B: V3): number => {
      const ex = B[0] - A[0];
      const t = Math.abs(ex) < 1e-6 ? 0.5 : clamp((torsoX - A[0]) / ex, 0, 1);
      return keyAt([A[0] + ex * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    };
    const hipS = this.scr(hipC);
    const sp = [this.sUp[0], KAPPA * this.sUp[1] - this.sUp[2]];
    const torsoRot = Math.atan2(sp[0], -sp[1]);
    items.push({
      k: torsoKey,
      f: () => {
        const br = this.breath;
        const t = ((((this.yawT / (2 * PI)) % 1) + 1) % 1) * VIEWS;
        const k0 = Math.floor(t) % VIEWS;
        const k1 = (k0 + 1) % VIEWS;
        const fr = t - Math.floor(t);
        const one = (p: Part, alpha: number) => put(p, hipS[0], hipS[1], torsoRot, 1, br, alpha);
        if (fr < 0.5) {
          one(set.torso[k0]!, 1);
          if (fr > 0.001) one(set.torso[k1]!, Math.min(1, fr * 2));
        } else {
          one(set.torso[k0]!, Math.min(1, (1 - fr) * 2));
          one(set.torso[k1]!, 1);
        }
      },
    });
    const neckS = this.scr(this.neck);
    const cH = Math.cos(this.yawH);
    const headRot = 0.4 * torsoRot + this.look.x * (0.65 * cH + 0.35 * Math.tanh(cH * 4));
    items.push({ k: this.neck[1] + 8, f: () => view(set.head, this.yawH, neckS[0], neckS[1], headRot) });
    items.push({ k: this.neck[1] + 8.2, f: () => nearest(set.scarf, this.yawT, neckS[0], neckS[1], torsoRot) });
    for (let i = 0; i < 2; i++) {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      const an = this.ankle[i]!;
      const f = this.gait.feet[i]!;
      const zk = (hip[1] + an[1]) / 2;
      const far = farOf(zk);
      const kStand = keyAt(hip) - 1 + clamp(0.08 * (an[1] - hip[1]), -0.6, 0.6);
      const kLeg = lerp(kStand, zk, sstep(this.seat.v / 0.6));
      items.push({
        k: kLeg,
        f: () => {
          const a = this.scr(an);
          const k = this.scr(kn);
          const rotShaft = Math.atan2(k[0] - a[0], a[1] - k[1]);
          const rotFoot = f.a * Math.cos(f.yaw);
          const mid = (rotShaft + rotFoot) / 2;
          const dx = Math.cos(mid);
          const dy = Math.sin(mid);
          const hx = a[0] + dy * 1.2 * S;
          const hy = a[1] - dx * 1.2 * S;
          const half = (below: boolean, rot: number) => {
            const sg = below ? 1 : -1;
            ctx.save();
            ctx.setTransform(base);
            ctx.beginPath();
            ctx.moveTo(hx - dx * 400, hy - dy * 400);
            ctx.lineTo(hx + dx * 400, hy + dy * 400);
            ctx.lineTo(hx + dx * 400 - sg * dy * 400, hy + dy * 400 + sg * dx * 400);
            ctx.lineTo(hx - dx * 400 - sg * dy * 400, hy - dy * 400 + sg * dx * 400);
            ctx.closePath();
            ctx.clip();
            view(set.boot, f.yaw, a[0], a[1], rot);
            ctx.restore();
          };
          bone(set.thigh, set.thighFar, hip, kn, DIM.THIGH, far, set.knee, 0.72);
          bone(set.shin, set.shinFar, kn, an, DIM.SHIN, far, null, 0);
          // (one draw, turned halfway between the foot and the shaft: at this size the hinge does not show)
          void half;
          nearest(set.boot, f.yaw, a[0], a[1], (rotFoot + rotShaft) / 2);
        },
      });
    }
    for (let i = 0; i < 2; i++) {
      const sh = this.shoulder[i]!;
      const el = this.elbow[i]!;
      const gl = this.glove[i]!;
      const zu = (sh[1] + el[1]) / 2;
      const zf = (el[1] + gl[1]) / 2;
      const ku = keySeg(sh, el);
      const kElb = keyAt(lerp3(el, gl, 0.22));
      const kHand = keyAt(lerp3(el, gl, 0.8));
      items.push({ k: ku, f: () => bone(set.upper, set.upperFar, sh, el, 24, farOf(zu), null, 0) });
      const drawFore = () => bone(set.fore, set.foreFar, el, gl, FOREARM, farOf(zf), set.elbow, 0.7);
      if (kElb > torsoKey !== kHand > torsoKey) {
        items.push({ k: kElb, f: () => halfOf(el, gl, true, drawFore) });
        items.push({ k: kHand, f: () => halfOf(el, gl, false, drawFore) });
      } else items.push({ k: kHand, f: drawFore });
    }
    for (let i = 1; i < items.length; i++) {
      const it = items[i]!;
      let j = i - 1;
      while (j >= 0 && items[j]!.k > it.k) {
        items[j + 1] = items[j]!;
        j--;
      }
      items[j + 1] = it;
    }
    for (const it of items) it.f();
    ctx.restore();
    ctx.setTransform(base);
  }

  /**
   * Draw through a small offscreen picture that is repainted only when the pose has visibly changed (standing figures
   * cost one drawImage a frame; a walking one repaints every frame).
   */
  drawCached(ctx: CanvasRenderingContext2D): void {
    const v3 = (u: V3) => r4(u[0], 0.3) + ',' + r4(u[1], 0.3) + ',' + r4(u[2], 0.3);
    const f = this.gait.feet;
    const sig = [
      r4(this.gait.px, 0.15), r4(this.wy, 0.15), r4(this.elev.v, 0.15),
      v3(this.hipC), v3(this.neck), v3(this.glove[0]), v3(this.glove[1]), v3(this.elbow[0]), v3(this.elbow[1]),
      v3(this.knee[0]), v3(this.knee[1]), v3(this.ankle[0]), v3(this.ankle[1]),
      r4(this.yawT, 0.012), r4(this.yawH, 0.012), r4(this.look.x, 0.02), r4(this.breath, 0.004),
      r4(f[0].a, 0.03), r4(f[1].a, 0.03), r4(f[0].yaw, 0.02), r4(f[1].yaw, 0.02),
    ].join('|');
    const top = this.wy - this.elev.v - 84;
    this.cache.draw(ctx, { x: this.fx - 42, y: top, w: 84, h: 94 }, sig, (c) => this.draw(c));
  }

  /** a soft shadow on the ground (or boards) under the feet */
  drawShadow(ctx: CanvasRenderingContext2D): void {
    const S = this.S;
    const y = this.wy - this.elev.v;
    ctx.fillStyle = 'rgba(60,60,70,0.16)';
    ctx.beginPath();
    ctx.ellipse(this.fx + 3 * S, y + 0.6, 14 * S * (1 - 0.3 * this.seat.v), 2.6 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
