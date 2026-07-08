# Future Work

Upside beyond the shipped engine. None is required for the project to be worth
showing; ordered roughly by value-to-effort.

## Shipping (highest real-world value)
- **Host the static bundle** (GitHub Pages / Netlify / Cloudflare Pages). `npm run build`
  → deploy `dist/`. A public demo link matters more than any further feature.
- Record a muted autoplay GIF of the arms race for the README's first screenful (PRD §15).

## Observability
- **Dominance tournament / frozen-benchmark probe** — an absolute progress metric to
  complement the CIAO plot, since coevolutionary fitness is relative (RESEARCH.md §4.5).
- Auto-detect cycling from the CIAO matrix and surface a warning (a step toward closing
  the loop: trigger a stabiliser online).

## Engine (M6, M10)
- Track runner (raycast sensors; held-out track layouts teach train/test discipline).
- Novelty search + deceptive maze; MAP-Elites + gait creature. Note: the gait creature
  needs a hand-written 2-D physics sim — a known time sink; scope it tightly or defer.
- Steady-state "pond" ecosystem as a second population *driver* (PRD §11), now unblocked.

## Performance (M8, M12)
- Buffer pooling + Web Worker; then the three-backend kernel (CPU-JS → Rust→WASM →
  WebGPU compute) with a *measured* benchmark table. WebGPU targets the parallel-friendly
  envs first (one-shot / batched eval); episodic branching stays on CPU initially.

## Research
- The cross-representation study (RESEARCH.md H1/H2): do coevolution stabilisers behave
  the same across string/vector/permutation/network genomes? Needs the headless batch
  runner (M11) and ≥30-seed statistics. Publication paths: JOSS / GECCO / EvoStar.
