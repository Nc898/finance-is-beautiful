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
  playing: boolean
  speed: 0.5 | 1 | 2 | 4
}
```
Per frame: advance clock (dt × speed, dt clamped to 100 ms so tab switches don't jump) →
snapshots ('smooth' for visuals, 'exact' for numbers) →
maturity = maturityFor(smoothBalance, displayScale) → scene.render(frame) → DOM readouts updated only when the
displayed month index or displayed values change.

Same inputs + same ageMonths ⇒ same frame (wind aside). Scrubbing only sets ageMonths.

## Introduction and notes (no scripted story)
The demonstration opens with the shared introduction (src/shared/intro.ts; content in time-to-grow.html): what it
shows, how to read the trees (contributions at the roots, reinvested growth branching), the two trees and the
difference, and how to use it. It shows the first time per browser session; "About this demo" opens it again. The
clock then waits at the earlier planting (25), paused; Play runs the whole timeline in 24 s at 1x.

Short notes under the title follow the AGE (played or dragged), from src/app/notes.ts (t0 = the earlier start,
t1 = the later one, end = endAge):
| age | note (primary / secondary) |
|---|---|
| t0 to t0 + 3 months | "Same monthly contribution. Different starting ages." / "Tree A starts at 25. Tree B starts at 35." |
| to t1 | "Each month, $200 goes in." |
| t1 to t1 + 12 months | "At 35, Tree B begins." |
| to the end | "Growth is reinvested, so branches grow new branches." |
| the end | "Time gives growth room to branch." / "$24,000 of the gap is extra contributions. $162,633 is growth that had ten more years to compound." |
Copy uses live values (contribution, ages, computed amounts), never hard-coded dollars. If startA == startB the
"Tree B begins" note is skipped and the copy says both start together.

The close views follow the age too, so they replay the same way whether played or dragged:
- The camera opens close on the first seedling (zoom 3.4), holds for its first 3 months, then eases out to the full
  shared view before the second tree is planted (by t0 + max(9, 0.92 (t1 − t0)) months; t0 + 8 years with one tree,
  or both together). The tree labels fade while it is close.
- The loupe opens on the later tree's roots for its first 5 months, faded in and out over a month.
Neither shows under reduced motion.

## Scene insets
The app reserves a stable top band (header + the tallest caption at the current breakpoint) and a bottom band
(specimen plates + difference label) via `scene.setInsets`, recomputed on resize only — never per caption — so the
camera never jumps and no caption overlaps a crown.

## Playing and editing
- Play advances ageMonths across the whole timeline in 24 s at 1x, × speed, from the current age; at the end it
  stops; Play at the end restarts from the timeline start.
- Input change: rebuild scenario if valid; keep ageMonths if within [timelineStart, timelineEnd]; below → timelineStart;
  above → timelineEnd and pause. Scale eases to the new target (both trees together).
- Invalid input: field shows error (aria-invalid + aria-describedby), scene keeps last valid scenario.

## Reduced motion (prefers-reduced-motion or in-page toggle)
- No wind, no pulses, no loupe zoom animation (loupe may appear statically with a fade).
- No camera close view and no loupe. Play works the same (nothing ever autoplays).

## Layout
Desktop (≥ 900 px): scene canvas fills width, height = viewport − control dock (min 440 px). Title "Time to Grow"
small at top-left (display face). The note sits at the top left, under the title. Specimen-plate labels under each tree base
(italic serif letter + label + balance). Difference label centered between trees once both are planted.
Dock below: transport row (About, Play, speed) + scale-bar timeline (age ticks every 5 years, markers for
A and B starts); inputs row; assumptions note + "How this is calculated" disclosure.
Mobile (< 700 px): scene ≈ 58 svh; dock below in 2-column grid; 44 px minimum touch targets.

## Copy (short, hopeful, never shaming)
- Labels: "Tree A · started at 25", "Tree B · starts at 35" (before planting) / "started at 35".
- Breakdown per tree: "$96,000 contributed · $285,536 modeled growth".
- Assumptions (always visible, small): "Illustration only: a constant hypothetical return with growth reinvested.
  No taxes, fees, or inflation. Actual returns vary and aren't guaranteed. Tree size illustrates growth; it isn't a
  literal dollar scale."
