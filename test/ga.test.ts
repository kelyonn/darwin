import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { WeaselEnvironment } from "../src/environments/weasel.js";
import { computeStats } from "../src/core/stats.js";

const CONFIG: GaConfig = {
  populationSize: 200,
  eliteCount: 1,
  tournamentSize: 5,
  mutationRate: 0.05,
};

/** Runs the Weasel problem for a fixed number of generations from a seed. */
function runWeasel(seed: number, generations: number): number[] {
  const rng = new Rng(seed);
  const env = new WeaselEnvironment("PROJECT DARWIN", rng);
  const ga = new GenerationalGA(CONFIG, rng);
  let population = env.newPopulation(CONFIG.populationSize);
  const bestPerGeneration: number[] = [];
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => env.evaluate(genome));
    bestPerGeneration.push(computeStats(population).best);
  }
  return bestPerGeneration;
}

describe("GenerationalGA", () => {
  it("reproduces a byte-identical run for the same seed", () => {
    expect(runWeasel(42, 50)).toEqual(runWeasel(42, 50));
  });

  it("produces different trajectories for different seeds", () => {
    expect(runWeasel(1, 50)).not.toEqual(runWeasel(2, 50));
  });

  it("never lets the best fitness regress (elitism holds)", () => {
    const trajectory = runWeasel(42, 80);
    for (let g = 1; g < trajectory.length; g++) {
      expect(trajectory[g] as number).toBeGreaterThanOrEqual(trajectory[g - 1] as number);
    }
  });

  it("makes progress and eventually solves the target", () => {
    const trajectory = runWeasel(42, 300);
    const solved = "PROJECT DARWIN".length;
    expect(trajectory[trajectory.length - 1]).toBe(solved);
  });

  it("validates its configuration", () => {
    const rng = new Rng(1);
    expect(() => new GenerationalGA({ ...CONFIG, populationSize: 0 }, rng)).toThrow(RangeError);
    expect(() => new GenerationalGA({ ...CONFIG, eliteCount: 999 }, rng)).toThrow(RangeError);
    expect(() => new GenerationalGA({ ...CONFIG, tournamentSize: 0 }, rng)).toThrow(RangeError);
  });
});
