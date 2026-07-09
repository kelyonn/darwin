# Progress

Milestone status. Each milestone is independently testable and ends with
something running.

| M | Deliverable | Status | Verified by |
|---|---|---|---|
| M0 | Toolchain: Vite + TS `strict`, Vitest, dir skeleton, `.gitignore` | ✅ done | `npm run dev` boots; `tsc --noEmit` clean |
| M1 | `core/`: rng, Genome, SearchStrategy, GenerationalGA, stats | ✅ done | `ga.test.ts`, `rng.test.ts` — reproducibility + elitism-never-regresses |
| M2 | Weasel (`stringGenome` + `weasel.ts` + render loop) | ✅ done | verified evolving on screen to "PROJECT DARWIN" |
| M3 | Landscape (`vectorGenome`, Rastrigin) + TSP (`permutationGenome`, order crossover) | ✅ done | one unchanged GA optimises both; OX validity across 200 seeds |
| M4 | `matrix` + `network` + XOR | ✅ done | matrix/network unit-tested in isolation; XOR solved + all 4 cases classified |
| M5 | Cart-pole (episodic + sim/render split) | ✅ done | balances varied starts, improves over generations, reproducible |
| M7 | Observability: canvas views per env, selector, fitness chart, `Runner` | ✅ done | all 4 environments render; verified on screen |
| M6 | Track runner (raycast sensors) | ✅ done | ring track, 5-ray sensors, `checkpoints·K + distance`; verified climbing on screen (best 315 by gen 22) |
| M8 | Performance pass (typed-array reuse, worker, `kernel/cpu.ts`) | ◐ partial | Float32Array weights already in `network.ts`/`matrix.ts`; buffer pooling + worker + measured 60 FPS numbers remain |
| M9 | Predator–prey + `search/coevolution.ts` (Hall of Fame, sampling, sharing) + CIAO plot + browser view | ✅ done | `CoevolutionDriver` + `predatorPrey.ts`; 11 tests. Wired as the default landing view via a `Simulation` adapter in `main.ts`; live arena + CIAO heatmap + capture-rate pulse. Verified on screen: capture rate oscillates ~25–45% (engaged arms race) |
| M10 | Maze + `search/novelty.ts`; Gait + `search/mapElites.ts` | ✅ done | both wired and verified on screen (see below) |
| M11 | `headless/runExperiment.ts` — batch runner | ⬜ | research substrate (RESEARCH.md §7) |
| M12 | Scale: `kernel/gpu.ts` (WebGPU) + `kernel/wasm.ts`; three-backend benchmark | ⬜ | large, separate effort; measure — never fabricate (PRD §8) |

Test status: **82 passing** across 16 files. Typecheck clean under full strict mode. Suite runs in ~10s.

## Current focus
M6, M9, and M10 are all **complete and demoable**.

**M9** (predator–prey co-evolution): a distinct `CoevolutionDriver` drives two populations with
shared-sampling opponents, a Hall of Fame, and competitive fitness sharing (Rosin & Belew), plus a
graded closeness payoff that keeps a gradient before the first capture (defends against
disengagement). It shares `core/breeding.ts` with the GA but not the `SearchStrategy` contract. It
is the default landing view (PRD §14): live arena + CIAO heatmap + capture-rate pulse. Balance
tuned to the life–dinner principle (prey slightly faster/more manoeuvrable) so the race stays
engaged (~25–45% capture) instead of the predators trivially dominating.

**M10** (selection-pressure axis): `search/novelty.ts` (`NoveltySearch`) is an ordinary
`SearchStrategy` — only the scoring changes (behavioural distance instead of the objective), which
is itself evidence the third axis is real: no core change was needed to swap it in. `search/mapElites.ts`
(`MapElites`) is a third kind of driver (neither `SearchStrategy` nor `CoevolutionDriver`): it grows
an archive indexed by behaviour descriptor instead of consuming/returning a population.
`environments/maze.ts` and `environments/gait.ts` (a deliberately minimal hand-written spring-leg
hopper, *not* a rigid-body engine — see known-issues.md) supply both. All wired into `main.ts` and
verified rendering with no console errors: track runner, maze (both objective and novelty variants),
and the MAP-Elites archive heatmap (58 cells filled after a short run).

**Known caveat (measured, not fabricated):** the maze's dead-end trap does not reliably beat
objective GA within a modest generation budget in headless measurement (objective plateaus ~0.69
proximity regardless of seed; novelty is statistically comparable, not clearly ahead). The demo is
honestly labelled to reflect this rather than overclaiming the classic Lehman & Stanley result — see
known-issues.md. The environment still correctly demonstrates the *architectural* point (swap the
search paradigm, zero core changes) even where the *behavioural* contrast is weaker than textbook.

## Next
Host the static bundle (highest real-world value) and/or M11 (`headless/runExperiment.ts`) to
enable the batch research runs described in RESEARCH.md §7.
