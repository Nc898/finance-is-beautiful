import { loadBvh, fk } from './bvh.mjs';
import fs from 'node:fs';
const b = loadBvh(process.argv[2]);
const names = ['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','LeftToeBase_end','RightUpLeg','RightLeg','RightFoot','RightToeBase','RightToeBase_end','Spine1','Neck1','Head','Head_end','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'];
const out = [];
for (let f = 0; f < b.nFrames; f++) { const p = fk(b, f); out.push(names.map((n) => p[n])); }
fs.writeFileSync(process.argv[3], JSON.stringify({ names, dt: b.dt, frames: out }));
