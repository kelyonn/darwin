import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { computeStats } from "../src/core/stats.js";
import type { Environment } from "../src/environments/Environment.js";
import type { Genome } from "../src/core/genome.js";
import { LandscapeEnvironment, BinaryEncoding, rastrigin } from "../src/environments/landscape.js";
import { TspEnvironment, RandomKeyEncoding } from "../src/environments/tsp.js";

const CONFIG: GaConfig = {
  populationSize: 200,
  eliteCount: 2,
  tournamentSize: 5,
  mutationRate: 0.1,
};

/** Runs an environment through the unchanged GA and returns the best-fitness trajectory. */
function optimize(environment: Environment, seed: number, generations: number): number[] {
  const rng = new Rng(seed);
  const ga = new GenerationalGA(CONFIG, rng);
  let population = environment.newPopulation(CONFIG.populationSize);
  const trajectory: number[] = [];
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => environment.evaluate(genome));
    trajectory.push(computeStats(population).best);
  }
  return trajectory;
}

describe("decoupling: one unchanged GA drives unrelated environments", () => {
  it("Landscape (Rastrigin) fitness improves toward the optimum", () => {
    const rng = new Rng(11);
    const env = new LandscapeEnvironment(2, rng);
    const trajectory = optimize(env, 11, 150);
    const first = trajectory[0] as number;
    const last = trajectory[trajectory.length - 1] as number;
    expect(last).toBeGreaterThan(first);
    // Should approach the global optimum (fitness -> 1 as value -> 0).
    expect(last).toBeGreaterThan(0.9);
  });

  it("rastrigin is zero at the origin and positive elsewhere", () => {
    expect(rastrigin([0, 0])).toBeCloseTo(0, 10);
    expect(rastrigin([1, 1])).toBeGreaterThan(0);
  });

  it("TSP shortens the route over generations", () => {
    const rng = new Rng(21);
    const env = new TspEnvironment(15, rng);
    const trajectory = optimize(env, 21, 150);
    const first = trajectory[0] as number;
    const last = trajectory[trajectory.length - 1] as number;
    // Higher fitness = shorter route.
    expect(last).toBeGreaterThan(first);
  });

  it("both environments are reproducible under a fixed seed", () => {
    const landscape = () => optimize(new LandscapeEnvironment(2, new Rng(5)), 5, 40);
    const tsp = () => optimize(new TspEnvironment(10, new Rng(5)), 5, 40);
    expect(landscape()).toEqual(landscape());
    expect(tsp()).toEqual(tsp());
  });
});

/**
 * Representation-blindness for TSP and Landscape (ADR-013): before this, each
 * environment was hard-wired to exactly one genome type via an `instanceof`
 * guard, so "representation-blind" was an architectural claim about `core/`
 * that these two environments didn't actually demonstrate. Both now take an
 * injected encoding; this proves the *alternative* encoding — not just the
 * original one under a new name — genuinely solves the same problem through
 * the identical, unmodified `GenerationalGA`.
 */
describe("encoding-agnostic environments: an alternative representation solves the same problem", () => {
  it("TSP's random-key encoding (Bean, 1994) — a VectorGenome whose sort order is the tour — shortens the route", () => {
    // No permutation-aware genetics at all: ordinary blend crossover and
    // Gaussian mutation on a real-valued vector, decoded by sorting.
    const config: GaConfig = { populationSize: 200, eliteCount: 16, tournamentSize: 5, mutationRate: 0.3 };
    for (const seed of [21, 7, 99]) {
      const rng = new Rng(seed);
      const env = new TspEnvironment(15, rng, (nodeCount, r) => new RandomKeyEncoding(nodeCount, r));
      const trajectory = optimizeWith(env, seed, 100, config);
      const first = trajectory[0] as number;
      const last = trajectory[trajectory.length - 1] as number;
      expect(last).toBeGreaterThan(first);
    }
  });

  it("random-key decoding always yields a valid permutation, for any real-valued vector", () => {
    const rng = new Rng(3);
    const encoding = new RandomKeyEncoding(10, rng);
    const [genome] = encoding.newPopulation(1);
    const tour = encoding.decode(genome as Genome);
    expect([...tour].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("Landscape's binary encoding (a bit-string StringGenome, fixed-point decoded) reaches the global optimum", () => {
    // StringGenome's per-character mutation and uniform crossover — built for
    // the Weasel phrase — with no numeric-optimisation genetics at all.
    const config: GaConfig = { populationSize: 200, eliteCount: 16, tournamentSize: 5, mutationRate: 0.02 };
    for (const seed of [5, 11, 42]) {
      const rng = new Rng(seed);
      const env = new LandscapeEnvironment(2, rng, (dimensions, r) => new BinaryEncoding(dimensions, r));
      const trajectory = optimizeWith(env, seed, 150, config);
      const first = trajectory[0] as number;
      const last = trajectory[trajectory.length - 1] as number;
      expect(last).toBeGreaterThan(first);
      expect(last).toBeGreaterThan(0.9);
    }
  });

  it("both alternative encodings stay reproducible under a fixed seed", () => {
    const randomKeyConfig: GaConfig = { populationSize: 50, eliteCount: 4, tournamentSize: 5, mutationRate: 0.3 };
    const binaryConfig: GaConfig = { populationSize: 50, eliteCount: 4, tournamentSize: 5, mutationRate: 0.02 };
    const tsp = () =>
      optimizeWith(new TspEnvironment(10, new Rng(9), (n, r) => new RandomKeyEncoding(n, r)), 9, 20, randomKeyConfig);
    const landscape = () =>
      optimizeWith(
        new LandscapeEnvironment(2, new Rng(9), (d, r) => new BinaryEncoding(d, r)),
        9,
        20,
        binaryConfig,
      );
    expect(tsp()).toEqual(tsp());
    expect(landscape()).toEqual(landscape());
  });
});

/** Like {@link optimize}, but with an explicit config — the alternative encodings need different mutation tuning than the default `CONFIG` above. */
function optimizeWith(environment: Environment, seed: number, generations: number, config: GaConfig): number[] {
  const rng = new Rng(seed);
  const ga = new GenerationalGA(config, rng);
  let population = environment.newPopulation(config.populationSize);
  const trajectory: number[] = [];
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => environment.evaluate(genome));
    trajectory.push(computeStats(population).best);
  }
  return trajectory;
}
