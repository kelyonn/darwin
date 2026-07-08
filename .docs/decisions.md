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
