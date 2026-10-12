# Against the Current — spec (coordinator-owned)

Second demonstration in the "Finance is beautiful" collection. Same world as Time to Grow: warm ivory paper,
ink-and-watercolor illustration, light from the upper left, quiet type (Libre Caslon Display / Text italic,
Figtree), collapsible right-hand controls panel, guided story that hands off to exploration, 30 fps motion cap.

## The lesson (one sentence)
Rising prices are a current: money that sits still drifts backwards, and it has to grow faster than prices to
make headway.

## Math (src/river/engine, pure, tested)
- Effective annual rates; fractional years allowed: `nominal(t) = start · (1+r)^t`, `real(t) = nominal(t) / (1+i)^t`.
- Position: `logReal = ln(real/start) = t · (ln(1+r) − ln(1+i))` — constant speed per boat.
- Shared scale `S = max(|logReal(end)| over the three boats, ln 1.6)`; scene u = logReal / S (shared by all boats,
  eased when inputs change, never per boat). Disclose: "Distance on the river is a log scale of buying power."
- Mileposts on the near bank at real values start × 2^k and start × 1.5^±1 (whichever fit), labelled
  "$5,000 today", "$10,000 today" (the dock), "$20,000 today".
- Display: "Year 12"; per boat: name, nominal dollars, "buys what $X buys today". Difference callouts optional.
- Defaults (30 yrs, 3% inflation): cash $10,000 → buys $4,120; savings 2% $18,114 → $7,463; invest 6% $57,435 → $23,662.
- Validation like Time to Grow (finite numbers, ranges in RIVER_LIMITS, whole years). Zero inflation = still water.
  Investment may be negative (boat drifts faster than cash), which must render correctly.
- Assumptions note: constant hypothetical inflation and returns, no taxes or fees, actual results vary, not advice.

## Scene (src/river/scene, Canvas 2D, contract in src/river/types.ts)
Composition (world units, fixed aspect like Time to Grow; framed between insets):
- Sky: reuse `paintSky` (paper layer, static). Far bank: soft distant hills wash, a few small trees (reuse
  `TreePainter` at small maturities, paler/hazed like the landing page's far trees), reeds.
- The river: a broad band across the full width, slightly wider downstream, from far bank (top) to near bank
  (bottom). Painted as layered washes: deeper teal-blue in the channel, lighter near the banks, sky reflected
  in the upper water, granulation, a few painted stones at the edges.
- Near bank: meadow wash and soil edge like Time to Grow, grass tufts, reeds and rushes, and the mileposts:
  small weathered wooden posts with a painted plaque (no text painted — labels are DOM), evenly spaced in u.
- The dock at u = 0: a small wooden jetty from the near bank into the water, planks drawn like the fence
  (warm wood washes, grain, broken ink). Boats start tied alongside it.
- Three lanes (far, middle, near) at slightly different water depths; boats are all THE SAME SIZE (fairness),
  only lightly offset in y. Order top→bottom: invest (far), savings (middle), cash (near).

Motion (everything decorative is wall-clock; positions come only from the frame):
- Current: drifting watercolor streaks and small ripple marks moving downstream (right) at a speed ∝ inflation
  (0 → still, gentle idle shimmer only). Continuous, wrapping seamlessly; never resets visibly.
- Boats: small wooden rowboats (clinker planks drawn in ink, painted hull — cash: warm terracotta/coral,
  savings: golden ochre, invest: emerald; plus a letter-free emblem so identity isn't color alone, e.g. a coin
  jar in cash, a small strongbox in savings, a sprouting sapling in a pot in invest). Gentle bob and pitch.
- Rowers: one small figure per boat (straw hat, scarf in the boat color, simple ink-and-wash body). Stroke cycle
  (catch → drive → finish → recovery) with oars dipping into the water, splashes/ripple rings at the catch,
  stroke rate and depth ∝ effort. Cash rower rests: oars shipped, leaning back, a little nod.
- Wake: V-shaped ripples and a short trailing wake proportional to the boat's speed through the water
  (`waterSpeed`); a drifting boat shows only small bow ripples.
- Reflections: each boat and rower reflected in the water (flipped, faded, rippled by sine displacement).
- Ambient: light breeze in reeds and far trees, a heron or a few water birds occasionally (optional, restrained),
  a soft sparkle on the water under the sun. All off in reduced motion.
- Opening camera (story only): starts close on the dock with all three boats tied up, eases out to the full
  river before the boats separate (same rules as Time to Grow: labels fade during zoom, shared scale always).

Performance: paper/sky/far bank/static river base/near bank pre-rendered once per size into cached layers;
per frame only water motion layer (cheap strokes from a cached sprite pool), boats, rowers, wakes,
reflections. Target ≤ 6 ms/frame at 1440×900 DPR 1. Determinism: same frame inputs ⇒ same boat poses
(water texture may move with time).

## Story (~50 s at 1×), driven by story time → years elapsed
| t (s) | years | caption | notes |
|---|---|---|---|
| 0–6 | 0 | "Three boats. The same $10,000." / "Cash, a savings account, and investing." | camera close on the dock, boats tied |
| 6–12 | 0 → 1 | "Prices rise a little every year. That's the current." | camera eases out; water starts to flow |
| 12–20 | 1 → 6 | "Cash doesn't row. It drifts." | cash slides downstream |
| 20–28 | 6 → 14 | "A savings account rows, but slower than the current." | savings loses ground slowly |
| 28–38 | 14 → 30 | "Investing has to row harder than the current to make headway." | invest moves upstream |
| 38–48 | 30 | "Still $10,000 in cash. It buys what $4,120 buys today." (live values) | results; difference callouts |
| 48–52 | 30 | "Explore your own river" | hand off to explore, paused at the end |
Copy is live (values from the engine), hopeful and plain, never scary. Reduced motion: discrete holds.

## Controls (right panel, same look as Time to Grow)
Play/Pause, speed (0.5×–4×), year timeline (scale bar with year ticks), Starting amount, Years, Inflation,
Savings account return, Investment return, Reduce motion, assumptions note, "How this is calculated"
(table per boat: nominal, real, change; formulas; log-scale note).
