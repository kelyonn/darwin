# Changelog

All notable changes to Project Darwin. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
unreleased, so entries are grouped by milestone rather than version.

## [Unreleased]

### Added — M11 headless batch runner
- `src/headless/runExperiment.ts`: a DOM-free CLI that drives the same
  representation-blind `core/` + `search/` code across many seeds, emitting tidy
  long-format CSV/JSON (one row per generation per seed) for the 7 GA-driven
  environments. The substrate the RESEARCH.md §7 cross-representation study needs.
- Runs under Node's native TypeScript with **zero new dependencies**:
  `--experimental-transform-types` plus `scripts/ts-import-hook.mjs`, a ~15-line
  resolver mapping the source tree's `.js` specifiers onto the `.ts` files.
- `npm run experiment -- --env <name|all> [--seeds 0-4] [--generations N] [--format csv|json]`.
- `test/headless.test.ts`: byte-identical reproducibility + well-formed output.

### Added — M8 performance measurement (and the finding: no pooling needed)
- `src/headless/runBench.ts` (`npm run bench`): reports *measured* gens/sec and
  genome-allocs/gen at population 100–3000 for one-shot and episodic environments.
- Finding (recorded in `.docs/known-issues.md`): evaluation dominates, not
  allocation — a vector genome runs ~4–5× faster than the tiny XOR network with
  identical allocation counts, and episodic cart-pole is ~30× slower still.
  `feedForward` is already zero-alloc, so buffer pooling was deliberately **not**
  implemented (it would optimise the cheapest part). No fabricated numbers (PRD §8).

### Added — dominance-tournament progress metric
- `dominanceCount(ciaoRow)` in `search/coevolution.ts`: how many ancestral prey
  champions the current predator champion catches (payoff > 0.5), read for free
  from the CIAO row. An absolute progress proxy since coevolutionary fitness is
  relative and unreadable across generations (RESEARCH.md §4.5).
- Surfaced as a third readout line ("dominates N/M ancestors") on the predator–prey
  plate; `Readout` gained an optional `tertiary` line. 4 tests in `coevolution.test.ts`.

### Added — ship-readiness
- README rewritten thesis-first with an accurate plate table (was still claiming
  "Working today: Weasel"); keeps the honest maze caveat.
- `.github/workflows/ci.yml` (typecheck + test + build) and `deploy.yml`
  (build → GitHub Pages on `main`).

### Fixed — debug traces would have shipped to production
- Removed `public/maze_trace.json` and `public/track_trace.json`: Vite copies
  `public/` verbatim into `dist/`, so these headless debug traces would have been
  published on the live site. `.gitignore` now excludes `*_trace.json` / `scratchpad*`.

### Added — XOR "cases solved" signal
- `GaSimulation` gained an optional `secondaryMetric(champion) => {label, value}`
  callback (computed from the champion genome, not just its fitness scalar) —
  additive, every other environment using `GaSimulation` is unaffected.
- XOR now shows `cases solved: n/4` in both the shared readout and a prominent
  on-canvas badge in `XorView`, flipping to 4/4 the instant the network is
  actually correct — independent of the sigmoid's asymptotic fitness decimal,
  which could read "3.8 / 4" forever even on a fully-correct network.
- `test/xor.test.ts`: multi-seed regression (10/10) locking in 4/4 reliability
  under the demo's exact config. See `.docs/decisions.md` ADR-011.

### Added — track runner and maze trajectory trails
- `TrackRunnerView` and `MazeDuoView` (both lenses) now draw a fading
  trajectory trail behind the live agent, cleared on every episode restart, so
  a completed lap or maze traversal is visible as a path, not just a moving dot.
- Track runner's readout gained an approximate lap-count secondary metric.

### Fixed — maze: episode-ending collision was the real deception fix
- Three rounds of trap-geometry tuning (repositioning, doubling the trap count,
  tightening the goal radius to 0.2) all failed to stop gen-1 *random* genomes
  from solving the maze — the actual cause: hitting a wall only blocked that
  tick's movement, so an undirected network could keep re-steering indefinitely
  and eventually shuffle through the single connected corridor within the
  episode's ~400-tick budget, almost regardless of trap placement.
- `MazeEnvironment.advance` now ends the episode immediately on wall contact,
  matching cart-pole and track runner. Measured effect: gen-1 random luck now
  fails on 2 of 3 seeds (previously 3 of 3 always succeeded), and the objective
  population shows a genuine, watchable learning curve — fitness climbing from
  0 to solved over roughly 1–5 generations.
- This does not make objective fail outright (elitist search over 150 genomes
  is simply effective at small mazes) — the user was presented this finding and
  chose to ship the verified story: Novelty solves immediately by exploration,
  Objective genuinely learns to avoid two dead ends within a handful of
  generations. See `.docs/decisions.md` ADR-010 for the full trace of all three
  discarded attempts.
- `test/maze.test.ts`: regressions locking in both halves of this story across
  3 seeds each, plus a direct check that an episode ends on wall contact.

### Fixed — track runner reward-hacking exploit
- Root cause (measured, replaying the champion and recording its trajectory):
  fitness counted raw angular sectors crossed, so hugging the track's inner wall
  (smaller circumference) completed more sectors per unit of the fixed
  distance/time budget than genuinely driving the track. The population reliably
  converged on exactly this exploit and plateaued at its theoretical ceiling
  (315), which looked identical to the eliteCount plateau but had a different
  cause.
- A first fix (monotonic radius weighting) was tried, measured, and rejected: it
  only relocated the exploit to the *outer* wall (new ceiling 150). `environments/trackrunner.ts`
  now weights angular progress by a tent function peaking at the track's midline
  and falling to zero at both walls — verified the champion drives centred
  (radius 0.3099–0.3101 against a true midline of 0.31), with fitness settling at
  210, matching the independently-computed theoretical maximum for a genuine lap.
- `test/trackrunner.test.ts`: a regression test asserting the trained champion's
  average radius stays clear of both walls — the test that would have caught
  this originally.
- See `.docs/decisions.md` ADR-009 for the full measured trace, including the
  rejected first attempt.

### Verified — maze and gait genuinely complete their tasks
- In response to a report that environments "aren't finishing," every GA/search
  environment was individually re-checked rather than assumed correct because
  tests pass. Maze's objective champion reaches within 0.45 units of the goal
  (inside the 0.6 solve radius). Gait's best MAP-Elites genome sustains 27+ units
  of real hopping locomotion (a consistent ~46% stance duty factor) when
  replayed beyond its evaluation window — genuine gait, not degenerate flopping.
  No changes needed; findings recorded in `.docs/known-issues.md`.

### Fixed — population-average plateau across GA environments
- Root cause (measured headlessly, not assumed): `eliteCount` at ~1% of
  `populationSize` meant crossover almost never involved a genuinely good parent,
  so population-*average* fitness plateaued hard within ~20 generations regardless
  of mutation tuning, on both vector and network genomes. Raised `eliteCount` to
  ~5–8% on Landscape, TSP, cart-pole, track runner, and the maze's objective side
  — measured 10× (Landscape) and 6× (cart-pole) average-fitness improvement, with
  `best` unaffected (elitism guarantee preserved).
- `core/breeding.ts`: `annealedRate()` and `BreedingConfig.mutationDecay`/
  `minMutationRate` — a geometric cooling schedule for mutation intensity, applied
  in `GenerationalGA` and `CoevolutionDriver`. Built as the initial fix hypothesis;
  shipped as a real, PRD-aligned (§7) secondary refinement, but measurement showed
  it was *not* the actual cause of the plateau — see `.docs/decisions.md` ADR-008.
- `genomes/vectorGenome.ts` / `core/network.ts`: `mutate(rate)` now scales
  perturbation *magnitude* by `rate` (previously only frequency, or a fixed step
  size), so the annealing schedule has something to anneal.
- `test/breeding.test.ts`: annealing determinism and backward-compatibility
  (`mutationDecay` absent/`1` reproduces the unscheduled run byte-for-byte).

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
