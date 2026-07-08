# Implementation Roadmap

Milestones in dependency order. Each is independently testable and ends with
something running. Status detail lives in `progress.md`; this is the plan and the
rationale. Milestone numbering follows the PRD build sequence (§13).

| M | Deliverable | Depends on | Status |
|---|---|---|---|
| M0 | Toolchain (Vite, TS strict, Vitest, skeleton) | — | ✅ |
| M1 | Core: rng, Genome, SearchStrategy, GA, stats | M0 | ✅ |
| M2 | Weasel (string genome) — first thing on screen | M1 | ✅ |
| M3 | Landscape (vector) + TSP (permutation) | M1 | ✅ |
| M4 | Matrix + Network + XOR (first neural net) | M1 | ✅ |
| M5 | Cart-pole (episodic + sim/render split) | M4 | ✅ |
| M7 | Observability: selector, canvas views, fitness chart, Runner | M2–M5 | ✅ |
| M9 | Predator–prey co-evolution + `search/coevolution.ts` + CIAO plot + live view | M4, M7 | ✅ |
| M6 | Track runner (raycast sensors; held-out tracks) | M4, M7 | ⬜ |
| M8 | Perf pass: buffer pooling, Web Worker, measured 60 FPS (`kernel/cpu.ts`) | M5 | ◐ partial |
| M10 | Maze + `search/novelty.ts`; Gait + `search/mapElites.ts` | M4, M9 | ⬜ |
| M11 | `headless/runExperiment.ts` — batch research runner | M9, M10 | ⬜ |
| M12 | Scale: `kernel/gpu.ts` (WebGPU) + `kernel/wasm.ts`; 3-backend benchmark | M8 | ⬜ |
| R  | Cross-representation study (RESEARCH.md H1), ≥30 seeds + stats | M10, M11 | ⬜ |

## Sequencing rationale
- M4 is the pivot: before it the engine is *evolution*, after it it is *neuro*evolution.
- M9 was pulled forward (before M6/M8) as the crown jewel and research substrate.
- M12 (WebGPU + Rust→WASM) is a large, separate effort — its value is the *measured*
  three-backend benchmark, never fabricated numbers (PRD §8).

## Recommended next
1. **Host the static bundle** — highest real-world value; not a milestone but the
   thing that makes the demo shareable.
2. Then M10 (proves the selection-pressure axis end to end) or a dominance-tournament
   progress metric to complement the CIAO plot.
