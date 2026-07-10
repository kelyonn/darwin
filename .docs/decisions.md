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
