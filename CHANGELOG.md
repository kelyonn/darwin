# Changelog

All notable changes to Project Darwin. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
unreleased, so entries are grouped by milestone rather than version.

## [Unreleased]

### Added — M9 predator–prey co-evolution
- `core/breeding.ts`: shared tournament selection + elitism, reused by the GA and the
  coevolution driver.
- `search/coevolution.ts`: `CoevolutionDriver` (a distinct driver, not a `SearchStrategy`)
  with a Hall of Fame, shared opponent sampling, and competitive fitness sharing, plus the
  pure `competitiveFitnessSharing` helper.
- `environments/predatorPrey.ts`: two-population shared-world contest environment.
- `render/views.ts`: `PredatorPreyView` — live arena and CIAO heat-map plot.
- `render/chart.ts`: `drawCaptureRateChart` — the arms-race pulse.
- `main.ts`: `Simulation` interface with `GaSimulation` and `CoevolutionSimulation`
  adapters; predator–prey is the default landing view.
- 11 tests covering fitness-sharing maths, driver reproducibility, and contest scoring.

### Changed
- `core/ga.ts` now delegates breeding to `core/breeding.ts` (RNG draw order preserved;
  seeded runs remain byte-identical).
- Rebalanced predator–prey to the life–dinner principle (prey faster/more manoeuvrable)
  so the arms race stays engaged (~25–45% capture) instead of the predator dominating.

### Earlier (M0–M7)
- Toolchain; core engine (seeded RNG, Genome/SearchStrategy, generational GA, stats);
  Weasel, Landscape, TSP, XOR, cart-pole environments; hand-written matrix + network;
  observability (environment selector, per-env canvas views, fitness chart, `Runner`).
