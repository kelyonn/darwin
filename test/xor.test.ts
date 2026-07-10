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

  it("reliably reaches 4/4 across many seeds under the demo's own config (regression)", () => {
    // Raw fitness asymptotes (sigmoid never outputs exactly 0/1), so a network
    // that is already fully correct can still read "fitness 3.8 / 4" and look
    // unfinished. This locks in that "cases solved" — not raw fitness — is the
    // honest signal, using the exact config `main.ts` wires up for the demo.
    const demoConfig: GaConfig = {
      populationSize: 100,
      eliteCount: 8,
      tournamentSize: 5,
      mutationRate: 0.4,
      mutationDecay: 0.98,
      minMutationRate: 0.05,
    };
    const seeds = [1, 2, 3, 7, 13, 42, 99, 123, 500, 777];
    let allFourSolvedCount = 0;
    for (const seed of seeds) {
      const rng = new Rng(seed);
      const env = new XorEnvironment(4, rng);
      const ga = new GenerationalGA(demoConfig, rng);
      let population = env.newPopulation(demoConfig.populationSize);
      for (let g = 0; g < 150; g++) population = ga.step(population, (genome) => env.evaluate(genome));
      const champion = [...population].sort((a, b) => b.fitness - a.fitness)[0] as Network;
      const predict = (a: number, b: number): number => (champion.feedForward([a, b])[0] as number) >= 0.5 ? 1 : 0;
      const solved =
        Number(predict(0, 0) === 0) + Number(predict(0, 1) === 1) + Number(predict(1, 0) === 1) + Number(predict(1, 1) === 0);
      if (solved === 4) allFourSolvedCount++;
    }
    expect(allFourSolvedCount).toBe(seeds.length);
  });
});
