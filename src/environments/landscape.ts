import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { VectorGenome } from "../genomes/vectorGenome.js";
import { StringGenome } from "../genomes/stringGenome.js";

/** Search-space bounds for the Rastrigin function (the standard domain). */
const RASTRIGIN_BOUNDS: readonly [number, number] = [-5.12, 5.12];
const RASTRIGIN_STD_DEV = 0.5;

/**
 * Evaluates the Rastrigin function at `point` (PRD §10, Tier 0 #2).
 *
 * Rastrigin is highly multimodal — a paraboloid studded with a regular lattice
 * of local optima — so it is a genuine test that the GA escapes deceptive local
 * optima rather than a trivial hill climb. The global minimum is 0 at the origin.
 */
export function rastrigin(point: readonly number[]): number {
  const a = 10;
  let sum = a * point.length;
  for (const x of point) {
    sum += x * x - a * Math.cos(2 * Math.PI * x);
  }
  return sum;
}

/**
 * How a genome encodes a point in the search space — the representation axis,
 * injected rather than hard-wired (ADR-013). `LandscapeEnvironment` owns the
 * *problem* (Rastrigin); a `PointEncoding` owns only how a genome decodes into
 * the coordinates that problem is scored on.
 */
export interface PointEncoding {
  /** Creates a fresh population of this encoding's genome type. */
  newPopulation(size: number): Genome[];
  /** Decodes a genome into the point it encodes, one coordinate per dimension. */
  decode(genome: Genome): readonly number[];
}

/** Builds a {@link PointEncoding} once the environment knows its dimensionality. */
export type PointEncodingFactory = (dimensions: number, rng: Rng) => PointEncoding;

/**
 * The original Landscape genome: a real-valued vector, one component per
 * dimension. `decode` is the identity — the genome already *is* the point.
 */
export class RealCodedEncoding implements PointEncoding {
  constructor(
    private readonly dimensions: number,
    private readonly rng: Rng,
  ) {}

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () =>
      VectorGenome.random(this.dimensions, RASTRIGIN_STD_DEV, RASTRIGIN_BOUNDS, this.rng),
    );
  }

  decode(genome: Genome): readonly number[] {
    if (!(genome instanceof VectorGenome)) {
      throw new TypeError("RealCodedEncoding can only decode a VectorGenome");
    }
    return genome.coordinates;
  }
}

/** Binary alphabet for {@link BinaryEncoding}'s `StringGenome`. */
const BINARY_ALPHABET = "01";
/** Bits per dimension: 2^16 distinct values across the Rastrigin domain (width ≈10.24) gives ≈0.00016 resolution — comfortably finer than the lattice of local optima being searched. */
const DEFAULT_BITS_PER_DIMENSION = 16;

/**
 * Classic binary-coded GA encoding for continuous optimisation: each dimension
 * is a fixed-width bit string interpreted as an unsigned integer and mapped
 * linearly onto the Rastrigin domain. `StringGenome`'s existing per-character
 * mutation and uniform crossover — built for the Weasel phrase, not for
 * numeric optimisation — solve the identical problem `RealCodedEncoding`'s
 * Gaussian mutation was purpose-built for. The same problem, two unrelated
 * genetic representations, through the one unchanged core (PRD §0, §4; see
 * `--study cross-representation`).
 */
export class BinaryEncoding implements PointEncoding {
  private readonly bitsPerDimension: number;

  constructor(
    private readonly dimensions: number,
    private readonly rng: Rng,
    bitsPerDimension: number = DEFAULT_BITS_PER_DIMENSION,
  ) {
    if (bitsPerDimension <= 0) {
      throw new RangeError(`bitsPerDimension must be positive, got ${bitsPerDimension}`);
    }
    this.bitsPerDimension = bitsPerDimension;
  }

  private get length(): number {
    return this.dimensions * this.bitsPerDimension;
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => StringGenome.random(this.length, BINARY_ALPHABET, this.rng));
  }

  decode(genome: Genome): readonly number[] {
    if (!(genome instanceof StringGenome)) {
      throw new TypeError("BinaryEncoding can only decode a StringGenome");
    }
    const bits = genome.value;
    const [min, max] = RASTRIGIN_BOUNDS;
    const maxUnsigned = 2 ** this.bitsPerDimension - 1;
    const coordinates: number[] = [];
    for (let dimension = 0; dimension < this.dimensions; dimension++) {
      const chunk = bits.slice(dimension * this.bitsPerDimension, (dimension + 1) * this.bitsPerDimension);
      const value = Number.parseInt(chunk, 2);
      coordinates.push(min + (value / maxUnsigned) * (max - min));
    }
    return coordinates;
  }
}

/**
 * The Landscape optimizer environment. The genome encodes a point; fitness
 * rewards proximity to the global minimum via `1 / (1 + value)` — a guarded
 * denominator (PRD §6) that peaks at 1 when the function value is 0.
 *
 * The environment owns the problem only — which genome type encodes a point is
 * an injected {@link PointEncoding}, defaulting to the original
 * {@link RealCodedEncoding} so every existing call site is unaffected.
 */
export class LandscapeEnvironment implements Environment {
  private readonly encoding: PointEncoding;

  /**
   * @param encodingFactory Builds the {@link PointEncoding} once the
   *   dimensionality is known. Defaults to {@link RealCodedEncoding}.
   */
  constructor(dimensions: number, rng: Rng, encodingFactory?: PointEncodingFactory) {
    if (dimensions <= 0) {
      throw new RangeError(`dimensions must be positive, got ${dimensions}`);
    }
    const buildEncoding = encodingFactory ?? ((d: number, r: Rng) => new RealCodedEncoding(d, r));
    this.encoding = buildEncoding(dimensions, rng);
  }

  newPopulation(size: number): Genome[] {
    return this.encoding.newPopulation(size);
  }

  evaluate(genome: Genome): number {
    return 1 / (1 + rastrigin(this.encoding.decode(genome)));
  }
}
