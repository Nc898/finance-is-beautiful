// Trace a turning clip: yaw of head, chest and pelvis, each foot's yaw and contact, over time.
// Usage: node turntrace.mjs clip.bvh [step_s]
import { loadBvh, fk } from './bvh.mjs';

const b = loadBvh(process.argv[2]);
const stepS = +(process.argv[3] || 0.1);
// head forward: the head joint's rotation applied to +Z (the CMU rest pose faces +Z)
const rot = (axis, deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mul = (A, B) => { const R = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return R; };
function headFwd(f) {
  const fr = b.frames[f];
  const R = [];
  let out = null;
  b.joints.forEach((j, k) => {
    let local = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    j.channels.forEach((ch, q) => { if (!ch.endsWith('position')) local = mul(local, rot(ch[0], fr[j.chanStart + q])); });
    R[k] = j.parent < 0 ? local : mul(R[j.parent], local);
    if (j.name === 'Head') out = [R[k][2], R[k][5], R[k][8]];
  });
  return out;
}
const yawOfVec = (v) => Math.atan2(v[0], v[2]); // 0 = facing +Z
// facing of a left-right segment: its normal on the ground (rotate right->left by -90 deg)
const facing = (l, r) => { const dx = l[0] - r[0], dz = l[2] - r[2]; return Math.atan2(-dz, dx); };
const unwrap = (arr) => { for (let i = 1; i < arr.length; i++) { while (arr[i] - arr[i - 1] > Math.PI) arr[i] -= 2 * Math.PI; while (arr[i] - arr[i - 1] < -Math.PI) arr[i] += 2 * Math.PI; } return arr; };
const n = b.nFrames, dt = b.dt;
const P = [], head = [], chest = [], pelvis = [], fl = [], fr = [], cl = [], cr = [];
for (let f = 0; f < n; f++) {
  const p = fk(b, f);
  P.push(p);
  head.push(yawOfVec(headFwd(f)));
  chest.push(facing(p.LeftArm, p.RightArm));
  pelvis.push(facing(p.LeftUpLeg, p.RightUpLeg));
  fl.push(Math.atan2(p.LeftToeBase[0] - p.LeftFoot[0], p.LeftToeBase[2] - p.LeftFoot[2]));
  fr.push(Math.atan2(p.RightToeBase[0] - p.RightFoot[0], p.RightToeBase[2] - p.RightFoot[2]));
}
[head, chest, pelvis, fl, fr].forEach(unwrap);
// contacts: foot (ankle) speed small and low
const low = Math.min(...P.map((p) => Math.min(p.LeftToeBase[1], p.RightToeBase[1])));
const spd = (f, nm) => { const a = P[Math.max(0, f - 2)][nm], c = P[Math.min(n - 1, f + 2)][nm]; return Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) / ((Math.min(n - 1, f + 2) - Math.max(0, f - 2)) * dt); };
const L = Math.hypot(...[0, 1, 2].map((k) => P[0].LeftUpLeg[k] - P[0].LeftLeg[k])) + Math.hypot(...[0, 1, 2].map((k) => P[0].LeftLeg[k] - P[0].LeftFoot[k]));
for (let f = 0; f < n; f++) {
  cl.push(spd(f, 'LeftFoot') < 0.35 * L && P[f].LeftToeBase[1] - low < 0.06 * L ? 1 : 0);
  cr.push(spd(f, 'RightFoot') < 0.35 * L && P[f].RightToeBase[1] - low < 0.06 * L ? 1 : 0);
}
const d = (x) => ((x * 180) / Math.PI).toFixed(0).padStart(5);
console.log('frames', n, 'dur', (n * dt).toFixed(2), 's  L', L.toFixed(2));
console.log('   t   head chest pelv  footL footR  L R  hipsXZ');
const every = Math.max(1, Math.round(stepS / dt));
for (let f = 0; f < n; f += every) {
  const h = P[f].Hips;
  console.log(`${(f * dt).toFixed(2).padStart(5)} ${d(head[f])} ${d(chest[f])} ${d(pelvis[f])} ${d(fl[f])} ${d(fr[f])}  ${cl[f] ? 'L' : '.'} ${cr[f] ? 'R' : '.'}  ${(h[0] / L).toFixed(2)},${(h[2] / L).toFixed(2)}`);
}
