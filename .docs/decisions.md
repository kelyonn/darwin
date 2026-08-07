# Architecture Decision Records

Lightweight ADRs for choices that refine — never contradict — the specs in `docs/`.

## ADR-001 — Randomness is injected via genome constructor
**Context.** The spec (PRD §4) fixes the genome contract as `mutate(rate: number)`
and `crossover(other: Genome)` — no RNG parameter. Reproducibility (PRD §2, §14)
requires that all randomness flow through one seeded PRNG.
**Decision.** Genomes receive a shared `Rng` instance at construction and draw
from it internally. One `Rng` is created per run and passed to both the
environment (for population init) and the `GenerationalGA` (for selection), so a
single stream drives everything.
**Consequences.** Spec signatures are honored exactly. Determinism holds as long
as the order of draws is fixed (it is: evaluate → sort → elitism → breed).
`clone()` copies the shared reference, which is correct — clones belong to the
same run and stream.

## ADR-002 — `core/stats.ts` is fitness-based only
**Context.** PRD §9 asks for a diversity metric. True genotypic diversity needs a
genome distance function, which only a representation knows.
**Decision.** `computeStats` reports best/worst/average plus `spread` (stddev of
fitness) as a representation-blind diversity proxy. Genotypic/behavioural
diversity is deferred to the `behaviour` descriptor machinery (Novelty/MAP-Elites).
**Consequences.** `core/` stays blind to representation. `spread` is a proxy, not
a true diversity measure — documented as such at its definition.

## ADR-003 — `SearchStrategy.step` scores the incoming generation in place
**Context.** `step` evaluates the current population, then breeds and returns the
next generation. The returned children are not yet scored.
**Decision.** `step` writes fitness onto the members of the incoming `population`
array (documented on the interface) and returns unevaluated children. Callers
that want stats/best for the generation just evaluated must read them from the
*incoming* array reference, not the returned one.
**Consequences.** Caught a real reporting bug during M2 (stats read from unscored
children showed avg ≈ 0). The render loop now keeps the incoming reference. When
the dashboard lands (M8), formalise this as a `Runner` yielding
`{ generation, evaluatedPopulation, stats }` so no caller re-trips it.

## ADR-004 — Co-evolution is a distinct driver, not a `SearchStrategy`
**Context.** `SearchStrategy.step(population, evaluate)` models one population
whose members have an absolute fitness. Competitive co-evolution (PRD §10 Tier 3)
has two populations whose fitness is *relative* to a co-evolving opponent (the
Red Queen — RESEARCH.md §2.1); a single-population `step` cannot express it. The
specs (CLAUDE.md milestone note, RESEARCH.md §4, PRD §11) flag this explicitly.
**Decision.** `src/search/coevolution.ts` defines a separate `CoevolutionDriver`
with its own `step(state) → { next, stats }` over `{ predators, prey }`. It does
**not** implement `SearchStrategy`. It stays representation-blind by taking an
injected `CompeteFn` rather than importing any environment, preserving the
`environments → search` dependency direction.
**Consequences.** The `SearchStrategy` contract is untouched. The driver reuses
`core/breeding.ts` (ADR-005) for selection/elitism, so only the *evaluation*
model differs. Fitness = graded closeness payoff (a gradient before any capture,
resisting disengagement) + competitive fitness sharing (diversity). Champions are
archived in a bounded Hall of Fame. `captureRate` is the honest arms-race pulse
since relative fitness is not comparable across generations.

## ADR-005 — Selection and elitism extracted to `core/breeding.ts`
**Context.** M9's driver needs the exact tournament-selection + elitism logic the
`GenerationalGA` already had, privately. Duplicating it would violate the coding
standard (no duplicated logic) and risk the two copies drifting.
**Decision.** `tournamentSelect` and `reproduce(ranked, config, rng)` moved to
`core/breeding.ts`; `GenerationalGA.step` and `CoevolutionDriver.step` both call
`reproduce`. `GaConfig` is now an alias of `BreedingConfig`.
**Consequences.** The RNG draw order in `reproduce` is identical to the GA's prior
inline loop, so seeded runs remain byte-identical (existing `ga.test.ts`
reproducibility tests pass unchanged). Selection behaviour now lives in one place.

## ADR-006 — `main.ts` composes a `Simulation`, not a `Runner`
**Context.** The render loop was built around the single-population `Runner` +
`EnvironmentView` (one `GenerationResult` per generation). Predator–prey uses the
two-population `CoevolutionDriver` with a different step shape and different stats,
so it cannot be a `Runner`.
**Decision.** The entry point defines a small `Simulation` interface
(`advance()` / `frame()` / `meta` / `evolveInterval`) with two adapters:
`GaSimulation` (wraps `Runner` + `EnvironmentView`, behaviour unchanged) and
`CoevolutionSimulation` (wraps `CoevolutionDriver` + `PredatorPreyView`, builds the
CIAO matrix from champion history). The loop only talks to `Simulation`.
**Consequences.** The render loop is driver-agnostic; the GA path is untouched. The
CIAO champion history is accumulated in the adapter (not the driver), reading each
generation's champion from the just-scored incoming state per ADR-003. New
environments plug in as one of the two adapters. Kept in `main.ts` (the composition
root) so `app/` does not gain a dependency on `render/`.

**Update (M10).** A third adapter, `MapElitesSimulation`, was added for `MapElites`
(`search/mapElites.ts`): unlike `Runner` and `CoevolutionDriver`, MAP-Elites has no
fixed-size population to advance through generations — it grows an archive
indefinitely. `meta` reports archive coverage and best fitness found instead of a
generation index. This confirms the adapter pattern generalises: a third,
structurally different driver required zero changes to `Simulation` itself.

## ADR-007 — `Genome.behaviour` is a true optional property, not `T | undefined`
**Context.** M10's Novelty Search and MAP-Elites need environments to write a
behaviour descriptor onto a genome. The natural first attempt —
`behaviour: readonly number[] | undefined = undefined` on `Network` — fails to
typecheck against `Genome`'s `readonly behaviour?: readonly number[]` under
`exactOptionalPropertyTypes` (part of the project's full strictness set): that flag
treats an optional property as either *absent* or *present with the declared type*,
never explicitly `undefined`.
**Decision.** `Network.behaviour` is declared `behaviour?: readonly number[];` with
no initializer (a true optional property, absent until an environment sets it).
`clone()` only assigns it when defined: `if (this.behaviour !== undefined) copy.behaviour = this.behaviour;`.
**Consequences.** Objective-only environments (Weasel, XOR, cart-pole, track
runner, predator-prey) never touch `behaviour` and it stays absent, exactly as
before this milestone. Divergent-search environments (maze, gait) set it during
`evaluate`. This is a narrow but easy-to-repeat mistake — any future optional field
on `Genome` should follow the same pattern.

## ADR-008 — Mutation annealing + raised elite fraction, in that order of investigation
**Context.** Several environments appeared "stuck" — visibly not improving after
early generations, even though the champion (`best`) was fine. The initial
hypothesis (planned and partly implemented before this ADR) was that mutation
intensity never anneals, so the population is perpetually kicked out of good
regions before it can refine. That mechanism was built:
`BreedingConfig.mutationDecay`/`minMutationRate`, applied in `GenerationalGA` and
`CoevolutionDriver` via `breeding.annealedRate`, with `VectorGenome.mutate` and
`Network.mutate` changed so perturbation *magnitude* scales with `rate` (previously
only `Network` gated perturbation by *probability*; `VectorGenome` gated by
probability too, with the *step size* fixed at construction regardless of `rate`).

**What measurement actually found (`.docs/known-issues.md` has the full numbers).**
Headless traces (`computeStats` over generations, several seeds) showed the
population's *average* fitness reaches a hard plateau within ~20 generations and
never moves again — but annealing the mutation rate all the way down to its floor
changed that plateau by less than 1%, on both Landscape (vector genome, blend
crossover) and cart-pole (network genome, uniform-mix crossover). Tournament size
(5 → 15 → 25) also made no measurable difference. Isolating crossover entirely
(mutation-only breeding) still plateaued, just at a different level. The one lever
that moved the plateau, cleanly and monotonically, was **`eliteCount` as a
fraction of `populationSize`**: raising it from 2/300 (0.7%) to 20/300 (~7%) raised
Landscape's population-average fitness 10× (0.0067 → 0.0667); the equivalent
change on cart-pole (2/150 → 12/150) raised its average 6× (24 → 144 frames of
1800). `best` never regressed in any configuration (elitism is unaffected).

**Why:** with `eliteCount` a tiny fraction of the population, only ~2 genomes are
ever actually good, so a tournament of 5 out of 300 has roughly a 3% chance of
drawing one, and thus almost every crossover blends two mediocre parents. On a
deceptive function this doesn't average toward the optimum — it produces another
mediocre point regardless of how large or small the subsequent mutation is. This
is a property of **tournament + elitism breeding structure**, not of any one
genome's mutation operator — it reproduced identically on both a continuous vector
genome and a neural-network genome with an unrelated crossover operator.

**Decision.** Keep the annealing mechanism (it is sound, PRD-aligned, harmless
when unused, and does provide late-stage refinement once the population can
actually reach good regions), but treat it as secondary. The primary fix applied
in `main.ts` is **raising `eliteCount` to roughly 5–8% of `populationSize`** on
every GA-driven environment where this was measured to matter: Landscape, TSP
(unmeasured directly but same breeding structure — applied by inference, not
fabrication, and flagged as such), cart-pole, track runner, and the maze's
objective side. Left unchanged: Weasel (already solves exactly), the maze's
novelty side (higher elitism would fight its exploration goal — the archive
already preserves diversity), predator–prey (already at a proportionally
reasonable 2/40 ≈ 5%, and over-cooling an arms race is its own failure mode, see
RESEARCH.md §4), and MAP-Elites (a fundamentally different, archive-based
mechanism with no tournament/elitism at all).

**Consequences.** This corrects the plan's original hypothesis rather than
quietly discarding it — annealing shipped anyway because it is real, tested
infrastructure with a legitimate PRD basis (§7), but the commit history and this
ADR are explicit that it was *not* the fix for the reported symptom. TSP's
`eliteCount` bump is the one change in this set not individually re-verified by a
headless trace (time budget) — if TSP still looks flat, verify it the same way
before assuming the fix transfers.

## ADR-009 — Track runner's checkpoint reward must be radius-weighted with a tent function
**Context.** After ADR-008's eliteCount fix, track runner's fitness *still*
plateaued hard — but at exactly 315.00, unlike Landscape/cart-pole where only the
*average* was capped. Replaying the champion (`env.createEpisode`) and recording
its radius each tick showed it hugging the inner wall (avg radius 0.2047 against
`innerRadius = 0.2`). The cause: fitness counted raw angular sectors crossed
(`floor(angleAccumulated / SECTOR_ANGLE) * REWARD`), and a smaller radius means a
smaller circumference, so hugging the inner wall completes more sectors per unit
of the fixed distance/time budget than genuinely driving the track — reward
hacking (PRD §6), not a search-difficulty problem.
**First attempt, tried and measured wrong.** Weighting each tick's angular
progress by `(radius − inner) / (outer − inner)` (0 at the inner wall, 1 at the
outer wall) just moved the exploit to the *outer* wall — measured: champion
radius shifted to avg 0.4035, fitness capped at a new ceiling of 150. This is
provable in general, not just empirically: for any monotonic weight `w(r)`, the
reward rate `w(r) · (v/r)` is maximised at one boundary of `r` because a monotonic
function has no interior extremum on a closed interval.
**Decision.** Weight each tick's angular progress by a *tent* function peaking at
the track's midline and falling to zero at both walls:
`clamp01(1 − |r − midRadius| / halfWidth)`. This has an interior maximum, so
there is no boundary left to hug.
**Consequences.** Verified: champion radius locks to avg 0.3101 against a true
midline of 0.31 (min/max 0.3099/0.3101), and the resulting fitness ceiling (210)
matches the independently-computed theoretical maximum for a perfect centred lap
exactly. A regression test (`trackrunner.test.ts`) asserts the trained champion's
average radius stays within 15% of the track width from either wall — this is
the test that would have caught the original bug, and the fix is only trustworthy
because both the naive and the working version were measured, not assumed.
General lesson for this codebase: a population "plateauing at a suspiciously
round-looking maximum" is itself a signal to check whether that number is the
*intended* optimum or an *exploitable* one — replay the champion and inspect its
actual behaviour, don't just look at the fitness curve.

## ADR-010 — Maze: episode-ending wall collision, not trap geometry, is what makes objective genuinely learn
**Context.** The maze's objective side reached ~0.69 proximity fitness within a
handful of generations regardless of seed, with no measurable advantage for
Novelty Search — the intended Lehman & Stanley (2011) "objective is deceived,
novelty escapes" contrast wasn't showing up. Three rounds of trap-geometry
tuning were tried and measured, each discarded in turn: a single far-off dead
end (too weak); a single trap repositioned to the exact turn-away point, plus a
larger episode budget (objective still solved at generation 1 — pure random
init — across all 3 test seeds); two traps at both turn-away points plus a
much tighter goal radius, 0.6 → 0.2 (objective *still* solved at generation 1
on 1 of 3 seeds). The common thread across all three failures: `advance()`
*blocked* movement into a wall rather than ending the episode — the agent lost
nothing by trying, could keep re-steering indefinitely, so an undirected random
network given ~400 ticks would eventually shuffle through the single connected
corridor by sheer persistence, almost independent of trap count or placement.
**Decision.** Make wall contact end the episode immediately, matching cart-pole
and track runner (both already treat a crash as fatal). `MazeEnvironment.advance`
now returns `false` on a would-be wall collision instead of silently blocking;
`evaluate` and `createEpisode` both stop there.
**Consequences (measured).** Gen-1 random luck now fails on 2 of 3 seeds
(previously 3 of 3 always succeeded) — a real, measured improvement, not a full
fix. The objective population still reliably finds the route within roughly
1–5 generations of real evolutionary refinement (150 genomes with elitism is
simply effective at small mazes — a known property of population search, not a
bug), so this does **not** make objective fail outright. Presented with that
finding, the user chose to ship it: the verified story is "Novelty solves
immediately by exploration; Objective has to genuinely learn to avoid two dead
ends and typically does so within a handful of generations" — immediate
exploration vs. a few generations of real learning, not solve vs. stall.
Escalating toward reliable multi-generation objective *failure* would need a
substantially larger/more complex maze and was explicitly declined as
disproportionate once the actual goal (watching both sides constructively,
verifiably learn) was already met. `test/maze.test.ts` locks in both halves of
this story as regressions, across 3 seeds each. See `.docs/known-issues.md` for
the full numeric trace of all three discarded attempts.

**Addendum (2026-08-06, §1.4 of `.docs/remediation-plan.md`).** The "immediate
exploration vs. a few generations of learning" half of the consequences above
was never actually measured against a broad seed sample — it generalised from
the 3 seeds `test/maze.test.ts` happened to lock in. `--study maze-deception`
(§0.1), run across 20 seeds under the demo's exact configs: **objective solved
20/20 at median generation 3; novelty solved 20/20 at median generation 3** —
identical, not "immediate vs. a few generations." The demo footnote,
`MazeEnvironment`'s class doc, and the README caveat were rewritten to state
the measured medians instead of the speed asymmetry. Everything else in this
ADR stands: wall-contact-ends-episode was still the real fix, objective still
does not fail outright, and the decision not to escalate toward a harder maze
was and remains correct (revisited, still declined, in §1.5 of the remediation
plan — see that section for the acceptance criterion a future attempt would
need to hit before trying again).

## ADR-011 — XOR needed a `cases solved n/4` signal because the sigmoid asymptote makes correctness invisible
**Context.** Reported as "XOR isn't done" — a genuinely fully-correct network
(all four cases on the right side of the 0.5 decision threshold) can still read
"fitness 3.8 / 4" indefinitely, because a sigmoid output never reaches exactly 0
or 1, so the last stretch toward fitness 4.0 is an asymptotic crawl that never
visually resolves. Verified the network itself was not at fault: 10/10 seeds
reached 4/4 correct classification under the demo's exact config.
**Decision.** Added a `cases solved: n/4` signal in two places: the shared
readout's secondary line (`GaSimulation` gained an optional
`secondaryMetric(champion) => {label, value}` callback, computed from the
champion genome itself rather than its scalar fitness) and a prominent on-canvas
badge in `XorView`. Both count cases whose live output already lands on the
correct side of 0.5, so they read `4/4` the instant the network is functionally
correct, independent of the fitness decimal.
**Consequences.** `GaSimulation`'s new parameter is optional and additive — every
other environment using it is unaffected. `test/xor.test.ts` gained a multi-seed
regression asserting 4/4 reliability under the demo's own config, so this is
locked in as measured fact, not a one-off observation.

## ADR-012 — Predator–prey: varied trial conditions, and the dominance readout must lead with the fraction
**Context.** A 2026-08-06 project review found two related defects in the
predator–prey plate. First, every contest ever run — every generation, every
seed — started from the identical geometry (predator at `(0.25, 0.5)`, prey at
`(0.75, 0.5)`, both headings `0`, meaning the prey started turned directly
*away* from the predator). A controller could learn an open-loop trajectory
valid only for that one start, and nothing could distinguish that from real
skill. Second, the live "dominates N ancestors" readout showed the raw
dominance count, which rises mechanically as the Hall-of-Fame-derived ancestor
archive grows each generation regardless of whether the lineage is actually
improving. `--study coevolution-progress` (the new headless comparison mode,
§0.1) measured both directly: pre-fix, mean capture rate fell from ~52%
(generations 1–50) to ~37% (generations 151–200) across seeds, and on one seed
the raw dominance count climbed 19 → 67 across 200 generations while the
*fraction* of ancestors beaten fell 76% → 34% over the same run — the count
rose under what was, by the fraction, a declining lineage.
**Decision.** `PredatorPreyEnvironment` now draws `TRIALS = 3` starting
configurations once at construction from its injected `Rng` (varying the
bearing between agents and both headings, holding separation constant at the
original 0.5), and every contest runs all three, aggregating the graded
predator payoff by mean. `compete` derives `captured = predatorScore > 0.5`
from that mean, which keeps the documented `CompetitionOutcome` invariant true
by construction rather than by convention. `createEpisode` (the live
animation) uses trial 0 by default; the parameter is there for future work
that might cycle through trials for variety. Separately, `main.ts`'s dominance
readout now leads with the percentage (`dominates 58% (7/12 ancestors)`, count
kept only as parenthetical context), and `dominanceCount`'s JSDoc
(`search/coevolution.ts`) no longer calls the raw count an honest progress
signal on its own.
**Consequences.** Re-measuring `--study coevolution-progress` (5 seeds, 200
generations) after the fix: capture rate now sits flat around 52–56% across the
whole run instead of declining, and the dominance fraction stabilises around
49–50% after an initial settling period instead of continuing to erode. A
held-out generalisation check — train a champion under one environment's own
trial conditions, then re-score it against a *different* environment instance
with entirely different starting geometries — found held-out performance
tracked home performance within a 0.98–1.01 ratio across three independent
seed pairs (`test/coevolution.test.ts`'s "does not collapse against a held-out
starting geometry" regression), evidence the fix produces genuine
generalisation, not just cosmetic variety. Per-contest simulation cost triples
(`TRIALS = 3`); measured acceptable at the demo's population size (40) and
30-frame evolve interval. See `.docs/known-issues.md` for the full before/after
numbers.

## ADR-013 — Representation-blindness was an architectural claim, not a demonstrated one; close the gap
**Context.** A 2026-08-06 project review found that while `core/` genuinely
imports nothing from `genomes/`, `environments/`, or `search/` (verified), the
*demonstration* of representation-blindness was 1:1 — nine environments, each
hard-wired to exactly one genome type via an `instanceof` guard in `evaluate`.
Worse, `behaviour` was a mutable field declared only on `Network`
(`StringGenome`, `VectorGenome`, and `PermutationGenome` had no writable
`behaviour`), so two of the four search paradigms — Novelty Search and
MAP-Elites — could not run on three of the four genome types at all. The
README's word "interchangeable" described `core/`'s contract, not anything a
reader could actually watch happen.
**Decision, part 1 (genomes).** Add the same true-optional `behaviour?:
readonly number[]` field `Network` already carries (ADR-007) to
`StringGenome`, `VectorGenome`, and `PermutationGenome`, copied in each
class's `clone()` exactly as `Network.clone()` does. Four lines per class.
**Decision, part 2 (environments).** Give `TspEnvironment` and
`LandscapeEnvironment` an injected *encoding* — `newPopulation(size)` +
`decode(genome) => readonly number[]` — so the environment keeps owning the
*problem* (correct per the architecture: the Environment is the only layer
that knows what the problem is) while no longer owning the *representation*.
Each environment ships two encodings, both textbook comparisons with real
literature behind them, defaulting to the original so every existing call site
is unaffected:
- **TSP:** `PermutationEncoding` (the original `PermutationGenome` + Order
  Crossover) vs. `RandomKeyEncoding` (Bean, 1994) — a `VectorGenome` of
  ordinary real numbers whose ascending sort order *is* the tour. No repair
  operator, no permutation-aware genetics; `VectorGenome`'s existing blend
  crossover and Gaussian mutation solve the identical problem.
- **Landscape:** `RealCodedEncoding` (the original `VectorGenome`, decode is
  the identity) vs. `BinaryEncoding` — a fixed-width bit-string `StringGenome`
  (16 bits/dimension, linearly decoded onto the Rastrigin domain), the classic
  binary-coded GA representation for continuous optimisation. `StringGenome`'s
  per-character mutation and uniform crossover — built for the Weasel
  phrase — with no numeric-optimisation genetics at all.
The `instanceof` guards moved into the encoding adapters, where they belong;
`core/` and the breeding machinery are untouched, which is exactly the point
being demonstrated.
**Consequences.** Measured, not assumed: both alternative encodings genuinely
solve their problem through the unmodified `GenerationalGA`. Random-key TSP
(population 200, 150 generations, seed 1) reached route distance 3.690 versus
permutation encoding's 3.886 on the identical node set — the alternative
representation is not merely functional, it is competitive. Binary-coded
Landscape reached fitness 1.0000 (Rastrigin value ≈0, the global optimum) —
identical to real-coded, across three independent seeds
(`test/environments.test.ts`). Separately, `MapElites` was run over
`PermutationGenome` TSP routes (behaviour = `[route length, edge-crossing
count]`) and filled a real, multi-cell illuminated archive
(`test/mapElites.test.ts`) — proof that divergent search is now genuinely
representation-blind, not just newly capable of holding the field. The live
demo (`main.ts`, `src/app/presets.ts`) is untouched and still uses the
original encodings; the new encodings are exercised by tests and by
`--study cross-representation` (§2.3), not the browser UI — this ADR closes
the *proof* gap, not a UI feature gap.

## ADR-014 — Cut the demo from nine plates to five
**Context.** The demo shipped nine specimen plates. This was a user-directed
change, not a code-quality finding: after using the demo, the user reported
several plates "playing useless" for the purpose the demo actually serves
(watching the engine learn) and asked for exactly five — Predator–Prey,
Weasel, TSP, Track Runner, Maze — with the fifth (Weasel) chosen from a short
list the assistant offered when asked which single remaining plate was "most
intuitive and the one you can actually see."
**Decision.** Remove Landscape, Cart-pole, Gait, and XOR from `main.ts`'s
`OPTIONS` array only. Their environments (`landscape.ts`, `cartpole.ts`,
`gait.ts`, `xor.ts`), demo presets, `--study`/`npm run bench` coverage, and
environment-level tests are untouched — Landscape is one of the two legs of
the cross-representation study (ADR-013), Gait is the MAP-Elites proof, and
XOR/Cart-pole are the only three rows `runBench` measures. `MapElitesSimulation`
(Gait's only `Simulation` adapter) was deleted from `main.ts` since nothing
else constructed it; the driver/adapter pattern itself remains exercised by
`test/mapElites.test.ts`. `docs/ENVIRONMENTS.md`'s sections for the four
dropped environments moved under a "stretch / extensible" heading rather than
being deleted — the specs remain accurate documentation of code that still
exists and is still tested, just not on screen.
**Consequences.** `test/views.test.ts` and `test/presets.test.ts` lost their
`LandscapeView`/`CartPoleView`/`XorView`/`GaitArchiveView` and
`LANDSCAPE_PRESET`/`CARTPOLE_PRESET`/`GAIT_PRESET`/`XOR_PRESET` coverage
(deleted alongside the classes/constants themselves, not left orphaned).
`test/support/recordingContext.ts`'s `installCanvasPolyfill` — needed only
because `LandscapeView` rendered an offscreen canvas — became dead code and
was removed. Full test suite, `tsc --noEmit`, and `npm run build` stayed green
throughout (`noUnusedLocals` catches any declaration this kind of cut orphans,
which is most of how this change was verified mechanically).

## ADR-015 — Track Runner and Maze became round-paced, cohort-animated plates
**Context.** Even after fixing episodes being interrupted mid-flight every
`evolveInterval` frames (a separate, earlier fix this session), Track Runner
and Maze still failed at the one job the user explicitly asked them to do:
visibly demonstrate the population learning, including its mistakes, at a
controllable pace ("I don't need it to be fast... I need to be able to
control the showing part"). Two causes, both measured rather than assumed:
(1) the generation counter and the live episode advanced on unrelated
schedules (~50 generations could elapse per watched episode), and (2) a single
champion is already good at generation 1 — Track Runner's gen-1 champion
scored ~2.06 laps, being the best of 150 random networks — so animating one
genome can *structurally never* show population-level learning; the learning
lives in how the whole distribution's outcomes shift over generations.
**Decision.** Both plates became round-paced: `Simulation` gained a `Pacing`
union (`{kind:"frames", evolveInterval}` for the other three plates, unchanged;
`{kind:"round"}` for these two) and split the old fused `frame()` into
`tick()` (advance the live sim, no drawing) and `draw()` (render current
state, no stepping) — the split is what lets the render loop run several
ticks per redraw at higher speeds through one fractional-accumulator code
path (0.25×–8×), rather than a separate integer frame-skip scheme. Each plate
now animates a 12-member (Track Runner) or 8-per-side (Maze) **stratified
cohort** instead of one champion — evenly-spaced fitness ranks, champion
always included at rank 0 — via `stratifiedSample` (`src/app/cohort.ts`),
deliberately RNG-free: sampling with the plate's seeded `Rng` would consume
draws from the evolutionary stream and silently break ADR-001's byte-identical
reproducibility, so the function takes no `Rng` parameter at all and a
dedicated test (`test/cohort.test.ts`) evolves two identical seeded GAs, one
with sampling spliced in between generations, asserting identical fitness
traces. The maze's novelty side ranks its cohort by the same captured
objective-score map the champion-selection fix (ADR-012-adjacent, `.docs/
known-issues.md`) already used, not by post-step novelty-overwritten fitness.
`main.ts` owns cohort/episode state directly (`TrackRunnerSimulation`,
`MazeSimulation`) rather than the view; both `TrackRunnerView` and
`MazeDuoView` became pure renderers (`drawIdle()` / `draw(frame)`, options-
object frame types, no internal episode state) to match. Round completion —
every cohort member crashed, solved, or hit its tick cap — triggers
`ROUND_HOLD_FRAMES` (30) of holding the final frame on screen before the next
round starts, so early generations (where a fresh cohort can crash within
~20 ticks) don't flicker past unreadably. Crash/failure positions persist as
fading markers across the last few rounds (`CRASH_MARKER_ROUNDS`, shared
between the `Simulation` that ages them and the `View` that fades them so the
two can't drift apart) — the "here's where it keeps failing" the user asked
for. An outcome tally ("completed a lap 7/12", "reached goal 5/8 obj · 3/8
nov") updates live, every tick, not just at round boundaries.
**A real bug surfaced during browser verification, not just design.** The
first working version called `advance()` (which evolves the population and
respawns the cohort) the instant `roundComplete()` turned true — immediately
replacing the just-finished cohort with a fresh one *before* `holdFrames` (or
the `step` button, or a screenshot) ever got to show its actual final state.
The outcome tally is computed from the live cohort, so it always read "0/12"
— not because nothing was learned, but because the display could never show
anything else: a headless probe confirmed a generation-61 champion that
*actually* survived 600 ticks and completed 3.08 laps was rendering as
"0/12 completed a lap" on every frame, forever. The fix: `advance()` now
fires lazily, at the top of the frame where ticking is about to resume for a
new round — not the moment the old one finishes — so the finished round's
crash positions and tally stay on screen for the full hold, and the `step`
button (paused, one click = one generation) shows the round that just ran
rather than the fresh one it's about to be replaced by. General lesson: for
any "hold the final state, then advance" loop, evolving *before* the hold
starts silently defeats the hold — always evolve on the way *out* of the
hold, not the way in.
**Consequences.** Verified in the browser via the `step` button (bypasses
`requestAnimationFrame`, which the headless preview can fully suspend when
backgrounded — see the known pitfall on that) across dozens of generations on
both plates: Track Runner's crash cloud visibly migrates further around the
ring as generations pass and the "completed a lap" count climbs from 0/12 to
double digits; Maze's objective side converges its champion trail straight to
the goal by around generation 3–13 while the novelty side's cohort visibly
fans out across the whole corridor including the dead-end trap, matching the
maze-deception study's measured median-generation-3 solve time (ADR-010).
Full test suite (146/146, up from 138 — 8 new in `test/cohort.test.ts` plus a
rewritten cohort/frame section of `test/views.test.ts`), `tsc --noEmit`, and
`npm run build` all green throughout.

## ADR-016 — Maze demo simplified to objective-only; drop the novelty lens from the screen, not the codebase
**Context.** After ADR-015 shipped (both sides of the maze duo cohort-
animated and round-paced), the user asked what the novelty side was actually
for, got an explanation of Novelty Search versus objective fitness, and then
said plainly: they want *one* maze, showing the population correcting its own
mistakes, generation over generation. This is a user-directed simplification,
not a finding that the dual-paradigm demo was broken — ADR-015's cohort/
crash-marker work on the novelty side was implemented correctly and worked as
designed; the user just decided a single, more legible maze served the demo
better than two side by side.
**Decision.** `main.ts`'s Maze plate now runs a single objective
`GenerationalGA` cohort (unchanged group size, 8) in one full-size lens
(`LENS_CX`/`LENS_CY`/`LENS_R` — the same geometry every other single-lens
plate uses, replacing the old half-width duo positions). `MazeSimulation`
lost its `novCohort`/`novCrashMarkers`/`novArchive`/`NoveltySearch`/
`novPopulation` state entirely — it is now a close structural mirror of
`TrackRunnerSimulation` (one cohort, one set of crash markers, one round).
`MazeDuoView` was renamed `MazeView` and reduced to drawing one lens; the
`MazeLensFrame`/`MazeDuoFrame` types collapsed into a single `MazeFrame`.
`MAZE_PRESET.objectiveGa` was renamed to `.ga` (no longer needs disambiguating
from a second config) and `.novelty` was deleted from the demo preset
entirely — `NoveltySearch` still runs on this identical maze, just via its
own independent config, exactly as it already did in
`src/headless/runExperiment.ts`'s `MAZE_NOVELTY_CONFIG` (`--study
maze-deception`) and in `test/maze.test.ts`/`test/novelty.test.ts`'s own
locally-defined configs — none of those needed to change, since they never
depended on the demo preset to begin with.
**Consequences.** Nothing about `NoveltySearch` itself, its test coverage, or
its role in the headless maze-deception study changed — this ADR is scoped
entirely to what `main.ts` renders. The plate's footnote was rewritten to
describe the single objective maze in plain terms (the dead-end fork that
looks closer but isn't) and to note, for anyone reading the code, that
Novelty Search still runs on the identical environment via `--study
maze-deception` — the demo just no longer shows it. `MAZE_LENS_RADIUS`/
`MAZE_OBJECTIVE_CENTER`/`MAZE_NOVELTY_CENTER` were removed from
`src/render/layout.ts` as dead geometry once the duo layout was gone.
`docs/ENVIRONMENTS.md`'s Tier 2 §7 spec is unchanged (it describes the built
capability, both paradigms, faithfully) but gained a one-line note that the
live demo currently renders only the objective side. Full suite (147/147,
`tsc --noEmit`, `npm run build`) green throughout; verified in the browser via
the `step` button across several generations — the champion's trail reaches
the goal and the crash-marker cloud visibly sits at the trap fork rather than
scattered randomly, same as it did with the duo layout, just in a single
full-width lens instead of a half-width one.

## ADR-017 — Track Runner and Maze reverted from cohort animation to a single champion
**Context.** Immediately after ADR-015/ADR-016 shipped, the user watched the
cohort version and rejected it plainly: "I don't want 8 or 12 agents there, I
want that one green/amber looking one to start and learn from scratch." This
directly overrides ADR-015's premise (a lone champion can't show *population*
learning). The user's own framing — one highlighted agent, watched
generation over generation — is a different, equally valid way to show
learning: not the population's distribution narrowing, but *one lineage's*
behaviour visibly improving, with its past mistakes still on screen as fading
crash markers. Given clear, repeated, explicit user direction, this
supersedes ADR-015's cohort mechanism on both plates; it is not a quality
finding against that work.
**Decision.** `TrackRunnerSimulation`/`MazeSimulation` dropped their cohort
arrays entirely (`TrackCohortMember[]`/`MazeCohortMember[]` → a single
nullable `TrackChampionState`/`MazeChampionState`). Each generation now runs
exactly one episode: the fittest genome of the just-evaluated population
(`fittest()`, already used elsewhere in `main.ts` — no new helper needed).
Round-pacing, the tick-cap, and crash-marker aging/fading are all unchanged —
those were never about cohort size, they were about the generation counter
and the display describing the same attempt, and about showing failure
history, both of which apply equally to a single agent. `stratifiedSample`
(`src/app/cohort.ts`) lost every caller once both plates stopped needing a
sample size — the function and its dedicated `test/cohort.test.ts` (8 tests,
including the RNG-non-consumption guard from ADR-015) were deleted rather
than kept as unreferenced code. `TrackRunnerView`/`MazeView` simplified to
match: `members: MemberFrame[]` → `member: MemberFrame`, `isChampion` and the
non-champion dim-dot rendering path removed (dead once a frame only ever
carries the champion), and the "X / Y completed a lap" / "X / Y reached
goal" fraction readouts — which read oddly with a denominator of 1 — replaced
with a plain status string (`"driving"` / `"completed a lap"` / `"crashed"`
for Track Runner; `"exploring"` / `"reached goal"` / `"crashed"` /
`"timed out"` for Maze). `COHORT_DOT_RADIUS` (`src/render/layout.ts`) was
removed alongside the rendering path that used it.
**Consequences.** Both plates now show exactly the "one coloured agent
learning from scratch, mistakes visibly persisting and fading" experience the
user asked for — verified in the browser via the `step` button: Track
Runner's single moss champion completing laps by generation 15 with an empty
crash trail on a clean run; Maze's champion reaching the goal by generation 8
with its trail tracing the corridor. Test count dropped from 147 to 139 (the
8 cohort-sampling tests deleted, no replacements needed — `stratifiedSample`
no longer exists to test); `tsc --noEmit` and `npm run build` stayed green
throughout. `docs/ENVIRONMENTS.md`'s render notes for Track Runner and Maze
were corrected in the same pass to describe the single-champion display.

## ADR-018 — Track Runner and Maze animate three roles (champion/median/worst), plus a "vs. generation 1" headline stat
**Context.** Immediately after ADR-017 shipped (single champion only), the
user asked directly whether the demo actually shows a working neuroevolution
engine, then said plainly it "does not sell it well enough." Asked what
specifically felt weak, they picked two things: no clear before/after, and
the numbers weren't compelling. They then separately suggested bringing back
multiple simultaneous agents, on the condition that this time they "look
good and do their role properly" — i.e. not an anonymous crowd (ADR-015's
rejected version), but agents that each mean something.
**Decision.** Both plates now animate exactly three roles each generation —
`champion` (rank 0 by fitness), `median` (the middle-ranked genome), and
`worst` (the lowest-ranked) — via a new `pickRoles()` helper (`main.ts`,
pure sort + index, no randomness, no new module: this is a fixed 3-role pick,
not a parameterised cohort, so it doesn't warrant the kind of dedicated
testable module `stratifiedSample` was). Each role gets a fixed colour
(`roleColor`/`roleTrailRgb`, `render/views.ts`) — champion moss, median
amber, worst the same rust already used for crash markers — and is drawn
champion-last so it's never occluded by the other two. This directly shows
the population's *spread*: early generations, all three cluster near the
start/trap; later, the champion pulls ahead while median and worst still
fail; eventually even the weak end starts succeeding — the "before/after"
the user asked for, visible within a single generation's frame rather than
requiring a multi-generation memory. Separately, both `Simulation`s now track
`baselineFitness` (generation 1's best, captured once) and compute a "vs.
generation 1" multiplier every generation, rendered as `Readout.tertiary` —
already the slot `CoevolutionSimulation` uses for its dominance-fraction
headline stat, so this reuses an existing convention rather than inventing a
new readout field. `index.html` gained a `.readout-highlight` CSS class
(bold, 13px, moss) and `renderReadout()` in `main.ts` renders `tertiary`
through it — answering "are the numbers compelling" for every plate that
sets a tertiary stat, not just these two.
**Consequences.** Verified in the browser: Track Runner generation 15 showed
"1.2× vs. generation 1" with the champion (moss) having completed a lap,
median (amber) partway around, and worst (rust) marked where it crashed, all
visibly at different points on the ring; Maze generation 10 showed "1.7× vs.
generation 1" with the champion having reached the goal while median and
worst were both still stuck near the dead-end trap fork. `TrackRunnerFrame`/
`MazeFrame` went back to `members: MemberFrame[]` (this time carrying a
`role: Role` tag, not the anonymous `isChampion: boolean` ADR-017 removed) —
not a reversion to ADR-015's rejected cohort design, since the count is
fixed at exactly 3 and each one is meaningfully labelled, not an arbitrary
N anonymous dots. Full suite (139/139), `tsc --noEmit`, and `npm run build`
stayed green throughout.

## ADR-019 — A third "worst" fitness line, and a discoverable info card
**Context.** Two follow-up requests after ADR-018 shipped. First, the user
noticed the fitness sparkline only ever plotted best and average — with a
"worst" role now animated on screen, there was no matching line for it in
the chart, even though `PopulationStats.worst` had been computed and unused
since `core/stats.ts` was written. Second, the user asked for a discoverable
"i" info affordance explaining, in general terms, what a neuroevolution
engine is, plus a per-plate explanation of what's on screen and how to read
its progress.
**Decision (worst line).** `drawSparkline` (`render/palette.ts`) took an
optional third `worsts` series, drawn in the same rust tone as crash
markers; its min/max range calculation was widened to cover all three series
(previously `min` came only from `averages`, which silently assumed nothing
plotted would ever fall below the average line — no longer true once worst
is added). `fitnessInset` (`render/views.ts`) grew an optional `showWorst`
flag, defaulting `false` so Weasel/TSP's charts are unchanged (their
one-shot fitness has no animated "worst" role on screen to pair the line
with); Track Runner and Maze pass `true`.
**Decision (info card).** A small circular "i" button next to the title
opens a modal (`#infoOverlay`, `render/../main.ts` template + `index.html`
CSS), positioned as a sibling of `.scale-root` rather than a descendant —
deliberately, since `.scale-root` carries a CSS `transform` for viewport
scale-to-fit, and a `position: fixed` descendant of a transformed ancestor
resolves against that ancestor's box instead of the viewport (a real CSS
gotcha, not a hypothetical one). The card has two parts: a fixed
`NEUROEVOLUTION_PRIMER` constant (genome/population/fitness/generation/
mutation/crossover/selection, and why the same core code runs every plate),
and a per-plate section that **reuses each `EnvironmentOption.footnote`**
verbatim rather than maintaining separate content — `load()` already writes
`footnote.textContent` on every tab switch, so it writes `infoPlateBody`
alongside it for free, keeping the two permanently in sync. Closes on the ×
button, a backdrop click, or Escape.
**Consequences.** Verified in the browser: Track Runner and Maze's insets
now show three lines (green/amber/rust); the info card opens with the
primer plus the active plate's footnote, updates correctly when switching
tabs while it's open, and closes via all three affordances, on a fresh tab
with zero console errors. `tsc --noEmit`, `npx vitest run` (139/139
unaffected — no test exercised `drawSparkline`'s exact line count or the new
DOM elements, so none needed updating), and `npm run build` all green.
