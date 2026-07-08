import type { Genome } from "../core/genome.js";
import type { Environment } from "../environments/Environment.js";
import type { SearchStrategy } from "../core/search.js";
import { computeStats, fittest, type PopulationStats } from "../core/stats.js";

/** The outcome of advancing the population by one generation. */
export interface GenerationResult {
  readonly generation: number;
  /** The generation that was just evaluated (fitness populated). */
  readonly evaluated: readonly Genome[];
  readonly best: Genome;
  readonly stats: PopulationStats;
}

/**
 * Drives an {@link Environment} through a {@link SearchStrategy}, one generation
 * at a time, and records fitness history.
 *
 * It encapsulates the subtlety in ADR-003: `strategy.step` scores the incoming
 * generation and returns unevaluated children, so statistics are read from the
 * generation that was actually evaluated — never from the returned children.
 */
export class Runner {
  private population: Genome[];
  private generationCount = 0;
  private readonly fitnessHistory: PopulationStats[] = [];

  constructor(
    private readonly environment: Environment,
    private readonly strategy: SearchStrategy,
    populationSize: number,
  ) {
    this.population = environment.newPopulation(populationSize);
  }

  get generation(): number {
    return this.generationCount;
  }

  /** Fitness statistics for every generation advanced so far, in order. */
  get history(): readonly PopulationStats[] {
    return this.fitnessHistory;
  }

  /** Advances one generation and returns the evaluated generation and its stats. */
  advance(): GenerationResult {
    const evaluated = this.population;
    this.population = this.strategy.step(evaluated, (genome) => this.environment.evaluate(genome));
    this.generationCount++;

    const stats = computeStats(evaluated);
    const best = fittest(evaluated);
    this.fitnessHistory.push(stats);

    return { generation: this.generationCount, evaluated, best, stats };
  }
}
