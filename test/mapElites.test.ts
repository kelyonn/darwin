import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { MapElites } from "../src/search/mapElites.js";
import { GaitEnvironment } from "../src/environments/gait.js";
import { Network, type NetworkConfig } from "../src/core/network.js";
import { TspEnvironment, type Node } from "../src/environments/tsp.js";
import { PermutationGenome } from "../src/genomes/permutationGenome.js";
import type { Genome } from "../src/core/genome.js";

const netConfig: NetworkConfig = { layerSizes: [2, 3, 1], initStdDev: 1, mutationStdDev: 0.3 };

describe("MapElites", () => {
  it("validates its configuration", () => {
    expect(
      () => new MapElites({ dimensions: [], initialPopulation: 4, batchSize: 4, mutationRate: 0.1 }, new Rng(1)),
    ).toThrow(RangeError);
    expect(
      () =>
        new MapElites(
          { dimensions: [{ min: 0, max: 1, bins: 0 }], initialPopulation: 4, batchSize: 4, mutationRate: 0.1 },
          new Rng(1),
        ),
    ).toThrow(RangeError);
  });

  it("keeps only the fitter genome when two land in the same cell", () => {
    const rng = new Rng(1);
    // A single-cell archive: every genome maps to the same cell, so only the
    // fittest genome seen across the whole seeding batch should survive.
    const elites = new MapElites(
      { dimensions: [{ min: 0, max: 1, bins: 1 }], initialPopulation: 5, batchSize: 0, mutationRate: 0.1 },
      rng,
    );
    let called = 0;
    const spawn = (): Genome => Network.random(netConfig, rng);
    const evaluate = (genome: Genome): number => {
      (genome as Network).behaviour = [0.5];
      called++;
      return called; // strictly increasing: the last one seen is the fittest
    };
    elites.step(spawn, evaluate);
    expect(elites.size).toBe(1);
    expect((elites.entries[0] as { genome: Genome }).genome.fitness).toBe(called);
  });

  it("fills distinct cells across a batch of random gait genomes", () => {
    const rng = new Rng(3);
    const env = new GaitEnvironment(4, rng);
    const elites = new MapElites(
      {
        dimensions: [
          { min: GaitEnvironment.BEHAVIOUR_BOUNDS.strideLength.min, max: GaitEnvironment.BEHAVIOUR_BOUNDS.strideLength.max, bins: 8 },
          { min: GaitEnvironment.BEHAVIOUR_BOUNDS.dutyFactor.min, max: GaitEnvironment.BEHAVIOUR_BOUNDS.dutyFactor.max, bins: 8 },
        ],
        initialPopulation: 30,
        batchSize: 30,
        mutationRate: 0.3,
      },
      rng,
    );
    elites.step(env.spawn, env.evaluate);
    const firstSize = elites.size;
    expect(firstSize).toBeGreaterThan(0);
    elites.step(env.spawn, env.evaluate);
    // Never regresses: subsequent batches only add or improve cells.
    expect(elites.size).toBeGreaterThanOrEqual(firstSize);
    for (const entry of elites.entries) {
      expect(entry.cell).toHaveLength(2);
    }
  });

  it("throws when the environment omits a behaviour descriptor", () => {
    const rng = new Rng(1);
    const elites = new MapElites(
      { dimensions: [{ min: 0, max: 1, bins: 4 }], initialPopulation: 2, batchSize: 0, mutationRate: 0.1 },
      rng,
    );
    expect(() => elites.step(() => Network.random(netConfig, rng), () => 1)).toThrow(/behaviour/);
  });
});

/**
 * Representation-blindness (ADR-013): before this test, `behaviour` was a
 * field only `Network` declared, so Novelty Search and MAP-Elites — two of
 * the project's four search paradigms — could only ever be exercised against
 * a network genome in this suite, regardless of the architecture's claim that
 * search is decoupled from representation. `StringGenome`, `VectorGenome`, and
 * `PermutationGenome` now all carry the same true-optional `behaviour` field
 * `Network` does (§2.1 of `.docs/remediation-plan.md`). This test is the
 * proof: the identical `MapElites` class illuminating an archive of TSP
 * *routes* — no network anywhere in the loop.
 */
describe("MapElites over a non-network genome (representation-blindness, ADR-013)", () => {
  it("illuminates an archive of TSP routes indexed by (route length, self-intersections)", () => {
    const rng = new Rng(7);
    const nodeCount = 12;
    const env = new TspEnvironment(nodeCount, rng);
    const nodes = env.nodePositions;

    // Generous, safe upper bounds: no edge in a unit-square tour exceeds the
    // diagonal, and a route can't have more crossing pairs than it has edges
    // squared, but in practice random tours cross far less; bins beyond the
    // observed range simply stay empty rather than erroring.
    const maxRouteLength = nodeCount * Math.SQRT2;
    const maxIntersections = nodeCount;

    const spawn = (): Genome => PermutationGenome.random(nodeCount, rng);
    const evaluate = (genome: Genome): number => {
      if (!(genome instanceof PermutationGenome)) {
        throw new TypeError("expected a PermutationGenome");
      }
      const route = genome.sequence;
      const length = env.routeDistance(route);
      genome.behaviour = [length, countCrossings(route, nodes)];
      return env.evaluate(genome);
    };

    const elites = new MapElites(
      {
        dimensions: [
          { min: 0, max: maxRouteLength, bins: 10 },
          { min: 0, max: maxIntersections, bins: 10 },
        ],
        initialPopulation: 200,
        batchSize: 200,
        mutationRate: 0.3,
      },
      rng,
    );

    elites.step(spawn, evaluate);
    const firstSize = elites.size;
    // A real illuminated archive, not a single degenerate cell: distinct
    // routes at genuinely different lengths and crossing counts survive.
    expect(firstSize).toBeGreaterThan(5);
    for (const entry of elites.entries) {
      expect(entry.genome).toBeInstanceOf(PermutationGenome);
      expect(entry.cell).toHaveLength(2);
    }

    elites.step(spawn, evaluate);
    // Never regresses: subsequent batches only add or improve cells — the
    // same guarantee already tested against the network-genome gait archive.
    expect(elites.size).toBeGreaterThanOrEqual(firstSize);
  });
});

/** Counts pairs of non-adjacent tour edges that cross (a simple, honest untangledness proxy). */
function countCrossings(route: readonly number[], nodes: readonly Node[]): number {
  const n = route.length;
  let crossings = 0;
  for (let i = 0; i < n; i++) {
    const a1 = nodes[route[i] as number] as Node;
    const a2 = nodes[route[(i + 1) % n] as number] as Node;
    for (let j = i + 1; j < n; j++) {
      const sharesVertex = j === i + 1 || (i === 0 && j === n - 1);
      if (sharesVertex) continue;
      const b1 = nodes[route[j] as number] as Node;
      const b2 = nodes[route[(j + 1) % n] as number] as Node;
      if (segmentsCross(a1, a2, b1, b2)) crossings++;
    }
  }
  return crossings;
}

function orientation(p: Node, q: Node, r: Node): -1 | 0 | 1 {
  const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}

/** True if segments p1–p2 and p3–p4 properly cross (general position; collinear overlap is measure-zero here). */
function segmentsCross(p1: Node, p2: Node, p3: Node, p4: Node): boolean {
  return orientation(p1, p2, p3) !== orientation(p1, p2, p4) && orientation(p3, p4, p1) !== orientation(p3, p4, p2);
}
