# Experience spec (coordinator-owned)

## Single source of truth
One store object, mutated only through small action functions; one rAF loop.

```
state = {
  inputs: Inputs              // last VALID inputs
  draft: Record<field,string> // raw field text; may be invalid
  errors: ValidationResult.errors
  scenario: Scenario          // buildScenario(inputs)
  targetScale: number         // visualScaleFor(scenario)
  displayScale: number        // eases toward targetScale (τ ≈ 300 ms; reduced motion 150 ms)
  ageMonths: number           // THE shared clock (float)
  mode: 'story' | 'explore'
  storyTime: number           // seconds into the guided story (story mode only)
  playing: boolean
  speed: 0.5 | 1 | 2 | 4
}
```
Per frame: advance clock (dt × speed, dt clamped to 100 ms so tab switches don't jump) →
in story mode ageMonths = storyAge(storyTime) → snapshots ('smooth' for visuals, 'exact' for numbers) →
maturity = maturityFor(smoothBalance, displayScale) → scene.render(frame) → DOM readouts updated only when the
displayed month index or displayed values change.

Same inputs + same ageMonths ⇒ same frame (wind aside). Scrubbing only sets ageMonths.

## Guided story (≈ 54 s at 1×), all driven by storyTime → ageMonths (piecewise linear, eased at joins)
| storyTime | age | chapter | caption (primary / secondary) | other |
|---|---|---|---|---|
| 0 – 7 s | 25 → 25¼ | planting | "Same monthly contribution. Different starting ages." / "Tree A starts at 25. Tree B starts at 35." | B shows marker "Plants at 35"; A's sprout emerges |
| 7 – 15 s | 25¼ → 35 | growing | "Each month, $200 goes in." | pulses into roots; loupe on A roots 8–12 s |
| 15 – 18 s | 35 → 35.4 | growing | "At 35, Tree B begins." | slow beat as B sprouts |
| 18 – 37 s | 35.4 → 65 | growing | "Growth is reinvested, so branches grow new branches." | loupe on A branches 25–30 s |
| 37 – 50 s | 65 hold | difference | "Time gives growth room to branch." / "$24,000 of the gap is extra contributions. $162,633 is growth that had ten more years to compound." | results reveal (balances, contributed vs growth, difference) |
| 50 – 54 s | 65 | explore handoff | "Explore your own timeline" | controls get a soft highlight; then mode → 'explore', paused at 65 |

Story copy uses live values (contribution, ages, computed amounts) — never hard-coded dollars.
Story ages are expressed relative to the scenario (startA, startB, endAge), so a replay after edits still works.
If startA == startB the "Tree B begins" beat is skipped and copy says both start together.

Controls during story: Pause/Play, Replay (story from 0), Skip ("Skip to explore" → explore mode, age = endAge,
results visible, paused), speed applies to storyTime. Scrubbing the timeline or editing any input exits story
into explore mode at the current age.

## Explore mode
- Play advances ageMonths at 2 years/s × speed from current age; at end it stops; Play at end restarts from timeline start.
- Input change: rebuild scenario if valid; keep ageMonths if within [timelineStart, timelineEnd]; below → timelineStart;
  above → timelineEnd and pause. Scale eases to the new target (both trees together).
- Invalid input: field shows error (aria-invalid + aria-describedby), scene keeps last valid scenario.

## Reduced motion (prefers-reduced-motion or in-page toggle)
- No wind, no pulses, no loupe zoom animation (loupe may appear statically with a fade).
- Story does not autoplay; starts paused on moment one with a "Play story" button. When played, age advances in
  discrete holds (25, 25¼, 35, 45, 55, 65) with ~400 ms eased tween between holds.

## Layout
Desktop (≥ 900 px): scene canvas fills width, height = viewport − control dock (min 440 px). Title "Time to Grow"
small at top-left (display face). Caption centered at top of scene. Specimen-plate labels under each tree base
(italic serif letter + label + balance). Difference label centered between trees once both are planted.
Dock below: transport row (Play, Replay, Skip, speed) + scale-bar timeline (age ticks every 5 years, markers for
A and B starts); inputs row; assumptions note + "How this is calculated" disclosure.
Mobile (< 700 px): scene ≈ 58 svh; dock below in 2-column grid; 44 px minimum touch targets.

## Copy (short, hopeful, never shaming)
- Labels: "Tree A · started at 25", "Tree B · starts at 35" (before planting) / "started at 35".
- Breakdown per tree: "$96,000 contributed · $285,536 modeled growth".
- Assumptions (always visible, small): "Illustration only: a constant hypothetical return with growth reinvested.
  No taxes, fees, or inflation. Actual returns vary and aren't guaranteed. Tree size illustrates growth; it isn't a
  literal dollar scale."
