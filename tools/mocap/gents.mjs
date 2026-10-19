// Average the extracted walks into one stroll and write it as a TS data module.
// Usage: node gents.mjs out.ts slow.json normal.json
import fs from 'node:fs';
const [outPath, ...ins] = process.argv.slice(2);
const ds = ins.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const avgNum = (k) => ds.reduce((s, d) => s + d[k], 0) / ds.length;
const avgArr = (k) => ds[0][k].map((_, i) => {
  const vs = ds.map((d) => d[k][i]);
  return Array.isArray(vs[0]) ? vs[0].map((__, q) => vs.reduce((s, v) => s + v[q], 0) / vs.length) : vs.reduce((s, v) => s + v, 0) / vs.length;
});
const r = (x) => Math.round(x * 1000) / 1000;
const flat = (a) => a.map((v) => (Array.isArray(v) ? v.map(r).join(', ') : r(v))).join(', ');
const wrist = avgArr('wrist');
const swing = avgArr('swing');
const src = `/**
 * The gardener's walk, measured: phase curves from motion capture of a real walk (CMU Graphics Lab Motion Capture
 * Database, subject 07, trials 01 "walk" and 04 "slow walk", via the cgspeed BVH conversion; the database places
 * no restrictions on use). Both trials were cut into steady gait cycles, mirrored left/right, averaged, and reduced
 * to the curves below by a script (not part of the build). Generated: do not edit by hand.
 *
 * Phases: foot curves run over a foot's own cycle psi (0 at its heel strike); body curves over the cycle phi
 * (0 at the heel strike of the rig's foot 0, the right foot; foot 1 strikes at 0.5). Lengths are in leg lengths
 * (hip joint to ankle), arm offsets in arm lengths (shoulder to wrist). Lateral values are positive toward the
 * foot-0 side. Angles in radians.
 */

/** samples per cycle */
export const WALK_N = ${ds[0].bob.length};
/** the subject's cycle (s), stride (leg lengths per cycle) and the foot's toe-off phase */
export const WALK_CYCLE_T = ${r(avgNum('cycleT'))};
export const WALK_STRIDE = ${r(avgNum('stride'))};
export const WALK_TOE_OFF = ${r(avgNum('toe'))};
/** pelvis height (hip-joint midpoint) about its mean, over phi */
export const WALK_BOB: readonly number[] = [${flat(avgArr('bob'))}];
/** pelvis side to side (toward foot 0 positive), over phi */
export const WALK_SWAY: readonly number[] = [${flat(avgArr('sway'))}];
/** pelvis turn about the vertical (foot-0 hip forward positive), over phi */
export const WALK_PELVIS_YAW: readonly number[] = [${flat(avgArr('pelYaw'))}];
/** pelvis tilt (foot-0 hip up positive), over phi */
export const WALK_PELVIS_ROLL: readonly number[] = [${flat(avgArr('pelRoll'))}];
/** the chest's turn against the pelvis, over phi */
export const WALK_THORAX_YAW: readonly number[] = [${flat(avgArr('thxYaw'))}];
/** foot pitch from flat (toe up positive), over psi */
export const WALK_PITCH: readonly number[] = [${flat(avgArr('pitch'))}];
/** the swing, toe-off to heel strike: [progress of the ankle along the step (0..1), its lift above the straight line] */
export const WALK_SWING: readonly number[] = [${flat(swing)}];
/** the arm on the foot-0 side: wrist from shoulder [forward, outward, up], over phi (the other arm is half a cycle on) */
export const WALK_WRIST: readonly number[] = [${flat(wrist)}];
`;
fs.writeFileSync(outPath, src);
console.log('wrote', outPath, src.length, 'chars');
