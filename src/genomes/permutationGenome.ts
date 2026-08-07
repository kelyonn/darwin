import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";

/**
 * A permutation of the integers `0 .. length-1` (PRD §4), used by TSP to
 * represent a route visiting every node exactly once. Uses no neural network.
 *
 * The defining constraint: every genetic operator must yield a *valid*
 * permutation — no repeated or missing element. Naïve crossover would violate
 * this, so crossover uses Order Crossover (OX).
 *
 * - `mutate`: swaps two positions (a rate-scaled number of swaps).
 * - `crossover`: Order Crossover — copy a contiguous slice from one parent, then
 *   fill the remaining positions with the other parent's elements in their
 *   original order, skipping those already taken.
 *
 * Immutable except for `fitness`; operators return new instances.
 */
export class PermutationGenome implements Genome {
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
    private readonly order: readonly number[],
    private readonly rng: Rng,
  ) {}

  /** Creates a uniformly random permutation of `0 .. length-1` (Fisher–Yates). */
  static random(length: number, rng: Rng): PermutationGenome {
    if (length <= 0) {
      throw new RangeError(`length must be positive, got ${length}`);
    }
    const order = Array.from({ length }, (_, index) => index);
    for (let i = length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      // Safe: i and j are both within [0, length).
      const temp = order[i] as number;
      order[i] = order[j] as number;
      order[j] = temp;
    }
    return new PermutationGenome(order, rng);
  }

  /** The visiting order encoded by this genome. */
  get sequence(): readonly number[] {
    return this.order;
  }

  clone(): PermutationGenome {
    const copy = new PermutationGenome(this.order, this.rng);
    copy.fitness = this.fitness;
    if (this.behaviour !== undefined) {
      copy.behaviour = this.behaviour;
    }
    return copy;
  }

  mutate(rate: number): PermutationGenome {
    const mutated = [...this.order];
    // Scale the number of swaps with the rate, always performing at least one
    // when a mutation is triggered, so the operator has an effect.
    const swaps = Math.max(1, Math.round(rate * mutated.length));
    for (let s = 0; s < swaps; s++) {
      const i = this.rng.int(mutated.length);
      const j = this.rng.int(mutated.length);
      const temp = mutated[i] as number;
      mutated[i] = mutated[j] as number;
      mutated[j] = temp;
    }
    return new PermutationGenome(mutated, this.rng);
  }

  crossover(other: Genome): PermutationGenome {
    if (!(other instanceof PermutationGenome)) {
      throw new TypeError("PermutationGenome can only cross over with another PermutationGenome");
    }
    const length = this.order.length;
    if (other.order.length !== length) {
      throw new RangeError("cannot cross over permutations of different lengths");
    }

    // Choose a contiguous slice [start, end) to inherit from this parent.
    const start = this.rng.int(length);
    const end = start + this.rng.int(length - start) + 1;

    const child = new Array<number>(length);
    const taken = new Set<number>();
    for (let i = start; i < end; i++) {
      const value = this.order[i] as number;
      child[i] = value;
      taken.add(value);
    }

    // Fill the remaining slots with the other parent's elements in order,
    // wrapping around from just after the slice, skipping any already taken.
    let cursor = end % length;
    for (let k = 0; k < length; k++) {
      const candidate = other.order[(end + k) % length] as number;
      if (!taken.has(candidate)) {
        child[cursor] = candidate;
        taken.add(candidate);
        cursor = (cursor + 1) % length;
      }
    }

    return new PermutationGenome(child, this.rng);
  }
}
