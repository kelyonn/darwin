# Project Darwin

A representation-blind **neuroevolution engine**, hand-written in TypeScript with
**zero runtime dependencies** — no TensorFlow, no ML libraries, no rendering or UI
framework. One unchanged core evolves neural networks *and* strings, numeric
vectors, and route permutations across interchangeable problem environments,
all in the browser.

The thesis: the evolutionary engine can be made completely blind to *what* it
evolves and *what* problem it solves. The breadth of genome types is the proof.

> **Live demo:** _coming soon_ (GitHub Pages) — defaults to the predator–prey arms race.

<!-- TODO: drop a muted arms-race screenshot/GIF here once recorded (PRD §15). -->

## What works today

Five environments, three genome types, and three search paradigms all run through
**one unchanged core**, rendered as a live "specimen plate" you can switch between:

| Plate | Environment | Genome | What it proves |
|------:|-------------|--------|----------------|
| I | **Predator–Prey** | network ×2 | competitive co-evolution — the default landing view; a live arms race with a CIAO progress plot |
| II | **Weasel** | string | a generic genome plugs into the core with no network at all |
| III | **TSP** | permutation | order crossover keeps every route valid |
| IV | **Track Runner** | network | raycast sensors + progress-led fitness shaping, watching champion/median/worst drive one attempt each so the population's spread is visible, with a live "vs. generation 1" multiplier |
| V | **Maze** | network | champion/median/worst each run a deceptive dead-end fork once per generation, fading crash markers, a live "vs. generation 1" multiplier |

Track Runner and Maze are **round-paced**: a generation is each of the three
roles' full attempt (the car or agent crashes, solves, or hits its tick
budget), not a fixed number of rendered frames — so the generation counter,
the crash markers, and the status line on screen always describe the exact
attempt just watched, never a stale mid-flight snapshot. Speed (0.25×–8×)
controls how fast that attempt plays out, not how often it's summarised.

Landscape, Cart-pole, Gait, and XOR were cut from the on-screen demo (five
plates reads better than nine) but not from the project — their environments,
presets, `--study` coverage, and tests are untouched; see
[`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md).

The three decoupled axes — **representation** (`Genome`), **problem**
(`Environment`), and **selection pressure** (`SearchStrategy` + the co-evolution
and MAP-Elites drivers) — are the whole architecture. Every environment and every
paradigm is *proof* those independences hold: the core imports nothing from
`environments/`, `genomes/`, or `search/`, and the same seed reproduces a
byte-identical run.

## Cross-representation study

`core/`'s representation-blindness is enforced by construction (it imports
nothing from `genomes/`), but for most of this project's life the *proof* of
it was one-to-one: nine environments, each hard-wired to exactly one genome
type. Two environments now accept an **injected encoding**, so the identical,
unmodified `GenerationalGA` drives two unrelated genetic representations of
the same problem (`.docs/decisions.md`, ADR-013):

```bash
npm run experiment -- --study cross-representation --seeds 0-19
```

20 seeds; each environment's problem instance (the TSP node layout; Rastrigin
itself has none to vary) is held identical across every seed, so a difference
in outcome is attributable to the encoding, not to which seed drew an easier
problem:

| Environment | Encoding | Genome | Final fitness (median, IQR) | Generations to 0.9 fitness (median, IQR) |
|---|---|---|---|---|
| TSP, 20 nodes | Order-crossover permutation (original) | `PermutationGenome` | 0.184 (0.179–0.189) | — |
| TSP, 20 nodes | Random-key (Bean, 1994) | `VectorGenome`, ascending sort order = tour | **0.195** (0.191–0.197) | — |
| Landscape, Rastrigin 2D | Real-coded (original) | `VectorGenome` | 0.99997 | 12 (8.75–13.5) |
| Landscape, Rastrigin 2D | Binary-coded, 16 bits/dim | `StringGenome`, fixed-point decoded | 0.99998 | **9** (7.75–12.5) |

Both alternative encodings are not merely functional — on these configs, both
*outperform* the encoding the engine originally shipped with, unprompted:
random-key TSP finds routes ≈7% shorter (fitness 0.195 vs. 0.184 — higher is
shorter, `1 / (1 + distance)`) than order-crossover permutation on the
identical 20-node layout, with no permutation-aware genetics at all —
`VectorGenome`'s ordinary blend crossover and Gaussian mutation, decoded by
sorting. Binary-coded Landscape reaches the basin around the global optimum in
fewer generations (median 9 vs. 12) than real-coded, using `StringGenome`'s
per-character mutation and uniform crossover — genetics built for the Weasel
phrase, repurposed with zero changes for continuous optimisation. Neither
result was tuned for; both were simply measured
(`test/environments.test.ts`).

`--study cross-representation` currently covers TSP and Landscape — the two
environments with an injected encoding. Divergent search is proven
representation-blind too: `behaviour` (the descriptor Novelty Search and
MAP-Elites read) is now declared on all four genome classes, not just
`Network`, and `test/mapElites.test.ts` runs MAP-Elites directly over TSP
routes — an illuminated archive of `PermutationGenome`s, no network anywhere
in the loop.

### Honest caveats

- The maze's live demo shows only an objective `GenerationalGA` population
  (user-directed simplification, ADR-016 — a single, legible maze reads
  better than two side by side). `NoveltySearch` — swap in with zero core
  changes, a genuine second selection paradigm — still runs on the identical
  maze via `npm run experiment -- --study maze-deception` and is covered by
  `test/novelty.test.ts`; it just isn't rendered in the browser. That study
  does not reproduce the textbook Lehman & Stanley (2011) "objective gets
  stuck forever" separation at this maze's scale: measured across 20 seeds,
  both strategies solve 20/20 within 40 generations at the same median
  generation (3) — novelty is not reliably faster here. The labelling
  reflects that rather than overclaiming
  (see [`.docs/known-issues.md`](.docs/known-issues.md), ADR-010).
- No performance benchmarks are claimed yet — the PRD's "measure, never fabricate"
  rule (§8) means numbers appear here only once measured.

## Run it

```bash
npm install
npm run dev        # open the printed localhost URL — defaults to predator–prey
npm test           # unit tests: reproducibility, elitism, matrix math, genome operators
npm run typecheck  # strict TypeScript, no emit
npm run build      # static bundle to dist/ (free-hostable, zero runtime deps)
```

## Documentation

- [`docs/Project-Darwin-PRD.md`](docs/Project-Darwin-PRD.md) — product requirements & thesis
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the three decoupled axes, interfaces, performance
- [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) — every environment, specified
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — biological & technical lineage, the open research question
- `docs/explainer.typ` — plain-language intro (compile with `typst compile`)
- [`.docs/progress.md`](.docs/progress.md) — milestone status · [`CLAUDE.md`](CLAUDE.md) — contributor brief

## License

[MIT](LICENSE)
