# A Little Off the Top — spec

Seventh demonstration in the "Finance is beautiful" collection: **fund fees**. Same world as the others: warm ivory
paper, ink drawing under watercolor washes, light from the upper left, quiet type (Libre Caslon Display / Text
italic, Figtree), collapsible right-hand controls panel, an introduction then free exploration (no scripted story).
No em-dashes in any copy; short copy.

Season: **spring, a bluebell wood**: the season and place the collection did not have yet. A clearing at the edge
of a beech wood on a clear morning; far blue downs; drifts of bluebells thickening toward the front, with a few
stitchwort stars and primroses. Title "A Little Off the Top" (the barber's phrase: the fee is "just a little").

## The lesson (one sentence)
A yearly fee is a share of everything you have, every year, so a fee that sounds tiny takes a large part of a
lifetime's savings: over 40 years a 1% fee costs about a quarter of what the savings could have grown to.

## Math (src/wood/engine, pure, tested; contract in src/wood/types.ts)
- Two funds with the same start, the same monthly saving, the same years and the same growth; only the fee differs.
- Each month: value = value × (1 + growth / 12); fee = value × fee / 12; value −= fee; value += monthly. The no-fee
  value ("ideal") runs the same months without the fee. Full precision.
- cost = ideal − value: the fees and the growth they would have earned. Always more than the fees paid.
- Fractional months as the brick and the orchard: smooth figures move linearly within a month; statement figures
  step at CREDIT_AT = 0.62.
- Defaults: $10,000 to start, $500 a month, 40 years, 7% growth; A pays 1%, B 0.1%. Verified against a closed form
  (q = (1 + g/12)(1 − f/12), V = start·qⁿ + monthly·(qⁿ − 1)/(q − 1)):
  - No fee: **$1,475,520.81**. A: **$1,103,491.28** (fees $143,217.57, cost $372,029.54, 25.2%). B:
    **$1,432,635.12** (fees $17,241.08, cost $42,885.69, 2.9%). B ends $329,143.84 ahead.
  - From year 32, A's fees each year are more than the $6,000 saved that year.
- Validation: finite numbers in WOOD_LIMITS, whole years. Fees 0–3%, growth 0–15%. Equal fees are valid (one plain
  note: "The same fee twice." / "Both trees grow alike.").

## Scene (src/wood/scene)
World 1000 × 640, geometry in geom.ts. Camera (layout.ts) fits VIEW between the header and label bands and never
zooms; extra height goes to the sky.
- **The trees** (TREES, TREE_K, TREE_SEED): both funds are the same tree (Time to Grow's model and painter, in
  Brick's spring leaf, with sunlit leaf in place of Brick's creamy accent clumps), so the same money is the same
  tree. Size = √(value / scale), scale = the no-fee value at the end: the painted crown's area is proportional to the
  money, on one scale for both. Painted live each frame, with wind; the root cut-away is clipped at the grass.
- **The ghost**: the no-fee tree, painted pale (washed toward the paper and a little cool) into its own canvas and
  drawn behind each tree. Both funds hold the same savings, so it is one painting, repainted only when its size moves
  by GHOST_STEP. It is the tree the savings would have grown with no fee.
- **The woodpiles** (woodpile.ts, PILES, PILE): cordwood between two pairs of stakes on two bearers, one beside each
  tree on its outer side. Logs = fees paid / logDollars, where logDollars makes the larger pile end with
  LOGS_AT_END (55) logs: the same dollars per log on both piles. Filled row by row from the bottom, toward the tree;
  the log being cut grows into its place. Each log end is a small painted sprite (bark rim, pale face lit from the
  upper left, growth rings, a check, a broken ink contour).
- **The sprigs** (twigs.ts): while playing, sprigs are cut from the top of each crown and flutter down, at a rate
  proportional to the fee (A's 1% drops ten times B's 0.1%). Off when paused and in reduced motion.
- **The backdrop** (backdrop.ts), painted once per size: paper; a spring sky (multiply wash, variegation, soft
  clouds lifted out of the blue); two ranges of downs (atmospheric blue, hedgerow dabs); the wood's edge (canopy
  mass, a shadowed understorey with grey trunks, hazy beeches from Brick's spring painter); the clearing (grass wash,
  sunlit and cool blooms, each tree's shade to the lower right, a worn way between the piles); bluebells (a violet
  haze far off, dots in the middle distance, stems with nodding bells near). A front fringe of grass and bluebells
  is drawn over the woodpiles' and the trees' feet.

## Notes (src/wood/app/notes.ts), by month, defaults shown
| months | note (primary / secondary) |
|---|---|
| before the first month's money | "The same savings. The same growth." / "Only the fee differs: A pays 1% a year, B pays 0.1%." |
| the first year | "Every month, a little off the top." / "The fee is a share of the whole fund, every year, whether it grows or not." |
| years 1 to 10 | "1% looks like very little." / live: "Fees so far: A $X, B $Y." |
| until the higher fee outruns a year's saving | "The fee grows with the fund." / live: "This year A pays $X in fees, B $Y." |
| until a year before the end | "Now A's fee each year is more than A saves in a year." (or "And every dollar taken would have grown too.") / live: "A has lost $X so far: the fees, and the growth they would have earned." |
| the last year and the end | "A: $1,103,491. B: $1,432,635." / "The 1% fee cost A $372,030, 25% of what the savings could have grown to." |
"Higher" and "lower" are by fee, never assumed to be A and B.

## Labels, controls, introduction
- Labels under each tree (Brick's plates): roundel letter and "1% fee", "Worth $X", "$Y in fees", "$Z lost to the
  fee". Between them: "B is ahead by" / "B ends ahead by", the amount, "for 0.9% a year less in fees".
- Panel: Play, speed (0.1×–5×, log), timeline (months; ticks every year, labelled every ten), To start, Each month,
  Years, Growth, then Fund A and Fund B (Fee, % a year). Reduce motion; assumptions; "How this is calculated"
  (the monthly step with its numbers, the whole-time table, the table at the clock's month, year-by-year values with
  the no-fee column).
- Introduction (src/shared/intro.ts): kicker "Fees", key `fib-intro-seen:a-little-off-the-top`.
- Play runs the whole timeline in 30 s at 1× (PLAY_SECONDS).

## Files
- docs/WOOD_SPEC.md; a-little-off-the-top.html; src/wood/{types.ts, main.ts, engine/*, app/*, scene/*};
  src/styles/wood.css (Brick's, re-inked); tests/wood/engine.test.ts; tests/e2e/wood.spec.ts;
  scripts/bake-wood-preview.mjs → public/assets/preview-wood.webp; the landing entry in src/landing/demos.ts with its
  ornament in src/styles/landing.css (theme 'wood').

## Not done yet (next steps)
- A figure (a forester with a pruning saw taking the cut and carrying it to the pile) in the manner of the
  orchard's pickers: the scene works without one, but a figure would match the sister demos' liveliness.
- (Done: the ghost crown has a fine, broken ink contour so it reads as the no-fee tree, not a tree in the wood.)
- Laptop and reduced-motion projects have not been run for this suite; desktop and mobile pass.
