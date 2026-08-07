import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import type { SearchStrategy } from "../core/search.js";
import { reproduce, type BreedingConfig } from "../core/breeding.js";

/** Tuning parameters for {@link NoveltySearch}. */
export interface NoveltyConfig extends BreedingConfig {
  /** Neighbours averaged to compute novelty (the "k" in k-nearest). */
  readonly neighbours: number;
  /** Individuals at least this novel are added to the archive (bounded by {@link archiveLimit}, not permanent). */
  readonly archiveThreshold: number;
  /** Maximum archive size; the oldest entries are evicted beyond it. */
  readonly archiveLimit: number;
}

/**
 * Novelty Search (Lehman & Stanley, 2011): abandon the objective and select for
 * behavioural *novelty* alone. Each genome's fitness is replaced by how far its
 * behaviour descriptor lies from its nearest neighbours among the current
 * population and a growing archive of past behaviours. On deceptive problems
 * (the maze) this escapes the local optimum that objective fitness walks into.
 *
 * It is an ordinary {@link SearchStrategy} — single population — because only the
 * *scoring* changes, not the population structure. The Environment must write a
 * `behaviour` descriptor onto each genome during `evaluate`; the returned
 * objective value is deliberately ignored.
 */
export class NoveltySearch implements SearchStrategy {
  private readonly archive: (readonly number[])[] = [];

  constructor(
    private readonly config: NoveltyConfig,
    private readonly rng: Rng,
  ) {
    if (config.neighbours <= 0) {
      throw new RangeError(`neighbours must be positive, got ${config.neighbours}`);
    }
  }

  /** The behaviours collected so far, for rendering the explored space. */
  get exploredBehaviours(): readonly (readonly number[])[] {
    return this.archive;
  }

  step(population: Genome[], evaluate: (genome: Genome) => number): Genome[] {
    for (const genome of population) {
      // Runs the sim and writes `behaviour`; the objective return is ignored.
      evaluate(genome);
    }

    const behaviours = population.map((genome) => behaviourOf(genome));
    const reference = [...this.archive, ...behaviours];
    // Captured once: `this.archive` is mutated mid-loop below (`addToArchive`
    // can push/shift it), but `reference`'s layout — and therefore where each
    // `behaviours[i]` sits within it — was fixed the instant it was built above.
    const referenceOffset = this.archive.length;

    for (let i = 0; i < population.length; i++) {
      // `behaviours[i]` sits at index `referenceOffset + i` within `reference`
      // (the archive entries precede it) — excluded by that index, not
      // inferred from a zero distance, so a genuine archived or sibling
      // behaviour identical to this one is still correctly counted as a real
      // neighbour rather than mistaken for self.
      const novelty = meanDistanceToNearest(referenceOffset + i, reference, this.config.neighbours);
      (population[i] as Genome).fitness = novelty;
      if (novelty >= this.config.archiveThreshold) {
        this.addToArchive(behaviours[i] as readonly number[]);
      }
    }

    const ranked = [...population].sort((a, b) => b.fitness - a.fitness);
    // Guarantee the archive keeps growing even when nothing clears the threshold,
    // so exploration never stalls.
    if (this.archive.length === 0) {
      this.addToArchive(behaviourOf(ranked[0] as Genome));
    }
    // Unlike GenerationalGA, this deliberately does not anneal mutationRate.
    // Annealing (PRD §7) exists to cool exploration into refinement around a
    // converging objective — the opposite of what Novelty Search wants.
    // There is no target to converge onto here; cooling mutation over time
    // would work against the entire mechanism, which depends on sustained
    // exploration to keep finding new behaviours generation after generation.
    return reproduce(ranked, this.config, this.rng);
  }

  private addToArchive(behaviour: readonly number[]): void {
    this.archive.push(behaviour);
    if (this.archive.length > this.config.archiveLimit) {
      this.archive.shift();
    }
  }
}

function behaviourOf(genome: Genome): readonly number[] {
  if (genome.behaviour === undefined) {
    throw new Error("Novelty Search requires the environment to set genome.behaviour");
  }
  return genome.behaviour;
}

/**
 * Mean Euclidean distance from `reference[pointIndex]` to its `k` nearest
 * *other* entries in `reference`. `pointIndex` is excluded explicitly by
 * index — not inferred from a zero distance — so a genuine other entry that
 * happens to share the exact same behaviour (common early in a run, when many
 * agents die at the same wall) is still correctly counted as a real,
 * zero-distance neighbour rather than mistaken for self.
 */
function meanDistanceToNearest(
  pointIndex: number,
  reference: readonly (readonly number[])[],
  k: number,
): number {
  const point = reference[pointIndex] as readonly number[];
  const distances: number[] = [];
  for (let i = 0; i < reference.length; i++) {
    if (i === pointIndex) continue;
    distances.push(euclidean(point, reference[i] as readonly number[]));
  }
  distances.sort((a, b) => a - b);
  const chosen = distances.slice(0, k);
  if (chosen.length === 0) {
    return 0;
  }
  return chosen.reduce((sum, d) => sum + d, 0) / chosen.length;
}

function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = (a[i] as number) - (b[i] as number);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}
