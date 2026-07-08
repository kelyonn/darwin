import type { Genome } from "./genome.js";

/** Summary of a population's fitness distribution for one generation. */
export interface PopulationStats {
  readonly best: number;
  readonly worst: number;
  readonly average: number;
  /**
   * Standard deviation of fitness — a representation-blind proxy for diversity
   * (PRD §9). True genotypic diversity requires a genome distance metric, which
   * would couple `core/` to representation and is therefore deferred to the
   * behaviour-descriptor machinery (see .docs/decisions.md, ADR-002).
   */
  readonly spread: number;
}

/**
 * Computes fitness statistics over an already-evaluated population.
 * Assumes each genome's `fitness` reflects the current generation.
 *
 * @throws if the population is empty.
 */
export function computeStats(population: readonly Genome[]): PopulationStats {
  if (population.length === 0) {
    throw new RangeError("cannot compute stats over an empty population");
  }

  let best = -Infinity;
  let worst = Infinity;
  let sum = 0;
  for (const { fitness } of population) {
    if (fitness > best) best = fitness;
    if (fitness < worst) worst = fitness;
    sum += fitness;
  }
  const average = sum / population.length;

  let squaredError = 0;
  for (const { fitness } of population) {
    const delta = fitness - average;
    squaredError += delta * delta;
  }
  const spread = Math.sqrt(squaredError / population.length);

  return { best, worst, average, spread };
}

/**
 * Returns the genome with the highest fitness. Assumes the population is
 * already evaluated. Representation-blind (compares `fitness` only).
 * @throws if the population is empty.
 */
export function fittest(population: readonly Genome[]): Genome {
  if (population.length === 0) {
    throw new RangeError("cannot select the fittest of an empty population");
  }
  let leader = population[0] as Genome;
  for (const genome of population) {
    if (genome.fitness > leader.fitness) {
      leader = genome;
    }
  }
  return leader;
}
