import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";

/**
 * A fixed-length string over a fixed alphabet, evolved character by character
 * (PRD §4). Used by the Weasel environment. Uses no neural network — it is one
 * of the cleanest proofs that the GA is representation-blind.
 *
 * - `mutate`: each character is independently replaced with probability `rate`.
 * - `crossover`: uniform per-character mix of two parents.
 *
 * Instances are immutable except for `fitness`; genetic operators return new
 * instances rather than modifying in place.
 */
export class StringGenome implements Genome {
  fitness = 0;

  /**
   * Behaviour descriptor, written by divergent-search environments and read by
   * Novelty Search and MAP-Elites. Objective selection ignores it. Left unset
   * (absent) by objective environments; `exactOptionalPropertyTypes` forbids
   * assigning `undefined` explicitly, so this is a true optional property
   * (ADR-007) — the same pattern `Network` uses, extended to every genome so
   * divergent search is not network-only (ADR-013).
   */
  behaviour?: readonly number[];

  private constructor(
    private readonly chars: readonly string[],
    private readonly alphabet: string,
    private readonly rng: Rng,
  ) {}

  /** Creates a random genome of the given length over `alphabet`. */
  static random(length: number, alphabet: string, rng: Rng): StringGenome {
    if (length <= 0) {
      throw new RangeError(`length must be positive, got ${length}`);
    }
    if (alphabet.length === 0) {
      throw new RangeError("alphabet must be non-empty");
    }
    const chars = Array.from({ length }, () => randomChar(alphabet, rng));
    return new StringGenome(chars, alphabet, rng);
  }

  /** The decoded string value of this genome. */
  get value(): string {
    return this.chars.join("");
  }

  clone(): StringGenome {
    const copy = new StringGenome(this.chars, this.alphabet, this.rng);
    copy.fitness = this.fitness;
    if (this.behaviour !== undefined) {
      copy.behaviour = this.behaviour;
    }
    return copy;
  }

  mutate(rate: number): StringGenome {
    const mutated = this.chars.map((char) =>
      this.rng.next() < rate ? randomChar(this.alphabet, this.rng) : char,
    );
    return new StringGenome(mutated, this.alphabet, this.rng);
  }

  crossover(other: Genome): StringGenome {
    if (!(other instanceof StringGenome)) {
      throw new TypeError("StringGenome can only cross over with another StringGenome");
    }
    if (other.chars.length !== this.chars.length) {
      throw new RangeError("cannot cross over genomes of different lengths");
    }
    const child = this.chars.map((char, index) =>
      // Safe: both genomes share this length (checked above).
      this.rng.next() < 0.5 ? char : (other.chars[index] as string),
    );
    return new StringGenome(child, this.alphabet, this.rng);
  }
}

function randomChar(alphabet: string, rng: Rng): string {
  // Safe: index is in [0, alphabet.length) and the alphabet is non-empty.
  return alphabet[rng.int(alphabet.length)] as string;
}
