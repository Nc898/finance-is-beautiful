/**
 * The grocer's body: the orchard pickers' figure (src/orchard/scene/pickerFigure.ts), which is Brick by Brick's crew
 * figure with the CMU-fitted walk (a real 3D skeleton drawn in the world's oblique projection, parts cached as sprites,
 * driven by the climber's footstep gait). Copied rather than imported because the pickers' figure paints itself from
 * the pickers' costumes and their depth scale; the changes here:
 * - one size everywhere (an interior: he stands on one floor line), GROCER_H tall;
 * - the shoulders lift as an arm reaches overhead (for the year at the top of the board), and a side-step, for moving
 *   along the board while still facing it;
 * - what his hands hold: the chalk in his right hand, the tea towel in his left or over his left shoulder;
 * - the room's light glazed over him as he is drawn (the lamps' warm pools, the window's cool from the left, the
 *   violet-brown shade: the same glaze the room is painted with, light.ts), through a pose cache that repaints only
 *   when the pose visibly changes; and the lit picture can be laid again over the counter where his forearms reach
 *   across it (layer 4 in geom.ts).
 *
 * Hand 0 is his right hand (facing us it is on the screen's left), hand 1 his left. World points are W3: x, the
 * floor's depth y (world units, as GROCER_FLOOR_Y) and h above the floor; on the screen a point is at (x, y - h).
 */
import { DIM, FOREARM, KAPPA } from '../../vine/scene/gardenerDims';
import { Gait, STANCE, type GaitGoal } from './grocerGait';
import { LEG, WALK_BOB, WALK_PELVIS_ROLL, WALK_PELVIS_YAW, WALK_SWAY, WALK_THORAX_YAW, cyc, wristSwing } from '../../vine/scene/gardenerWalk';
import { Mover, Spring1, clamp, ik3, lerp, lerp3, norm3, softMin, sstep, swing3, wrapPi, type IK3Out, type V3 } from '../../vine/scene/gardenerMath';
import { makeCanvas } from '../../scene/watercolor';
import type { GrocerSprites, Part } from './grocerArt';
import { GROCER_H } from './geom';
import { buildGlaze, illumination } from './light';

const PI = Math.PI;
/** rig units to world units: the grocer is GROCER_H tall, the gardener's rig 122 */
export const UNIT = GROCER_H / 122;
const CROUCH_DROP = 24;
/** the walk's carriage, fitted to CMU 07_01 (see pickerFigure.ts for the measurements) */
const WALK_DROP = 1.5;
const WALK_REACH = 1;
const WALK_LEAD = 0.09;
const ARM = 49;
const TORSO_W = 10;
const TORSO_D = 8.8;
const WALK_TURN = 2.0;
/** the most the shoulders lift for an overhead reach (rig units) */
const SHRUG_MAX = 9;
/** how far below the rig's neck joint his head sits (rig units): the jaw just clear of the collar */
const HEAD_SINK = 0.7;

const mk = (): IK3Out => ({ joint: [0, 0, 0], end: [0, 0, 0], reach: true });

/** a point in the world: x, depth y, and h above the floor */
export interface W3 {
  x: number;
  y: number;
  h: number;
}

/* ------------------------------------------------------------------ the room's light on him */

/** the glaze over the whole region he can stand in, as a small picture (one texel per LSTEP world units) */
const LX0 = -120;
const LY0 = 120;
const LX1 = 1120;
const LY1 = 640;
const LSTEP = 6;
let lightMap: HTMLCanvasElement | null = null;
function roomLight(): HTMLCanvasElement {
  if (lightMap) return lightMap;
  // a figure stands out of the wall into the lamps' light: lifted a little against the wall's own glaze
  const g = buildGlaze(LX0, LY0, LX1, LY1, LSTEP, () => 'wall', 53, () => 0.3, 0);
  const cv = makeCanvas(g.nx, g.ny);
  const c = cv.getContext('2d')!;
  const img = c.createImageData(g.nx, g.ny);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const o = (j * g.nx + i) * 6;
      const p = (j * g.nx + i) * 4;
      // (a figure's own painting already carries its form's shade: the room's glaze is laid a little thinner on it)
      img.data[p] = Math.min(255, 255 * (0.18 + 0.82 * g.v[o]!) * 1.04);
      img.data[p + 1] = Math.min(255, 255 * (0.18 + 0.82 * g.v[o + 1]!) * 1.04);
      img.data[p + 2] = Math.min(255, 255 * (0.18 + 0.82 * g.v[o + 2]!) * 1.04);
      img.data[p + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  lightMap = cv;
  return cv;
}

export class GrocerFigure {
  private set: GrocerSprites | null = null;
  readonly gait: Gait;
  private readonly seed = 307;

  // continuous quantities
  readonly yaw = new Mover(0);
  private readonly twist = new Spring1(0);
  private readonly headYaw = new Spring1(0);
  private readonly look = new Spring1(0);
  /** where the head is heading: each look is smoothed twice (a spring chasing a spring), so a turn of the head eases
   *  in and out instead of starting at full speed */
  private readonly headYawT = new Spring1(0);
  private readonly lookT2 = new Spring1(0);
  private readonly wWalk = new Mover(0);
  /** how firmly each hand is on its target (0 free … 1 there) */
  readonly wHold: [Mover, Mover] = [new Mover(0), new Mover(0)];
  private readonly crouchS = new Spring1(0);
  private readonly leanS = new Spring1(0);
  private readonly sway = new Spring1(0);
  private readonly speed = new Spring1(0);
  private readonly swingN = new Spring1(0);
  private readonly swingF = new Spring1(0);
  private readonly shrugS: [Spring1, Spring1] = [new Spring1(0), new Spring1(0)];
  private readonly tipS = new Spring1(0);

  // what the director asks for this step
  private goal: GaitGoal | null = null;
  private yawWant: number | null = null;
  private yawTrack = false;
  private stopAhead: { x: number; d: number } | null = null;
  private walkOK = true;
  /** hand targets (world), held from the last time they were given */
  private handT: [W3 | null, W3 | null] = [null, null];
  crouchT = 0;
  leanT = 0;
  /** how far up onto the toes (the foot's roll, radians) */
  tipT = 0;
  /** where to look: a pitch (negative up) and a yaw offset from the body, or null to look ahead */
  lookT: { pitch: number; yaw: number } | null = null;

  /** what the hands hold: the chalk in the right (its tip at the glove plus this offset, world), the towel bunched in
   *  the left (its middle at the glove plus this offset); the towel over the shoulder shows as much as drapeA */
  chalk: W3 | null = null;
  wad: W3 | null = null;
  wadA = 0;
  drapeA = 1;

  clock = 0;
  private frameDt = 1 / 60;

  // the solved pose
  private readonly S = UNIT;
  private wy = 540;
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
  /** how far each hand is from where it was asked to be (world units) */
  readonly reachErr: [number, number] = [0, 0];
  private ikA = mk();
  private ikB = mk();
  private wsw: [number, number, number] = [0, 0, 0];
  private elbowDir: [V3, V3] = [[0, 0, -1], [0, 0, -1]];
  private snapElbows = true;
  private gen = 0;

  // the pose cache: the figure painted (A), the light over it (M), the lit picture (L)
  private cvA: HTMLCanvasElement | null = null;
  private cvM: HTMLCanvasElement | null = null;
  private cvL: HTMLCanvasElement | null = null;
  private cvR: HTMLCanvasElement | null = null;
  private cacheKey = '';
  private box = { x: 0, y: 0, w: 0, h: 0 };
  /** repaints of the lit picture (for the harness: the cache's hit rate) */
  repaints = 0;

  constructor(x: number, y: number, yaw: number) {
    this.gait = new Gait(x, y / KAPPA, yaw);
    this.gait.scaleTo(UNIT);
    this.gait.stand(x, y / KAPPA, yaw);
    // a shop's walk is short and unhurried: no stride longer than the walk's own (see pickerFigure's STEP_MAX)
    this.gait.stepMax = 0.98 * 54.2;
    this.yaw.snap(yaw);
    this.solve();
  }

  /** the painted parts (from prepare); nothing is drawn until they arrive */
  sprites(set: GrocerSprites): void {
    if (set === this.set) return;
    this.set = set;
    this.gen++;
  }

  get painted(): boolean {
    return this.set !== null;
  }

  /* ---------------------------------------------------------------- what a director reads */

  /** the pelvis's floor point (x, depth y) */
  get px(): number {
    return this.gait.px;
  }

  /** the floor depth he stands at (world y) */
  get footY(): number {
    return KAPPA * this.gait.pd;
  }

  /** where a hand is now (world) */
  hand(i: 0 | 1): W3 {
    const g = this.glove[i]!;
    const p = this.scr(g);
    return { x: p[0], y: this.wy + this.S * KAPPA * g[1], h: this.S * g[2] };
  }

  /** a hand's screen point */
  handScreen(i: 0 | 1): { x: number; y: number } {
    const p = this.scr(this.glove[i]!);
    return { x: p[0], y: p[1] };
  }

  /** the shoulder's world point (for reach checks) */
  shoulderW(i: 0 | 1): W3 {
    const g = this.shoulder[i]!;
    const p = this.scr(g);
    return { x: p[0], y: this.wy + this.S * KAPPA * g[1], h: this.S * g[2] };
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

  /* ---------------------------------------------------------------- what a director sets, every step */

  /** start of a step: clear the per-step requests */
  begin(): void {
    this.goal = null;
    this.yawWant = null;
    this.yawTrack = false;
    this.walkOK = true;
  }

  /**
   * Head for a spot on the floor (x, depth y): true once there (within `tol`) and facing as asked (null: any way).
   * Walking forward, the body turns into the way of travel as the walk begins (or in one turn on the spot if that is
   * more than about 115 degrees) and swings round to the final facing over the last strides. `side`: shuffle there
   * sideways, still facing `finalYaw` (along the board).
   */
  goTo(spot: { x: number; y: number }, finalYaw: number | null, tolIn = 3, side = false): boolean {
    const gp = this.gait;
    const tol = Math.max(tolIn, 2);
    const sd = spot.y / KAPPA;
    const d = Math.hypot(spot.x - gp.px, sd - gp.pd);
    if (side && finalYaw !== null) {
      if (d > tol || gp.walking) {
        if (!gp.walking && !this.facing(finalYaw, 0.2)) {
          this.yawWant = finalYaw;
          return false;
        }
        this.goal = { x: spot.x, d: sd, spread: 3, minWalk: tol, side: true };
        this.yawWant = finalYaw;
        return false;
      }
      this.yawWant = finalYaw;
      return this.facing(finalYaw, 0.12);
    }
    if (d > tol || gp.walking) {
      const heading = Math.atan2(sd - gp.pd, spot.x - gp.px);
      const vl = Math.hypot(gp.vx, gp.vd);
      if (!gp.walking) this.stopAhead = null;
      if (gp.walking && !gp.sidePlan && (vl > 4 || this.stopAhead)) {
        const wy = Math.atan2(gp.vd, gp.vx);
        if (this.stopAhead || Math.abs(wrapPi(heading - wy)) > 1.9) {
          this.stopAhead ??= { x: gp.px + (gp.vx / vl) * 10, d: gp.pd + (gp.vd / vl) * 10 };
          this.goal = { ...this.stopAhead, spread: 3, minWalk: 2 };
          this.yawWant = wy;
          this.yawTrack = true;
          return false;
        }
      }
      this.goal = { x: spot.x, d: sd, spread: 3, minWalk: tol };
      if (gp.walking) {
        let want = heading;
        if (finalYaw !== null && (d < 12 * this.S || (d < 45 * this.S && Math.abs(wrapPi(finalYaw - heading)) <= 1.8))) want = finalYaw;
        if (gp.sidePlan && finalYaw !== null) want = finalYaw;
        this.yawWant = want;
        this.yawTrack = !gp.sidePlan;
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

  /** put hand i on a world point (null keeps the last one), blending in over `dur` seconds; w 0 lets go */
  hold(i: 0 | 1, at: W3 | null, w: number, dur = 0.5): void {
    if (at) this.handT[i] = at;
    if (this.wHold[i].target !== w) this.wHold[i].go(w, dur);
  }

  /* ---------------------------------------------------------------- stepping */

  /** advance by h seconds (call after the director's requests for this step) */
  step(h: number): void {
    this.frameDt = h;
    this.clock += h;
    this.driveYaw();
    this.yaw.update(h);
    this.wHold[0].update(h);
    this.wHold[1].update(h);
    const allow = !this.gait.turning && this.walkOK && this.gait.feet[0].tipRoll < 0.02 && (!this.yaw.moving || !!this.goal?.side);
    this.gait.follow = null;
    this.gait.update(h, this.goal, this.yaw.v, allow, this.S);
    this.wWalk.go(this.gait.walking && !this.gait.sidePlan ? 1 : 0, 0.3);
    this.wWalk.update(h);
    this.speed.update(h, this.gait.speed, 12);
    const f0 = this.gait.feet[0].state === STANCE ? 1 : 0;
    const f1 = this.gait.feet[1].state === STANCE ? 1 : 0;
    this.sway.update(h, (this.gait.walking ? 1.7 : this.gait.turning ? 2.6 : 0) * (f0 - f1), 12);
    this.crouchS.update(h, this.crouchT, 7);
    this.leanS.update(h, this.leanT, 7);
    // up onto the toes only while standing still (never mid-stride)
    this.tipS.update(h, this.gait.walking || this.gait.turning ? 0 : this.tipT, 8);
    if (!this.gait.walking && !this.gait.turning) this.gait.setTip(this.tipS.x < 0.004 ? 0 : this.tipS.x);
    // the shoulder lifts as its hand is asked above the head's height
    for (const i of [0, 1] as const) {
      const t = this.handT[i];
      const sh = this.S * (DIM.FH + DIM.LMAX + DIM.SHOULDER);
      const up = t ? clamp((t.h - sh - 60) / 70, 0, 1) * this.wHold[i].v : 0;
      this.shrugS[i].update(h, up * SHRUG_MAX, 9);
    }
    let tY = this.lookT ? this.lookT.yaw : 0;
    const tP = this.lookT ? this.lookT.pitch : this.crouchS.x > 0.3 ? 0.25 : 0;
    if (this.yaw.moving || this.gait.turning) tY = clamp(0.5 * wrapPi(this.yaw.target - this.yaw.v), -0.45, 0.45);
    this.lookT2.update(h, tP, 5);
    this.headYawT.update(h, tY, 4);
    this.look.update(h, this.lookT2.x, 5);
    this.headYaw.update(h, this.headYawT.x, 4);
    let tw = 0;
    if (this.yaw.moving || this.gait.turning) tw = clamp(0.12 * wrapPi(this.yaw.target - this.yaw.v), -0.12, 0.12);
    this.twist.update(h, tw, 9);
  }

  /** straight into a pose: standing at (x, y) facing yaw (scrubbing, reduced motion) */
  placeAt(x: number, y: number, yaw: number, hands: [W3 | null, W3 | null] = [null, null]): void {
    this.goal = null;
    this.yawWant = null;
    this.stopAhead = null;
    this.wWalk.snap(0);
    this.look.snap(0);
    this.headYaw.snap(0);
    this.lookT2.snap(0);
    this.headYawT.snap(0);
    this.sway.snap(0);
    this.speed.snap(0);
    this.swingN.snap(0);
    this.swingF.snap(0);
    this.crouchT = 0;
    this.leanT = 0;
    this.tipT = 0;
    this.lookT = null;
    this.crouchS.snap(0);
    this.leanS.snap(0);
    this.tipS.snap(0);
    this.shrugS[0].snap(0);
    this.shrugS[1].snap(0);
    for (const i of [0, 1] as const) {
      this.handT[i] = hands[i];
      this.wHold[i].snap(hands[i] ? 1 : 0);
    }
    this.yaw.snap(yaw);
    this.twist.snap(0);
    this.clock = 0;
    this.gait.stand(x, y / KAPPA, yaw);
    this.gait.setTip(0);
    this.gait.amp = 0;
    this.gait.phase = 0;
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
    return [this.gait.px + this.S * u[0], this.wy + this.S * (KAPPA * u[1] - u[2])];
  }

  private driveYaw(): void {
    const gp = this.gait;
    if (this.yawWant === null) return;
    const d = wrapPi(this.yawWant - this.yaw.target);
    if (gp.walking) {
      if (gp.sidePlan) return;
      if (this.yawTrack && Math.abs(d) > 0.03 && Math.abs(d) < 1.9) this.yaw.retarget(this.yaw.target + d, 0.5);
      return;
    }
    if (gp.turning) return;
    const dv = wrapPi(this.yawWant - this.yaw.v);
    if (this.yaw.moving) return;
    if (Math.abs(dv) <= 0.09) return;
    const calm = gp.feet[0].tipRoll < 0.02 && gp.feet[0].state === STANCE && gp.feet[1].state === STANCE && gp.feet[0].tLand > 0.12 && gp.feet[1].tLand > 0.12;
    if (!calm) return;
    const dur = Math.abs(dv) > 0.35 ? 0.5 + 0.42 * Math.abs(dv) : 0.6;
    this.yaw.retarget(this.yaw.v + dv, dur);
    if (Math.abs(dv) > 0.35) gp.startTurn(this.yaw.v, dv, dur, Math.abs(dv) < 1.22 ? 2 : Math.abs(dv) < 2.44 ? 3 : 4);
  }

  private solve(): void {
    const gp = this.gait;
    const wy = KAPPA * gp.pd;
    const S = this.S;
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
    const calm = 1 - this.wWalk.v;
    const wH = Math.max(this.wHold[0].v, this.wHold[1].v);
    const idleShift = (0.7 * Math.sin(this.clock * 0.55 + this.seed) + 0.3 * Math.sin(this.clock * 1.31 + 2)) * calm * (1 - wH);
    const shiftA = 0.35 * idleShift + wa * WALK_LEAD * LEG;
    const shiftB = this.sway.x + 1.0 * idleShift + wa * cyc(WALK_SWAY, phi) * LEG;
    const ho: V3 = [fP[0] * shiftA + lP[0] * shiftB, fP[1] * shiftA + lP[1] * shiftB, 0];
    const A: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 2; i++) {
      const f = gp.feet[i]!;
      A[i] = [(f.x - gp.px) / S, (f.d - gp.pd) / S, f.h];
    }
    let H0 = 1e9;
    const R = lerp(DIM.LMAX, WALK_REACH * LEG, wa);
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const hx = ho[0] + lP[0] * sg * DIM.HIPW;
      const hz = ho[1] + lP[1] * sg * DIM.HIPW;
      const dh = Math.hypot(A[i]![0] - hx, A[i]![1] - hz);
      const need = A[i]![2] + Math.sqrt(Math.max(1, R * R - dh * dh));
      H0 = H0 > 1e8 ? need : softMin(H0, need, 1.2);
    }
    const crouch = this.crouchS.x * CROUCH_DROP;
    const Hw = wa > 0.001 ? softMin(H0, DIM.FH + DIM.LMAX - WALK_DROP * wa + wa * cyc(WALK_BOB, phi) * LEG, 1.2) : H0;
    const H = Hw - crouch;
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
    const lean = walkLean * this.wWalk.v + 0.03 * (1 - this.wWalk.v) + 0.015 * Math.sin(this.clock * 0.9) * calm + this.leanS.x;
    const br = 1 + 0.009 * Math.sin(this.clock * 1.3 + this.seed) * (1 - 0.7 * this.wWalk.v);
    this.breath = br;
    const sUp: V3 = [Math.sin(lean) * fT[0], Math.sin(lean) * fT[1], Math.cos(lean)];
    this.sUp = sUp;
    const fTp: V3 = [Math.cos(lean) * fT[0], Math.cos(lean) * fT[1], -Math.sin(lean)];
    const along = (a: number, b: number, h: number): V3 => [hipC[0] + fTp[0] * a + lT[0] * b + sUp[0] * h, hipC[1] + fTp[1] * a + lT[1] * b + sUp[1] * h, hipC[2] + fTp[2] * a + sUp[2] * h];
    this.neck = along(0, 0, DIM.TORSO * br + 0.5 * (this.shrugS[0].x + this.shrugS[1].x) * 0.3);
    const shC = along(0, 0, DIM.SHOULDER * br);
    this.shoulder[0] = [shC[0] + lT[0] * DIM.SHW, shC[1] + lT[1] * DIM.SHW, shC[2] + this.shrugS[0].x];
    this.shoulder[1] = [shC[0] - lT[0] * DIM.SHW, shC[1] - lT[1] * DIM.SHW, shC[2] + this.shrugS[1].x];
    const sh0 = this.shoulder[0];
    const sh1 = this.shoulder[1];
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
      return [sh[0] + fT[0] * (Math.sin(b) * ARM + bias) + lT[0] * sg * 3.0, sh[1] + fT[1] * (Math.sin(b) * ARM + bias) + lT[1] * sg * 3.0, sh[2] - Math.cos(b) * ARM];
    };
    let gN = hang(0, this.swingN.x, 3.2);
    let gF = hang(1, this.swingF.x, 2.2);
    if (wa > 0.001) {
      for (let i = 0; i < 2; i++) {
        const sg = i === 0 ? 1 : -1;
        wristSwing(phi + 0.5 * i, this.wsw);
        const g = i === 0 ? gN : gF;
        const o: V3 = [fT[0] * this.wsw[0] + lT[0] * sg * this.wsw[1], fT[1] * this.wsw[0] + lT[1] * sg * this.wsw[1], this.wsw[2]];
        const k = wa * (1 - this.wHold[i]!.v);
        const gg: V3 = [g[0] + o[0] * k, g[1] + o[1] * k, g[2] + o[2] * k];
        if (i === 0) gN = gg;
        else gF = gg;
      }
    }
    // the hands on what they hold (world targets, into the figure's units)
    const want: [V3 | null, V3 | null] = [null, null];
    for (let i = 0; i < 2; i++) {
      const w = this.wHold[i]!.v;
      const t = this.handT[i];
      if (w <= 0.001 || !t) continue;
      const u: V3 = [(t.x - gp.px) / S, (t.y / KAPPA - gp.pd) / S, t.h / S];
      want[i] = u;
      if (i === 0) gN = swing3(sh0, gN, u, w);
      else gF = swing3(sh1, gF, u, w);
    }
    const kEl = this.snapElbows ? 1 : 1 - Math.exp(-this.frameDt / 0.25);
    this.snapElbows = false;
    const hint: [V3, V3] = [this.armHint(0, fT, lT, kEl), this.armHint(1, fT, lT, kEl)];
    for (let i = 0; i < 2; i++) {
      const target = i === 0 ? gN : gF;
      ik3(this.shoulder[i]!, target, DIM.UA, FOREARM, hint[i]!, this.ikB);
      this.elbow[i] = this.ikB.joint;
      this.glove[i] = this.ikB.end;
      const wu = want[i];
      this.reachErr[i] = wu && this.wHold[i]!.v > 0.999 ? Math.hypot(this.ikB.end[0] - wu[0], this.ikB.end[1] - wu[1], this.ikB.end[2] - wu[2]) * S : 0;
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
    this.fx = gp.px + ho[0] * S;
  }

  private armHint(i: number, fT: V3, lT: V3, k: number): V3 {
    const sg = i === 0 ? 1 : -1;
    const pref: V3 = norm3([-0.45 * fT[0] + 0.2 * sg * lT[0], -0.45 * fT[1] + 0.2 * sg * lT[1], -0.85]);
    if (k >= 1) return pref;
    return norm3(lerp3(this.elbowDir[i]!, pref, k));
  }

  /* ---------------------------------------------------------------- painting */

  /** the figure in world units onto a context (no light: the cache lays the room's light over it) */
  private draw(ctx: CanvasRenderingContext2D, only: 0 | 1 | null = null): void {
    const set = this.set;
    if (!set) return;
    const S = this.S;
    const base = ctx.getTransform();
    ctx.save();
    const all: Array<{ k: number; f: () => void; arm?: 0 | 1 }> = [];
    const items = { push: (it: { k: number; f: () => void; arm?: 0 | 1 }) => all.push(it) };
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
    /** two neighbouring painted views dissolved into each other (at his size a snap between views would show) */
    const view = (parts: Part[], psi: number, x: number, y: number, ang: number, sw = 1, alpha = 1) => {
      const n = parts.length;
      const t = ((((psi / (2 * PI)) % 1) + 1) % 1) * n;
      const k0 = Math.floor(t) % n;
      const k1 = (k0 + 1) % n;
      const fr = t - Math.floor(t);
      if (fr < 0.5) {
        put(parts[k0]!, x, y, ang, 1, sw, alpha);
        if (fr > 0.001) put(parts[k1]!, x, y, ang, 1, sw, alpha * Math.min(1, fr * 2));
      } else {
        put(parts[k0]!, x, y, ang, 1, sw, alpha * Math.min(1, (1 - fr) * 2));
        put(parts[k1]!, x, y, ang, 1, sw, alpha);
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
      ctx.moveTo(mx - dy * 900, my + dx * 900);
      ctx.lineTo(mx + dy * 900, my - dx * 900);
      ctx.lineTo(mx + dy * 900 + sg * dx * 900, my - dx * 900 + sg * dy * 900);
      ctx.lineTo(mx - dy * 900 + sg * dx * 900, my + dx * 900 + sg * dy * 900);
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
    const shH = (this.shoulder[0][2] + this.shoulder[1][2]) / 2;
    // (and not when his back is to us: then a hand before his chest is behind him, as it is)
    const awayK = sstep((Math.sin(this.yawT) + 0.6) / 0.4);
    const keyAt = (P: V3): number => {
      const dx = P[0] - torsoX;
      const rel = P[1] - torsoZ - kMid * dx;
      // (an arm beside the body is kept in front of it, as the crew's; but not once it is raised above the shoulders,
      // where it may pass behind the head, reaching up to the board)
      const beside = sstep((Math.abs(dx) - silW + 1.5) / 3) * sstep((7 - Math.abs(rel)) / 4) * sstep((shH - 2 - P[2]) / 6) * awayK;
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
    items.push({ k: torsoKey, f: () => view(set.torso, this.yawT, hipS[0], hipS[1], torsoRot, this.breath) });
    // (the head sits a little down toward the collar: a man of his age carries his head lower than the rig's)
    const neckS = this.scr([this.neck[0] - this.sUp[0] * HEAD_SINK, this.neck[1] - this.sUp[1] * HEAD_SINK, this.neck[2] - this.sUp[2] * HEAD_SINK]);
    const cH = Math.cos(this.yawH);
    const headRot = 0.4 * torsoRot + this.look.x * (0.65 * cH + 0.35 * Math.tanh(cH * 4));
    // (the neck is the torso's, its collar over it; facing us the head is laid over the collar, its chin in front of
    // it, but turned away it goes under the torso, so the collar and the nape cover the jaw's underside, which is then
    // behind them: both in between, for an unbroken turn)
    const away = sstep((-Math.sin(this.yawH) - 0.05) / 0.5);
    if (away > 0.001) items.push({ k: torsoKey - 0.001, f: () => view(set.head, this.yawH, neckS[0], neckS[1], headRot, 1, Math.min(1, away * 4)) });
    if (away < 0.999) items.push({ k: this.neck[1] + 8, f: () => view(set.head, this.yawH, neckS[0], neckS[1], headRot, 1, 1 - away) });
    for (let i = 0; i < 2; i++) {
      const hip = this.hips[i]!;
      const kn = this.knee[i]!;
      const an = this.ankle[i]!;
      const f = this.gait.feet[i]!;
      const zk = (hip[1] + an[1]) / 2;
      const far = farOf(zk);
      const kLeg = keyAt(hip) - 1 + clamp(0.08 * (an[1] - hip[1]), -0.6, 0.6);
      items.push({
        k: kLeg,
        f: () => {
          const a = this.scr(an);
          const k = this.scr(kn);
          const rotShaft = Math.atan2(k[0] - a[0], a[1] - k[1]);
          const rotFoot = f.a * Math.cos(f.yaw);
          bone(set.thigh, set.thighFar, hip, kn, DIM.THIGH, far, set.knee, 0.72);
          bone(set.shin, set.shinFar, kn, an, DIM.SHIN, far, null, 0);
          view(set.boot, f.yaw, a[0], a[1], (rotFoot + rotShaft) / 2);
        },
      });
    }
    let kUpper1 = torsoKey;
    for (let i = 0; i < 2; i++) {
      const sh = this.shoulder[i]!;
      const el = this.elbow[i]!;
      const gl = this.glove[i]!;
      const zu = (sh[1] + el[1]) / 2;
      const zf = (el[1] + gl[1]) / 2;
      const ku = keySeg(sh, el);
      if (i === 1) kUpper1 = ku;
      const kElb = keyAt(lerp3(el, gl, 0.22));
      const kHand = keyAt(lerp3(el, gl, 0.8));
      items.push({ k: ku, f: () => bone(set.upper, set.upperFar, sh, el, 24, farOf(zu), null, 0) });
      const drawFore = () => bone(set.fore[i]!, set.foreFar[i]!, el, gl, FOREARM, farOf(zf), set.elbow, 0.7);
      const arm = i as 0 | 1;
      if (kElb > torsoKey !== kHand > torsoKey && only === null) {
        items.push({ k: kElb, f: () => halfOf(el, gl, true, drawFore) });
        items.push({ k: kHand, f: () => halfOf(el, gl, false, drawFore) });
      } else items.push({ k: kHand, f: drawFore, arm });
      // what the hand holds: in front of the fingers when it points at us, behind them when it points away
      const g = this.scr(gl);
      if (i === 0 && this.chalk) {
        const c = this.chalk;
        items.push({ k: kHand + (c.y < 0 ? -0.01 : 0.01), f: () => this.drawChalk(ctx, base, g[0], g[1], g[0] + c.x, g[1] + c.y - c.h), arm: 0 });
      }
      if (i === 1 && this.wad && this.wadA > 0.002) {
        const c = this.wad;
        items.push({ k: kHand + (c.y < 0 ? -0.01 : 0.01), f: () => put(set.wad, g[0] + c.x, g[1] + c.y - c.h, torsoRot * 0.5 - 0.2, 1, 1, this.wadA), arm: 1 });
      }
    }
    // the towel over the left shoulder: over the torso and the top of the left arm
    if (this.drapeA > 0.002) {
      const shS = this.scr(this.shoulder[1]!);
      items.push({ k: Math.max(torsoKey, kUpper1) + 0.05, f: () => view(set.drape, this.yawT, shS[0], shS[1], torsoRot, 1, this.drapeA) });
    }
    // (one forearm and what its hand holds alone, for laying over the counter)
    const list = only === null ? all : all.filter((it) => it.arm === only);
    for (let i = 1; i < list.length; i++) {
      const it = list[i]!;
      let j = i - 1;
      while (j >= 0 && list[j]!.k > it.k) {
        list[j + 1] = list[j]!;
        j--;
      }
      list[j + 1] = it;
    }
    for (const it of list) it.f();
    ctx.restore();
    ctx.setTransform(base);
  }

  /** a stick of chalk from the fingers (x0, y0) to its tip (screen, world units) */
  private drawChalk(ctx: CanvasRenderingContext2D, base: DOMMatrix, x0: number, y0: number, x1: number, y1: number): void {
    ctx.setTransform(base);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    // (it starts a little way into the fist, so the fingers hold it)
    const sx = x0 + (dx / l) * Math.min(3, l * 0.3);
    const sy = y0 + (dy / l) * Math.min(3, l * 0.3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(62,50,54,0.55)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#F4F0E4';
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,184,168,0.8)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(sx + 0.4, sy + 0.4);
    ctx.lineTo(x1 + 0.4, y1 + 0.4);
    ctx.stroke();
  }

  /** the screen extent of the pose, with room for the head, the clothes and what the hands hold */
  private extent(): { x: number; y: number; w: number; h: number } {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const add = (u: V3, r: number) => {
      const p = this.scr(u);
      x0 = Math.min(x0, p[0] - r);
      x1 = Math.max(x1, p[0] + r);
      y0 = Math.min(y0, p[1] - r);
      y1 = Math.max(y1, p[1] + r);
    };
    const S = this.S;
    add(this.hipC, 32 * S);
    add(this.neck, 30 * S);
    for (let i = 0; i < 2; i++) {
      add(this.shoulder[i]!, 14 * S);
      add(this.elbow[i]!, 9 * S);
      add(this.glove[i]!, 16 * S);
      add(this.knee[i]!, 10 * S);
      add(this.ankle[i]!, 16 * S);
    }
    return { x: Math.floor(x0 / 4) * 4, y: Math.floor(y0 / 4) * 4, w: Math.ceil((x1 - x0) / 4) * 4 + 8, h: Math.ceil((y1 - y0) / 4) * 4 + 8 };
  }

  /** the pose's signature: rounded joint positions (a change below these shows as nothing) */
  private signature(sc: number): string {
    // (a third of a device pixel: world units, and rig units for the joints; a whole one while he stands at ease, when
    // all that moves is his breathing and the slow shift of his weight, and repainting for every sliver of it would
    // cost a repaint a frame for nothing the eye can follow)
    const q = (this.atEase ? 1 : 0.33) / Math.max(0.5, sc);
    const qr = q / UNIT;
    const v3 = (u: V3) => r4(u[0], qr) + ',' + r4(u[1], qr / KAPPA) + ',' + r4(u[2], qr);
    const f = this.gait.feet;
    const ch = this.chalk;
    const wd = this.wad;
    return [
      r4(this.gait.px, q), r4(this.wy, q),
      v3(this.hipC), v3(this.neck), v3(this.glove[0]), v3(this.glove[1]), v3(this.elbow[0]), v3(this.elbow[1]), v3(this.shoulder[0]), v3(this.shoulder[1]),
      v3(this.knee[0]), v3(this.knee[1]), v3(this.ankle[0]), v3(this.ankle[1]),
      r4(this.yawT, 0.006), r4(this.yawH, 0.006), r4(this.look.x, 0.01), r4(this.breath, 0.002),
      r4(f[0].a, 0.02), r4(f[1].a, 0.02), r4(f[0].yaw, 0.01), r4(f[1].yaw, 0.01),
      ch ? `${r4(ch.x, q)},${r4(ch.y, q)},${r4(ch.h, q)}` : '-', wd ? `${r4(wd.x, q)},${r4(wd.y, q)},${r4(wd.h, q)},${r4(this.wadA, 0.02)}` : '-',
      r4(this.drapeA, 0.02), this.gen, sc.toFixed(3), this.armLayers.join(),
    ].join('|');
  }

  /**
   * Paint the lit figure into the cache if the pose has changed (the figure, then the room's glaze multiplied over it
   * and the window's cool light along the edges that face it), then lay it on the scene.
   */
  drawLit(ctx: CanvasRenderingContext2D): void {
    if (!this.set) return;
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b);
    const key = this.signature(sc);
    if (key !== this.cacheKey || !this.cvL) {
      this.cacheKey = key;
      this.repaint(sc);
    }
    ctx.drawImage(this.cvL!, this.box.x, this.box.y, this.cvL!.width / sc, this.cvL!.height / sc);
  }

  /** standing at ease (set by the director): the pose cache may round more coarsely */
  atEase = false;

  /** which forearms are wanted on a layer of their own (set by the director: a hand over the counter, or on a piece) */
  armLayers: [boolean, boolean] = [false, false];
  private cvArm: [HTMLCanvasElement | null, HTMLCanvasElement | null] = [null, null];
  private armLit: [boolean, boolean] = [false, false];

  private repaint(sc: number): void {
    this.repaints++;
    const box = this.extent();
    this.box = box;
    const W = Math.max(2, Math.ceil(box.w * sc));
    const H = Math.max(2, Math.ceil(box.h * sc));
    const fit = (cv: HTMLCanvasElement | null): HTMLCanvasElement => {
      if (cv && cv.width >= W && cv.height >= H && cv.width <= W * 1.6 && cv.height <= H * 1.6) return cv;
      return makeCanvas(Math.ceil(W * 1.15), Math.ceil(H * 1.15));
    };
    this.cvA = fit(this.cvA);
    const A = this.cvA;
    const same = (cv: HTMLCanvasElement | null) => (cv && cv.width === A.width && cv.height === A.height ? cv : makeCanvas(A.width, A.height));
    this.cvM = same(this.cvM);
    this.cvL = same(this.cvL);
    this.cvR = same(this.cvR);
    this.paintLit(sc, this.cvL);
    for (const i of [0, 1] as const) {
      this.armLit[i] = false;
      if (!this.armLayers[i]) continue;
      // (painted alone and lit with the same glaze: cut from the whole figure, a forearm passing behind the apron
      // would carry the apron's pixels with it)
      this.cvArm[i] = same(this.cvArm[i]);
      this.paintLit(sc, this.cvArm[i]!, i);
      this.armLit[i] = true;
    }
  }

  /** the figure (or one forearm) painted, then the room's glaze multiplied over its own shape and the window's cool
   *  light caught along the edges that face it */
  private paintLit(sc: number, out: HTMLCanvasElement, only: 0 | 1 | null = null): void {
    const box = this.box;
    const A = this.cvA!;
    const a = A.getContext('2d')!;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, A.width, A.height);
    a.setTransform(sc, 0, 0, sc, -box.x * sc, -box.y * sc);
    a.imageSmoothingQuality = 'low';
    this.draw(a, only);
    a.setTransform(1, 0, 0, 1, 0, 0);
    const map = roomLight();
    const bw = A.width / sc;
    const bh = A.height / sc;
    const mc = this.cvM!.getContext('2d')!;
    mc.globalCompositeOperation = 'source-over';
    mc.clearRect(0, 0, A.width, A.height);
    mc.imageSmoothingEnabled = true;
    mc.drawImage(map, (box.x - LX0) / LSTEP, (box.y - LY0) / LSTEP, bw / LSTEP, bh / LSTEP, 0, 0, A.width, A.height);
    mc.globalCompositeOperation = 'destination-in';
    mc.drawImage(A, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    const lc = out.getContext('2d')!;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, A.width, A.height);
    lc.drawImage(A, 0, 0);
    lc.globalCompositeOperation = 'multiply';
    lc.drawImage(this.cvM!, 0, 0);
    lc.globalCompositeOperation = 'destination-in';
    lc.drawImage(A, 0, 0);
    // the window's cool light catching his edges on the left (its strength where he stands)
    const cool = illumination(this.fx, this.wy - 150, 'wall').cool;
    if (cool > 0.08 && only === null) {
      const rc = this.cvR!.getContext('2d')!;
      const off = Math.max(1, 1.6 * sc);
      rc.globalCompositeOperation = 'source-over';
      rc.clearRect(0, 0, A.width, A.height);
      rc.drawImage(A, 0, 0);
      rc.globalCompositeOperation = 'destination-out';
      rc.drawImage(A, off, off * 0.4);
      rc.globalCompositeOperation = 'source-in';
      rc.fillStyle = '#BCD0E6';
      rc.fillRect(0, 0, A.width, A.height);
      rc.globalCompositeOperation = 'source-over';
      lc.globalCompositeOperation = 'source-atop';
      lc.globalAlpha = Math.min(0.7, 0.2 + cool * 0.9);
      lc.drawImage(this.cvR!, 0, 0);
      lc.globalAlpha = 1;
    }
    lc.globalCompositeOperation = 'source-over';
  }

  /** one forearm and what its hand holds, lit, laid again (over the counter, over a piece in the hand) */
  drawArm(ctx: CanvasRenderingContext2D, i: 0 | 1): void {
    const cv = this.cvArm[i];
    if (!cv || !this.armLit[i]) return;
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b);
    ctx.drawImage(cv, this.box.x, this.box.y, cv.width / sc, cv.height / sc);
  }

  /** a soft shadow on the floor under the feet */
  drawShadow(ctx: CanvasRenderingContext2D): void {
    const S = this.S;
    ctx.fillStyle = 'rgba(40,24,30,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.fx + 4 * S, this.wy + 1, 15 * S, 2.6 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a number rounded for a signature */
const r4 = (v: number, q = 0.25): string => Math.round(v / q).toString(36);
