// Minimal BVH reader + forward kinematics. Usage: import { loadBvh } from './bvh.mjs'
import fs from 'node:fs';

export function loadBvh(path) {
  const txt = fs.readFileSync(path, 'utf8');
  const [hier, motion] = txt.split(/\nMOTION\s*\n/);
  const tok = hier.split(/\s+/).filter(Boolean);
  const joints = [];
  let i = 0;
  const stack = [];
  let chanCount = 0;
  while (i < tok.length) {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: tok[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], chanStart: 0, end: null };
      joints.push(j);
      stack.push(joints.length - 1);
    } else if (t === 'End') {
      i++; // Site
      // { OFFSET x y z }
      i++; // {
      i++; // OFFSET
      const off = [+tok[i++], +tok[i++], +tok[i++]];
      joints[stack[stack.length - 1]].end = off;
      i++; // }
    } else if (t === 'OFFSET') {
      joints[stack[stack.length - 1]].offset = [+tok[i++], +tok[i++], +tok[i++]];
    } else if (t === 'CHANNELS') {
      const n = +tok[i++];
      const j = joints[stack[stack.length - 1]];
      j.chanStart = chanCount;
      for (let k = 0; k < n; k++) j.channels.push(tok[i++]);
      chanCount += n;
    } else if (t === '}') {
      stack.pop();
    }
  }
  const lines = motion.trim().split(/\r?\n/);
  const nFrames = +lines[0].split(':')[1];
  const dt = +lines[1].split(':')[1];
  const frames = lines.slice(2, 2 + nFrames).map((l) => l.trim().split(/\s+/).map(Number));
  return { joints, frames, dt, nFrames };
}

const rot = (axis, deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mul = (A, B) => {
  const R = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return R;
};
const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

/** world positions of every joint (and end sites as name + '_end') for frame f */
export function fk(b, f) {
  const fr = b.frames[f];
  const R = [], P = [];
  const out = {};
  b.joints.forEach((j, k) => {
    let local = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let pos = j.offset.slice();
    j.channels.forEach((ch, q) => {
      const v = fr[j.chanStart + q];
      if (ch.endsWith('position')) pos[{ X: 0, Y: 1, Z: 2 }[ch[0]]] += v;
      else local = mul(local, rot(ch[0], v));
    });
    if (j.parent < 0) {
      R[k] = local;
      P[k] = pos;
    } else {
      const pr = R[j.parent], pp = P[j.parent];
      const o = app(pr, pos);
      P[k] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
      R[k] = mul(pr, local);
    }
    out[j.name] = P[k];
    if (j.end) {
      const e = app(R[k], j.end);
      out[j.name + '_end'] = [P[k][0] + e[0], P[k][1] + e[1], P[k][2] + e[2]];
    }
  });
  return out;
}
