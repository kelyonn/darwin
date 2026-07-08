import type { Genome } from "./genome.js";

/**
 * A selection paradigm — the third decoupled axis (ARCHITECTURE §1, §3.3).
 *
 * A strategy advances a population by one step. `GenerationalGA` is one
 * implementation; Novelty Search, MAP-Elites, and competitive coevolution are
 * siblings living under `src/search/`, not special cases of the GA.
 *
 * The strategy is genome-blind: it receives an `evaluate` callback and never
 * inspects representation.
 */
export interface SearchStrategy {
  /**
   * Consumes the current population and returns the next one.
   * @param population The current generation. May be mutated in place
   *                   (fitness is written onto its members during evaluation).
   * @param evaluate   Scores a single genome. Supplied by the Environment.
   */
  step(population: Genome[], evaluate: (genome: Genome) => number): Genome[];
}
