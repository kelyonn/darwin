import type { Genome } from "./genome.js";
import type { Rng } from "./rng.js";
import type { SearchStrategy } from "./search.js";
import { reproduce, annealedRate, type BreedingConfig } from "./breeding.js";

/** Tuning parameters for {@link GenerationalGA}. */
export type GaConfig = BreedingConfig;

/**
 * The generational genetic algorithm (PRD §7): evaluate, sort, select, breed,
 * replace. It talks only to the {@link Genome} interface and a fitness
 * callback, so it is completely representation-blind.
 *
 * Selection is tournament-based (chosen over top-N truncation, which collapses
 * diversity too fast). Elitism guarantees the best fitness never regresses
 * across generations.
 */
export class GenerationalGA implements SearchStrategy {
  private generation = 0;

  constructor(
    private readonly config: GaConfig,
    private readonly rng: Rng,
  ) {
    const { populationSize, eliteCount, tournamentSize } = config;
    if (populationSize <= 0) {
      throw new RangeError(`populationSize must be positive, got ${populationSize}`);
    }
    if (eliteCount < 0 || eliteCount > populationSize) {
      throw new RangeError(`eliteCount must be within [0, ${populationSize}], got ${eliteCount}`);
    }
    if (tournamentSize <= 0) {
      throw new RangeError(`tournamentSize must be positive, got ${tournamentSize}`);
    }
  }

  step(population: Genome[], evaluate: (genome: Genome) => number): Genome[] {
    for (const genome of population) {
      genome.fitness = evaluate(genome);
    }

    // Rank fittest-first. Array.prototype.sort is stable (ES2019+), so ties
    // preserve prior order — a prerequisite for reproducibility.
    const ranked = [...population].sort((a, b) => b.fitness - a.fitness);

    const rate = annealedRate(this.config, this.generation);
    this.generation++;
    return reproduce(ranked, { ...this.config, mutationRate: rate }, this.rng);
  }
}
