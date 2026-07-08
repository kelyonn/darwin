import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";

/** The four XOR training cases: inputs and their expected output. */
const XOR_CASES: ReadonlyArray<{ readonly input: readonly [number, number]; readonly target: number }> = [
  { input: [0, 0], target: 0 },
  { input: [0, 1], target: 1 },
  { input: [1, 0], target: 1 },
  { input: [1, 1], target: 0 },
];

/** Maximum achievable fitness (zero squared error across all four cases). */
export const XOR_MAX_FITNESS = 4;

/**
 * The XOR environment (PRD §10, Tier 0 #4): the first neural network, on the
 * smallest non-linearly-separable task. Solving it requires a working hidden
 * layer, so it is the smallest honest test that the matrix math is correct.
 *
 * Fitness is `4 - Σ (target - output)²` over the four cases, peaking at 4.
 */
export class XorEnvironment implements Environment {
  private readonly networkConfig: NetworkConfig;

  /** @param hiddenSize Neurons in the single hidden layer. */
  constructor(hiddenSize: number, private readonly rng: Rng) {
    if (hiddenSize <= 0) {
      throw new RangeError(`hiddenSize must be positive, got ${hiddenSize}`);
    }
    this.networkConfig = {
      layerSizes: [2, hiddenSize, 1],
      initStdDev: 1,
      mutationStdDev: 0.5,
      outputActivation: "sigmoid",
    };
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof Network)) {
      throw new TypeError("XorEnvironment can only evaluate a Network");
    }
    let squaredError = 0;
    for (const { input, target } of XOR_CASES) {
      const output = genome.feedForward(input)[0] as number;
      const error = target - output;
      squaredError += error * error;
    }
    return XOR_MAX_FITNESS - squaredError;
  }
}
