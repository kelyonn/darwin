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
