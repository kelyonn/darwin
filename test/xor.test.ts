import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { computeStats } from "../src/core/stats.js";
import { XorEnvironment, XOR_MAX_FITNESS } from "../src/environments/xor.js";
import { Network } from "../src/core/network.js";

const CONFIG: GaConfig = {
  populationSize: 200,
  eliteCount: 2,
  tournamentSize: 5,
  mutationRate: 0.15,
};

/** Evolves XOR and returns the best fitness reached across all generations. */
function evolveXor(seed: number, generations: number): number {
  const rng = new Rng(seed);
  const env = new XorEnvironment(4, rng);
  const ga = new GenerationalGA(CONFIG, rng);
  let population = env.newPopulation(CONFIG.populationSize);
  let best = -Infinity;
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => env.evaluate(genome));
    best = Math.max(best, computeStats(population).best);
  }
  return best;
}

describe("XOR under evolution", () => {
  it("evolves a network that solves XOR (the hidden layer works)", () => {
    // A correct feed-forward network reliably reaches near-perfect fitness.
    const best = evolveXor(42, 400);
    expect(best).toBeGreaterThan(3.9);
    expect(best).toBeLessThanOrEqual(XOR_MAX_FITNESS);
  });

  it("classifies all four cases correctly after evolution", () => {
    const rng = new Rng(42);
    const env = new XorEnvironment(4, rng);
    const ga = new GenerationalGA(CONFIG, rng);
    let population = env.newPopulation(CONFIG.populationSize);
    let champion = population[0] as Network;
    for (let g = 0; g < 400; g++) {
      population = ga.step(population, (genome) => env.evaluate(genome));
      for (const genome of population) {
        if (genome.fitness > champion.fitness) champion = genome as Network;
      }
    }
    const predict = (a: number, b: number): number => Math.round(champion.feedForward([a, b])[0] as number);
    expect(predict(0, 0)).toBe(0);
    expect(predict(0, 1)).toBe(1);
    expect(predict(1, 0)).toBe(1);
    expect(predict(1, 1)).toBe(0);
  });
});
