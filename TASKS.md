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

## Next up
- [ ] Host the static bundle (GitHub Pages / Netlify) and add the demo link to `README.md`
- [ ] Record an arms-race GIF for the README first screenful
- [ ] Dominance-tournament / frozen-benchmark absolute progress metric
- [ ] M11 headless batch runner (needed for RESEARCH.md §7)

## Later
- [ ] M8 performance pass (buffer pooling, Web Worker, measured 60 FPS)
- [ ] M12 WebGPU + Rust→WASM three-backend benchmark
- [ ] R: cross-representation coevolution study (RESEARCH.md H1/H2)
- [ ] Revisit maze deceptiveness with a harder topology if using it as a research/interview claim
