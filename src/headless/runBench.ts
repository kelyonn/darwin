import { Rng } from "../core/rng.js";
import { GenerationalGA } from "../core/ga.js";
import { Runner } from "../app/runner.js";
import type { Environment } from "../environments/Environment.js";
import { XorEnvironment } from "../environments/xor.js";
import { CartPoleEnvironment } from "../environments/cartpole.js";
import { LandscapeEnvironment } from "../environments/landscape.js";

/**
 * Headless performance harness (M8; PRD §8, "the scale mandate").
 *
 * Reports *measured* generations/sec and genome-evaluations/sec for a
 * representative one-shot environment and a representative episodic one, at
 * increasing population sizes — the "scale until it breaks" number, taken on
 * whatever machine runs it. **No number here is fabricated** (PRD §8); this file
 * only ever prints what it just timed.
 *
 * Motivating finding (see `.docs/known-issues.md`, M8): `Network.feedForward` is
 * already zero-allocation (it reuses preallocated activation buffers), so the
 * only per-generation churn is genome *creation* — each bred child allocates two
 * `Float32Array`s (one in `crossover`, one in `mutate`) and each elite clone one.
 * That is O(populationSize) small typed arrays per generation, independent of the
 * evaluation cost. This harness exists to show which of the two — allocation or
 * evaluation — actually dominates, so any optimisation targets the real hot path.
 */

interface BenchRow {
  readonly label: string;
  readonly populationSize: number;
  readonly generations: number;
  readonly millis: number;
  readonly gensPerSec: number;
  readonly evalsPerSec: number;
  /**
   * Genome objects allocated per generation: 2 per bred child (one in
   * `crossover`, one in `mutate`) + 1 per elite clone (analytic, and
   * representation-agnostic — each carries its own backing array).
   */
  readonly allocPerGen: number;
}

/** Elite fraction (~8%) matches the demo's plateau fix (ADR-008). */
function eliteCountFor(populationSize: number): number {
  return Math.max(1, Math.round(populationSize * 0.08));
}

/** Times `generations` of evolution and returns throughput, after a warm-up. */
function bench(
  label: string,
  makeEnv: (rng: Rng) => Environment,
  populationSize: number,
  generations: number,
  warmup: number,
): BenchRow {
  const eliteCount = eliteCountFor(populationSize);
  const run = (gens: number): void => {
    const rng = new Rng(42);
    const environment = makeEnv(rng);
    const ga = new GenerationalGA({ populationSize, eliteCount, tournamentSize: 5, mutationRate: 0.3 }, rng);
    const runner = new Runner(environment, ga, populationSize);
    for (let g = 0; g < gens; g++) runner.advance();
  };

  run(warmup); // let V8 JIT warm before timing
  const start = performance.now();
  run(generations);
  const millis = performance.now() - start;

  const gensPerSec = (generations / millis) * 1000;
  const allocPerGen = 2 * (populationSize - eliteCount) + eliteCount;
  return {
    label,
    populationSize,
    generations,
    millis,
    gensPerSec,
    evalsPerSec: gensPerSec * populationSize,
    allocPerGen,
  };
}

function formatRow(r: BenchRow): string {
  return (
    `${r.label.padEnd(20)} pop=${String(r.populationSize).padStart(5)}  ` +
    `${r.gensPerSec.toFixed(1).padStart(8)} gen/s  ` +
    `${Math.round(r.evalsPerSec).toLocaleString("en-US").padStart(12)} eval/s  ` +
    `${String(r.allocPerGen).padStart(6)} genomes/gen`
  );
}

function main(): void {
  process.stdout.write(
    `Project Darwin — performance bench (measured on this machine; Node ${process.version})\n` +
      `Every number below was just timed here — none is copied or assumed (PRD §8).\n\n`,
  );

  const sizes = [100, 300, 1000, 3000];
  const rows: BenchRow[] = [];

  // One-shot, near-zero evaluation cost: isolates the genome-churn / GA overhead.
  for (const size of sizes) {
    rows.push(bench("xor (one-shot)", (rng) => new XorEnvironment(4, rng), size, 60, 10));
  }
  // One-shot vector genome (no network at all): a second churn reference point.
  for (const size of sizes) {
    rows.push(bench("landscape (vector)", (rng) => new LandscapeEnvironment(2, rng), size, 60, 10));
  }
  // Episodic: evaluation dominates (a 600-tick sim × 3 trials per genome).
  for (const size of [100, 300, 1000]) {
    rows.push(bench("cartpole (episodic)", (rng) => new CartPoleEnvironment(600, 6, 3, rng), size, 8, 2));
  }

  for (const r of rows) process.stdout.write(formatRow(r) + "\n");

  process.stdout.write(
    `\nReading it: eval/s that keeps climbing with population means the GA/allocation\n` +
      `overhead is not the ceiling; where gen/s collapses is the scale limit for that\n` +
      `environment. Compare the one-shot rows (allocation-bound) against the episodic\n` +
      `rows (evaluation-bound) to see which cost actually dominates before optimising.\n`,
  );
}

main();
