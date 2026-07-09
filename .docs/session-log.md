# Session Log

Newest first. One entry per working session: what changed, decisions, next step.

## Session 5 — specimen-plate visual redesign
- **Implemented a Claude Design handoff.** A design mockup
  (`project-darwin-design-system/`, a Claude Design HTML/CSS/JS export) specified a
  "field-guide specimen plate" visual language — paper/ink palette, a circular lens
  viewport per environment, radial leader-line annotations, and a bottom-right inset
  panel (fitness sparkline, CIAO heat map, or MAP-Elites archive heat map depending on
  the environment) — replacing the original dark dashboard UI. Ported pixel-for-pixel
  into the real engine's rendering layer rather than the mockup's own duplicate engine.
- **`src/render/palette.ts` (new):** shared palette (paper/ink/moss/amber) and drawing
  primitives (`dot`, `inkAgent`, `annotate`, `drawLens`, `drawInsetPanel`,
  `drawSparkline`, `heatColor`). `src/render/chart.ts` deleted — its role is now the
  inset sparkline.
- **`src/render/views.ts` rewritten** to draw full 1180×740 plates: all nine
  environments (Weasel, Landscape, TSP, Cart-pole, Track Runner, XOR, Predator–Prey,
  Maze, Gait) now render in the specimen-plate style. XOR is newly wired in (was
  implemented but not on the menu); the maze's objective and novelty runs are now one
  combined dual-lens tab instead of two separate menu entries.
- **`Network.inspect()` added** (`src/core/network.ts`) — a read-only
  `{ layerSizes, layers, weights }` snapshot so the render layer can draw the XOR
  wiring diagram without `core/` exposing mutable internals. `XOR_CASES` exported from
  `xor.ts` so the truth-table view reuses the environment's own case data instead of
  duplicating it.
- **`src/main.ts` rewritten**: single 1180×740 stage canvas (no separate chart canvas);
  header block + roman-numeral tab bar + plate frame + footnote paragraph, matching the
  mockup's DOM structure; `Simulation.meta` (a free-text string) replaced with a
  structured `Readout` (`generation`, `metricLabel`/`metricValue`,
  optional `secondary`) so the top-right overlay can be driven declaratively. Added a
  `MazeSimulation` adapter that advances a `GenerationalGA` and a `NoveltySearch`
  population together on the same maze topology.
- **`index.html`** swapped from the dark indigo theme to the paper background +
  JetBrains Mono font import the design specifies.
- **Verified in-browser** (see .claude/launch.json — `autoPort: true` added so a second
  concurrent dev-server session doesn't collide on port 5199): all nine tabs render
  correctly with no console errors — predator–prey chase + CIAO inset, Weasel's
  alphabet ring, Landscape's Rastrigin heatmap, TSP route, cart-pole, the track ring,
  the maze's dual lens with the novelty scatter, the MAP-Elites archive heat map, and
  the XOR wiring diagram + live truth table.
- **Tests:** 82/82 passing, unchanged (no render-layer tests existed before or after);
  `tsc --noEmit` clean.
- **Next:** the design handoff files (`project-darwin-design-system/`, `Project Darwin
  Design System-handoff.zip`) are still sitting in the repo root, untracked — ask the
  user whether to delete them or keep them for reference before committing.

## Session 4 — M6 track runner, M10 novelty search + MAP-Elites
- **M6 built.** `environments/trackrunner.ts`: a ring track, 5-ray sensors, progress-led
  fitness (`checkpoints·K + distance`). Reused the episodic pattern from cart-pole. Verified
  climbing on screen (best 315 by generation 22).
- **M10 engine built.** `Genome.behaviour` added as a true optional property (ADR-007 —
  `exactOptionalPropertyTypes` forbids `T | undefined`, needs a real optional field).
  `search/novelty.ts` (`NoveltySearch`): an ordinary `SearchStrategy` that replaces objective
  fitness with mean distance to the k nearest behaviours in the population + a growing
  archive. `search/mapElites.ts` (`MapElites`): a third kind of driver — grows a
  behaviour-indexed archive of elites instead of consuming/returning a population.
  `environments/maze.ts` (serpentine corridor + a dead-end trap, BFS-verified solvable) and
  `environments/gait.ts` (deliberately minimal point-mass + spring-leg hopper, not a
  rigid-body engine — a scope decision, see known-issues.md) supply behaviour descriptors
  to both.
- **M10 wired and verified.** `MazeView`, `GaitArchiveView`, and a new `MapElitesSimulation`
  adapter (`Simulation`'s third implementation — confirms the adapter pattern generalises).
  All four new menu entries (track runner, maze × objective, maze × novelty, gait archive)
  verified rendering in the browser with no console errors; MAP-Elites filled 58 archive
  cells in a short run.
- **Measured the maze's deception rather than assuming it.** Headless comparison across 3
  seeds showed objective GA and Novelty Search perform comparably on this maze topology —
  the classic Lehman & Stanley separation didn't reproduce strongly. Added a dead-end pocket
  and tightened the step budget, re-measured once, then stopped tuning (time budget) rather
  than iterate indefinitely. UI labels were corrected to describe the mechanism honestly
  instead of overclaiming the outcome. Documented in `known-issues.md` and
  `implementation-roadmap.md`.
- **Tests:** 82/82 passing across 16 files (up from 61/11); `tsc --noEmit` clean.
- **Next:** host the static bundle, or M11 (`headless/runExperiment.ts`) to unblock the
  RESEARCH.md §7 cross-representation study.

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
