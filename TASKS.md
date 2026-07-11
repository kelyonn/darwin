# Tasks

Working backlog. Checked items are done; see `progress.md` for milestone-level status
and `future-work.md` for longer-horizon ideas.

## Done
- [x] M0–M7: toolchain, core engine, Weasel, Landscape, TSP, XOR, cart-pole, observability
- [x] M9 engine: `core/breeding.ts`, `search/coevolution.ts`, `environments/predatorPrey.ts`
- [x] M9 demo: `Simulation` adapters, `PredatorPreyView`, CIAO plot, capture-rate chart
- [x] Rebalance predator–prey (life–dinner) and verify live in the browser
- [x] M6: `environments/trackrunner.ts` + `TrackRunnerView`, verified on screen
- [x] M10 engine: `search/novelty.ts`, `search/mapElites.ts`, `environments/maze.ts`, `environments/gait.ts`
- [x] M10 demo: `MazeView`, `GaitArchiveView`, `MapElitesSimulation`; both maze variants + gait archive verified on screen
- [x] Added `Genome.behaviour` (ADR-007) and measured/tuned the maze's deceptiveness (see known-issues.md)
- [x] Full memory-doc suite
- [x] Fixed population-average plateau via eliteCount (ADR-008), on Landscape/TSP/cart-pole/track runner/maze-objective
- [x] Fixed track runner's reward-hacking exploit via tent-weighted radius reward (ADR-009)
- [x] Fixed maze deception via episode-ending wall collision (ADR-010) — verified across 3 seeds, trails added
- [x] Fixed XOR's misleading readout via a `cases solved n/4` signal (ADR-011) — verified 10/10 seeds
- [x] Specimen-plate visual redesign (all 9 plates) + scale-to-fit viewport (no scroll)
- [x] Ship-readiness: thesis-first README rewrite, CI + GitHub Pages deploy workflows, removed debug traces from `public/`
- [x] M11 headless batch runner (`src/headless/runExperiment.ts`, `npm run experiment`) — zero new deps, reproducibility-tested
- [x] M8 measurement (`src/headless/runBench.ts`, `npm run bench`) — measured finding: evaluation dominates, buffer pooling not warranted
- [x] Dominance-tournament progress metric (`dominanceCount`) on the predator–prey plate

## Next up
- [ ] Enable GitHub Pages in repo settings (so `deploy.yml` publishes), then put the real URL in `README.md`
- [ ] Record an arms-race GIF for the README first screenful
- [ ] Frozen-benchmark probe (a fixed reference opponent) to complement the dominance count
- [ ] RESEARCH.md H1 cross-representation study as a `--study` mode on the headless runner

## Later
- [ ] M8 remainder: Web Worker (episodic sims off render thread) + in-browser 60-FPS-at-scale number
- [ ] M12 WebGPU + Rust→WASM three-backend benchmark
- [ ] R: cross-representation coevolution study (RESEARCH.md H1/H2)
- [ ] If ever needed for a research/interview claim: escalate the maze to reliably fail objective (would need a substantially larger/more complex maze — explicitly declined as disproportionate this session, see ADR-010)
