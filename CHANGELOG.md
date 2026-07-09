# Changelog

All notable changes to Project Darwin. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
unreleased, so entries are grouped by milestone rather than version.

## [Unreleased]

### Added — M6 track runner
- `environments/trackrunner.ts`: ring track, five-ray sensors, progress-led fitness
  (`checkpoints·K + distance`), reusing the episodic pattern established for cart-pole.
- `render/views.ts`: `TrackRunnerView` — the ring, the car, and its sensor rays.
- 4 tests covering determinism, rejection of non-network genomes, elitism-never-regresses
  over generations, and well-formed live-episode state.

### Added — M10 novelty search + MAP-Elites
- `core/network.ts`: `Genome.behaviour`, a true optional behaviour-descriptor property
  (see ADR-007 on why it can't be `T | undefined` under `exactOptionalPropertyTypes`).
- `search/novelty.ts`: `NoveltySearch`, an ordinary `SearchStrategy` that scores by mean
  distance to the k nearest behaviours in the population plus a growing archive — proof the
  selection-pressure axis is swappable with zero core changes.
- `search/mapElites.ts`: `MapElites`, a third kind of driver (neither `SearchStrategy` nor
  `CoevolutionDriver`) that grows a behaviour-indexed archive of elites instead of
  consuming/returning a fixed population.
- `environments/maze.ts`: a serpentine corridor plus a dead-end trap (BFS-verified
  solvable), supplying `[x, y]` behaviour descriptors and an objective proximity score.
- `environments/gait.ts`: a deliberately minimal point-mass + spring-leg hopper (not a
  rigid-body engine — a scope decision), supplying `[strideLength, dutyFactor]` descriptors.
- `render/views.ts`: `MazeView` (walls, goal, live agent + sensor rays) and
  `GaitArchiveView` (the MAP-Elites archive as a heat map).
- `main.ts`: `MapElitesSimulation`, the third `Simulation` adapter; four new menu entries
  (track runner, maze × objective, maze × novelty, gait archive).
- 14 new tests (trackrunner, coevolution's earlier suite unaffected, novelty, maze,
  mapElites, gait) — 82/82 passing overall, up from 61/11 files to 82/16 files.

### Measured (not fabricated) — M10 maze deception
- Headless comparison across 3 seeds (60 generations, population 150) showed objective GA
  and Novelty Search perform comparably on the maze's current topology — the classic
  Lehman & Stanley separation did not reproduce strongly. A dead-end pocket and a tightened
  step budget were added and re-measured once; UI copy was corrected to describe the
  mechanism honestly rather than claim a guaranteed outcome. Full numbers in
  `.docs/known-issues.md`.

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
