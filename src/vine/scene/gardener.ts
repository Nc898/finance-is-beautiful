/**
 * The two gardeners: a hand-painted jointed figure (parts cached as sprites, see gardenerArt.ts) driven by a
 * footstep gait (gardenerGait.ts) and a small director that turns the scene's intent into smooth action.
 *
 * The director keeps a handful of continuous quantities (facing yaw, seat, where the shears are, where the rake
 * is, how raised the arms are) and moves each along its own minimum-jerk or critically damped path, so an intent
 * that changes mid-action just re-aims them from wherever they are: nothing ever snaps. Things that must happen
 * in order are done in order: the arms come down before a walk, a turn only happens standing still with the feet
 * flat, the shears are pocketed before the rake is picked up, the rake is put back before sitting down.
 *
 * Kinematics: the legs are two-bone IK from the hip to the planted (or swinging) ankles, the hip as high as the
 * legs allow (so the pelvis bobs the way a walking person's does); the arms are two-bone IK to whatever the
 * hands must hold (the shears' cut point, the rake's two grips, the pocket, the knees, or a free swing).
 */
import type { PlanId } from '../types';
import type { CreateGardener, Gardener, GardenerIntent } from './gardenerApi';
import { BENCH, PATH_Y, PILE, REACH_SIDE, depthScale } from './geom';
import { DIM, ELBOW_CUT, FOREARM, RAKE, SEAT_HIP } from './gardenerDims';
import { buildGardenerSet, type GardenerSet, type Part, type Sprites } from './gardenerArt';
import { Gait, type Foot, type GaitGoal } from './gardenerGait';
import { Mover, Spring1, Spring2, clamp, hash1, ik2, lerp, lerpAngle, softMin, sstep, sstep5, type V2 } from './gardenerMath';

/* ------------------------------------------------------------------ layout (shared with the scene) */

const dirIn = (id: PlanId): 1 | -1 => (id === 'minimum' ? 1 : -1);

/** where a gardener stands to rake, and which way they face (away from the pile, so a pull sweeps toward it) */
export function rakeStation(id: PlanId): { x: number; y: number; face: 1 | -1 } {
  return { x: PILE[id].x + dirIn(id) * 52, y: PILE[id].y + 2, face: dirIn(id) };
}
/** the leaning rake: its head's heel on the ground at (x, y); the pole leans up and away from the gardener along `face` */
export function restingRake(id: PlanId): { x: number; y: number; face: 1 | -1; elevation: number } {
  const s = rakeStation(id);
  return { x: s.x + s.face * 22, y: s.y - 3, face: s.face, elevation: (96 * Math.PI) / 180 };
}
/** where the feet stand to sit (the hips end up on the bench centre), and which way they face (toward their own cottage) */
export function benchStand(id: PlanId): { x: number; y: number; face: 1 | -1 } {
  const face = id === 'minimum' ? -1 : 1;
  return { x: BENCH[id].x + face * 24, y: BENCH[id].y, face };
}
/** the height of the seat the gardener sits on, above BENCH.y (the hips rest this high plus a little) */
export const SEAT_TOP = SEAT_HIP - 3;

/* ------------------------------------------------------------------ constants */

const FAR_ROLL = 0.72;
const CROUCH_DROP = 22;
const SIT_BACK = 24;
const HOME_OFFSET = 40;
const SNIP_OPEN = 0.52;
const REST_ELEV = (96 * Math.PI) / 180;
const POCKET_FINAL: V2 = [DIM.POCKET.x, DIM.POCKET.y - 2];
const POCKET_HOLD: V2 = [DIM.POCKET.x, DIM.POCKET.y - 12];
/** the far hand's comfortable distance from the shoulder while it slides along the rake handle */
const GRIP_R = 31;

type Action = { kind: 'pocket' | 'draw' | 'grab' | 'put'; t: number; s: number };

interface RakePose {
  /** head joint (rig, ground level unless lifted) and pole elevation from horizontal toward the gardener */
  jx: number;
  jy: number;
  e: number;
  lean: number;
  shift: number;
}

const RAKE_FAR: RakePose = { jx: 46, jy: 0, e: (50 * Math.PI) / 180, lean: 0.16, shift: 3 };
const RAKE_NEAR: RakePose = { jx: 18, jy: 0, e: (72 * Math.PI) / 180, lean: -0.04, shift: -4 };

class GardenerImpl implements Gardener {
  readonly id: PlanId;
  snips = 0;
  strokes = 0;
  working = false;

  private readonly set: GardenerSet;
  private readonly gait: Gait;
  private readonly seed: number;

  // continuous quantities
  private readonly yaw = new Mover(0);
  private readonly seat = new Mover(0);
  private readonly wWalk = new Mover(0);
  private readonly wPrune = new Mover(0);
  private readonly wPocket = new Mover(0);
  private readonly kPocket = new Mover(0);
  private readonly wRake = new Mover(0);
  private readonly rakeK = new Mover(0);
  private readonly pull = new Mover(0);
  private readonly look = new Spring1(0);
  private readonly adTip = new Spring1(0);
  private readonly adCrouch = new Spring1(0);
  private readonly adLean = new Spring1(0);
  private readonly adShift = new Spring1(0);
  private readonly tip = new Spring2();
  private readonly speed = new Spring1(0);

  // director state
  private action: Action | null = null;
  private clock = 0;
  private inBand = false;
  private goal: GaitGoal | null = null;
  private faceWant: 0 | 1 | -1 = 0;
  private reducedSig = '';
  private glanceAt = 3;
  private glanceUntil = 0;
  private glanceN = 0;
  private lookTarget = 0;
  private crossAt = 7;
  private crossN = 0;
  private lastTarget: { x: number; y: number } | null = null;

  // snipping
  private blade = 0;
  private cyc: 'idle' | 'open' | 'hold' | 'close' | 'pause' = 'idle';
  private cycT = 0;
  private cycDur = 0;
  private holdExtra = 0;
  private recoil = 0;
  private pullT = 9;

  // raking
  private sPhase: 'dwell' | 'pull' | 'recover' = 'dwell';
  private sT = 0;
  private sDur = 0.5;

  // the solved pose (unit coordinates: relative to the hip's ground point, divided by the depth scale)
  private S = 1;
  private sx = 1;
  private sxd = 1;
  private m: 1 | -1 = 1;
  private hipX = 0;
  private hipY = -58;
  private knee: [V2, V2] = [[0, -30], [0, -30]];
  private ankle: [V2, V2] = [[0, -5], [0, -5]];
  private footA: [number, number] = [0, 0];
  private lean = 0;
  private breath = 1;
  private shoulder: V2 = [0, -95];
  private neck: V2 = [0, -98];
  private elbow: [V2, V2] = [[0, -70], [0, -70]];
  private glove: [V2, V2] = [[0, -50], [0, -50]];
  private armReach: [boolean, boolean] = [true, true];
  private tailAng = 0.3;
  private toolPivot: V2 = [0, 0];
  private toolAng = 0;
  private toolPocket = 0;
  private rakeJ: V2 = [0, 0];
  private rakeRot = 0;
  private cut: V2 = [0, 0];
  private fx = 0;
  private fy = 0;
  private frontA = 0;
  private reachOK = true;
  private pruneT: { x: number; y: number } | null = null;

  constructor(id: PlanId, q: number) {
    this.id = id;
    this.set = buildGardenerSet(id, q);
    this.seed = id === 'minimum' ? 11 : 23;
    const hx = (id === 'minimum' ? 1 : -1) * 0 + (id === 'minimum' ? 150 : 850);
    this.gait = new Gait(hx, PATH_Y);
    this.yaw.snap(dirIn(id) > 0 ? 0 : Math.PI);
    this.gait.stand(hx, PATH_Y, dirIn(id));
    void HOME_OFFSET;
    this.updateFacing();
    this.solve();
  }

  /* ---------------------------------------------------------------- the contract */

  update(dtSec: number, intent: GardenerIntent, _tSec: number, reduced: boolean): void {
    void _tSec;
    const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, 0.1);
    if (reduced) {
      const sig = `${intent.activity}|${intent.target ? `${Math.round(intent.target.x)},${Math.round(intent.target.y)}` : '-'}`;
      if (sig !== this.reducedSig) {
        this.reducedSig = sig;
        this.settle(intent);
      }
      this.solve();
      return;
    }
    if (this.reducedSig !== '') {
      // leaving reduced motion: carry on from the settled pose
      this.reducedSig = '';
    }
    const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, intent);
    this.solve();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.paint(ctx);
  }

  shears(): { x: number; y: number } {
    return { x: this.gait.px + this.cut[0] * this.S, y: this.gait.py + this.cut[1] * this.S };
  }

  feet(): { x: number; y: number } {
    return { x: this.fx, y: this.fy };
  }

  /** the rake head's world position while the rake is being used (null while it leans at rest) */
  rakeHead(): { x: number; y: number } | null {
    if (this.rakeK.v < 0.02) return null;
    return { x: this.gait.px + this.rakeJ[0] * this.sx * this.S, y: this.gait.py + this.rakeJ[1] * this.S };
  }

  /** the rake is in the gardener's hands (or being picked up or put down) */
  get rakeInHands(): boolean {
    return this.rakeK.v > 0.005 || this.wRake.v > 0.005;
  }

  /* ---------------------------------------------------------------- helpers */

  private updateFacing(): void {
    this.sx = Math.cos(this.yaw.v);
    this.m = this.sx >= 0 ? 1 : -1;
    const a = Math.abs(this.sx);
    this.sxd = this.m * Math.max(a, 0.24);
    this.frontA = sstep((0.72 - a) / 0.46);
  }

  private get still(): boolean {
    if (this.gait.walking) return false;
    for (const f of this.gait.feet) if (f.state !== 0) return false;
    return !this.yaw.moving && !this.action;
  }

  private armsDown(): boolean {
    return this.wPrune.v < 0.25 && this.wPocket.v < 0.02;
  }

  private startAction(kind: Action['kind']): void {
    this.action = { kind, t: 0, s: 0 };
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
      case 'pocket':
      case 'draw':
        step(1, 0, () => this.wPocket.go(1, 0.55));
        step(2, 0.66, () => this.kPocket.go(a.kind === 'pocket' ? 1 : 0, 0.32));
        step(3, 1.04, () => this.wPocket.go(0, 0.45));
        if (t >= 1.52) this.action = null;
        break;
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

  /* ---------------------------------------------------------------- the director */

  private step(h: number, it: GardenerIntent): void {
    this.clock += h;
    this.updateFacing();
    this.direct(h, it);
    // turning
    if (this.faceWant !== 0 && this.faceWant !== this.m && this.still && this.wPrune.v < 0.25 && this.gait.feet[0].tipRoll < 0.02 && this.seat.v < 0.004) {
      this.yaw.go(this.faceWant > 0 ? 0 : Math.PI, 0.62);
    }
    // advance the continuous quantities
    this.yaw.update(h);
    this.seat.update(h);
    this.wPrune.update(h);
    this.wPocket.update(h);
    this.kPocket.update(h);
    this.wRake.update(h);
    this.rakeK.update(h);
    this.pull.update(h);
    this.updateFacing();
    // walking (never while seated, mid-action, with the arms up, or turning)
    const allow =
      this.seat.v < 0.004 && !this.action && !this.yaw.moving && this.armsDown() && this.faceOk() && this.gait.feet[0].tipRoll < 0.02 && this.adTip.x < 0.03;
    const wasWalking = this.gait.walking;
    this.gait.update(h, this.goal, this.m, allow);
    void wasWalking;
    this.wWalk.go(this.gait.walking ? 1 : 0, 0.3);
    this.wWalk.update(h);
    this.speed.update(h, this.gait.speed, 12);
    // idle life: glances, an ankle cross while seated
    this.idleLife(h);
    this.snipping(h);
    this.raking(h);
    this.updateAdapt(h, it);
  }

  private faceOk(): boolean {
    return this.faceWant === 0 || this.faceWant === this.m || this.gait.walking;
  }

  private direct(h: number, it: GardenerIntent): void {
    const act = it.activity;
    this.goal = null;
    this.faceWant = 0;
    let pruneReady = false;
    this.pruneT = null;
    const gp = this.gait;

    if (this.action) {
      this.runAction(h);
      this.wPrune.go(0, 0.7);
      return;
    }

    // seated (or sitting down or standing up): stay in that business until it is done
    if (this.seat.v > 0.004 || this.seat.moving) {
      const sit = benchStand(this.id);
      const stay = act === 'rest' && this.kPocket.target > 0.5 && this.rakeK.target < 0.5 && Math.hypot(gp.px - sit.x, gp.py - sit.y) < 6;
      this.seat.go(stay ? 1 : 0, stay ? 1.25 : 1.15);
      this.wPrune.go(0, 0.7);
      return;
    }

    const wantShears = act === 'rake' || act === 'rest' ? 'pocket' : 'hand';
    const wantRake = act === 'rake' ? 'held' : 'rest';
    const rakeHeld = this.rakeK.target > 0.5;
    const pocketed = this.kPocket.target > 0.5;
    const st = rakeStation(this.id);

    // the arms come down for anything else but pruning
    if (act !== 'prune') this.wPrune.go(0, 0.7);

    if (rakeHeld && wantRake === 'rest') {
      // finish the stroke in progress first, so the rake never jumps back to rest
      if (this.goTo(st, st.face, 1.5) && this.still && this.sPhase === 'dwell') this.startAction('put');
      this.wPrune.go(0, 0.7);
      return;
    }
    if (!pocketed && wantShears === 'pocket') {
      this.wPrune.go(0, 0.7);
      if (this.still && this.wPrune.v < 0.05) this.startAction('pocket');
      return;
    }
    if (pocketed && wantShears === 'hand') {
      this.wPrune.go(0, 0.7);
      if (this.still) this.startAction('draw');
      return;
    }
    if (!rakeHeld && wantRake === 'held') {
      if (this.goTo(st, st.face, 1.5) && this.still) this.startAction('grab');
      return;
    }

    switch (act) {
      case 'rake': {
        // holding the rake: stay at the station
        this.goTo(st, st.face, 1.5);
        break;
      }
      case 'rest': {
        const sit = benchStand(this.id);
        if (this.goTo(sit, sit.face, 1.2) && this.still && this.wPrune.v < 0.05) this.seat.go(1, 1.25);
        break;
      }
      case 'prune': {
        pruneReady = this.directPrune(it);
        break;
      }
      case 'idle':
      default:
        break;
    }
    this.wPrune.go(pruneReady ? 1 : 0, pruneReady ? 0.8 : 0.7);
  }

  /** aim for a spot: returns true once there (within `tol`) and facing as asked */
  private goTo(spot: { x: number; y: number }, finalFace: 1 | -1, tol: number): boolean {
    const gp = this.gait;
    const d = Math.hypot(spot.x - gp.px, spot.y - gp.py);
    if (d > tol || gp.walking) {
      if (gp.walking) {
        this.goal = { x: spot.x, y: spot.y, spread: 3, minWalk: tol };
        this.faceWant = 0;
        return false;
      }
      const dx = spot.x - gp.px;
      const face: 1 | -1 = Math.abs(dx) > 0.12 * d ? (dx > 0 ? 1 : -1) : this.m;
      this.goal = { x: spot.x, y: spot.y, spread: 3, minWalk: tol };
      this.faceWant = face;
      return false;
    }
    this.faceWant = finalFace;
    return this.m === finalFace && !this.yaw.moving;
  }

  /** prune: the stand spot, facing and whether the arms may go up */
  private directPrune(it: GardenerIntent): boolean {
    const T = it.target;
    const gp = this.gait;
    if (!T) return false;
    this.pruneT = T;
    const m = this.m;
    const hT = gp.py - T.y;
    const hiF = sstep((hT - 100) / 60);
    const dd = lerp(26, 12, hiF);
    const hy = this.inBand ? 3 : -1;
    const bandMax = lerp(REACH_SIDE - 2, 24, hiF) + hy;
    const bandMin = -2 - (this.inBand ? 3 : 0);
    const onPath = Math.abs(gp.py - PATH_Y) < 2.5;
    let face: 1 | -1 = m;
    const fwd0 = (T.x - gp.px) * m;
    if (!gp.walking && fwd0 < bandMin) face = (-m) as 1 | -1;
    const fwd = (T.x - gp.px) * face;
    const inBand = fwd >= bandMin && fwd <= bandMax && onPath;
    this.inBand = inBand;
    if (gp.walking) {
      // keep heading for the (possibly moving) spot
      this.goal = { x: this.spotX(T.x, m, dd, bandMax, bandMin), y: PATH_Y, spread: 3 };
      return false;
    }
    if (fwd >= bandMin && fwd <= bandMax && onPath) {
      // in reach: turn if needed, then reach
      this.faceWant = face;
      // the arms may start up from rest, and once on their way up they keep going (no rise-and-drop loop)
      return face === m && this.still && !this.yaw.moving && (this.armsDown() || this.wPrune.target > 0.5);
    }
    // out of reach (or off the path): walk to a spot in reach
    const sxg = this.spotX(T.x, face, dd, bandMax, bandMin, gp.px, gp.py);
    this.goal = { x: sxg, y: PATH_Y, spread: 3 };
    const dx = sxg - gp.px;
    const wf: 1 | -1 = Math.abs(dx) > 1 ? (dx > 0 ? 1 : -1) : face;
    this.faceWant = wf;
    return false;
  }

  /** the x to stand at for a target ahead along `face`, choosing a slanted path when the walk is mostly across */
  private spotX(tx: number, face: number, dd: number, bandMax: number, bandMin: number, px = this.gait.px, py = this.gait.py): number {
    const ideal = tx - face * dd;
    const dy = Math.abs(PATH_Y - py);
    if (dy < 1) return ideal;
    // anywhere in the band will do: pick the end of it nearest to a walk that is not mostly vertical
    const near = tx - face * (bandMin + 3);
    const far = tx - face * (bandMax - 3);
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    const want = px + face * Math.max(dy * 0.9, 8);
    return clamp(want, lo, hi);
  }

  /* ---------------------------------------------------------------- idle life */

  private idleLife(h: number): void {
    // glance up at the vine now and then (when standing or sitting still)
    const calm = !this.gait.walking && !this.action && this.wPrune.v < 0.05 && this.wRake.v < 0.05;
    if (this.clock >= this.glanceAt && calm) {
      this.glanceN++;
      this.glanceUntil = this.clock + 1.3 + 0.5 * (hash1(this.glanceN, this.seed) * 0.5 + 0.5);
      this.glanceAt = this.glanceUntil + 3.5 + 4.5 * (hash1(this.glanceN + 50, this.seed) * 0.5 + 0.5);
      this.lookTarget = -0.34 - 0.08 * hash1(this.glanceN + 9, this.seed);
    }
    if (this.clock >= this.glanceUntil) this.lookTarget = 0;
    if (!calm) this.lookTarget = 0;
    let tgt = this.lookTarget;
    // pruning: look at the work
    if (this.wPrune.v > 0.02 && this.pruneT) {
      const ang = Math.atan2(this.gait.py - this.pruneT.y - 108, Math.max(6, (this.pruneT.x - this.gait.px) * this.m));
      tgt = lerp(tgt, -clamp(ang * 0.7, -0.15, 0.7), this.wPrune.v);
    }
    this.look.update(h, tgt, 7);
    // seated: now and then one ankle swings across the other
    if (this.seat.v > 0.995 && !this.action && this.clock >= this.crossAt) {
      this.crossN++;
      this.crossAt = this.clock + 6 + 5 * (hash1(this.crossN, this.seed + 3) * 0.5 + 0.5);
      const f = this.gait.feet[this.crossN % 2]!;
      if (f.state === 0 && this.gait.feet[1 - (this.crossN % 2)]!.state === 0) {
        const sit = benchStand(this.id);
        const sign = this.crossN % 4 < 2 ? 1 : -1;
        f.begin(f.ax - sit.face * 7 * sign, f.ay, 0.2, 0.55);
      }
    }
  }

  /* ---------------------------------------------------------------- snipping and raking */

  private snipping(h: number): void {
    const target = this.pruneT;
    const gp = this.gait;
    const ready = this.wPrune.v > 0.97 && !!target && this.still && this.reachOK && this.kPocket.v < 0.02 && this.inBand;
    this.working = ready;
    // the tip follows the target when the arm is engaged
    if (target) {
      if (this.wPrune.v < 0.03 || !this.lastTarget) this.tip.snap(target.x, target.y);
      // the hand moves to a new spot only when it is in reach; otherwise it stays put while the arm comes down
      else if (this.inBand) this.tip.update(h, target.x, target.y, 11);
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
        this.blade = 1;
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
    void gp;
  }

  /** the scene sets the pace through the intent; kept here so `snipping` can read it */
  pace = 0;

  private rakePoseAt(ph: 'dwell' | 'pull' | 'recover', u: number): RakePose {
    if (ph === 'dwell') return RAKE_FAR;
    const mix = (a: RakePose, b: RakePose, t: number, lift: number): RakePose => ({
      jx: lerp(a.jx, b.jx, t),
      jy: -lift,
      e: lerp(a.e, b.e, t) + (lift > 0 ? 0.1 * Math.sin(Math.PI * u) : 0),
      lean: lerp(a.lean, b.lean, t),
      shift: lerp(a.shift, b.shift, t),
    });
    if (ph === 'pull') return mix(RAKE_FAR, RAKE_NEAR, sstep(u), 0);
    return mix(RAKE_NEAR, RAKE_FAR, sstep(u), 7 * Math.pow(Math.sin(Math.PI * u), 0.8));
  }

  private raking(h: number): void {
    const active = this.rakeK.v > 0.99 && this.wRake.v > 0.99 && this.still && !this.action;
    const midStroke = this.sPhase !== 'dwell';
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
      if (pace > 0.05 && this.sT >= this.sDur) {
        this.sPhase = 'pull';
        this.sT = 0;
        this.sDur = clamp(0.4 / pace, 0.36, 0.8);
      }
    } else if (this.sPhase === 'pull') {
      if (this.sT >= this.sDur) {
        this.strokes++;
        this.sPhase = 'recover';
        this.sT = 0;
        this.sDur = clamp(0.36 / pace, 0.32, 0.7);
      }
    } else if (this.sT >= this.sDur) {
      this.sPhase = 'dwell';
      this.sT = 0;
      this.sDur = Math.max(0.05, 1 / Math.max(pace, 0.05) - 0.4 / Math.max(pace, 0.05) - 0.36 / Math.max(pace, 0.05));
      if (pace <= 0.05) this.sDur = 0.2;
    }
  }

  /* ---------------------------------------------------------------- body adaptation (reach) */

  private currentRakePose(): RakePose {
    const u = this.sDur > 0 ? clamp(this.sT / this.sDur, 0, 1) : 1;
    return this.rakePoseAt(this.sPhase, u);
  }

  private adaptTargets(it: GardenerIntent): { tip: number; crouch: number; lean: number; shift: number } {
    const out = { tip: 0, crouch: 0, lean: 0, shift: 0 };
    const S = this.S;
    if (it.activity === 'prune' && this.pruneT && this.wPrune.target > 0.5) {
      const T = this.pruneT;
      const hT = (this.gait.py - T.y) / S;
      const fx = ((T.x - this.gait.px) * this.m) / S;
      out.tip = sstep((hT - 112) / 44);
      out.crouch = sstep((72 - hT) / 38);
      out.lean = 0.05 + 0.32 * out.crouch + 0.1 * sstep((fx - 24) / 22);
      out.shift = clamp(0.1 * fx, 0, 5);
    } else if (this.wRake.target > 0.5 || this.rakeK.v > 0.01) {
      // the rake: how far the lower hand has to reach
      const k = this.rakeK.v;
      const rp = this.currentRakePose();
      const J = lerp(this.restRelRig().jx, rp.jx, k);
      const e = lerp(REST_ELEV, rp.e, k);
      const lowX = J - Math.cos(e) * RAKE.LOW;
      const lowY = -Math.sin(e) * RAKE.LOW;
      const d = Math.hypot(lowX - 2, lowY + 94);
      const ex = clamp((d - 40) / 12, 0, 1);
      out.crouch = 0.4 * sstep(ex);
      out.lean = 0.35 * sstep((d - 36) / 18) * 0.5 + lerp(0, rp.lean, k);
      out.shift = lerp(0, rp.shift, k);
    }
    return out;
  }

  private updateAdapt(h: number, it: GardenerIntent): void {
    const t = this.adaptTargets(it);
    this.adTip.update(h, t.tip, 9);
    this.adCrouch.update(h, t.crouch, 9);
    this.adLean.update(h, t.lean, 9);
    this.adShift.update(h, t.shift, 9);
    this.gait.setTip(this.adTip.x * FAR_ROLL);
  }

  /* ---------------------------------------------------------------- reduced motion */

  private settle(it: GardenerIntent): void {
    const act = it.activity;
    const gp = this.gait;
    this.action = null;
    this.working = false;
    const pocket = act === 'rake' || act === 'rest';
    this.kPocket.snap(pocket ? 1 : 0);
    this.wPocket.snap(0);
    this.rakeK.snap(act === 'rake' ? 1 : 0);
    this.wRake.snap(act === 'rake' ? 1 : 0);
    this.seat.snap(act === 'rest' ? 1 : 0);
    this.wPrune.snap(0);
    this.wWalk.snap(0);
    this.pull.snap(0);
    this.look.snap(0);
    this.sPhase = 'dwell';
    this.sT = 0;
    this.cyc = 'idle';
    this.recoil = 0;
    this.blade = 0;
    let x = gp.px;
    let y = gp.py;
    let face: 1 | -1 = this.m;
    if (act === 'rest') {
      const s = benchStand(this.id);
      x = s.x;
      y = s.y;
      face = s.face;
    } else if (act === 'rake') {
      const s = rakeStation(this.id);
      x = s.x;
      y = s.y;
      face = s.face;
    } else if (act === 'prune' && it.target) {
      const T = it.target;
      const hT = PATH_Y - T.y;
      const hiF = sstep((hT - 100) / 60);
      const dd = lerp(26, 12, hiF);
      const fwd = (T.x - gp.px) * face;
      const bandMax = lerp(REACH_SIDE - 2, 24, hiF);
      if (!(fwd >= -2 && fwd <= bandMax && Math.abs(gp.py - PATH_Y) < 2.5)) {
        if (fwd < -2 && (T.x - gp.px) * -face >= -2 && (T.x - gp.px) * -face <= bandMax && Math.abs(gp.py - PATH_Y) < 2.5) face = (-face) as 1 | -1;
        else {
          if (fwd < -2) face = (-face) as 1 | -1;
          x = T.x - face * dd;
          y = PATH_Y;
        }
      }
      this.wPrune.snap(1);
      this.pruneT = T;
      this.tip.snap(T.x, T.y);
      this.lastTarget = T;
      this.inBand = true;
      this.blade = 0.4;
    }
    this.yaw.snap(face > 0 ? 0 : Math.PI);
    this.updateFacing();
    gp.stand(x, y, face);
    this.S = depthScale(y);
    this.gait.px = x;
    this.gait.py = y;
    this.pace = 0;
    const t = this.adaptTargets(it);
    this.adTip.snap(t.tip);
    this.adCrouch.snap(t.crouch);
    this.adLean.snap(t.lean);
    this.adShift.snap(t.shift);
    gp.setTip(t.tip * FAR_ROLL);
    for (const f of gp.feet) f.place(f.ax, f.ay);
    for (const f of gp.feet) f.update(0, this.m);
  }

  /* ---------------------------------------------------------------- the pose */

  private solve(): void {
    const gp = this.gait;
    const S = depthScale(gp.py);
    this.S = S;
    this.updateFacing();
    const sx = this.sx;
    const m = this.m;
    const sigma = this.seat.v;
    // the weight shift and lean
    const calm = 1 - this.wWalk.v;
    const idleShift = 0.7 * Math.sin(this.clock * 0.55 + this.seed) * calm + 0.3 * Math.sin(this.clock * 1.31 + 2) * calm;
    const rp = this.currentRakePose();
    const rk = this.rakeK.v * this.wRake.v;
    const shift = this.adShift.x + idleShift * (1 - this.wPrune.v) * (1 - sigma) * (1 - rk) + 0 * rp.shift;
    const sitBack = SIT_BACK * sstep(sigma / 0.8);
    const hipXrig = shift - sitBack;
    const hipX = hipXrig * sx;
    // the hip as high as the planted legs allow
    let H0 = 1e9;
    for (const f of gp.feet) {
      const ax = (f.x - gp.px) / S;
      const ay = (f.y - gp.py) / S - f.z;
      const dx = ax - hipX;
      const reach = Math.sqrt(Math.max(1, DIM.LMAX * DIM.LMAX - dx * dx));
      const need = -ay + reach;
      H0 = H0 > 1e8 ? need : softMin(H0, need, 1.2);
    }
    const crouch = this.adCrouch.x * CROUCH_DROP;
    const fy = sstep5(clamp((sigma - 0.1) / 0.9, 0, 1));
    const H = lerp(H0 - crouch, SEAT_HIP, fy);
    this.hipX = hipX;
    this.hipY = -H;
    // the legs
    const kneeRig: [V2, V2] = [[0, 0], [0, 0]];
    const tmp = { jx: 0, jy: 0, ex: 0, ey: 0, reach: true };
    for (let i = 0; i < 2; i++) {
      const f = gp.feet[i]!;
      const ax = (f.x - gp.px) / S;
      const ay = (f.y - gp.py) / S - f.z;
      ik2(hipX, -H, ax, ay, DIM.THIGH, DIM.SHIN, -1, tmp, sx);
      this.knee[i] = [tmp.jx, tmp.jy];
      this.ankle[i] = [tmp.ex, tmp.ey];
      this.footA[i] = f.a;
      kneeRig[i] = [(tmp.jx - hipX) * m, tmp.jy + H];
    }
    // the torso
    const walkLean = 0.05 + 0.08 * sstep(this.speed.x / 70);
    const sitLean = 0.42 * Math.sin(Math.PI * clamp(sigma / 0.75, 0, 1)) - 0.1 * sstep((sigma - 0.75) / 0.25);
    const lean = walkLean * this.wWalk.v + 0.03 * (1 - this.wWalk.v) + this.adLean.x + sitLean + rk * 0 + 0.02 * Math.sin(this.clock * 0.9) * calm;
    this.lean = lean;
    const br = 1 + 0.011 * Math.sin(this.clock * 1.45 + this.seed) * (1 - 0.7 * this.wWalk.v);
    this.breath = br;
    const cl = Math.cos(lean);
    const sl = Math.sin(lean);
    const hipR: V2 = [hipXrig, -H];
    const shoulder: V2 = [hipR[0] + cl + DIM.SHOULDER * sl, hipR[1] + sl - DIM.SHOULDER * cl * br - 0.3 * (br - 1) * 20];
    this.shoulder = shoulder;
    this.neck = [hipR[0] + DIM.TORSO * sl, hipR[1] - DIM.TORSO * cl * br];
    // ----- the arms: a target for each glove, blended from a free swing by what the hands are doing
    const wPrune = sstep5(this.wPrune.v);
    const wPocket = this.wPocket.v;
    const wRake = this.wRake.v;
    const wKnee = sstep((sigma - 0.45) / 0.45);
    // free swing: opposite to the leg on the same side
    const swingK = this.wWalk.v;
    const fN = gp.feet[0]!;
    const fF = gp.feet[1]!;
    const relN = ((fN.x - gp.px) * m) / S - shift;
    const relF = ((fF.x - gp.px) * m) / S - shift;
    const carry = 1 - this.kPocket.v;
    const betaN = clamp(relF / 17, -1, 1) * 0.62 * swingK * lerp(1, 0.38, carry);
    const betaF = clamp(relN / 17, -1, 1) * 0.62 * swingK;
    const ARM = 41;
    const hang = (beta: number, bias: number): V2 => [shoulder[0] + Math.sin(beta + lean * 0.3) * ARM + bias, shoulder[1] + Math.cos(beta + lean * 0.3) * ARM];
    let gN = hang(betaN, 3.2 + 3 * carry);
    let gF = hang(betaF, 2.2);
    // seated: hands rest on the thighs just above the knees
    const thigh = (i: number, k: number): V2 => {
      const kr = kneeRig[i]!;
      return [hipR[0] + kr[0] * k, hipR[1] + (kr[1] + 0) * k - 5.5];
    };
    // pruning
    const tipRig: V2 = this.tipRig();
    const T = ik2tool(shoulder, tipRig);
    const gPruneN: V2 = T.glove;
    const pull = this.pull.v;
    const recoilOff = -this.recoil * 2.6;
    void recoilOff;
    const freeX = tipRig[0] - 5 - 2 * pull;
    const freeY = tipRig[1] + 13 + 9 * pull;
    // the pocket
    const cT = Math.cos(lean);
    const sT = Math.sin(lean);
    const torsoPt = (p: V2): V2 => [hipR[0] + p[0] * cT - p[1] * sT, hipR[1] + p[0] * sT + p[1] * cT];
    const dP: V2 = [sT * -1 + 0.12 * cT, cT + 0.12 * sT];
    const dPn = Math.hypot(dP[0], dP[1]);
    dP[0] /= dPn;
    dP[1] /= dPn;
    const pocketFinal = torsoPt(POCKET_FINAL);
    const pocketHold = torsoPt(POCKET_HOLD);
    const gPocket: V2 = [pocketHold[0] - dP[0] * DIM.PIV, pocketHold[1] - dP[1] * DIM.PIV];
    // the rake
    const kk = this.rakeK.v;
    const rest = this.restRelRig();
    const J: V2 = [lerp(rest.jx, rp.jx, kk), lerp(rest.jy, rp.jy, kk)];
    const e = lerp(REST_ELEV, rp.e, kk);
    const pdx = -Math.cos(e);
    const pdy = -Math.sin(e);
    const gLow: V2 = [J[0] + pdx * RAKE.LOW, J[1] + pdy * RAKE.LOW];
    const gHigh: V2 = [J[0] + pdx * RAKE.HIGH, J[1] + pdy * RAKE.HIGH];
    this.rakeJ = J;
    this.rakeRot = Math.atan2(pdy, pdx);
    // blend (order: later wins by weight)
    const mixV = (a: V2, b: V2, t: number): V2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    // a hand's target swings round the shoulder (angle and distance blended), the way an arm lifts: a straight
    // blend would cut past the shoulder, where the elbow's bend is unstable and would whip round in a frame
    const swingTo = (a: V2, b: V2, t: number): V2 => {
      if (t <= 0) return a;
      if (t >= 1) return b;
      const ax = a[0] - shoulder[0];
      const ay = a[1] - shoulder[1];
      const bx = b[0] - shoulder[0];
      const by = b[1] - shoulder[1];
      const ang = lerpAngle(Math.atan2(ay, ax), Math.atan2(by, bx), t);
      const r = lerp(Math.hypot(ax, ay), Math.hypot(bx, by), t);
      return [shoulder[0] + Math.cos(ang) * r, shoulder[1] + Math.sin(ang) * r];
    };
    gN = swingTo(gN, gPocket, wPocket);
    gN = swingTo(gN, gPruneN, wPrune);
    gN = swingTo(gN, gLow, wRake);
    gN = swingTo(gN, thigh(0, 19 / DIM.THIGH), wKnee);
    gF = swingTo(gF, [freeX, freeY], wPrune);
    // the far hand slides along the handle, as a raker's does: it grips where the pole passes a comfortable arm's
    // length from the shoulder (never at a fixed point that would drag the hand past the shoulder and flip the elbow)
    const slideGrip = (): V2 => {
      const vx = J[0] - shoulder[0];
      const vy = J[1] - shoulder[1];
      const vd = vx * pdx + vy * pdy;
      const disc = vd * vd - (vx * vx + vy * vy - GRIP_R * GRIP_R);
      const t = clamp(disc >= 0 ? -vd + Math.sqrt(disc) : -vd, RAKE.LOW + 6, RAKE.HIGH + 12);
      return [J[0] + pdx * t, J[1] + pdy * t];
    };
    // picking the rake up (or setting it down), the near hand does the lifting while the pole swings from leaning
    // to the raking angle; the far hand takes the handle only once it is nearly there (it would otherwise be
    // dragged through the shoulder as the pole tips over)
    const farGrip = wRake * sstep((kk - 0.72) / 0.26);
    gF = swingTo(gF, farGrip > 0.001 ? slideGrip() : gHigh, farGrip);
    gF = swingTo(gF, thigh(1, 22 / DIM.THIGH), wKnee);
    // IK for the two arms
    const armOut = { jx: 0, jy: 0, ex: 0, ey: 0, reach: true };
    ik2(shoulder[0], shoulder[1], gN[0], gN[1], DIM.UA, FOREARM, 1, armOut);
    this.elbow[0] = [armOut.jx, armOut.jy];
    this.glove[0] = [armOut.ex, armOut.ey];
    this.armReach[0] = armOut.reach;
    ik2(shoulder[0], shoulder[1], gF[0], gF[1], DIM.UA, FOREARM, 1, armOut);
    this.elbow[1] = [armOut.jx, armOut.jy];
    this.glove[1] = [armOut.ex, armOut.ey];
    this.armReach[1] = armOut.reach;
    // reachable for the cut: the prune arm chain reaches the tip
    this.reachOK = T.reach;
    // ----- the shears
    const fa = Math.atan2(this.glove[0][1] - this.elbow[0][1], this.glove[0][0] - this.elbow[0][0]);
    const delta = lerp(0.3, 0, wPrune);
    const aPocket = Math.atan2(dP[1], dP[0]);
    const aHand = lerpAngle(fa + delta, aPocket, wPocket);
    const gl = this.glove[0];
    const pivotHand: V2 = [gl[0] + Math.cos(aHand) * DIM.PIV, gl[1] + Math.sin(aHand) * DIM.PIV];
    const kp = sstep(this.kPocket.v);
    this.toolPocket = kp;
    this.toolPivot = mixV(pivotHand, pocketFinal, kp);
    this.toolAng = lerpAngle(aHand, aPocket, kp);
    const cutR: V2 = [this.toolPivot[0] + Math.cos(this.toolAng) * DIM.CUT, this.toolPivot[1] + Math.sin(this.toolAng) * DIM.CUT];
    this.cut = [cutR[0] * sx, cutR[1]];
    // ----- the head
    // the tails stream behind: more when moving
    this.tailAng = 0.3 + 0.35 * sstep(this.speed.x / 60) - 0.5 * lean + 0.06 * Math.sin(this.clock * 3.1 + this.seed) * (1 - 0.5 * this.wWalk.v) + 0.04 * Math.sin(this.clock * 6.3);
    // where the gardener is, for the scene
    this.fx = gp.px + hipX * S;
    this.fy = gp.py;
  }

  /** the resting rake's head joint in rig coordinates for the gardener standing here (relative to the hip's ground point) */
  private restRelRig(): { jx: number; jy: number } {
    const r = restingRake(this.id);
    return { jx: ((r.x - this.gait.px) * this.m) / this.S, jy: (r.y - this.gait.py) / this.S };
  }

  /** the tip's tracked position in rig coordinates */
  private tipRig(): V2 {
    const S = this.S;
    const gp = this.gait;
    let x = ((this.tip.x - gp.px) / S) * this.m;
    let y = (this.tip.y - gp.py) / S;
    // the hand recoils a little against the cut
    x -= this.recoil * 2.2;
    y += this.recoil * 0.8;
    return [x, y];
  }

  /** debugging and tests: joints in world coordinates and foot contacts */
  debug(): Record<string, unknown> {
    const S = this.S;
    const gp = this.gait;
    const w = (p: V2): V2 => [gp.px + p[0] * S, gp.py + p[1] * S];
    const rig = (p: V2): V2 => [gp.px + p[0] * this.sx * S, gp.py + p[1] * S];
    const contacts = gp.feet.map((f: Foot) => {
      // rendered heel and toe points, from the ankle and the foot angle
      const a = f.a;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const pt = (ox: number, oy: number): V2 => [f.x + this.m * (ox * c - oy * s), f.y - f.z + (ox * s + oy * c)];
      return { grounded: f.grounded, heel: pt(DIM.HEEL, DIM.FH), toe: pt(DIM.TOE, DIM.FH), ankle: [f.x, f.y - f.z] as V2, gy: f.y, state: f.state };
    });
    return {
      hip: w([this.hipX, this.hipY]),
      knees: [w(this.knee[0]), w(this.knee[1])],
      ankles: [w(this.ankle[0]), w(this.ankle[1])],
      shoulder: rig(this.shoulder),
      elbows: [rig(this.elbow[0]), rig(this.elbow[1])],
      gloves: [rig(this.glove[0]), rig(this.glove[1])],
      neck: rig(this.neck),
      cut: this.shears(),
      toolPivot: rig(this.toolPivot),
      rakeJ: rig(this.rakeJ),
      contacts,
      pelvis: [gp.px, gp.py],
      state: { seat: this.seat.v, yaw: this.yaw.v, wPrune: this.wPrune.v, kPocket: this.kPocket.v, rakeK: this.rakeK.v, wRake: this.wRake.v, walking: gp.walking, action: this.action?.kind ?? null, working: this.working, blade: this.blade, speed: gp.speed, reachOK: this.reachOK, inBand: this.inBand, feetStates: gp.feet.map((f: Foot) => f.state), yawMoving: this.yaw.moving, faceWant: this.faceWant, m: this.m, sPhase: this.sPhase, still: this.still, px: gp.px, py: gp.py },
    };
  }

  /* ---------------------------------------------------------------- painting */

  private paint(ctx: CanvasRenderingContext2D): void {
    const gp = this.gait;
    const S = this.S;
    const set = this.sx >= 0 ? this.set.R : this.set.L;
    const sx = this.sx;
    const sxd = this.sxd;
    const m = this.m;
    const base = ctx.getTransform();
    ctx.save();
    // a rake leaning at rest is drawn first, behind the figure
    const rest = restingRake(this.id);
    const restSet = rest.face > 0 ? this.set.R : this.set.L;
    if (this.rakeK.v < 0.005 && this.wRake.v < 0.005) this.drawRakeRest(ctx, restSet, rest);
    ctx.translate(gp.px, gp.py);
    ctx.scale(S, S);
    const fig = ctx.getTransform();
    const put = (p: Part, x: number, y: number, a: number, sy = 1) => {
      ctx.setTransform(fig);
      ctx.translate(x, y);
      ctx.scale(sxd, 1);
      ctx.rotate(a);
      if (sy !== 1) ctx.scale(1, sy);
      ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
    };
    // world-space limb bone: the joint (X, Y) and a vector (dx, dy) in the unit world frame
    const bone = (p: Part, X: number, Y: number, dx: number, dy: number) => put(p, X, Y, Math.atan2(dy, m * dx));
    const rigBone = (p: Part, a: V2, b: V2) => put(p, a[0] * sx, a[1], Math.atan2(b[1] - a[1], b[0] - a[0]));
    // far-side first: tails, far arm, far leg
    const hip: V2 = [this.hipX, this.hipY];
    const neckAng = this.lean;
    const tail = set.tails;
    put(tail, this.neck[0] * sx - Math.cos(neckAng) * 1.2 * sx, this.neck[1] + Math.sin(neckAng) * 0.5, this.tailAng + this.lean * 0.0);
    // far arm
    rigBone(set.upperFar, this.shoulder, this.elbow[1]);
    rigBone(set.foreFar, this.elbow[1], this.glove[1]);
    // legs: far (1) then near (0)
    for (const i of [1, 0]) {
      const thigh = i ? set.thighFar : set.thigh;
      const shin = i ? set.shinFar : set.shin;
      const boot = i ? set.bootFar : set.boot;
      const k = this.knee[i]!;
      const an = this.ankle[i]!;
      ctx.setTransform(fig);
      // boot (under the trouser cuff)
      put(boot, an[0], an[1], this.footA[i]!);
      if (this.frontA > 0.01) {
        ctx.globalAlpha = this.frontA;
        put(set.bootFront, an[0], an[1], 0);
        ctx.globalAlpha = 1;
      }
      bone(shin, k[0], k[1], an[0] - k[0], an[1] - k[1]);
      bone(thigh, hip[0], hip[1], k[0] - hip[0], k[1] - hip[1]);
    }
    // the rake held in the hands passes behind the near arm and in front of the body
    // torso
    const tr = (p: Part, alpha = 1) => {
      ctx.setTransform(fig);
      ctx.translate(hip[0], hip[1]);
      ctx.scale(sxd, 1);
      ctx.rotate(this.lean);
      ctx.scale(1, this.breath);
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
      ctx.globalAlpha = 1;
    };
    tr(set.torso);
    if (this.frontA > 0.01) {
      ctx.setTransform(fig);
      ctx.translate(hip[0], hip[1]);
      ctx.rotate(this.lean);
      ctx.scale(1, this.breath);
      ctx.globalAlpha = this.frontA;
      ctx.drawImage(set.torsoFront.cv, -set.torsoFront.px, -set.torsoFront.py, set.torsoFront.w, set.torsoFront.h);
      ctx.globalAlpha = 1;
    }
    // head
    {
      const a = this.lean * 0.4 + this.look.x;
      put(set.head, this.neck[0] * sx, this.neck[1], a);
      if (this.frontA > 0.01) {
        ctx.setTransform(fig);
        ctx.translate(this.neck[0] * sx, this.neck[1]);
        ctx.rotate(a);
        ctx.globalAlpha = this.frontA;
        ctx.drawImage(set.headFront.cv, -set.headFront.px, -set.headFront.py, set.headFront.w, set.headFront.h);
        ctx.globalAlpha = 1;
      }
    }
    // the shears (in the pocket they are clipped at its mouth) and the rake in hand
    this.drawShears(ctx, fig, set, hip);
    if (this.rakeK.v > 0.005 || this.wRake.v > 0.005) {
      put(set.rake, this.rakeJ[0] * sx, this.rakeJ[1], this.rakeRot);
    }
    // near arm
    rigBone(set.upper, this.shoulder, this.elbow[0]);
    rigBone(set.fore, this.elbow[0], this.glove[0]);
    ctx.restore();
    ctx.setTransform(base);
  }

  private drawShears(ctx: CanvasRenderingContext2D, fig: DOMMatrix, set: Sprites, hip: V2): void {
    const sx = this.sx;
    const sxd = this.sxd;
    const open = this.blade * SNIP_OPEN;
    const kp = this.toolPocket;
    const piv = this.toolPivot;
    ctx.save();
    if (kp > 0.001) {
      // slide the clip's lower edge up to the pocket's mouth as the shears go in
      ctx.setTransform(fig);
      ctx.translate(hip[0], hip[1]);
      ctx.scale(sxd, 1);
      ctx.rotate(this.lean);
      const yClip = lerp(40, DIM.POCKET.y, kp);
      ctx.beginPath();
      ctx.rect(-30, -90, 60, yClip + 90);
      ctx.clip();
    }
    const draw = (p: Part, ang: number) => {
      ctx.setTransform(fig);
      ctx.translate(piv[0] * sx, piv[1]);
      ctx.scale(sxd, 1);
      ctx.rotate(this.toolAng + ang);
      ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
    };
    draw(set.shearsB, -open);
    draw(set.shearsA, 0);
    ctx.restore();
  }

  private drawRakeRest(ctx: CanvasRenderingContext2D, set: Sprites, r: { x: number; y: number; face: 1 | -1; elevation: number }): void {
    const S = depthScale(r.y);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(S * r.face, S);
    ctx.rotate(Math.atan2(-Math.sin(r.elevation), -Math.cos(r.elevation)));
    const p = set.rake;
    ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
    ctx.restore();
  }
}

/** two-bone IK for the shears' cut point from a shoulder: where the glove ends up (in rig coordinates) */
function ik2tool(shoulder: V2, tipRig: V2): { glove: V2; reach: boolean } {
  const o = { jx: 0, jy: 0, ex: 0, ey: 0, reach: true };
  ik2(shoulder[0], shoulder[1], tipRig[0], tipRig[1], DIM.UA, ELBOW_CUT, 1, o);
  const dx = o.ex - o.jx;
  const dy = o.ey - o.jy;
  const l = Math.hypot(dx, dy) || 1;
  return { glove: [o.jx + (dx / l) * FOREARM, o.jy + (dy / l) * FOREARM], reach: o.reach };
}

export const createGardener: CreateGardener = (id: PlanId, spriteQ: number): Gardener => {
  const g = new GardenerImpl(id, Math.max(1, spriteQ));
  const api: Gardener & { rakeHead(): { x: number; y: number } | null; debug(): Record<string, unknown> } = {
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
    debug: () => g.debug(),
  };
  return api;
};

