# Remediation Plan

Derived from the full-project review of 2026-08-06. Every item below traces to a
specific measured finding, names the files it touches, and states how it will be
*verified* — the project's own standard (PRD §8: measure, never fabricate).

Ordered by severity. Phase 1 is non-negotiable (the demo currently claims things
the code does not do). Phase 2 is what converts the thesis from a design claim
into a result. Phases 3–5 are craft and shipping.

---

## Phase 0 — Guardrails (do first, ~half a day)

Nothing below can be trusted without a way to measure it. Build the measurement
before the fix, so each subsequent phase has a before/after number.

### 0.1 Add a `--study` skeleton to the headless runner
**File:** `src/headless/runExperiment.ts`

Add a second mode alongside the existing sweep: `--study <name>`, where a study
is a named comparison that emits a *summary* table (one row per condition, with
median/IQR across seeds), not a per-generation trace. The sweep answers "what
happened"; a study answers "did A beat B."

```
npm run experiment -- --study maze-deception --seeds 0-19
npm run experiment -- --study coevolution-progress --seeds 0-9
```

Two studies land in this phase as the baseline for Phase 1:

- `maze-deception` — generations-to-solve for objective GA vs. Novelty Search,
  per seed, plus the fraction solved by the random initial population.
  **Baseline already measured:** objective median gen 3, novelty median gen 3,
  3/20 solved at gen 1. Both 20/20 within 40 generations.
- `coevolution-progress` — per-generation capture rate and dominance *fraction*
  (not count) over 200 generations.
  **Baseline already measured:** mean capture rate 52% (first 50 gens) → 37%
  (last 50); dominance fraction 76% → 34% on seed 42, non-monotonic on seed 7.

**Verified by:** `test/headless.test.ts` gains a byte-identity assertion for
study output, matching the existing sweep test.

### 0.2 Extract demo presets out of the UI layer
**File:** new `src/app/presets.ts`; **edits:** `src/main.ts`

The nine environments' hyperparameters currently live inline inside `OPTIONS` in
`main.ts` — the most experimentally significant numbers in the project, sitting
in the file with zero test coverage. Move each to a named, exported, documented
const in `src/app/presets.ts`.

**Do not merge these with `runExperiment.ts`'s configs.** They are deliberately
different (watchability vs. measurement) and that rationale is documented; the
goal is only to make the demo's numbers importable and assertable, not to
unify them.

**Verified by:** a new `test/presets.test.ts` asserting the structural
invariants the review found matter — every GA preset has
`eliteCount / populationSize >= 0.05` (ADR-008), every `mutationDecay` is in
`(0, 1]`, every `minMutationRate <= mutationRate`. These are the exact
constraints that silently plateau an environment when violated.

---

## Phase 1 — Correctness and honesty (~2 days)

The demo currently makes three claims the code does not support. This phase is
the highest priority in the project: in a codebase whose stated ethic is
"measure, never fabricate," a misleading on-screen readout is the worst
possible defect.

### 1.1 Vary the predator–prey initial conditions
**File:** `src/environments/predatorPrey.ts`

**Problem:** every contest, every generation, forever, starts from predator
(0.25, 0.5) heading 0 and prey (0.75, 0.5) heading 0. Controllers can learn an
open-loop trajectory valid only for this one geometry, and nothing detects it.
Prey additionally starts facing directly away from the predator, baking in an
asymmetry. This is the single most likely cause of the measured cycling.

**Fix:** mirror what `CartPoleEnvironment` already does correctly. Draw
`TRIALS` starting configurations once in the constructor from the injected
seeded `Rng`, store them as `readonly conditions`, and have `compete` run all
of them.

```ts
private readonly conditions: readonly ContestStart[];   // drawn once, shared
```

Aggregate so the existing invariant survives *by construction*:

- `predatorScore` = mean of the per-trial predator scores.
- `captured` = `predatorScore > 0.5`.

That keeps `CompetitionOutcome`'s documented contract — "`predatorScore` is
strictly above 0.5 iff `captured`" — exactly true, so
`test/coevolution.test.ts`'s existing invariant assertions still hold unchanged.

Start `TRIALS = 3`. Vary both positions (separation and bearing) and both
headings; keep the pair's separation roughly constant across conditions so the
difficulty doesn't swing wildly between trials.

**Cost:** 3× the contest count. Current: 40 genomes × 9 opponents × 2 sides =
720 contests/generation. New: 2,160. Measure the wall-clock impact before
committing to 3 — if the demo's 30-frame evolve interval can't absorb it, drop
to 2 trials and raise `evolveInterval`, rather than reverting to one fixed
start.

**Verified by:**
- New regression test: a champion evolved under condition set A is re-scored
  under a *held-out* condition drawn from a different seed; its score must not
  collapse (assert it stays above a threshold calibrated from the measurement).
  This is the test that would have caught the original defect.
- `--study coevolution-progress` re-run: the dominance fraction should stop
  falling. If it still falls, the arms race is genuinely cycling and §1.2's
  honest readout is the answer, not more tuning.

### 1.2 Fix the dominance readout
**File:** `src/main.ts` (`CoevolutionSimulation.advance`)

**Problem:** the readout prints `${dominated} / ${preyChampions.length}
ancestors`. The numerator rises mechanically because the denominator grows every
generation. Measured: raw count 19 → 67 while the fraction fell 76% → 34%. A
viewer reads growth as progress; the data shows cycling.

**Fix:** make the *fraction* the primary number.

```
dominates   34% of 200 ancestors
```

Keep the raw count as secondary context, never as the headline. If §1.1 makes
the fraction genuinely rise, this readout will show it honestly — and that is a
far stronger result than a number that only ever goes up.

**Also:** update the JSDoc on `dominanceCount` in `src/search/coevolution.ts`.
It currently says a rising count is "one of the few honest absolute signals."
Measured, the raw count rises under pure cycling. Say that.

**Verified by:** a test asserting the readout fraction *falls* for a
deliberately cycling synthetic lineage — locking in that the metric can report
bad news.

### 1.3 Animate the right genome on the maze's novelty side
**File:** `src/main.ts` (`MazeSimulation.advance`)

**Problem:** `fittest(evaluated)` picks the highest-`fitness` member, but
`NoveltySearch.step` has overwritten `fitness` with the *novelty score*. The
rendered agent is therefore the most behaviourally unusual individual — an
outlier by definition. **Measured: it reaches the goal in 69/150 rendered
generations (46%)**, while the caption says it reached the goal by exploration.

**Fix:** capture the objective score during the step's own evaluate callback —
zero extra simulation cost, since `MazeEnvironment.evaluate` already returns it
and Novelty Search simply discards the return value.

```ts
const objective = new Map<Genome, number>();
this.novPopulation = this.novelty.step(evaluated, (g) => {
  const score = this.novEnv.evaluate(g);
  objective.set(g, score);
  return score;                 // NoveltySearch still ignores this
});
this.novBest = argmax(evaluated, (g) => objective.get(g) ?? 0) as Network;
```

**This is not cheating and the caption must say so:** novelty *selection* never
sees this number — it is used only to choose which population member to display.
Add that sentence to the plate footnote. Selecting a representative to render is
a display decision; the search is unchanged.

**Verified by:** extend `test/maze.test.ts` — the displayed champion must reach
the goal in a large majority of generations after gen 5, across seeds. Current
measured baseline: 46%. Target: >90%.

### 1.4 Rewrite the maze footnote to match the measurement
**File:** `src/main.ts` (`OPTIONS[6].footnote`), plus the class doc in
`src/environments/maze.ts` and the README caveat.

**Problem:** the shipped copy says Novelty "reaches it immediately by
exploration alone" while Objective "has to learn its way past" two dead ends.
**Measured across 20 seeds with the demo's exact configs:**

```
objective GA:  20/20 solved, median generation 3
novelty:       20/20 solved, median generation 3
```

Identical medians; objective is marginally faster. There is no asymmetry in the
direction claimed. `.docs/known-issues.md` already concedes objective doesn't
stall, but the shipped copy still asserts a contrast.

**Fix — say what is actually true, which is still interesting:**

> The identical deceptive maze, run under two entirely different selection
> pressures — objective fitness (left) and novelty, which never sees the goal at
> all (right). Both solve it, at comparable speed (measured: median generation 3
> across 20 seeds). The point on display is architectural: swapping
> `GenerationalGA` for `NoveltySearch` required zero changes to the engine. This
> maze is too small to reproduce the "objective gets stuck forever" separation
> of Lehman & Stanley (2011) — see §1.5.

**Verified by:** the `maze-deception` study output is the citation. Put the
number in the copy and regenerate it whenever the maze changes.

### 1.5 (Optional stretch) Build a maze that is actually deceptive
**File:** `src/environments/maze.ts`, or a new `hardMaze.ts`

ADR-010 explicitly decided against this, and that decision was reasonable at the
time. But §1.4 is a relabelling, not a fix — the demo still has no working
demonstration of deception, which is the entire published reason Novelty Search
exists.

If you want the real result, the requirement is structural, not cosmetic: the
true path must force the agent to travel *away from the goal for a sustained
stretch*, not merely turn away for one cell. That means a substantially larger
grid (Lehman & Stanley's "hard maze" scale), a long cul-de-sac positioned so
that straight-line proximity monotonically improves along the wrong branch for
most of its length, and an episode budget sized to the longer true path.

**Accept this only against a measured acceptance criterion, decided up front:**
objective GA solves in **<50% of seeds within 100 generations** while novelty
solves in **>90%**. Run `--study maze-deception` after each geometry change. If
three geometry iterations don't reach it, stop and keep §1.4's honest labelling
— that is the documented lesson of ADR-010, and repeating the loop indefinitely
is how the last three redesigns were lost.

**Estimate:** 1–3 days, genuinely uncertain. Sequence it *after* Phase 2 — it is
the highest-variance item in this plan.

---

## Phase 2 — Prove the thesis (~3–4 days)

The core is genuinely representation-blind; I verified `core/` imports nothing
from `genomes/`, `environments/`, or `search/`. But the *demonstration* is 1:1 —
nine environments, each hard-wired to exactly one genome type via an `instanceof`
guard. The README's word "interchangeable" is doing work the code doesn't do.
This phase closes that gap. It is what moves the project from B+ to A.

### 2.1 Give every genome a behaviour descriptor
**Files:** `src/genomes/stringGenome.ts`, `vectorGenome.ts`,
`permutationGenome.ts`

**Problem:** `behaviour` is a writable field only on `Network`. The other three
genome classes don't declare it, so Novelty Search and MAP-Elites — two of the
four search paradigms — physically cannot run on three of the four
representations. The thesis says representation, problem, and selection pressure
are independent axes; today two of them are coupled.

**Fix:** add the same true-optional field to all three classes (per ADR-007,
declared optional, never assigned `undefined`), and copy it in `clone()` exactly
as `Network.clone()` does. Roughly four lines per class.

**Verified by:** a new test that runs `MapElites` over `PermutationGenome`s —
TSP routes, with behaviour `[route length, number of self-intersections]`. If
that archive fills, divergent search is genuinely representation-blind, and the
claim stops being aspirational. This test is itself a headline result.

### 2.2 Make two environments encoding-agnostic
**Files:** `src/environments/tsp.ts`, `src/environments/landscape.ts`

**Fix:** give each environment an injected *encoding* — an object supplying
`newPopulation(size)` and `decode(genome)`. The environment keeps owning the
problem (correct per the architecture: the Environment is the only layer that
knows what the problem is); it stops owning the representation.

```ts
interface TourEncoding {
  newPopulation(size: number): Genome[];
  decode(genome: Genome): readonly number[];   // a valid tour
}
```

Two encodings each, both textbook comparisons with real literature behind them:

- **TSP:** `PermutationGenome` + order crossover (current) **vs.** random-key
  `VectorGenome` (Bean, 1994) — a length-N float vector whose sort order *is*
  the tour. Same problem, same fitness, totally different genetics, one
  unchanged core.
- **Landscape (Rastrigin):** real-coded `VectorGenome` (current) **vs.**
  binary-coded `StringGenome` over a digit alphabet decoded to fixed-point
  coordinates — the classic binary-vs-real-coded GA comparison.

The `instanceof` guards move into the encoding adapters, where they belong.
`core/` is untouched, which is precisely the point being demonstrated.

**Verified by:** existing TSP and Landscape tests must pass **unchanged** under
the default encoding. If they need editing, the refactor changed behaviour and
is wrong.

### 2.3 Ship the cross-representation study
**File:** `src/headless/runExperiment.ts`

Add `--study cross-representation`: both environments × both encodings × N seeds,
emitting median generations-to-threshold and final fitness with IQR.

This is RESEARCH.md §7. It is the experiment that converts "representation-blind"
from a design claim into a measured result, and it is currently the single
largest thing missing from the project.

**Then put the resulting table in the README**, with the exact command that
produced it. A real result table is worth more than every remaining item in this
plan.

**Verified by:** it is the verification. Report whatever it says — including
"the encodings performed identically," which is itself a legitimate finding.

---

## Phase 3 — Coverage and craft (~2–3 days)

### 3.1 Test the render layer
**Files:** new `test/views.test.ts`, new `test/support/recordingContext.ts`

**Problem:** `views.ts` (843 lines) + `main.ts` (693 lines) = 1,536 lines, 24% of
the source tree, with zero tests touching them.

**Fix:** hand-roll a recording `CanvasRenderingContext2D` stub — a plain object
capturing every call and property set. No jsdom, no canvas package; consistent
with the zero-dependency rule. Then for each of the nine views assert:

- it draws without throwing on a fresh, empty, and null state (the `drawIdle` /
  `episode === null` paths are currently entirely unexercised);
- every drawing call stays inside the 1180×740 stage bounds;
- `onGeneration` followed by `animate` is idempotent with respect to state.

This is not about coverage percentage. These are the paths that throw a blank
plate at a visitor, and nothing currently catches them.

### 3.2 Name the geometry
**Files:** new `src/render/layout.ts`; **edits:** `src/render/views.ts`

384 numeric literals against 3 named constants, in a project whose coding
standard says "no magic numbers." Extract plate geometry — lens centres and
radii, panel rects, badge positions, per-view offsets — into a named layout
module beside the existing `INSET_RECT` and `PLATE` in `palette.ts`.

Don't chase every literal; a `0.5` inside a midpoint calculation is fine. Target
the repeated positional constants, which are both the numerous ones and the ones
that silently break the layout when edited.

### 3.3 Small correctness fixes
**Files:** `src/search/novelty.ts`

- `meanDistanceToNearest`: `const start = distances[0] === 0 ? 1 : 0` assumes at
  most one zero distance. Two genomes with identical behaviour — common early,
  when many agents die at the same wall — break the self-exclusion and skew both
  their novelty scores. Exclude the point's own index explicitly instead of
  inferring it from a zero distance.
- `NoveltySearch.step` calls `reproduce(ranked, this.config, ...)`, skipping
  `annealedRate`, unlike `GenerationalGA`. This is probably deliberate — the
  archive already preserves diversity — but nothing says so. Either honour the
  schedule or add one sentence of JSDoc explaining why novelty deliberately does
  not cool.
- `NoveltyConfig.archiveThreshold`'s doc says "permanent archive"; the code
  `shift()`s the oldest entry past `archiveLimit`. Fix the word.

---

## Phase 4 — Ship it (~1 day)

The demo is the product. It is not currently reachable by anyone.

### 4.1 Enable GitHub Pages
`.github/workflows/deploy.yml` is already written and correct. Switch Pages on
in repo settings (Source: GitHub Actions), push, confirm the deploy, then
replace the README's "Live demo: _coming soon_" with the real URL.

**Nothing else in this plan matters as much for how the project is received.**

### 4.2 Add a license
README says "License: TBD." Without one, nobody may legally use, fork, or build
on this. MIT unless there's a reason otherwise. One file, five minutes.

### 4.3 Record the arms-race GIF
The `<!-- TODO -->` in the README has been waiting since the ship-readiness
commit. Do it after §1.1 lands, so what's recorded is the varied-condition
version — otherwise you'll re-record.

### 4.4 Add run controls to the demo
**Files:** `src/main.ts`, `index.html`

The observability milestone (M7) shipped without any way to control what you're
observing. `SEED = 42` is hardcoded; a visitor sees exactly one trajectory per
plate, forever, and cannot tell whether what they saw was luck.

Add: a seed input, pause/step, reset, and a speed control. Every one of these is
a handful of lines against the existing `Simulation` interface — `load(index)`
already rebuilds everything from scratch, so reset and re-seed are nearly free.

This is also the single cheapest credibility win in the plan: letting a skeptical
viewer re-roll the seed themselves is a stronger claim of honesty than any
paragraph of copy.

### 4.5 Self-host the font
`index.html` fetches JetBrains Mono from `fonts.googleapis.com`. That is a real
external runtime dependency in a project whose headline claim is zero
dependencies — plus an offline failure and a third-party request per visitor.
Either vendor the woff2 into the bundle or drop to the existing
`ui-monospace, Menlo, monospace` fallback.

### 4.6 Clear the audit
5 vulnerabilities (1 critical) via `postcss` under vite. Dev-only, but CI runs
`npm ci`. Bump vite to 6.x and re-run the suite.

---

## Phase 5 — Documentation debt (~half a day)

Do this **last**, and do less of it than feels natural.

2,032 lines of markdown, four checked-in PDFs, plus `CLAUDE.md`, `AGENTS.md`,
`TASKS.md`, `CHANGELOG.md`, and `session-log.md` — against ~5,000 lines of
non-test source, written across 6 days and 56 commits. The process scaffolding is
heavier than the engineering it tracks, and `.docs/known-issues.md` warns it
drifts unless hand-maintained every session. That is a maintenance tax on a solo
project.

- **Update, don't add:** the maze section of `known-issues.md` and ADR-010 both
  need the 20-seed measurement from §1.4. The predator–prey balance note needs
  the varied-conditions change from §1.1.
- **Write two new ADRs only:** ADR-012 (varied contest conditions — with the
  measured before/after), ADR-013 (encoding-agnostic environments).
- **Consider dropping** the four generated PDFs from git. They are binary churn
  regenerable from source; the `.md` files are the actual artifacts.
- **Consider merging** `TASKS.md` and `.docs/implementation-roadmap.md` — they
  overlap, and two roadmaps means neither is trusted.

---

## Sequencing

| Phase | Item | Effort | Blocks |
|---|---|---|---|
| 0 | Study mode + presets extraction | 0.5d | everything measurable |
| 1 | 1.1 varied contest conditions | 0.5d | GIF (4.3) |
| 1 | 1.2 dominance fraction | 0.5h | — |
| 1 | 1.3 maze champion selection | 2h | — |
| 1 | 1.4 maze copy | 1h | needs 0.1 |
| 4 | 4.1 Pages · 4.2 license | 1h | — *(do early; unblocks nothing, gains everything)* |
| 2 | 2.1 behaviour on all genomes | 0.5d | 2.3 |
| 2 | 2.2 encoding-agnostic envs | 1.5d | 2.3 |
| 2 | 2.3 cross-representation study | 1d | README result table |
| 3 | 3.1 render tests | 1.5d | — |
| 3 | 3.2 layout constants | 0.5d | — |
| 3 | 3.3 small fixes | 2h | — |
| 4 | 4.3–4.6 GIF, controls, font, audit | 1d | 4.3 needs 1.1 |
| 1 | 1.5 hard maze *(optional)* | 1–3d | high variance — last |
| 5 | docs | 0.5d | last |

**Roughly 9–12 working days**, or 6–8 if §1.5 is skipped.

If only three days are available: **Phase 0, Phase 1.1–1.4, and Phase 4.1–4.2.**
That fixes every dishonest readout and makes the project reachable — the two
things that actually damage it today.

## What to deliberately not do

- **Don't optimise anything.** M8 already measured that allocation is not the
  bottleneck and buffer pooling is unwarranted. That conclusion stands; leave it.
- **Don't start M12 (WebGPU/WASM).** Nothing in this plan needs it, and it is a
  larger effort than the entire remediation.
- **Don't chase 100% render coverage.** §3.1's three assertion classes catch the
  failures that matter; the rest is pixel-diffing, which is a treadmill.
- **Don't refactor `main.ts` wholesale.** Extract the presets (§0.2) and fix the
  two simulations (§1.2, §1.3). The `Simulation` adapter design (ADR-006) is
  sound and should survive intact.
