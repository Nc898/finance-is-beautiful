// Turn one or more straight BVH walks (dumped by dump.mjs) into the gardener's walk curves, in the rig's own terms.
// Usage: node extract.mjs out.json w1.json [w4.json ...]
//
// Conventions of the output (all mirrored and averaged over both sides):
//  - foot curves over the foot's own phase psi (0 = its heel strike), body curves over the cycle phase phi
//    (0 = heel strike of the rig's foot 0, i.e. the subject's right foot; foot 1 strikes at 0.5);
//  - lengths in leg lengths (hip joint to ankle), arm positions in arm lengths (shoulder to wrist);
//  - lateral values positive toward the rig's foot-0 side (the subject's right).
import fs from 'node:fs';

const M = 64;
const files = process.argv.slice(3);
const acc = [];
for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ix = Object.fromEntries(d.names.map((n, i) => [n, i]));
  const F = d.frames, dt = d.dt, n = F.length;
  const J = (f, name) => F[f][ix[name]];
  const h0 = J(0, 'Hips'), h1 = J(n - 1, 'Hips');
  let fx = h1[0] - h0[0], fz = h1[2] - h0[2];
  const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
  const along = (p) => p[0] * fx + p[2] * fz;
  // lateral: positive toward the subject's RIGHT (the rig's foot 0)
  let lx = -fz, lz = fx;
  {
    let s = 0;
    for (let f = 0; f < n; f++) s += (J(f, 'RightUpLeg')[0] - J(f, 'LeftUpLeg')[0]) * lx + (J(f, 'RightUpLeg')[2] - J(f, 'LeftUpLeg')[2]) * lz;
    if (s < 0) { lx = -lx; lz = -lz; }
  }
  const lat = (p) => p[0] * lx + p[2] * lz;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const L = dist(J(0, 'LeftUpLeg'), J(0, 'LeftLeg')) + dist(J(0, 'LeftLeg'), J(0, 'LeftFoot'));
  const ARM = dist(J(0, 'LeftArm'), J(0, 'LeftForeArm')) + dist(J(0, 'LeftForeArm'), J(0, 'LeftHand'));
  // floor from the lowest toe heights along the walk
  const bins = new Map();
  for (let f = 0; f < n; f++) for (const s of ['Left', 'Right']) {
    const t = J(f, s + 'ToeBase');
    const k = Math.round(along(t) / 2);
    if (!bins.has(k) || bins.get(k)[1] > t[1]) bins.set(k, [along(t), t[1]]);
  }
  const bp = [...bins.values()];
  const mx = bp.reduce((s, p) => s + p[0], 0) / bp.length, my = bp.reduce((s, p) => s + p[1], 0) / bp.length;
  const slope = bp.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / bp.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const up = (p) => p[1] - (my + slope * (along(p) - mx));
  const walkV = Math.abs(along(h1) - along(h0)) / ((n - 1) * dt);
  const speedOf = (name, f) => {
    const f0 = Math.max(0, f - 2), f1 = Math.min(n - 1, f + 2);
    const a = J(f0, name), b = J(f1, name);
    return Math.hypot(b[0] - a[0], b[2] - a[2]) / ((f1 - f0) * dt);
  };
  const ev = { Left: [], Right: [] };
  for (const s of ['Left', 'Right']) {
    let on = speedOf(s + 'Foot', 0) < 0.3 * walkV;
    for (let f = 1; f < n; f++) {
      if (!on && speedOf(s + 'Foot', f) < 0.3 * walkV) { on = true; ev[s].push({ f, e: 'HS' }); }
      else if (on && speedOf(s + 'ToeBase', f) > 0.3 * walkV && speedOf(s + 'Foot', f) > 0.3 * walkV) { on = false; ev[s].push({ f, e: 'TO' }); }
    }
  }
  const hipMid = (f) => { const a = J(f, 'LeftUpLeg'), b = J(f, 'RightUpLeg'); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; };
  // per side: cycles from its heel strike to the next
  for (const side of ['Right', 'Left']) {
    const other = side === 'Right' ? 'Left' : 'Right';
    const hs = ev[side].filter((e) => e.e === 'HS').map((e) => e.f);
    for (let k = 0; k + 1 < hs.length; k++) {
      const a = hs[k], b = hs[k + 1];
      const to = ev[side].find((e) => e.e === 'TO' && e.f > a && e.f < b);
      if (!to) continue;
      const smp = (fn) => {
        const out = [];
        for (let q = 0; q < M; q++) {
          const t = a + ((b - a) * q) / M;
          const f0 = Math.floor(t), u = t - f0;
          const v0 = fn(f0), v1 = fn(Math.min(n - 1, f0 + 1));
          out.push(Array.isArray(v0) ? v0.map((x, i) => x + (v1[i] - x) * u) : v0 + (v1 - v0) * u);
        }
        return out;
      };
      const sg = side === 'Right' ? 1 : -1; // mirror lateral quantities into the foot-0 frame
      const meanOf = (fn) => { let s = 0; for (let f = a; f < b; f++) s += fn(f); return s / (b - a); };
      const hipH = meanOf((f) => up(hipMid(f)));
      const latMean = meanOf((f) => lat(hipMid(f)));
      const yawOf = (pr, pl) => Math.atan2(along(pr) - along(pl), lat(pr) - lat(pl)); // + when the right side is ahead
      const pelYaw = (f) => sg * yawOf(J(f, 'RightUpLeg'), J(f, 'LeftUpLeg'));
      const startA = along(hipMid(a)), endA = along(hipMid(b));
      // swing of this foot, from its toe-off to its next heel strike: progress along the walk and lift
      const tA = along(J(to.f, side + 'Foot')), bA = along(J(b, side + 'Foot'));
      const tH = up(J(to.f, side + 'Foot')), bH = up(J(b, side + 'Foot'));
      const swing = [];
      for (let q = 0; q < M; q++) {
        const t = to.f + ((b - to.f) * q) / (M - 1);
        const f0 = Math.min(n - 2, Math.floor(t)), u = t - f0;
        const p0 = J(f0, side + 'Foot'), p1 = J(f0 + 1, side + 'Foot');
        const A = along(p0) + (along(p1) - along(p0)) * u;
        const Hh = up(p0) + (up(p1) - up(p0)) * u;
        const s = q / (M - 1);
        swing.push([(A - tA) / (bA - tA), (Hh - (tH + (bH - tH) * s)) / L]);
      }
      // stance ankle height at mid stance, as the reference for "flat"
      const mid = Math.round(a + (to.f - a) * 0.45);
      const flatPitch = (() => { const p = J(mid, side + 'Foot'), t = J(mid, side + 'ToeBase'); return Math.atan2(t[1] - p[1], along(t) - along(p)); })();
      acc.push({
        file, side, L, ARM,
        cycleT: (b - a) * dt,
        toe: (to.f - a) / (b - a),
        oppHS: (() => { const o = ev[other].find((e) => e.e === 'HS' && e.f > a && e.f < b); return o ? (o.f - a) / (b - a) : null; })(),
        speed: walkV / L,
        stride: (endA - startA) / L,
        hipH: hipH / L,
        bob: smp((f) => (up(hipMid(f)) - hipH) / L),
        sway: smp((f) => sg * (lat(hipMid(f)) - latMean) / L),
        surge: smp((f) => (along(hipMid(f)) - (startA + (endA - startA) * (f - a) / (b - a))) / L),
        pelYaw: smp(pelYaw),
        pelRoll: smp((f) => { const r = J(f, 'RightUpLeg'), l = J(f, 'LeftUpLeg'); return sg * Math.atan2(r[1] - l[1], Math.abs(lat(r) - lat(l))); }),
        thxYaw: smp((f) => sg * yawOf(J(f, 'RightArm'), J(f, 'LeftArm')) - pelYaw(f)),
        pitch: smp((f) => { const p = J(f, side + 'Foot'), t = J(f, side + 'ToeBase'); return Math.atan2(t[1] - p[1], along(t) - along(p)) - flatPitch; }),
        swing,
        // this side's arm (it is the rig's arm 0 when side is Right; lateral outward is positive)
        wrist: smp((f) => { const sh = J(f, side + 'Arm'), w = J(f, side + 'Hand'); return [(along(w) - along(sh)) / ARM, sg * (lat(w) - lat(sh)) / ARM, (w[1] - sh[1]) / ARM]; }),
        elbow: smp((f) => { const sh = J(f, side + 'Arm'), w = J(f, side + 'ForeArm'); return [(along(w) - along(sh)) / ARM, sg * (lat(w) - lat(sh)) / ARM, (w[1] - sh[1]) / ARM]; }),
      });
    }
  }
}
// keep only steady cycles: duration near the median, the other foot striking near half way
{
  const med = acc.map((r) => r.cycleT).sort((x, y) => x - y)[Math.floor(acc.length / 2)];
  for (let i = acc.length - 1; i >= 0; i--) {
    const r = acc[i];
    if (Math.abs(r.cycleT / med - 1) > 0.12 || r.oppHS === null || Math.abs(r.oppHS - 0.5) > 0.06) acc.splice(i, 1);
  }
}
const avg = (key) => {
  const rows = acc.map((r) => r[key]);
  return rows[0].map((_, q) => {
    const vs = rows.map((r) => r[q]);
    return Array.isArray(vs[0]) ? vs[0].map((__, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length) : vs.reduce((s, v) => s + v, 0) / vs.length;
  });
};
const mean = (key) => acc.reduce((s, r) => s + r[key], 0) / acc.length;
console.log(acc.map((r) => `${r.file.slice(-7)} ${r.side} T=${r.cycleT.toFixed(2)} toe=${r.toe.toFixed(2)} opp=${r.oppHS?.toFixed(2)} stride=${r.stride.toFixed(2)} v=${r.speed.toFixed(2)}`).join('\n'));
const out = {
  cycles: acc.length,
  cycleT: mean('cycleT'), toe: mean('toe'), speed: mean('speed'), stride: mean('stride'), hipH: mean('hipH'),
  bob: avg('bob'), sway: avg('sway'), surge: avg('surge'), pelYaw: avg('pelYaw'), pelRoll: avg('pelRoll'), thxYaw: avg('thxYaw'),
  pitch: avg('pitch'), swing: avg('swing'), wrist: avg('wrist'), elbow: avg('elbow'),
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const round = (v) => (Array.isArray(v) ? v.map(round) : typeof v === 'number' ? r3(v) : v);
fs.writeFileSync(process.argv[2], JSON.stringify(round(out)));
const rng = (arr) => { const v = arr.map((x) => (Array.isArray(x) ? x : [x])); return v[0].map((_, q) => { const c = v.map((y) => y[q]); return `${Math.min(...c).toFixed(3)}..${Math.max(...c).toFixed(3)}`; }).join(' | '); };
console.log('cycleT', out.cycleT.toFixed(3), 'toe', out.toe.toFixed(3), 'speed', out.speed.toFixed(3), 'stride', out.stride.toFixed(3), 'hipH', out.hipH.toFixed(3));
for (const k of ['bob', 'sway', 'surge', 'pelYaw', 'pelRoll', 'thxYaw', 'pitch', 'swing', 'wrist', 'elbow']) console.log(k, rng(out[k]));
