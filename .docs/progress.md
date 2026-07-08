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
| M6 | Track runner (raycast sensors; held-out tracks) | ⬜ | die on wall; progress-led fitness `checkpoints·K + distance` |
| M8 | Performance pass (typed-array reuse, worker, `kernel/cpu.ts`) | ◐ partial | Float32Array weights already in `network.ts`/`matrix.ts`; buffer pooling + worker + measured 60 FPS numbers remain |
| M9 | Predator–prey + `search/coevolution.ts` (Hall of Fame, sampling, sharing) | ✅ done | `CoevolutionDriver` + `predatorPrey.ts`; 11 tests: pure fitness-sharing math, driver reproducibility, complementary contest scoring. CIAO plot + browser render wiring deferred |
| M10 | Maze + `search/novelty.ts`; Gait + `search/mapElites.ts` | ⬜ | proves the selection-pressure axis |
| M11 | `headless/runExperiment.ts` — batch runner | ⬜ | research substrate (RESEARCH.md §7) |
| M12 | Scale: `kernel/gpu.ts` (WebGPU) + `kernel/wasm.ts`; three-backend benchmark | ⬜ | large, separate effort; measure — never fabricate (PRD §8) |

Test status: **61 passing** across 11 files. Typecheck clean under full strict mode. Suite runs in ~6s.

## Current focus
M9 (predator–prey co-evolution) is complete: a distinct `CoevolutionDriver` under
`src/search/` drives two populations with shared-sampling opponents, a Hall of Fame, and
competitive fitness sharing (Rosin & Belew), plus a graded closeness payoff that keeps a
gradient before the first capture (defends against disengagement). It shares `core/breeding.ts`
with the GA but not the `SearchStrategy` contract.

Two M9 follow-ups remain before it is demo-complete:
1. **Browser wiring** — `predatorPrey.ts` exposes `createEpisode()` but is not yet wired into
   `main.ts`/`views.ts` as a selectable landing view (kept separate to protect the green demo).
2. **CIAO plot** — the champion archives exist in the driver; the plot itself (RESEARCH.md §4.5)
   is unbuilt.

## Next
M10 — Maze + `search/novelty.ts` and Gait + `search/mapElites.ts`, proving the
selection-pressure axis end to end. Or close out the two M9 follow-ups first for a
demoable arms race.
