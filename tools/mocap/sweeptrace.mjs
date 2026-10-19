// Trace a sweeping clip in the body's frame: hands, pelvis, lean, feet. Usage: node sweeptrace.mjs dump.json [step_s] [from] [to]
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const stepS = +(process.argv[3] || 0.1);
const ix = Object.fromEntries(d.names.map((n, i) => [n, i]));
const F = d.frames, dt = d.dt, n = F.length;
const J = (f, nm) => F[f][ix[nm]];
const from = Math.round(+(process.argv[4] || 0) / dt), to = Math.min(n, Math.round(+(process.argv[5] || 1e9) / dt));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const L = dist(J(0, 'LeftUpLeg'), J(0, 'LeftLeg')) + dist(J(0, 'LeftLeg'), J(0, 'LeftFoot'));
const low = Math.min(...F.map((fr) => Math.min(fr[ix.LeftToeBase][1], fr[ix.RightToeBase][1])));
// body frame: pelvis facing (normal to the hip line), at each frame
const deg = (x) => ((x * 180) / Math.PI).toFixed(0).padStart(4);
console.log('dur', (n * dt).toFixed(2), 'L', L.toFixed(2));
console.log('    t  pelvYaw chestYaw lean | hipF hipL hipH | Lwr(f,l,h)      | Rwr(f,l,h)      | feet');
for (let f = from; f < to; f += Math.max(1, Math.round(stepS / dt))) {
  const l = J(f, 'LeftUpLeg'), r = J(f, 'RightUpLeg');
  const yaw = Math.atan2(-(l[2] - r[2]), l[0] - r[0]); // facing direction angle (0 = +Z)
  const fx = Math.sin(yaw), fz = Math.cos(yaw); // forward
  const lx = fz, lz = -fx; // to the left? (perpendicular)
  const hm = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  const rel = (p) => [((p[0] - hm[0]) * fx + (p[2] - hm[2]) * fz) / L, ((p[0] - hm[0]) * lx + (p[2] - hm[2]) * lz) / L, (p[1] - low) / L];
  const la = J(f, 'LeftArm'), ra = J(f, 'RightArm');
  const chestYaw = Math.atan2(-(la[2] - ra[2]), la[0] - ra[0]);
  const nk = J(f, 'Neck1');
  const lean = Math.atan2((nk[0] - hm[0]) * fx + (nk[2] - hm[2]) * fz, nk[1] - hm[1]);
  const lw = rel(J(f, 'LeftHand')), rw = rel(J(f, 'RightHand'));
  const lf = rel(J(f, 'LeftFoot')), rf = rel(J(f, 'RightFoot'));
  const v = (a) => a.map((x) => x.toFixed(2).padStart(5)).join(',');
  console.log(`${(f * dt).toFixed(2).padStart(5)} ${deg(yaw)} ${deg(chestYaw - yaw)} ${deg(lean)} | ${(hm[1] - low) / L > 0 ? ((hm[1] - low) / L).toFixed(2) : '?'} | ${v(lw)} | ${v(rw)} | L ${v(lf.slice(0, 2))} R ${v(rf.slice(0, 2))}`);
}
