/**
 * The two climbers: the vine gardener's jointed figure (a real 3D skeleton drawn in the world's oblique projection,
 * parts cached as sprites, see climberArt.ts) dressed for winter, driven by the gardener's footstep gait
 * (climberGait.ts, with a FOLLOW mode for walking in step with a rolling ball) and a small director that turns the
 * scene's intent into smooth action.
 *
 * Like the gardener's director this one keeps a handful of continuous quantities (facing, how far the mittens are
 * on the ball, how raised the arms are for a cheer, the seat, the stoop) and moves each along its own minimum-jerk
 * or critically damped path, so an intent that changes mid-action just re-aims them from wherever they are: nothing
 * ever snaps. Things that must happen in order are done in order: the mittens come off the ball before a walk, a
 * turn is a few pivot steps on the spot with the feet flat, the climber is square on to the ball before the
 * mittens go on, and stands before a walk.
 *
 * Pushing: the ball's centre C, its lane direction g and its radius r come in every frame. The climber's pelvis
 * has an ideal place behind the ball (C minus the stand-off along g), worked out from how far the mittens must
 * reach (a small ball is held low, so the climber stoops: the knees bend, the back leans well forward; a big ball
 * is held about its middle, the shoulder in and the back nearly upright). Far from it the climber walks there
 * (round the ball if it is in the way); near it, the gait FOLLOWS the ideal place: it takes the steps whose
 * length and time suit the ball's speed (a crawl is a shuffle or a lean with an occasional step, a brisk pace is
 * the measured walk's full stride), planting each foot where it will not slide. The mittens are fixed to the
 * ball's surface and the arms reach them by two-bone IK; the hips shift and the back leans a little to take up
 * whatever the steps leave over, so the mittens neither sink into the ball nor float off it.
 */
import type { StrategyId } from '../types';
import type { Climber, ClimberIntent, CreateClimber } from './climberApi';
import { PATH_Y, REST, depthScale } from './geom';
import { DIM, FOREARM, KAPPA, VIEWS } from '../../vine/scene/gardenerDims';
import { Gait, STANCE, type Foot, type FollowGoal, type GaitGoal } from './climberGait';
import { LEG, WALK_BOB, WALK_PELVIS_ROLL, WALK_PELVIS_YAW, WALK_SWAY, WALK_THORAX_YAW, cyc, wristSwing } from '../../vine/scene/gardenerWalk';
import { Mover, Spring1, clamp, hash1, ik3, lerp, lerp3, norm3, softMin, sstep, sstep5, swing3, wrapPi, type IK3Out, type V3 } from '../../vine/scene/gardenerMath';
import { buildClimberSet, type Part, type Sprites } from './climberArt';
import { IDLE_SPOT, PUSH_ANGLE, SEAT_HIP_H, SIT_BACK, UNIT } from './climberDims';
import { BreathMist } from './climberBreath';

const PI = Math.PI;
const CROUCH_DROP = 22;
/** walking, the hips ride this much below a straight leg's reach (the knees stay soft) */
const WALK_DROP = 3.5;
const ARM = 49;
const SIT_YAW = PI / 2;
/** the torso (coat) seen from above, for sorting the arms against it: half its width and half its depth (units) */
const TORSO_W = 9.6;
const TORSO_D = 8;
/** the largest turn (rad) a walk begins with: bigger ones are one turn on the spot first */
const WALK_TURN = 2.0;
/** the standing hip height (rig units) used to plan the stoop */
const HIP_STAND = 57;
/** the comfortable reach of a bent arm, shoulder to mitten (rig units) */
const ARM_BENT = 44;
/** following begins this close (ground units) to the ideal place, and ends this far from it */
const FOLLOW_IN = 30;
const FOLLOW_OUT = 72;
/** a ball rolling down toward the climber faster than this (ground units/s) is waited for beside its lane */
const COMING = 4;
/** how far beyond the ball's edge the climber stands aside while it comes past (ground units) */
const STEP_ASIDE = 30;

const mk = (): IK3Out => ({ joint: [0, 0, 0], end: [0, 0, 0], reach: true });

/** a ball as the director uses it, in ground units (x across, d = world y / KAPPA, a unit direction down its lane) */
interface Ball {
  x: number;
  d: number;
  r: number;
  gx: number;
  gd: number;
}

interface PushPlan {
  R: number;
  crouch: number;
  lean: number;
  w: number;
  rh: number;
  off: number;
  hx: number;
  /** pelvis to the ball's centre, along the way the climber faces (rig units) */
  Dc: number;
}

class ClimberImpl implements Climber {
  readonly id: StrategyId;
  pushing = false;

  private readonly set: Sprites;
  private readonly gait: Gait;
  private readonly seed: number;
  private readonly mist = new BreathMist();

  // continuous quantities
  private readonly yaw = new Mover(0);
  private readonly twist = new Spring1(0);
  private readonly headYaw = new Spring1(0);
  private readonly look = new Spring1(0);
  private readonly seat = new Mover(0);
  private readonly wWalk = new Mover(0);
  private readonly wPush = new Mover(0);
  private readonly wCheer = new Mover(0);
  private readonly wTog = new Mover(0);
  private readonly adCrouch = new Spring1(0);
  private readonly adLean = new Spring1(0);
  private readonly pushLean = new Spring1(0.2);
  private readonly adShiftA = new Spring1(0);
  private readonly sway = new Spring1(0);
  private readonly speed = new Spring1(0);
  private readonly swingN = new Spring1(0);
  private readonly swingF = new Spring1(0);
  private readonly cheerUp = new Spring1(0);

  // director state
  private goal: GaitGoal | null = null;
  private followGoal: FollowGoal | null = null;
  private yawWant: number | null = null;
  private yawTrack = false;
  private walkOK = true;
  private following = false;
  private clock = 0;
  private turnCount = 0;
  private reducedSig = '';
  private glanceAt = 3.2;
  private glanceUntil = 0;
  private glanceN = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private frameDt = 1 / 60;
  private started = false;
  /** the ball the mittens are on (or are coming off); the intent's ball when it is the same one */
  private ball: Ball | null = null;
  /** the last raw target seen, to tell a new ball from the same one moving */
  private lastRaw: { x: number; y: number } | null = null;
  private holding = false;
  private slack = 0;
  /** the ideal pelvis place and its filtered velocity (ground units) */
  private ideal = { x: 0, d: 0 };
  private idealV = { x: 0, d: 0 };
  private idealValid = false;


  private route: { x: number; d: number } | null = null;

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
  private fx = 0;
  private yawT = 0;
  private yawH = 0;
  private reachErr = 0;
  private ikA = mk();
  private ikB = mk();
  private wsw: [number, number, number] = [0, 0, 0];
  private elbowDir: [V3, V3] = [[0, 0, -1], [0, 0, -1]];
  private snapElbows = true;
  private handsOnBall: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  private ballU: { c: V3; R: number } | null = null;
  private mouthU: V3 = [0, 0, 100];

  constructor(id: StrategyId, q: number) {
    this.id = id;
    this.set = buildClimberSet(id, q);
    this.seed = id === 'snowball' ? 11 : 23;
    const sp = IDLE_SPOT[id];
    const yaw = id === 'snowball' ? 1.15 : PI - 1.15;
    this.gait = new Gait(sp.x, sp.y / KAPPA, yaw);
    this.yaw.snap(yaw);
    this.solve();
  }

  /* ---------------------------------------------------------------- the contract */

  update(dtSec: number, intent: ClimberIntent, tSec: number, reduced: boolean): void {
    void tSec;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    this.frameDt = dt;
    if (reduced) {
      const t = intent.target;
      const sig = `${intent.activity}|${t ? `${Math.round(t.x)},${Math.round(t.y)},${Math.round(intent.radius)}` : '-'}`;
      if (sig !== this.reducedSig) {
        this.reducedSig = sig;
        this.settle(intent);
        this.snapElbows = true;
      }
      this.solve();
      this.pushing = this.computePushing(intent);
      return;
    }
    if (this.reducedSig !== '') this.reducedSig = '';
    this.noteBall(intent, dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, intent);
    this.solve();
    this.mist.update(dt, this.clock, this.mouthWorld(), this.effort(), this.seat.v > 0.5);
    this.pushing = this.computePushing(intent);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.paint(ctx);
    this.mist.draw(ctx);
  }

  feet(): { x: number; y: number } {
    return { x: this.fx, y: this.wy };
  }

  /** straight into the settled pose for an intent, where it happens; motion carries on from there (scrubbing) */
  place(it: ClimberIntent): void {
    this.noteBall(it, 0);
    this.settle(it);
    this.reducedSig = '';
    this.solve();
    this.mist.reset();
    this.pushing = this.computePushing(it);
  }

  /* ---------------------------------------------------------------- helpers */

  /** a point in the figure's 3D units (relative to the pelvis's ground point) to world screen coordinates */
  private scr(u: V3): [number, number] {
    return [this.gait.px + this.S * u[0], this.wy + this.S * (KAPPA * u[1] - u[2])];
  }

  private mouthWorld(): { x: number; y: number } {
    const p = this.scr(this.mouthU);
    return { x: p[0], y: p[1] };
  }

  /** 0 at ease .. 1 labouring: how hard the climber is working (breath quickens) */
  private effort(): number {
    return clamp(this.speed.x / 60, 0, 1) * 0.7 + 0.3 * this.wPush.v * (1 - this.seat.v);
  }

  private computePushing(it: ClimberIntent): boolean {
    return it.activity === 'push' && !!this.ball && this.wPush.v > 0.97 && this.wPush.target > 0.5 && this.reachErr < 1.2 && this.seat.v < 0.01;
  }

  private readBall(it: ClimberIntent): Ball | null {
    if (it.activity !== 'push' || !it.target || !it.dir) return null;
    let gx = it.dir.x;
    let gd = it.dir.y / KAPPA;
    const l = Math.hypot(gx, gd) || 1;
    gx /= l;
    gd /= l;
    return { x: it.target.x, d: it.target.y / KAPPA, r: Math.max(2, it.radius), gx, gd };
  }

  /** follow the intent's ball: the same ball moving, or a new one (let go of the old, then take the new) */
  private noteBall(it: ClimberIntent, dt: number): void {
    const cur = this.readBall(it);
    if (!cur) {
      this.lastRaw = null;
      this.idealValid = false;
      return;
    }
    const raw = it.target!;
    const jumped = this.lastRaw ? Math.hypot(raw.x - this.lastRaw.x, raw.y - this.lastRaw.y) > 42 : false;
    this.lastRaw = { x: raw.x, y: raw.y };
    if (dt === 0) this.idealValid = false;
    if (!this.ball) {
      this.ball = cur;
      this.idealValid = false;
      return;
    }
    const off = this.wPush.v < 0.02 && this.wPush.target < 0.5;
    if (this.holding) {
      // letting go of the old ball: the new one is taken up once the mittens are off
      if (off) {
        this.ball = cur;
        this.holding = false;
        this.idealValid = false;
      }
      return;
    }
    if (jumped) {
      if (off) {
        this.ball = cur;
        this.idealValid = false;
      } else {
        // a different ball: the mittens come off the old one (held where it was) before the new one is taken up
        this.holding = true;
        this.wPush.go(0, 0.5);
        this.following = false;
      }
      return;
    }
    this.ball = cur;
  }

  /** what the stoop, the reach and the stand-off are for a ball of this size (rig units) */
  private pushPlan(b: Ball, S: number): PushPlan {
    const R = b.r / S;
    const s = sstep((50 - R) / 40);
    const crouch = s;
    const lean = 0.16 + 0.66 * s + 0.26 * sstep((14 - R) / 8);
    const wk = 0.2 * (1 - s);
    const w = Math.max(R * wk, 6 - R);
    const handH = R + w;
    const hipH = HIP_STAND - CROUCH_DROP * crouch;
    const shoulderH = hipH + 35 * Math.cos(lean);
    const dz = shoulderH - handH;
    const hd = clamp(Math.sqrt(Math.max(ARM_BENT * ARM_BENT - dz * dz, 0)), 6, 38);
    const rh = R + 4;
    const off = Math.min(7.4, 0.72 * R);
    const hx = Math.sqrt(Math.max(rh * rh - off * off - w * w, (0.35 * rh) * (0.35 * rh)));
    const forward = 35 * Math.sin(lean);
    return { R, crouch, lean, w, rh, off, hx, Dc: hd + hx + forward };
  }

  /** the unit vector from the pelvis toward the ball's centre when pushing (the lane direction, turned a little round) */
  private standDir(b: Ball): { x: number; d: number } {
    const a = PUSH_ANGLE * (this.id === 'snowball' ? 1 : -1);
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: b.gx * c - b.gd * s, d: b.gx * s + b.gd * c };
  }

  private idealFor(b: Ball): { x: number; d: number; yaw: number } {
    const p = this.pushPlan(b, this.S);
    const e = this.standDir(b);
    return { x: b.x - e.x * p.Dc * this.S, d: b.d - e.d * p.Dc * this.S, yaw: Math.atan2(e.d, e.x) };
  }

  private get still(): boolean {
    if (this.gait.walking || this.gait.turning) return false;
    for (const f of this.gait.feet) if (f.state !== STANCE) return false;
    return !this.yaw.moving;
  }

  private facing(yaw: number, tol = 0.15): boolean {
    return Math.abs(wrapPi(yaw - this.yaw.v)) < tol && !this.yaw.moving && !this.gait.turning;
  }

  /* ---------------------------------------------------------------- the director */

  private step(h: number, it: ClimberIntent): void {
    this.clock += h;
    this.started = true;
    this.direct(h, it);
    this.driveYaw();
    this.yaw.update(h);
    this.seat.update(h);
    this.wPush.update(h);
    this.wCheer.update(h);
    this.wTog.update(h);
    // walking (never while seated, with the arms up, or turning round)
    const allow = this.seat.v < 0.004 && !this.seat.moving && this.wCheer.v < 0.2 && !this.gait.turning && this.walkOK && this.gait.feet[0].tipRoll < 0.02 && (!this.yaw.moving || this.following);
    this.gait.follow = this.followGoal;
    this.gait.update(h, this.goal, this.yaw.v, allow, this.S);
    this.wWalk.go(this.gait.walking ? 1 : 0, 0.3);
    this.wWalk.update(h);
    this.speed.update(h, this.gait.speed, 12);
    // the sway over the standing foot
    const f0 = this.gait.feet[0].state === STANCE ? 1 : 0;
    const f1 = this.gait.feet[1].state === STANCE ? 1 : 0;
    this.sway.update(h, (this.gait.walking ? 1.7 : this.gait.turning ? 2.6 : 0) * (f0 - f1), 12);
    this.idleLife(h);
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
      if (this.following && Math.abs(d) > 0.03 && Math.abs(d) < 0.5) this.yaw.retarget(this.yaw.target + d, 0.45);
      return;
    }
    if (Math.abs(dv) <= 0.09) return;
    const calm = this.seat.v < 0.004 && !this.seat.moving && gp.feet[0].tipRoll < 0.02 && gp.feet[0].state === STANCE && gp.feet[1].state === STANCE && gp.feet[0].tLand > 0.12 && gp.feet[1].tLand > 0.12;
    if (!calm) return;
    const dur = Math.abs(dv) > 0.35 ? 0.5 + 0.42 * Math.abs(dv) : 0.6;
    this.yaw.retarget(this.yaw.v + dv, dur);
    if (Math.abs(dv) > 0.35) {
      this.turnCount++;
      gp.startTurn(this.yaw.v, dv, dur, Math.abs(dv) < 1.22 ? 2 : Math.abs(dv) < 2.44 ? 3 : 4);
    }
  }

  /**
   * Aim for a spot: returns true once there (within `tol`) and facing as asked (null: any way). The body turns into
   * the way of travel as the walk begins (or in one turn on the spot if that is more than about 115 degrees), and
   * swings round to the final facing over the last strides, so it arrives already facing the work.
   */
  private goTo(spot: { x: number; y: number }, finalYaw: number | null, tolIn: number): boolean {
    const gp = this.gait;
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

  private direct(h: number, it: ClimberIntent): void {
    const gp = this.gait;
    this.goal = null;
    this.followGoal = null;
    this.yawWant = null;
    this.yawTrack = false;
    this.walkOK = true;
    this.mouthTick();
    const act = it.activity;

    // seated (or sitting down or standing up): stay in that business until it is done
    if (this.seat.v > 0.004 || this.seat.moving) {
      const sit = this.sitStand();
      const stay = act === 'rest' && Math.hypot(gp.px - sit.x, KAPPA * gp.pd - sit.y) < 6;
      this.seat.go(stay ? 1 : 0, stay ? 1.5 : 1.2);
      this.wPush.go(0, 0.4);
      this.wCheer.go(0, 0.4);
      this.wTog.go(0, 0.4);
      this.yawWant = SIT_YAW;
      this.following = false;
      return;
    }

    let push = false;
    let cheer = false;
    let tog = false;
    switch (act) {
      case 'push': {
        if (!this.ball) {
          tog = true;
          break;
        }
        push = this.directPush(h);
        break;
      }
      case 'cheer':
        cheer = true;
        this.following = false;
        break;
      case 'rest': {
        this.following = false;
        const sit = this.sitStand();
        const wp = this.restRoute(sit);
        if (wp) this.goTo(wp, null, 4);
        else if (this.goTo(sit, SIT_YAW, 1.2) && this.still && this.wPush.v < 0.05 && this.wCheer.v < 0.05) this.seat.go(1, 1.5);
        break;
      }
      case 'idle':
      default:
        this.following = false;
        tog = true;
        break;
    }
    // the mittens on the ball, up in a cheer, or together at the waist: each blends in over its own time
    if (!push && this.wPush.target > 0.5) this.wPush.go(0, 0.5);
    this.wCheer.go(cheer ? 1 : 0, cheer ? 0.62 : 0.55);
    this.wTog.go(tog && !gp.walking && this.wPush.v < 0.05 ? 1 : 0, 0.7);
    if (this.wCheer.v > 0.2 || cheer) {
      this.followGoal = null;
      this.goal = null;
    }
    if (cheer) this.walkOK = this.walkOK && this.wCheer.v < 0.2;
  }

  private mouthTick(): void {
    // the mouth (the head's centre line, forward and up from the neck's base) for the breath
    const n = this.neck;
    this.mouthU = [n[0] + Math.cos(this.yawH) * 8.2, n[1] + Math.sin(this.yawH) * 8.2, n[2] + 5.2];
  }

  /** where the feet stand to sit: the hips come to rest over REST, SIT_BACK behind them */
  private sitStand(): { x: number; y: number } {
    const r = REST[this.id];
    return { x: r.x, y: r.y + SIT_BACK * this.S * KAPPA };
  }

  /** the corner to walk round so the way to the sledge does not cross it (null: go straight there) */
  private restRoute(sit: { x: number; y: number }): { x: number; y: number } | null {
    void sit;
    return null;
  }

  /** push: returns whether the mittens should be on the ball */
  private directPush(h: number): boolean {
    void h;
    const gp = this.gait;
    const b = this.ball!;
    // a new ball while the old is still being let go: stay put until the mittens are off
    if (this.holding) {
      this.walkOK = false;
      this.following = false;
      return false;
    }
    const idl = this.idealFor(b);

    // the ideal place and its velocity (a smoothed difference, so a stepped ball does not jerk the steps)
    if (!this.idealValid) {
      this.ideal.x = idl.x;
      this.ideal.d = idl.d;
      this.idealV.x = 0;
      this.idealV.d = 0;
      this.idealValid = true;
    } else if (this.frameDt > 0) {
      const dt = this.frameDt;
      const k = 1 - Math.exp(-dt / 0.14);
      this.idealV.x += ((idl.x - this.ideal.x) / dt - this.idealV.x) * k;
      this.idealV.d += ((idl.d - this.ideal.d) / dt - this.idealV.d) * k;
      this.ideal.x = idl.x;
      this.ideal.d = idl.d;
    }
    const dist = Math.hypot(idl.x - gp.px, idl.d - gp.pd);
    const yawErr = Math.abs(wrapPi(idl.yaw - this.yaw.v));
    if (!this.following && dist < FOLLOW_IN && yawErr < 0.45 && !gp.turning && this.wCheer.v < 0.2) this.following = true;
    if (this.following && (dist > FOLLOW_OUT || yawErr > 1.0)) this.following = false;
    if (this.following) {
      this.followGoal = { x: idl.x, d: idl.d, vx: this.idealV.x, vd: this.idealV.d, hx: b.gx, hd: b.gd };
      this.yawWant = idl.yaw;
      this.yawTrack = false;
      const engage = dist < 22 && yawErr < 0.3;
      if (engage) this.wPush.go(1, 0.9);
      else if (dist > 44) this.wPush.go(0, 0.5);
      return this.wPush.target > 0.5;
    }
    // far from the ideal place: walk there (round the ball when it is in the way), arms free
    const spot = this.approachSpot(b, idl);
    this.goTo({ x: spot.x, y: spot.d * KAPPA }, spot.final ? idl.yaw : null, spot.final ? 3 : 8);
    return false;
  }

  /** the next point to head for: the ideal place, or a corner round the ball if the way there crosses it */
  private approachSpot(b: Ball, idl: { x: number; d: number }): { x: number; d: number; final: boolean } {
    const gp = this.gait;
    // the ball is up the lane and rolling down toward us: step out of its way (to the side already taken, abreast of
    // where we stand) and wait there for it to come past; then the ideal place behind it is clear to walk to
    const along = (gp.px - b.x) * b.gx + (gp.pd - b.d) * b.gd;
    const coming = this.idealV.x * b.gx + this.idealV.d * b.gd;
    if (along > -b.r * 0.5 && coming > COMING) {
      const lat = (gp.px - b.x) * -b.gd + (gp.pd - b.d) * b.gx;
      const side = lat >= 0 ? 1 : -1;
      const off = b.r + STEP_ASIDE;
      // (level with where we stand, not with the ball: it rolls past us, we do not walk ahead of it)
      this.route = null;
      return { x: b.x + b.gx * along - b.gd * side * off, d: b.d + b.gd * along + b.gx * side * off, final: false };
    }
    // is the ball in the way? (the nearest point of the line from here to the ideal place, to the ball's centre)
    const ax = gp.px;
    const ad = gp.pd;
    const vx = idl.x - ax;
    const vd = idl.d - ad;
    const l2 = vx * vx + vd * vd || 1;
    const t = clamp(((b.x - ax) * vx + (b.d - ad) * vd) / l2, 0, 1);
    const nx = ax + vx * t;
    const nd = ad + vd * t;
    const gap = Math.hypot(b.x - nx, b.d - nd);
    const clear = b.r + 40;
    const here = Math.hypot(b.x - ax, b.d - ad);
    if (gap >= clear || here < clear * 0.85 || t <= 0.001 || t >= 0.999) {
      this.route = null;
      return { x: idl.x, d: idl.d, final: true };
    }
    // go round the side the walker is already on, to a corner abreast of the ball at a safe distance
    const side = (b.x - ax) * vd - (b.d - ad) * vx >= 0 ? -1 : 1;
    const px = -vd / Math.sqrt(l2);
    const pd = vx / Math.sqrt(l2);
    if (!this.route) this.route = { x: b.x + px * side * (b.r + 52), d: b.d + pd * side * (b.r + 52) };
    return { x: this.route.x, d: this.route.d, final: false };
  }

  /* ---------------------------------------------------------------- idle life */

  private idleLife(h: number): void {
    // a glance round, and up at the falling snow, now and then (when standing or sitting still)
    const calm = !this.gait.walking && this.wPush.v < 0.05 && this.wCheer.v < 0.05 && !this.yaw.moving && !this.gait.turning;
    if (this.clock >= this.glanceAt && calm) {
      this.glanceN++;
      this.glanceUntil = this.clock + 1.7 + 0.8 * (hash1(this.glanceN, this.seed) * 0.5 + 0.5);
      this.glanceAt = this.glanceUntil + 3.5 + 4.5 * (hash1(this.glanceN + 50, this.seed) * 0.5 + 0.5);
      const side = hash1(this.glanceN + 3, this.seed) > 0 ? 1 : -1;
      this.lookYaw = side * (0.3 + 0.3 * hash1(this.glanceN + 9, this.seed));
      this.lookPitch = -0.42 - 0.1 * hash1(this.glanceN + 19, this.seed);
    }
    if (this.clock >= this.glanceUntil || !calm) {
      this.lookYaw = 0;
      this.lookPitch = 0;
    }
    let tgt = this.lookPitch;
    let tYaw = this.lookYaw;
    // turning: the head leads the turn
    if (this.yaw.moving || this.gait.turning) {
      const rem = wrapPi(this.yaw.target - this.yaw.v);
      tYaw = clamp(0.5 * rem, -0.45, 0.45);
    }
    // cheering: a nod
    if (this.wCheer.v > 0.02) tgt = lerp(tgt, -0.18 + 0.2 * Math.sin(this.clock * 8), this.wCheer.v);
    // pushing: the head up, to see over the ball
    this.look.update(h, tgt, 7);
    this.headYaw.update(h, tYaw, 8);
  }

  /* ---------------------------------------------------------------- body adaptation (reach) */

  private updateAdapt(h: number, it: ClimberIntent): void {
    void it;
    const w = this.wPush.v;
    let crouch = 0;
    let lean = 0;
    let shift = 0;
    const b = this.ball;
    if (b && w > 0.001) {
      const p = this.pushPlan(b, this.S);

      crouch = p.crouch * w;
      // what the steps leave over (the pelvis behind or ahead of the ideal) is taken up by the hips and the back
      const e = this.standDir(b);
      const gp = this.gait;
      const Dc = ((b.x - gp.px) * e.x + (b.d - gp.pd) * e.d) / this.S;
      const slack = Dc - p.Dc;
      this.slack = slack;
      shift = clamp(slack, -6, 16) * w;
      lean = p.lean + 0.014 * clamp(slack - shift / Math.max(w, 0.01), -10, 14);
    }
    this.adCrouch.update(h, crouch, 9);
    this.adShiftA.update(h, shift, 7);
    this.pushLean.update(h, lean, 9);
    // the torso twists a little to lead a turn
    let tw = 0;
    if (this.yaw.moving || this.gait.turning) {
      const rem = wrapPi(this.yaw.target - this.yaw.v);
      tw += clamp(0.12 * rem, -0.12, 0.12);
    }
    this.twist.update(h, tw, 9);
    this.cheerUp.update(h, this.wCheer.v > 0.5 ? 0.3 + 0.14 * Math.sin(this.clock * 8) : 0, 14);
    this.gait.setTip(this.cheerUp.x * this.wCheer.v);
  }

  /* ---------------------------------------------------------------- reduced motion */

  private settle(it: ClimberIntent): void {
    const act = it.activity;
    const gp = this.gait;
    this.followGoal = null;
    this.goal = null;
    this.following = false;
    this.route = null;
    this.seat.snap(act === 'rest' ? 1 : 0);
    this.wWalk.snap(0);
    this.look.snap(0);
    this.headYaw.snap(0);
    this.sway.snap(0);
    this.speed.snap(0);
    this.swingN.snap(0);
    this.swingF.snap(0);
    this.cheerUp.snap(0);
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.snapElbows = true;
    this.yawWant = null;
    let x = gp.px;
    let y = KAPPA * gp.pd;
    let yaw = this.yaw.v;
    const cur = this.readBall(it);
    let wPush = 0;
    if (act === 'rest') {
      const s = this.sitStand();
      x = s.x;
      y = s.y;
      yaw = SIT_YAW;
    } else if (act === 'push' && cur) {
      this.ball = cur;
      this.idealValid = false;
      wPush = 1;
      // the stand-off depends on the depth scale there, so settle it in a couple of passes
      for (let i = 0; i < 3; i++) {
        this.S = depthScale(y) * UNIT;
        const idl = this.idealFor(cur);
        x = idl.x;
        y = idl.d * KAPPA;
        yaw = idl.yaw;
      }
      this.idealValid = true;
      this.ideal.x = x;
      this.ideal.d = y / KAPPA;
      this.idealV.x = 0;
      this.idealV.d = 0;
    } else {
      this.ball = null;
      this.idealValid = false;
      if (!this.started) {
        const sp = IDLE_SPOT[this.id];
        x = sp.x;
        y = sp.y;
      }
    }
    this.started = true;
    this.wPush.snap(wPush);
    this.wCheer.snap(act === 'cheer' ? 1 : 0);
    this.wTog.snap(act === 'idle' || (act === 'push' && !cur) ? 1 : 0);
    this.yaw.snap(yaw);
    this.twist.snap(0);
    gp.stand(x, y / KAPPA, yaw);
    this.wy = y;
    this.S = depthScale(y) * UNIT;
    // the stoop and the shift for the ball, as they settle
    for (let pass = 0; pass < 3; pass++) {
      const b = this.ball;
      if (b && wPush > 0) {
        const p = this.pushPlan(b, this.S);
  
        this.adCrouch.snap(p.crouch);
        this.pushLean.snap(p.lean);
        this.adShiftA.snap(0);
      } else {
        this.adCrouch.snap(0);
        this.pushLean.snap(0);
        this.adShiftA.snap(0);
      }
      this.cheerUp.snap(act === 'cheer' ? 0.3 : 0);
      gp.setTip(this.cheerUp.x * this.wCheer.v);
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
    const S = depthScale(wy) * UNIT;
    this.S = S;
    this.wy = wy;
    const yaw = this.yaw.v;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fP: V3 = [cy, sy, 0];
    const lP: V3 = [-sy, cy, 0];
    // the measured walk: the pelvis bobs, sways and turns with the stride, and the chest turns back against it
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
    const wP = this.wPush.v;
    // the weight shift: a slow sway side to side (and a little forward and back) while standing about
    const calm = 1 - this.wWalk.v;
    const idleShift = (0.7 * Math.sin(this.clock * 0.55 + this.seed) + 0.3 * Math.sin(this.clock * 1.31 + 2)) * calm * (1 - sigma) * (1 - wP);
    const sitBack = SIT_BACK * sstep(sigma / 0.8);
    const shiftA = this.adShiftA.x + 0.35 * idleShift - sitBack;
    const shiftB = this.sway.x + 1.0 * idleShift + wa * cyc(WALK_SWAY, phi) * LEG;
    const ho: V3 = [fP[0] * shiftA + lP[0] * shiftB, fP[1] * shiftA + lP[1] * shiftB, 0];
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
    const Hw = wa > 0.001 ? softMin(H0, DIM.FH + DIM.LMAX - WALK_DROP * wa + wa * cyc(WALK_BOB, phi) * LEG, 1.2) : H0;
    const H = lerp(Hw - crouch, SEAT_HIP_H, fy);
    const hipC: V3 = [ho[0], ho[1], H];
    this.hipC = hipC;
    // the legs: knees lead the way the foot points
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
    // the torso: it leans toward where the torso faces
    const walkLean = 0.05 + 0.08 * sstep(this.speed.x / 70);
    const sitLean = 0.42 * Math.sin(PI * clamp(sigma / 0.75, 0, 1)) - 0.1 * sstep((sigma - 0.75) / 0.25);
    const free = walkLean * this.wWalk.v + 0.03 * (1 - this.wWalk.v) + this.adLean.x + sitLean + 0.02 * Math.sin(this.clock * 0.9) * calm;
    const lean = lerp(free, this.pushLean.x, wP) + 0.05 * this.wCheer.v;
    this.lean = lean;
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
    // ----- the arms: a target for each mitten, blended from a free swing by what the hands are doing
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
    const betaN = this.swingN.x;
    const betaF = this.swingF.x;
    const hang = (i: number, beta: number, bias: number): V3 => {
      const sg = i === 0 ? 1 : -1;
      const sh = this.shoulder[i]!;
      const b = beta + lean * 0.3;
      return [sh[0] + fT[0] * (Math.sin(b) * ARM + bias) + lT[0] * sg * 2.2, sh[1] + fT[1] * (Math.sin(b) * ARM + bias) + lT[1] * sg * 2.2, sh[2] - Math.cos(b) * ARM];
    };
    let gN = hang(0, betaN, 3.2);
    let gF = hang(1, betaF, 2.2);
    // the measured arm swing, about the rig's own hanging pose (the far arm is half a cycle on, mirrored)
    if (wa > 0.001) {
      for (let i = 0; i < 2; i++) {
        const sg = i === 0 ? 1 : -1;
        wristSwing(phi + 0.5 * i, this.wsw);
        const g = i === 0 ? gN : gF;
        const o: V3 = [fT[0] * this.wsw[0] + lT[0] * sg * this.wsw[1], fT[1] * this.wsw[0] + lT[1] * sg * this.wsw[1], this.wsw[2]];
        const gg: V3 = [g[0] + o[0] * wa, g[1] + o[1] * wa, g[2] + o[2] * wa];
        if (i === 0) gN = gg;
        else gF = gg;
      }
    }
    // together: the mittens clasped in front of the waist
    const wTog = this.wTog.v;
    if (wTog > 0.001) {
      const tg = (sg: number): V3 => along(10.5, sg * 2.4, 14.5 + 0.5 * Math.sin(this.clock * 1.45));
      gN = swing3(sh0, gN, tg(1), wTog);
      gF = swing3(sh1, gF, tg(-1), wTog);
    }
    // pushing: the mittens on the ball's far side, at its widest
    this.ballU = null;
    const wPu = this.wPush.v;
    const b = this.ball;
    if (b && wPu > 0.001) {
      const pl = this.pushPlan(b, S);
      const e = this.standDir(b);
      const cx = (b.x - gp.px) / S;
      const cz = (b.d - gp.pd) / S;
      const R = pl.R;
      const c: V3 = [cx, cz, R];
      this.ballU = { c, R };
      const lx = -e.d;
      const lz = e.x;
      for (let i = 0; i < 2; i++) {
        const sg = i === 0 ? 1 : -1;
        this.handsOnBall[i] = [cx - e.x * pl.hx + lx * sg * pl.off, cz - e.d * pl.hx + lz * sg * pl.off, R + pl.w];
      }
      gN = swing3(sh0, gN, this.handsOnBall[0], wPu);
      gF = swing3(sh1, gF, this.handsOnBall[1], wPu);
    }
    // cheering: both arms up in a V, the mittens shaking a little
    const wC = this.wCheer.v;
    if (wC > 0.001) {
      const up = (i: number): V3 => {
        const sg = i === 0 ? 1 : -1;
        const sh = this.shoulder[i]!;
        const wob = 2.2 * Math.sin(this.clock * 8 + i * 1.7);
        const dir = norm3([lT[0] * sg * 0.5 + fT[0] * 0.12, lT[1] * sg * 0.5 + fT[1] * 0.12, 0.86]);
        return [sh[0] + dir[0] * ARM * 0.97, sh[1] + dir[1] * ARM * 0.97, sh[2] + dir[2] * ARM * 0.97 + wob];
      };
      gN = swing3(sh0, gN, up(0), wC);
      gF = swing3(sh1, gF, up(1), wC);
    }
    // seated: the mittens rest on the thighs just above the knees
    const thigh = (i: number, k: number): V3 => {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      return [hip[0] + (kn[0] - hip[0]) * k, hip[1] + (kn[1] - hip[1]) * k, hip[2] + (kn[2] - hip[2]) * k + 5.5];
    };
    gN = swing3(sh0, gN, thigh(0, 19 / DIM.THIGH), wKnee);
    gF = swing3(sh1, gF, thigh(1, 22 / DIM.THIGH), wKnee);
    // a mitten never goes into the ball: pushed out to its surface (a hair outside it)
    const bu = this.ballU;
    if (bu) {
      const rr = bu.R + 3.4;
      const fix = (g: V3): V3 => {
        const dx = g[0] - bu.c[0];
        const dz = g[1] - bu.c[1];
        const dh = g[2] - bu.c[2];
        const d = Math.hypot(dx, dz, dh);
        if (d >= rr || d < 1e-4) return g;
        const k = rr / d;
        return [bu.c[0] + dx * k, bu.c[1] + dz * k, bu.c[2] + dh * k];
      };
      gN = fix(gN);
      gF = fix(gF);
    }
    // the elbows go back and down, a little out; each keeps the side it is on as the arm sweeps round
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
    // the scarf's tails stream behind: more when moving
    this.tailAng = 0.3 + 0.35 * sstep(this.speed.x / 60) - 0.5 * lean + 0.06 * Math.sin(this.clock * 3.1 + this.seed) * (1 - 0.5 * this.wWalk.v) + 0.04 * Math.sin(this.clock * 6.3);
    this.fx = gp.px + ho[0] * S;
    void lerp3;
  }

  /** the elbow hint for an arm: where it was, pulled toward the preferred side (back, down and a little out) */
  private armHint(i: number, fT: V3, lT: V3, k: number): V3 {
    const sg = i === 0 ? 1 : -1;
    const back = 0.45;
    const out = 0.2;
    const pref: V3 = norm3([-back * fT[0] + out * sg * lT[0], -back * fT[1] + out * sg * lT[1], -0.85]);
    if (k >= 1) return pref;
    return norm3(lerp3(this.elbowDir[i]!, pref, k));
  }

  /** debugging and tests: joints in world coordinates and foot contacts */
  debug(): Record<string, unknown> {
    const gp = this.gait;
    const S = this.S;
    const w = (u: V3): [number, number] => this.scr(u);
    const contacts = gp.feet.map((f: Foot) => {
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
      contacts,
      pelvis: [gp.px, KAPPA * gp.pd],
      ball: this.ballU ? { c: this.ballU.c, R: this.ballU.R } : null,
      gloveU: [this.glove[0], this.glove[1]],
      state: {
        turns: this.turnCount,
        seat: this.seat.v,
        yaw: this.yaw.v,
        wPush: this.wPush.v,
        wCheer: this.wCheer.v,
        walking: gp.walking,
        following: this.following,
        speed: gp.speed * KAPPA,
        speedG: gp.speed,
        reachErr: this.reachErr,
        pushing: this.pushing,
        lag: gp.followLag,
        slack: this.slack,
        lat: gp.followLat,
        feetStates: gp.feet.map((f: Foot) => f.state),
        lean: this.lean,
        px: gp.px,
        py: KAPPA * gp.pd,
        idealV: this.idealV,
      },
    };
  }

  /** debugging and tests: stand still facing `yaw` right now */
  debugFace(yaw: number): void {
    const gp = this.gait;
    this.yaw.snap(yaw);
    this.twist.snap(0);
    this.headYaw.snap(0);
    gp.stand(gp.px, gp.pd, yaw);
    this.snapElbows = true;
    this.solve();
  }

  /* ---------------------------------------------------------------- painting */

  private paint(ctx: CanvasRenderingContext2D): void {
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
    /** one of the painted views at a yaw: the nearest drawn whole, the next dissolving over it */
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
    // The arms sort against the torso by where they are round it, not by raw depth. Seen from above the torso is an
    // oval (TORSO_W across, TORSO_D front to back) turned to the torso's yaw; along any line of sight the middle of
    // the oval lies on one line, so a point is in front of the torso exactly when it is nearer than that line at its
    // own x. A limb beside the torso and about level with it is drawn over the torso's edge.
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
    // ---- the torso, head and scarf
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
    // ---- the legs: boot, shin, thigh
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
          // the boot hinges at the ankle: its foot pitches with the foot, its shaft stands along the shin
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
          // the trouser leg goes into the boot: thigh and shin first, then the boot over the shin's end
          bone(set.thigh, set.thighFar, hip, kn, DIM.THIGH, far, set.knee, 0.72);
          bone(set.shin, set.shinFar, kn, an, DIM.SHIN, far, null, 0);
          half(true, rotFoot);
          half(false, rotShaft);
        },
      });
    }
    // ---- the arms
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
  }
}

export const createClimber: CreateClimber = (id: StrategyId, spriteQ: number): Climber => {
  const g = new ClimberImpl(id, Math.max(1, spriteQ));
  const api: Climber & { debug(): Record<string, unknown>; debugFace(yaw: number): void } = {
    id,
    get pushing() {
      return g.pushing;
    },
    update: (dt, intent, tSec, reduced) => g.update(dt, intent, tSec, reduced),
    draw: (ctx) => g.draw(ctx),
    feet: () => g.feet(),
    place: (intent) => g.place(intent),
    debug: () => g.debug(),
    debugFace: (yaw) => g.debugFace(yaw),
  };
  return api;
};
