# Handoff — 2026-11-04

For the next session picking up this repo (cloud or local).

**First read `docs/QUALITY_BAR.md` in full.** It holds the owner's standard for concept, art, motion and process.
Then read this file, the spec of the demo you are touching (`docs/*_SPEC.md`), `docs/NOTES.md` (decisions log,
design tokens) and `docs/TESTING.md`.

Do not start a new demonstration, or change an existing demo's concept, unless the owner has chosen it.

## What this is

"Finance is beautiful": a landing page (`/`) listing hand-painted Canvas 2D demonstrations of money ideas. Vite +
vanilla TypeScript, Vitest unit tests, Playwright browser tests. Demos (`src/landing/demos.ts`):

| Demo | Page | Source | Spec |
|---|---|---|---|
| Time to Grow | `time-to-grow.html` | `src/scene`, `src/app` | `APP_SPEC.md` |
| Against the Current | `against-the-current.html` | `src/river` | `RIVER_SPEC.md` |
| Nip It in the Bud | `nip-it-in-the-bud.html` | `src/vine` | `VINE_SPEC.md` |
| On a Roll | `on-a-roll.html` | `src/snow` | `SNOW_SPEC.md` |
| Brick by Brick | `brick-by-brick.html` | `src/brick` | `BRICK_SPEC.md` |
| Low-Hanging Fruit | `low-hanging-fruit.html` | `src/orchard` | `ORCHARD_SPEC.md` |

```bash
npm install
npm run dev                 # Vite dev server
npm run typecheck
npm test                    # Vitest
npx playwright test         # browser tests; the config starts its own server on its own port
```

## State of `master` at handoff

Head is the commit that adds this file, on top of `80bcc6c`. All of it is pushed to `origin/master`.
Verified at `80bcc6c`: type check clean, 583 unit tests pass, 62 desktop browser tests pass (orchard, snow, brick,
vine).

### Done in the last session (Low-Hanging Fruit)

1. `28b13aa` **Two visual fixes.**
   - **Tipping stays in view:** slots are a foreshortened lattice (`src/orchard/scene/geom.ts`, `LATTICE`). The
     plot outline follows the slots (`plotSpan` in `ground.ts`), so every tipping stays in view.
   - **Low fruit on twigs:** the low fruit hangs on drawn twigs from the bough (`pickerFruit.ts`: `twigCurve`,
     `drawTwig`, `Hanging.sag`). Before, the apples floated.
   - Preview `public/assets/preview-orchard.webp` re-baked.
2. `80bcc6c` **The pickers' walk fitted to CMU motion capture** (subject 07, trials 07_01 brisk and 07_04 slow).
   The hips used to sink at nearly every step. Causes and fixes:
   - **Sped-up clock:** the picker's 1.9× crew clock (`CREW_TIME`, `picker.ts`) also ran its walks, so they played
     at running cadence. The clock now eases to real time (`WALK_TIME`) while walking.
   - **Strides lengthened instead of quickening:** the shared gait (`src/snow/scene/climberGait.ts`) grew stride
     length faster than step rate. Two new opt-in hooks fix this, `followLaw` (step time as a function of speed)
     and `stepMax` (longest step). Only the picker sets them, so snow, brick and vine are unchanged. The picker's
     law is in `pickerFigure.ts`: `CMU_WALK`, step time ∝ speed^−0.76, fitted to the two trials, with
     `STEP_MAX` 0.98 leg.
   - **Crouched rig:** the rig walked low and the knees never straightened. It now walks higher
     (`WALK_DROP` 1.5), the knees straighten fully (`WALK_REACH` 1), and the pelvis is carried 0.09 leg ahead of
     the feet (`WALK_LEAD`).
   - **Route geometry, the worst drops:** corners are now wide quadratic bends (`CORNER_R` 45) with Chaikin
     smoothing. The lead slows into bends (`TURN_*`, floor `TURN_VMIN` 32). The body turns slightly into a coming
     bend, at most `FACE_LEAD` off the way the steps go. Without that cap it walks crabwise.
   - **Result:**

     | | Before | After | Subject 07 |
     |---|---|---|---|
     | Brisk walk, per step | 1.15 leg | 0.94 leg at 118 steps/min | 0.92 leg at 111 steps/min |
     | Stance knee | bent 30–55° | 29° → 19° | 31° → 1° |
     | Hips below the captured bob | ~1/3 of walking time | ~4% of walking time | |

     The drops that remain are brief, at the tightest turns.
   - **Mocap clips:** not kept in the repo. Source and regeneration steps are in `tools/mocap/README.md` (that
     README documents the vine gardener; the picker uses the same clips, and its constants were fitted by hand
     from them).

## Open items, in priority order

1. **Waiting on the user: round length.** With real-time walking, a Low-Hanging Fruit round at 1× is now
   **30–43 s**, depending on which slot is planted. It was 18–24 s. Picking starts about 10 s into a play and the
   tip lands at 20–29 s, so every play still shows crates → bough → tree. The user has not yet said whether that is
   acceptable. If they want it shorter, shorten the routes (crates or picking spots closer, a shorter way back)
   rather than speeding the walk back up; the gait is now correct. `docs/ORCHARD_SPEC.md` already describes the
   new timing, so update it if the timing changes.
2. **Known bug, existed before the last session:** `src/orchard/scene/flowers.ts` `yarrow()` gets a negative arc
   radius when the canvas is shorter than the header and label bands plus about 80 px, and the scene build throws.
   It's seen only with a tiny or hidden viewport. Fix: a one-line guard (clamp the radius to ≥ 0, or skip
   flowers when the band has no height).
3. **Preview still:** `preview-orchard.webp` was baked before the walk change. It is a still frame, so it is
   probably fine; re-bake it only if the pickers in it look off.
4. **Unmerged remote branch `river-style-pass-wip`:** a stash-style commit, "river partial style pass + app
   followups (paused for review)", made on top of the first river pass. `river-watercolor` was merged later and
   superseded most of it. Don't merge or delete it without asking the user.

## Conventions

- **Commit subjects:** `Demo Name: what changed, in plain words`. See `git log`.
- **Git author:** `Nick <nlevichilds@gmail.com>`. End commit messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pushing:** push only when the user asks. They review before pushing.
- **The shared gait is used by four demos** (snow, brick, vine, orchard). Changes to `climberGait.ts` must be
  opt-in, or verified on all four (`npx playwright test` covers each one's scene harness).
- **Screenshots:** verification screenshots stay out of the repo (`d6e2ffd`). Put them in `test-results/` or a
  scratch folder, or add a `.gitignore` entry if they must live under `docs/screens/`.
- **Explaining decisions:** comments explain *why*, with the source when a number comes from data, for example
  the CMU fits in `pickerFigure.ts`.
