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
| M6 | Track runner (raycast sensors) | ✅ done | ring track, 5-ray sensors, radius-weighted `checkpoints·K + distance` (see ADR-009 — the naive version was reward-hackable); champion verified centred on the track midline, fitness ceiling ~210 matches the computed theoretical max for a genuine lap |
| M8 | Performance pass (typed-array reuse, worker, `kernel/cpu.ts`) | ◐ partial | Float32Array weights already in `network.ts`/`matrix.ts`; buffer pooling + worker + measured 60 FPS numbers remain |
| M9 | Predator–prey + `search/coevolution.ts` (Hall of Fame, sampling, sharing) + CIAO plot + browser view | ✅ done | `CoevolutionDriver` + `predatorPrey.ts`; 11 tests. Wired as the default landing view via a `Simulation` adapter in `main.ts`; live arena + CIAO heatmap + capture-rate pulse. Verified on screen: capture rate oscillates ~25–45% (engaged arms race) |
| M10 | Maze + `search/novelty.ts`; Gait + `search/mapElites.ts` | ✅ done | both wired and verified on screen (see below) |
| M11 | `headless/runExperiment.ts` — batch runner | ⬜ | research substrate (RESEARCH.md §7) |
| M12 | Scale: `kernel/gpu.ts` (WebGPU) + `kernel/wasm.ts`; three-backend benchmark | ⬜ | large, separate effort; measure — never fabricate (PRD §8) |

Test status: **92 passing** across 17 files. Typecheck clean under full strict mode.

## Current focus
M6, M9, and M10 are all **complete and demoable**.

**Track runner reward-hacking fix:** raw angular-sector checkpoints let the population converge
on hugging the inner wall (smaller circumference = cheaper checkpoints), plateauing at a fitness
ceiling that turned out to be exactly the theoretical max for that exploit (315), not genuine
driving skill. A naive monotonic radius weight just relocated the exploit to the outer wall
(measured, then discarded). The fix is a tent-shaped weight peaking at the track's midline —
verified the champion now drives centred (radius 0.3099–0.3101 against a true midline of 0.31),
with a regression test locking this in. A fading trajectory trail + lap-count readout were added
so the lap is watchable, not just numerically correct. Full trace in ADR-009 / known-issues.md.

**Maze — episode-ending collision fix (ADR-010):** what looked like weak deception was actually
that hitting a wall only blocked movement (episode kept going), so undirected random networks
could shuffle through the whole corridor given ~400 ticks regardless of trap count — measured
across three discarded trap-geometry redesigns before finding this. Making a wall hit end the
episode (matching cart-pole/track runner) fixed gen-1 random luck on 2 of 3 seeds and gave the
objective population a genuine, watchable multi-generation learning curve. It does not make
objective fail outright (150-genome elitist search is simply effective at small mazes) — presented
to the user, who chose to ship the verified story as-is: Novelty solves immediately by exploration,
Objective genuinely learns to avoid two dead ends within a handful of generations. Trails added to
both lenses. Full trace in ADR-010 / known-issues.md.

**XOR readout fix (ADR-011):** a fully-correct network could read "3.8 / 4" forever since sigmoid
never outputs exactly 0/1. Added a `cases solved n/4` indicator (readout + on-canvas badge) that
flips to 4/4 the instant the network is actually correct — verified 10/10 seeds reach 4/4 under
the demo's config.

**Verification pass:** in response to a report that several environments "aren't finishing their
tasks," every GA/search-driven environment was individually re-checked (not assumed fine because
tests pass). Landscape and cart-pole were the earlier eliteCount fix; track runner and maze are the
fixes above; gait was confirmed genuinely working (best genome sustains 27+ units of real hopping
locomotion when replayed beyond its evaluation window). See known-issues.md for the full
per-environment findings.

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

## Population-average plateau fix
Several GA environments (Landscape, cart-pole, track runner, maze-objective, TSP) looked
"stuck" — the champion was fine but the population never seemed to visibly improve. Root
cause, found by headless measurement (not assumed): `eliteCount` at ~1% of `populationSize`
meant almost no crossover ever involved a genuinely good parent, pinning the population
*average* regardless of mutation tuning. Raised `eliteCount` to ~5–8% across the affected
environments — measured 10× (Landscape) and 6× (cart-pole) average-fitness improvement, `best`
unaffected. A mutation-annealing schedule (`core/breeding.ts` `annealedRate`,
`mutationDecay`/`minMutationRate`) was also built and shipped as a secondary refinement — real
and PRD-aligned, but *not* the actual fix for this symptom; see ADR-008 and known-issues.md for
the full measured trace and the correction of the original hypothesis.

## Next
Host the static bundle (highest real-world value) and/or M11 (`headless/runExperiment.ts`) to
enable the batch research runs described in RESEARCH.md §7.
