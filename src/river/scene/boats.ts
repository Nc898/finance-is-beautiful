/**
 * Boats, rowers, wakes, ripple rings and reflections: everything that is drawn per frame for the three
 * rowboats. Rower and oar kinematics are computed in boat-local units (see boatArt.ts) and the painted
 * sprites are posed on them, so a stroke is a continuous skeletal animation of hand-painted parts.
 *
 * Positions come only from the frame (u). The stroke phase, the rest/row blend and the splash events are small
 * wall-clock states that only ever ease, never jump.
 */
import { clamp, smoothstep } from '../../scene/prng';
import { makeCanvas } from '../../scene/watercolor';
import type { BoatId, BoatVisual } from '../types';
import { LANE_Y, BOAT_SCALE, mooringPoint, xOfU } from './geom';
import { SPR, buildRowerSet, type Part, type RowerSet } from './boatArt';

/* ------------------------------------------------------------------ kinematics */

const XS = 4; // seat
const XO = 19; // oarlock
const L_IN = 34;
const L_OUT = 44;
const KY = 0.38; // vertical foreshortening of the across-boat axis
const D = 0.42; // fraction of the stroke that is the drive

const BS = BOAT_SCALE;
const TH = 15.2;
const SH = 14.4;
const UA = 12.4;
const FA = 12.6;
const TORSO = 24;

type V2 = [number, number];

export interface Pose {
  bob: number;
  pitch: number;
  surge: number;
  hip: V2;
  torsoAng: number;
  neck: V2;
  headAng: number;
  tailAng: number;
  shoulder: V2;
  hand: V2;
  handFar: V2;
  knee: V2;
  foot: V2;
  oarN: { h: V2; t: V2; dip: number; yWater: number };
  oarF: { h: V2; t: V2; dip: number; yWater: number };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => x * x * (3 - 2 * x);

/** two-bone IK in 2D: root R, target T, lengths a, b; `down` picks the bend side (+1 = bend toward +y) */
function ik(R: V2, T: V2, a: number, b: number, down: number): V2 {
  let dx = T[0] - R[0];
  let dy = T[1] - R[1];
  let d = Math.hypot(dx, dy);
  const max = (a + b) * 0.999;
  const min = Math.abs(a - b) * 1.001 + 0.01;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  } else if (d < min) d = min;
  const ang = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const A = Math.acos(cosA) * down;
  return [R[0] + Math.cos(ang + A) * a, R[1] + Math.sin(ang + A) * a];
}

/** drive progress s (0 at the catch, 1 at the finish) and blade dip for a stroke phase p in [0,1) */
export function strokeShape(p: number): { s: number; dip: number } {
  let s: number;
  if (p < D) s = ease(ease(p / D) * 0.35 + (p / D) * 0.65);
  else s = 1 - ease((p - D) / (1 - D));
  const u = p < 0.5 ? p : p - 1; // centred on the catch
  let dip = ease(clamp((u + 0.055) / 0.075, 0, 1));
  dip *= 1 - ease(clamp((u - (D - 0.075)) / 0.06, 0, 1));
  return { s, dip };
}

/**
 * Pose for one moment. The rower faces the bow (upstream, into the current) and pushes the oars: the drive
 * goes from hands-at-chest to arms extended, so the blades sweep toward the stern and drive the boat forward.
 * The rig is computed facing +x and drawn mirrored (see paintBuffer).
 *
 * `act` (0…1) blends the resting "holding" pose (oars out, blades resting just above the water, hands on the
 * handles) with the stroke, so starting and stopping is continuous and the hands NEVER leave the handles.
 * `shipped` is the cash rower, who never rows: oars laid along the gunwales, hands in his lap, nothing moving
 * but a slow nod. There is no shipping/unshipping transition anywhere, so an oar only ever moves in a hand.
 */
export function computePose(p: number, act: number, eff: number, tSec: number, phase0: number, waves: boolean, shipped = false): Pose {
  const sh0 = strokeShape(p);
  const s = 1 - sh0.s; // 1 at the catch (hands at the chest), 0 at the finish (arms extended)
  const a = shipped ? 0 : ease(clamp(act, 0, 1));
  const amp = lerp(0.6, 1, eff);
  const wob = waves ? 1 : 0;
  const nod = wob * (0.045 * Math.sin(tSec * 0.9 + phase0) + 0.02 * Math.sin(tSec * 1.9));

  // the stroke
  const phiS = lerp(0.3 + 0.32 * amp, -(0.24 + 0.31 * amp), s);
  const ztS = lerp(lerp(6, 8.5, eff), lerp(-4, -7.5, eff), sh0.dip);
  const thS = lerp(0.42 * amp, -0.3 * amp, s);
  const slideS = lerp(1.2, -1.2, s); // a fixed thwart: only a little hip shift, the torso does the work
  // holding: oars out, blades resting just above the water, sitting easy
  const phiH = 0.12;
  const ztH = 3.2 + wob * 0.5 * Math.sin(tSec * 1.3 + phase0);
  const thH = -0.1 + nod * 0.6;

  let phi = lerp(phiH, phiS, a);
  let zt = lerp(ztH, ztS, a);
  let th = lerp(thH, thS, a);
  const seat = slideS * a;
  const dip = sh0.dip * a;
  let lock = XO;
  if (shipped) {
    // oars drawn in through the locks and laid along the gunwales, blades resting out past the stern
    phi = Math.PI / 2 - 0.05;
    zt = 14.2;
    th = -0.3 + nod * 0.5;
    lock = XO - 43;
  }

  const bobBase = wob * (0.8 * Math.sin(tSec * 1.6 + phase0) + 0.35 * Math.sin(tSec * 2.9 + phase0 * 2.1));
  // each drive lifts and surges the boat a little upstream (world -x); it settles back on the recovery
  const bob = bobBase + a * wob * -0.35 * Math.cos(p * Math.PI * 2);
  const pitch = wob * (0.011 * Math.sin(tSec * 1.25 + phase0 * 1.3) + a * 0.01 * Math.sin(p * Math.PI * 2 + 0.6));
  const surge = -1.6 * a * wob * (sh0.s - 0.5);

  const oar = (side: 1 | -1) => {
    const bp = 7 * side;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const aT = lock - L_OUT * sin;
    const bT = bp + side * L_OUT * cos;
    const aH = lock + L_IN * sin;
    const bH = bp - side * L_IN * cos;
    const zH = 9 - (zt - 9) * (L_IN / L_OUT);
    const yw = (bT - 7) * KY - bob;
    return {
      h: [aH, -zH + (bH - 7) * KY] as V2,
      t: [aT, -zt + (bT - 7) * KY] as V2,
      dip,
      yWater: yw,
    };
  };
  const oarN = oar(1);
  const oarF = oar(-1);

  const hip: V2 = [XS + seat, -10.5];
  // the torso follows the hands: if a handle would be beyond the arms' reach, lean toward it (as a rower
  // does), so the hands never have to let go of the oars
  if (!shipped) {
    const REACH = 23.6;
    const far = (t: number) => {
      const sx = hip[0] + TORSO * Math.sin(t);
      const sy = hip[1] - TORSO * Math.cos(t);
      // the visible near hand decides; the far hand (mostly behind the body) follows as best it can
      return Math.hypot(oarN.h[0] - sx, oarN.h[1] - sy);
    };
    if (far(th) > REACH) {
      // smallest lean change (forward or back) that brings the near handle within reach
      let best = th;
      for (let k = 1; k <= 40; k++) {
        const d = k * 0.02;
        if (far(th + d) <= REACH) { best = th + d; break; }
        if (far(th - d) <= REACH) { best = th - d; break; }
        best = far(th + d) < far(best) ? th + d : far(th - d) < far(best) ? th - d : best;
      }
      th = best;
    }
  }
  const shoulder: V2 = [hip[0] + TORSO * Math.sin(th), hip[1] - TORSO * Math.cos(th)];
  const neck: V2 = [shoulder[0] + 1.2 * Math.sin(th), shoulder[1] - 1.2 * Math.cos(th)];
  // hands: on the handles whenever the oars are out; in the lap only for the shipped (cash) rower
  const lap: V2 = [hip[0] + 12 + 2 * Math.sin(th), hip[1] - 8];
  const hand: V2 = shipped ? lap : oarN.h;
  const handFar: V2 = shipped ? [lap[0] - 1.5, lap[1] - 1] : oarF.h;
  const foot: V2 = [XS + 27.5, -5.8];
  const knee = ik(hip, foot, TH, SH, -1);
  const tailAng = -0.15 + 0.3 * wob * Math.sin(tSec * 4.3 + phase0) - 0.5 * th + 0.12 * wob * Math.sin(tSec * 7.1);
  return { bob, pitch, surge, hip, torsoAng: th, neck, headAng: th * 0.65 + nod, tailAng, shoulder, hand, handFar, knee, foot, oarN, oarF };
}

/* ------------------------------------------------------------------ rendering */

const BUF_W = 170;
const BUF_H = 108;
const BUF_OX = 85;
const BUF_OY = 72;
const REFL_D = 62;

interface Ring {
  t: number;
  x: number;
  y: number;
  seed: number;
}

class Rig {
  phase = 0;
  ramp = 0;
  eff = 0;
  lastT = -1;
  lastU = 0;
  vx = 0;
  rings: Ring[] = [];
  count = 0;
  buf: HTMLCanvasElement;
  refl: HTMLCanvasElement;
  constructor(public id: BoatId, public phaseOff: number, maxQ: number) {
    this.buf = makeCanvas(BUF_W * maxQ, BUF_H * maxQ);
    this.refl = makeCanvas(BUF_W * maxQ, BUF_H * maxQ);
  }
}

export class Boats {
  private set: RowerSet;
  private rigs: Record<BoatId, Rig>;
  readonly lastAnchor: Record<BoatId, { x: number; y: number }> = { cash: { x: 0, y: 0 }, savings: { x: 0, y: 0 }, invest: { x: 0, y: 0 } };

  constructor(public sprQ: number, maxQ: number) {
    this.set = buildRowerSet(sprQ);
    this.rigs = { cash: new Rig('cash', 0.4, maxQ), savings: new Rig('savings', 2.1, maxQ), invest: new Rig('invest', 4.3, maxQ) };
  }

  /** world-space pose anchors for labels */
  anchor(id: BoatId): { x: number; y: number } {
    return this.lastAnchor[id];
  }

  private part(ctx: CanvasRenderingContext2D, p: Part, x: number, y: number, ang: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.drawImage(p.cv, -p.px, -p.py, p.w, p.h);
    ctx.restore();
  }

  private oar(ctx: CanvasRenderingContext2D, id: BoatId, o: Pose['oarN'], far: boolean): void {
    const part = this.set.oars[id];
    const dx = o.t[0] - o.h[0];
    const dy = o.t[1] - o.h[1];
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const draw = () => {
      ctx.save();
      ctx.translate(o.h[0], o.h[1]);
      ctx.rotate(ang);
      ctx.scale(Math.max(0.12, len / 78), 1);
      ctx.drawImage(part.cv, -part.px, -part.py, part.w, part.h);
      ctx.restore();
    };
    if (o.dip > 0.05) {
      // above the surface at full strength, the part under the water faintly (seen through it)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-100, -100, 200, 100 + o.yWater);
      ctx.clip();
      draw();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-100, o.yWater, 200, 100);
      ctx.clip();
      ctx.globalAlpha = far ? 0.35 : 0.42;
      draw();
      ctx.restore();
    } else draw();
  }

  /** the whole boat (back to front) into its buffer, in the boat's own bob and pitch */
  private paintBuffer(rig: Rig, pose: Pose, qb: number, tSec: number, speedFx: number, _row: number): void {
    const id = rig.id;
    const set = this.set;
    const c = rig.buf.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, rig.buf.width, rig.buf.height);
    c.setTransform(qb, 0, 0, qb, BUF_OX * qb, BUF_OY * qb);
    c.translate(pose.surge, pose.bob);
    c.rotate(pose.pitch);
    c.imageSmoothingQuality = 'medium';
    const W = SPR.x1 - SPR.x0;
    const H = SPR.y1 - SPR.y0;
    c.drawImage(set.hullBack[id], SPR.x0, SPR.y0, W, H);
    // the rower and oars are rigged facing +x; mirror them to face the bow (upstream, -x)
    c.save();
    c.scale(-1, 1);
    this.oar(c, id, pose.oarF, true);
    // shipped (or nearly), the near oar lies inside the boat, behind the near gunwale
    const nearInside = false;
    if (nearInside) this.oar(c, id, pose.oarN, false);
    // far arm
    {
      const el = ik(pose.shoulder, pose.handFar, UA, FA, 1);
      this.part(c, set.upperFar, pose.shoulder[0] - 0.8, pose.shoulder[1] + 0.2, Math.atan2(el[1] - pose.shoulder[1], el[0] - pose.shoulder[0]));
      this.part(c, set.foreFar, el[0], el[1], Math.atan2(pose.handFar[1] - el[1], pose.handFar[0] - el[0]));
    }
    // scarf tails behind the head, then torso, head, legs
    this.part(c, set.torso, pose.hip[0], pose.hip[1] + 1, pose.torsoAng);
    this.part(c, set.tails[id], pose.neck[0] - Math.cos(pose.torsoAng) * 1.5, pose.neck[1] - Math.sin(pose.torsoAng) * 1.5, pose.tailAng + (speedFx > 0 ? 0 : 0));
    this.part(c, set.head[id], pose.neck[0], pose.neck[1], pose.headAng);
    this.part(c, set.thigh, pose.hip[0], pose.hip[1] - 0.5, Math.atan2(pose.knee[1] - pose.hip[1], pose.knee[0] - pose.hip[0]));
    this.part(c, set.shin, pose.knee[0], pose.knee[1], Math.atan2(pose.foot[1] - pose.knee[1], pose.foot[0] - pose.knee[0]));
    c.restore();
    c.drawImage(set.hullFront[id], SPR.x0, SPR.y0, W, H);
    c.save();
    c.scale(-1, 1);
    if (!nearInside) this.oar(c, id, pose.oarN, false);
    // near arm in front of the oar handle
    {
      const el = ik(pose.shoulder, pose.hand, UA, FA, 1);
      this.part(c, set.upper, pose.shoulder[0], pose.shoulder[1], Math.atan2(el[1] - pose.shoulder[1], el[0] - pose.shoulder[0]));
      this.part(c, set.fore, el[0], el[1], Math.atan2(pose.hand[1] - el[1], pose.hand[0] - el[0]));
    }
    c.restore();
    void tSec;
  }

  /**
   * Draw one frame of all boats. `flow` is the water's drift speed in world units per second at mid-river,
   * used so ripple rings are carried downstream with the current.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    boats: readonly BoatVisual[],
    o: { timeMs: number; flowing: boolean; reduced: boolean; flow: number; qb: number; waterClip: Path2D; flowLane: (id: BoatId) => number },
  ): void {
    const order = [...boats].sort((a, b) => LANE_Y[a.id] - LANE_Y[b.id]);
    const tSec = o.timeMs / 1000;
    for (const b of order) {
      const rig = this.rigs[b.id];
      const laneY = LANE_Y[b.id];
      const bx = xOfU(b.u);
      // ---- state
      const dt = rig.lastT < 0 || o.timeMs < rig.lastT || o.timeMs - rig.lastT > 250 ? 0 : (o.timeMs - rig.lastT) / 1000;
      rig.lastT = o.timeMs;
      if (dt === 0) {
        rig.rings.length = 0;
        rig.vx = 0;
      } else rig.vx += ((bx - rig.lastU) / Math.max(dt, 1e-3) - rig.vx) * 0.15;
      rig.lastU = bx;
      // the cash rower never rows; the others hold their oars when the river is still and row when it flows
      const shipped = b.id === 'cash';
      const rowTarget = !shipped && !o.reduced && o.flowing && b.effort > 0.02 ? 1 : 0;
      if (o.reduced) {
        rig.ramp = !shipped && b.effort > 0.02 ? 1 : 0;
        rig.eff = b.effort;
        rig.phase = 0.2;
      } else {
        rig.ramp += (rowTarget - rig.ramp) * (1 - Math.exp(-dt / 0.6));
        rig.eff += (b.effort - rig.eff) * (1 - Math.exp(-dt / 0.6));
      }
      const row = clamp(rig.ramp, 0, 1);
      // a steady rowboat pace (not a race): about one stroke every 1.6 s, quicker with more effort
      const rate = 0.36 + 0.22 * rig.eff;
      const prev = rig.phase;
      if (!o.reduced) {
        // the first stroke always begins from the end of a recovery, swinging the blades into the catch
        if (row < 0.01) rig.phase = 0.86;
        else rig.phase = (rig.phase + dt * rate * (0.35 + 0.65 * row)) % 1;
      }
      const wrapped = rig.phase < prev && row > 0.35 && !o.reduced;
      const waves = !o.reduced;
      const pose = computePose(rig.phase, row, rig.eff, tSec, rig.phaseOff, waves, shipped);
      if (wrapped) {
        rig.rings.push({ t: o.timeMs, x: bx - pose.oarN.t[0] * BS, y: laneY + (pose.oarN.yWater + pose.bob) * BS, seed: rig.count++ });
        rig.rings.push({ t: o.timeMs, x: bx - pose.oarF.t[0] * BS, y: laneY + (pose.oarF.yWater + pose.bob) * BS, seed: rig.count++ });
        if (rig.rings.length > 12) rig.rings.splice(0, rig.rings.length - 12);
      }
      for (let i = rig.rings.length - 1; i >= 0; i--) if (o.timeMs - rig.rings[i]!.t > 1900) rig.rings.splice(i, 1);

      // anchor for the label: above the hat
      this.lastAnchor[b.id] = { x: bx - pose.neck[0] * 0.3 * BS, y: laneY + (pose.neck[1] - 27) * BS };

      const v = clamp(b.waterSpeed / 0.12, 0, 1.3);
      const xf = () => {
        ctx.translate(bx, laneY);
        ctx.scale(BS, BS);
        ctx.translate(-bx, -laneY);
      };
      // ---- water-level effects under the hull
      ctx.save();
      xf();
      this.waterUnder(ctx, bx, laneY, v, tSec, rig, o.reduced);
      ctx.restore();
      // ---- body into its buffer
      this.paintBuffer(rig, pose, o.qb, tSec, v, row);
      // ---- reflection (clipped to the water), rippled
      ctx.save();
      ctx.clip(o.waterClip);
      xf();
      this.reflection(ctx, rig, bx, laneY, o.qb, tSec, o.reduced);
      ctx.restore();
      // ---- wake behind the hull, the boat itself, blade puddles
      ctx.save();
      xf();
      this.wake(ctx, bx, laneY, v, tSec, o.reduced, b.id);
      ctx.drawImage(rig.buf, 0, 0, BUF_W * o.qb, BUF_H * o.qb, bx - BUF_OX, laneY - BUF_OY, BUF_W, BUF_H);
      this.puddles(ctx, bx, laneY, pose, row);
      ctx.restore();
      // ---- rings and splashes of each recent catch (carried by the water, in world space)
      this.rings(ctx, rig, o.timeMs, o.flowLane(b.id));
      // ---- mooring line to the dock while the boat is near it
      this.rope(ctx, b.id, bx, laneY, pose, tSec, o.reduced);
    }
  }

  private waterUnder(ctx: CanvasRenderingContext2D, bx: number, y: number, v: number, tSec: number, rig: Rig, reduced: boolean): void {
    // contact shadow, falling to the lower right
    ctx.save();
    ctx.fillStyle = 'rgba(24,66,84,0.24)';
    ctx.beginPath();
    ctx.ellipse(bx + 5, y + 4, 57, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(24,66,84,0.14)';
    ctx.beginPath();
    ctx.ellipse(bx + 8, y + 6, 62, 6.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // pale lapping ripple around the waterline
    const br = reduced ? 0 : Math.sin(tSec * 2.1 + rig.phaseOff);
    ctx.strokeStyle = 'rgba(252,254,250,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(bx, y + 1.4, 62.5 + br * 0.6, 3.7 + br * 0.15, 0, 0.05 * Math.PI, 0.95 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(252,254,250,0.35)';
    ctx.beginPath();
    ctx.ellipse(bx, y + 2.8, 66 - br * 0.5, 4.8, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.restore();
    void v;
  }

  private reflection(ctx: CanvasRenderingContext2D, rig: Rig, bx: number, y: number, qb: number, tSec: number, reduced: boolean): void {
    const rc = rig.refl.getContext('2d')!;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, rig.refl.width, rig.refl.height);
    const row = 1.0; // world units per strip
    const rowPx = row * qb;
    const waterRow = BUF_OY * qb; // the buffer row of the waterline
    const amp = reduced ? 0.5 : 0.85;
    for (let d = 0; d < REFL_D; d += row) {
      const k = 1 - d / REFL_D;
      rc.globalAlpha = 0.5 * Math.pow(k, 0.9);
      const wob = amp * Math.sin(d * 0.62 + (reduced ? 0 : tSec * 1.9) + rig.phaseOff) * (0.3 + d / 70) + 0.2 * Math.sin(d * 1.3 - (reduced ? 0 : tSec * 2.6));
      rc.drawImage(rig.buf, 0, waterRow - (d + row) * qb, BUF_W * qb, rowPx + 0.6, wob * qb, waterRow + d * qb, BUF_W * qb, rowPx + 0.6);
    }
    rc.globalAlpha = 1;
    // cooled by the water, and a little paler
    rc.globalCompositeOperation = 'source-atop';
    rc.fillStyle = 'rgba(38,104,138,0.36)';
    rc.fillRect(0, 0, rig.refl.width, rig.refl.height);
    rc.fillStyle = 'rgba(170,205,222,0.1)';
    rc.fillRect(0, 0, rig.refl.width, rig.refl.height);
    rc.globalCompositeOperation = 'source-over';
    ctx.drawImage(rig.refl, 0, 0, BUF_W * qb, BUF_H * qb, bx - BUF_OX, y - BUF_OY, BUF_W, BUF_H);
  }

  private wake(ctx: CanvasRenderingContext2D, bx: number, y: number, v: number, tSec: number, reduced: boolean, id: BoatId): void {
    const t = reduced ? 0 : tSec;
    ctx.save();
    ctx.lineCap = 'round';
    // bow ripples: a small curl at the stem, always a little, growing with speed through the water
    const bow = 0.22 + 0.78 * Math.min(1, v);
    const bxs = bx - 59;
    for (let side = 0; side < 2; side++) {
      const sy = y + (side ? 2.4 : 0.4);
      const L = (7 + 22 * bow) * (side ? 1 : 0.8);
      const g = ctx.createLinearGradient(bxs, 0, bxs + L, 0);
      g.addColorStop(0, `rgba(252,254,250,${0.7 * bow})`);
      g.addColorStop(1, 'rgba(252,254,250,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(bxs - 1.2, sy - 0.4);
      ctx.quadraticCurveTo(bxs + L * 0.35, sy + (side ? 2.2 : -1.2) * (0.6 + bow), bxs + L, sy + (side ? 1.6 : -0.6) * (0.6 + bow));
      ctx.stroke();
    }
    // wash curling off the bow, upstream of it
    if (v > 0.05) {
      ctx.strokeStyle = `rgba(252,254,250,${0.5 * Math.min(1, v)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(bxs - 2, y + 1.2, 3 + 5 * v, 1.2 + 1.1 * v, 0, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();
    }
    if (v > 0.04) {
      const L = 36 + 110 * Math.min(1.1, v);
      const sx = bx + 60;
      // V arms: a few wavering crest lines per side; crests pulse and travel away along them.
      // Segments are batched into a few alpha bins (one stroke per bin) to keep the op count low.
      const NS = 12;
      const NB = 4;
      for (const side of [-1, 1] as const) {
        for (let j = 0; j < 3; j++) {
          const len = L * (1 - j * 0.17);
          const x1 = sx + 2 + j * 2;
          const y1 = y + 1.8 + j * 0.9 * side;
          const amp = Math.min(1, v * 1.2) * (0.62 - j * 0.13);
          const lit: Path2D[] = [];
          const shade: Path2D[] = [];
          for (let k = 0; k < NB; k++) {
            lit.push(new Path2D());
            shade.push(new Path2D());
          }
          let px0 = x1;
          let py0 = y1;
          for (let i = 1; i <= NS; i++) {
            const f = i / NS;
            const px1 = x1 + len * f;
            const py1 = y1 + side * len * 0.16 * Math.pow(f, 0.9) * (1 + j * 0.14) + Math.sin(f * 9 + j * 2 + (reduced ? 0 : t * 0.6)) * 0.6 * f;
            const pulse = 0.5 + 0.5 * Math.sin(6.2832 * (f * 2.6 - t * (0.5 + 0.8 * v)) + j * 2.1 + side);
            const a = amp * Math.pow(1 - f, 1.25) * (0.3 + 0.7 * pulse);
            const bin = Math.min(NB - 1, Math.floor((a / Math.max(amp, 0.01)) * NB));
            if (a > 0.02) {
              lit[bin]!.moveTo(px0, py0);
              lit[bin]!.lineTo(px1, py1);
              shade[bin]!.moveTo(px0, py0 + 1.3);
              shade[bin]!.lineTo(px1, py1 + 1.3);
            }
            px0 = px1;
            py0 = py1;
          }
          for (let k = 0; k < NB; k++) {
            const a = amp * ((k + 0.5) / NB);
            ctx.strokeStyle = `rgba(252,254,250,${a})`;
            ctx.lineWidth = 1.05 - j * 0.18;
            ctx.stroke(lit[k]!);
            ctx.strokeStyle = `rgba(34,96,128,${a * 0.5})`;
            ctx.lineWidth = 0.7;
            ctx.stroke(shade[k]!);
          }
        }
      }
      // the trailing wake: soft ripple arcs spawned at the stern, widening and fading as they drift astern
      const n = 6;
      const Lw = 30 + 80 * Math.min(1.1, v);
      for (let k = 0; k < n; k++) {
        const ph = ((reduced ? 0.15 : t * (0.35 + 0.55 * v) * 0.5) + k / n + (id === 'cash' ? 0.1 : id === 'savings' ? 0.4 : 0.7)) % 1;
        const px = sx + 4 + ph * Lw;
        const a = Math.sin(Math.PI * ph) * 0.5 * Math.min(1, v * 1.3);
        const rx = 2.5 + ph * 8;
        const ry = (1.4 + ph * 3.4) * 1;
        ctx.strokeStyle = `rgba(252,254,250,${a})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(px, y + 2.2, rx, ry, 0, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.stroke();
        ctx.strokeStyle = `rgba(34,96,128,${a * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(px + 0.4, y + 3.3, rx, ry, 0, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();
      }
      // turbulent water just astern: a pale scuff
      const sg = ctx.createRadialGradient(sx + 6, y + 2.6, 1, sx + 6, y + 2.6, 12 + 14 * v);
      sg.addColorStop(0, `rgba(250,253,248,${0.3 * Math.min(1, v)})`);
      sg.addColorStop(1, 'rgba(250,253,248,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(sx + 6, y + 2.6, 12 + 14 * v, 4 + 4 * v, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private puddles(ctx: CanvasRenderingContext2D, bx: number, y: number, pose: Pose, row: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    // a disturbed puddle behind each blade while it pulls
    for (const o of [pose.oarN, pose.oarF]) {
      const a = o.dip * row;
      if (a < 0.05) continue;
      const px = bx - o.t[0];
      const py = y + o.yWater + pose.bob + 0.6;
      const g = ctx.createRadialGradient(px, py, 0.5, px, py, 8);
      g.addColorStop(0, `rgba(252,254,250,${0.55 * a})`);
      g.addColorStop(1, 'rgba(252,254,250,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private rings(ctx: CanvasRenderingContext2D, rig: Rig, nowMs: number, flow: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const r of rig.rings) {
      const age = (nowMs - r.t) / 1000;
      const px = r.x + flow * age * 0.9;
      for (let k = 0; k < 2; k++) {
        const a2 = age - k * 0.16;
        if (a2 < 0) continue;
        const rad = (2.5 + 17 * Math.pow(a2 / 1.7, 0.62)) * BS;
        const al = 0.7 * Math.pow(Math.max(0, 1 - a2 / 1.7), 1.6) * (k ? 0.6 : 1);
        ctx.strokeStyle = `rgba(252,254,250,${al})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(px, r.y, rad, rad * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(30,92,124,${al * 0.55})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(px, r.y + 0.9, rad, rad * 0.36, 0, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      }
      if (age < 0.45) {
        // droplets thrown from the blade on a short ballistic arc
        for (let i = 0; i < 7; i++) {
          const sd = Math.sin((r.seed * 7 + i * 13.37) * 12.9898) * 43758.5453;
          const f = sd - Math.floor(sd);
          const sd2 = Math.sin((r.seed * 3 + i * 5.11) * 78.233) * 12345.6789;
          const f2 = sd2 - Math.floor(sd2);
          const vx = (f - 0.4) * 40;
          const vy = -(14 + f2 * 22);
          const dx = vx * age * BS;
          const dy = (vy * age + 0.5 * 90 * age * age) * BS;
          const al = 0.85 * (1 - age / 0.45);
          ctx.fillStyle = `rgba(252,254,252,${al})`;
          ctx.beginPath();
          ctx.arc(px + dx, r.y + dy, (0.5 + f2 * 0.8) * BS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private rope(ctx: CanvasRenderingContext2D, id: BoatId, bx: number, y: number, pose: Pose, tSec: number, reduced: boolean): void {
    const dist = Math.abs(bx - 500);
    const a = 1 - smoothstep(dist / 18);
    if (a <= 0.01) return;
    const sx = bx + (52 + pose.surge) * BS;
    const sy = y + (-12.5 + pose.bob) * BS;
    const mp = mooringPoint(id);
    const ex = mp.x;
    const ey = mp.y;
    const sag = 6 + (reduced ? 0 : Math.sin(tSec * 1.3 + (id === 'cash' ? 0 : 2)) * 0.8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(204,176,128,1)';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + sag, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(96,70,44,0.55)';
    ctx.lineWidth = 0.35;
    ctx.setLineDash([1.6, 1.4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + sag, ex, ey);
    ctx.stroke();
    ctx.restore();
  }
}
