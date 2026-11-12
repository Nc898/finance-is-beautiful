# Finance is beautiful: the quality bar

Every session and every subagent working on this repo reads this before touching anything: local or cloud,
coordinator or worker. Nobody has to tell you to.

It records what the owner (Nick) expects. It was drawn from five weeks of his feedback on six demonstrations
(October 6 to November 4, 2026) and his own words. Where a rule came from a specific correction, the correction is
quoted, so you can see the kind of mistake it prevents.

Why it exists: on November 5 a cloud session, given only the handoff notes, built a seventh demo overnight
("A Little Off the Top", branch `claude/fees-demo`). In the owner's words, it is "a rehashed and worse quality time
to grow". The case study at the end explains why. The short version: it was technically correct, the tests were
green, and it fell short on everything this document describes.

**Passing tests is not the bar. The bar is: would this sit beside Time to Grow, Low-Hanging Fruit and the river
without looking like a lesser piece?** If you can't honestly say yes, it isn't done, and it isn't shown to the owner
as done.

---

## 1. The non-negotiables

1. **The owner decides what gets made.** A new demonstration's lesson, metaphor, setting, season and characters are
   his choices, made in a brainstorm with him. Never start a new demo, or redesign an existing one, because a
   handoff or a gap seemed to invite it. Propose and wait. See section 2.
2. **Every demo is its own world.** It gets a new metaphor in which the picture *is* the math, and a new season or
   place. Reusing a sister demo's composition or centerpiece is a rehash, even under a new palette. Figures appear
   only where the metaphor needs them, never forced in.
3. **Art at the collection's finish, at 2× zoom.** Watercolor over ink, detailed and intentional. Nothing that reads
   as vector, gridded, cloned, stamped, flat or unfinished.
4. **Motion is physical.** Nothing moves "like magic". Things are moved by someone or by a force, bodies don't pass
   through anything, nobody teleports, and scrubbing backward rebuilds the scene exactly.
5. **Honest pictures.** Sizes follow the money on one shared scale, counters move the way statements do, and the copy
   is hopeful and never shaming.
6. **Short copy.** No eyebrows, no em-dashes, no 3-step visualizations, no long paragraphs.
7. **Verify as the owner will see it.** Look at real screenshots and 2× crops next to a sister demo, and watch the
   motion frame by frame. Claim only what you checked.

---

## 2. Who decides what (process)

The owner is closely involved in every creative decision. Every past demo started like this:

- **"Lets brainstorm our 3rd demonstration... any ideas?"** You offer several ideas, each with a lesson, a metaphor
  and a setting. **He picks**, often adding his own direction: "fall season themed... a blue sky and sun out instead
  of clouds", "remember the winter theming. use pine trees", "remember no story for this demo".
- Then a **spec and shared contracts** (engine types, scene types, world geometry, character API), committed before
  any build. The demo's `docs/*_SPEC.md` records his choices.
- Then the build (an Opus coordinator, Sonnet subagents with clear ownership of files; **two at a time**, because
  four at once hit the API rate limit).
- Then **his review in the browser**, and rounds of refinement until he is happy.
- When there is a real art-direction question, **build both and compare them side by side** (the river was built in
  two styles and he chose watercolor).

Rules that follow from this:

- **Unasked new work goes on a branch as a proposal, never to `master`**, and the report says plainly that the
  owner has not approved the concept. Better still, write the concept up as a short pitch and stop.
- **The candidate list is not a decision.** "Save It for a Rainy Day" (emergency fund) and "Drop by Drop" (fees) were
  ideas offered on November 2, and he did not choose either. A candidate on a list is not a go-ahead.
- **Ask before downloading** anything (mocap clips, assets): give the name, the source and the size.
- **Push only when he asks.** Never delete branches you didn't create.
- **"Restart localhost" / "give localhost"** means: start the dev server (`.claude/launch.json` in the session folder,
  port 5180, or `npx vite --port 5180`), wait until it answers, and open the page being worked on.

---

## 3. How a demo gets built (the Low-Hanging Fruit recipe)

Low-Hanging Fruit (November 2 and 3) was the best-received build. It took two messages from the owner to start
it, and one correction afterwards (the walk's hip drop). It worked because every correction from the five demos
before it had become part of the process, so the builders and the coordinator caught problems before the owner
saw them. Build every new demo this way.

1. **Pitch, checked against the collection.** Offer three or four ideas, each with its lesson, its metaphor
   and its setting. Once he picks one, ask the design questions together (AskUserQuestion), each with a
   recommended option and a one-line reason per option. Low-Hanging Fruit asked four: which two to compare, how
   the growth shows in the picture, setting and season, and how to build it. The reasons do the rehash check out
   loud: "a palette the collection doesn't have yet", "sits closer to Brick's blossom", "risks echoing the
   vine". Record his answers in the spec.
2. **Commit the rules before any building**, as one commit (`Demo Name: the spec and the shared contracts`):
   - `docs/<NAME>_SPEC.md`: the lesson in one sentence, the math with its defaults checked against a closed
     form, the scene, the notes, the labels and the files;
   - `src/<demo>/types.ts`: the engine and scene types;
   - `src/<demo>/scene/geom.ts`: the world layout, with every position and size as a named constant;
   - a parts contract for anything with behaviour (figures, props), including `place(intent)`, the settled
     state that scrubbing and reduced motion use.

   Builders implement the contract and never change it. If it is wrong, they work around it and report it.
3. **Build on what already passed his review.** Don't start parts from scratch:
   - **Trees:** `src/scene/treePainter.ts` with the foliage atlas, as part of a world (never as its subject).
   - **Figures:** Brick's crew. That's `src/brick/scene/figure.ts` (skeleton, three-quarter turns),
     `crewArt.ts` and the pose cache in `cache.ts`.
   - **Gait:** the shared gait in `src/snow/scene/climberGait.ts`, and the orchard pickers' CMU-fitted walk
     (`src/orchard/scene/pickerFigure.ts`, `tools/mocap`).
   - **Washes and paper:** `src/scene/watercolor.ts`, and `bloom`/`speck` in `src/landing/backdrop.ts`.
   - **App shell:** the panel, timeline, speed slider, notes and intro (`src/shared/intro.ts`), and the loading
     screen (`src/shared/loaderHtml.ts`), adapted from the newest demo.

   Copy what is tied to another demo into the new demo's own files. Don't edit the other demo.
4. **Brief each builder completely** (template below). The key line is the quality bar, copied in as
   acceptance criteria that can't be negotiated. Every item in it is one of his past corrections.
5. **Two builders at a time.** Four at once hit the API rate limit and stalled the Low-Hanging Fruit build.
6. **The coordinator reviews before he sees anything:**
   - render the real page;
   - compare 2× crops with the sister demos;
   - watch frame strips of every motion;
   - send each builder a written fix list, and repeat until nothing on it would embarrass the collection;
   - run every test.

   Low-Hanging Fruit's list included banded clouds, hard edges round the mown plots, a stray dashed line, blocky
   shade in the tree and too much sky on phones. He saw none of them.
7. **Finish:** add the landing entry with its own theme and a preview baked from the real scene, update the
   spec, commit, and report honestly, including the flaws still known.

### Brief template

```text
You are building <PART> for "<Demo>", the <nth> demo in a watercolor finance-demos site (Vite multi-page,
TypeScript, Canvas 2D). Project root: <absolute path>.

READ FIRST: docs/QUALITY_BAR.md (all of it), docs/<NAME>_SPEC.md (your part is "<section>"), src/<demo>/types.ts,
src/<demo>/scene/geom.ts, the parts contract. Then study the proven part you build on: <files>.

YOUR FILES (create): <list>. Do not create or edit: <other builders' files>, the contracts, the spec, other demos.

Behaviour: <what it does, in order, with the contract's names>. place(intent) = the settled state for scrubbing
and reduced motion.

Quality bar (non-negotiable): no teleports or snapped poses, every transition blended >= 0.25 s; a proper gait
with no foot sliding; three-quarter turns; nothing passes through anything; things move only in a hand or by a
force, never appear; the picture keeps pace with the money at every month and rebuilds exactly when scrubbed;
art at the sister demos' finish at 2x; <part-specific items>. Performance: <fps target>; repaint only on visible
change (pose cache).

Verify: a dev server runs at http://localhost:5180 (do not start another). Make a harness page (not in
vite.config) showing your part at speeds 1 and 5, scrubbing, and reduced motion. Capture frame sequences with
Playwright, look closely, and iterate.

Rules: new files LF; match the codebase's idiom and comment density; `npx tsc --noEmit` clean; do not commit;
do not spawn subagents; ask nothing, decide sensibly.

Final report (concise): files, captures, contract issues, anything not verified.
```

---

## 4. What a demonstration in this collection is

### The pattern every demo follows

- **One lesson, shown by a comparison of two.** Two people, trees, boats or homes start the same and differ in one
  thing. The picture shows the difference at every moment of the timeline.
- **A metaphor where the picture is the math.** Each visible quantity maps to a number, the mapping is monotonic and
  shared by both sides, and it's disclosed. Examples: interest bricks go into the lender's cart, snowfall is
  interest settling on each debt, the vine's growth follows the balance owed.
- **Every change in the picture has a visible cause.** The money moves because something moves it. That can be a
  force or a process that belongs in the scene: growth, snowfall, a current, wind, gravity. Or it can be a figure
  whose job is the metaphor: the rowers, the gardeners, the climbers, the builders and the pickers.
- **Figures only where they make sense.** People are not a requirement. Time to Grow has none and needs none. Add a
  figure only when the metaphor naturally calls for one, and make it look native to the scene. A figure forced in to
  make the scene look busy is as wrong as things appearing by magic.
- **Its own season and place, and a distinct palette.** The landing page reads as a collection of different worlds.
- **The shared frame:**
  - the paper, ink and type (section 5);
  - a collapsible right-hand panel;
  - an introduction overlay the first time each session, with "About this demo" to reopen it;
  - small milestone notes at the upper left, under the title;
  - plates under each side with the live numbers;
  - "How this is calculated";
  - Reduce motion;
  - a speed slider from 0.1× to 5×;
  - a draggable timeline.
- **No scripted story.** He dropped it on October 26: "the interactivity and ability to move back/forth in time is
  the strongest aspect". Free exploration from month 0, paused until Play.
- **The camera** frames the comparison, and zooms only when that serves the lesson. Time to Grow opens close on the
  seedling and eases out, because the seed is otherwise invisible.

### The collection so far (a new demo must not repeat these)

| Demo | Lesson | World | Centerpiece metaphor | People |
|---|---|---|---|---|
| Time to Grow | starting age and compounding | summer meadow, rail fence, cumulus sky | **two trees whose size is the balance**, roots in a soil cut-away, bills carried up into the canopy | none in the scene (birds and bills on the landing page) |
| Against the Current | inflation | a river, towpath, hills | boats rowing upstream against a current | rowers; fish |
| Nip It in the Bud | card minimums vs a fixed payment | autumn cottages, blue sky and sun, no clouds | a vine on each cottage that grows with interest | gardeners shear and rake |
| On a Roll | snowball vs avalanche | winter hillside, pines, falling snow | snowballs that grow as snow (interest) settles | climbers push the balls down; birds |
| Brick by Brick | 15 vs 30-year mortgage | **spring** building site, blossom | houses built brick by brick; interest bricks go to the lender's cart | builders, the lender's cart |
| Low-Hanging Fruit | employer match | late-summer orchard | fruit picked into baskets and planted as orchards | pickers |
| Bread and Butter | prices vs pay, with **real data** (BLS prices and median pay, 1980 to now) | **indoors**: a lamplit corner grocery on a rainy morning | a split-flap price board that clicks over with the months; the headline is the minutes of work a week's basket costs | the grocer, ringing up the basket at the counter |

A new demo needs a centerpiece that is not "a tree whose size is money". Time to Grow owns that image. Planted
orchards reuse trees, but there the trees are an outcome of the pickers' work, not the whole picture. It also needs
a season and setting not in this table.

---

## 5. The art standard

### The visual language (from the original brief and its six reference paintings)

- **Finely drawn ink under luminous watercolor.** Expressive bark, layered translucent washes, irregular brush edges,
  soft granulation, restrained splatter, paper showing through. Light comes from the upper left.
- **Natural structure.** Convincing botanical anatomy and asymmetry. Trees must not be assembled from obvious
  circles or triangles, or built as one round ball on a stick.
- **The palette and tokens** (`docs/NOTES.md`):
  - paper `#FBF6EA`, ink `#2F2A22`;
  - fresh green, emerald, golden, coral and occasional sky blue;
  - each demo adds its own season's palette on top.
- **Type:**
  - Libre Caslon Display for titles;
  - Libre Caslon Text italic for captions and notes;
  - Figtree for the UI, with tabular numerals.
  - Type is a quiet supporting element. The illustration is the centerpiece.
- **The house tree painter** (`src/scene/treePainter.ts`, the foliage atlas) is the standard for trees. But
  reusing it as the *subject* of a new demo is a rehash (section 4).

### What has been rejected (don't repeat these)

| Rejected | The owner's words | What fixed it |
|---|---|---|
| First-pass trees, cottages and stone paths on the Vine | "this looks like complete shit, nothing looks finished or up to the artistic standard of the other demonstrations" | Rebuilt with the house tree painter. Cottages painted as watercolors (washes, with stone and slate stated only where the eye goes) |
| Clouds | "look like a spill on a painting"; then "still need to be worked on. make them a little more detailed" | Cumulus lifted out of the blue sky, shaded as one form with soft folds, flat feathered bases, wisps, granulation, faint broken ink tops |
| Roots | "need to be more pronounced and match the trunk"; "not at the level of detail as the other parts of the tree. take some time on them" | Bark-painted roots, a buttress flare from the root collar, a blended join to the ground with grass tufts, soil filling the whole underground |
| Ground transition (Vine) | "the transition from the light grass... and the darker grass... is too jarring" | The background grass fades into the lawn, with no hard line |
| Garden walls, houses, dirt paths, hills (Brick, Vine) | "remake these walls"; "the house artwork needs a bit of a touch up"; "the houses have a slight white edge"; "touch up on the dirt paths and grass"; "touchup the background hills" | Watercolor drystone; no sliver of paper around a finished house; meadow washes, granulating earth, broken ruts; lit and shaded slopes, a patchwork of fields and hedgerows, woods in clusters |
| Vector-looking leaves on the landing page | "the leaves look off" | Painted leaves, not vector shapes |
| Generic UI: a pill button and a card popup | "remove the pill and text around the button. menu popup is too big"; "use any applicable UI skills for UI" | The menu is just its hand-drawn icon, opening onto a small patch of watercolor wash |
| The grocer's face, overcorrected (Bread) | "the grocers face looks a little uncanny and too realistic for the art style. tone it down a little." | A storybook face: small dark dabs for eyes (no whites, irises or lids), no wrinkles or long cheek lines, a small soft nose, the moustache one soft shape with a few strokes, simple rosy planes. Between a peg doll and a portrait |
| Rain missing from the shop door's glass (Bread) | "rain is not showing through the door" | Every pane of glass shows the same weather. The rain falls behind anything hung in front of the glass (the door's bell) |
| The grocer re-chalking the board (Bread) | "the grocers and chalkboard need to be worked on to make sense with the year and number shown on the bottom of the demo. these don't update togethor at 1x speed, leaving the viewer confused. he also blocks the board while erasing and writing." | A split-flap price board that shows the labels' month at every moment, and a new job for the grocer away from it (weighing and ringing up the basket). The owner chose this from three options; he had said the grocer "can have a different role" |
| A split-flap board rolling through digits (Bread) | (caught in review before the owner saw it: a glance read "$6.75" while the receipt said $8.95) | Each changed cell flaps once, straight from the old figure to the new; at any moment it reads the old figure, the new one or a clean half-flap |
| Labels overlapping at a narrower width (Bread) | "this is off." (a screenshot of the receipt, headline and envelope running into each other) | The labels are pushed apart in a row, with the headline under the others where three won't fit. Checked from 390 to 1920 px, panel open and closed |

### Finish checks for every element

- **Look at it at 2× and compare it to the same kind of element in a sister demo.** If a tree, house, wall, path,
  cloud, log or flower reads as vector, gridded, cloned, stamped or flat, it isn't finished.
- **Nothing cloned in a row.** Background trees, logs, flowers and fence posts vary in size, shape, spacing and
  color. A grid of identical sprites is the "grid-of-rectangles" failure.
- **Edges:** no halos, no white or grey rims around cut-out shapes, no slivers of paper where a painting meets its
  outline.
- **The frame is full.** The ground runs to both edges with the panel collapsed. There is no big dead sky or empty
  meadow, at any point on the timeline, including month 0. (Time to Grow handles its tiny first tree with the camera.)
- **Scale by depth.** A figure is a person's size next to the trees at its depth. Birds and figures shrink with
  distance. "the scale of the climbers is off, they look giant compared to the trees towards the back".
- **Layering and occlusion are physically right.** "this fense is behind the house on the edges. it should be shown
  in front." Feet stand on the ground. Things in front draw in front.
- **Text sits in the picture.** "Lets have the numbers under the signs actually fit in the signs otherwise why are
  the signs there."
- **A big figure needs its own painting.** The shared figure rig was made for small crews. The grocer is about five
  times their size, so its shortcuts showed (a peg-doll face, tube limbs, mitten hands, balloon sleeves). Up close a
  figure needs a painted face, hands with fingers and cloth folds, but in the collection's storybook register, never
  realistic (see the rejected table).
- **Labels at every width.** No two labels or notes overlap at any stage width, with the panel open or closed. Measure
  the boxes, don't eyeball one size.

---

## 6. The motion standard

The owner scrutinizes motion more than anything else. "Make sure all motion is smooth and connected" and "everything
should flow, move, and feel together" appear in almost every request.

**Cause and contact:**

- Everything is moved by someone or something. "Sometimes oars move without being touched, like magic." Hands stay
  on the oars. Leaves move only when the rake touches them ("the leaves fly towards the pile without the rake
  actually touching them").
- Things come from somewhere. "The fall leaves are falling down out of nowhere. they should fall from the trees
  themselves then can be moved by wind, gravity". Bills are carried up the trunk into the canopy. Birds fly in from
  either edge.
- The current works against the rowers, not with them. Fish travel downstream and splash when they land. The
  physics must make sense.

**Bodies:**

- Nothing passes through anything. Tools don't go through bodies, limbs don't show through the torso, hands aren't
  behind the back while raking, and walkers step over walls instead of through them.
- Tools are used the right way up ("rake is being used upside down").
- Boots line up with the trousers.
- **Human motion comes from motion capture** (CMU, via `tools/mocap`). Procedural walks and turns looked robotic
  ("the human movement... still looks unnatural"). The pickers' walk was refitted to CMU subject 07 for cadence,
  stride, knee angle and hip height. Check new actions against a captured clip.
- Figures can be seen from the front and back, not only in profile, so turning and sitting look natural.
- No odd idles ("looks forwards and backwards repeatedly which looks very strange").

**Continuity:**

- No teleports: "the gardener... just teleports to his bench". Every move is walked.
- **Scrubbing reconstructs.** Dragging the timeline backward or forward rebuilds every element exactly: vines,
  figures, piles, labels. The same month with the same inputs always gives the same picture.
- Pace that reads: "the entire raking process looks better but is too slow"; walks at a human cadence. The speed
  slider scales everything together.
- **Work must keep up with the timeline it shows.** The grocer's board fell years behind its labels at 1×. A legible
  pass took him about 6.5 s, but a year lasted 2 s. Slowing 1× and chalking yearly still left the board a year
  behind and him in front of it, and the owner found it confusing. The lesson: a figure the reader must compare
  with the labels can't be produced by a person's hand at the timeline's pace. Give it a mechanism that keeps time
  (the split-flap board), and give the person work that doesn't have to match the clock (ringing up the basket).
  Measure the work against the timeline before committing to a design.
- Counters move like statements. "i dont like how the amount remaining counter constantly goes down over time
  instead of going down with payment/increasing with interest... it just makes the demo feel a bit less real."
- The picture and the numbers agree at every moment. "the vine growth and the money left does not match up" was a
  bug.

**Frame rate:** scenes are capped at 30 fps for performance; the boats run at 60, because rowing at 30 looked
stepped. "It's moving at about 5 fps" on Brick was a release-blocking failure. Measure on a modest machine.

---

## 7. Numbers and honesty

- A pure, tested engine that is separate from the rendering:
  - monthly steps, full precision, rounded only for display;
  - checked against a closed form or independent numbers in the spec.
- Sizes follow the money monotonically, on one scale shared by both sides. Never resize one side to fill its space.
  Disclose that the picture is illustrative, not a literal dollar scale.
- Show the honest cost of the better choice. For example, picker B takes home $150 less a month.
- Copy never shames. In Time to Grow, both trees look healthy and beautiful; the later starter is just smaller, with
  less time to grow, never a damaged one.
- A short assumptions note on every demo: illustration only, steady growth, what is not modeled, not advice.
- No live market data, forecasts or recommendations.
- **Real historical data** (Bread and Butter):
  - Fetched by a script (`scripts/fetch-bread-data.mjs`), never typed by hand.
  - Sources cited on the page and in the spec.
  - Unpublished months are filled by a straight line and always marked: "estimated" on the labels, "~" on the board.
  - Never headline one cherry-picked comparison ("today vs 1980"). Walk through the eras and say what the starting
    year was.
  - When part of the picture shows a different figure from the labels (the board chalks January's prices for the
    year), the spec and the e2e tests say so.

---

## 8. Copy and UI

- **No eyebrows, no em-dashes, no 3-step visualizations, no long paragraphs.** The rule applies to page copy,
  notes, labels and the intro. Keep sentences short and plain.
- Milestone notes are small (16.5 / 14 px) at the upper left under the title: "the note caption needs to be smaller".
- **Before any UI work, load a UI design skill** (`frontend-design`, and the `better-*` skills the owner installed,
  such as `better-ui` and `better-interface`). Plan the palette, type and layout, check the plan against the generic
  defaults, then build and screenshot.
- Avoid dashboard styling, cards, pills, heavy borders, and cartoon money symbols.
- Desktop first. Phones must work, but he has twice said to stop on mobile when it slows the main work.

---

## 9. Loading and performance

- No flash of unstyled text, and no white screen. The shared loading screen shows from the first frame, and the page
  appears only once the scene is painted and has settled. "The text appears before any of the visuals and the
  pageload process still isnt smooth."
- Paint expensive art once, into cached canvases or sprites; per frame, only what moves. Profile before you claim it
  is smooth.

---

## 10. Before anything is shown to the owner

Work through this list, and say in the report which items were done and which could not be.

1. **Screenshots at 1440×900**, panel open and closed, at month 0, a quarter, the middle and the end.
2. **2× crops of every element** of the scene, compared with a sister demo's crops. Fix anything below them first.
3. **Motion review:**
   - frame strips or a WebM of every action (walk, turn, work, carry, settle), checked frame by frame for contact,
     body clipping, sliding feet and teleports;
   - scrubbing forward and back over each event.
4. **The six-part final analysis** he asks for ("check functionality, art/style, movement, readability, user
   experience, ease of understanding"), written down with fixes.
5. **Tests:** `npm run typecheck`, `npm test`, `npx playwright test` for every demo the change touches. Shared modules
   (the gait, the tree painter, the intro) touch several demos.
6. **Then honesty:** report what you saw, what is still weak, and what you could not check (a hidden browser pane,
   no GPU, no phone). A green suite on a demo that looks worse than its sisters is not a success, and must not be
   reported as one.

---

## 11. Working conventions

- **Commit subjects:** `Demo Name: what changed, in plain words`. Author `Nick <nlevichilds@gmail.com>`.
- **Commits:** small and readable, one concern each.
- **Branches:** work unrelated to an approved task goes on its own branch, with a draft PR.
- **Encoding:** every source file is UTF-8. A builder once saved an ellipsis in the Windows code page: the dev server
  accepted it, the production build failed. Before a push, run `npx vite build` and check its exit status itself (not
  through a pipe, whose status is the last command's).
- **Line endings:** the repo mixes CRLF and LF (it began on Windows). Don't let an editor or OS rewrite whole files.
  A 49-line change must not show as 1,477 lines. Check `git diff --stat -w --ignore-cr-at-eol` against the plain
  stat before you commit.
- **Screenshots:** verification screenshots stay out of the repo (`test-results/`, a scratch folder, or a
  `.gitignore` entry).
- **Shared modules** (`src/scene/*`, `src/shared/*`, `src/snow/scene/climberGait.ts`, the brick spring painter) are
  used by several demos. Change them only by opt-in, or test every demo that uses them.
- **Each demo's spec** (`docs/*_SPEC.md`) records the owner's choices. Update it when they change.
  `docs/HANDOFF.md` records the current state and open decisions.

---

## 12. Case study: "A Little Off the Top" (branch `claude/fees-demo`, November 5)

It was built overnight by a cloud session from the handoff notes alone. The engine is correct, and its 18 engine tests
and its browser tests pass. The problems are all in what this document covers.

**Process:**

- The owner never chose this demo. Fees was one of three candidate ideas, and the brainstorm, his choice and his
  direction on season and metaphor never happened.
- It was offered as a finished seventh demo, with a landing entry and a preview, rather than as a pitch.

**Concept: a rehash of Time to Grow.**

- The centerpiece is the same as Time to Grow's: two identical trees from the same painter and model, side by side
  on one ground line, crown area following the money, with plates under them. Only the palette changes.
- The new ideas are a pale "ghost" crown behind each tree and a log pile. Neither carries the lesson as strongly as
  Time to Grow's own trees, so the demo reads as Time to Grow with fewer parts.
- **Nothing does the cutting.** "The fees are cut off the top", but nothing cuts them. Sprigs fall and logs appear
  on their own, which is exactly "moving like magic". The fix is not to bolt on a forester. Either the metaphor needs
  a cause that belongs in the scene, or the demo needs a metaphor that has one built in.
- **The season repeats.** It is spring again, which Brick by Brick already is. The spec says it is "the season and
  place the collection did not have yet", which is wrong for the season.
- The app shell and stylesheet are Brick's, copied and re-inked.

**Art at 1440×900 and at 2×, compared with Time to Grow:**

- **The trees** are Time to Grow's tree with less. The soil cut-away, roots and bills are gone. The crowns are round
  balls on a stiff two-pronged fork, and a grey halo rims the trunk where it was cut out.
- **The ghost crown** is a flat pale grey blob with a wobbly outline and no trunk. It reads as smoke or a smudge,
  not as "the tree you could have had".
- **The woodpiles** are a grid of identical flat tan discs between thin sticks, which is the cloned, gridded look
  rejected on the Vine. At year 10 each pile is an empty frame holding two logs.
- **The background:**
  - "a beech wood" is a band of flat green dabs;
  - five nearly identical trees stand at even spacing;
  - the sky is a flat beige-grey with lavender smears for clouds, the "spill" look;
  - the bluebells are uniform stamped dabs, and the middle distance is blue confetti.
- **Composition:** the top half is empty sky. For the first decade the trees are tiny in an empty meadow, and no
  camera move answers that.
- **The labels** sit on white haze blots over the flowers.

**Repo hygiene:**

- Three files were rewritten whole by line-ending normalization, so `landing.css` shows 1,477 changed lines for 49
  real ones.
- `river-style-pass-wip` was deleted from GitHub. Its commit `09a6d9e` still exists in the local clone.

**Lesson:** a session without the owner's history optimizes for what it can measure (tests, spec coverage) and fills
the creative gaps by reusing whatever is nearest. The answer is this document, and the rule in section 2: new
concepts are his to choose.

---

## Appendix: the owner's feedback, in order (abridged)

- **Oct 7 · Time to Grow:**
  - "the trees are not taking up enough of the screen"
  - controls go in a side panel "with an arrow to toggle"
  - "the arrow to collapse the side wasnt working smoothly"
  - roots, soil, and the trunk-to-soil join, in three rounds
  - "lets make that into dollar bills... make sure all motion is smooth and flows with the rest of the scene"
  - "they should blend in well, feel part of the scene, and sway/move"
- **Oct 7 · Landing page:**
  - "No eyebrows, no em-dashes, no 3 step visualizations, no long paragraphs. this should be simple and beautiful"
  - "the graphics take forever to load"; "The text appears before any of the visuals"
  - "cap the motion visuals at 30fps"
  - birds that cross the screen "from one side to another" and drop bills
  - "the tree motion... still feels laggy"
- **Oct 8–12 · Time to Grow:**
  - zoom the camera on the seed instead of a magnifier inset, "then smoothly zooms out"
  - "no need to zoom into the trees branches"
  - "cleanup some of the animation to be more cohesive, smooth, and realistic"
  - money labels from the start, with the year
  - a fence, then a blue sky with clouds; the clouds redone twice
- **Oct 12–13 · Against the Current:**
  - "be very detailed and intential. everything should flow, move, and feel togethor. Be very thorough"
  - a small dock clear of the boats; oars reworked; numbers that fit their signs
  - "The current should be working against the rowers"
  - a start line lined up with the $10,000 sign
  - "rowing animation feels clunky... oars move without being touched, like magic"
  - 60 fps for the boats
  - two styles built and compared, watercolor chosen
  - fish going downstream that jump, with splashes
- **Oct 14–22 · Nip It in the Bud:**
  - fall, with a blue sky and sun
  - "make sure movement is smooth and clean, especially with the gardener"
  - "complete shit... work further with subagents"
  - leaves fall from the trees
  - the gardener is seen from the front too
  - rewind must rebuild the vines and the gardener
  - the rake must touch the leaves
  - the fence goes in front
  - a shared loading screen
  - tools through bodies, hands behind backs, boots against trousers
  - CMU mocap adopted
  - the rake upside down; limbs through bodies
  - raking too slow; the teleport to the bench
  - walking through the stone wall
  - the grass transition; the houses and stone; the ground to both edges
  - the vine must match the money
  - counters like statements
  - label placement; a speed slider from 0.1× to 5×
  - "a final comprehensive analysis... functionality, art/style, movement, readibility, user experience, ease of
    understanding"
- **Oct 26 · On a Roll:**
  - winter, pine trees
  - birds sized by depth
  - "im not sure what the point of the climbers is", so they push the balls instead
  - climbers sized against the pines
  - every ball shows its balance and APR
  - balls vanishing without rolling
  - a recognizable finish line
- **Oct 26 · All demos:** the scripted story is replaced by an intro overlay (first time per session) and small
  notes at the upper left, with the camera zoom kept where it helps.
- **Oct 27–29 · Brick by Brick:**
  - "remember no story"
  - "extremely laggy... about 5 fps"
  - side trees, pink, beside the houses
  - more flowers
  - the houses touched up; the white edge removed
  - "some of the scene still doesnt look visually up to the standard of the others": paths, grass, hills
- **Nov 2 · Landing menu:**
  - opens on hover; an About page skeleton
  - "remove the pill... popup is too big"
  - "use any applicable UI skills for UI"
- **Nov 2–4 · Low-Hanging Fruit:**
  - chosen from a brainstorm
  - the low fruit hangs on twigs
  - every tipping in view
  - "movement (walking motion/hip drop) feels a little unnatural... reference the CMU motion capture work"
- **Nov 9:** "the cloud session did not have a full picture of my quality expectations... the new demo is a rehashed
  and worse quality time to grow."
- **Nov 11 · Bread and Butter:**
  - asked for a price and inflation demo that would "feel very grounded and real"
  - chose the weekly shop, price vs pay, a corner grocery and the grocer, from a brainstorm
  - asked whether starting in 1980 skews it (the peak of high inflation); kept, but never headlined
  - added the food-at-home index; core CPI gets one explanatory line only
  - "Show me first", then "Fresh Opus painter" for the shop, and "needs more on the walls too"
  - the board lagging the labels by years: 1× slowed and the board made yearly
  - the grocer repainted, then "uncanny and too realistic for the art style. tone it down a little."
  - "rain is not showing through the door"; the overlapping labels: "this is off."
  - "Merge and push live"
- **Nov 12 · Bread and Butter:**
  - "the grocers head turns in too few frames and looks off"; then "he turns his head too slow it looks unnatural"
    (48 head views, a glance in about a third of a second, eased)
  - the board and the labels "don't update togethor at 1x speed"; he "blocks the board"; "he can have a different
    role": chose a split-flap board and the grocer serving at the counter, on a new branch, built by Sonnet builders
  - "Merge and push live"
