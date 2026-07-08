# Project Darwin

A representation-blind **neuroevolution engine**, hand-written in TypeScript with
**zero runtime dependencies** — no TensorFlow, no ML libraries, no UI framework.
One unchanged core evolves neural networks *and* strings, numeric vectors, and
route permutations across interchangeable problem environments, all in the browser.

The thesis: the evolutionary engine can be made completely blind to *what* it
evolves and *what* problem it solves. The breadth of genome types is the proof.

## Status

Early build. Working today:

- **Core engine** — seeded PRNG, the `Genome` / `Environment` / `SearchStrategy`
  interfaces, a generational GA (tournament selection, elitism), fitness stats.
- **Weasel** — a string genome evolving toward `PROJECT DARWIN`, on screen.

Roadmap and milestone status: [`.docs/progress.md`](.docs/progress.md).

## Run it

```bash
npm install
npm run dev      # Weasel at http://localhost:5173
npm test         # unit tests (reproducibility, elitism, genome operators)
npm run typecheck
```

## Documentation

- [`docs/Project-Darwin-PRD.md`](docs/Project-Darwin-PRD.md) — product requirements & thesis
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the three decoupled axes, interfaces, performance
- [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) — every environment, specified
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — biological & technical lineage, the open research question
- `docs/explainer.typ` — plain-language intro (compile with `typst compile`)
- [`CLAUDE.md`](CLAUDE.md) — contributor brief

## License

TBD.
