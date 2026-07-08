import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { computeStats } from "../src/core/stats.js";
import type { Environment } from "../src/environments/Environment.js";
import { LandscapeEnvironment, rastrigin } from "../src/environments/landscape.js";
import { TspEnvironment } from "../src/environments/tsp.js";

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
