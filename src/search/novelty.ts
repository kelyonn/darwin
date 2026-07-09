import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import type { SearchStrategy } from "../core/search.js";
import { reproduce, type BreedingConfig } from "../core/breeding.js";

/** Tuning parameters for {@link NoveltySearch}. */
export interface NoveltyConfig extends BreedingConfig {
  /** Neighbours averaged to compute novelty (the "k" in k-nearest). */
  readonly neighbours: number;
  /** Individuals at least this novel are added to the permanent archive. */
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

    for (let i = 0; i < population.length; i++) {
      const novelty = meanDistanceToNearest(behaviours[i] as readonly number[], reference, this.config.neighbours);
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

/** Mean Euclidean distance from `point` to its `k` nearest entries in `reference`. */
function meanDistanceToNearest(
  point: readonly number[],
  reference: readonly (readonly number[])[],
  k: number,
): number {
  const distances = reference.map((other) => euclidean(point, other)).sort((a, b) => a - b);
  // Skip index 0 when the point is its own nearest neighbour (distance 0).
  const start = distances[0] === 0 ? 1 : 0;
  const chosen = distances.slice(start, start + k);
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
