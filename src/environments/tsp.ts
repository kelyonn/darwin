import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { PermutationGenome } from "../genomes/permutationGenome.js";
import { VectorGenome } from "../genomes/vectorGenome.js";

/** A node position on the unit plane. */
export interface Node {
  readonly x: number;
  readonly y: number;
}

/**
 * How a genome encodes a tour — the representation axis, injected rather than
 * hard-wired (ADR-013). `TspEnvironment` owns the *problem* (node positions,
 * route length); a `TourEncoding` owns only how a genome decodes into the
 * permutation of node indices that problem is scored on.
 */
export interface TourEncoding {
  /** Creates a fresh population of this encoding's genome type. */
  newPopulation(size: number): Genome[];
  /** Decodes a genome into the tour it encodes: a permutation of `0 .. nodeCount-1`. */
  decode(genome: Genome): readonly number[];
}

/** Builds a {@link TourEncoding} once the environment knows its node count. */
export type TourEncodingFactory = (nodeCount: number, rng: Rng) => TourEncoding;

/**
 * The original TSP genome (PRD §4): a permutation directly, bred with Order
 * Crossover so every child stays a valid tour. `decode` is the identity — the
 * genome already *is* the tour.
 */
export class PermutationEncoding implements TourEncoding {
  constructor(
    private readonly nodeCount: number,
    private readonly rng: Rng,
  ) {}

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => PermutationGenome.random(this.nodeCount, this.rng));
  }

  decode(genome: Genome): readonly number[] {
    if (!(genome instanceof PermutationGenome)) {
      throw new TypeError("PermutationEncoding can only decode a PermutationGenome");
    }
    return genome.sequence;
  }
}

/** Search-space bounds for random-key components (Bean, 1994 uses the unit interval). */
const RANDOM_KEY_BOUNDS: readonly [number, number] = [0, 1];
const RANDOM_KEY_STD_DEV = 0.15;

/**
 * Random-key encoding (Bean, 1994): a real-valued vector whose ascending sort
 * order *is* the tour — every point in `[0, 1]^n` decodes to a valid
 * permutation, with no repair operator and no permutation-aware genetics.
 * Ordinary blend crossover and Gaussian mutation (`VectorGenome`'s, unmodified)
 * solve the identical problem `PermutationEncoding`'s Order Crossover was
 * purpose-built for — the same problem, two unrelated genetic representations,
 * through the one unchanged core (PRD §0, §4; see the cross-representation
 * study, `--study cross-representation`).
 */
export class RandomKeyEncoding implements TourEncoding {
  constructor(
    private readonly nodeCount: number,
    private readonly rng: Rng,
  ) {}

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () =>
      VectorGenome.random(this.nodeCount, RANDOM_KEY_STD_DEV, RANDOM_KEY_BOUNDS, this.rng),
    );
  }

  decode(genome: Genome): readonly number[] {
    if (!(genome instanceof VectorGenome)) {
      throw new TypeError("RandomKeyEncoding can only decode a VectorGenome");
    }
    const keys = genome.coordinates;
    return keys.map((_, index) => index).sort((a, b) => (keys[a] as number) - (keys[b] as number));
  }
}

/**
 * The Travelling Salesman environment (PRD §10, Tier 0 #3): find a short closed
 * route visiting every node once.
 *
 * Fitness rewards short routes via `1 / (1 + distance)` (guarded, PRD §6). The
 * environment owns the problem only — which genome type encodes a tour is an
 * injected {@link TourEncoding}, defaulting to the original
 * {@link PermutationEncoding} so every existing call site is unaffected.
 */
export class TspEnvironment implements Environment {
  private readonly nodes: readonly Node[];
  private readonly encoding: TourEncoding;

  /**
   * Creates an environment over the given nodes, or `nodeCount` random nodes.
   * @param encodingFactory Builds the {@link TourEncoding} once the node count
   *   is known. Defaults to {@link PermutationEncoding}.
   */
  constructor(source: readonly Node[] | number, rng: Rng, encodingFactory?: TourEncodingFactory) {
    if (typeof source === "number") {
      if (source < 2) {
        throw new RangeError(`need at least 2 nodes, got ${source}`);
      }
      this.nodes = Array.from({ length: source }, () => ({ x: rng.next(), y: rng.next() }));
    } else {
      if (source.length < 2) {
        throw new RangeError(`need at least 2 nodes, got ${source.length}`);
      }
      this.nodes = source;
    }
    const buildEncoding = encodingFactory ?? ((nodeCount: number, r: Rng) => new PermutationEncoding(nodeCount, r));
    this.encoding = buildEncoding(this.nodes.length, rng);
  }

  get nodePositions(): readonly Node[] {
    return this.nodes;
  }

  /** Total length of the closed route described by `order`. */
  routeDistance(order: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < order.length; i++) {
      const from = this.nodes[order[i] as number] as Node;
      const to = this.nodes[order[(i + 1) % order.length] as number] as Node;
      total += Math.hypot(to.x - from.x, to.y - from.y);
    }
    return total;
  }

  newPopulation(size: number): Genome[] {
    return this.encoding.newPopulation(size);
  }

  evaluate(genome: Genome): number {
    return 1 / (1 + this.routeDistance(this.encoding.decode(genome)));
  }
}
