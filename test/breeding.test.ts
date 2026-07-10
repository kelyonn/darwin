import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { annealedRate, type BreedingConfig } from "../src/core/breeding.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { WeaselEnvironment } from "../src/environments/weasel.js";
import { computeStats } from "../src/core/stats.js";

const BASE: BreedingConfig = {
  populationSize: 100,
  eliteCount: 1,
  tournamentSize: 5,
  mutationRate: 0.5,
};

describe("annealedRate", () => {
  it("is constant when decay is absent (backward compatible)", () => {
    for (const generation of [0, 1, 5, 50]) {
      expect(annealedRate(BASE, generation)).toBe(0.5);
    }
  });

  it("is constant when decay is exactly 1", () => {
    expect(annealedRate({ ...BASE, mutationDecay: 1 }, 20)).toBe(0.5);
  });

  it("cools geometrically toward the floor", () => {
    const config = { ...BASE, mutationDecay: 0.9, minMutationRate: 0.05 };
    expect(annealedRate(config, 0)).toBeCloseTo(0.5);
    expect(annealedRate(config, 1)).toBeCloseTo(0.45);
    expect(annealedRate(config, 2)).toBeCloseTo(0.405);
    // Never drops below the floor, however many generations pass.
    expect(annealedRate(config, 10_000)).toBe(0.05);
  });
});

/** Best-per-generation trajectory for a seeded Weasel run under a config. */
function runWeasel(seed: number, generations: number, config: GaConfig): number[] {
  const rng = new Rng(seed);
  const env = new WeaselEnvironment("PROJECT DARWIN", rng);
  const ga = new GenerationalGA(config, rng);
  let population = env.newPopulation(config.populationSize);
  const best: number[] = [];
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => env.evaluate(genome));
    best.push(computeStats(population).best);
  }
  return best;
}

describe("GenerationalGA annealing", () => {
  it("with decay disabled reproduces the no-schedule run byte-for-byte", () => {
    const withoutField: GaConfig = { populationSize: 100, eliteCount: 1, tournamentSize: 5, mutationRate: 0.05 };
    const withDecayOne: GaConfig = { ...withoutField, mutationDecay: 1, minMutationRate: 0 };
    expect(runWeasel(42, 40, withDecayOne)).toEqual(runWeasel(42, 40, withoutField));
  });

  it("stays reproducible under a cooling schedule", () => {
    const config: GaConfig = { populationSize: 100, eliteCount: 1, tournamentSize: 5, mutationRate: 0.3, mutationDecay: 0.95, minMutationRate: 0.02 };
    expect(runWeasel(7, 40, config)).toEqual(runWeasel(7, 40, config));
  });
});
