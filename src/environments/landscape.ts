import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { VectorGenome } from "../genomes/vectorGenome.js";

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
 * The Landscape optimizer environment. The genome is a point; fitness rewards
 * proximity to the global minimum via `1 / (1 + value)` — a guarded denominator
 * (PRD §6) that peaks at 1 when the function value is 0.
 */
export class LandscapeEnvironment implements Environment {
  constructor(
    private readonly dimensions: number,
    private readonly rng: Rng,
  ) {
    if (dimensions <= 0) {
      throw new RangeError(`dimensions must be positive, got ${dimensions}`);
    }
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () =>
      VectorGenome.random(this.dimensions, RASTRIGIN_STD_DEV, RASTRIGIN_BOUNDS, this.rng),
    );
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof VectorGenome)) {
      throw new TypeError("LandscapeEnvironment can only evaluate a VectorGenome");
    }
    return 1 / (1 + rastrigin(genome.coordinates));
  }
}
