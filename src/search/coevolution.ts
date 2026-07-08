import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { reproduce, type BreedingConfig } from "../core/breeding.js";

/**
 * The result of one predator-versus-prey contest, from the predator's frame.
 * `predatorScore` and `preyScore` are graded and complementary
 * (`preyScore === 1 - predatorScore`); `captured` is the binary win used for
 * competitive fitness sharing (Rosin & Belew, 1997).
 */
export interface CompetitionOutcome {
  /** True if the predator caught the prey — the predator's binary win. */
  readonly captured: boolean;
  /** Graded predator payoff in [0, 1]; strictly above 0.5 iff `captured`. */
  readonly predatorScore: number;
  /** Graded prey payoff in [0, 1], equal to `1 - predatorScore`. */
  readonly preyScore: number;
}

/** Runs a single contest between a predator genome and a prey genome. */
export type CompeteFn = (predator: Genome, prey: Genome) => CompetitionOutcome;

/** Tuning parameters for {@link CoevolutionDriver}. */
export interface CoevolutionConfig extends BreedingConfig {
  /**
   * Number of current opponents each population is scored against per
   * generation (shared sampling). A single shared sample is reused for the whole
   * population so fitness sharing is comparable across contestants.
   */
  readonly opponentSampleSize: number;
  /**
   * Champions retained per population in the Hall of Fame. Each generation's best
   * is archived and added to every opponent set, which fights forgetting and
   * cycling (Rosin & Belew, 1997). Zero disables the archive.
   */
  readonly hallOfFameSize: number;
}

/** The two co-evolving populations advanced together each generation. */
export interface CoevolutionState {
  readonly predators: Genome[];
  readonly prey: Genome[];
}

/**
 * Per-generation observability snapshot. Because coevolutionary fitness is
 * relative (the Red Queen — RESEARCH.md §2.1), absolute fitness is not
 * comparable across generations; `captureRate` is the more honest arms-race
 * pulse — the fraction of contests the predators won this generation.
 */
export interface CoevolutionStats {
  readonly generation: number;
  readonly bestPredatorFitness: number;
  readonly bestPreyFitness: number;
  readonly meanPredatorFitness: number;
  readonly meanPreyFitness: number;
  readonly captureRate: number;
  readonly hallOfFameSize: number;
}

/** The outcome of advancing the arms race by one generation. */
export interface CoevolutionStepResult {
  readonly next: CoevolutionState;
  readonly stats: CoevolutionStats;
}

/**
 * Competitive fitness sharing (Rosin & Belew, 1997). Given a win matrix where
 * `wins[i][o]` is true iff contestant `i` beat shared opponent `o`, each
 * contestant scores `Σ 1 / (number of contestants that beat o)` over the
 * opponents it beat. Beating an opponent that few others beat is worth more,
 * which preserves diversity and rewards covering rare cases.
 *
 * The denominator is always at least one (a contestant only sums over opponents
 * it actually beat), so it can never blow up (PRD §6).
 *
 * @param wins Rectangular matrix; every row must share the opponent count.
 */
export function competitiveFitnessSharing(wins: readonly (readonly boolean[])[]): number[] {
  const contestants = wins.length;
  if (contestants === 0) {
    return [];
  }
  const opponents = (wins[0] as readonly boolean[]).length;

  const beatenBy = new Array<number>(opponents).fill(0);
  for (let i = 0; i < contestants; i++) {
    const row = wins[i] as readonly boolean[];
    if (row.length !== opponents) {
      throw new RangeError("win matrix must be rectangular");
    }
    for (let o = 0; o < opponents; o++) {
      if (row[o] as boolean) {
        beatenBy[o] = (beatenBy[o] as number) + 1;
      }
    }
  }

  const scores = new Array<number>(contestants).fill(0);
  for (let i = 0; i < contestants; i++) {
    const row = wins[i] as readonly boolean[];
    let score = 0;
    for (let o = 0; o < opponents; o++) {
      if (row[o] as boolean) {
        // beatenBy[o] >= 1 here: contestant i is itself one of the beaters.
        score += 1 / (beatenBy[o] as number);
      }
    }
    scores[i] = score;
  }
  return scores;
}

/**
 * Drives competitive co-evolution of two populations — predators and prey — in a
 * reciprocal arms race (PRD §10 Tier 3; RESEARCH.md §4). This is a distinct
 * driver, *not* a {@link SearchStrategy}: single-population `step` cannot express
 * a two-population contest whose fitness is relative and non-stationary.
 *
 * Each generation: build shared opponent samples (current sample + Hall of Fame)
 * for both sides; run the contests; score each contestant with a graded payoff
 * (which supplies a gradient even before any capture, defending against
 * disengagement) plus a competitive-fitness-sharing bonus (which defends
 * diversity); archive the generation's champions; then breed each population
 * with shared tournament + elitism.
 *
 * The driver is representation-blind: it interacts with candidates only through
 * {@link Genome} and the injected {@link CompeteFn}, so it never imports an
 * environment.
 */
export class CoevolutionDriver {
  private readonly predatorHallOfFame: Genome[] = [];
  private readonly preyHallOfFame: Genome[] = [];
  private generation = 0;

  constructor(
    private readonly compete: CompeteFn,
    private readonly config: CoevolutionConfig,
    private readonly rng: Rng,
  ) {
    const { populationSize, eliteCount, tournamentSize, opponentSampleSize, hallOfFameSize } = config;
    if (populationSize <= 0) {
      throw new RangeError(`populationSize must be positive, got ${populationSize}`);
    }
    if (eliteCount < 0 || eliteCount > populationSize) {
      throw new RangeError(`eliteCount must be within [0, ${populationSize}], got ${eliteCount}`);
    }
    if (tournamentSize <= 0) {
      throw new RangeError(`tournamentSize must be positive, got ${tournamentSize}`);
    }
    if (opponentSampleSize <= 0) {
      throw new RangeError(`opponentSampleSize must be positive, got ${opponentSampleSize}`);
    }
    if (hallOfFameSize < 0) {
      throw new RangeError(`hallOfFameSize must be non-negative, got ${hallOfFameSize}`);
    }
  }

  /** Advances both populations by one generation. */
  step(state: CoevolutionState): CoevolutionStepResult {
    const { predators, prey } = state;
    const preyOpponents = this.sampleOpponents(prey, this.preyHallOfFame);
    const predatorOpponents = this.sampleOpponents(predators, this.predatorHallOfFame);

    // Predators (rows) versus the shared prey opponents (columns).
    const predatorWins: boolean[][] = [];
    const predatorGraded = new Array<number>(predators.length).fill(0);
    let captureCount = 0;
    let contestCount = 0;
    for (let i = 0; i < predators.length; i++) {
      const predator = predators[i] as Genome;
      const row: boolean[] = [];
      let scoreSum = 0;
      for (const opponent of preyOpponents) {
        const outcome = this.compete(predator, opponent);
        row.push(outcome.captured);
        scoreSum += outcome.predatorScore;
        if (outcome.captured) {
          captureCount++;
        }
        contestCount++;
      }
      predatorWins.push(row);
      predatorGraded[i] = scoreSum / preyOpponents.length;
    }

    // Prey (rows) versus the shared predator opponents (columns).
    const preyWins: boolean[][] = [];
    const preyGraded = new Array<number>(prey.length).fill(0);
    for (let j = 0; j < prey.length; j++) {
      const preyGenome = prey[j] as Genome;
      const row: boolean[] = [];
      let scoreSum = 0;
      for (const opponent of predatorOpponents) {
        const outcome = this.compete(opponent, preyGenome);
        row.push(!outcome.captured);
        scoreSum += outcome.preyScore;
      }
      preyWins.push(row);
      preyGraded[j] = scoreSum / predatorOpponents.length;
    }

    this.assignFitness(predators, predatorGraded, competitiveFitnessSharing(predatorWins), preyOpponents.length);
    this.assignFitness(prey, preyGraded, competitiveFitnessSharing(preyWins), predatorOpponents.length);

    const rankedPredators = [...predators].sort((a, b) => b.fitness - a.fitness);
    const rankedPrey = [...prey].sort((a, b) => b.fitness - a.fitness);

    this.archive(this.predatorHallOfFame, rankedPredators[0] as Genome);
    this.archive(this.preyHallOfFame, rankedPrey[0] as Genome);

    const stats: CoevolutionStats = {
      generation: this.generation,
      bestPredatorFitness: (rankedPredators[0] as Genome).fitness,
      bestPreyFitness: (rankedPrey[0] as Genome).fitness,
      meanPredatorFitness: mean(predators),
      meanPreyFitness: mean(prey),
      captureRate: contestCount > 0 ? captureCount / contestCount : 0,
      hallOfFameSize: this.predatorHallOfFame.length,
    };
    this.generation++;

    return {
      next: {
        predators: reproduce(rankedPredators, this.config, this.rng),
        prey: reproduce(rankedPrey, this.config, this.rng),
      },
      stats,
    };
  }

  /**
   * Writes each contestant's fitness: the graded payoff (a smooth gradient) plus
   * the sharing bonus normalised into [0, 1] so neither term dominates by scale.
   */
  private assignFitness(
    population: readonly Genome[],
    graded: readonly number[],
    sharing: readonly number[],
    opponentCount: number,
  ): void {
    for (let i = 0; i < population.length; i++) {
      const bonus = opponentCount > 0 ? (sharing[i] as number) / opponentCount : 0;
      (population[i] as Genome).fitness = (graded[i] as number) + bonus;
    }
  }

  /** Draws `opponentSampleSize` distinct current opponents and appends the archive. */
  private sampleOpponents(current: readonly Genome[], hallOfFame: readonly Genome[]): Genome[] {
    const count = Math.min(this.config.opponentSampleSize, current.length);
    const indices = current.map((_, index) => index);
    // Partial Fisher–Yates: the first `count` slots become a uniform sample.
    for (let i = 0; i < count; i++) {
      const j = i + this.rng.int(indices.length - i);
      const swap = indices[i] as number;
      indices[i] = indices[j] as number;
      indices[j] = swap;
    }
    const sample: Genome[] = [];
    for (let i = 0; i < count; i++) {
      sample.push(current[indices[i] as number] as Genome);
    }
    return [...sample, ...hallOfFame];
  }

  /** Archives a clone of the generation's champion, evicting the oldest when full. */
  private archive(hallOfFame: Genome[], champion: Genome): void {
    if (this.config.hallOfFameSize <= 0) {
      return;
    }
    hallOfFame.push(champion.clone());
    if (hallOfFame.length > this.config.hallOfFameSize) {
      hallOfFame.shift();
    }
  }
}

function mean(population: readonly Genome[]): number {
  if (population.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const genome of population) {
    sum += genome.fitness;
  }
  return sum / population.length;
}
