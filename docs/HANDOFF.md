# Handoff, 2026-11-12

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
| Bread and Butter | `bread-and-butter.html` | `src/bread` | `BREAD_SPEC.md` |

The landing page groups them by topic (`src/landing/catalog.ts`: topics, the concept each teaches, search words;
`demos.ts` adds each preview painter). There is also an About page (`about.html`, `src/about`).

**The site is live** at https://finance-is-beautiful.vercel.app. Vercel builds every push to `master` (and gives
every other pushed branch a preview address). Vite's hashed files go to `dist/bundle/`, cached for a year by
`vercel.json`. The development harness pages are built only with `vite build --mode harness`.

```bash
npm install
npm run dev                 # Vite dev server
npm run typecheck
npm test                    # Vitest
npx playwright test         # browser tests; the config starts its own server on its own port
```

## State of `master` at handoff

Head is the commit that adds this file, on top of `2af5949`, which is pushed and live. Verified at `2af5949`: type
check clean, 649 unit tests pass, the 52 Bread browser tests pass, and the production build succeeds. The full
browser suite (693 tests, about 2 hours locally) last passed at `253557a`, before the Nov 12 changes, which touched
only Bread and Butter.

### Done since the last handoff (Nov 5 to 11)

1. **The site went live on Vercel** (above). The landing grove is painted fully grown on load (the growing animation
   was dropped as too laggy for a first visit). The foliage atlas and paper tile are lossless WebP.
2. **About page:** the owner's own text, centred, a back arrow, watercolor washes in the side margins only, LinkedIn
   and an Instagram placeholder (also at the top right of the landing page).
3. **Landing by topic:** demos grouped under "Investing", "Loans and debt" and "Prices and inflation", each described
   by the concept it teaches. `searchCatalog` is ready for a search field once there are around ten demos.
4. **Bread and Butter** (new, built with the recipe in QUALITY_BAR section 3; spec `docs/BREAD_SPEC.md`):
   - Real BLS prices for six items and median weekly pay, monthly from January 1980 (`scripts/fetch-bread-data.mjs`
     writes `src/bread/engine/data.ts`; re-run it to update). The headline is the minutes of work the basket costs.
   - A lamplit corner grocery on a rainy morning. **Since Nov 12** (owner's choice, see QUALITY_BAR's rejected
     table): a split-flap price board (`board.ts`) shows the same month as the labels at every moment, each changed
     cell flapping once from the old figure to the new; the grocer (`grocer.ts`) rings up the basket at the counter
     (weighs on the scale, letting go while the needle swings; keys the till; turns the crank; shuts the drawer) at
     his natural pace (a round about 33 s) and never goes to the board. The till's and the scale's moving parts are
     in `fixtures.ts`, left out of the baked counter. 1× is a year every 6 s (about 4.7 minutes in all).
   - The grocer has his own head painter (`grocerHead.ts`) in a storybook register, by the owner's direction: 48
     head views (16 at load, the rest painted in the background), a glance in about a third of a second.
   - Landing card: theme `grocer` (twine and price tags, chalkboard slate); preview baked by
     `scripts/bake-bread-preview.mjs`.

### Earlier: Low-Hanging Fruit (Nov 2 to 4)

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

1. **Bread and Butter, known weak spots** (none blocking; the owner has seen the demo live):
   - the sleeve reads as a pale box when the grocer's upper arm points at the viewer (reaching under the counter);
   - his nose is faint in three-quarter view, and the skin a little pink-orange;
   - in a turn, two head views cross-fade, so the pencil or an ear can show twice for a frame or two;
   - one hand shape for every grip (a key press reads as a knuckle press); the basket pieces are a little small,
     and the wrapped chicken reads weakly;
   - the till's drawer slides toward the viewer and he presses it from above (a simplification);
   - his legs are hidden behind the counter all round, so foot sliding couldn't be checked by eye;
   - the harness's frame times show spikes (the pose cache repaints nearly every frame while he moves); the real
     page held 60 fps headless, about 2 ms of work a frame;
   - not checked on a real GPU or a modest machine, or on phones beyond the label layout.
   - `geom.ts` keeps BOARD_LINES and BOARD_COLUMNS, now unused by the grocer; they can go.
2. **Slow scene builds:** Nip It in the Bud and Low-Hanging Fruit take 8 to 10 s to build their scenes. The owner
   said "Not now"; don't start on it unasked.
3. **Two open draft PRs from the cloud session (Nov 5):** #2 "A Little Off the Top" (fees demo, judged a rehash of
   Time to Grow; see QUALITY_BAR section 12) and #1 the orchard short-canvas fix (item 5 below). Don't merge or close
   them without asking.
4. **Waiting on the user: round length.** With real-time walking, a Low-Hanging Fruit round at 1× is now
   **30–43 s**, depending on which slot is planted. It was 18–24 s. Picking starts about 10 s into a play and the
   tip lands at 20–29 s, so every play still shows crates → bough → tree. The user has not yet said whether that is
   acceptable. If they want it shorter, shorten the routes (crates or picking spots closer, a shorter way back)
   rather than speeding the walk back up; the gait is now correct. `docs/ORCHARD_SPEC.md` already describes the
   new timing, so update it if the timing changes.
5. **Known bug, older:** `src/orchard/scene/flowers.ts` `yarrow()` gets a negative arc
   radius when the canvas is shorter than the header and label bands plus about 80 px, and the scene build throws.
   It's seen only with a tiny or hidden viewport. Fix: a one-line guard (clamp the radius to ≥ 0, or skip
   flowers when the band has no height). Draft PR #1 has a fix.
6. **Preview still:** `preview-orchard.webp` was baked before the walk change. It is a still frame, so it is
   probably fine; re-bake it only if the pickers in it look off.
7. **Unmerged remote branch `river-style-pass-wip`:** a stash-style commit, "river partial style pass + app
   followups (paused for review)", made on top of the first river pass. `river-watercolor` was merged later and
   superseded most of it. Don't merge or delete it without asking the user.

## Conventions

- **Commit subjects:** `Demo Name: what changed, in plain words`. See `git log`.
- **Git author:** `Nick <nlevichilds@gmail.com>`. End commit messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pushing:** push only when the user asks. They review before pushing. A push to `master` is a release: Vercel
  puts it live within a minute or two. Run `npx vite build` first and check its exit status directly (a failed
  build once went out because the check read a pipe's status); Vercel keeps serving the last good build if one
  fails.
- **The full browser suite rewrites `docs/screens/e2e/*.png`.** Restore them (`git checkout -- docs/screens`) unless
  the change is meant to update them.
- **The shared gait is used by four demos** (snow, brick, vine, orchard). Changes to `climberGait.ts` must be
  opt-in, or verified on all four (`npx playwright test` covers each one's scene harness).
- **Screenshots:** verification screenshots stay out of the repo (`d6e2ffd`). Put them in `test-results/` or a
  scratch folder, or add a `.gitignore` entry if they must live under `docs/screens/`.
- **Explaining decisions:** comments explain *why*, with the source when a number comes from data, for example
  the CMU fits in `pickerFigure.ts`.
