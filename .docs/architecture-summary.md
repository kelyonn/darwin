# Architecture Summary

A one-page map of the codebase. The authoritative spec is `docs/ARCHITECTURE.md`;
this is the fast orientation for a new session.

## The three decoupled axes
| Axis | Contract | Lives in |
|---|---|---|
| Representation (what evolves) | `Genome` | `src/core/genome.ts` |
| Problem (what is solved) | `Environment` | `src/environments/Environment.ts` |
| Selection pressure (how search runs) | `SearchStrategy` (+ the distinct `CoevolutionDriver`) | `src/core/search.ts`, `src/search/` |

## Dependency direction (hard rule)
`environments/` → `core/` + `genomes/` + `search/`. `core/` imports nothing else
in the project. `render/`, `app/`, and `main.ts` are entry-side and may compose
everything. `search/` imports only `core/` (it stays genome-blind; the coevolution
driver takes an injected `CompeteFn` rather than importing an environment).

## Module map
```
src/core/     rng · genome · search · ga · breeding · stats · matrix · network   (imports nothing else)
src/genomes/  stringGenome · vectorGenome · permutationGenome
src/search/   coevolution (CoevolutionDriver: Hall of Fame, shared sampling, fitness sharing)
src/environments/  Environment · weasel · landscape · tsp · xor · cartpole · predatorPrey
src/app/      runner (single generation; ADR-003)
src/render/   chart (fitness + capture-rate) · views (per-env canvas, incl. arena + CIAO)
src/main.ts   Simulation interface + GaSimulation / CoevolutionSimulation adapters; env selector
```

## Key flows
- **Single-population loop:** `Runner.advance()` → `SearchStrategy.step(pop, evaluate)`
  scores `pop` in place, returns unevaluated children. Stats/best are read from the
  *incoming* array (ADR-003).
- **Co-evolution loop:** `CoevolutionDriver.step(state)` → `{ next, stats }` over
  `{ predators, prey }`. Both populations scored against a shared opponent sample +
  Hall of Fame; fitness = graded closeness payoff + competitive fitness sharing.
- **Render:** `main.ts`'s loop calls `Simulation.advance()` (evolve one generation)
  and `Simulation.frame()` (per-frame animation), oblivious to which driver is behind it.

## Reproducibility
One seeded `Rng` (Mulberry32) per run; every stochastic choice draws from it. No
`Math.random()` in `core/`, `genomes/`, or `search/`. Same seed → byte-identical run.
