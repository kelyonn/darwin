import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { PermutationGenome } from "../genomes/permutationGenome.js";

/** A node position on the unit plane. */
export interface Node {
  readonly x: number;
  readonly y: number;
}

/**
 * The Travelling Salesman environment (PRD §10, Tier 0 #3): find a short closed
 * route visiting every node once. Proves representation-blindness on a genome
 * where naïve crossover would produce invalid offspring.
 *
 * Fitness rewards short routes via `1 / (1 + distance)` (guarded, PRD §6).
 */
export class TspEnvironment implements Environment {
  private readonly nodes: readonly Node[];

  /** Creates an environment over the given nodes, or `nodeCount` random nodes. */
  constructor(source: readonly Node[] | number, private readonly rng: Rng) {
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
    return Array.from({ length: size }, () => PermutationGenome.random(this.nodes.length, this.rng));
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof PermutationGenome)) {
      throw new TypeError("TspEnvironment can only evaluate a PermutationGenome");
    }
    return 1 / (1 + this.routeDistance(genome.sequence));
  }
}
