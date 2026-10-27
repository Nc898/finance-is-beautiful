# Nip It in the Bud — spec (coordinator-owned)

Third demonstration in the "Finance is beautiful" collection, the first of three about debt. Same world as
Time to Grow and Against the Current: warm ivory paper, ink-and-watercolor illustration, light from the upper
left, quiet type (Libre Caslon Display / Text italic, Figtree), collapsible right-hand controls panel, an
introduction then free exploration (no scripted story). Motion at 60 fps (as the river).

Season: **autumn**. Sky: **clear blue with the sun out, no clouds** (a change from the other two demos).

## The lesson (one sentence)
A card balance is a vine: interest grows it back every month, so paying only the minimum keeps you pruning
for decades, while a steady fixed payment clears it in a couple of years.

## Math (src/vine/engine, pure, tested; contract in src/vine/types.ts)
- Monthly: `interest = balance × apr / 12`; then the payment; `balance' = balance + interest − payment`.
- Minimum due: `max(minFloor, interest + minPercent × balance)`, never more than `balance + interest`.
- Left cottage ("Minimum payments") pays the minimum due. Right cottage ("A fixed $200 a month") pays
  `max(fixedPayment, minimum due)` (a card requires at least the minimum), capped at what is owed.
- Simulate month by month until the balance is under half a cent, or MAX_MONTHS (720).
- Fractional months: totals move linearly within a month (see PlanSnapshot), so everything animates smoothly.
- Defaults ($5,000, 22% APR, minimum 1% + interest with a $25 floor, fixed $200):
  minimum: 230 months (19 years, 2 months), $8,100 interest (first payment $141.67, first interest $91.67;
  owed $2,736 at year 5, $1,497 at year 10, $1,176 at year 12, $813 at year 15);
  fixed: 34 months (2 years, 10 months), $1,750 interest.
- Validation like the river (finite numbers, ranges in VINE_LIMITS). APR 0 is valid (the vine never grows).
- Assumptions note: a fixed rate, no new purchases, fees or penalties; minimum payment rules vary by card;
  illustration only, not advice.

## Scene (src/vine/scene, Canvas 2D, contract VineSceneAPI in src/vine/types.ts, geometry in geom.ts)
Composition (world 1000 × 640, geometry fixed in geom.ts):
- Sky: a clear autumn blue, deeper at the top, paler and warmer toward the horizon, painted as graded
  watercolor washes with gentle variegation (no clouds at all). The sun in the upper left (the light source
  for the whole picture): a pale warm disk with a soft painted glow and a faint halo, slightly lifted paper at
  its centre. Optional and rare: a skein of geese in a V crossing high up (autumn migration).
- Distance: rolling hills in hazy blue-violet, then nearer hills with autumn woods (ochre, rust, amber,
  a few dark evergreens), fields in stubble gold. Atmospheric perspective: cooler and paler with distance.
- The two cottages (COTTAGE in geom.ts): single-storey, warm grey-ochre stone walls painted stone by stone
  with broken ink, a slate or thatch roof, a chimney with a thin curl of smoke drifting with the wind, a wooden
  door, two windows (small panes, a warm glow inside). The same cottage mirrored, with small differences so
  they read as neighbours, not copies (a different door colour, a pot of mums by one door).
- Between them: a low wooden picket or split-rail fence and a flagstone path; each garden has a bench
  (BENCH) by the middle fence, and a clippings pile (PILE) at its outer front corner.
- Lawn: autumn grass (green going gold), fallen leaves scattered thickly near the trees and walls,
  pumpkins and a squash or two, a wheelbarrow, a hay bale. Calm enough under the labels for text.
- Ambient motion: leaves falling from the trees on the breeze, drifting and spinning smoothly (no popping in
  or out: they fade in high up and settle on the lawn); a light breeze sways the vine's leaves and the grass;
  chimney smoke. All off in reduced motion.

The vine (one per cottage, the heart of the picture):
- Virginia creeper in full autumn colour: crimson, scarlet and wine leaves (five leaflets), woody brown stems,
  a few dark berries; clinging to the wall, rooted at COTTAGE.root, branching up and sideways across
  COTTAGE.vine. At `vine = 1` it covers most of that region (windows partly, never the door).
- Grown from a precomputed, seeded branching model (like Time to Grow's tree). `vine` (0…1) is the amount on
  the wall. The two cottages use the same model (mirrored), so at the same `vine` they look equally overgrown.
- Regrowth: new shoots keep unfurling at the tips (leaves scale up from a bud, stems extend), at a liveliness
  set by `regrowth`. Growth is continuous, never a pop.
- Cutting: the vine shrinks only where the gardener is cutting. Each snip (the gardener's `snips` counter
  going up) removes the vine nearest the shears: those leaves and stem pieces drop from the shears, tumbling
  and fluttering to the foot of the wall. Nothing ever vanishes away from the gardener.
  The scene keeps the drawn vine within about 3% of the target `vine`: when cutting is due it points the
  gardener (intent target) at the outermost remaining growth within reach and asks for a pace that keeps up
  (pace ≈ months/s × pruning × cuts per unit, capped at 3/s); one snip may take a cluster when far behind.
  Scrubbing the timeline (a jump) may set the vine directly, with no gardener involvement.
- Clippings on the ground: fallen pieces lie at the wall foot until the gardener rakes them onto the pile.
- The pile (`pile` = interest paid so far / starting balance): a heap of red and brown leaves at PILE whose
  volume tracks `pile` (both cottages on one scale, so $8,100 vs $1,750 is unmistakable). It grows
  smoothly; leaves raked on visibly join it. Only interest goes on the pile: it is the regrowth that had to be
  cut again. (The principal clippings are carried off in the wheelbarrow, unshown.)
- When cleared (`paidOff`): the last tendril is snipped, the wall is clean stone, and the gardener rests.

The gardener (src/vine/scene/gardener.ts, contract in gardenerApi.ts): see the next section.

Camera: always the whole garden (no zoom: the two cottages are only ever compared at the same, full view).

Performance: sky, hills, cottages, fence, lawn pre-rendered once per size into cached layers; per frame only
the vine (cached leaf sprites, drawn transformed), falling leaves, smoke, piles, gardeners. Target ≤ 4 ms per
frame at 1440 × 900 DPR 1. Determinism: the same frame inputs give the same vine and pile.

## The gardeners (the user asked specifically: smooth, clean movement)
One per cottage, the same character design as the rowers (simple ink-and-wash figure, round face, rosy
cheek) dressed for autumn: a flat cap or wide hat, a knitted scarf (left: rust/coral, right: emerald), a
waistcoat or canvas apron, rolled sleeves, boots, gardening gloves. Holds secateurs (pruning shears).
Proportions from geom.ts (GARDENER_H, REACH_TOP, REACH_SIDE, PATH_Y).

Activities (GardenerIntent; the scene chooses, the gardener performs):
- idle: stands easy, shears in hand, a slow breath and an occasional glance up at the vine.
- prune: walks along the path to stand in reach of the target, raises the shears with a natural arm (two-bone
  IK: shoulder, elbow, wrist; the other hand steadies the stem), leans and rises on tiptoe for high targets,
  and snips at `pace`: each snip is an open, a quick close (a small recoil of the hand), a little pause. The
  free hand pulls the cut piece away and lets it drop. Moving between targets: short side-steps for small
  shifts, a proper walk for longer ones.
- rake: fetches the rake (leaning against the wall by the pile), rakes clippings onto the pile with long
  pulls (both hands on the handle, body weight shifting), puts the rake back.
- rest: puts the shears into the apron pocket, walks to the bench, turns, sits down (a smooth sit with hands
  on knees), leans back; small idle life (breathing, crossing ankles, a look round).

Animation quality bar (non-negotiable):
- Never teleport, never snap a pose. Every transition is blended over at least 0.25 s (sit/stand ≥ 0.8 s).
- Walking: proper gait (heel strike, toe off, opposite arm swing, slight vertical bob), feet never slide: the
  stride length matches the ground speed; eased start and stop (accelerate over ~0.4 s, decelerate into the
  stop with the last step landing on the spot).
- Turning round: a short turn through a three-quarter/front view (e.g. squash the body width through ~30%
  with a face-forward head), never an instant mirror flip.
- Tools only move in a hand. A tool changes hands or is put down with a visible reach.
- The shears tip (`shears()`) is exactly where the cut happens; the scene drops clippings there.
- The gardener never walks through the bench, the pile or the other garden; it stays in its own garden.

## Introduction and notes (no scripted story)
The demonstration opens with the shared introduction (src/shared/intro.ts; content in nip-it-in-the-bud.html): what it
shows, how to read the picture (a vine is a card balance, interest grows it back, pruning is a payment, the pile is
the interest paid), the two plans, and how to use it. It shows the first time per browser session; "About this demo"
opens it again. The timeline then waits at month 0, paused; Play runs the whole timeline in 24 s at 1x.

Short notes under the title follow the MONTH (played or dragged), from src/vine/app/notes.ts:
| months | note (primary / secondary) |
|---|---|
| before the first interest | "Two cottages. The same $5,000 vine." / "Each vine is a credit card balance at 22% a year." |
| the first 3 months | "Interest grows it back every month." / "About $92 a month to start. Each clipping on the pile is interest paid." |
| until a year after the fixed payoff | "A fixed $200 a month clears it in 2 years, 10 months." |
| until the end | "Minimum payments trim a little. The vine keeps coming back." / live: "Year 12: $1,176 still owed." |
| the end | "Minimum payments: 19 years, 2 months and $8,100 in interest." / "A fixed $200 saves $6,350 and 16 years, 4 months." |
Copy is live (values from the engine), hopeful and plain. No em-dashes.

## Controls (right panel, same look as the river)
Play/Pause, speed (0.5×–4×), timeline (months, with year ticks), Card balance, Interest rate (APR %),
Fixed monthly payment, Minimum payment (a "% of balance + interest" field and a "$ floor" field),
Reduce motion, assumptions note, "How this is calculated" (per plan: months to pay off, total paid, total
interest; the formulas; a small schedule excerpt).

Labels (DOM, positioned from labelAnchor / pileAnchor): per cottage, the plan name ("Minimum payments",
"A fixed $200 a month"), "$2,736 still owed" (or "Paid off in 2 years, 10 months"), and at the pile
"$4,412 in interest". Year readout top left: "Year 5, month 3".

## Files and ownership
- Coordinator: docs/VINE_SPEC.md, src/vine/types.ts, src/vine/scene/geom.ts, src/vine/scene/gardenerApi.ts.
- App worker: src/vine/engine/*, src/vine/app/*, src/vine/main.ts, src/vine/preview.ts (later),
  nip-it-in-the-bud.html, src/styles/vine.css, the vite.config.ts entry, tests/vine/*, tests/e2e/vine.spec.ts.
- Scene worker: src/vine/scene/* except geom.ts, gardenerApi.ts and gardener*.ts; may add a dev harness page
  vine-scene-test.html.
- Gardener worker: src/vine/scene/gardener.ts (+ gardener*.ts helpers); may add vine-gardener-test.html.
- Shared painting helpers may be imported from src/scene/* and src/river/scene/* (boatInk.ts, paint.ts) but
  never edited.
