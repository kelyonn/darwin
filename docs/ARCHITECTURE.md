# Project Darwin — Architecture & Working (detailed)

**Companion to the PRD. How the system is layered, how data flows each tick, the exact interfaces, the concurrency and reproducibility model, the testing strategy — and a from-scratch re-evaluation of the implementation language now that development is on an M5 and the project has acquired a research ambition.**

---

## 1. The core principle — three decoupled axes

The PRD decoupled two axes. The research direction (RESEARCH.md) adds a third. The whole architecture is the enforcement of these three independences:

| Axis | Question it answers | Made swappable by |
|---|---|---|
| **Representation** | *What* is being evolved? | the `Genome` interface |
| **Problem** | *What* is being solved? | the `Environment` interface |
| **Selection pressure** | *How* is search driven? | the `SearchStrategy` / driver interface |

If any core module ever needs to know which genome, which environment, or which search paradigm is running, the architecture has failed. The four genome types, the nine environments, and the four search paradigms are all *proof* of these three independences holding simultaneously.

```
        representation-blind          problem-blind            paradigm is itself a module
   ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
   │  Genome interface    │   │  Environment iface   │   │  SearchStrategy iface    │
   │  string / vector /   │   │  weasel … predator   │   │  GenerationalGA /        │
   │  permutation / net   │   │  -prey               │   │  Novelty / MAP-Elites /  │
   └──────────────────────┘   └──────────────────────┘   │  Coevolution / SteadyState│
                                                          └──────────────────────────┘
```

---

## 2. Layered structure & dependency direction

```
src/
├── core/        LAYER A — imports nothing else in the project
│   ├── rng.ts          seeded PRNG (Mulberry32 / xorshift)
│   ├── genome.ts       Genome interface (keystone)
│   ├── network.ts      feed-forward NN implementing Genome (typed arrays)
│   ├── matrix.ts       hand-written matrix math (the hot path)
│   ├── ga.ts           GenerationalGA: select, elitism, breed, replace
│   └── stats.ts        best/avg/worst fitness, diversity metric
│
├── genomes/     Genome implementations that aren't networks
│   ├── stringGenome.ts          permutationGenome.ts
│   └── vectorGenome.ts
│
├── search/      LAYER A — selection paradigms, all genome-blind
│   ├── novelty.ts      behavioural-novelty archive (Novelty Search)
│   ├── mapElites.ts    quality-diversity archive (MAP-Elites)
│   └── coevolution.ts  Hall of Fame, k-opponent sampling, fitness sharing
│
├── kernel/      LAYER A — the feed-forward hot path: one interface, three backends
│   ├── kernel.ts       MatrixKernel interface: evaluate a whole population
│   ├── cpu.ts          Float32Array backend — default, always works, the readable reference
│   ├── wasm.ts         Rust→WASM backend — profiled optimisation of the hot loop
│   └── gpu.ts          WebGPU compute-shader backend — scale to 10k+ agents
│
├── environments/ LAYER B — one file each; import only core/ + genomes/ + search/
│   ├── Environment.ts (interface)   maze.ts        predatorPrey.ts
│   ├── weasel.ts  landscape.ts  tsp.ts  xor.ts  cartpole.ts  trackrunner.ts  gait.ts
│
├── render/      canvas drawing + dashboard; called by main.ts, never by core/
│   ├── canvas.ts       dashboard.ts (incl. CIAO plot, archive heatmap)
│
├── sim/
│   └── worker.ts       Web Worker: evaluation off the render thread
│
├── headless/    NEW — research batch runner (no DOM, no canvas)
│   └── runExperiment.ts   seeds × paradigms × genomes → CSV/JSON, for RESEARCH.md §7
│
└── main.ts      wires environment ↔ search ↔ engine ↔ render ↔ worker
```

**Enforced dependency direction:** `environments/` → `core/` + `genomes/` + `search/`. `render/` and `headless/` are entry-side, called by `main.ts` / the runner, never by `core/`. **`core/` imports nothing else in the project.** This direction *is* the decoupling, and it is a CI-checkable invariant (a lint rule on import paths), not a hope.

---

## 3. The three interfaces

### 3.1 `Genome` (keystone) — owns its own genetics
```ts
interface Genome {
  clone(): Genome;               // deep copy — used for elitism
  mutate(rate: number): Genome;  // genome-specific meaning
  crossover(other: Genome): Genome;
  fitness: number;               // written by Environment / search, read by the driver
  behaviour?: number[];          // optional behaviour descriptor — for novelty & MAP-Elites
}
```
`behaviour` is the only addition the research axis requires of the genome, and it is optional: objective GA ignores it; novelty and MAP-Elites read it. Crossover lives on the genome (not the GA) so the driver never inspects representation internals.

### 3.2 `Environment` — owns evaluation
```ts
interface Environment {
  newPopulation(size: number): Genome[];
  evaluate(genome: Genome): number;   // GA calls this; never knows what happens inside
  render?(best: Genome): void;
}
```
Internally one-shot or episodic — invisible to the driver (PRD §5). For coevolution, `evaluate` takes the opposing sample/Hall-of-Fame as closed-over state the driver supplies.

### 3.3 `SearchStrategy` — owns *how* a generation advances
```ts
interface SearchStrategy {
  step(population: Genome[], evaluate: (g: Genome) => number): Genome[];
  // GenerationalGA: evaluate → sort → select → elitism → breed → replace
  // Novelty:        evaluate against novelty archive instead of objective
  // MAP-Elites:     place into behaviour-indexed archive; return archive elites
  // Coevolution:    two populations, k-sampling + Hall of Fame + fitness sharing
}
```
This interface is the new architectural surface that makes the research possible. `GenerationalGA` is just one implementation; the others are siblings, not special cases.

---

## 4. Working — one tick / one generation, end to end

```
main loop (decoupled clocks — PRD §8):
  ┌─ render clock (60 FPS target) ─────────────────────────────┐
  │   draw current best genome / archive / CIAO plot to canvas │
  └────────────────────────────────────────────────────────────┘
  ┌─ sim clock (as fast as possible) ──────────────────────────┐
  │   SearchStrategy.step(population, env.evaluate):            │
  │     for each genome:                                        │
  │       env.evaluate(genome):                                 │
  │         one-shot  → single pass, score                      │
  │         episodic  → for t in 1..T: out = genome.feedForward(inputs_t)
  │                     step sim; accumulate reward             │
  │       (coevolution: score vs k opponents + Hall of Fame)    │
  │     sort / archive / select per paradigm                    │
  │     elitism: clone() best E unchanged                       │
  │     breed: crossover + mutate via seeded PRNG               │
  │   → next population                                         │
  └────────────────────────────────────────────────────────────┘
```

Render reads the latest best; it never blocks the sim. For episodic/multi-agent environments the `SearchStrategy.step` runs inside the Web Worker (`sim/worker.ts`), posting only the best genome + stats back to the render thread.

---

## 5. Reproducibility model

- **One seeded PRNG, all randomness through it.** Mulberry32/xorshift. Identical seed ⇒ byte-identical run (PRD §14 acceptance criterion). No `Math.random()` anywhere in `core/`, `genomes/`, or `search/` — a grep-able invariant.
- **Why it is load-bearing for research, not just demos:** the ≥30-seed statistical studies (RESEARCH.md §7) require that run *i* is exactly reproducible and that paradigm A and paradigm B can be compared on the *same* seed sequence. Reproducibility is the precondition for any honest benchmark.
- **Stochastic environments** fix the per-generation seed so all genomes face identical conditions, or average over *k* trials (PRD §5).

---

## 6. Concurrency & performance

(Full rationale in PRD §8, "the scale mandate" — M5, scale-until-it-breaks, 60 FPS on a phone.)

- **Typed arrays** (`Float32Array`) for all weights — the single biggest speed/memory lever.
- **Zero-allocation hot loop** — reuse `feedForward` output buffers; pool the population. On an M5 the headroom *hides* per-frame allocation until you scale, so measure allocations directly rather than trusting the frame rate.
- **Decoupled sim/render clocks** — run N sim ticks per rendered frame.
- **Web Workers** — sim off the render thread; on the M5's real cores, also the path to evaluating multiple populations (and multiple seeds) in parallel — directly useful for coevolution and for batch research runs.
### 6.1 The three-backend kernel (the headline performance story)

The innermost work — feed-forward over the whole population each tick — sits behind one interface so it can be swapped without touching anything above it. This is what turns "I optimised it" into a *measured comparison*, which is the senior signal.

```ts
interface MatrixKernel {
  // forward-pass an entire population in one call; returns outputs.
  // backend is invisible to network.ts, the GA, and every environment.
  forwardPopulation(weights: Float32Array, inputs: Float32Array, dims: LayerDims): Float32Array;
}
```

| Backend | File | Role | When |
|---|---|---|---|
| **CPU / JS** (`Float32Array`) | `kernel/cpu.ts` | default, always works, readable reference | from day one |
| **Rust → WASM** | `kernel/wasm.ts` | rewrite *only* the hot loop; quantify speedup vs CPU | after profiling (PRD step 14) |
| **WebGPU compute** | `kernel/gpu.ts` | parallel forward-pass + fitness eval → **10k+ agents** | the scale milestone |

- **Why GPU fits:** evolution is embarrassingly parallel — every genome's forward-pass is independent, so a population maps cleanly onto GPU threads. The natural GPU target is *batched feed-forward + one-shot/per-tick fitness across the whole population*; per-agent branching in episodic sims stays on CPU or is flattened into the shader.
- **`core/matrix.ts` stays** as the hand-written, line-by-line-readable reference (the pedagogical asset); `kernel/cpu.ts` is its population-batched wrapper. WASM and GPU backends must match the CPU backend's outputs bit-for-bit-close under the same seed — a correctness test, not just a speed test.
- **The deliverable is the table, not any one backend:** CPU-JS vs WASM vs WebGPU — agents/second and max-agents-at-60-FPS, measured on the M5 and on a named phone. *One decoupled kernel, three backends, real numbers.*

The decoupled kernel boundary is also what keeps the language decision (§8) cheap: if research compute ever becomes the bottleneck, you port the kernel, never the project.

---

## 7. Testing strategy

| Test file | Guarantees |
|---|---|
| `matrix.test.ts` | matrix ops correct in isolation — *before* any network is trusted |
| `network.test.ts` | `feedForward` shapes + known outputs |
| `genome.test.ts` | clone/mutate/crossover preserve validity — **especially permutation OX/PMX** |
| `ga.test.ts` | elitism never regresses; seeded runs reproduce byte-for-byte |
| `search.test.ts` (new) | novelty archive, MAP-Elites cell placement, Hall-of-Fame sampling behave deterministically under seed |

Principle: the network and matrix math are verified *independently of evolution*, so "it learned" can never paper over "the math is wrong."

---

## 8. Implementation language — re-evaluation (you asked for this)

The PRD chose **TypeScript, zero runtime dependencies**, with a Rust→WASM kernel as a later experiment. Two things changed since: development moved from a 2021 i3 to an **M5 MacBook Pro**, and the project acquired a **research ambition** (≥30-seed batch studies, ablations). Both warrant re-asking the question honestly rather than rubber-stamping the original.

### What actually changed about the requirements
1. **A second execution context appeared.** The demo runs *in the browser* (visual, instant, the résumé artifact). The research runs *headless and batched* (no rendering, many seeds, fast, scriptable). These have different performance profiles and the language must serve both.
2. **The iteration-speed argument got stronger, not weaker.** The M5 compiles everything fast, but the design-churn phase (many genome/search/environment variants) still rewards a fast edit→run loop, which favours a dynamic, no-build-step-in-the-way language.
3. **The "from scratch, readable" thesis is still the whole pitch.** A hand-written network you can "read line by line" (PRD §13.5) is a core asset. Rust matrix code is less legible to a general reader; that weakens the pedagogical story even where it wins on speed.

### The options, judged against the above

- **A — TypeScript everywhere, dual-target (browser + headless under Bun/Node). ✅ Recommended.** One codebase. The genome-blind `core/` + `search/` already import no DOM, so they run unchanged in the browser *and* in a headless Bun/Node runner (`src/headless/`) for batch experiments. Bun's startup and throughput are strong; with typed arrays and no rendering, ≥30-seed studies on an M5 are very tractable. Preserves the from-scratch thesis, the readability, and the iteration speed — and serves both audiences with zero divergence.
- **B — TypeScript demo + a separate Rust research engine.** ❌ Two implementations of the same algorithms guarantees drift; a result measured in the Rust engine no longer describes the artifact people can open in a browser. Rejected: it breaks the "same engine everywhere" claim that is the project's spine.
- **C — Rust core, compiled to WASM (browser) *and* native (research).** One codebase, fast everywhere. Genuinely tempting *if* research compute becomes the binding constraint. But: slow design-churn loop exactly when churn is highest, weaker readability story, large/awkward WASM (hurts the instant-demo pitch — PRD §1 already rejected Go partly for this), and **at the hundreds-of-agents MVP scale you rarely reach JS's ceiling** so the speed is mostly unrealised. Rejected *as the foundation*; retained *as the targeted experiment* (next).
- **D — Keep the Rust→WASM matrix kernel as a profiled, measured experiment.** ✅ Unchanged from the PRD and stronger now: with the "ran on cheap hardware" angle gone, *profile → isolate hot path → rewrite in WASM → quantify the speedup* becomes the headline performance story, and it is hardware-agnostic and senior-signalling.

### Decision
**TypeScript, zero runtime dependencies, dual-target: browser for the demo, Bun/Node headless for research batch runs — the same `core/`/`search/` code in both.** Keep Rust→WASM as the surgical, measured kernel experiment behind the `matrix.ts` boundary. Revisit option C **only** if (and only if) batch research compute on the M5 becomes the proven bottleneck — at which point the decoupled core means porting just the hot path, not the project.

This keeps every PRD invariant intact (zero runtime deps, from-scratch, readable, reproducible) while adding exactly one new capability — a headless runtime — that the research ambition genuinely requires. The right unit of change was the *execution harness*, not the language.

> Note on *prose* language (in case the request also meant the writing): these four docs currently mix a punchy résumé-pitch register (PRD) with a sober technical register. That split is correct and deliberate — the PRD *sells*, ARCHITECTURE/ENVIRONMENTS/RESEARCH *specify*. Keep the PRD's voice; keep these three plain, declarative, and citation-backed.

---

## 9. Build order (architecture-first reading of PRD §13)

The PRD's build sequence is also the order in which these interfaces come online:

1. `rng` + `Genome` + `GenerationalGA` (`SearchStrategy` #1) — no environment. Verify with `ga.test.ts`.
2. Weasel — first `Environment`. String genome.
3. Landscape, 4. TSP — prove representation-blindness (axis 1).
5. `matrix` + `network` + XOR — first network genome; unit-test math first.
6. Cart-pole, 7. Track runner — episodic protocol + sim/render split.
8. Observability dashboard (incl. CIAO plot scaffold).
9. Performance pass on the M5 (typed arrays, buffers, worker, `kernel/cpu.ts`); record real numbers.
10. **Predator-prey + `search/coevolution.ts`** — the crown jewel and the research substrate.
11. Maze + `search/novelty.ts`; Gait + `search/mapElites.ts` — prove the selection-pressure axis (axis 3).
12. `headless/runExperiment.ts` — batch runner for the research studies.
13. Host · GIF · README thesis-first · fill measured numbers.
14. **Scale: `kernel/gpu.ts` (WebGPU compute) → 10k+ agents**, and `kernel/wasm.ts` (Rust→WASM) — produce the three-backend benchmark table (§6.1).
15. (research) cross-representation H1 study using the headless runner.

Milestones 1–5 hosted are already résumé-grade (PRD §13). The research surface (10–12, 14) is upside built on a shipped engine, never a precondition for shipping.
