# Finance is beautiful

A collection of hand-painted, interactive watercolor demonstrations of money ideas (Vite + vanilla TypeScript,
Canvas 2D, Vitest, Playwright). The owner, Nick, holds them to a high, specific standard. Green tests are not enough.

## Read before any work

1. `docs/QUALITY_BAR.md`: the owner's expectations for concept, art, motion, copy and process, with his own
   corrections quoted. **Mandatory, in full, for every session and every subagent brief.**
2. `docs/HANDOFF.md`: the current state and open decisions.
3. The spec of the demo you are touching (`docs/*_SPEC.md`) and `docs/NOTES.md` (the design tokens).

## Hard rules (details in QUALITY_BAR.md)

- **New demonstrations, and changes to a demo's concept, setting, season, metaphor or characters, are the owner's
  decision.** Brainstorm options, let him pick, then write the spec. Never build one unasked. A candidate idea in a
  list is not approval.
- **Build a demo with the Low-Hanging Fruit recipe** (QUALITY_BAR.md section 3):
  1. Offer options checked against the collection, and let him choose.
  2. Commit the spec and the contracts first.
  3. Build on parts he already approved.
  4. Copy the quality bar into every builder's brief, and run two builders at a time.
  5. Review 2× crops and frame strips yourself before he sees anything.
- **Every demo is its own world.** It needs a new centerpiece metaphor and a new season or place. Don't reuse a
  sister demo's composition (for example, Time to Grow's two money-sized trees). Figures are optional: use them only
  when the metaphor naturally calls for them, and never force them in.
- **Art matches the collection at 2× zoom:** ink under watercolor, nothing vector, gridded, cloned, flat or
  unfinished. Compare crops with a sister demo before showing anything.
- **Motion is physical and continuous.** Nothing moves "like magic", nothing passes through anything, there are no
  teleports, and scrubbing rebuilds the scene exactly. Human motion comes from CMU mocap (`tools/mocap`).
- **Copy:** no eyebrows, no em-dashes, no 3-step visualizations, no long paragraphs. Short, hopeful, never shaming.
- **Before UI work, load a UI design skill** (`frontend-design`, `better-ui` / `better-interface`).
- **Push only when the owner asks.** Never delete branches you didn't create. Unapproved work goes on its own
  branch as a draft, and the report says it is unapproved.
- **Commits:** subjects in the form `Demo Name: what changed`; author `Nick <nlevichilds@gmail.com>`. Don't let line
  endings rewrite whole files.
- **Report honestly:** say what you looked at, what is still weak, and what you could not check.

## Commands

```bash
npm install
npm run dev            # owner's usual port: npx vite --port 5180
npm run typecheck
npm test               # Vitest
npx playwright test    # browser tests (starts its own server)
```
