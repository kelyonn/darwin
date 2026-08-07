# Project Darwin — Environment Catalog (detailed)

**Companion to the PRD. Every environment specified to build-readiness: genome, exact I/O, shaped fitness, evaluation mode, what it proves, rendering, parameters, and the failure modes to watch.** One file in `src/environments/` per entry; each imports only `core/`, `genomes/`, and `search/`, never the reverse.

Conventions used throughout:
- **Mode** — `one-shot` (single evaluation pass, no time) or `episodic` (run a sim up to *T* ticks, accumulate reward).
- **Fitness** follows the PRD §6 rulebook without exception: guard every denominator (`1/(1+cost)`, never `1/cost`); progress dominates efficiency; efficiency is a tiebreaker only after the task is substantially solved.
- **Seed discipline** — stochastic environments fix the per-generation seed so all genomes in a generation face identical conditions (or average over *k* trials). All randomness flows through the seeded PRNG.

**On the live demo vs. built-but-off-demo (ADR-014, `.docs/decisions.md`):** the
browser demo (`main.ts`) shows five of the nine environments specified below —
Weasel, TSP, Track Runner, Maze, and Predator–prey — as a user-directed
narrowing (nine tabs read as too many; several didn't earn their place
*on screen* for the demo's purpose of watching the engine learn). Landscape,
Cart-pole, Gait, and XOR are marked **(off demo)** below — this means only
"not one of the five browser tabs," not "unbuilt" or "unspecified": all four
keep their environment code, demo presets (`src/app/presets.ts`), tests, and
either `--study` or `npm run bench` coverage untouched. This spec describes
all nine as built; it is not re-tiered by demo visibility.

---

## Tier 0 — Engine proof (one-shot, no neural net)

These exist to prove the GA is representation-blind *before* any network math is trusted. They are also the engine's living unit tests. String, vector, and permutation genomes use **no network at all**.

### 1. Weasel
- **Genome:** String. **Mode:** one-shot.
- **I/O:** none in, a candidate string out (the genome *is* the answer).
- **Target:** `"PROJECT DARWIN"` (configurable).
- **Fitness:** `Σ chars matching target in the correct position`. Higher = better; max = string length.
- **Mutate:** flip random characters at `rate`. **Crossover:** uniform per-character mix of two parents.
- **Proves:** a generic genome + a fitness function plugged into the engine with zero math and zero network. First thing on screen; shippable alone.
- **Render:** current best string, generation index, fitness bar.
- **Watch for:** nothing subtle — this is the sanity anchor. If Weasel does not converge in a few hundred generations, the GA itself is broken.

### 2. Landscape optimizer (off demo)
- **Genome:** Float vector (the genome *is* the coordinates). **Mode:** one-shot.
- **I/O:** none in; the vector is the point being scored.
- **Function:** Rastrigin or Ackley (both deceptive, many local optima). Default 2-D for visualisation, N-D for stress.
- **Fitness:** `1 / (1 + f(x))` where `f` is the function value being minimised. Guarded denominator per §6.
- **Mutate:** Gaussian jitter on each component (σ tunable, may decay). **Crossover:** per-component blend or single-point split.
- **Proves:** the GA escapes deceptive local optima — the *real* "prove the GA" test, not Weasel. This is the one-shot benchmark later reused for novelty/QD comparisons.
- **Render:** 2-D contour/heatmap of the function with the population scattered over it; best point marked. This same surface later hosts the MAP-Elites archive overlay.
- **Watch for:** premature convergence to a local optimum — the diversity meter (§9 observability) should visibly drop when this happens.

### 3. TSP (Travelling Salesman)
- **Genome:** Permutation. **Mode:** one-shot.
- **I/O:** a fixed set of node coordinates in; an ordering (route) out.
- **Fitness:** `1 / (1 + total route distance)`. Guarded.
- **Mutate:** swap two positions. **Crossover:** **order crossover (OX)** or PMX — must preserve a valid permutation (no repeated/missing nodes). This validity constraint is the whole point.
- **Proves:** representation-blindness on a genome where naïve crossover would produce *invalid* offspring; the GA never knows the genome is a route.
- **Render:** nodes as points, current best route as a polyline, live distance readout.
- **Watch for:** an invalid permutation after crossover = a bug in OX/PMX, not in evolution. `genome.test.ts` must cover this before trusting any run.

### 4. XOR (off demo)
- **Genome:** Neural network (first one). **Mode:** one-shot.
- **I/O:** `[a, b]` (each 0/1) → one float; output ≥ 0.5 ⇒ 1.
- **Fitness:** `4 − Σ over 4 cases (target − output)²`. Max 4 = perfect XOR.
- **Mutate:** perturb weights by noise. **Crossover:** mix weight arrays of two parents.
- **Proves:** the hand-written feed-forward + matrix math is correct, and a network is *just another genome*. XOR is non-linearly separable, so it forces a working hidden layer — the smallest honest test of the network.
- **Render:** truth table with live outputs; fitness toward 4.
- **Watch for:** a network that scores 3/4 forever is stuck in a linear local optimum (no working hidden unit). Unit-test the matrix math (`matrix.test.ts`, `network.test.ts`) independently *before* trusting XOR — the network must be correct in isolation, not just "good enough" under evolution.

> **Tier 0, hosted, is already a résumé-grade project on its own.** It fully earns "built from scratch" and "decoupled architecture." Everything after is upside.

---

## Tier 1 — Episodic control (neural net, multi-step)

First introduction of time, simulation, and the sim/render split. The genome's `feedForward` is called every tick; reward accumulates.

### 5. Cart-pole (off demo)
- **Genome:** Neural network. **Mode:** episodic (T capped, e.g. 1000 ticks).
- **I/O:** `[cart position, cart velocity, pole angle, pole angular velocity]` → push force (left/right, or continuous).
- **Physics:** standard inverted-pendulum equations, hand-written, fixed timestep.
- **Fitness:** frames the pole stays upright (`|θ| < 15°` and cart on-screen). Pure progress term; no efficiency component needed.
- **Proves:** the episodic protocol and the decoupled sim/render clock. First "watch it get visibly better across generations."
- **Render:** the cart, pole, and track; best genome of the generation driving live.
- **Watch for:** physics instability at large timesteps (pole "teleports"). Fix the timestep small and run N sim ticks per rendered frame (PRD §8).

### 6. Track runner
- **Genome:** Neural network. **Mode:** episodic; die on wall contact.
- **I/O:** 5 raycast distances (sensors) → `[forward force, steering]`.
- **Fitness (corrected per §6):** `checkpoints · K + distance_travelled`, with a **large immediate per-checkpoint reward** `K`. *Never* `checkpoints + avg_velocity/time_alive` — that penalises survival and rewards do-nothing loitering.
- **Mutate / crossover:** network ops.
- **Proves:** sensors-as-inputs; an agent perceiving its world through rays, not god-given state. Reuses cart-pole's episodic machinery.
- **Generalization hook (replaces the cut "trading" lesson):** evaluate evolved drivers on **held-out track layouts never seen during evolution**. Does a driver that masters training tracks generalise, or has it overfit the training geometry? This teaches train/test discipline *visually* and honestly, inside an environment that is already fun to watch.
- **Render:** track, checkpoints, distance/checkpoint readout. The live demo (round-paced — ADR-015) runs three roles from the current generation to completion each round — champion, median, and worst (ADR-018, `.docs/decisions.md`) — so the population's *spread* is visible, not just one lineage's score; fading crash markers from recent generations show where it kept failing, and a "vs. generation 1" multiplier states the improvement as a number. The held-out track is rendered side-by-side at evaluation time.
- **Watch for:** reward hacking via wall-hugging or tiny circles if `K` is too small relative to distance — progress must dominate.

---

## Tier 2 — Search-paradigm demos (the research backbone)

**These replace the cut Ecosystem and Trading environments.** They do not add "another problem" — they swap the *search itself*, exercising the third decoupling axis (selection pressure). See RESEARCH.md.

### 7. Deceptive maze + Novelty Search
- **Genome:** Neural network. **Mode:** episodic.
- **I/O:** local sensors (wall rangefinders + optional goal bearing) → `[force, steer]`.
- **The trap:** the maze is built so that *objective* fitness (proximity to goal) is **deceptive** — the path to the goal first requires moving *away* from it, so a greedy agent climbs the fitness gradient straight into a dead-end wall and stalls there forever.
- **Two paradigms, side by side on the identical maze:**
  - **Objective GA:** fitness = `1/(1 + distance_to_goal)`. Gets stuck in the deceptive local optimum.
  - **Novelty Search:** fitness = behavioural novelty = mean distance (in *behaviour* space, e.g. final (x,y) position) to the *k* nearest entries in a novelty archive. Ignores the goal entirely, explores, and solves the maze.
- **Behaviour descriptor:** agent's final position (and optionally trajectory signature).
- **Proves:** selection pressure is swappable, and *abandoning the objective can beat pursuing it* (Lehman & Stanley 2011). Both paradigms are built and tested (`test/novelty.test.ts`, `--study maze-deception`); the split-screen contrast described below is what the *code* proves, not what the live demo currently shows.
- **Render (live demo, objective side only — ADR-016, `.docs/decisions.md`):** one maze, showing three roles from the current generation — champion, median, and worst (ADR-018) — each running the maze once per generation, with fading crash markers from recent generations showing where they kept hitting the dead-end wall and a "vs. generation 1" multiplier stating the improvement as a number. A user-directed simplification: the demo previously rendered both paradigms side by side (as this spec's "Two paradigms" framing above still describes the built capability); `NoveltySearch` was dropped from the *screen* only — it still runs on the identical maze via `--study maze-deception`, with its own novelty-archive visualisation available there.
- **Watch for:** behaviour-descriptor choice changes everything — document it. A descriptor that secretly encodes "distance to goal" smuggles the objective back in and invalidates the demo.

### 8. Gait illumination + MAP-Elites (off demo)
- **Genome:** Float vector or small network (controller for a hand-written 2-D creature). **Mode:** episodic.
- **Creature:** a small 2-D body of hinged segments / point-masses with springs — **physics hand-written, no engine** (the physics is part of the "from scratch" story). Controller outputs joint torques over time.
- **The shift:** do **not** return one champion. Run **MAP-Elites** — maintain an *archive* of cells indexed by **behaviour descriptors** (e.g. *stride length × duty factor*, or *average speed × body height*); each cell stores the highest-performing genome that exhibits that behaviour. New genomes are placed by their behaviour and kept only if they beat the current occupant.
- **Performance (per cell):** distance travelled (or speed) without falling — guarded, progress-led.
- **Proves:** quality-diversity — the engine can *illuminate a space of solutions* rather than optimise to a point. Dozens of qualitatively distinct gaits coexist (a fast hopper, a slow crawler, a bouncer) instead of one winner.
- **Render:** the archive as a **2-D heatmap** that visibly *fills in* over generations (colour = performance per behaviour cell); click a cell to watch that gait run. The single most visual artifact in the project.
- **Watch for:** archive resolution and descriptor bounds dominate the result — they are hyperparameters, report them. An ill-scaled descriptor collapses everything into one cell.

---

## Tier 3 — Crown jewel (co-evolution)

### 9. Predator–prey co-evolution
- **Genomes:** two populations of neural networks (foxes and rabbits), evolved simultaneously. **Mode:** episodic, multi-agent, shared world.
- **I/O (each agent):** local sensors (nearest opponents' bearings/distances, own heading/energy) → `[velocity, turn]`.
- **Fitness is non-stationary and *relative*** — a rabbit is scored only against the *current* fox population, and vice versa (the Red Queen, RESEARCH.md §2.1). Absolute cross-generation comparison is meaningless by construction.
- **Evaluation:** each agent faces a **sample of k opponents** (not one), drawn from the current opposing population **plus the Hall of Fame** (archived past champions). Fitness uses **competitive fitness sharing** (reward beating opponents few others beat).
- **Stabilisers (all from Rosin & Belew 1997; see RESEARCH.md §4):**
  - **Hall of Fame** — archive past champions; evaluate against them too → fights forgetting and cycling.
  - **Competitive fitness sharing** — fights disengagement and diversity collapse.
  - **k-opponent / shared sampling** — reduces variance, keeps a gradient.
  - **(Research swing, H2)** behaviourally-*diverse* Hall of Fame — a QD-style opponent archive; the experimental variant the research hinges on.
- **Proves:** the hardest selection case in the project, and the most self-explanatory demo (an arms race anyone reads at a glance). **This is the demo's default landing view.**
- **Observability (critical here):** the **CIAO plot** (Current Individual vs Ancestral Opponents) — a heatmap of each generation's champion against every past opponent; smooth gradient = progress, diagonal banding = cycling. Plus a dominance-tournament curve and the frozen-benchmark probe. These are the *only* honest progress signals when fitness itself lies.
- **Render:** foxes chasing rabbits in real time (the landing view); side panel with CIAO plot, population diversity, and best-of-generation behaviour.
- **Watch for:** **disengagement** — one species pulling away, the other's fitness flattening to a constant, both then decaying (the life–dinner principle in action). This is the central failure the stabilisers exist to prevent and the phenomenon the research measures.

---

## Stretch / extensible (specified, not built for MVP — ~50 lines each)

The real breadth flex is **ease of extension, proven by the diff**, not brute count. Each of these adds one file under `src/environments/` with zero core changes:

- **Steady-state "pond" ecosystem** — *now unblocked (M5 is back)*. Continuous in-world birth/death with no generation boundary — a fundamentally different population *driver* (`SteadyStatePopulation`) sharing the same `Genome` interface as `GenerationalGA`. Proves the core supports two different *evolutionary loops*, not just two problems — a deeper decoupling claim than any single environment. Strong post-MVP showpiece. (PRD §11.)
- **Orbital optimizer** — corrected fitness `progress_to_target − k·(1/(1+fuel))`, fuel penalty only after arrival (the reward-hacking war story, PRD §15).
- **Server-rack thermal manager** — lead with `time_under_thermal_limit`, subtract a small bounded power penalty.
- **Complex curve fitter** — vector/network genome regressing to a target curve.
- **Minimal open-endedness (research stretch)** — the maze or gait environment generating its own progressively harder variants (a tiny POET), zero ML libraries. (RESEARCH.md §8.)

---

## Cut from MVP (and why)

- **Ecosystem (classroom mode)** — largely *subsumed* by predator-prey (both are multi-agent shared-world with spatial partitioning); it taught the engine nothing predator-prey doesn't. Demoted to the steady-state "pond" stretch, where it becomes a genuinely distinct *driver* rather than a redundant environment.
- **Trading** — visually dead (a line chart, against a pitch built on a living GIF), overfits backtests by the PRD's own admission, and reads as naïve. Its one real lesson — train/test discipline — is now taught more honestly and more visually by **held-out track layouts** in Track Runner (#6).
