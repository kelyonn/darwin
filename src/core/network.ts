import type { Genome } from "./genome.js";
import type { Rng } from "./rng.js";
import { matVecMul, addInPlace } from "./matrix.js";

/** Activation applied to the output layer. Hidden layers always use tanh. */
export type OutputActivation = "sigmoid" | "tanh";

/** Topology and evolutionary parameters for a {@link Network}. */
export interface NetworkConfig {
  /** Layer sizes from input to output, e.g. `[2, 4, 1]`. At least two entries. */
  readonly layerSizes: readonly number[];
  /** Standard deviation for random weight initialisation. */
  readonly initStdDev: number;
  /** Standard deviation of Gaussian weight perturbation during mutation. */
  readonly mutationStdDev: number;
  /** Activation on the output layer. Defaults to `"sigmoid"`. */
  readonly outputActivation?: OutputActivation;
}

/** Per-transition slice of the flat parameter array. */
interface LayerSpec {
  readonly inputs: number;
  readonly outputs: number;
  readonly weightOffset: number;
  readonly biasOffset: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * A feed-forward neural network that implements {@link Genome} (PRD §3, §4).
 *
 * All parameters live in one flat `Float32Array` for cache locality; per-layer
 * views are taken with `subarray` without copying. Activation buffers are
 * preallocated per instance and reused, so `feedForward` allocates nothing on
 * the hot path.
 *
 * The network is blind to meaning: it maps an array of floats to an array of
 * floats and never knows what they represent (PRD §0). The Environment assigns
 * meaning.
 *
 * - `mutate`: perturbs each parameter by Gaussian noise with probability `rate`.
 * - `crossover`: per-parameter uniform mix of two parents' weights.
 */
export class Network implements Genome {
  fitness = 0;

  /**
   * Behaviour descriptor, written by divergent-search environments (maze,
   * gait) and read by Novelty Search and MAP-Elites. Objective selection ignores
   * it. Left unset (absent) by objective environments; `exactOptionalPropertyTypes`
   * forbids assigning `undefined` explicitly, so this is a true optional property.
   */
  behaviour?: readonly number[];

  private readonly layers: readonly LayerSpec[];
  private readonly outputActivation: OutputActivation;
  /** Scratch activation buffers, one per layer (index 0 is the input). */
  private readonly activations: readonly Float32Array[];

  private constructor(
    private readonly config: NetworkConfig,
    private readonly weights: Float32Array,
    private readonly rng: Rng,
  ) {
    this.outputActivation = config.outputActivation ?? "sigmoid";
    this.layers = buildLayerSpecs(config.layerSizes);
    this.activations = config.layerSizes.map((size) => new Float32Array(size));
  }

  /** Total number of tunable parameters (weights + biases) for a topology. */
  static parameterCount(layerSizes: readonly number[]): number {
    let count = 0;
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const inputs = layerSizes[i] as number;
      const outputs = layerSizes[i + 1] as number;
      count += outputs * inputs + outputs;
    }
    return count;
  }

  /** Creates a network with Gaussian-initialised weights. */
  static random(config: NetworkConfig, rng: Rng): Network {
    validateTopology(config.layerSizes);
    const weights = new Float32Array(Network.parameterCount(config.layerSizes));
    for (let i = 0; i < weights.length; i++) {
      weights[i] = rng.gaussian(0, config.initStdDev);
    }
    return new Network(config, weights, rng);
  }

  /** Number of inputs the network expects. */
  get inputSize(): number {
    return this.config.layerSizes[0] as number;
  }

  /** Number of outputs the network produces. */
  get outputSize(): number {
    return this.config.layerSizes[this.config.layerSizes.length - 1] as number;
  }

  /**
   * Runs the network forward. The returned array is the network's internal
   * output buffer — read it before the next `feedForward` call; do not retain it.
   * @throws if `input` length does not match {@link inputSize}.
   */
  feedForward(input: readonly number[] | Float32Array): Float32Array {
    if (input.length !== this.inputSize) {
      throw new RangeError(`expected ${this.inputSize} inputs, got ${input.length}`);
    }

    const inputBuffer = this.activations[0] as Float32Array;
    inputBuffer.set(input);

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i] as LayerSpec;
      const source = this.activations[i] as Float32Array;
      const target = this.activations[i + 1] as Float32Array;

      const weightMatrix = this.weights.subarray(
        layer.weightOffset,
        layer.weightOffset + layer.outputs * layer.inputs,
      );
      const bias = this.weights.subarray(layer.biasOffset, layer.biasOffset + layer.outputs);

      matVecMul(weightMatrix, source, layer.outputs, layer.inputs, target);
      addInPlace(target, bias);

      const isOutputLayer = i === this.layers.length - 1;
      applyActivation(target, isOutputLayer ? this.outputActivation : "tanh");
    }

    return this.activations[this.activations.length - 1] as Float32Array;
  }

  clone(): Network {
    const copy = new Network(this.config, new Float32Array(this.weights), this.rng);
    copy.fitness = this.fitness;
    if (this.behaviour !== undefined) {
      copy.behaviour = this.behaviour;
    }
    return copy;
  }

  mutate(rate: number): Network {
    const mutated = new Float32Array(this.weights);
    for (let i = 0; i < mutated.length; i++) {
      if (this.rng.next() < rate) {
        mutated[i] = (mutated[i] as number) + this.rng.gaussian(0, this.config.mutationStdDev);
      }
    }
    return new Network(this.config, mutated, this.rng);
  }

  crossover(other: Genome): Network {
    if (!(other instanceof Network)) {
      throw new TypeError("Network can only cross over with another Network");
    }
    if (other.weights.length !== this.weights.length) {
      throw new RangeError("cannot cross over networks of different topologies");
    }
    const child = new Float32Array(this.weights.length);
    for (let i = 0; i < child.length; i++) {
      child[i] = this.rng.next() < 0.5 ? (this.weights[i] as number) : (other.weights[i] as number);
    }
    return new Network(this.config, child, this.rng);
  }
}

function applyActivation(buffer: Float32Array, kind: OutputActivation | "tanh"): void {
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i] as number;
    buffer[i] = kind === "sigmoid" ? sigmoid(x) : Math.tanh(x);
  }
}

function buildLayerSpecs(layerSizes: readonly number[]): LayerSpec[] {
  const specs: LayerSpec[] = [];
  let offset = 0;
  for (let i = 0; i < layerSizes.length - 1; i++) {
    const inputs = layerSizes[i] as number;
    const outputs = layerSizes[i + 1] as number;
    const weightOffset = offset;
    const biasOffset = offset + outputs * inputs;
    specs.push({ inputs, outputs, weightOffset, biasOffset });
    offset = biasOffset + outputs;
  }
  return specs;
}

function validateTopology(layerSizes: readonly number[]): void {
  if (layerSizes.length < 2) {
    throw new RangeError("a network needs at least an input and an output layer");
  }
  for (const size of layerSizes) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError(`every layer size must be a positive integer, got ${size}`);
    }
  }
}
