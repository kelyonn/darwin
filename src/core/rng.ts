/**
 * Seeded pseudo-random number generator (Mulberry32).
 *
 * Every stochastic choice in the engine — population initialisation, mutation,
 * crossover, tournament selection — must draw from a single instance of this
 * class so that a given seed reproduces a byte-identical run (PRD §2, §14).
 * There is intentionally no access to `Math.random()` anywhere in `core/`,
 * `genomes/`, or `search/`.
 *
 * Mulberry32 is a fast 32-bit generator with good statistical quality for
 * simulation purposes. It is not cryptographically secure and is not intended
 * to be.
 */
export class Rng {
  private state: number;

  /**
   * @param seed Any integer. Coerced to an unsigned 32-bit value; identical
   *             seeds produce identical streams.
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns the next float in the half-open interval [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in the half-open interval [0, maxExclusive).
   * @throws if `maxExclusive` is not a positive integer.
   */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(this.next() * maxExclusive);
  }

  /**
   * Returns a uniformly-chosen element from a non-empty list.
   * @throws if `items` is empty.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("cannot pick from an empty list");
    }
    // Safe: index is in [0, length) and length > 0.
    return items[this.int(items.length)] as T;
  }

  /**
   * Returns a normally-distributed value via the Box–Muller transform.
   * Used for Gaussian mutation of numeric genomes and network weights.
   * @param mean   Distribution mean.
   * @param stdDev Standard deviation; must be non-negative.
   */
  gaussian(mean = 0, stdDev = 1): number {
    if (stdDev < 0) {
      throw new RangeError(`stdDev must be non-negative, got ${stdDev}`);
    }
    // next() yields [0, 1); shift the first draw off zero so log() is finite.
    const u1 = 1 - this.next();
    const u2 = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    return mean + stdDev * magnitude * Math.cos(2 * Math.PI * u2);
  }
}
