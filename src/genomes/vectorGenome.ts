import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";

/**
 * A fixed-length vector of real numbers (PRD §4). For the Landscape optimizer
 * the genome *is* the coordinates of a point being scored. Uses no neural
 * network.
 *
 * - `mutate`: adds independent Gaussian noise to each component, with the step
 *   size scaled by `rate` — so a cooling schedule (PRD §7) anneals the search
 *   radius from coarse exploration down to fine refinement onto the optimum.
 * - `crossover`: component-wise arithmetic blend of two parents.
 *
 * Immutable except for `fitness`; operators return new instances.
 */
export class VectorGenome implements Genome {
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
    private readonly values: readonly number[],
    private readonly stdDev: number,
    private readonly bounds: readonly [number, number],
    private readonly rng: Rng,
  ) {}

  /**
   * Creates a genome with each component drawn uniformly from `[min, max]`.
   * @param stdDev Standard deviation of Gaussian mutation.
   * @param bounds Inclusive `[min, max]` clamp applied after every operator.
   */
  static random(
    length: number,
    stdDev: number,
    bounds: readonly [number, number],
    rng: Rng,
  ): VectorGenome {
    if (length <= 0) {
      throw new RangeError(`length must be positive, got ${length}`);
    }
    const [min, max] = bounds;
    if (min >= max) {
      throw new RangeError(`bounds must satisfy min < max, got [${min}, ${max}]`);
    }
    const values = Array.from({ length }, () => min + rng.next() * (max - min));
    return new VectorGenome(values, stdDev, bounds, rng);
  }

  /** The coordinates encoded by this genome. */
  get coordinates(): readonly number[] {
    return this.values;
  }

  clone(): VectorGenome {
    const copy = new VectorGenome(this.values, this.stdDev, this.bounds, this.rng);
    copy.fitness = this.fitness;
    if (this.behaviour !== undefined) {
      copy.behaviour = this.behaviour;
    }
    return copy;
  }

  mutate(rate: number): VectorGenome {
    // Every coordinate moves, by a radius that shrinks with `rate`: coarse jumps
    // early (escape local optima), tiny steps late (settle onto the optimum).
    const mutated = this.values.map((value) =>
      this.clamp(value + this.rng.gaussian(0, this.stdDev * rate)),
    );
    return new VectorGenome(mutated, this.stdDev, this.bounds, this.rng);
  }

  crossover(other: Genome): VectorGenome {
    if (!(other instanceof VectorGenome)) {
      throw new TypeError("VectorGenome can only cross over with another VectorGenome");
    }
    if (other.values.length !== this.values.length) {
      throw new RangeError("cannot cross over genomes of different lengths");
    }
    const blend = this.values.map((value, index) => {
      const weight = this.rng.next();
      // Safe: both genomes share this length (checked above).
      const otherValue = other.values[index] as number;
      return this.clamp(weight * value + (1 - weight) * otherValue);
    });
    return new VectorGenome(blend, this.stdDev, this.bounds, this.rng);
  }

  private clamp(value: number): number {
    const [min, max] = this.bounds;
    return Math.min(max, Math.max(min, value));
  }
}
