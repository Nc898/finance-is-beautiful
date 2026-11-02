# Low-Hanging Fruit — spec (coordinator-owned)

Sixth demonstration in the "Finance is beautiful" collection: an employer match. Same world as Time to Grow,
Against the Current, Nip It in the Bud, On a Roll and Brick by Brick: warm ivory paper, **ink drawing under
watercolor washes**, light from the upper left, quiet type (Libre Caslon Display / Text italic, Figtree), collapsible
right-hand controls panel, an introduction then free exploration (**no scripted story**), 60 fps. The art must hold
up beside the other five at 2× (the user's standing rule: never present art below the sister demos). No em-dashes in
any copy; short copy.

Season: **late summer**, the one the collection does not have yet (summer meadow, river, autumn cottages, winter
hill, spring building site). An apple orchard on a fruit farm in the late afternoon: golden light, deep summer
greens going a little tired and olive, long grass with seed heads, heavy branches, the low sun warm on everything.
Title "Low-Hanging Fruit" (an idiom like the others: the easiest win there is).

## The lesson (one sentence)
If your employer matches what you save, save at least up to the match: it is free money, an instant 50% (or 100%)
return before any growth, and over a career it grows into a large sum. Honest and hopeful, never preachy: saving
more takes home less pay now, and the notes say so.

## Math (src/orchard/engine, pure, tested; contract in src/orchard/types.ts)
- Two pickers on the same yearly pay (fixed, today's dollars), the same years, the same growth, the same match
  (rate per dollar, up to a limit as a share of pay). Each saves its own share of pay.
- Each month: own = pay / 12 × save; match = pay / 12 × rate × min(save, limit); the offer = pay / 12 × rate × limit;
  missed = offer − match. Value: value = value × (1 + growth / 12) + own + match (growth first, then the month's money
  at the month's end). Own value, match value and missed value (what the missed match would be worth, grown alike)
  are tracked the same way; value = ownValue + matchValue exactly. Full precision, no cent rounding.
- Fractional months as the vine and the brick: smooth figures move linearly within a month; statement figures step
  when the month's money lands, at CREDIT_AT = 0.62 of the month; `statementMonth` for the clock (copy the brick's
  engine semantics and tests).
- The trees (TreePlan in types.ts): treeDollars = the larger total put in (own + match over all months) /
  TREES_AT_END (36). Each month's own money then its match money are dealt into trees of treeDollars each, one
  variety at a time (own fills golden trees, match fills red trees); a tree takes the next slot in the month its
  first dollar arrives (own before match in the same month); every piece grows from its month, so the trees' values
  add up exactly to the picker's value. `treeScale` = the largest value any tree of either picker reaches (size 1).
- Defaults: pay $60,000; 30 years; 7% growth; the employer adds 50 cents per dollar up to 6% of pay; A saves 3%,
  B 6%. Verified:
  - A: $150 a month of its own, $75 match, $75 a month of match left untaken. After 5 years $16,108; 10 $38,944;
    15 $71,317; 20 $117,208; 25 $182,266; 30 **$274,493.47** (own part $182,995.65, match part $91,497.82). Put in
    $54,000 + $27,000 match; $27,000 of match left untaken, which would have grown to $91,497.82.
  - B: $300 own, $150 match, nothing left. After 5 years $32,217; 10 $77,888; 15 $142,633; 20 $234,417; 25 $364,532;
    30 **$548,986.95** (own $365,991.30, match $182,995.65). Put in $108,000 + $54,000 match.
  - For both, the growth passes what was put in at month 217 (year 19).
  - B takes home $150 a month less ($54,000 over 30 years); for it, B gets $75 a month more match ($27,000), and ends
    with $274,493.48 more.
  - Trees: treeDollars $4,500; A plants 12 golden + 6 red = 18 trees, B 24 golden + 12 red = 36.
- Validation like the brick (finite numbers, the ranges in ORCHARD_LIMITS, whole years). Growth 0, rate 0, limit 0
  and save 0 are all valid (a picker saving 0 has an empty orchard; the notes say so plainly). The two pickers may
  be identical (one plain note: "The same savings twice: both orchards grow alike.").
- Assumptions note: the same pay every year (no raises), money saved and matched monthly, steady growth, no fees,
  taxes or vesting rules; illustration only, not advice.

## Scene (src/orchard/scene, Canvas 2D, contract OrchardSceneAPI in types.ts, geometry in geom.ts, parts in partsApi.ts)
Composition (world 1000 × 640, geometry fixed in geom.ts; read its header first):
- Sky: a late-summer afternoon, a warm hazy blue at the top going to a pale apricot-cream at the horizon, graded
  watercolor washes with gentle variegation; a few soft, sunlit cumulus with warm tops and lilac-grey undersides;
  the sun upper left (off the picture), low enough that the light is golden and the shadows long-ish to the lower
  right.
- Distance (atmospheric perspective, paler and warmer-hazier with distance): rolling hills; on the hill behind the
  middle, the farm (a farmhouse of warm stone with a slate roof, a big timber barn, an oast or a dovecote) among
  trees; the farmer's old orchard in rows on the slope (round crowns dotted red); fields of golden stubble with round
  bales, a field of late wheat, hedgerows with oaks; a church spire far off.
- The farmer's tree (FARM_TREE), the signature: a big, old, gnarled apple tree, its trunk ink-drawn with character
  (a lean, a split, lichen), a broad crown of deep late-summer leaf heavy with red apples (many small translucent
  dabs, highlights, darker undersides), and its **low boughs** reaching out to either side over the grass (BOUGH),
  bending under the fruit, low enough for anyone to pick. A ladder leans against it (LADDER), a prop.
- The pickers' orchards (SLOTS): two plots of grass mown between the rows, the young trees on their stakes. Before
  the first tree, the empty slots are just grass with the row lines faintly mown.
- The path (PATH) along the front of both orchards to the farmer's tree, worn in the grass. At each outer front
  corner the picker's stack of wooden crates of golden apples (CRATES; stencilled in its accent colour) and an
  upturned crate to sit on (SEAT).
- The farm track along the front (TRACK) with a grassy verge of late-summer flowers (knapweed, scabious, yarrow,
  ox-eye daisies, seed heads, a few poppies), and long grass at the very front.
- Ambient: a light breeze in the grass and leaves; a leaf or two drifting down now and then; wasps and a butterfly
  or two over the windfalls; swallows high now and then; an apple dropping from the farmer's high crown rarely. All
  off in reduced motion.

The young orchards (orchard.ts, OrchardView in partsApi.ts):
- Each tree comes up at its slot as the money arrives: a seedling (a shoot, then two leaves), then a whip with a
  stake and a tie, then a young tree, then an apple tree in its prime. Its crown's painted area is proportional to
  YoungTree.size (TREE_MAX is size 1), the same scale on both plots, so **the canopy is the money**: B's orchard ends
  twice A's, and in each, the oldest trees (at the back) are the biggest, which is the compounding.
- Golden trees bear golden-yellow apples (APPLE.own), red trees red apples (APPLE.match); both the same kind of tree
  in the same leaf. The red trees' stakes carry a small label tied on with a red band (identity never by colour
  alone). Fruit from about two years of age, more as the tree grows.
- Use Time to Grow's tree model and painter (src/scene/treeModel.ts, treePainter.ts, as Brick's springArt.ts does)
  or a lighter model built for small trees, whichever paints better at this size; but the same watercolor look:
  clumps of leaf in three or four values by where each sits against the light, ink accents on the trunk.
- Performance: there can be 72 trees on screen, every one growing. Paint each tree's crown to a sprite in steps of
  its size (a step of about 3% of its linear size, never visible as a jump; cross-fade two steps if needed) and reuse
  it; never repaint a tree whose step has not changed.

The pickers (picker.ts, Picker in partsApi.ts; build on Brick's crew: figure.ts skeleton, measured walk, turning,
depth sorting, crewArt's costume sprites; import what is generic, copy and adapt what is tied to Brick):
- Dressed for fruit picking in late summer: a wide-brimmed straw hat or a cotton sun hat, rolled shirtsleeves, a
  neckerchief in the picker's accent colour (A blue, B green), a canvas picking apron or bag, cord or canvas
  trousers, boots. Proportions from geom.ts (FIGURE_H 64, depthScale): about 1.75 m.
- The basket: a round wicker picking basket carried on the arm or on the hip with both hands, its fill visible:
  golden apples at the bottom (basket.own), red on top (basket.match). A's basket is half as full as B's.
- The round (PickerActivity 'work', described in partsApi.ts): fill at the crates (golden apples, one handful at a
  time), carry to the farmer's tree, pick red apples from the low bough one by one (reach up, twist, drop in the
  basket), carry into the orchard to the newest tree, kneel or stoop and tip the basket out at its foot, back to the
  crates. The free fruit on each side ripens with each round (offer); A picks only half of it, and the rest drops
  into the grass and lies there browning and fading over about a year (WINDFALL): **the free money left on the
  branch**. B's grass stays clear.
- At 1x the 30 years pass in 30 s, so the picker's round (about 8 s at 1x) shows where the money goes rather than
  carrying every dollar; the money plants the trees (a seedling comes up at the slot the picker last tipped at, or
  nearby in the same row). The picker's clock runs at the playback speed; at high speeds it works without pause.
- At the end both put the basket down, sit on their upturned crates, take an apple, and look up at their orchards.
- Animation quality bar (non-negotiable, as the vine, the snow and the brick): never teleport or snap a pose; every
  transition blended over at least 0.25 s; a proper gait with no foot sliding; turning through a three-quarter view;
  nothing passes through anything; the apples move from hand to basket, never appear.

Camera: always the whole farm (no zoom); VIEW as Brick's layout.ts, adjusted to this composition.

Performance: sky, distance, farm, the farmer's tree (crown and trunk), the orchard ground, the path, the crates and
the track pre-rendered once per size; the young trees through their size-step sprites; the figures through a small
cache (Brick's scene/cache.ts) that repaints only when the pose visibly changes. Image smoothing 'medium'. 60 fps at
1440 × 900. Determinism: the same frame inputs give the same orchards and windfall heaps.

## Introduction and notes (no scripted story)
The page opens with the shared introduction (src/shared/intro.ts, src/styles/intro.css; content in
low-hanging-fruit.html): kicker "Saving at work", title "Low-Hanging Fruit", lede "The same pay and the same match
from work. What does saving 3% instead of 6% leave behind?"; how to read it (each picker's own savings are golden
apples; the employer's match is the farmer's red apples, half a basket for every basket saved, up to 6% of pay;
every basket is planted, and the orchard is the savings: each tree grows with the years); the two pickers (A saves
3% of pay and picks only half the free fruit: the rest falls; B saves 6% and picks it all, but takes home $150 less
a month); and how to use it. "Start exploring" (Escape, or a click on the scene, closes it too). It shows the first
time per browser session (key `fib-intro-seen:low-hanging-fruit`); "About this demo" opens it again. The timeline
then waits at month 0, paused. Play runs the whole timeline in 30 s at 1x (PLAY_SECONDS), scaled by the speed slider
(0.1×–5×, log scale, as the vine).

Short notes at the top left under the title follow the MONTH (played or dragged), from src/orchard/app/notes.ts,
every number live from the engine, in time order for any inputs (the defaults shown):
| months | note (primary / secondary) |
|---|---|
| before the first payday | "The same pay. The same match." / "Work adds 50¢ for every $1 saved, up to 6% of pay." |
| the first year | "A saves 3% of pay. B saves 6%." / "A: $150 a month, plus $75 free. B: $300, plus $150 free." |
| years 1 to 5 | "A leaves $75 a month of free money on the branch." / "B takes home $150 less a month, and gets $75 more free." |
| until the growth passes what was put in | "Every tree keeps growing." / live: "So far: A $X, B $Y." |
| until a year before the end | "Now the growth outweighs everything put in." / live: "Left on the branch so far: $X. Grown, it would be $Y." |
| the last year and the end | "A: $274,493. B: $548,987." / "The match alone grew to $91,498 for A and $182,996 for B." |
Names: the pickers are A and B with their rates; when both save at or over the limit: "Both save enough for the
whole match." (then the notes compare totals only); when the match is 0: "No match here: only the saving differs.";
when one saves 0: "A saves nothing, so A gets no match." When A saves more than B, the copy follows (never assume
B saves more). Every amount is live from the engine.

## Controls (right panel, same look as the brick)
Play/Pause, speed slider, timeline (months, year ticks, labelled every five years), Pay ($ a year), Years, Growth
(% a year), then "The match" group: Match (¢ per $1, shown as %) and Up to (% of pay), then "Picker A" and "Picker B"
(Saves, % of pay), Reduce motion, assumptions note, "How this is calculated" (per picker: the monthly own, match and
missed with their numbers, the formula, total put in, total match, value at the end; a yearly table of values).

Labels (DOM, positioned from labelAnchor, in the bottom band under each orchard, as the brick's): an italic serif
letter in a roundel (A, B) and "Saves 3%", then "$150 a month + $75 match", then "Worth $117,208" (live, statement),
and for a picker leaving match untaken, "$X left on the branch" under it. Between them, once both have started,
the difference ("B is ahead by" during, "B ends ahead by" at the end, live). Year readout top right of the scene
(statement month; hidden while the panel is open, as the brick). Text over the sky sits on the lifted wash
(≥ 4.5:1). Identity never by colour alone: the letters and the labels.

## Files
- docs/ORCHARD_SPEC.md, src/orchard/types.ts (the contract), src/orchard/scene/geom.ts (world geometry),
  src/orchard/scene/partsApi.ts (the young orchards' and the pickers' contracts).
- Engine and app: src/orchard/engine/*, src/orchard/app/* (store, loop, notes, text, ui), src/orchard/main.ts,
  low-hanging-fruit.html, src/styles/orchard.css; tests/orchard/*, tests/e2e/orchard.spec.ts.
- Scene: index.ts (the orchestrator), layout.ts (camera), sky.ts, world.ts (distance, farm, fields, the orchard
  ground, the path, the track, the verges), farmTree.ts (the farmer's tree), props.ts (crates, seat, ladder),
  ambient.ts (leaves, wasps, butterflies, swallows), cache.ts.
- The young orchards: orchard.ts (OrchardView), appleArt.ts (the trees' leaf, fruit and bark).
- The pickers: picker.ts (Picker: the round, the basket, the low fruit, the windfalls), pickerArt.ts (costumes).
- The landing page entry: src/landing/demos.ts, public/assets/preview-orchard.webp.
