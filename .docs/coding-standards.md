# Coding Standards

The rules every change is held to. These refine, never contradict, the specs.

## TypeScript
- Full `strict` plus `noUncheckedIndexedAccess` and friends (see `tsconfig.json`);
  never weaken a strictness flag to make code compile.
- Indexed access is `T | undefined`. Guard it, or assert `as T` with a short comment
  justifying why the index is in bounds (see `matrix.ts`, `network.ts`, the driver).
- ESM everywhere; imports use explicit `.js` extensions (TS `moduleResolution`).

## Style
- No magic numbers — name every constant with a unit/meaning.
- No dead code, no commented-out code, no `TODO`s unless explicitly requested.
- Meaningful names; readability over cleverness; keep files cohesive.
- JSDoc on public API, citing the spec section it implements where relevant.
- SOLID where it helps, without overengineering. Refactor when it removes duplication
  (e.g. `core/breeding.ts` shared by the GA and the driver — ADR-005).

## Determinism (non-negotiable)
- All randomness flows through one seeded `Rng`. Never `Math.random()` in `core/`,
  `genomes/`, or `search/`.
- Genetic operators return new instances; genomes are immutable except `fitness`.
- Preserve RNG draw order when refactoring shared code, or seeded runs diverge.

## Fitness (PRD §6)
- Guard every denominator: `1/(1+cost)`, never `1/cost`.
- Progress dominates efficiency; efficiency is only a tiebreaker once the task is
  substantially solved. No score may be maximised by a do-nothing agent.

## Testing
- Unit-test the maths (matrix, network, fitness sharing) *independently* of evolution.
- Every new operator gets validity/edge-case coverage (esp. permutation OX/PMX).
- Seeded reproducibility is a tested invariant, not an assumption.

## Boundaries
- `core/` imports nothing else in the project. `search/` imports only `core/`.
- Environments may cast to their own genome type in `evaluate`; core never casts.
- `Network.feedForward` returns an internal buffer — read it before the next call.
