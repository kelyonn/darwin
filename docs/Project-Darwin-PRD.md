# Product Requirements Document — Project Darwin

**A neuroevolution engine, hand-written in TypeScript, that evolves neural networks (and other structures) via genetic algorithms — demonstrated across interchangeable problem environments, all running in the browser.**

Version 2 (final). Supersedes the vanilla-JS draft.

---

## 0. Thesis

This project defends a *claim*, not a description:

> An evolutionary engine can be made completely blind to **what it evolves** and to **what problem it is solving**. One unchanged core drives a text string, a vector of numbers, a route ordering, and a neural network — against both instant-scoring and multi-step-simulation problems — with the only thing changing between "spell a word" and "balance a pole" being a self-contained Environment file.

Two layers of blindness make the claim true:

1. **The brain is blind to the environment.** A neural network ingests an array of floats, does matrix math, emits an array of floats. It never knows whether a float means "pole angle" or "distance to food." The Environment assigns meaning.
2. **The engine is blind to representation.** The genetic algorithm never inspects what it evolves. It works through a `Genome` interface (clone, mutate, crossover, fitness) plus a fitness callback the Environment supplies. A string genome and a network genome travel the identical code path.

Everything below serves that thesis. The breadth of genome types is the *proof* of it, not decoration.

---

## 1. Tech Stack (final)

The original "vanilla JavaScript" rule was a proxy for the real, non-negotiable rule: **no machine-learning or math libraries — the network, the GA, and the matrix math are hand-written.** That stays absolute. But *build tooling* is a different category from *runtime dependencies*; modernising the tooling strengthens the project without touching the thesis.

**Hard rule — runtime dependencies = ZERO.** No TensorFlow.js, brain.js, synaptic, Math.js, no rendering engine, no UI framework. The shipped code is entirely your own.

| Layer | Choice | Category | Why |
|---|---|---|---|
| Language | **TypeScript** | compiles to JS, no runtime cost | Catches silent matrix-dimension bugs at compile time — the worst class of bug in hand-rolled networks. "TypeScript, zero runtime deps" reads stronger than "vanilla JS". |
| Dev server / build | **Vite** | dev dependency, ships static | Instant hot-reload, near-zero config, outputs a free-hostable static bundle. Does not ship — "zero runtime deps" stays honest. |
| Tests | **Vitest** | dev dependency | Unit-test the matrix math and genome ops so network correctness is verified independently of evolution. "Hand-wrote a network *and* tested the math" is a maturity signal. |
| Rendering | **Canvas 2D, hand-written** | native | Plenty for hundreds of agents at 60 FPS — past that the sim, not the draw, is the bottleneck. No game engine — keeps the "I built the rendering" story. |
| Dashboard chart | **hand-drawn on canvas** (~30 lines) | native | Not worth puncturing zero-runtime-deps for one graph (no Chart.js). |
| Concurrency | **Web Workers** | native | Run the simulation off the render thread — the real lever for 60 FPS on the i3. |
| Hosting | **GitHub Pages / Netlify / Cloudflare Pages** | — | Static, free, opens instantly in any browser. |

**Rejected, with reasons (the reasoning is the résumé asset):**

- *Any ML library* — kills the from-scratch thesis. Hard no.
- *React / Vue / Svelte* — the UI is a canvas plus text readouts; a framework is pure overhead and erases the "I built the UI" signal.
- *Go* — large/awkward WASM output (hurts the instant-demo story) and it is garbage-collected, which fights the project's own "no GC stutter" claim. Wrong domain.
- *Rust as the v1 foundation* — genuinely faster and GC-free, but its slow compile/borrow-checker loop is brutal during the design-churn phase, and **at the hundreds-of-agents scale the MVP targets you rarely reach JS's performance ceiling**, so it buys a ceiling you mostly won't hit at the cost of the iteration speed you need most — though the scale mandate (§8) is exactly the thing that could flip that calculus later.

**Rust → WASM is a planned v2 experiment, not a foundation.** After the TS version works and is profiled, rewrite *only* the matrix kernel (the innermost `feedForward` loop) in Rust→WASM behind the same interface, and benchmark both on the same M5. The résumé bullet that earns —

> "Profiled the JS evolution loop, identified the matrix kernel as the hot path, rewrote it in Rust→WASM, measured a [X]× speedup on an M5."

— is worth far more than "I wrote it in Rust," because it shows *measure → optimise the proven bottleneck → quantify*. That story only exists if the JS version exists first.

---

## 2. System Architecture

Two strictly decoupled layers. If Layer A ever needs to know which Environment is running, the architecture has failed.

### Layer A — Core Engine (representation-blind, problem-blind)

- **Seeded PRNG** (Mulberry32 / xorshift). All engine randomness flows through it → identical seed produces identical run. Required for reproducible bugs and stable demos.
- **`Genome` interface** — the single contract the GA understands (§4).
- **Neural Network** — one `Genome` implementation. Feed-forward, parameterised dimensions, weights in typed arrays.
- **Genetic Algorithm driver** — generational loop: evaluate → sort → select → breed → replace. Talks only to the `Genome` interface and a fitness callback.

### Layer B — Environment (one self-contained file per problem)

- Instantiates a population of the right `Genome` type.
- Defines how a genome is *evaluated* (§5 — Environment decides one-shot vs. episodic).
- Feeds real data in, interprets float outputs (argmax / thresholding / scaling).
- Computes `.fitness` under the §6 shaping convention.
- Renders to canvas/DOM.

---

## 3. Project Structure (everything required, mapped)

```
project-darwin/
├── index.html                  # entry; mounts canvas + dashboard, picks an environment
├── package.json                # scripts; only devDependencies (vite, vitest, typescript)
├── tsconfig.json               # strict: true  (turn ON every strictness flag)
├── vite.config.ts
├── README.md                   # thesis-first; predator-prey GIF in first screenful
│
├── src/
│   ├── core/                   # LAYER A — never imports from environments/ or render/
│   │   ├── rng.ts              # seeded PRNG
│   │   ├── genome.ts           # Genome interface (the keystone)
│   │   ├── network.ts          # feed-forward NN implementing Genome (typed arrays)
│   │   ├── matrix.ts           # hand-written matrix math (the hot path)
│   │   ├── ga.ts               # GenerationalGA: select, elitism, breed, replace
│   │   └── stats.ts            # best/avg/worst fitness, diversity metric
│   │
│   ├── search/                 # LAYER A — selection paradigms, all genome-blind
│   │   ├── novelty.ts          # behavioral-novelty archive (Novelty Search)
│   │   ├── mapElites.ts        # quality-diversity archive (MAP-Elites)
│   │   └── coevolution.ts      # Hall of Fame, k-opponent sampling, fitness sharing
│   │
│   ├── genomes/                # Genome implementations that aren't networks
│   │   ├── stringGenome.ts     # Weasel
│   │   ├── vectorGenome.ts     # landscape optimizer
│   │   └── permutationGenome.ts# TSP (order crossover)
│   │
│   ├── environments/           # LAYER B — one file each, all import only core/ + genomes/
│   │   ├── Environment.ts      # the interface every environment implements
│   │   ├── weasel.ts
│   │   ├── landscape.ts
│   │   ├── tsp.ts
│   │   ├── xor.ts
│   │   ├── cartpole.ts
│   │   ├── trackrunner.ts
│   │   ├── maze.ts             # deceptive maze (objective vs novelty)
│   │   ├── gait.ts             # 2D hinged creature (MAP-Elites illumination)
│   │   └── predatorPrey.ts     # co-evolution (crown jewel)
│   │
│   ├── render/                 # canvas drawing + dashboard chart; imports nothing from core internals
│   │   ├── canvas.ts
│   │   └── dashboard.ts
│   │
│   ├── sim/
│   │   └── worker.ts            # Web Worker: runs evaluation off the render thread
│   │
│   └── main.ts                 # wires environment ↔ engine ↔ render ↔ worker; the sim/render loop
│
└── test/
    ├── matrix.test.ts          # matrix ops correct in isolation
    ├── network.test.ts         # feedForward shapes + known outputs
    ├── genome.test.ts          # clone/mutate/crossover preserve validity (esp. permutation)
    └── ga.test.ts              # elitism never regresses; seeded runs reproduce
```

**Dependency direction (enforce mentally on every import):** `environments/` → `core/` + `genomes/`. `render/` is called by `main.ts`, never by `core/`. `core/` imports nothing else in the project. This direction *is* the decoupling.

---

## 4. The Genome Interface (keystone)

The genome owns its own genetics — putting `crossover` on the GA would force the GA to know representation internals and silently break decoupling.

```ts
interface Genome {
  clone(): Genome;              // deep copy — used for elitism
  mutate(rate: number): Genome; // genome-specific meaning
  crossover(other: Genome): Genome;
  fitness: number;              // written by the Environment, read by the GA
}
```

The GA sees only these four members. Four implementations prove the contract:

| Genome | `mutate` | `crossover` | Used by |
|---|---|---|---|
| **String** | flip random chars | uniform char mix | Weasel |
| **Float vector** | Gaussian jitter | blend / single-point split | Landscape |
| **Permutation** | swap two positions | order crossover (OX/PMX) — keeps route valid | TSP |
| **Neural network** | perturb weights by noise | mix weight arrays | XOR, cart-pole, track, ecosystem, predator-prey |

String, vector, and permutation use **no network at all** — they are the engine's unit tests and the cleanest proof the GA is representation-blind.

---

## 5. Evaluation Protocol (one-shot vs. episodic)

The Environment owns evaluation and exposes one uniform entry point:

```ts
interface Environment {
  newPopulation(size: number): Genome[];
  evaluate(genome: Genome): number;   // GA calls this; never knows what happens inside
  render?(best: Genome): void;
}
```

Two internal modes, invisible to the GA:

- **One-shot** — single pass. Weasel, landscape, XOR, TSP. No time, no simulation.
- **Episodic** — run a sim up to *T* steps; the genome's `feedForward` is called each tick; reward accumulates. Cart-pole, track runner, ecosystem, predator-prey.

**Stochastic environments** (randomised layouts/food) must fix the per-generation seed so all genomes face identical conditions (default), or average over *k* trials. Keeps fitness comparable within a generation.

---

## 6. Fitness Shaping Convention (one rulebook, applied to all)

Evolution optimises exactly what is written, not what is meant. The classic failure: dividing by a cost (`proximity / fuel`) lets a do-nothing agent (fuel ≈ 0) score near-infinity, so evolution breeds do-nothings. This is *reward hacking* and it is the project's signature lesson.

**Two rules, everywhere:**

1. **Guard every denominator.** Never `1 / cost`; always `1 / (1 + cost)` so it can't blow up.
2. **Progress dominates efficiency.** Lead the score with a progress term (distance, checkpoints, matches, frames survived) that an active agent always beats a passive one on. Efficiency (fuel/power/time) is a *tiebreaker* applied only after the task is substantially solved.

Corrections to broken draft formulas:

- **Orbital:** ~~`proximity / fuel`~~ → `progress_to_target − k·(1/(1+fuel))`, fuel term only after arrival.
- **Server rack:** ~~`(1/power) × time_under_limit`~~ → lead with `time_under_thermal_limit`, subtract a small bounded power penalty.
- **Track runner:** ~~`checkpoints + avg_velocity/time_alive`~~ (penalised survival!) → `checkpoints·K + distance_travelled`, large immediate per-checkpoint reward.

---

## 7. GA Mechanics (named, not hand-waved)

- **Selection:** tournament (pick *n* at random, fittest wins a breeding slot). Chosen over top-N truncation, which collapses diversity too fast.
- **Elitism:** best *E* genomes `clone()`d unchanged into the next generation → the engine never regresses.
- **Crossover:** per-genome-type (§4).
- **Mutation:** tunable rate; may decay over generations (explore early, refine late).
- **Reproducibility:** every stochastic choice draws from the seeded PRNG.

---

## 8. Performance Engineering (the scale mandate)

Hardware changed: development is now on an **M5 MacBook Pro**, not a 2021 i3. That kills the old "fast on a slow laptop" story — on an M5, 60 FPS with hundreds of agents is *free*, and a claim that costs nothing to hit proves nothing. The constraint has to move. Two replace it, and both are stronger résumé assets than the i3 ever was:

- **Constraint 1 — scale until it breaks.** Don't cap at "hundreds." Raise the agent count until the frame budget genuinely blows, find the real ceiling, and report *that number* next to the machine it was measured on. "Sustains 60 FPS at [N] agents on an M5; degrades past [M]" is a measured engineering fact. An uncontested 60 FPS is not.
- **Constraint 2 — 60 FPS on a phone.** The demo is browser-based, so it already runs on a phone — make that a *target*, not an accident. "Open it on your phone and it holds 60 FPS" is the new instantly-verifiable hook the i3 used to provide, and it's better: anyone in the room can check it in five seconds. The phone is the new slow machine, and it's one everybody is carrying.

The techniques are unchanged — only their justification moved from "weak CPU" to "scale + mobile":

- **Typed arrays for weights** (`Float32Array`) — biggest single lever for speed and memory.
- **Zero-allocation hot loop** — reuse `feedForward` output buffers; pool the population so a new generation doesn't churn garbage every frame. Per-frame allocation, not `.map`/`.reduce`, is the true cause of GC stutter — and an M5's headroom *hides* it until you scale, so measure allocations directly; don't trust a healthy frame rate.
- **Decoupled sim/render clocks** — 60 FPS is a *render* constraint. Run the GA as fast as it can; run *N* sim ticks per rendered frame.
- **Web Workers** — push the sim off the render thread for episodic/multi-agent envs. On an M5 with real cores this also opens the door to evaluating multiple populations in parallel (directly relevant to co-evolution, §10).
- **Every number measured on the named machine and recorded truthfully. No invented benchmarks** — a fabricated figure sinks the whole résumé's credibility, not just the project's. State the hardware beside every number (M5, and the specific phone for the mobile claim).

**The hot path is one interface with three backends — and the benchmark *between them* is the headline performance story.** The innermost work (feed-forward over the whole population, the fitness-evaluation kernel) sits behind a single `MatrixKernel` interface so it can be swapped without touching anything above it:

1. **CPU / JS** (`Float32Array`) — the default; always works; the readable reference implementation.
2. **Rust → WASM** — rewrite *only* the hot kernel, behind the same interface, and quantify the speedup on the M5. The senior, hardware-agnostic optimization story: *profile → isolate the hot path → rewrite → measure*.
3. **WebGPU compute shaders** — push feed-forward and fitness evaluation onto the GPU to scale from hundreds of agents to **10k+**. Evolution is embarrassingly parallel (every genome is independent), which is exactly what a GPU is for. This is the modern, genuinely-hard scale lever the mandate points at.

The deliverable is a **measured three-way benchmark table** — CPU-JS vs WASM vs WebGPU, agents/second and max-agents-at-60-FPS, on the M5 and on a named phone. That table — *one decoupled kernel, three backends, real numbers* — is worth more than any single environment.

---

## 9. Observability

Show not just that the AI learns but *how* — the difference between "I made an AI" and "I built the tooling to understand one."

- **Fitness dashboard:** live best / average / worst per generation.
- **Diversity meter:** how varied the population still is (catches premature convergence).
- **Generation readout:** index + best genome rendered (e.g. current best-guess string).

Doubles as the demo's "alive" element and as material for the observability/reproducibility résumé bullet.

---

## 10. Environment Catalog (by build tier)

Tiers ordered so each de-risks and teaches the next. Tier 0 runs anywhere with no neural-net math.

### Tier 0 — Engine proof (one-shot)
| # | Env | Genome | I/O | Fitness (shaped) | Proves |
|---|---|---|---|---|---|
| 1 | **Weasel** | String | none → guess | `Σ chars matching target in position` | Generic genome works with no NN |
| 2 | **Landscape optimizer** | Float vector | *genome IS the coords* | `1/(1 + Rastrigin/Ackley value)` | GA escapes deceptive local optima — the real "prove the GA" test |
| 3 | **TSP** | Permutation | nodes → route | `1/(1 + route distance)` | Representation-blindness on a non-vector genome |
| 4 | **XOR** | Neural net | `[a,b]` → float (≥0.5⇒1) | `4 − Σ(target−output)²` | First network; hidden-layer matrix math correct |

> Tier 0 alone, hosted live, is already a résumé-worthy project — it fully earns "built from scratch" and "decoupled architecture."

### Tier 1 — Episodic control (NN, multi-step)
| # | Env | I/O | Fitness | Proves |
|---|---|---|---|---|
| 5 | **Cart-pole** | `[pos,vel,angle,ang-vel]` → push | frames upright (`|θ|<15°`, on-screen) | Episodic protocol + sim/render split |
| 6 | **Track runner** | 5 raycasts → `[force,steer]` | `checkpoints·K + distance`; die on wall | Raycast sensors; corrected progress-led fitness |

### Tier 2 — Search-paradigm demos (the research backbone)
These two stop being "another problem" and instead swap the *search itself*. They force a **third decoupling axis — selection pressure** — alongside genome and environment, the same way the four genome types decoupled representation. This axis is what gives the project a real research angle.

| # | Env | Genome | Notes |
|---|---|---|---|
| 7 | **Deceptive maze + Novelty Search** | Neural net | A maze where objective fitness (distance-to-goal) is *deceptive* — a greedy agent climbs toward the goal, hits a wall, and stalls in a local optimum forever. Run two populations side by side on the identical maze: one selected on **objective fitness** (gets stuck), one on **behavioral novelty** (ignores the goal, is rewarded purely for reaching new places, and solves it). Canonical published result (Lehman & Stanley, 2011); the side-by-side contrast is legible at a glance and proves selection pressure is swappable, not just representation. |
| 8 | **Gait illumination + MAP-Elites** | Float vector / net | A hand-written 2D creature (hinged segments, no physics lib — the physics is yours too). Instead of returning one champion, **MAP-Elites** (Mouret & Clune, 2015) fills an *archive* indexed by behavior descriptors (e.g. stride length × duty factor); each cell keeps the best genome exhibiting that behavior. The archive renders as a heatmap that **illuminates** the space of viable gaits — dozens of distinct walking styles at once, not one winner. The project's most visual artifact and its clearest quality-diversity story. |

### Tier 3 — Crown jewel
| # | Env | Notes |
|---|---|---|
| 9 | **Predator–prey co-evolution** | Evolve foxes to catch rabbits *and* rabbits to escape, simultaneously. Fitness is **non-stationary/relative** — a good rabbit depends on current foxes, so absolute sorting partly breaks (measure fitness against the co-evolving opposing population each generation). Most self-explanatory demo (an arms race anyone reads at a glance), hardest selection case. **Demo's default landing view.** |

### Stretch ("extensible" — specified, not built for MVP; ~50 lines each)
Orbital optimizer · Server-rack thermal manager · Complex curve fitter. Breadth shown through *ease of extension*, not brute count.

---

## 11. The Ecosystem Fork (decision recorded)

The draft's **in-world asynchronous reproduction** is a *steady-state* model (a pond: continuous births/deaths, no generation boundary) — a fundamentally different loop from the generational *classroom* model the other environments share.

- **MVP:** classroom — fixed-length episodes, all graduate together, generational GA, same engine.
- **Post-stabilisation (M5 is back — now unblocked):** build the steady-state "pond" as a *second driver* (`SteadyStatePopulation`) sharing the same `Genome` interface as `GenerationalGA`. This is now a viable post-MVP showpiece (see breadth discussion, §10).

Design the interface now to accept both, ship only the generational driver. That forward-compatibility is a feature (architected for extension before needed), not a TODO.

---

## 12. Setup & Tooling Steps (everything required to start)

1. `npm create vite@latest project-darwin -- --template vanilla-ts`
2. `npm i -D vitest` (Vite + TypeScript already included by the template).
3. In `tsconfig.json` set `"strict": true` and enable `noUncheckedIndexedAccess` — catches the off-by-one array bugs that plague hand-written matrix code.
4. `package.json` scripts: `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest"`.
5. `npm run dev` → opens at localhost with hot reload.
6. Deploy: `npm run build` → push `dist/` to GitHub Pages (or drag into Netlify).

No other installs. If you ever find yourself typing `npm i <something-that-isn't-vite-or-vitest>`, stop — it probably violates the zero-runtime-deps rule.

---

## 13. Build Sequence (also the learning order — each step adds exactly one new idea)

Each milestone ends with something *running in the browser*. Never move on until the current one works.

1. **Seeded PRNG + `Genome` interface + `GenerationalGA`.** No environment yet. *New idea: what a population, fitness, selection, elitism, crossover are.* Verify with `ga.test.ts`.
2. **Weasel.** String genome, evolve "PROJECT DARWIN". *New idea: a genome + a fitness function plugged into the engine.* No math, no network. First thing on screen. **This alone is a real, shippable mini-project.**
3. **Landscape optimizer.** Vector genome on Rastrigin. *New idea: deceptive search spaces and local optima.* Same engine, different genome — your first proof of decoupling.
4. **TSP.** Permutation genome, order crossover. *New idea: a crossover that must preserve validity.* Third genome, same engine — decoupling proven.
5. **Matrix math + Network + XOR.** *New idea: feed-forward and matrix math — small enough to read line by line.* This is where the network stops being scary. Unit-test the matrix before trusting it.
6. **Cart-pole.** *New idea: episodic evaluation + the sim/render split.* First physics, first "watch it get better over time."
7. **Track runner.** *New idea: sensors as inputs.*
8. **Observability dashboard.** Wire in best/avg/worst + diversity. Makes everything before it legible.
9. **Performance pass on the i3.** Typed arrays, buffer reuse, Web Worker. *New idea: profiling and zero-allocation loops.* Record real numbers.
10. **Predator–prey co-evolution.** The crown jewel. *New idea: fitness that moves.*
11. **Ecosystem (classroom) + trading.** 
12. **Host · record GIF · write README thesis-first · fill measured numbers.**
13. **(v2, optional)** Rust→WASM matrix-kernel experiment with before/after benchmark.

You do not have to reach the end for this to be worth shipping. **Milestones 1–5, hosted, are already résumé-grade.** Everything after is upside.

---

## 14. Definition of Done / Acceptance Criteria

- [ ] Four genome types (string, vector, permutation, network) evolve through **one unchanged `GenerationalGA`**.
- [ ] `core/` imports nothing from `environments/`, `genomes/`, or `render/`. (Decoupling = enforced, not claimed.)
- [ ] Same seed → byte-identical run, twice in a row.
- [ ] Matrix and network math pass unit tests independently of evolution.
- [ ] No fitness function can be maximised by a do-nothing agent (shaping rulebook holds).
- [ ] Live demo opens in a browser with zero setup and defaults to the predator-prey view.
- [ ] Sustains a **measured** 60 FPS at a **measured** agent count on the M5, and holds 60 FPS on a named phone; both numbers recorded in the README with their hardware.
- [ ] README states the thesis first and shows the demo GIF in the first screenful.

---

## 15. Deliverables & Packaging (résumé value)

Résumé value = *verifiability* + *legibility in seconds*, not feature count.

- **Live demo link (primary).** Single static bundle, free-hosted, opens instantly. Defaults to predator-prey (self-explanatory). Demo first, repo second.
- **README is part of the résumé.** Thesis at top; muted autoplay GIF of the arms race in the first screenful — most readers watch the GIF and read nothing, so the GIF carries the pitch.
- **Real numbers only.** Measure on the i3; fabricated benchmarks are a landmine.
- **Scope discipline is itself a signal.** Ship the tight version; mark the rest "extensible — here's the 50-line interface."

### Draft résumé entry (fill bracketed numbers with measured values)
> **Project Darwin** — Neuroevolution Engine in TypeScript · *[live demo]* · *[github]*
>
> A zero-runtime-dependency engine that evolves neural networks (and other structures) via genetic algorithms, demonstrated across [10] interchangeable environments.
> - **Built the entire stack from scratch** — feed-forward neural network, genetic algorithm (tournament selection, elitism, crossover), and matrix math — in TypeScript with **zero runtime dependencies** (no TensorFlow, no libraries), and **unit-tested the matrix math** independently of evolution.
> - **Architected a fully decoupled engine** driving four structurally unrelated genome types — strings, numeric vectors, route permutations, and neural networks — through one unchanged core interface, proving the algorithm is independent of problem representation.
> - **Optimized for scale and mobile:** sustained **60 FPS with [N] concurrent agents on an M5, and 60 FPS in a mobile browser**, via typed-array storage, zero-allocation render loops, and a decoupled simulation/render clock.
> - **Implemented competitive co-evolution** (predator–prey arms race) and a seeded RNG for fully reproducible runs, with a live dashboard tracking fitness and population diversity.

### Interview war story
> "My spacecraft agents evolved to never fire their engines — my fitness divided by fuel consumed, so a do-nothing agent used ~zero fuel and scored near-infinity. Evolution found the loophole in my scoring before it found the solution; it optimised what I wrote, not what I meant. The hard part isn't the algorithm, it's reward design — so I built one shaping convention across every environment to make that whole class of bug impossible."

That's *reward hacking* — a live topic in modern AI — told as something you lived.

---

## 16. Open Decisions (non-blocking)

- Fixed network topology vs. evolvable (NEAT-style)? — *MVP: fixed.*
- Tournament size, elitism count, mutation rate/decay — tune empirically once Tier 0 runs.
- Web Worker — add when the M5 demands it (Tier 2); profile first.
- Agent-count ceiling — Canvas 2D *rendering* is correct into the hundreds. *Evaluation* scale is now an explicit goal, not a maybe: the three-backend kernel (CPU-JS → Rust→WASM → WebGPU compute, §8) is the committed path to 10k+ agents. At that scale, rendering switches to instanced/point draws or a WebGPU render pass; the sim is already GPU-resident.
