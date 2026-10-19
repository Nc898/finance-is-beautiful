# Motion capture for the gardener

The gardener's walk curves (`src/vine/scene/gardenerWalkData.ts`) and the turn and raking timings in
`src/vine/scene/gardener.ts` come from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), via the
cgspeed BVH conversion hosted at github.com/Shriinivas/cmubvh. CMU places no restrictions on use of the data.
The clips are not kept in the repo; download them from there.

Clips used: 07_01 (walk), 07_04 (slow walk), 69_16 and 69_18 (turn in place), 69_20 and 69_24 (walk with a 90
degree turn), 13_23 and 14_16 (sweep floor, the nearest captured motion to raking).

Regenerating the walk data:

    node dump.mjs 07_01.bvh w1.json
    node dump.mjs 07_04.bvh w4.json
    node extract.mjs normal.json w1.json
    node extract.mjs slow.json w4.json
    node gents.mjs ../../src/vine/scene/gardenerWalkData.ts slow.json normal.json

`turntrace.mjs` and `sweeptrace.mjs` print a clip's timeline (yaw of head, chest and pelvis, feet; or hands, lean
and feet) for reading off turn and stroke timings.
