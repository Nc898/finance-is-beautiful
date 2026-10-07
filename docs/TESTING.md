# Testing

Three layers: engine/app unit tests (Vitest), browser end-to-end tests (Playwright), and a performance probe.

## How to run

```bash
npm test                       # Vitest: tests/**/*.test.ts (engine, mapping, store, story)
npm run test:e2e               # Playwright: all four projects (starts its own Vite dev server on :5190)
npx playwright test numbers    # one suite
npx playwright test --project=mobile
npx playwright test --ui       # inspect interactively
node scripts/perf.mjs          # performance probe (builds a production bundle, serves it on :5191)
```

First run on a new machine: `npx playwright install chromium`.

Notes:

- `playwright.config.ts` starts `npx vite --port 5190 --strictPort` with `reuseExistingServer: false`. If a previous run was
  killed, a leftover Vite may still hold port 5190 ("already used"); end that process first.
- E2E files are `*.spec.ts`; Vitest only includes `tests/**/*.test.ts`, so the two never collide.
- Specs drive time through the `window.__ttg` hook (`seekStory`, `scrubTo`, `pause`, ...), then wait for a few
  `requestAnimationFrame`s. Real-time waits appear only where playback progress is the thing being tested (story autoplay,
  speed 2x, live-region chatter over 3 s, reduced-motion hold playback).
- `gotoReady()` (tests/e2e/helpers.ts) blocks Vite's HMR websocket. Otherwise any source edit made while the suite is running
  (another developer, an editor, a parallel agent) makes the dev server push a full-reload and wipes the in-memory app state
  mid-test. This happened for real during development.
- Screenshots are written to `docs/screens/e2e/<project>-<moment>.png` (planting t=3, growing t=26, difference t=44, explore).
  Failure traces/screenshots go to `test-results/` (disposable).
- Projects: `desktop` 1440x900, `laptop` 1280x720, `mobile` Pixel 7 (412x915, touch, isMobile),
  `reduced-motion` (desktop with `prefers-reduced-motion: reduce`). `story.spec.ts` is skipped in `reduced-motion` (autoplay
  is exactly what that mode removes) and `reduced-motion.spec.ts` runs only there.

## What is covered (tests/e2e)

| Suite | Tests | Covers |
|---|---|---|
| `story.spec.ts` | 12 | Autoplay after ready; captions per chapter (t = 3, 10, 16, 26, 44, 52) incl. live-value secondary line; monotonic age 25 -> 65; 54 s length; pause/resume; Replay; Skip (age 65, paused, results visible, hint caption); results hidden until the difference moment; speed 2x vs 1x rate ratio; speed radios; end-of-story hand-off to explore; copy follows edited inputs |
| `numbers.spec.ts` | 9 | Plates, difference label and details table at the difference moment ($381,536 / $194,903 / $186,633, contributed/growth lines); independent closed-form annuity (i = 1.06^(1/12) - 1, FV = 200((1+i)^n - 1)/i) at age 45 (240/120 months) and six other ages; completed-month-only display; "Plants at 35" before planting; story end equals explore end |
| `timeline.spec.ts` | 10 | Range min/max = timeline start/end (also after edits); ArrowRight/Left +-1 month, PageUp/PageDown +-12, Home/End, clamping; `aria-valuetext` ("Age 45 years, 3 months"); scrub during story -> explore; pointer click; same age => same canvas pixels (50 -> 65 -> 50, seedling detour, story vs explore) with wind off |
| `inputs.spec.ts` | 26 | Contribution 300; steppers/arrow keys; debounce commit; scale follows inputs; invalid: start A 70 > end 65, return 20%, contribution -5 / "abc", age 25.5, out-of-range and empty (inline error, `aria-invalid`, `aria-describedby`, last valid scenario kept, live-region announcement, recovery); start B = start A (identical, no "begins" beat); start B = end ("No growing time before 65", $0); return -2% (negative growth with true minus, balance < contributed); zero contribution; zero return; extreme values; keep age on input change during playback; end age below current age clamps + pauses; start ages above current age clamp to new start; edit during story exits to explore |
| `a11y.spec.ts` | 18 | axe wcag2a+wcag2aa in explore, details-open, story moments, and error states (no canvas exclusion needed); Tab order of all 21 controls + focus indicators (outline/ring; range thumb checked by pixel diff); Space toggles from body but not in inputs/buttons/slider; live region on play/pause and quietness over 3 s (explore and story); canvas `role="img"` with a current, non-empty label; A/B identity by letter + shape in plates, inputs, timeline; accessible names; `lang`/title |
| `reduced-motion.spec.ts` | 9 | No autoplay, "Play story" button; two canvas snapshots 500 ms apart identical at the same story/explore state; holds at 25, 25 1/4, 35, 45, 55, 65; real playback dwells on each hold; hand-off; explore play works; numbers unchanged; in-page "Reduce motion" toggle (and a wind control proving the comparison can detect motion) |
| `layout.spec.ts` | 9 | No horizontal overflow in ~12 states; stage/dock sizing; caption lines vs crown boxes (from `__ttg.anchors`) at difference moment and across the story; masthead vs crowns; plates/difference/dock non-overlap in six moments and with 7-digit balances; touch targets (>= 44x44 on mobile, >= 24x24 elsewhere); screenshots |
| `health.spec.ts` | 3 | No page errors / console errors / failed or 4xx requests in a full session; no `ResizeObserver loop` window errors (expected failure, see BUG-1); web fonts load |

Totals per project: desktop 87, laptop 87, mobile 87, reduced-motion 84 (345 tests).

## Latest result

`npx playwright test` (3 workers, Vite dev server, this machine, ~5 min): **345 passed, 0 unexpected failures** (3 of the 345 are
`test.fail()` expectations for BUG-1 in desktop/laptop/mobile). `npx vitest run`: 129 passed. `npx tsc --noEmit`: clean
(tests/e2e is part of the TypeScript project).

Per project (all suites): desktop 87/87, laptop 87/87, mobile 87/87, reduced-motion 84/84. In `reduced-motion` the BUG-1 test
is a plain pass (the error was not observed there), so it is only marked `test.fail` for the other three projects.

### Known issue recorded as an expected failure

- **BUG-1 (low)**: one `ResizeObserver loop completed with undelivered notifications` window error fires ~0.7 s after
  navigation (first layout), once per page load, never again. Vite's dev client prints it as `[Unhandled error]` on the server
  console. Probable cause: the ResizeObservers in `src/app/ui.ts` (plates / difference / scale -> `layout()`; dock ->
  `--dock-h`) and `src/main.ts` (stage -> `fit()` -> `ui.setStageSize`) resize observed elements during the same frame.
  Repro: open the app with a `window.addEventListener('error', ...)` installed before load. Test:
  `health.spec.ts` "no ResizeObserver loop errors" (`test.fail()`; remove the marker once fixed).

## Performance (scripts/perf.mjs)

Method: production build (`vite build` into a temp dir, `vite preview`), Chromium 153 via playwright-core, `requestAnimationFrame`
intervals during 5 s of story playback at 2x (10 story seconds) in two windows of the growing chapter: *early* (story 8-18 s,
roots loupe) and *late* (22-32 s, branch loupe, biggest canopy). Busy % = CDP `Performance.getMetrics` TaskDuration /
ScriptDuration over the window (100% = the main thread never idles). CPU throttle via `Emulation.setCPUThrottlingRate`.
`scene.render` is not exposed, so there is no per-render timer; rAF intervals + main-thread busy time stand in for it.

Machine: Windows 11 laptop, NVIDIA GeForce RTX 3050 Laptop GPU (ANGLE/D3D11), Node 24, other processes running (other agents
were using the machine). Numbers are indicative, not a benchmark.

### A. GPU flags (`--use-angle=d3d11 --ignore-gpu-blocklist --enable-gpu-rasterization`, the default)

Frame columns are ms: median / p95 / p99 / max. Busy = main-thread busy % (script % in brackets).

| Profile | CPU | Ready (ms) | Window | Mean fps | Frame ms (med / p95 / p99 / max) | >50 ms | >100 ms | Busy | JS heap |
|---|---|---|---|---|---|---|---|---|---|
| Desktop 1440x900 @1x | 1x | 1069 | early | 59.2 | 16.7 / 16.8 / 33.3 / 50 | 0 | 0 | 21% (11%) | 5.6 MB |
| | | | late | 59.6 | 16.7 / 16.8 / 16.8 / 50 | 0 | 0 | 39% (24%) | |
| Mobile 412x915 @2.6x | 1x | 547 | early | 59.8 | 16.7 / 16.7 / 16.8 / 33.4 | 0 | 0 | 17% (9%) | 7.9 MB |
| | | | late | 60.0 | 16.7 / 16.8 / 16.8 / 16.8 | 0 | 0 | 38% (23%) | |
| Desktop @1x | 4x | 2579 | early | 55.8 | 16.7 / 16.8 / 66.6 / 150 | 3 | 1 | 68% (35%) | 6.3 MB |
| | | | late | 42.6 | 16.7 / 33.4 / 50 / 50.1 | 1 | 0 | 98% (61%) | |
| Mobile @2.6x | 4x | 2351 | early | 59.0 | 16.7 / 16.8 / 16.8 / 66.7 | 1 | 0 | 58% (30%) | 7.6 MB |
| | | | late | 45.8 | 16.7 / 33.4 / 33.4 / 33.5 | 0 | 0 | 95% (57%) | |

### B. Software rendering (`PERF_GPU=0`, SwiftShader; a worst case for canvas compositing)

| Profile | CPU | Ready (ms) | Window | Mean fps | Frame ms (med / p95 / p99 / max) | >50 ms | >100 ms | Busy (script) |
|---|---|---|---|---|---|---|---|---|
| Desktop @1x | 1x | 572 | early | 60 | 16.7 / 16.8 / 16.8 / 16.8 | 0 | 0 | 50% (11%) |
| | | | late | 52 | 16.7 / 33.3 / 33.4 / 33.4 | 0 | 0 | 93% (17%) |
| Mobile @2.6x | 1x | 522 | early | 60 | 16.7 / 16.8 / 16.8 / 16.8 | 0 | 0 | 53% (10%) |
| | | | late | 52.2 | 16.7 / 33.3 / 33.4 / 33.4 | 0 | 0 | 94% (14%) |
| Desktop @1x | 4x | 2804 | early | 38.5 | 16.8 / 50 / 66.6 / 66.7 | 4 | 0 | 101% (22%) |
| | | | late | 12.7 | 83.3 / 133.2 / 150 / 150 | 42 | 18 | 104% (19%) |
| Mobile @2.6x | 4x | 2380 | early | 41.3 | 16.7 / 49.9 / 50.1 / 50.1 | 3 | 0 | 100% (20%) |
| | | | late | 13.7 | 50.1 / 133.3 / 133.4 / 133.4 | 39 | 15 | 104% (17%) |

Reading it:

- With a GPU, the story holds ~60 fps at 1x CPU on both profiles (script cost ~10-25% of a core), and the biggest-canopy
  window costs about twice the early window. At 4x CPU throttle (a rough proxy for a mid-range phone) the late window drops to
  ~43-46 fps with the main thread nearly saturated (95-98% busy), i.e. there is little headroom left.
- Under software rasterisation plus 4x throttle the late window collapses to ~13 fps with 40+ frames over 50 ms; script time
  is only ~17-19% there, so the cost is raster/compositing of the canvas (drawing and the CSS-background backdrop), not JS.
- Time to ready (navigation -> `body[data-ready]`, i.e. paper/sprite generation finished) is 0.5-1.1 s unthrottled and
  ~2.4-2.8 s at 4x. Heap stays ~6-9 MB used (no growth observed across windows).
- Mobile @2.6x is capped to DPR 2 by the app, so the canvas is ~824x1830 backing pixels; it measured about the same as desktop.

Raw JSON for a run: `PERF_JSON=perf.json node scripts/perf.mjs`. Options: `PERF_URL=<running server>` (skip build),
`PERF_GPU=0`, `PERF_SECONDS=<n>`.

## Could not be verified in this environment

- **Real devices / real GPUs / Safari / Firefox**: only Chromium on one Windows laptop was available. CPU throttling is a
  proxy; it does not reproduce mobile GPU or memory limits. WebKit and Gecko engines are not installed here.
- **Screen readers**: axe checks rules, not experience. NVDA/JAWS/VoiceOver output (live-region wording, slider
  `aria-valuetext` pacing during drags) was not heard.
- **Touch gestures** beyond what Playwright emulates (mobile project clicks as mouse events; dragging the slider with a
  finger, pinch zoom, on-screen-keyboard layout shifts are untested).
- **Forced-colors / Windows High Contrast** and 200% text zoom reflow were not exercised.
- **Visual quality of the watercolor art** is not asserted; the only pixel assertions are "same age => same pixels" and
  "no change without a state change under reduced motion". The e2e screenshots in `docs/screens/e2e/` are for human review.
- **Crown boxes** in the layout test are an approximation derived from `scene.anchorsFor` (apex position, width proportional to
  maturity, top 60% of trunk height), not the painted canopy pixels.
- **Production bundle behaviour in the e2e suite**: Playwright runs against the Vite dev server (as specified); only the perf
  script measures the production build.
- **Parallel source edits**: other workers edited `src/scene/*` while this suite was being written, so results reflect the
  tree as of the last full run (see the date on the files in `docs/screens/e2e/`).
