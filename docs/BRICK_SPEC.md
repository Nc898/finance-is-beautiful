# Brick by Brick — spec (coordinator-owned)

Fifth demonstration in the "Finance is beautiful" collection, the third about debt. Same world as Time to Grow,
Against the Current, Nip It in the Bud and On a Roll: warm ivory paper, **ink drawing under watercolor washes**,
light from the upper left, quiet type (Libre Caslon Display / Text italic, Figtree), collapsible right-hand controls
panel, an introduction then free exploration (**no scripted story**), 60 fps. The art must hold up beside the other
four at 2× (the user's standing rule: never present art below the sister demos).

Season: **spring**, the one the collection does not have yet (summer meadow, river, autumn cottages, winter hill).
A building site at the edge of a village: fresh greens, blossom, a soft sky with high cloud, red brick against new
leaves. Title "Brick by Brick" (an idiom like the others: a home paid for a little at a time).

## The lesson (one sentence)
The same home on a 15-year loan costs more each month but far less in all: you own it in half the time and pay
much less interest, because each payment goes mostly to interest on a long loan for years. Honest and hopeful,
never preachy: the 30-year loan's smaller payment is a real advantage, and the notes say so.

## Math (src/brick/engine, pure, tested; contract in src/brick/types.ts)
- One amount borrowed, two loans (A and B), each with a term in whole years and an annual rate. The fixed monthly
  payment: amount × r / (1 − (1 + r)^−n), r = apr / 12, n = years × 12; amount / n at 0%. Full precision, no cent
  rounding. Each month: interest = balance × r; principal = payment − interest; the last month pays exactly what is
  left (the balance ends at 0).
- Fractional months as the vine: smooth figures move linearly within a month; statement figures (owed, interest
  charged) step at INTEREST_AT = 0.2 and PAYMENT_AT = 0.62 of the month; `statementMonth` for the clock (copy the
  vine's engine semantics and tests).
- A cart carries amount / 6 of interest (CARTS_PER_AMOUNT; $50,000 on $300,000).
- Defaults: $300,000; A 30 years at 6.5%, B 15 years at 5.75% (15-year loans usually come with a lower rate). Verified:
  - A: $1,896.20 a month; first month $1,625.00 interest, $271.20 principal; most of a payment builds the house
    from month 233 (crossover); half owned at month 257; $382,633.47 interest, $682,633.47 paid. Owed after year 5
    $280,833 (6.4% built), year 10 $254,328, year 15 $217,677 (27.4% built), year 20 $166,996, year 25 $96,912.
    Interest by year 15: $258,994. 7.65 carts.
  - B: $2,491.23 a month; first month $1,437.50 interest, $1,053.73 principal; crossover month 36; half owned at
    month 109; $148,421.45 interest, $448,421.45 paid. Owed after year 5 $226,952 (24.3% built), year 10 $129,638
    (56.8%), paid off at month 180. 2.97 carts.
  - B costs $595.03 more a month and saves $234,212.02 in interest; the house is owned 15 years sooner.
- Validation like the vine (finite numbers, the ranges in BRICK_LIMITS, whole years). APR 0 is valid. The two loans
  may be identical (the notes then say so plainly).
- Assumptions note: fixed rates, payments of principal and interest only (no taxes, insurance or fees), no extra
  payments; illustration only, not advice.

## Scene (src/brick/scene, Canvas 2D, contract BrickSceneAPI in src/brick/types.ts, geometry in geom.ts)
Composition (world 1000 × 640, geometry fixed in geom.ts; read its header first):
- Sky: a soft spring sky, clear pale blue at the top warming to cream at the horizon, graded watercolor washes with
  gentle variegation, a few thin high clouds (mares' tails, lightly brushed) and two or three small, soft fair-weather
  clouds low over the hills. Sun upper left (off the picture), the light for the whole scene.
- Distance (atmospheric perspective, paler and cooler with distance): rolling green hills with hedgerows, a village
  behind the plots (red tile and grey slate roofs, chimneys, a church tower with a weathervane), copses in fresh
  yellow-green leaf, a few white blossom trees (blackthorn, cherry) dotted about.
- The plots: two neighbouring front gardens of new-turned earth and fresh grass, a low picket fence along the front
  with a gate each (FENCE_Y, GATE), the garden path from the gate to the door laid as the house goes up (paving at
  the end), daffodils, tulips and primroses along the verge, a sand heap and a mortar board, a few planks.
- Between the plots, the signature: a big **blossom tree** in full flower (pale pink and white, BLOSSOM), its trunk
  ink-drawn, the blossom built from many small translucent dabs with darker pink centres and fresh green leaf
  coming. Behind it the road from the village comes down to the lane (ROAD_FAR → JUNCTION) past a hedge.
- The lane (LANE) in front of both gardens: packed earth with cart ruts and a couple of puddles holding the sky,
  a grassy verge.
- Ambient motion: blossom petals drifting from the tree (and a few from the distant trees) on a light breeze,
  turning as they fall, settling on the grass and lane and fading slowly, never popping; a pair of swallows looping
  high now and then; the grass and daffodils stir. All off in reduced motion.

The houses (the heart of the picture; HOUSE, BUILD in geom.ts):
- The same two-storey brick house on each plot (mirrored plan, same light): Flemish or stretcher bond in warm red
  and orange-brown bricks, every brick its own wash (a few darker headers, burnt ends, a little efflorescence),
  pale lime mortar joints, stone sills and lintels, sash windows, a panelled door (A: ACCENT.a blue, B: ACCENT.b
  green), a clay-tile roof, a chimney with pots, a gutter and downpipe.
- **The pencil underdrawing is the lender's part.** From month 0 the whole finished house is there as a light
  graphite drawing on the paper (outline, openings, roof lines, a few construction lines and ticks, as an architect's
  or watercolourist's underdrawing), with only its foundation course painted. As `built` rises, the bricks are laid
  in watercolor course by course from the foot up (BUILD.wall), each course from the hoist end across, the working
  course partly laid; then the roof tiles row by row from the eaves up (BUILD.roof); then the chimney (BUILD.chimney).
  The painted area is exactly proportional to `built`. A window's frame and glass, and the door, go in when the
  course above them is laid (their lintel is set). Never a sweep or fade: bricks appear one by one where the
  bricklayer's hands are.
- Finished (`paidOff`): the last chimney pot goes on, a sprig of green is tied to the chimney (the builders'
  topping-out custom), smoke curls from the chimney, the window boxes are planted with tulips, the path is paved.
  While playing, the scaffold is struck over about 3 s (boards lifted off, poles lowered out of sight behind the
  fence, top first); scrubbed to, it is simply gone. Scrubbing back undoes all of it.
- The scaffold (SCAFFOLD, SCAFFOLD_X): timber standards and ledgers lashed with rope, boards at each lift, ladders at
  the inner end, a roof ladder up the roof from the top lift (once the wall is up), toe boards; stacks of bricks
  along the boards of the lift being worked and a spot board of mortar; the gin wheel at the top of the outer end
  (HOIST; the builder module draws the rope and bucket). Drawn in two layers so the bricklayer stands between the
  back (boards, ledgers) and the front (standards, guard rails).
- The pallet of bricks inside each gate (STACK), the bench (BENCH), and the chalk tally slate on the gate's outer
  post (TALLY): one chalk mark per full cart, in fives, plus a short mark for a part cart after the last leaves.

The lender's carts (the interest; carter.ts draws the carter and cart):
- A two-wheeled wooden handcart with shafts, its side board lettered "LENDER" in faded paint, pulled by the lender's
  carter (a dark coat, a waistcoat with a watch chain, a bowler or flat cap). Each cart has its own carter.
- `carts` (from the money) runs the queue at each gate: the cart at CART holds frac(carts) of a load; when `carts`
  passes a whole number that cart is full and is pulled away to EXIT; the cart waiting at NEXT moves up; a new empty
  cart is sent for down the road (ROAD_FAR) to wait at NEXT. At high speeds or rates several carts are on the road at
  once; if the queue is behind, a full cart may wait at CART (heaped, its fill held at 1) and the next one fills at
  NEXT (the builder tips into whichever is filling); the tally counts carts filled, from the money. When the loan is
  paid off, the last part-full cart leaves and no more are sent for.
- Scrubbed (or reduced motion): only the cart at CART (with its fill) and one at NEXT, carters waiting; no traffic.

The crew (crewApi.ts; build on the vine's gardener and the snow's climber: skeleton, measured walk, turning, depth
sorting), dressed for spring building work: a flat cap or a knitted beanie, rolled shirtsleeves, a waistcoat or
work jacket, a neckerchief in the house's accent colour, canvas trousers, boots. Proportions from geom.ts (CREW_H,
depthScale): small beside the two-storey houses (a figure on the ground reaches roughly to the first-floor sills).
- The builder (one per house): wheels a barrow on a loop: pallet → out of the gate to the cart → tips the interest
  share → back in to the hoist → loads the bucket and hauls it up → pallet. The split is visible: early on most of
  each load goes into the cart (A at month 1: 86% of the payment is interest), later most goes up to the wall.
  About one round trip every 4 s at 1x (`pace`), faster with speed.
- The bricklayer (one per house): works from the scaffold at the place the next brick goes (`target`), stepping
  along the boards, climbing the ladders between lifts and the roof ladder for the upper roof and chimney, laying
  with a trowel: take a brick, butter it, set it, tap it down. Its pace follows how fast the bricks go on (from the
  money), capped; when the money lays bricks faster than a person could (high speeds), it simply works without
  pause.
- At the end both climb down / set down their tools, walk to the bench and sit side by side, looking up at the house.
- Animation quality bar (non-negotiable, as the vine and the snow): never teleport or snap a pose; every transition
  blended over at least 0.25 s; a proper gait with no foot sliding (stride matches ground speed, eased starts and
  stops); turning through a three-quarter view; the barrow's wheel turns with distance and its legs set down
  before the builder lets go; ladder climbing hand over hand, foot over foot; the carter leans into the shafts as
  the cart starts and the wheels turn with distance; nothing passes through anything.

Camera: always the whole street (no zoom).

Performance: sky, distance, village, the blossom tree's trunk and crown, garden, lane and both pencil drawings
pre-rendered once per size; each house's painted bricks rendered from a pre-painted finished-house sprite clipped
to the laid courses (re-clip only when `built` changes); per frame only petals, the crew, the carts and the working
course. Target ≤ 4 ms per frame at 1440 × 900, DPR 1. Determinism: the same frame inputs give the same houses,
tallies and cart fills.

## Introduction and notes (no scripted story)
The page opens with the shared introduction (src/shared/intro.ts, src/styles/intro.css; content in
brick-by-brick.html): kicker "Borrowing", title "Brick by Brick", lede "The same $300,000 home, bought with a 30-year
loan or a 15-year loan. What does the shorter loan save?"; how to read it (the pencil drawing is the part the lender
still owns, the painted bricks the part you own; every month's payment is a barrow of bricks: the interest goes into
the lender's cart, the rest is laid on the house; each full cart is $50,000 of interest); the two loans (the 30-year
loan's payment is smaller, but more of it is interest, for twice as long; the 15-year loan costs more each month and
often has a lower rate); and how to use it. "Start exploring" (Escape, or a click on the scene, closes it too). It
shows the first time per browser session (key `fib-intro-seen:brick-by-brick`); "About this demo" opens it again.
The timeline then waits at month 0, paused. Play runs the whole timeline in 24 s at 1x (PLAY_SECONDS), scaled by the
speed slider (0.1×–5×, log scale, as the vine).

Short notes at the top left under the title follow the MONTH (played or dragged), from src/brick/app/notes.ts, every
number live from the engine, in time order for any inputs (the defaults shown):
| months | note (primary / secondary) |
|---|---|
| before the first payment | "The same $300,000 home. Two loans." / "30 years at 6.5%, or 15 years at 5.75%." |
| the first year | "Early payments go mostly to interest." / "Of the first $1,896 on the 30-year loan, $1,625 is interest." |
| until the shorter loan's crossover | "The 15-year loan costs $595 more a month." / "So more of every payment builds the house." |
| until the shorter loan is paid off | "Each cart carries $50,000 of interest to the lender." / live: "Interest so far: 30-year $X, 15-year $Y." (updates in place) |
| a year from that payoff | "The 15-year house is paid off." / "The 30-year house is 27% built, with 15 years to go." |
| until the longer loan's crossover | "No more payments on the 15-year house." / "That frees $2,491 a month." |
| until the end | "Now most of each 30-year payment builds the house." / live: "$X still owed." |
| the end | "30-year: $382,633 in interest. 15-year: $148,421." / "The 15-year loan saved $234,212, for $595 more a month." |
Names follow the inputs: a loan is called by its term ("30-year"); when both terms are equal it is called by its rate
("the 6.5% loan"); identical loans get one plain note ("The same loan twice: both houses go up together."). When the
shorter loan is A, the copy follows (never assume B is shorter). The difference label is emphasized at the end.

## Controls (right panel, same look as the vine)
Play/Pause, speed slider, timeline (months, year ticks, labelled every five years), Amount borrowed ($), then one
group per loan ("Loan A", "Loan B"): Term (years) and Interest rate (%), Reduce motion, assumptions note,
"How this is calculated" (per loan: the payment formula with its numbers, total paid, total interest, the crossover
month; the yearly balances in a table).

Labels (DOM, positioned from labelAnchor, in the bottom band under each plot, as Time to Grow's plates): an italic
serif letter in a roundel (A, B) and the name ("30-year loan"), "6.5% · $1,896 a month", then "$217,677 still owed"
(or "Paid off in 15 years"), and "$258,994 in interest" under it. Between them, once both have started, the
difference ("Interest saved so far" during, "The 15-year loan saves" at the end, live). Year readout top right of
the scene (statement month; hidden while the panel is open, as the vine). Text over the sky sits on the lifted wash
(≥ 4.5:1). Identity never by colour alone: the letters and names.

## Files and ownership
- Coordinator: docs/BRICK_SPEC.md, src/brick/types.ts, src/brick/scene/geom.ts, src/brick/scene/crewApi.ts.
  Escalate any change to these instead of making it.
- App worker: src/brick/engine/*, src/brick/app/*, src/brick/main.ts, brick-by-brick.html, src/styles/brick.css, the
  vite.config.ts entry, tests/brick/*, tests/e2e/brick.spec.ts. Start from src/vine/app (or src/snow/app),
  nip-it-in-the-bud.html and src/styles/vine.css (copy and adapt; do not edit their files). The e2e spec uses the
  vine's phone and reduced-motion helpers.
- Scene worker: src/brick/scene/* except geom.ts, crewApi.ts, builder*.ts, bricklayer*.ts and carter*.ts; may add
  brick-scene-test.html (and its vite entry).
- Ground crew worker: src/brick/scene/builder.ts and carter.ts (+ builder*.ts, carter*.ts helpers); may add
  brick-crew-test.html.
- Bricklayer worker: src/brick/scene/bricklayer.ts (+ bricklayer*.ts helpers); may add brick-bricklayer-test.html.
- Shared painting and motion helpers may be imported from src/scene/*, src/river/scene/*, src/vine/scene/* and
  src/snow/scene/* (paper, washes, the cottages' masonry, the gardener's and climber's skeleton, walk data and gait),
  but never edited there. The landing page entry is the coordinator's, after integration.
