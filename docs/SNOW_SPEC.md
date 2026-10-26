# On a Roll — spec (coordinator-owned)

Fourth demonstration in the "Finance is beautiful" collection, the second of three about debt. Same world as
Time to Grow, Against the Current and Nip It in the Bud: warm ivory paper, **ink drawing under watercolor washes**,
light from the upper left, quiet type (Libre Caslon Display / Text italic, Figtree), collapsible right-hand
controls panel, guided story that hands off to exploration, 60 fps. The art must hold up beside the other three
at 2× (the user's standing rule: never present art below the sister demos).

Season: **winter**, with **pine trees**. Sky: **gentle snowfall** from a soft pale sky. Working title "On a Roll"
(an idiom like the other three: a run of wins, which is the snowball method's whole appeal, and the debts roll).

## The lesson (one sentence)
Paying several debts with the same monthly budget, the avalanche (highest rate first) costs less, while the
snowball (smallest first) brings the first win much sooner; both clear everything in about the same time.
Honest, hopeful, never preachy: neither is "wrong".

## Math (src/snow/engine, pure, tested; contract in src/snow/types.ts)
- Three debts (medical bill, car loan, credit card), each with a balance, an APR and a fixed minimum payment, and
  one monthly budget shared by both strategies.
- Each month, in order: interest on every debt still owed (`balance × apr / 12`); every minimum (capped at what is
  owed); then whatever is left of the budget goes to the debts in the strategy's order, cascading to the next one
  when a debt clears mid-month. So when a debt is cleared, its payment rolls on to the next (the budget stays the
  same). The order is fixed at the start: snowball by smallest starting balance (ties: higher rate first);
  avalanche by highest rate (ties: smaller balance first).
- Simulate until every balance is under half a cent, or MAX_MONTHS (720).
- Fractional months as the vine: smooth figures move linearly within a month; statement figures (owed, interest
  charged) step at INTEREST_AT = 0.2 and PAYMENT_AT = 0.62 of the month; `statementMonth` for the clock.
- Defaults (medical $1,000 at 0% min $40; car $6,000 at 6% min $180; card $12,000 at 26% min $300; budget $800;
  first month's interest $290, minimums $520, extra $280), verified independently:
  - snowball: medical cleared month 4, car 15, card 32; debt-free in 32 months (2 years, 8 months);
    $6,295.45 interest. Owed after month 12: medical $0, car $1,253, card $11,458.
  - avalanche: card cleared month 28, medical 25 (on its minimums alone), car 30; debt-free in 30 months
    (2 years, 6 months); $4,642.46 interest. Owed after month 12: medical $520, car $4,150, card $7,668.
  - avalanche saves $1,653 and 2 months; snowball's first win comes 21 months sooner (month 4 vs 25).
- Validation like the vine (finite numbers, ranges in SNOW_LIMITS), plus: each minimum must cover its debt's first
  month of interest ("at least $261 to cover the interest"), and the budget must be at least the sum of the
  minimums ("at least $520, the three minimums"). APR 0 is valid. If the budget equals the minimums, or both
  orders are the same, the two hills are identical and the story says so plainly.
- Assumptions note: fixed rates and fixed minimum payments, no new borrowing, fees or penalties; real minimums
  vary; illustration only, not advice.

## Scene (src/snow/scene, Canvas 2D, contract SnowSceneAPI in src/snow/types.ts, geometry in geom.ts)
Composition (world 1000 × 640, geometry fixed in geom.ts; read its header):
- Sky: soft pale winter sky, grey-blue at the top warming to cream at the horizon, graded watercolor washes with
  gentle variegation; a faint, hazy low sun in the upper left (the light for the whole picture) behind thin
  cloud. No hard clouds.
- Distance: blue-violet mountains with snowfields, then nearer ridges with dark pine woods, atmospheric
  perspective (paler and cooler with distance).
- **Pine trees** everywhere, the signature of the scene: a pine wood along each hill's crest (behind the lanes),
  a few big pines framing the far left and right edges, a stand in the valley between the hills. Painted in the
  collection's hand: an ink-drawn trunk and drooping tiered boughs, layered translucent green washes (deep
  blue-green in shade, warmer green lit from the upper left), snow lying on top of every bough (paper white with a
  cool blue-violet underside), broken dry-brush edges, a few bare twigs. Seeded and varied (tall spruce, broader
  fir, a young one), never a stamped repeat. Pre-rendered into sprites.
- The two hillsides (HILL, CREST_Y, FOOT_Y): rolling snow slopes in white and pale blue-violet shadow washes with
  soft pencil contours, a few rocks and dry grass stalks poking through, wind ripples. A frozen creek winds down
  the valley between them toward us (blue-grey ice, snowy banks), with a small plank footbridge near the front.
- The lanes (LANES): faint but readable tracks down each slope (the ball's rolled track is pressed snow with a
  cool blue shadow along its edges, drawn only above the ball, i.e. where it has already rolled). A snowbank
  along each hill's foot (FOOT_Y) where the lanes end.
- Each hill's sledge (REST) at its outer foot: a wooden sledge, ink and wash; the climber sits on it at the end.
- Ambient motion: snowfall in three depths (far: fine and slow; near: larger soft flakes, a gentle sway), never
  popping in or out (fade in high up, settle and fade on the ground); a little powder blowing off the crest now and
  then; pine boughs shed a puff of snow occasionally. All off in reduced motion.

The snowballs (three per hill, the heart of the picture):
- Each is a debt. Painted as a packed snowball: paper-white lit side toward the upper left, blue-violet shadow
  side and a soft contact shadow, a lumpy hand-drawn ink contour, a few darker packed-snow speckles and twigs that
  turn with it as it rolls (so the rolling reads), never a flat vector circle.
- Size: `ballRadius(size, y)` in geom.ts, painted area proportional to the balance (both hills on one scale).
- Place: `lanePoint(id, debt, progress)`; the ball rolls (its markings turn by distance / radius, no sliding).
- Interest is snow settling: flakes visibly drift down onto each ball at a rate set by its `snowfall` (none on a
  0% debt, thickest on the card), each adding a little fresh powder where it lands. The ball's growth is exactly
  the balance's growth: the flakes are how we see it happen.
- Payments roll it away: as `progress` increases the ball moves down its lane, and as `size` falls it sheds
  clumps of snow that break off its back and tumble into the track behind it and stay there (the track fills with
  them). Nothing vanishes away from the ball. Clumps along the track are deterministic in `progress` (clump i lies
  at track position p_i once the ball has passed it, and is seen falling only while playing), so scrubbing shows
  the same track.
- The target ball is pushed by the climber; the others creep slowly down on their minimums by themselves (no one
  touches them). Both are honest: place and size come only from the balance.
- Cleared (`paidOff`): the last small ball reaches the snowbank and crumbles into it (a few chunks settle, a puff of
  powder), leaving a small mound and, planted in it, a little flag in the hill's colour. Only once; scrubbing
  back undoes it.
- Each ball carries a small DOM name tag (positioned from ballAnchor): "Card 26%", "Car 6%", "Medical 0%".

Camera (story only): starts close on the tops of the lanes (focus 'both', zoom ~1.8), all six balls in view,
and eases out to the whole valley as the first months pass (labels fade during the zoom, as in the vine).

Performance: sky, mountains, pines, hills, creek and bank pre-rendered once per size into cached layers; per frame
only snowfall, the balls (cached textures, rotated), tracks and clumps, climbers, and the occasional puff. Target ≤
4 ms per frame at 1440 × 900, DPR 1. Determinism: the same frame inputs give the same balls and tracks.

## The climbers (the user's standing rule: smooth, clean, natural movement)
One per hill, the vine gardener's character (same skeleton, measured walk, turning, depth sorting: build on
src/vine/scene/gardener*.ts) dressed for winter: a knitted bobble hat, a scarf in the hill's colour (snowball:
deep blue, avalanche: holly red), a padded coat, mittens, snow boots, breath that mists faintly in the cold.
Proportions from geom.ts (CLIMBER_H, depthScale).

Activities (ClimberIntent; the scene chooses, the climber performs; read climberApi.ts):
- idle: stands easy, mittens together, a slow breath (misting), a glance up at the falling snow.
- push: walks round to the uphill side of the target ball, sets both mittens on it near its widest point, leans
  in, and walks with it down the lane at its pace (the ball sets the speed; the steps match it). Small balls mean
  bending low; a big ball means arms up and shoulder in. When the target changes, the climber lets go, walks back
  up to the next ball (round any ball in the way) and starts again.
- cheer: a short glad moment when a ball breaks up (about 1.2 s): arms up or a fist and a nod, then back to work.
- rest: walks to the sledge, sits (a smooth sit over ≥ 0.8 s), mittens on knees, leans back; small idle life.

Animation quality bar (non-negotiable, as the vine): never teleport or snap a pose; every transition blended over
at least 0.25 s; a proper gait with no foot sliding (stride matches ground speed, eased starts and stops); turning
through a three-quarter view; mittens stay on the ball while pushing; nothing passes through the body, a ball, a
tree or the sledge.

## Story (~52 s at 1×), driven by story time → months (marks from the engine, so they follow the inputs)
| t (s) | months | caption (primary / secondary) | notes |
|---|---|---|---|
| 0–6 | 0 | "Three debts. The same $800 a month." / "Snowball rolls the smallest away first. Avalanche, the highest rate." | camera close on the tops of the lanes; climbers idle |
| 6–12 | 0 → 3 | "Interest settles on them every month." / "Most on the card at 26%. None on the 0% medical bill." | camera eases out; both start pushing |
| 12–18 | 3 → 4 (snowball's first win) | "Snowball clears the medical bill in 4 months." / "A quick win. Its $40 rolls on to the car loan." | left medical ball breaks up; left climber cheers |
| 18–30 | 4 → 25 | "Avalanche keeps pushing the card at 26%." / live: "Interest so far: snowball $3,311, avalanche $2,937." (month 12; follows the clock) | months speed up smoothly |
| 30–36 | 25 → 28 | "Avalanche clears the card in 2 years, 4 months." / "The costliest debt is gone, so every dollar goes further." | |
| 36–42 | 28 → 32 | "Both hills are clear." / "Avalanche in 2 years, 6 months. Snowball, 2 months later." | climbers rest as each finishes |
| 42–48 | 32 | "Avalanche: $4,642 in interest. Snowball: $6,295." / "Snowball's first win came 21 months sooner." | results |
| 48–52 | 32 | "Explore your own debts" | hand off to explore, paused at the end |
Copy is live (every number from the engine), hopeful and plain. No em-dashes. Month marks adapt to the inputs (the
first clear on either hill, the avalanche's top-rate clear, each payoff); when the two orders are the same or the
budget is only the minimums, the story says so ("With these debts both orders are the same.") and runs on.
Reduced motion: discrete holds with short eased tweens, no autoplay, as the vine.

## Controls (right panel, same look as the vine)
Play/Pause, speed slider (0.1×–5×, log scale, as the vine), timeline (months, year ticks), Monthly budget, then one
group per debt (Medical bill, Car loan, Credit card), each with Balance ($), Interest rate (APR %) and Minimum
payment ($), Reduce motion, assumptions note, "How this is calculated" (per strategy: the order, months to
debt-free, the month each debt clears, total interest; the monthly rule; the first months of each schedule).

Labels (DOM, positioned from labelAnchor): per hill, its emblem and name ("Snowball: smallest first",
"Avalanche: highest rate first"), "$13,970 still owed" (or "Debt-free in 2 years, 8 months"), and
"$3,311 in interest" under it (as the vine). Ball tags from ballAnchor. Year readout top left (statement month,
hidden while the panel is open, as the vine). Text over the sky sits on the vine's pale lifted wash (≥ 4.5:1).
Identity never by colour alone: emblems (a snowball; a mountain with a slide of snow) and names.

## Files and ownership
- Coordinator: docs/SNOW_SPEC.md, src/snow/types.ts, src/snow/scene/geom.ts, src/snow/scene/climberApi.ts.
- App worker: src/snow/engine/*, src/snow/app/*, src/snow/main.ts, on-a-roll.html, src/styles/snow.css, the
  vite.config.ts entry, tests/snow/*, tests/e2e/snow.spec.ts. Start from src/vine/app, nip-it-in-the-bud.html and
  src/styles/vine.css (copy and adapt; do not edit the vine's files). The e2e spec uses the vine's phone and
  reduced-motion helpers (gotoVine's panel opening, onStage, normalMotionOnly).
- Scene worker: src/snow/scene/* except geom.ts, climberApi.ts and climber*.ts; may add snow-scene-test.html.
- Climber worker: src/snow/scene/climber.ts (+ climber*.ts helpers); may add snow-climber-test.html.
- Shared painting and motion helpers may be imported from src/scene/*, src/river/scene/* and src/vine/scene/*
  (paper, washes, the gardener's math, walk data and gait), but never edited there.
