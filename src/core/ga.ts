import type { Genome } from "./genome.js";
import type { Rng } from "./rng.js";
import type { SearchStrategy } from "./search.js";

/** Tuning parameters for {@link GenerationalGA}. */
export interface GaConfig {
  /** Number of genomes per generation. Must be positive. */
  readonly populationSize: number;
  /** Best genomes cloned unchanged into the next generation (PRD §7). */
  readonly eliteCount: number;
  /** Candidates drawn per tournament; the fittest wins a breeding slot. */
  readonly tournamentSize: number;
  /** Per-locus mutation rate passed to {@link Genome.mutate}. */
  readonly mutationRate: number;
}

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

    const next: Genome[] = [];
    for (let i = 0; i < this.config.eliteCount; i++) {
      // Safe: eliteCount <= populationSize === ranked.length.
      next.push((ranked[i] as Genome).clone());
    }

    while (next.length < this.config.populationSize) {
      const parentA = this.selectParent(ranked);
      const parentB = this.selectParent(ranked);
      next.push(parentA.crossover(parentB).mutate(this.config.mutationRate));
    }

    return next;
  }

  /** Tournament selection: sample `tournamentSize` genomes, return the fittest. */
  private selectParent(ranked: readonly Genome[]): Genome {
    let winner = this.rng.pick(ranked);
    for (let i = 1; i < this.config.tournamentSize; i++) {
      const challenger = this.rng.pick(ranked);
      if (challenger.fitness > winner.fitness) {
        winner = challenger;
      }
    }
    return winner;
  }
}
