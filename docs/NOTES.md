# Time to Grow — working notes

## Environment & orchestration
- Coordinator: Opus 5.5 (`claude-opus-5-5`, stated in coordinator system prompt).
- Workers: Agent tool `model: "sonnet"`. Verified by a probe subagent that reported `claude-sonnet-5-5` from its own system prompt.
- Toolchain: Node 24.13, npm 11.8, Vite 8.3 (Rolldown — note `build.rolldownOptions`), Vitest 5.0, TypeScript 7.0, Playwright 1.63 (npx).
- Plugins/skills inspected: `frontend-design` (installed, used for art/type direction), `design:accessibility-review` (installed). Playwright MCP plugin is not enabled; Playwright CLI + the built-in browser pane cover browser testing, so no install needed. Deque Axe plugin optional — `@axe-core/playwright` npm package used instead.

## Sources
- Investor.gov compound interest calculator (SEC) — monthly contributions, annual rate, compounding frequency: https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator
- Future value of an ordinary annuity (end-of-period payments), FV = PMT·((1+i)^n − 1)/i: https://math.libretexts.org/Courses/Las_Positas_College/Math_for_Liberal_Arts/08:_Consumer_Mathematics/8.04:_Annuities , https://ecampusontario.pressbooks.pub/businessmathtextbook/chapter/11-2-future-value-of-annuities/
- Decision: the brief specifies an *effective* annual return, so monthly rate = (1+r)^(1/12) − 1 (not r/12). Investor.gov uses a nominal rate ÷ compounding periods; we document the difference.
- Canvas 2D (`globalCompositeOperation`, `OffscreenCanvas`/offscreen `<canvas>`, `drawImage`): MDN Canvas API docs.

## Default case, independently computed (closed form)
- i = 1.06^(1/12) − 1 ≈ 0.0048675506
- A: n = 480 → FV ≈ $381,5xx, contributed $96,000
- B: n = 360 → FV ≈ $194,9xx, contributed $72,000
- Difference ≈ $186,6xx, of which $24,000 is extra contributions.

## Reference analysis → visual language
1. Painterly green canopy: dab-built texture, upper-right light, modeled bark (tan light / dark shadow), root flare, ground shadow.
2. Pencil tree: asymmetry, heavy gnarled trunk, foliage masses with dark undersides, branches through gaps, hatched ground.
3. Ink tree: fine leaf marks at cluster edges, highlight line along branches, forked trunk.
4. Warm watercolor: translucent gold/orange/coral washes, paper-white holes, branches peeking, splatter.
5. Multicolor: restrained sky-blue/coral specks, green ground wash.
6. Layered green: tiered clumps (light yellow-green tops, deep green undersides), Y-forks into each clump.

Synthesis: ink-drawn skeleton (outline + brown wash + highlight + hatching) under tiered translucent watercolor clumps with broken dab edges and paper gaps; warm accents in a minority of clumps; rare sky-blue specks; soft ground wash with a faint cut-away soil band for roots.

## Design tokens
- Paper `#FBF6EA`, paper shade `#EFE5CF`, sepia ink `#2F2A22`, muted ink `#6B6152`
- Fresh green `#7DB343`, emerald `#1E7F5C`, golden `#F0B429`, coral `#EC7357`, sky `#4A9AD4`, bark `#6B4A2F`
- Type: Libre Caslon Display (title only), Libre Caslon Text italic (captions, specimen labels), Figtree Variable (UI, tabular numerals). Self-hosted via @fontsource.
- Tree identity never by color alone: letter + label text ("A · planted at 25") + marker shape.
- Signature: botanical-plate captions (specimen labels with leader lines) and the age timeline drawn as a plate scale bar beneath the ground.

## Tree mapping (trust)
- Shared scale S = max(final balance A, final balance B, $25,000), computed once per input set; animated smoothly when inputs change, constant during playback.
- maturity = clamp(√(balance / S), 0, 1). Tree linear size ∝ maturity ⇒ illustrated area ∝ balance. Monotonic, identical for both trees. Disclosed as illustrative, not a literal dollar scale.

## Decisions log
- Canvas 2D single scene canvas + DOM overlay for labels/controls (crisp accessible text). Expensive watercolor clump sprites pre-rendered once into offscreen canvases; per frame only skeleton paths + drawImage.
- Vanilla TypeScript, no UI framework: UI is small; the scene loop is the hard part.
