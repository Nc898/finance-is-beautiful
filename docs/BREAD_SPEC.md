# Bread and Butter: spec (coordinator-owned)

Seventh demonstration in the "Finance is beautiful" collection, under **Prices and inflation**. Read
`docs/QUALITY_BAR.md` in full first; this spec follows its recipe (section 3) and every rule in it applies. Same
world as the other six: warm ivory paper, **ink drawing under watercolor washes**, light from the upper left, quiet
type (Libre Caslon Display, Caslon Text italic, Figtree), the collapsible right-hand panel, an introduction then free
exploration (**no scripted story**), 60 fps. Art at the sister demos' finish at 2×. No em-dashes in any copy; short
copy.

**What makes this one different: it is real.** Every other demo uses steady hypothetical rates. This one uses actual
US prices and pay, month by month from January 1980 to the latest published month, from the U.S. Bureau of Labor
Statistics. It should feel like a record, not an illustration.

Title "Bread and Butter": the everyday basics, and the job that pays for them. That is the comparison.

**The owner's choices** (2026-11-11): price vs pay; a corner grocery (the collection's first indoor scene); the grocer
as the one figure, re-chalking the prices by hand; six items priced since 1980; built with parallel builders, two at
a time.

## The lesson (one sentence)
Prices rise almost every year, but what matters is what they cost against what you earn: this week's groceries took
86 minutes of a median week's pay in January 1980, about 41 at their cheapest in 2021, and about 51 today.

Framing (the owner agreed): 1980 is where the BLS average prices begin, and it was the peak of a high-inflation era
(prices rising 14.8% a year in March 1980, the fastest since 1947), when pay had just fallen behind. So the page never
headlines "today vs 1980" alone: the notes walk through the eras (the early-80s catch-up, the calm decades, the 2008
food spike, the 2021 to 2025 surge), and the introduction and "How this is calculated" say what 1980 was.

## The data (src/bread/engine/data.ts, generated; never edit by hand)
`node scripts/fetch-bread-data.mjs` downloads from FRED (the St. Louis Fed's republication of BLS data) and writes
the file. Re-run it to bring the demo up to date.
- **Prices**: BLS Average Price Data, U.S. city average, monthly, not seasonally adjusted:
  - bread, white, pan, per lb (APU0000702111)
  - eggs, grade A, large, per dozen (APU0000708111)
  - coffee, 100% ground roast, per lb (APU0000717311)
  - bananas, per lb (APU0000711211)
  - chicken, fresh, whole, per lb (APU0000706111)
  - flour, white, all purpose, per lb (APU0000701111)
- **Pay**: median usual weekly earnings, full-time wage and salary workers, nominal dollars, before tax, quarterly,
  seasonally adjusted (LES1252881500Q). A quarter's figure covers its three months.
- **Price indexes** (consumer price index, monthly from January 1979 so 1980 has its 12-month rate; the owner
  chose all three on 2026-11-11):
  - all items (CPIAUCNS): **prices overall**, the inflation rate the notes quote;
  - food at home (CUUR0000SAF11): **all groceries**, the benchmark that says whether this basket is typical (it is
    not quite: these staples rose less than groceries overall, and the page says so);
  - all items less food and energy, "core" (CPILFENS): one explanatory line in "How this is calculated" only. It
    leaves out food, which is the whole of this demo, so it is never the headline.
- **Gaps**: months the BLS did not publish are null in the data: coffee from September 2007 through 2008 (and a
  little beyond), a few single months, and October 2025 (the government shutdown: also the pay survey's 2025 Q4 and
  all three indexes). The engine fills each gap by a straight line between the nearest published months, flags the filled
  values, and "How this is calculated" lists them. Never present a filled value as published.
- BLS notes that average prices measure the price level in a month, not the precise rate of change; the inflation
  rate in the notes comes from the CPI, not from the basket.

## Math (src/bread/engine, pure, tested; contract in src/bread/types.ts)
- Months m = 0 (January 1980) … DATA_MONTHS − 1 (September 2026 at the first fetch).
- Price of item i at month m: published, or interpolated (flagged). Basket(m) = Σ quantity_i × price_i(m).
- Weekly pay(m) = the pay of quarter ⌊m / 3⌋ (interpolated across a missing quarter). Hourly pay = weekly / 40.
- **Minutes of work(m) = basket(m) ÷ (weekly pay(m) ÷ 40) × 60.** The headline number.
- Inflation(m) = index(m) ÷ index(m − 12) − 1, for each index: prices overall, groceries (food at home) and core.
- Smooth and statement, as the other demos: within month k … k + 1 the picture's figures move linearly from month k
  to month k + 1; the numbers on screen show whole month k (statementMonth).
- The basket is the reader's to change (quantities of each item, 0 … the limits in types.ts); the defaults are one
  week's shop: **2 lb bread (two loaves), a dozen eggs, 1 lb coffee, 3 lb bananas, a 3 lb chicken, a 5 lb bag of
  flour.**
- Verified at the defaults (computed from the data with these rules; the engine's tests match them to the cent and
  the tenth of a minute, and are updated when the data is re-fetched):

  | month | basket | weekly pay | minutes of work | prices overall (12 mo) | groceries (12 mo) | core (12 mo) |
  |---|---|---|---|---|---|---|
  | 1980-01 | $9.16 | $254 | 86.5 | 13.9% | 7.8% | 12.0% |
  | 1985-01 | $8.86 | $334 | 63.7 | 3.5% | 2.1% | 4.5% |
  | 2000-01 | $12.41 | $568 | 52.4 | 2.7% | 1.2% | 2.0% |
  | 2021-01 | $17.96 | $984 | 43.8 | 1.4% | 3.7% | 1.4% |
  | 2025-01 | $26.67 | $1,192 | 53.7 | 3.0% | 1.9% | 3.3% |
  | 2026-09 | $26.15 | $1,239 | 50.7 | 3.7% | 1.8% | 2.6% |

  - Most minutes: January 1980, 86.5. Fewest: July 2021, 41.0.
  - Prices overall peaked at 14.8% a year (March 1980); since 2010 at 9.1% (June 2022).
  - **Groceries peaked in 2022, not 1980**: 13.5% in the year to August 2022, faster than at any point since 1980
    (in January 1980 they were rising 7.8%). The two eras differ: 1980 was prices overall, 2022 was food.
  - Since January 1980: this basket ×2.86, all groceries ×3.81, prices overall ×4.33, core ×4.43, pay ×4.88. Pay
    outran every measure, and this basket of staples rose less than groceries overall; the page says both.
  - Eggs: $1.47 a dozen in January 2021, a record $6.23 in March 2025, $2.27 in September 2026.
  - Yearly average minutes: 1980 84, 1981 75, 1985 62, 1990 62, 2000 52, 2008 54, 2010 52, 2019 43, 2021 43, 2022 50,
    2025 54, 2026 51.
- Validation like the other demos (finite numbers, whole quantities within limits). A basket of nothing is valid:
  the notes say "An empty basket costs nothing." and the minutes show 0.

## Scene (src/bread/scene, Canvas 2D; contract BreadSceneAPI in types.ts, geometry in scene/geom.ts, parts in scene/partsApi.ts)
Inside a small neighbourhood corner grocery on a rainy morning. **The collection's first interior**: warm lamplight
inside, a cool grey-blue morning outside. World 1000 × 640, fixed in geom.ts (read its header first). The camera
stands in the shop facing the counter; it never zooms.
- **The shop window and door** (WINDOW, left): a tall window with a painted sign in reverse on the glass, rain
  streaking down it, the street beyond in soft cool washes (wet pavement with reflections, a lamp-post, the shopfront
  opposite, a passer-by under an umbrella now and then). A bell over the door.
- **The shelves** (SHELVES, back wall): wooden shelves of tins, jars, packets, sacks and bottles, painted with care
  but kept a value or two quieter than the counter so the eye goes to the basket and the board. Nothing cloned: vary
  every tin, label and gap.
- **The chalkboard** (BOARD, back wall right): a slate in a wooden frame, headed "This week's basket", the year
  chalked large at the top, then six lines (item and price) and a ruled line with the total. Chalk is a soft,
  slightly broken pale stroke with dust; the numbers are hand-written (the grocer's hand: a consistent, slightly
  old-fashioned script, not a font).
- **The counter** (COUNTER, the middle ground): a long wooden counter, worn at the front edge, with a brass scale
  (SCALE), an old till (TILL), paper bags and string. **The basket** (BASKET) lies on it: two loaves, a carton of a
  dozen eggs, a tin or bag of coffee, a bunch of bananas, a whole chicken in butcher's paper, a 5 lb paper sack of
  flour. Each item is painted in its place (BASKET_SLOTS); when a quantity changes, items are added or taken away by
  the grocer's hand (see below), never popping in.
- **The floor and front** (FLOOR, CRATES): worn boards, a few crates of produce in the foreground at the edges (apples,
  potatoes, greens) to frame the view, a mat by the door.
- **The light**: a pendant lamp or two over the counter, warm pools of light on the counter and the grocer, cool
  daylight from the window falling across the left; long soft shadows. This palette (warm amber inside, slate and
  rain-blue outside, chalk white, brown paper) is new to the collection.
- **Ambient** (all off in reduced motion): rain on the window, drips, a passer-by now and then, steam from a cup on
  the shelf behind the counter, dust in the lamplight.

**The grocer** (scene/grocer.ts, Grocer in partsApi.ts; build on the house figures as section 3 of the quality bar
says: Brick's figure.ts skeleton, turning through three-quarter views, costume sprites, pose cache; the orchard
pickers' CMU-fitted walk for any steps):
- A shopkeeper of middle age: rolled shirtsleeves, a waistcoat or a long canvas apron, a pencil behind the ear, a
  cloth over the shoulder. Proportions from geom.ts (GROCER_H). Behind the counter his legs are hidden; he steps out
  past the counter's end to reach the board (GROCER_SPOTS).
- **His work is the prices.** The board shows what the grocer last chalked, not the true month: he goes along the
  board line by line, wipes the old price with his cloth and chalks the new one (the chalk appears stroke by stroke
  under his hand; the board's API takes the chalk tip's position). After the six lines he rubs out and writes the
  total, and the year at the top. The board is chalked once a year, with January's prices (boardMonth in
  app/text.ts): at 1× a year takes 6 s, about one pass (the year chalked last, so the board is never a new year over old prices), and between passes he waits by the board with his tools in
  hand. At high speeds he skips straight to the latest year on each line. The month's exact figures are always in
  the labels below the scene.
- Between passes and when a quantity changes he tidies the basket: adds or takes away a loaf, an egg carton, a pound
  of bananas, wraps or unwraps the chicken, sets the flour sack down. Paused, he finishes the line he is on, then
  stands by the counter (idle: wiping it down, looking out at the rain).
- `place(intent)` (scrubbing, reduced motion): the settled state: the board fully up to date for the month, the basket
  complete, the grocer standing at the counter. Scrubbing rebuilds exactly.
- Quality bar (non-negotiable, copied into his brief): no teleports or snapped poses, every transition blended over
  at least 0.25 s; no foot sliding; three-quarter turns; nothing passes through the counter, the board or the shelves;
  the chalk appears only under the chalk's tip, the old price leaves only under the cloth, items move only in his
  hands.

**The labels** (DOM, the bottom band, positioned from labelAnchor, as the other demos' plates):
- Left, the basket as a paper till receipt: "This week's basket" and the total for the month ("$9.16", live,
  statement), with "Jan 1980".
- Right, the pay as a brown pay envelope: "A week's pay" and the median ("$254"), small: "median, full time, before
  tax".
- Between them, the headline: "86 minutes of work" (live), under it "to buy the basket".

Camera: the whole shop always (no zoom); VIEW as Brick's layout.ts, adjusted. Performance: the shop, window frame,
shelves, counter, floor and crates pre-rendered once per size; the rain, the board and the basket as their own
layers; the grocer through the pose cache; the chalk text cached per line and repainted only as it is written. 60 fps
at 1440 × 900. Determinism: the same month and basket give the same board, basket and labels.

## Introduction and notes (no scripted story)
The shared introduction (src/shared/intro.ts): kicker "Prices and pay", title "Bread and Butter", lede "A real week's
groceries and a real week's pay, every month since 1980."; how to read it (the board shows what the basket costs; the
envelope shows a median week's pay; the headline is how many minutes of that pay the basket takes); a line on 1980
("1980 was the peak of a high-inflation era: prices were rising 14% a year, and pay had just fallen behind."); the
data ("Real prices and pay from the U.S. Bureau of Labor Statistics."); how to use it. Key
`fib-intro-seen:bread-and-butter`. The timeline then waits at January 1980, paused. Play runs the whole timeline at
a year every 6 s at 1× (SECONDS_PER_YEAR; PLAY_SECONDS = 280, under five minutes), scaled by the speed slider (0.1×–5×, log, as the vine): real
history needs more time to read than the hypothetical demos.

Short notes at the top left under the title, by month, every number live from the engine (the defaults shown):
| months | note (primary / secondary) |
|---|---|
| 1980 | "1980: prices rising 14.8% a year." / "The fastest since 1947, and pay had fallen behind." |
| 1981 to 1985 | "The 1980s: inflation cools and pay catches up." / "This basket now takes 64 minutes of work." |
| 1986 to 2006 | "Two calm decades: prices creep up a little each year." / "Pay rises a little faster." |
| 2007 to 2009 | "2008: food prices jump, then the recession." / "Flour and eggs leap in a year." |
| 2010 to 2020 | "Groceries stay steady while pay keeps rising." / live: "N minutes of work." |
| 2021 | "2021: the basket at its cheapest, 41 minutes of work." / "Then prices start to climb." |
| 2022 to 2025 | "2022: grocery prices up 13.5% in a year." / "Faster than at any point since 1980." (from 2023, live: "Eggs: $X a dozen.") |
| the latest months | "Today: $26.15 for the basket, 51 minutes of work." / "Since 1980, the basket ×2.9, pay ×4.9." |
Each era's note is written from the data (the engine exposes the landmark months and figures); when the reader's
basket changes, the minutes and totals follow it, and a note that no longer fits (say, eggs taken out) falls back to
the minutes. A last note at the end: "Since 1980: this basket ×2.9, all groceries ×3.8, pay ×4.9."

## Controls (right panel, the same look as the orchard)
Play/Pause, speed slider, timeline (months, a tick every year, labelled every five), "This week's basket": six
quantity steppers with the item and its unit (Bread, loaves (lb); Eggs, dozens; Coffee, lb; Bananas, lb; Chicken, lb;
Flour, lb), Reduce motion, the assumptions note ("Real BLS prices and median full-time weekly pay, before tax. Prices
are U.S. city averages; yours will differ."), "How this is calculated": the formula with this month's numbers, this
month's prices (filled values marked "estimated: not published"), a year-by-year table (basket, pay, minutes,
inflation), and the sources with their series codes and the fetch date. One line on core inflation for readers who know the
term: "Core inflation leaves out food and energy, so it is not used here. This month it was X%."

Year and month readout top right of the scene (statement month; hidden while the panel is open, as the brick).

## Files
- docs/BREAD_SPEC.md; scripts/fetch-bread-data.mjs → src/bread/engine/data.ts (generated); src/bread/types.ts (the
  contract); src/bread/scene/geom.ts (the shop's geometry); src/bread/scene/partsApi.ts (the grocer's and the board's
  contracts).
- Engine and app: src/bread/engine/*, src/bread/app/* (store, loop, notes, text, ui), src/bread/main.ts,
  bread-and-butter.html, src/styles/bread.css; tests/bread/*, tests/e2e/bread.spec.ts.
- The shop: scene/index.ts (the orchestrator), layout.ts, shop.ts (window, shelves, walls, floor, light), street.ts
  (the view and the rain), counter.ts (counter, scale, till, bags), board.ts (the slate and the chalk), ambient.ts,
  cache.ts.
- The grocer and the basket (items move only in his hands, so they are one part): scene/grocer.ts (actions, the
  board passes, the basket), grocerArt.ts (costume), basket.ts (the six items' art, by quantity).
- Landing: the catalog entry (topic "inflation"; concept "Prices vs pay"; summary "Prices rise most years, but what
  counts is how many minutes of work your groceries cost."; search words groceries, food prices, wages, pay, cost of
  living, purchasing power, real wages, eggs), its painter and a preview baked from the real scene.

## Build (the recipe, QUALITY_BAR.md section 3)
Builders two at a time, each with the brief template, the quality bar copied in, and a harness + frame captures:
1. Engine and app (data handling, engine, store, notes, UI, page, tests).
2. The shop (everything but the grocer and the basket; the board's slate and its chalk renderer with the write and
   wipe API in partsApi.ts).
3. The grocer and the basket (after 2 has the board's API in place), driving the board and the counter.
Then the coordinator's review of 2× crops and frame strips against the sister demos, fix lists, and only then the
owner.
