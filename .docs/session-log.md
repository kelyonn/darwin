# Session Log

Newest first. One entry per working session: what changed, decisions, next step.

## Session 3 — M9 predator–prey, engine + live demo
- **Built the co-evolution engine.** Extracted `core/breeding.ts` (tournament + elitism,
  shared by the GA and the new driver; RNG order preserved). Added `search/coevolution.ts`
  (`CoevolutionDriver` — a distinct driver, not a `SearchStrategy`; Hall of Fame, shared
  sampling, competitive fitness sharing, graded closeness payoff) and
  `environments/predatorPrey.ts` (shared-world contest scoring both sides).
- **Wired the demo.** Generalised `main.ts` to a `Simulation` interface with two adapters
  (`GaSimulation`, `CoevolutionSimulation`); added `PredatorPreyView` (live arena + CIAO
  heatmap) and `drawCaptureRateChart`. Predator–prey is now the default landing view.
- **Diagnosed and fixed disengagement.** First run pinned capture rate at ~93% with the
  prey gradient collapsing. Retuned to the life–dinner principle (prey slightly faster and
  more manoeuvrable); measured mean capture ~44% over 120 generations. Verified live in the
  browser with no console errors.
- **Decisions:** ADR-004 (driver ≠ SearchStrategy), ADR-005 (shared breeding), ADR-006
  (Simulation adapter layer).
- **Tests:** 61/61 passing across 11 files; `tsc --noEmit` clean.
- **Next:** host the static bundle; then M10 or a dominance-tournament progress metric.

## Sessions 1–2 — foundation through M7
- M0 toolchain; M1 core engine (rng, Genome/SearchStrategy, GA, stats); M2 Weasel; M3
  Landscape + TSP; M4 matrix + network + XOR; M5 cart-pole; M7 observability (selector,
  canvas views, fitness chart, `Runner`). Decisions ADR-001…003. Committed as the initial
  16-commit history.
