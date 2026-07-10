import type { Genome } from "./genome.js";
import type { Rng } from "./rng.js";

/** Parameters shared by every generational breeding step (PRD §7). */
export interface BreedingConfig {
  /** Number of genomes produced per generation. Must be positive. */
  readonly populationSize: number;
  /** Best genomes cloned unchanged into the next generation (elitism). */
  readonly eliteCount: number;
  /** Candidates drawn per tournament; the fittest wins a breeding slot. */
  readonly tournamentSize: number;
  /**
   * Mutation intensity passed to {@link Genome.mutate} — a "temperature" each
   * genome interprets in its own way (flip probability for strings, swap count
   * for permutations, perturbation size for vectors and networks).
   */
  readonly mutationRate: number;
  /**
   * Per-generation multiplier applied to `mutationRate` — the cooling schedule
   * that shifts search from exploration to refinement (PRD §7, "explore early,
   * refine late"). Must be in `(0, 1]`. Defaults to `1` (no decay), which keeps
   * behaviour byte-identical to a run without a schedule.
   */
  readonly mutationDecay?: number;
  /** Floor the annealed rate never drops below, so mutation never fully stops. Defaults to `0`. */
  readonly minMutationRate?: number;
}

/**
 * The mutation rate after `generation` generations of cooling:
 * `max(minMutationRate, mutationRate · mutationDecay ** generation)`.
 * With the defaults (`mutationDecay = 1`) this is a constant, so seeded runs
 * without a schedule reproduce byte-for-byte.
 */
export function annealedRate(config: BreedingConfig, generation: number): number {
  const decay = config.mutationDecay ?? 1;
  const floor = config.minMutationRate ?? 0;
  return Math.max(floor, config.mutationRate * decay ** generation);
}

/**
 * Tournament selection: sample `tournamentSize` genomes uniformly and return the
 * fittest. Chosen over top-N truncation, which collapses diversity too fast.
 */
export function tournamentSelect(
  pool: readonly Genome[],
  tournamentSize: number,
  rng: Rng,
): Genome {
  let winner = rng.pick(pool);
  for (let i = 1; i < tournamentSize; i++) {
    const challenger = rng.pick(pool);
    if (challenger.fitness > winner.fitness) {
      winner = challenger;
    }
  }
  return winner;
}

/**
 * Produces the next generation from a fitness-ranked population: the top
 * `eliteCount` genomes are cloned unchanged, and the remaining slots are filled
 * by tournament selection, crossover, and mutation.
 *
 * This is the one place selection and elitism live, so {@link GenerationalGA}
 * and the coevolution driver share identical, reproducible breeding behaviour.
 *
 * @param ranked Population already sorted fittest-first.
 */
export function reproduce(ranked: readonly Genome[], config: BreedingConfig, rng: Rng): Genome[] {
  const next: Genome[] = [];
  const elites = Math.min(config.eliteCount, ranked.length);
  for (let i = 0; i < elites; i++) {
    // Safe: i < elites <= ranked.length.
    next.push((ranked[i] as Genome).clone());
  }
  while (next.length < config.populationSize) {
    const parentA = tournamentSelect(ranked, config.tournamentSize, rng);
    const parentB = tournamentSelect(ranked, config.tournamentSize, rng);
    next.push(parentA.crossover(parentB).mutate(config.mutationRate));
  }
  return next;
}
