# Time to Grow

An interactive watercolor illustration of compound growth. Two trees share one landscape, one timeline, the same
monthly contribution and the same assumed return. Only their starting ages differ. A guided ~54-second story
(planting → growing through time → seeing the difference) hands off to free exploration of the same scene.

## Setup

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # financial engine + story/store unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright; first run: npx playwright install chromium)
npm run build        # typecheck + production build into dist/
```

Extra pages for development: `/slice.html` (one tree, maturity scrubber, determinism self-check) and
`/scene-test.html` (two-tree scene harness: maturities, planting, pulse, loupe, reduced motion, perf).

## Controls

| Control | What it does |
|---|---|
| Play / Pause, Replay story, Skip to explore | Story transport. Space toggles play when focus isn't in a field. |
| Speed 0.5× – 4× | Applies to the story and to explore playback (explore 1× = 2 years per second). |
| Age timeline | Drag or use ← → (1 month), PageUp/PageDown (1 year), Home/End. Scrubbing during the story switches to explore at that age. |
| Tree A starts / Tree B starts / Ends at | Whole years, 16–90. A starting age may equal the ending age (no growing time). |
| Monthly contribution | $0 – $5,000, shared by both trees. |
| Assumed annual return | −5% to 12%, effective annual rate, shared. |
| Reduce motion | Also follows the OS setting. No wind or pulses, no autoplay; the story steps through stable holds. |
| How this is calculated | Per-tree table at the current age, conventions, and the tree-size note. |

Invalid entries show a plain-language error beside the field; the scene keeps the last valid scenario.
If inputs change during playback the shared age is kept when still on the new timeline, clamped to its start if
earlier, or clamped to its end (and paused) if later.

## Calculation assumptions

Implemented in `src/engine/` as pure functions, independent of rendering.

- Monthly steps, **end-of-month** contributions. A tree receives nothing before its starting age; starting at 25 and
  ending at 65 is exactly 480 contributions.
- The annual input is an **effective** annual return: `monthly rate = (1 + r)^(1/12) − 1`.
- Each month: `balance = previous balance × (1 + monthly rate) + contribution`.
- Balance, cumulative contributions and modeled growth (balance − contributions) are tracked separately at full
  float64 precision; rounding happens only in display formatting.
- Constant hypothetical return, growth reinvested, no taxes, fees or inflation. Actual returns vary and are not
  guaranteed. This is an illustration, not a forecast or recommendation; there is no live market data.
- Negative returns are supported down to −5%: balances still rise with contributions but modeled growth is negative.

Default comparison (25 vs 35 → 65, $200/month, 6%): Tree A $381,536 ($96,000 contributed), Tree B $194,903
($72,000 contributed). Of the $186,633 difference, $24,000 is Tree A's extra contributions and $162,633 is extra
modeled growth. Verified against the closed-form ordinary-annuity future value in `tests/engine.test.ts`.

Note: some calculators (e.g. Investor.gov's) treat the rate as nominal and divide by the compounding frequency;
6% nominal compounded monthly would give slightly larger balances than the effective-rate convention used here.

## How tree size relates to money

`maturity = clamp(√(balance / S), 0, 1)` where `S = max(final balance A, final balance B, $25,000)` for the current
inputs. Tree height and spread scale linearly with maturity, so the illustrated area grows roughly in proportion to
the balance. Both trees always use the same `S`, ground line, camera and scale. `S` changes only when inputs change,
and eases smoothly for both trees together; it never rescales during playback. The trees illustrate growth and are
not a literal dollar scale, so exact amounts are always shown as text.

## Rendering architecture

- **One source of truth** (`src/app/store.ts`): inputs, scenario, shared `ageMonths` clock, mode (story/explore),
  playback, speed. One `requestAnimationFrame` loop (`src/app/loop.ts`) advances the clock, derives snapshots
  ('smooth' for visuals, 'exact' month-end values for numbers), maps balance → maturity and renders. The story
  (`src/app/story.ts`) is a pure function of story time, so pause, replay, skip and speed cannot drift.
- **Scene** (`src/scene/`, contract in `src/scene/types.ts`): Canvas 2D. The scene never sees money, only maturity.
  - `treeModel.ts`: seeded PRNG (mulberry32), drawn only at generation. Each seed produces a full mature tree once:
    a crown-space foliage model (≈130 clumps in a normalized dome, ordered so any prefix fills the crown) plus a
    hierarchical skeleton (trunk → 2–3 scaffold limbs → secondaries, pipe-model radii) and roots. Every element has a
    birth maturity, so growth only adds, structure is stable and the same maturity always gives the same tree.
  - `treePainter.ts`: layered painting — back shadow masses → roots, trunk, limbs, twigs → mid clumps → front lit
    clumps → glazes and splatter. Bark is built from layered washes, granulation, striations and a broken ink contour.
  - `watercolor.ts`, `sprites.ts`: watercolor clump sprites from recursive polygon deformation with many low-alpha
    layers, edge darkening, granulation, leaf dabs and ink leaf marks. They are pre-rendered once; each frame is only
    paths and `drawImage`.
  - `backdrop.ts`: paper, meadow wash and soil cut-away are painted once per size and shown as the canvas CSS
    background, so per-frame work is only the trees.
  - Loupe (close-detail inset), contribution pulse and wind are decorative and never change growth state.
- **Reusable illustration assets** (`public/assets/`): `foliage-atlas.png` + `foliage-atlas.json` (watercolor clump
  sprites) and `paper-tile.png`, baked from the procedural generators with `node scripts/bake-assets.mjs` (needs the
  dev server on :5174). At runtime the atlas is used when present, and the app falls back to procedural generation.
- **UI** (`index.html`, `src/app/ui.ts`, `src/styles/main.css`): semantic native controls, DOM labels positioned with
  `scene.anchorsFor`, one polite live region for discrete events only, a non-live text summary, and the details table.
  Fonts are self-hosted with @fontsource (Libre Caslon Display/Text, Figtree).

Design notes, sources and decisions: `docs/NOTES.md`; experience spec: `docs/APP_SPEC.md`; testing:
`docs/TESTING.md`.
