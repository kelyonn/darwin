/**
 * The keystone contract (PRD §4).
 *
 * The genetic algorithm understands nothing about representation — it interacts
 * with candidates *only* through this interface plus a fitness callback supplied
 * by the Environment. A string, a numeric vector, a route permutation, and a
 * neural network all implement this identically and travel the same code path.
 *
 * The genome owns its own genetics: `mutate` and `crossover` live here, not on
 * the GA, so the algorithm never inspects representation internals.
 *
 * Randomness note: the spec signatures for `mutate`/`crossover` take no RNG
 * argument. Implementations therefore receive a shared seeded `Rng` at
 * construction and draw from it internally, so that all randomness still flows
 * through one reproducible stream (see .docs/decisions.md, ADR-001).
 */
export interface Genome {
  /** Deep copy, preserving fitness. Used for elitism. */
  clone(): Genome;

  /**
   * Returns a new, independent genome that is a mutated copy of this one.
   * @param rate Genome-specific mutation intensity, typically a per-locus
   *             probability in [0, 1].
   */
  mutate(rate: number): Genome;

  /**
   * Returns a new child genome combining this genome with another of the same
   * concrete type. The population is homogeneous, so implementations may assume
   * `other` is their own type and should fail loudly if it is not.
   */
  crossover(other: Genome): Genome;

  /**
   * Fitness score, written by the Environment during evaluation and read by the
   * GA during selection. Higher is better by convention (PRD §6).
   */
  fitness: number;

  /**
   * Optional behaviour descriptor, read by divergent-search strategies
   * (Novelty Search, MAP-Elites). Objective selection ignores it. Absent for
   * genomes/environments that define no behaviour space.
   */
  readonly behaviour?: readonly number[];
}
