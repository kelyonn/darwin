import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { StringGenome } from "../genomes/stringGenome.js";

/** Uppercase letters plus space — the alphabet of the Weasel target phrase. */
export const WEASEL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";

/**
 * The Weasel environment (PRD §10, Tier 0 #1): evolve a random string toward a
 * fixed target phrase. One-shot evaluation, no simulation, no neural network.
 * The first thing on screen and a complete proof that a generic genome plugs
 * into the engine.
 *
 * Fitness is the count of characters matching the target in the correct
 * position — a pure progress term an active search always beats a passive one
 * on, with no denominator to guard (PRD §6).
 */
export class WeaselEnvironment implements Environment {
  private readonly target: string;

  constructor(target: string, private readonly rng: Rng) {
    if (target.length === 0) {
      throw new RangeError("target must be non-empty");
    }
    const upper = target.toUpperCase();
    for (const char of upper) {
      if (!WEASEL_ALPHABET.includes(char)) {
        throw new RangeError(`target contains a character outside the alphabet: ${char}`);
      }
    }
    this.target = upper;
  }

  /** The maximum achievable fitness (a perfect match). */
  get maxFitness(): number {
    return this.target.length;
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () =>
      StringGenome.random(this.target.length, WEASEL_ALPHABET, this.rng),
    );
  }

  evaluate(genome: Genome): number {
    // The environment owns its genome type; the population is homogeneous.
    if (!(genome instanceof StringGenome)) {
      throw new TypeError("WeaselEnvironment can only evaluate a StringGenome");
    }
    const candidate = genome.value;
    let matches = 0;
    for (let i = 0; i < this.target.length; i++) {
      if (candidate[i] === this.target[i]) {
        matches++;
      }
    }
    return matches;
  }
}
