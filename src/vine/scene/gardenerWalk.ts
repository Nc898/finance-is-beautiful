/**
 * Sampling the measured walk (gardenerWalkData.ts). The footstep planner still decides where every foot lands (so a
 * planted foot never slides); these curves give everything between the landings the way a real walker does it: the
 * swing foot's path and roll, the push-off, the pelvis's bob, sway and turn, the chest turning against it, and the
 * arms' swing.
 */
import { DIM } from './gardenerDims';
import { WALK_N, WALK_PITCH, WALK_SWING, WALK_TOE_OFF, WALK_WRIST } from './gardenerWalkData';

export { WALK_BOB, WALK_PELVIS_ROLL, WALK_PELVIS_YAW, WALK_SWAY, WALK_THORAX_YAW } from './gardenerWalkData';

/** 'measured' walks by the curves; 'classic' is the hand-made walk (kept while the two are compared) */
export type WalkStyle = 'measured' | 'classic';
export let walkStyle: WalkStyle = 'measured';
export function setWalkStyle(s: WalkStyle): void {
  walkStyle = s;
}

/** the leg (hip joint to ankle) and the arm (shoulder to glove) in rig units, to scale the curves */
export const LEG = DIM.THIGH + DIM.SHIN;
export const ARM_LEN = DIM.UA + DIM.FA + DIM.GLOVE;

/** a cyclic curve at a phase (wraps), linearly between samples; `stride` and `k` pick a component of packed tuples */
export function cyc(arr: readonly number[], phase: number, stride = 1, k = 0): number {
  const t = (((phase % 1) + 1) % 1) * WALK_N;
  const i0 = Math.floor(t) % WALK_N;
  const i1 = (i0 + 1) % WALK_N;
  const u = t - Math.floor(t);
  return arr[i0 * stride + k]! * (1 - u) + arr[i1 * stride + k]! * u;
}

/** the swing at fraction s (0 toe-off .. 1 heel strike): the ankle's progress along the step and its lift (leg lengths) */
export function swingAt(s: number, out: { p: number; h: number }): void {
  const t = Math.min(1, Math.max(0, s)) * (WALK_N - 1);
  const i0 = Math.min(WALK_N - 2, Math.floor(t));
  const u = t - i0;
  out.p = WALK_SWING[i0 * 2]! * (1 - u) + WALK_SWING[i0 * 2 + 2]! * u;
  out.h = WALK_SWING[i0 * 2 + 1]! * (1 - u) + WALK_SWING[i0 * 2 + 3]! * u;
}

/** the foot's roll in the rig's sense (toe-down/heel-up positive) at its own phase psi */
export const footRoll = (psi: number): number => -cyc(WALK_PITCH, psi);

/** the foot's phase at toe-off, and so the roll there and at the heel strike */
export const TOE_OFF = WALK_TOE_OFF;
export const ROLL_AT_TOE_OFF = footRoll(WALK_TOE_OFF);
export const ROLL_AT_STRIKE = footRoll(0);

/** the arm on the foot-0 side relative to its mean (the rest pose stays the rig's own): [forward, outward, up] */
const WRIST_MEAN = [0, 1, 2].map((k) => {
  let s = 0;
  for (let i = 0; i < WALK_N; i++) s += WALK_WRIST[i * 3 + k]!;
  return s / WALK_N;
});
export function wristSwing(phi: number, out: [number, number, number]): void {
  for (let k = 0; k < 3; k++) out[k] = (cyc(WALK_WRIST, phi, 3, k) - WRIST_MEAN[k]!) * ARM_LEN;
}
