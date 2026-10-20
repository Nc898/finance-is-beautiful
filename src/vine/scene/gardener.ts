/**
 * The two gardeners: a hand-painted jointed figure (parts cached as sprites, see gardenerArt.ts) driven by a
 * footstep gait (gardenerGait.ts) and a small director that turns the scene's intent into smooth action.
 *
 * The figure is a real 3D skeleton (x right, z toward the viewer, h up) with a facing angle, drawn in the world's
 * oblique projection: a point's screen y is KAPPA of its depth plus its height. Legs and arms are two-bone IK in
 * 3D (knees lead forward, elbows go down and out); the torso, head, scarf and boots are painted for sixteen
 * views round the vertical axis and the two nearest views dissolve into each other, so the figure can face the
 * viewer, the wall, a side or anything between, and turning is a smooth sweep through all of them. The parts are
 * drawn far to near.
 *
 * The director keeps a handful of continuous quantities (facing, torso twist, seat, where the shears are, where
 * the rake is, how raised the arms are) and moves each along its own minimum-jerk or critically damped path, so
 * an intent that changes mid-action just re-aims them from wherever they are: nothing ever snaps. Things that
 * must happen in order are done in order: the arms come down before a walk, a turn is a few pivot steps on the
 * spot with the feet flat, the shears are pocketed (facing the viewer) before the rake is picked up, the rake is
 * put back before sitting down. Walking faces the way of travel; pruning faces the wall (a side-step along it
 * keeps facing it, a long move turns to the side and walks); sitting faces the viewer; raking faces the pile.
 */
import type { PlanId } from '../types';
import type { CreateGardener, Gardener, GardenerIntent } from './gardenerApi';
import { BENCH, GROUND_Y, PATH_Y, PILE, REACH_SIDE, depthScale } from './geom';
import { DIM, ELBOW_CUT, FOREARM, KAPPA, RAKE, SEAT_HIP, VIEWS } from './gardenerDims';
import { buildGardenerSet, type Part, type Sprites } from './gardenerArt';
import { Gait, STANCE, type Foot, type GaitGoal } from './gardenerGait';
import { LEG, WALK_BOB, WALK_PELVIS_ROLL, WALK_PELVIS_YAW, WALK_SWAY, WALK_THORAX_YAW, cyc, walkStyle, wristSwing } from './gardenerWalk';
import {
  Mover,
  Spring1,
  Spring2,
  clamp,
  hash1,
  ik3,
  lerp,
  lerp3,
  norm3,
  slerp3,
  softMin,
  sstep,
  sstep5,
  swing3,
  wrapPi,
  type IK3Out,
  type V3,
} from './gardenerMath';

/* ------------------------------------------------------------------ layout (shared with the scene) */

const dirIn = (id: PlanId): 1 | -1 => (id === 'minimum' ? 1 : -1);

/** where a gardener stands to rake (the pile is to the side they came from) */
export function rakeStation(id: PlanId): { x: number; y: number; face: 1 | -1 } {
  return { x: PILE[id].x + dirIn(id) * 52, y: PILE[id].y + 2, face: dirIn(id) };
}
/** the leaning rake: its head's heel on the ground at (x, y); the pole leans up and away from the gardener along `face` */
export function restingRake(id: PlanId): { x: number; y: number; face: 1 | -1; elevation: number } {
  const s = rakeStation(id);
  return { x: s.x + s.face * 22, y: s.y - 3, face: s.face, elevation: (96 * Math.PI) / 180 };
}
/** the hips go this far behind the feet when sitting, and rest this far behind the seat's front edge (true units) */
const SIT_BACK = 24;
const SEAT_BEHIND = 9;
/** where the feet stand to sit (the hips end up on the bench centre, behind its front edge) facing the viewer */
export function benchStand(id: PlanId): { x: number; y: number; face: 1 | -1 } {
  return { x: BENCH[id].x, y: BENCH[id].y + (SIT_BACK - SEAT_BEHIND) * KAPPA, face: id === 'minimum' ? -1 : 1 };
}
/** the height of the seat the gardener sits on, above BENCH.y (the hips rest this high plus a little) */
export const SEAT_TOP = SEAT_HIP - 3;

/* ------------------------------------------------------------------ constants */

const PI = Math.PI;
const FAR_ROLL = 0.72;
const CROUCH_DROP = 22;
/** walking, the hips ride this much below a straight leg's reach (the knees stay soft) */
const WALK_DROP = 3.5;
const SNIP_OPEN = 0.52;
/** the wall's surface is held this far ahead of the feet (true units) when reaching for the vine */
const PRUNE_Z = 22;
/** the far hand's comfortable distance from the shoulder while it slides along the rake handle */
const GRIP_R = 31;
const ARM = 49;
const UP: V3 = [0, 0, 1];
const WALL_YAW = -PI / 2;
const SIT_YAW = PI / 2;
/** the stance when standing about: three-quarters toward the viewer, a little toward the middle of the garden */
const idleYaw = (id: PlanId): number => (id === 'minimum' ? 1.1 : PI - 1.1);
/** facing the pile for raking (three-quarters toward the viewer), and facing the leaning rake to pick it up or put it down */
const rakeYaw = (id: PlanId): number => (id === 'minimum' ? PI - 0.62 : 0.62);
const grabYaw = (id: PlanId): number => (id === 'minimum' ? 0.62 : PI - 0.62);

type Action = { kind: 'grab' | 'put'; t: number; s: number };
type ShearsAct = { kind: 'pocket' | 'draw'; t: number; s: number };

const deg = (d: number): number => (d * PI) / 180;

/** the torso seen from above, for sorting the arms and tools against it: half its width and half its depth (units) */
const TORSO_W = 8;
const TORSO_D = 6;

/**
 * The rake (true ground units, as the gait's): at the start of a pull the tines' centre is RAKE_REACH ahead of the
 * gardener's feet; a pull draws them toward the pile by about RAKE_PULL_WORLD world units (never more than
 * RAKE_PULL_MAX of ground, which is what the arms can do), then the tines lift and swing back out.
 */
export const RAKE_REACH = 106;
export const RAKE_PULL_WORLD = 42;
const RAKE_PULL_MIN = 14;
const RAKE_PULL_MAX = 42;
/** the tine row's centre lies this far beyond the head joint (away from the gardener) along the ground */
const TINE_OFF = 13;
/**
 * Raking, the far hand holds the handle here (body frame: forward, to the near hand's side, up from the hip joint):
 * out in front of its own hip, and the pole runs from the tines up through that hand, so the near hand holds the
 * shaft further down, RAKE_HANDS nearer the head. (A pole set by a fixed angle passes the body wherever the reach
 * puts it, and the far hand would follow it round behind the back for the top of the handle.)
 */
const REAR_A = 24;
const REAR_A_PULLED = 4;
const REAR_B = -9;
const REAR_H = 0;
const REAR_H_PULLED = -5;
/** measured: the top hand at the hip, near the end of the handle (a raker reaches far, unlike a sweeper) */
const REAR_LIFT_M = 0;
const RAKE_HANDS = 22;
const LEAN_FAR = 0.34;
const LEAN_NEAR = 0.14;
/** measured (sweeping, CMU 13_23/14_16): about 28 degrees from the waist, a little more on the reach */
const LEAN_FAR_M = 0.52;
const LEAN_NEAR_M = 0.34;
const SHIFT_FAR = 4;
const SHIFT_NEAR = -3;
/**
 * The rake held in the near hand alone, at its side (body frame: forward, to the near hand's side, up; the hand's
 * height is from the hip joint). Standing, the head rests on the ground beside the foot and the pole stands up
 * through the hand like a staff; walking, it is carried near its balance, the head forward at knee height and the handle trailing back past
 * the hip. (Held out in front in both hands, the handle's top would pass the shoulder and the far hand would have to
 * reach round behind the back for it.)
 */
const HOLD_HEAD: V3 = [14, 18, 0];
const HOLD_HAND: V3 = [6, 13, 4];
const CARRY_HEAD: V3 = [46, 14, 40];
const CARRY_HAND: V3 = [6, 13, -8];
/** a rake-target move smaller than this (true ground units) is followed with side-steps, the rake still down */
const FOLLOW_MAX = 90;
/** the largest turn (rad) a walk begins with: bigger ones are one turn on the spot first */
const WALK_TURN = 2.0;

interface RakePlan {
  /** where the gardener stands (world), and the way they face there */
  gx: number;
  gy: number;
  yaw: number;
  /** the tines' centre at the start and at the end of a pull (world) */
  fx: number;
  fy: number;
  nx: number;
  ny: number;
}

const mk = (): IK3Out => ({ joint: [0, 0, 0], end: [0, 0, 0], reach: true });

class GardenerImpl implements Gardener {
  readonly id: PlanId;
  snips = 0;
  strokes = 0;
  working = false;
  pace = 0;

  private readonly set: Sprites;
  private readonly gait: Gait;
  private readonly seed: number;

  // continuous quantities
  private readonly yaw = new Mover(0);
  private readonly twist = new Spring1(0);
  private readonly headYaw = new Spring1(0);
  private readonly seat = new Mover(0);
  private readonly wWalk = new Mover(0);
  private readonly wPrune = new Mover(0);
  private readonly wPocket = new Mover(0);
  private readonly kPocket = new Mover(0);
  private readonly wRake = new Mover(0);
  private readonly rakeK = new Mover(0);
  private readonly carry = new Mover(0);
  private readonly pull = new Mover(0);
  private readonly look = new Spring1(0);
  private readonly adTip = new Spring1(0);
  private readonly adCrouch = new Spring1(0);
  private readonly adLean = new Spring1(0);
  private readonly adShiftA = new Spring1(0);
  private readonly adShiftX = new Spring1(0);
  private readonly sway = new Spring1(0);
  private readonly tip = new Spring2();
  /** the tines' start and end of a pull (world), gliding after the target when the scene moves it */
  private readonly tF = new Spring2();
  private readonly tN = new Spring2();
  private rpInit = false;
  private readonly speed = new Spring1(0);
  private readonly workK = new Spring1(0);
  private readonly swingN = new Spring1(0);
  private readonly gripT = new Spring1(RAKE.HIGH);
  private readonly swingF = new Spring1(0);

  // director state
  private action: Action | null = null;
  private shAct: ShearsAct | null = null;
  private rp: RakePlan = { gx: 0, gy: 0, yaw: 0, fx: 0, fy: 0, nx: 0, ny: 0 };
  private rakeIntent = false;
  private gate: 0 | 1 | 2 = 0;
  private followStep = false;
  /** in-place turns made so far (pivot steps), for the harness */
  turnCount = 0;
  private sp = 0;
  private sl = 0;
  private rakeReach = 40;
  private rakeTineU: V3 = [0, 0, 0];
  private clock = 0;
  private inBand = false;
  private goal: GaitGoal | null = null;
  private yawWant: number | null = null;
  private yawTrack = false;
  private walkOK = true;
  private sideMode = false;
  private sideKeep = false;
  private reducedSig = '';
  private glanceAt = 3;
  private glanceUntil = 0;
  private glanceN = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private crossAt = 7;
  private crossN = 0;
  private crossed = false;
  private lastTarget: { x: number; y: number } | null = null;
  private pruneT: { x: number; y: number } | null = null;

  // snipping
  private blade = 0;
  private cyc: 'idle' | 'open' | 'hold' | 'close' | 'pause' = 'idle';
  private cycT = 0;
  private cycDur = 0;
  private holdExtra = 0;
  private recoil = 0;
  private recoilShown = 0;
  private pullT = 9;

  // raking
  private sPhase: 'dwell' | 'pull' | 'recover' = 'dwell';
  private sT = 0;
  private sDur = 0.5;

  // the solved pose (3D units relative to the pelvis's ground point, divided by the depth scale)
  private S = 1;
  private wy = PATH_Y;
  private hipC: V3 = [0, 0, 60];
  private hips: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private knee: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private ankle: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private sUp: V3 = [0, 0, 1];
  private neck: V3 = [0, 0, 100];
  private shoulder: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private elbow: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private glove: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private lean = 0;
  private breath = 1;
  private tailAng = 0.3;
  private toolPivot: V3 = [0, 0, 0];
  private toolDir: V3 = [1, 0, 0];
  private toolPocket = 0;
  private rakeHeadU: V3 = [0, 0, 0];
  private rakeDirU: V3 = [0, 0, 1];
  private cut: V3 = [0, 0, 0];
  private fx = 0;
  private reachOK = true;
  private yawT = 0;
  private yawH = 0;
  private ikA = mk();
  private ikB = mk();
  /** scratch: the measured arm swing for one arm */
  private wsw: [number, number, number] = [0, 0, 0];
  /** each elbow's direction off the shoulder-to-hand line: it turns with the arm and only slowly returns to the preferred side */
  private elbowDir: [V3, V3] = [[0, 0, -1], [0, 0, -1]];
  private frameDt = 1 / 60;
  /** debugging: while idle, turn to face this way (the harness's turn strips) */
  debugYaw: number | null = null;
  private hint: [V3, V3] = [[0, 0, -1], [0, 0, -1]];
  private snapElbows = true;

  constructor(id: PlanId, q: number) {
    this.id = id;
    this.set = buildGardenerSet(id, q);
    this.seed = id === 'minimum' ? 11 : 23;
    const hx = id === 'minimum' ? 150 : 850;
    this.gait = new Gait(hx, PATH_Y / KAPPA, idleYaw(id));
    this.yaw.snap(idleYaw(id));
    this.solve();
  }

  /* ---------------------------------------------------------------- the contract */

  update(dtSec: number, intent: GardenerIntent, _tSec: number, reduced: boolean): void {
    void _tSec;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    this.frameDt = dt;
    if (reduced) {
      const sig = `${intent.activity}|${intent.target ? `${Math.round(intent.target.x)},${Math.round(intent.target.y)}` : '-'}`;
      if (sig !== this.reducedSig) {
        this.reducedSig = sig;
        this.settle(intent);
        this.snapElbows = true;
      }
      this.solve();
      return;
    }
    if (this.reducedSig !== '') this.reducedSig = '';
    // the hand's recoil from a cut shows from the frame after it
    this.recoilShown = this.recoil;
    const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, intent);
    this.solve();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.paint(ctx);
  }

  shears(): { x: number; y: number } {
    const p = this.scr(this.cut);
    return { x: p[0], y: p[1] };
  }

  feet(): { x: number; y: number } {
    return { x: this.fx, y: this.wy };
  }

  /** the tines' centre on the ground while the rake is in hand, and whether they are drawing (a pull in progress) */
  rakeHead(): { x: number; y: number; contact: boolean } | null {
    if (this.rakeK.v < 0.02) return null;
    const p = this.scr([this.rakeTineU[0], this.rakeTineU[1], 0]);
    return { x: p[0], y: p[1], contact: this.sPhase === 'pull' && this.workK.x > 0.9 && this.rakeK.v > 0.99 };
  }

  /** straight into the settled pose for an intent, where it happens; motion carries on from there (scrubbing) */
  place(it: GardenerIntent): void {
    const pace = this.pace;
    this.settle(it);
    this.pace = pace;
    this.reducedSig = '';
    this.solve();
  }

  /** the rake is in the gardener's hands (or being picked up or put down) */
  get rakeInHands(): boolean {
    return this.rakeK.v > 0.005 || this.wRake.v > 0.005;
  }

  /* ---------------------------------------------------------------- helpers */

  /** a point in the figure's 3D units (relative to the pelvis's ground point) to world screen coordinates */
  private scr(u: V3): [number, number] {
    return [this.gait.px + this.S * u[0], this.wy + this.S * (KAPPA * u[1] - u[2])];
  }

  private get still(): boolean {
    if (this.gait.walking || this.gait.turning) return false;
    for (const f of this.gait.feet) if (f.state !== STANCE) return false;
    return !this.yaw.moving && !this.action;
  }

  private armsDown(): boolean {
    return this.wPrune.v < 0.25 && this.wPocket.v < 0.02;
  }

  private facing(yaw: number, tol = 0.15): boolean {
    return Math.abs(wrapPi(yaw - this.yaw.v)) < tol && !this.yaw.moving && !this.gait.turning;
  }

  private startAction(kind: Action['kind']): void {
    this.action = { kind, t: 0, s: 0 };
  }

  private startShears(kind: ShearsAct['kind']): void {
    this.shAct = { kind, t: 0, s: 0 };
  }

  private runAction(h: number): void {
    const a = this.action!;
    a.t += h;
    const t = a.t;
    const step = (n: number, at: number, f: () => void) => {
      if (a.s < n && t >= at) {
        a.s = n;
        f();
      }
    };
    switch (a.kind) {
      case 'grab':
        step(1, 0, () => this.wRake.go(1, 0.65));
        step(2, 0.75, () => this.rakeK.go(1, 0.95));
        if (t >= 1.8) this.action = null;
        break;
      case 'put':
        step(1, 0, () => this.rakeK.go(0, 0.95));
        step(2, 1.05, () => this.wRake.go(0, 0.55));
        if (t >= 1.7) this.action = null;
        break;
    }
  }

  /** putting the shears in the apron pocket (or drawing them): the hand goes to it in whatever view, walking or not */
  private runShears(h: number): void {
    const a = this.shAct;
    if (!a) return;
    a.t += h;
    const t = a.t;
    const step = (n: number, at: number, f: () => void) => {
      if (a.s < n && t >= at) {
        a.s = n;
        f();
      }
    };
    step(1, 0, () => this.wPocket.go(1, 0.55));
    step(2, 0.66, () => this.kPocket.go(a.kind === 'pocket' ? 1 : 0, 0.32));
    step(3, 1.04, () => this.wPocket.go(0, 0.45));
    if (t >= 1.52) this.shAct = null;
  }

  /* ---------------------------------------------------------------- the director */

  private step(h: number, it: GardenerIntent): void {
    this.clock += h;
    this.runShears(h);
    this.direct(h, it);
    this.driveYaw();
    // advance the continuous quantities
    this.yaw.update(h);
    this.seat.update(h);
    this.wPrune.update(h);
    this.wPocket.update(h);
    this.kPocket.update(h);
    this.wRake.update(h);
    this.rakeK.update(h);
    this.carry.update(h);
    this.pull.update(h);
    this.workK.update(h, this.workTarget(), 6);
    this.tF.update(h, this.rp.fx, this.rp.fy, 8);
    this.tN.update(h, this.rp.nx, this.rp.ny, 8);
    // walking (never while seated, mid-action, with the arms up, or turning round)
    const armsOK = this.wPrune.v < 0.25 || (this.sideMode && this.sideKeep);
    const gateOK = this.gate === 0 || (this.gate === 1 ? this.sPhase === 'dwell' : this.sPhase !== 'pull');
    const allow =
      this.seat.v < 0.004 &&
      !this.action &&
      (!this.yaw.moving || this.sideMode || this.followStep) &&
      !this.gait.turning &&
      armsOK &&
      gateOK &&
      this.walkOK &&
      this.gait.feet[0].tipRoll < 0.02 &&
      (this.adTip.x < 0.03 || (this.sideMode && this.sideKeep));
    this.gait.update(h, this.goal, this.yaw.v, allow, this.S);
    this.wWalk.go(this.gait.walking ? 1 : 0, 0.3);
    this.wWalk.update(h);
    this.speed.update(h, this.gait.speed, 12);
    // the sway over the standing foot
    const f0 = this.gait.feet[0].state === STANCE ? 1 : 0;
    const f1 = this.gait.feet[1].state === STANCE ? 1 : 0;
    this.sway.update(h, (this.gait.walking ? 1.7 : this.gait.turning && walkStyle === 'measured' ? 2.6 : 0) * (f0 - f1), 12);
    this.idleLife(h);
    this.snipping(h);
    this.raking(h);
    this.updateAdapt(h, it);
  }

  /** turn the body: a few pivot steps on the spot when still, or follow the way of travel when walking */
  private driveYaw(): void {
    const gp = this.gait;
    if (this.yawWant === null) return;
    const d = wrapPi(this.yawWant - this.yaw.target);
    if (gp.walking) {
      // follow the way of travel (a goal that has swung right round waits until the walk is done)
      if (this.yawTrack && Math.abs(d) > 0.03 && Math.abs(d) < 1.9) this.yaw.retarget(this.yaw.target + d, 0.5);
      return;
    }
    if (gp.turning) return;
    const dv = wrapPi(this.yawWant - this.yaw.v);
    if (this.yaw.moving) {
      // a small correction in progress (the heap moved a little): follow it
      if (this.followStep && Math.abs(d) > 0.03 && Math.abs(d) < 0.5) this.yaw.retarget(this.yaw.target + d, 0.45);
      return;
    }
    if (Math.abs(dv) <= 0.09) return;
    const calm =
      this.seat.v < 0.004 && !this.seat.moving && !this.action && this.wPrune.v < 0.25 && gp.feet[0].tipRoll < 0.02 && gp.feet[0].state === STANCE && gp.feet[1].state === STANCE && gp.feet[0].tLand > 0.12 && gp.feet[1].tLand > 0.12;
    if (!calm) return;
    if (Math.abs(dv) > 0.35 && this.sPhase !== 'dwell') return;
    const mo = walkStyle === 'measured';
    const dur = Math.abs(dv) > 0.35 ? (mo ? 0.5 + 0.42 * Math.abs(dv) : 0.26 + 0.0022 * (Math.abs(dv) * 180) / PI) : mo ? 0.6 : 0.45;
    this.yaw.retarget(this.yaw.v + dv, dur);
    if (Math.abs(dv) > 0.35) {
      this.turnCount++;
      gp.startTurn(this.yaw.v, dv, dur, Math.abs(dv) < 1.22 ? 2 : Math.abs(dv) < 2.44 ? 3 : 4);
    }
  }

  /** the rake's plan for an intent: where to stand, how to face, where the tines start and end a pull (world) */
  private planRake(it: GardenerIntent): void {
    const id = this.id;
    const pile = PILE[id];
    const rp = this.rp;
    if (it.target) {
      const tx = it.target.x;
      const td = it.target.y / KAPPA;
      let ux = pile.x - tx;
      let ud = pile.y / KAPPA - td;
      const l = Math.hypot(ux, ud);
      if (l < 1e-3) {
        ux = -dirIn(id);
        ud = 0;
      } else {
        ux /= l;
        ud /= l;
      }
      const w = Math.hypot(ux, ud * KAPPA);
      const Lt = clamp(RAKE_PULL_WORLD / w, RAKE_PULL_MIN, RAKE_PULL_MAX);
      // already standing at work and the new start is ahead within reach (the heap just pulled in): stay put and
      // pull it in toward the feet (a raker steps back only when the heap has come too close)
      const gp = this.gait;
      const mx = tx - gp.px;
      const md = td - gp.pd;
      const m = Math.hypot(mx, md);
      const ahead = m > 1e-3 ? Math.cos(Math.atan2(md, mx) - this.yaw.v) : -1;
      const settled = !gp.walking && !gp.turning && this.workK.x > 0.8 && this.wRake.v > 0.99 && this.rakeK.v > 0.99;
      if (settled && ahead > 0.9 && m <= RAKE_REACH + 6 && m - Lt >= 26) {
        rp.gx = gp.px;
        rp.gy = gp.pd * KAPPA;
        rp.yaw = Math.atan2(md, mx);
        rp.fx = tx;
        rp.fy = it.target.y;
        rp.nx = tx - (mx / m) * Lt;
        rp.ny = (td - (md / m) * Lt) * KAPPA;
        return this.planRakeInit();
      }
      rp.gx = tx + ux * RAKE_REACH;
      rp.gy = (td + ud * RAKE_REACH) * KAPPA;
      rp.yaw = Math.atan2(-ud, -ux);
      rp.fx = tx;
      rp.fy = it.target.y;
      rp.nx = tx + ux * Lt;
      rp.ny = (td + ud * Lt) * KAPPA;
    } else {
      const st = rakeStation(id);
      const yaw = rakeYaw(id);
      const fx = Math.cos(yaw);
      const fd = Math.sin(yaw);
      const sd = st.y / KAPPA;
      rp.gx = st.x;
      rp.gy = st.y;
      rp.yaw = yaw;
      rp.fx = st.x + fx * RAKE_REACH;
      rp.fy = (sd + fd * RAKE_REACH) * KAPPA;
      rp.nx = st.x + fx * (RAKE_REACH - 30);
      rp.ny = (sd + fd * (RAKE_REACH - 30)) * KAPPA;
    }
    this.planRakeInit();
  }

  private planRakeInit(): void {
    if (!this.rpInit) {
      this.rpInit = true;
      this.tF.snap(this.rp.fx, this.rp.fy);
      this.tN.snap(this.rp.nx, this.rp.ny);
    }
  }

  /** whether the tines are working at the target (down on the ground, following it) rather than carried */
  private workTarget(): number {
    if (this.sPhase !== 'dwell') return 1;
    if (!this.rakeIntent || this.rakeK.v < 0.99 || this.wRake.v < 0.99 || this.action) return 0;
    const d = Math.hypot(this.rp.gx - this.gait.px, this.rp.gy / KAPPA - this.gait.pd);
    return d < FOLLOW_MAX + 12 ? 1 : 0;
  }

  private direct(h: number, it: GardenerIntent): void {
    const act = it.activity;
    this.goal = null;
    this.yawWant = null;
    this.yawTrack = false;
    this.walkOK = true;
    this.sideMode = false;
    this.sideKeep = false;
    this.followStep = false;
    this.rakeIntent = false;
    this.gate = this.rakeK.target > 0.5 ? 1 : 0;
    let pruneReady = false;
    this.pruneT = null;
    const gp = this.gait;

    if (this.action) {
      this.runAction(h);
      this.wPrune.go(0, 1.0);
      this.holdYaw();
      return;
    }

    // seated (or sitting down or standing up): stay in that business until it is done
    if (this.seat.v > 0.004 || this.seat.moving) {
      const sit = benchStand(this.id);
      const stay = act === 'rest' && this.kPocket.target > 0.5 && this.rakeK.target < 0.5 && Math.hypot(gp.px - sit.x, KAPPA * gp.pd - sit.y) < 6;
      if (!stay && this.crossed && !this.seat.moving && this.seat.v > 0.99) {
        this.uncross();
        return;
      }
      this.seat.go(stay ? 1 : 0, stay ? 1.25 : 1.15);
      this.wPrune.go(0, 1.0);
      this.yawWant = SIT_YAW;
      return;
    }

    const wantShears = act === 'rake' || act === 'rest' ? 'pocket' : 'hand';
    const wantRake = act === 'rake' ? 'held' : 'rest';
    const rakeHeld = this.rakeK.target > 0.5;
    const pocketed = this.kPocket.target > 0.5;
    const st = rakeStation(this.id);

    // the arms come down for anything else but pruning
    if (act !== 'prune') this.wPrune.go(0, 1.0);

    // the shears go into the apron (or come out) in whatever view the hand finds itself, walking or standing
    if (!this.shAct && !rakeHeld) {
      if (!pocketed && wantShears === 'pocket' && this.wPrune.v < 0.5) this.startShears('pocket');
      else if (pocketed && wantShears === 'hand') this.startShears('draw');
    }

    if (rakeHeld && wantRake === 'rest') {
      // finish the stroke in progress first, so the rake never jumps back to rest; face the leaning rake to put it back
      if (this.goTo(st, grabYaw(this.id), 1.5) && this.still && this.sPhase === 'dwell') this.startAction('put');
      this.wPrune.go(0, 1.0);
      return;
    }
    if (!rakeHeld && wantRake === 'held') {
      const ready = this.kPocket.v > 0.98 && !this.shAct;
      if (this.goTo(st, grabYaw(this.id), 1.5) && this.still && ready) this.startAction('grab');
      return;
    }

    switch (act) {
      case 'rake': {
        this.planRake(it);
        this.rakeIntent = true;
        const P = this.rp;
        const gd = P.gy / KAPPA;
        const d = Math.hypot(P.gx - gp.px, gd - gp.pd);
        const holding = this.rakeK.v > 0.99 && this.wRake.v > 0.99;
        if (holding && d < FOLLOW_MAX && Math.abs(wrapPi(P.yaw - this.yaw.v)) < 0.9) {
          // the heap moved a little: follow it with small steps, the rake still down and the body still facing it
          this.followStep = true;
          this.yawWant = P.yaw;
          this.yawTrack = false;
          this.gate = 2;
          if (d > 5.5 || gp.walking) {
            this.goal = { x: P.gx, d: gd, spread: 0, minWalk: 2.5, side: true };
            this.sideMode = true;
            this.sideKeep = true;
          }
        } else this.goTo({ x: P.gx, y: P.gy }, P.yaw, 2.0);
        break;
      }
      case 'rest': {
        const sit = benchStand(this.id);
        const wp = this.benchRoute(sit);
        if (wp) this.goTo(wp, null, 4);
        else if (this.goTo(sit, SIT_YAW, 1.2) && this.still && this.wPrune.v < 0.05 && this.kPocket.v > 0.98 && !this.shAct) this.seat.go(1, 1.25);
        break;
      }
      case 'prune': {
        pruneReady = this.directPrune(it) && !this.shAct && this.kPocket.v < 0.02;
        break;
      }
      case 'idle':
      default: {
        // stand easy where you are, whichever way you face (a debugging hook can ask for a turn)
        if (this.debugYaw !== null) this.yawWant = this.debugYaw;
        break;
      }
    }
    this.wPrune.go(pruneReady ? 1 : 0, pruneReady ? 0.95 : 1.0);
  }

  private holdYaw(): void {
    this.yawWant = null;
  }

  /** the corner to walk round so the way to the bench stand does not cross the bench (null: go straight there) */
  private benchRoute(sit: { x: number; y: number }): { x: number; y: number } | null {
    const gp = this.gait;
    const wy = KAPPA * gp.pd;
    const b = BENCH[this.id];
    if (wy < b.y - 4 && Math.abs(gp.px - b.x) < 78) {
      const side = gp.px <= b.x ? -1 : 1;
      return { x: b.x + side * 64, y: sit.y };
    }
    return null;
  }

  /**
   * Aim for a spot: returns true once there (within `tol`) and facing as asked (null: any way). The body turns into
   * the way of travel as the walk begins (or in one turn on the spot if that is more than about 100 degrees), and
   * swings round to the final facing over the last strides, so it arrives already facing the work.
   */
  private goTo(spot: { x: number; y: number }, finalYaw: number | null, tolIn: number): boolean {
    const gp = this.gait;
    // the gait works in true ground units, where a world y step counts 2.5 times: never ask for more than this
    const tol = Math.max(tolIn, 3);
    const sd = spot.y / KAPPA;
    const d = Math.hypot(spot.x - gp.px, sd - gp.pd);
    if (d > tol || gp.walking) {
      const heading = Math.atan2(sd - gp.pd, spot.x - gp.px);
      this.goal = { x: spot.x, d: sd, spread: 3, minWalk: tol };
      if (gp.walking) {
        let want = heading;
        if (finalYaw !== null && (d < 12 || (d < 45 && Math.abs(wrapPi(finalYaw - heading)) <= 1.8))) want = finalYaw;
        this.yawWant = want;
        this.yawTrack = true;
        this.walkOK = true;
      } else {
        const dyaw = wrapPi(heading - this.yaw.v);
        // the facing already right for it: just go. Otherwise turn once, into the walk.
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

  /** prune: the stand spot, facing and whether the arms may go up */
  private directPrune(it: GardenerIntent): boolean {
    const T = it.target;
    const gp = this.gait;
    if (!T) return false;
    this.pruneT = T;
    const wy = KAPPA * gp.pd;
    const hT = PATH_Y - T.y;
    const hiF = sstep((hT - 100) / 60);
    const dxT = T.x - gp.px;
    const onPath = Math.abs(wy - PATH_Y) < 2.5;
    const lim = lerp(REACH_SIDE - 2, 24, hiF) + (this.inBand ? 3 : 0);
    const inBand = Math.abs(dxT) <= lim && onPath;
    this.inBand = inBand;
    const facingWall = Math.abs(wrapPi(this.yaw.v - WALL_YAW)) < 0.2;
    // the spot to stand at: a little to this side of the target, nearer for the left hand's reach across
    const sgn = dxT >= 0 ? 1 : -1;
    const dd = sgn > 0 ? lerp(22, 10, hiF) : lerp(14, 8, hiF);
    const spotX = T.x - sgn * dd;
    const spot = { x: spotX, y: PATH_Y };
    if (gp.walking) {
      // keep heading for the (possibly moving) spot
      if (gp.sidePlan) {
        this.goal = { x: spotX, d: PATH_Y / KAPPA, spread: 0, minWalk: 2.5, side: true };
        this.yawWant = WALL_YAW;
        this.sideMode = true;
        this.sideKeep = this.wPrune.v > 0.9 && Math.abs(spotX - gp.px) <= 30;
        return this.sideKeep;
      }
      this.goTo(spot, WALL_YAW, 2.5);
      return false;
    }
    if (inBand) {
      // in reach: face the wall, then reach
      this.yawWant = WALL_YAW;
      return facingWall && this.still && (this.armsDown() || this.wPrune.target > 0.5);
    }
    // out of reach (or off the path): a short way along the wall is a side-step, facing it still; farther is a walk
    const dist = Math.abs(spotX - gp.px);
    if (onPath && dist <= 34) {
      this.yawWant = WALL_YAW;
      this.sideMode = true;
      this.walkOK = facingWall;
      this.sideKeep = this.wPrune.v > 0.9 && dist <= 30;
      this.goal = { x: spotX, d: PATH_Y / KAPPA, spread: 0, minWalk: 2.5, side: true };
      return this.sideKeep;
    }
    this.goTo(spot, WALL_YAW, 2.5);
    return false;
  }

  /* ---------------------------------------------------------------- idle life */

  private idleLife(h: number): void {
    // a glance round now and then (when standing or sitting still)
    const calm = !this.gait.walking && !this.action && this.wPrune.v < 0.05 && this.wRake.v < 0.05 && !this.yaw.moving && !this.gait.turning;
    if (this.clock >= this.glanceAt && calm) {
      this.glanceN++;
      this.glanceUntil = this.clock + 1.3 + 0.5 * (hash1(this.glanceN, this.seed) * 0.5 + 0.5);
      this.glanceAt = this.glanceUntil + 3.5 + 4.5 * (hash1(this.glanceN + 50, this.seed) * 0.5 + 0.5);
      const side = hash1(this.glanceN + 3, this.seed) > 0 ? 1 : -1;
      this.lookYaw = side * (0.5 + 0.3 * hash1(this.glanceN + 9, this.seed));
      this.lookPitch = -0.3 - 0.08 * hash1(this.glanceN + 19, this.seed);
    }
    if (this.clock >= this.glanceUntil || !calm) {
      this.lookYaw = 0;
      this.lookPitch = 0;
    }
    let tgt = this.lookPitch;
    let tYaw = this.lookYaw;
    // turning: the head leads the turn
    const turning = this.yaw.moving || this.gait.turning;
    if (turning) {
      const rem = wrapPi(this.yaw.target - this.yaw.v);
      tYaw = walkStyle === 'measured' ? clamp(0.5 * rem, -0.45, 0.45) : clamp(0.55 * rem, -0.8, 0.8);
    }
    // pruning: look at the work
    if (this.wPrune.v > 0.02 && this.pruneT) {
      const S = this.S;
      const rel = (this.pruneT.x - this.gait.px) / S;
      const up = (this.wy - this.pruneT.y) / S - 100;
      tgt = lerp(tgt, -clamp(Math.atan2(up, 40) * 0.7, -0.15, 0.7), this.wPrune.v);
      tYaw = lerp(tYaw, clamp(0.5 * Math.atan(rel / 40) - this.twist.x * 0.3, -0.5, 0.5), this.wPrune.v);
    }
    this.look.update(h, tgt, 7);
    this.headYaw.update(h, tYaw, 8);
    // seated: now and then one ankle swings across the other, and back
    if (this.seat.v > 0.995 && !this.action && this.clock >= this.crossAt) {
      this.crossN++;
      this.crossAt = this.clock + 6 + 5 * (hash1(this.crossN, this.seed + 3) * 0.5 + 0.5);
      if (this.gait.feet[0].state === STANCE && this.gait.feet[1].state === STANCE) {
        if (this.crossed) this.uncross();
        else this.cross();
      }
    }
  }

  private cross(): void {
    const gp = this.gait;
    const i = (this.crossN % 2) as 0 | 1;
    const f = gp.feet[i];
    const other = gp.feet[1 - i];
    const yaw = this.yaw.v;
    const fx = Math.cos(yaw);
    const fd = Math.sin(yaw);
    const sg = i === 0 ? 1 : -1;
    // the ankle goes over the other, a little ahead of it
    f.begin(other.ax + fx * 3.4 - sg * fd * 1.2, other.ad + fd * 3.4 + sg * fx * 1.2, f.yaw - sg * 0.15, 0.2, 0.55, 0.4);
    this.crossed = true;
  }

  private uncross(): void {
    const gp = this.gait;
    const yaw = this.yaw.v;
    for (const f of gp.feet) {
      if (f.state !== STANCE) return;
    }
    for (const f of gp.feet) {
      const p = gp.slot(f.i, yaw);
      const dx = f.ax - p[0];
      const dd = f.ad - p[1];
      if (Math.hypot(dx, dd) > 0.5) {
        f.begin(p[0], p[1], yaw + (f.i === 0 ? 0.1 : -0.1), 0.2, 0.5, 0.4);
        break;
      }
    }
    let ok = true;
    for (const f of gp.feet) {
      const p = gp.slot(f.i, yaw);
      if (Math.hypot(f.ax - p[0], f.ad - p[1]) > 0.5) ok = false;
    }
    if (ok) this.crossed = false;
  }

  /* ---------------------------------------------------------------- snipping and raking */

  private snipping(h: number): void {
    const target = this.pruneT;
    const ready = this.wPrune.v > 0.97 && !!target && this.still && this.reachOK && this.kPocket.v < 0.02 && !this.shAct && this.inBand;
    this.working = ready;
    // the tip follows the target when the arm is engaged
    if (target) {
      if (this.wPrune.v < 0.03 || !this.lastTarget) this.tip.snap(target.x, target.y);
      // the hand moves to a new spot only when it is in reach; otherwise it stays put while the arm comes down
      else if (this.inBand || this.sideKeep) this.tip.update(h, target.x, target.y, 11);
      this.lastTarget = target;
    } else this.lastTarget = null;
    this.recoil *= Math.exp(-h / 0.07);
    if (this.pullT < 9) {
      this.pullT += h;
      if (this.pullT > 0.14 && this.pull.target > 0.5) this.pull.go(0, 0.34);
    }
    if (!ready) {
      this.cyc = 'idle';
      this.blade = Math.max(0, this.blade - h * 5);
      if (this.wPrune.v > 0.6 && this.blade < 0.01) this.blade = 0;
      return;
    }
    const pace = clamp(this.pace, 0, 3);
    if (pace < 0.05) {
      // poised: the blades half open at the target, waiting
      this.cyc = 'idle';
      this.blade += (0.45 - this.blade) * (1 - Math.exp(-h * 4));
      return;
    }
    const P = clamp(1 / pace, 0.34, 20);
    if (this.cyc === 'idle') {
      this.cyc = 'pause';
      this.cycT = 0;
      this.cycDur = 0.03;
    }
    this.cycT += h;
    const dOpen = clamp(0.4 * P, 0.07, 0.2);
    const dClose = clamp(0.2 * P, 0.05, 0.085);
    const dPause = clamp(0.2 * P, 0.04, 0.22);
    switch (this.cyc) {
      case 'pause':
        this.blade = Math.max(0, this.blade - h * 8);
        if (this.cycT >= this.cycDur) {
          this.cyc = 'open';
          this.cycT = 0;
          this.cycDur = dOpen;
        }
        break;
      case 'open':
        this.blade = sstep(this.cycT / this.cycDur);
        if (this.cycT >= this.cycDur) {
          this.cyc = 'hold';
          this.cycT = 0;
          this.cycDur = Math.max(0.02, P - dOpen - dClose - dPause);
          this.holdExtra = 0;
        }
        break;
      case 'hold': {
        this.blade = Math.min(1, this.blade + h * 14);
        if (this.cycT >= this.cycDur) {
          // close only when the tip is on the target
          const err = Math.hypot(this.tip.x - target!.x, this.tip.y - target!.y);
          this.holdExtra += h;
          if (err < 1.2 || (this.holdExtra > 0.3 && err < 2)) {
            this.cyc = 'close';
            this.cycT = 0;
            this.cycDur = dClose;
          }
        }
        break;
      }
      case 'close': {
        // the target moved away while the blades were closing: open again and re-aim
        if (Math.hypot(this.tip.x - target!.x, this.tip.y - target!.y) > 2.5) {
          this.cyc = 'hold';
          this.cycT = 0;
          this.cycDur = 0.02;
          this.holdExtra = 0;
          break;
        }
        const u = clamp(this.cycT / this.cycDur, 0, 1);
        this.blade = 1 - u * u;
        if (this.cycT >= this.cycDur) {
          this.blade = 0;
          this.snips++;
          this.recoil = 1;
          this.pullT = 0;
          this.pull.go(1, 0.13);
          this.cyc = 'pause';
          this.cycT = 0;
          this.cycDur = dPause;
        }
        break;
      }
      default:
        break;
    }
  }

  /** how far along a pull the tines are (0 at the target, 1 at the end of the pull) and how high they are lifted */
  private calcStroke(): void {
    const u = this.sDur > 0 ? clamp(this.sT / this.sDur, 0, 1) : 1;
    if (this.sPhase === 'dwell') {
      this.sp = 0;
      this.sl = 0;
    } else if (this.sPhase === 'pull') {
      this.sp = sstep(u);
      this.sl = 0;
    } else {
      this.sp = 1 - sstep(u);
      this.sl = 7 * Math.pow(Math.sin(PI * u), 0.8);
    }
  }

  private raking(h: number): void {
    const gp = this.gait;
    const held = this.rakeK.v > 0.99 && this.wRake.v > 0.99 && !this.action && this.rakeIntent && this.workK.x > 0.85;
    const steady = !gp.walking && !gp.turning && gp.feet[0].state === STANCE && gp.feet[1].state === STANCE;
    const aimed = Math.abs(wrapPi(this.rp.yaw - this.yaw.v)) < 0.3;
    const midStroke = this.sPhase !== 'dwell';
    const active = held && aimed && (steady || midStroke);
    if (!active && !midStroke) {
      this.sT = 0;
      this.sDur = 0.35;
      return;
    }
    // asked to stop mid-stroke: carry the stroke through to its end at an easy pace (no new one starts)
    const pace = active ? clamp(this.pace, 0, 1.5) : 0.9;
    if (!active && this.sPhase === 'recover' && this.sT + h >= this.sDur) {
      this.sPhase = 'dwell';
      this.sT = 0;
      this.sDur = 0.35;
      return;
    }
    this.sT += h;
    if (this.sPhase === 'dwell') {
      if (pace > 0.05 && this.sT >= this.sDur && Math.hypot(this.tF.x - this.rp.fx, this.tF.y - this.rp.fy) < 1.5) {
        this.sPhase = 'pull';
        this.sT = 0;
        this.sDur = walkStyle === 'measured' ? clamp(0.5 / pace, 0.42, 1.0) : clamp(0.4 / pace, 0.36, 0.8);
      }
    } else if (this.sPhase === 'pull') {
      if (this.sT >= this.sDur) {
        this.strokes++;
        this.sPhase = 'recover';
        this.sT = 0;
        this.sDur = walkStyle === 'measured' ? clamp(0.34 / pace, 0.28, 0.66) : clamp(0.36 / pace, 0.32, 0.7);
      }
    } else if (this.sT >= this.sDur) {
      this.sPhase = 'dwell';
      this.sT = 0;
      this.sDur = Math.max(0.05, (walkStyle === 'measured' ? 0.16 : 0.24) / Math.max(pace, 0.05));
      if (pace <= 0.05) this.sDur = 0.2;
    }
  }

  /* ---------------------------------------------------------------- body adaptation (reach) */

  private adaptTargets(it: GardenerIntent): { tip: number; crouch: number; lean: number; shiftA: number; shiftX: number; twist: number } {
    const out = { tip: 0, crouch: 0, lean: 0, shiftA: 0, shiftX: 0, twist: 0 };
    const S = this.S;
    if (it.activity === 'prune' && this.pruneT && this.wPrune.target > 0.5) {
      const T = this.pruneT;
      const Hu = (this.wy - T.y) / S - PRUNE_Z * KAPPA;
      const X = (T.x - this.gait.px) / S;
      out.tip = sstep((Hu - 126) / 36);
      out.crouch = sstep((72 - Hu) / 38);
      out.lean = 0.05 + 0.32 * out.crouch + 0.1 * sstep((Math.abs(X) - 24) / 22);
      out.shiftX = clamp(0.1 * X, -5, 5);
      out.twist = clamp(0.55 * Math.atan(X / 28), -0.62, 0.62);
    } else if (this.wRake.target > 0.5 || this.rakeK.v > 0.01) {
      // the rake: how far the lower hand has to reach, and the lean into the pull
      const k = this.rakeK.v;
      this.calcStroke();
      const wk = this.workK.x;
      const mo = walkStyle === 'measured';
      const lean = lerp(0.08, lerp(mo ? LEAN_FAR_M : LEAN_FAR, mo ? LEAN_NEAR_M : LEAN_NEAR, this.sp), wk);
      const shift = lerp(-4, lerp(SHIFT_FAR, SHIFT_NEAR, this.sp), wk);
      out.crouch = (mo ? 0.1 : 0.28) * sstep(clamp((this.rakeReach - 48) / 16, 0, 1)) * k;
      out.lean = lerp(0, lean, k);
      out.shiftA = lerp(0, shift, k);
    }
    return out;
  }

  private updateAdapt(h: number, it: GardenerIntent): void {
    const t = this.adaptTargets(it);
    this.adTip.update(h, t.tip, 9);
    this.adCrouch.update(h, t.crouch, 9);
    this.adLean.update(h, t.lean, 9);
    this.adShiftA.update(h, t.shiftA, 9);
    this.adShiftX.update(h, t.shiftX, 9);
    // the torso twists toward the work (and leads a turn)
    let tw = t.twist * this.wPrune.v;
    if (this.yaw.moving || this.gait.turning) {
      const rem = wrapPi(this.yaw.target - this.yaw.v);
      tw += walkStyle === 'measured' ? clamp(0.12 * rem, -0.12, 0.12) : clamp(0.3 * rem, -0.45, 0.45);
    }
    // raking (from sweeping, CMU 13_23/14_16): the trunk turns into each stroke, the near shoulder forward on the reach
    if (walkStyle === 'measured') tw += 0.12 * (this.sp - 0.5) * this.workK.x * this.wRake.v * this.rakeK.v;
    this.twist.update(h, tw, 9);
    this.carry.go(this.rakeK.v > 0.5 && this.workK.x < 0.5 && (this.yaw.moving || this.gait.turning || this.gait.walking) ? 1 : 0, 0.3);
    this.gait.setTip(this.adTip.x * FAR_ROLL);
  }

  /* ---------------------------------------------------------------- reduced motion */

  private settle(it: GardenerIntent): void {
    const act = it.activity;
    const gp = this.gait;
    this.action = null;
    this.shAct = null;
    this.working = false;
    const pocket = act === 'rake' || act === 'rest';
    this.kPocket.snap(pocket ? 1 : 0);
    this.wPocket.snap(0);
    this.rakeK.snap(act === 'rake' ? 1 : 0);
    this.wRake.snap(act === 'rake' ? 1 : 0);
    this.workK.snap(act === 'rake' ? 1 : 0);
    this.carry.snap(0);
    this.seat.snap(act === 'rest' ? 1 : 0);
    this.wPrune.snap(0);
    this.wWalk.snap(0);
    this.pull.snap(0);
    this.look.snap(0);
    this.headYaw.snap(0);
    this.sway.snap(0);
    this.speed.snap(0);
    this.swingN.snap(0);
    this.swingF.snap(0);
    this.sPhase = 'dwell';
    this.sT = act === 'rake' ? 0.12 : 0;
    this.sDur = 0.5;
    this.cyc = 'idle';
    this.cycT = 0;
    this.recoil = 0;
    this.recoilShown = 0;
    this.pullT = 9;
    this.blade = 0;
    this.crossed = false;
    this.snapElbows = true;
    this.debugYaw = null;
    this.rakeIntent = act === 'rake';
    this.followStep = false;
    this.sideMode = false;
    this.sideKeep = false;
    this.goal = null;
    this.yawWant = null;
    let x = gp.px;
    let y = KAPPA * gp.pd;
    let yaw = idleYaw(this.id);
    if (act === 'rest') {
      const s = benchStand(this.id);
      x = s.x;
      y = s.y;
      yaw = SIT_YAW;
    } else if (act === 'rake') {
      this.planRake(it);
      this.tF.snap(this.rp.fx, this.rp.fy);
      this.tN.snap(this.rp.nx, this.rp.ny);
      x = this.rp.gx;
      y = this.rp.gy;
      yaw = this.rp.yaw;
    } else if (act === 'prune' && it.target) {
      const T = it.target;
      const hT = PATH_Y - T.y;
      const hiF = sstep((hT - 100) / 60);
      const dxT = T.x - x;
      const lim = lerp(REACH_SIDE - 2, 24, hiF);
      if (!(Math.abs(dxT) <= lim && Math.abs(y - PATH_Y) < 2.5)) {
        const sgn = dxT >= 0 ? 1 : -1;
        const dd = sgn > 0 ? lerp(22, 10, hiF) : lerp(14, 8, hiF);
        x = T.x - sgn * dd;
        y = PATH_Y;
      }
      yaw = WALL_YAW;
      this.wPrune.snap(1);
      this.pruneT = T;
      this.tip.snap(T.x, T.y);
      this.lastTarget = T;
      this.inBand = true;
      this.blade = 0.4;
    }
    this.yaw.snap(yaw);
    gp.stand(x, y / KAPPA, yaw);
    this.wy = y;
    this.S = depthScale(y);
    this.pace = 0;
    this.calcStroke();
    // the reach of the rake hand is read from the last pose: solve once so the adaptations settle on the same values
    for (let pass = 0; pass < 2; pass++) {
      const t = this.adaptTargets(it);
      this.adTip.snap(t.tip);
      this.adCrouch.snap(t.crouch);
      this.adLean.snap(t.lean);
      this.adShiftA.snap(t.shiftA);
      this.adShiftX.snap(t.shiftX);
      this.twist.snap(t.twist * this.wPrune.v);
      gp.setTip(t.tip * FAR_ROLL);
      for (const f of gp.feet) f.place(f.ax, f.ad, f.yaw);
      for (const f of gp.feet) f.update(0);
      this.solve();
      this.snapElbows = true;
    }
  }

  /* ---------------------------------------------------------------- the pose */

  private solve(): void {
    const gp = this.gait;
    const wy = KAPPA * gp.pd;
    const S = depthScale(wy);
    this.S = S;
    this.wy = wy;
    const yaw = this.yaw.v;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fP: V3 = [cy, sy, 0];
    const lP: V3 = [-sy, cy, 0];
    // the measured walk (0 when standing or in the hand-made walk): the pelvis bobs, sways and turns with the stride,
    // and the chest turns back against it, so the shoulders stay nearly square while the hips swing
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
    // the weight shift: a slow sway side to side (and a little forward and back) while standing about
    const calm = 1 - this.wWalk.v;
    const rk = this.rakeK.v * this.wRake.v;
    const idleShift = (0.7 * Math.sin(this.clock * 0.55 + this.seed) + 0.3 * Math.sin(this.clock * 1.31 + 2)) * calm * (1 - this.wPrune.v) * (1 - sigma) * (1 - rk);
    const sitBack = SIT_BACK * sstep(sigma / 0.8);
    const shiftA = this.adShiftA.x + 0.35 * idleShift - sitBack;
    const shiftB = this.sway.x + 1.0 * idleShift + wa * cyc(WALK_SWAY, phi) * LEG;
    const ho: V3 = [fP[0] * shiftA + lP[0] * shiftB + this.adShiftX.x, fP[1] * shiftA + lP[1] * shiftB, 0];
    // the feet, in units
    const A: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 2; i++) {
      const f = gp.feet[i]!;
      A[i] = [(f.x - gp.px) / S, (f.d - gp.pd) / S, f.h];
    }
    // the hip as high as the planted legs allow (so the pelvis bobs the way a walking person's does)
    let H0 = 1e9;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const hx = ho[0] + lP[0] * sg * DIM.HIPW;
      const hz = ho[1] + lP[1] * sg * DIM.HIPW;
      const dh = Math.hypot(A[i]![0] - hx, A[i]![1] - hz);
      const need = A[i]![2] + Math.sqrt(Math.max(1, DIM.LMAX * DIM.LMAX - dh * dh));
      H0 = H0 > 1e8 ? need : softMin(H0, need, 1.2);
    }
    const crouch = this.adCrouch.x * CROUCH_DROP;
    const fy = sstep5(clamp((sigma - 0.1) / 0.9, 0, 1));
    // walking, the hips ride a little lower than the legs' reach and bob as measured (soft knees, not a vault)
    const Hw = wa > 0.001 ? softMin(H0, DIM.FH + DIM.LMAX - WALK_DROP * wa + wa * cyc(WALK_BOB, phi) * LEG, 1.2) : H0;
    const H = lerp(Hw - crouch, SEAT_HIP, fy);
    const hipC: V3 = [ho[0], ho[1], H];
    this.hipC = hipC;
    // the legs: knees lead the way the foot points
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const f = gp.feet[i]!;
      // the pelvis turned and tilted with the stride
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
    // the torso: it leans toward where the torso faces
    const walkLean = 0.05 + 0.08 * sstep(this.speed.x / 70);
    const sitLean = 0.42 * Math.sin(PI * clamp(sigma / 0.75, 0, 1)) - 0.1 * sstep((sigma - 0.75) / 0.25);
    const lean = walkLean * this.wWalk.v + 0.03 * (1 - this.wWalk.v) + this.adLean.x + sitLean + 0.02 * Math.sin(this.clock * 0.9) * calm;
    this.lean = lean;
    const br = 1 + 0.011 * Math.sin(this.clock * 1.45 + this.seed) * (1 - 0.7 * this.wWalk.v);
    this.breath = br;
    const sUp: V3 = [Math.sin(lean) * fT[0], Math.sin(lean) * fT[1], Math.cos(lean)];
    this.sUp = sUp;
    // forward across the spine (for points on the torso's front)
    const fTp: V3 = [Math.cos(lean) * fT[0], Math.cos(lean) * fT[1], -Math.sin(lean)];
    const along = (a: number, b: number, h: number): V3 => [hipC[0] + fTp[0] * a + lT[0] * b + sUp[0] * h, hipC[1] + fTp[1] * a + lT[1] * b + sUp[1] * h, hipC[2] + fTp[2] * a + sUp[2] * h];
    this.neck = along(0, 0, DIM.TORSO * br);
    const shC = along(0, 0, DIM.SHOULDER * br);
    this.shoulder[0] = [shC[0] + lT[0] * DIM.SHW, shC[1] + lT[1] * DIM.SHW, shC[2]];
    this.shoulder[1] = [shC[0] - lT[0] * DIM.SHW, shC[1] - lT[1] * DIM.SHW, shC[2]];
    const sh0 = this.shoulder[0];
    const sh1 = this.shoulder[1];
    // ----- the arms: a target for each glove, blended from a free swing by what the hands are doing
    const wPrune = this.wPrune.v;
    const wPocket = this.wPocket.v;
    const wRake = this.wRake.v;
    const wKnee = sstep((sigma - 0.45) / 0.45);
    const swingK = this.wWalk.v;
    const rel = (i: number): number => (A[i]![0] - ho[0]) * fP[0] + (A[i]![1] - ho[1]) * fP[1];
    const carryK = 1 - this.kPocket.v;
    const armK = lerp(1, 0.38, carryK);
    const tN = clamp(rel(1) / 17, -1, 1) * 0.62 * swingK * armK * (1 - wa);
    const tF = clamp(rel(0) / 17, -1, 1) * 0.62 * swingK * (1 - wa);
    // the swing follows the legs but not the quick flick of a foot in flight
    if (this.snapElbows) {
      this.swingN.snap(tN);
      this.swingF.snap(tF);
    } else {
      this.swingN.update(this.frameDt, tN, 11);
      this.swingF.update(this.frameDt, tF, 11);
    }
    const betaN = this.swingN.x;
    const betaF = this.swingF.x;
    const hang = (i: number, beta: number, bias: number): V3 => {
      const sg = i === 0 ? 1 : -1;
      const sh = this.shoulder[i]!;
      const b = beta + lean * 0.3;
      return [sh[0] + fT[0] * (Math.sin(b) * ARM + bias) + lT[0] * sg * 1.2, sh[1] + fT[1] * (Math.sin(b) * ARM + bias) + lT[1] * sg * 1.2, sh[2] - Math.cos(b) * ARM];
    };
    let gN = hang(0, betaN, 3.2 + 3 * carryK);
    let gF = hang(1, betaF, 2.2);
    // the measured arm swing, about the rig's own hanging pose (the far arm is half a cycle on, mirrored)
    if (wa > 0.001) {
      for (let i = 0; i < 2; i++) {
        const sg = i === 0 ? 1 : -1;
        wristSwing(phi + 0.5 * i, this.wsw);
        const k = wa * (i === 0 ? armK : 1);
        const g = i === 0 ? gN : gF;
        const o: V3 = [fT[0] * this.wsw[0] + lT[0] * sg * this.wsw[1], fT[1] * this.wsw[0] + lT[1] * sg * this.wsw[1], this.wsw[2]];
        const gg: V3 = [g[0] + o[0] * k, g[1] + o[1] * k, g[2] + o[2] * k];
        if (i === 0) gN = gg;
        else gF = gg;
      }
    }
    // seated: hands rest on the thighs just above the knees
    const thigh = (i: number, k: number): V3 => {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      return [hip[0] + (kn[0] - hip[0]) * k, hip[1] + (kn[1] - hip[1]) * k, hip[2] + (kn[2] - hip[2]) * k + 5.5];
    };
    // pruning: the cut point is held to the vine; the other hand steadies it
    const tipU = this.tipUnits(fT);
    const kEl0 = this.snapElbows ? 1 : 1 - Math.exp(-this.frameDt / 0.25);
    const tool = this.ikTool(sh0, tipU, this.ikA, this.armHint(0, fT, lT, kEl0));
    const pull = this.pull.v;
    const gPrune: V3 = tool.glove;
    const freeT: V3 = [tipU[0] - fT[0] * (5 + 2 * pull) - lT[0] * 3, tipU[1] - fT[1] * (5 + 2 * pull) - lT[1] * 3, tipU[2] - (13 + 9 * pull)];
    // the pocket: the shears go in from above
    const pocketPt = (dh: number): V3 => along(DIM.POCKET.a, DIM.POCKET.b, DIM.POCKET.h + dh);
    const dP = norm3([-sUp[0] + 0.12 * fTp[0], -sUp[1] + 0.12 * fTp[1], -sUp[2] + 0.12 * fTp[2]]);
    const pocketFinal = pocketPt(0);
    const pocketHold = pocketPt(8);
    const gPocket: V3 = [pocketHold[0] - dP[0] * DIM.PIV, pocketHold[1] - dP[1] * DIM.PIV, pocketHold[2] - dP[2] * DIM.PIV];
    // the rake: its head and pole, from leaning at rest to held in the hands, and from carried to working at the target
    const kk = this.rakeK.v;
    this.calcStroke();
    const wk = this.workK.x;
    const p = this.sp;
    const rest = this.restRakeU();
    // the far hand draws back toward the hip through the pull
    const rA = lerp(REAR_A, REAR_A_PULLED, p);
    const rear: V3 = [ho[0] + fP[0] * rA + lP[0] * REAR_B, ho[1] + fP[1] * rA + lP[1] * REAR_B, H + lerp(REAR_H, REAR_H_PULLED, p) + (walkStyle === 'measured' ? REAR_LIFT_M : 0)];
    const horiz = (fx: number, fz: number, g: V3): [number, number] => {
      const vx = g[0] - fx;
      const vz = g[1] - fz;
      const l = Math.hypot(vx, vz);
      return l < 1e-3 ? [-fP[0], -fP[1]] : [vx / l, vz / l];
    };
    // held in the near hand: standing like a staff, carried trailing at the side while moving
    const body = (v: V3, h0: number): V3 => [ho[0] + fP[0] * v[0] + lP[0] * v[1], ho[1] + fP[1] * v[0] + lP[1] * v[1], h0 + v[2]];
    const cv = this.carry.v;
    const jc = lerp3(body(HOLD_HEAD, 0), body(CARRY_HEAD, 0), cv);
    const hand = lerp3(body(HOLD_HAND, H), body(CARRY_HAND, H), cv);
    const toHand: V3 = [hand[0] - jc[0], hand[1] - jc[1], hand[2] - jc[2]];
    const tHold = clamp(Math.hypot(toHand[0], toHand[1], toHand[2]), 30, RAKE.POLE - 20);
    const dirCarry = norm3(toHand);
    // working: the tines' centre on the world target, drawn along the pull; out of reach, they stay on the ground nearer
    let tx = (lerp(this.tF.x, this.tN.x, p) - gp.px) / S;
    let tz = (lerp(this.tF.y, this.tN.y, p) - wy) / (S * KAPPA);
    const tr = Math.hypot(tx, tz);
    const rMax = RAKE_REACH + 8;
    const rMin = 26;
    if (tr > rMax) {
      tx *= rMax / tr;
      tz *= rMax / tr;
    } else if (tr < rMin && tr > 1e-3) {
      tx *= rMin / tr;
      tz *= rMin / tr;
    }
    const hw = horiz(tx, tz, rear);
    const jw: V3 = [tx + hw[0] * TINE_OFF, tz + hw[1] * TINE_OFF, this.sl];
    const toRear: V3 = [rear[0] - jw[0], rear[1] - jw[1], rear[2] - jw[2]];
    const tRear = clamp(Math.hypot(toRear[0], toRear[1], toRear[2]), RAKE.LOW + RAKE_HANDS - 20, RAKE.POLE - 6);
    const dirWork = norm3(toRear);
    const JH = lerp3(jc, jw, wk);
    const dirH = wk <= 0 ? dirCarry : wk >= 1 ? dirWork : norm3(lerp3(dirCarry, dirWork, wk));
    const J = lerp3(rest.head, JH, kk);
    const dir = kk <= 0 ? rest.dir : kk >= 1 ? dirH : norm3(lerp3(rest.dir, dirH, kk));
    this.rakeHeadU = J;
    this.rakeDirU = dir;
    const hl = Math.hypot(dir[0], dir[1]) || 1;
    this.rakeTineU = [J[0] - (dir[0] / hl) * TINE_OFF, J[1] - (dir[1] / hl) * TINE_OFF, 0];
    // the near hand: at the pole's lower grip while carried, RAKE_HANDS below the far hand while raking
    const tLow = lerp(RAKE.LOW, lerp(tHold, tRear - RAKE_HANDS, wk), kk);
    const gLow: V3 = [J[0] + dir[0] * tLow, J[1] + dir[1] * tLow, J[2] + dir[2] * tLow];
    const gHigh: V3 = [J[0] + dir[0] * RAKE.HIGH, J[1] + dir[1] * RAKE.HIGH, J[2] + dir[2] * RAKE.HIGH];
    // how far the lower hand has to reach from a standing shoulder (the crouch is chosen from this)
    this.rakeReach = Math.hypot(gLow[0] - 3 * fT[0], gLow[1] - 3 * fT[1], gLow[2] - 94);
    // blend: later wins by weight; a hand's target swings round the shoulder, the way an arm lifts (a straight blend
    // would cut past the shoulder, where the elbow's bend is unstable and would whip round in a frame)
    gN = swing3(sh0, gN, gPocket, wPocket);
    gN = swing3(sh0, gN, gPrune, wPrune);
    gN = swing3(sh0, gN, gLow, wRake);
    gN = swing3(sh0, gN, thigh(0, 19 / DIM.THIGH), wKnee);
    gF = swing3(sh1, gF, freeT, wPrune);
    // the far hand slides along the handle, as a raker's does: it grips where the pole passes a comfortable arm's
    // length from the shoulder (never at a fixed point that would drag the hand past the shoulder and flip the elbow);
    // raking, it slides to the grip in front of its hip
    const gripRaw = (): number => {
      const vx = J[0] - sh1[0];
      const vy = J[1] - sh1[1];
      const vz = J[2] - sh1[2];
      const vd = vx * dir[0] + vy * dir[1] + vz * dir[2];
      const disc = vd * vd - (vx * vx + vy * vy + vz * vz - GRIP_R * GRIP_R);
      // a smooth max(disc, 0): the grip must not jump as the pole comes within reach of the shoulder
      const free = clamp(-vd + Math.sqrt(0.5 * (disc + Math.sqrt(disc * disc + 900))), RAKE.LOW + 6, RAKE.HIGH + 12);
      return lerp(free, tRear, wk);
    };
    // the hand slides along the pole rather than jumping when the pole swings past the shoulder
    const tRaw = gripRaw();
    if (this.snapElbows) this.gripT.snap(tRaw);
    else this.gripT.update(this.frameDt, tRaw, 8);
    const slideGrip = (): V3 => {
      const t = this.gripT.x;
      return [J[0] + dir[0] * t, J[1] + dir[1] * t, J[2] + dir[2] * t];
    };
    // picking the rake up (or setting it down), the near hand does the lifting while the pole swings from leaning
    // to the hold; the far hand takes the handle only to rake
    const farGrip = wRake * sstep((kk - 0.45) / 0.53) * sstep(wk / 0.7);
    gF = swing3(sh1, gF, farGrip > 0.001 ? slideGrip() : gHigh, farGrip);
    gF = swing3(sh1, gF, thigh(1, 22 / DIM.THIGH), wKnee);
    // the elbows go back and down, a little out; each keeps the side it is on as the arm sweeps round, drifting back
    // to the preferred side (a fixed pole would make the elbow whip round when the hand crosses the pole's line)
    const kEl = this.snapElbows ? 1 : 1 - Math.exp(-this.frameDt / 0.25);
    this.snapElbows = false;
    this.hint = [this.armHint(0, fT, lT, kEl), this.armHint(1, fT, lT, kEl)];
    for (let i = 0; i < 2; i++) {
      ik3(this.shoulder[i]!, i === 0 ? gN : gF, DIM.UA, FOREARM, this.hint[i]!, this.ikB);
      this.elbow[i] = this.ikB.joint;
      this.glove[i] = this.ikB.end;
      // remember which way the elbow points off the line
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
    this.reachOK = tool.reach;
    // ----- the shears
    const ufa = norm3([this.glove[0][0] - this.elbow[0][0], this.glove[0][1] - this.elbow[0][1], this.glove[0][2] - this.elbow[0][2]]);
    const delta = lerp(0.3, 0, wPrune);
    // tilted down from the forearm's line while carried
    const downPerp = norm3([-UP[0] - ufa[0] * -ufa[2], -UP[1] - ufa[1] * -ufa[2], -UP[2] - ufa[2] * -ufa[2]]);
    const uHand = norm3([ufa[0] * Math.cos(delta) + downPerp[0] * Math.sin(delta), ufa[1] * Math.cos(delta) + downPerp[1] * Math.sin(delta), ufa[2] * Math.cos(delta) + downPerp[2] * Math.sin(delta)]);
    const aHand = wPocket > 0.001 ? slerp3(uHand, dP, wPocket) : uHand;
    const gl = this.glove[0];
    const pivotHand: V3 = [gl[0] + aHand[0] * DIM.PIV, gl[1] + aHand[1] * DIM.PIV, gl[2] + aHand[2] * DIM.PIV];
    const kp = sstep(this.kPocket.v);
    this.toolPocket = kp;
    this.toolPivot = lerp3(pivotHand, pocketFinal, kp);
    this.toolDir = kp > 0.001 ? slerp3(aHand, dP, kp) : aHand;
    this.cut = [this.toolPivot[0] + this.toolDir[0] * DIM.CUT, this.toolPivot[1] + this.toolDir[1] * DIM.CUT, this.toolPivot[2] + this.toolDir[2] * DIM.CUT];
    // the tails stream behind: more when moving
    this.tailAng = 0.3 + 0.35 * sstep(this.speed.x / 60) - 0.5 * lean + 0.06 * Math.sin(this.clock * 3.1 + this.seed) * (1 - 0.5 * this.wWalk.v) + 0.04 * Math.sin(this.clock * 6.3);
    // where the gardener is, for the scene
    this.fx = gp.px + ho[0] * S;
  }

  /** the elbow hint for an arm: where it was, pulled toward the preferred side (back, down and a little out) */
  private armHint(i: number, fT: V3, lT: V3, k: number): V3 {
    const sg = i === 0 ? 1 : -1;
    // raking, the far arm's elbow tucks back along the side rather than out (a hand on the handle at the hip with the
    // elbow out to the side reads as a hand on the hip)
    const tuck = i === 1 ? this.wRake.v * this.workK.x : 0;
    const back = 0.45 + 0.35 * tuck;
    const out = 0.2 * (1 - tuck);
    const pref: V3 = norm3([-back * fT[0] + out * sg * lT[0], -back * fT[1] + out * sg * lT[1], -0.85]);
    if (k >= 1) return pref;
    return norm3(lerp3(this.elbowDir[i]!, pref, k));
  }

  /** a point on the apron's front at the pocket, in the figure's units */
  private pocketAt(dh: number, h = DIM.POCKET.h): V3 {
    const lean = this.lean;
    const fx = Math.cos(this.yawT);
    const fz = Math.sin(this.yawT);
    const lx = -fz;
    const lz = fx;
    const sUp = this.sUp;
    const a = DIM.POCKET.a;
    const b = DIM.POCKET.b;
    const hh = h + dh;
    const cl = Math.cos(lean);
    return [this.hipC[0] + fx * cl * a + lx * b + sUp[0] * hh, this.hipC[1] + fz * cl * a + lz * b + sUp[1] * hh, this.hipC[2] - Math.sin(lean) * a + sUp[2] * hh];
  }

  /** the shears' tip target in the figure's units: the world point held, with the wall's surface PRUNE_Z ahead of the feet */
  private tipUnits(fT: V3): V3 {
    const S = this.S;
    const gp = this.gait;
    // the hand recoils a little against the cut (after the frame the snip is counted in)
    const rc = this.recoilShown;
    const X = (this.tip.x - gp.px) / S;
    const Hh = (this.wy - this.tip.y) / S - PRUNE_Z * KAPPA;
    void fT;
    return [X - rc * 0, -PRUNE_Z + rc * 2.2, Hh - rc * 0.8];
  }

  /** two-bone IK for the shears' cut point: where the elbow and the glove end up */
  private ikTool(shoulder: V3, tip: V3, out: IK3Out, pole: V3): { elbow: V3; glove: V3; reach: boolean } {
    ik3(shoulder, tip, DIM.UA, ELBOW_CUT, pole, out);
    const j = out.joint;
    const e = out.end;
    const l = Math.hypot(e[0] - j[0], e[1] - j[1], e[2] - j[2]) || 1;
    return { elbow: [j[0], j[1], j[2]], glove: [j[0] + ((e[0] - j[0]) / l) * FOREARM, j[1] + ((e[1] - j[1]) / l) * FOREARM, j[2] + ((e[2] - j[2]) / l) * FOREARM], reach: out.reach };
  }

  /** the resting rake's head and pole direction in the figure's units */
  private restRakeU(): { head: V3; dir: V3 } {
    const r = restingRake(this.id);
    const gp = this.gait;
    const S = this.S;
    return { head: [(r.x - gp.px) / S, (r.y / KAPPA - gp.pd) / S, 0], dir: norm3([Math.sin(deg(6)) * r.face, 0, Math.cos(deg(6))]) };
  }

  /** debugging and tests: stand still facing `yaw` right now (the harness's sheet of views) */
  debugFace(yaw: number): void {
    const gp = this.gait;
    this.yaw.snap(yaw);
    this.twist.snap(0);
    this.headYaw.snap(0);
    gp.stand(gp.px, gp.pd, yaw);
    this.snapElbows = true;
    this.solve();
  }

  /** debugging and tests: joints in world coordinates and foot contacts */
  debug(): Record<string, unknown> {
    const gp = this.gait;
    const S = this.S;
    const w = (u: V3): [number, number] => this.scr(u);
    const contacts = gp.feet.map((f: Foot) => {
      // rendered heel and toe points, from the ankle and the foot's pitch: the world point and its height above the ground
      const a = f.a;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const cf = Math.cos(f.yaw);
      const sf = Math.sin(f.yaw);
      const pt = (ox: number, oy: number) => {
        const xl = ox * c - oy * s;
        const yl = ox * s + oy * c;
        return { x: f.x + cf * xl * S, y: KAPPA * (f.d + sf * xl * S), h: (f.h - yl) * S };
      };
      return { grounded: f.grounded, heel: pt(DIM.HEEL, DIM.FH), toe: pt(DIM.TOE, DIM.FH), state: f.state, yaw: f.yaw };
    });
    return {
      hip: w(this.hipC),
      knees: [w(this.knee[0]), w(this.knee[1])],
      ankles: [w(this.ankle[0]), w(this.ankle[1])],
      shoulder: w([(this.shoulder[0][0] + this.shoulder[1][0]) / 2, (this.shoulder[0][1] + this.shoulder[1][1]) / 2, this.shoulder[0][2]]),
      elbows: [w(this.elbow[0]), w(this.elbow[1])],
      gloves: [w(this.glove[0]), w(this.glove[1])],
      neck: w(this.neck),
      cut: this.shears(),
      toolPivot: w(this.toolPivot),
      rakeJ: w(this.rakeHeadU),
      contacts,
      elbowDir: [this.elbowDir[0], this.elbowDir[1]],
      pelvis: [gp.px, KAPPA * gp.pd],
      rakeTine: this.rakeHead(),
      units: { hipC: this.hipC, shoulder: this.shoulder, elbow: this.elbow, glove: this.glove, rakeHead: this.rakeHeadU, rakeDir: this.rakeDirU, yawT: this.yawT },
      state: {
        turns: this.turnCount,
        workK: this.workK.x,
        seat: this.seat.v,
        yaw: this.yaw.v,
        yawWrapped: wrapPi(this.yaw.v),
        twist: this.twist.x,
        wPrune: this.wPrune.v,
        kPocket: this.kPocket.v,
        rakeK: this.rakeK.v,
        wRake: this.wRake.v,
        walking: gp.walking,
        action: this.action?.kind ?? null,
        working: this.working,
        blade: this.blade,
        speed: gp.speed * KAPPA,
        reachOK: this.reachOK,
        inBand: this.inBand,
        feetStates: gp.feet.map((f: Foot) => f.state),
        yawMoving: this.yaw.moving,
        turning: gp.turning,
        yawWant: this.yawWant,
        sPhase: this.sPhase,
        still: this.still,
        crossed: this.crossed,
        px: gp.px,
        py: KAPPA * gp.pd,
      },
    };
  }

  /* ---------------------------------------------------------------- painting */

  private paint(ctx: CanvasRenderingContext2D): void {
    const set = this.set;
    const S = this.S;
    const base = ctx.getTransform();
    ctx.save();
    // a rake leaning at rest is drawn first, behind the figure
    const rest = restingRake(this.id);
    if (this.rakeK.v < 0.005 && this.wRake.v < 0.005) this.drawRakeRest(ctx, rest.face > 0 ? set.rake : set.rakeL, rest);
    const items: Array<{ k: number; f: () => void }> = [];
    const hipC = this.hipC;
    const yaw = this.yaw.v;
    // a part drawn at a screen point with a rotation and scale along and across its x axis
    const put = (p: Part, x: number, y: number, ang: number, sl = 1, sw = 1, alpha = 1) => {
      ctx.setTransform(base);
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(S * sl, S * sw);
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
      if (alpha !== 1) ctx.globalAlpha = 1;
    };
    /** one of the painted views at a yaw: the nearest drawn whole, the next dissolving over it */
    const view = (parts: Part[], psi: number, x: number, y: number, ang: number, sw = 1) => {
      const t = ((((psi / (2 * PI)) % 1) + 1) % 1) * VIEWS;
      const k0 = Math.floor(t) % VIEWS;
      const k1 = (k0 + 1) % VIEWS;
      const fr = t - Math.floor(t);
      // the one we are nearer to is the base (fully drawn); the other dissolves over it (or under it, fading out)
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
      put(p, a[0], a[1], ang, r, 1);
      if (far > 0.01) put(pt, a[0], a[1], ang, r, 1, far);
      if (capP && r < capR && B[1] > A[1] + 1) put(capP, b[0], b[1], 0, 1, 1, clamp((capR - r) / 0.25, 0, 1) * clamp((B[1] - A[1] - 1) / 4, 0, 1));
    };
    /** draw a limb clipped to the half nearer its start (or its end), split square across its middle on the screen */
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
    // The arms and tools sort against the torso by where they are round it, not by raw depth. Seen from above the
    // torso is an oval (TORSO_W across, TORSO_D front to back) turned to the torso's yaw; along any line of sight the
    // middle of the oval lies on one line (the diameter conjugate to the view direction), so a point is in front of
    // the torso exactly when it is nearer than that line at its own x. A limb beside the torso and about level with
    // it (an arm hanging at the side) is drawn over the torso's edge; one well in front or behind is not.
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
    /** a limb or a pole from A to B sorts by its part that crosses the torso: its point nearest the torso's middle */
    const keySeg = (A: V3, B: V3): number => {
      const ex = B[0] - A[0];
      const t = Math.abs(ex) < 1e-6 ? 0.5 : clamp((torsoX - A[0]) / ex, 0, 1);
      return keyAt([A[0] + ex * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    };
    // ---- the torso, head and scarf
    const hipS = this.scr(hipC);
    const sp = [this.sUp[0], KAPPA * this.sUp[1] - this.sUp[2]];
    const torsoRot = Math.atan2(sp[0], -sp[1]);
    items.push({
      k: torsoKey,
      f: () => {
        // breathing: the torso swells a touch along its length
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
    const headRot = 0.4 * torsoRot + this.look.x * Math.cos(this.yawH);
    items.push({ k: this.neck[1] + 8, f: () => view(set.head, this.yawH, neckS[0], neckS[1], headRot) });
    items.push({ k: this.neck[1] + 8.2, f: () => view(set.scarf, this.yawT, neckS[0], neckS[1], torsoRot) });
    // the scarf's tails hang from the knot at the back of the neck
    {
      const fx = Math.cos(this.yawT);
      const fz = Math.sin(this.yawT);
      const root: V3 = [this.neck[0] - fx * 6.5 - Math.sin(this.yawT) * -1.5, this.neck[1] - fz * 6.5 + Math.cos(this.yawT) * -1.5, this.neck[2] - 2];
      const ta = this.tailAng;
      const tip: V3 = [root[0] - fx * Math.sin(ta) * 17, root[1] - fz * Math.sin(ta) * 17, root[2] - Math.cos(ta) * 17];
      const a = this.scr(root);
      const b = this.scr(tip);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) - PI / 2;
      const rr = clamp(Math.hypot(b[0] - a[0], b[1] - a[1]) / (17 * S), 0.4, 1.3) * 0.62;
      items.push({ k: root[1] + 3.5, f: () => put(set.tails, a[0], a[1], ang, 1, rr) });
    }
    // ---- the legs: boot, shin, thigh (the trouser cuff over the boot's top)
    for (let i = 0; i < 2; i++) {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      const an = this.ankle[i]!;
      const f = this.gait.feet[i]!;
      const zk = (hip[1] + an[1]) / 2;
      const far = farOf(zk);
      // standing and walking, a leg sorts against the torso by its hip (the apron hangs over the thigh from the front
      // and the back; seen side on the near leg is in front), the one stepping toward the viewer over the other.
      // Seated, the thighs come forward out of the lap and sort by depth.
      const kStand = keyAt(hip) - 1 + clamp(0.08 * (an[1] - hip[1]), -0.6, 0.6);
      const kLeg = lerp(kStand, zk, sstep(this.seat.v / 0.6));
      items.push({
        k: kLeg,
        f: () => {
          const a = this.scr(an);
          // the boot hinges at the ankle: its foot pitches with the foot, its shaft stands along the shin (one rigid
          // painting would leave the shaft standing out of the trouser cuff whenever the knee bends or the heel lifts)
          const k = this.scr(kn);
          const rotShaft = Math.atan2(k[0] - a[0], a[1] - k[1]);
          const rotFoot = f.a * Math.cos(f.yaw);
          const mid = (rotShaft + rotFoot) / 2;
          const dx = Math.cos(mid);
          const dy = Math.sin(mid);
          // the hinge line through the ankle, a touch above it (the foot keeps its collar)
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
          half(true, rotFoot);
          half(false, rotShaft);
          bone(set.shin, set.shinFar, kn, an, DIM.SHIN, far, null, 0);
          bone(set.thigh, set.thighFar, hip, kn, DIM.THIGH, far, set.knee, 0.72);
        },
      });
    }
    // ---- the arms, the shears and the rake
    const foreKeys: number[] = [0, 0];
    for (let i = 0; i < 2; i++) {
      const sh = this.shoulder[i]!;
      const el = this.elbow[i]!;
      const gl = this.glove[i]!;
      const zu = (sh[1] + el[1]) / 2;
      const zf = (el[1] + gl[1]) / 2;
      const ku = keySeg(sh, el);
      // the forearm sorts by its two halves: one reaching round the body (the elbow out behind, the hand in front, or
      // the other way) is drawn in two pieces, each where it is; one wholly on one side is drawn whole, by its hand
      const kElb = keyAt(lerp3(el, gl, 0.22));
      const kHand = keyAt(lerp3(el, gl, 0.8));
      const kf = kHand;
      foreKeys[i] = kf;
      items.push({ k: ku, f: () => bone(set.upper, set.upperFar, sh, el, 24, farOf(zu), null, 0) });
      const drawFore = () => bone(set.fore, set.foreFar, el, gl, FOREARM, farOf(zf), set.elbow, 0.7);
      if (kElb > torsoKey !== kHand > torsoKey) {
        items.push({ k: kElb, f: () => halfOf(el, gl, true, drawFore) });
        items.push({ k: kHand, f: () => halfOf(el, gl, false, drawFore) });
      } else items.push({ k: kf, f: drawFore });
      if (i === 0) {
        // the shears sort with the hand that holds them (just over it), or with the apron pocket they are in: on the
        // torso's surface, seen when that part of the apron faces the viewer and hidden behind the body otherwise
        const kp = sstep((this.toolPocket - 0.2) / 0.6);
        const na = DIM.POCKET.a / (TORSO_D * TORSO_D);
        const nb = DIM.POCKET.b / (TORSO_W * TORSO_W);
        const facing = (na * sT + nb * cT) / Math.hypot(na, nb);
        const ks = lerp(kf + 0.05, torsoKey + 6 * facing, kp);
        items.push({ k: ks, f: () => this.drawShears(ctx, base, put) });
      }
    }
    if (this.rakeK.v > 0.005 || this.wRake.v > 0.005) {
      const hd = this.rakeHeadU;
      const dr = this.rakeDirU;
      const tipU: V3 = [hd[0] + dr[0] * RAKE.POLE, hd[1] + dr[1] * RAKE.POLE, hd[2] + dr[2] * RAKE.POLE];
      const a = this.scr(hd);
      const b = this.scr(tipU);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const rr = clamp(Math.hypot(b[0] - a[0], b[1] - a[1]) / (RAKE.POLE * S), 0.5, 1.3);
      // the pole sorts where it passes the body (its handle, from the lower grip up), and under the hands that hold it
      const lo: V3 = [hd[0] + dr[0] * RAKE.LOW * 0.8, hd[1] + dr[1] * RAKE.LOW * 0.8, hd[2] + dr[2] * RAKE.LOW * 0.8];
      const kr = Math.min(keySeg(lo, tipU), Math.max(foreKeys[0]!, foreKeys[1]!) - 0.3);
      // the fan of tines bends down from the pole toward the ground: mirrored across the pole when it points left, and
      // edge-on as it passes upright (so it never flips over in a frame)
      const cf = Math.cos(ang);
      const sw = Math.sign(cf || 1) * Math.max(0.18, Math.min(1, 3 * Math.abs(cf)));
      items.push({
        k: kr,
        f: () => {
          // the pole whole, then the head (from the ferrule down) mirrored or edge-on as above
          const p = set.rake;
          for (const head of [false, true]) {
            ctx.save();
            ctx.setTransform(base);
            ctx.translate(a[0], a[1]);
            ctx.rotate(ang);
            ctx.scale(S * rr, S * (head ? sw : 1));
            ctx.beginPath();
            if (head) ctx.rect(-60, -60, 65, 120);
            else ctx.rect(5, -60, 200, 120);
            ctx.clip();
            ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
            ctx.restore();
          }
        },
      });
    }
    // sorted far to near (insertion sort: a dozen items, almost in order)
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
    void yaw;
  }

  private drawShears(ctx: CanvasRenderingContext2D, base: DOMMatrix, put: (p: Part, x: number, y: number, ang: number, sl?: number, sw?: number, alpha?: number) => void): void {
    const set = this.set;
    const open = this.blade * SNIP_OPEN;
    const kp = this.toolPocket;
    const piv = this.toolPivot;
    const tip: V3 = [piv[0] + this.toolDir[0] * DIM.CUT, piv[1] + this.toolDir[1] * DIM.CUT, piv[2] + this.toolDir[2] * DIM.CUT];
    const a = this.scr(piv);
    const b = this.scr(tip);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    const ang = L > 1e-3 ? Math.atan2(dy, dx) : 0;
    const sl = clamp(L / (DIM.CUT * this.S), 0.55, 1.1);
    ctx.save();
    if (kp > 0.001) {
      // slide the clip's lower edge up to the pocket's mouth as the shears go in
      const mouth = this.scr(this.pocketAt(0, DIM.POCKET.h - 2));
      ctx.setTransform(base);
      ctx.beginPath();
      const yClip = lerp(this.wy + 60, mouth[1], kp);
      ctx.rect(-1e4, -1e4, 2e4, yClip + 1e4);
      ctx.clip();
    }
    put(set.shearsB, a[0], a[1], ang - open, sl, 1);
    put(set.shearsA, a[0], a[1], ang, sl, 1);
    ctx.restore();
  }

  private drawRakeRest(ctx: CanvasRenderingContext2D, p: Part, r: { x: number; y: number; face: 1 | -1; elevation: number }): void {
    const S = depthScale(r.y);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(S * r.face, S);
    ctx.rotate(Math.atan2(-Math.sin(r.elevation), -Math.cos(r.elevation)));
    ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
    ctx.restore();
  }
}

export const createGardener: CreateGardener = (id: PlanId, spriteQ: number): Gardener => {
  const g = new GardenerImpl(id, Math.max(1, spriteQ));
  const api: Gardener & { debug(): Record<string, unknown>; debugFace(yaw: number): void; debugTurn(yaw: number | null): void } = {
    id,
    get snips() {
      return g.snips;
    },
    get strokes() {
      return g.strokes;
    },
    get working() {
      return g.working;
    },
    update(dt, intent, tSec, reduced) {
      g.pace = intent.pace;
      g.update(dt, intent, tSec, reduced);
    },
    draw: (ctx) => g.draw(ctx),
    shears: () => g.shears(),
    feet: () => g.feet(),
    rakeHead: () => g.rakeHead(),
    place(intent) {
      g.pace = intent.pace;
      g.place(intent);
    },
    debug: () => g.debug(),
    debugFace: (yaw) => g.debugFace(yaw),
    debugTurn: (yaw) => {
      g.debugYaw = yaw;
    },
  };
  return api;
};

void GROUND_Y;
