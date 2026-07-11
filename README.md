# Project Darwin

A representation-blind **neuroevolution engine**, hand-written in TypeScript with
**zero runtime dependencies** — no TensorFlow, no ML libraries, no rendering or UI
framework. One unchanged core evolves neural networks *and* strings, numeric
vectors, and route permutations across ten interchangeable problem environments,
all in the browser.

The thesis: the evolutionary engine can be made completely blind to *what* it
evolves and *what* problem it solves. The breadth of genome types is the proof.

> **Live demo:** _coming soon_ (GitHub Pages) — defaults to the predator–prey arms race.

<!-- TODO: drop a muted arms-race screenshot/GIF here once recorded (PRD §15). -->

## What works today

Ten environments, four genome types, and four search paradigms all run through
**one unchanged core**, rendered as a live "specimen plate" you can switch between:

| Plate | Environment | Genome | What it proves |
|------:|-------------|--------|----------------|
| I | **Predator–Prey** | network ×2 | competitive co-evolution — the default landing view; a live arms race with a CIAO progress plot |
| II | **Weasel** | string | a generic genome plugs into the core with no network at all |
| III | **Landscape** | float vector | the GA escapes Rastrigin's deceptive local optima |
| IV | **TSP** | permutation | order crossover keeps every route valid |
| V | **Cart-pole** | network | the first episodic control task |
| VI | **Track Runner** | network | raycast sensors + progress-led fitness shaping |
| VII | **Maze** | network | objective GA vs. Novelty Search on one deceptive maze, side by side |
| VIII | **Gait** | network | MAP-Elites illuminates an archive of viable hopping gaits |
| IX | **XOR** | network | the smallest honest test that the hand-written matrix math is correct |

The three decoupled axes — **representation** (`Genome`), **problem**
(`Environment`), and **selection pressure** (`SearchStrategy` + the co-evolution
and MAP-Elites drivers) — are the whole architecture. Every environment and every
paradigm is *proof* those independences hold: the core imports nothing from
`environments/`, `genomes/`, or `search/`, and the same seed reproduces a
byte-identical run.

### Honest caveats

- The maze demonstrates the **architectural** point — swap `GenerationalGA` for
  `NoveltySearch` with zero core changes — and both sides visibly, constructively
  learn. It does not reproduce the textbook Lehman & Stanley (2011) "objective
  gets stuck forever" separation at this maze's scale; the labelling reflects that
  rather than overclaiming (see [`.docs/known-issues.md`](.docs/known-issues.md),
  ADR-010).
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

TBD.
