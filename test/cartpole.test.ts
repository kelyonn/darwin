import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA, type GaConfig } from "../src/core/ga.js";
import { computeStats } from "../src/core/stats.js";
import { CartPoleEnvironment } from "../src/environments/cartpole.js";

const MAX_STEPS = 500;
const TRIALS = 3;
const MAX_FITNESS = MAX_STEPS * TRIALS;
const CONFIG: GaConfig = {
  populationSize: 120,
  eliteCount: 2,
  tournamentSize: 5,
  mutationRate: 0.2,
};

function evolveCartPole(seed: number, generations: number): number[] {
  const rng = new Rng(seed);
  const env = new CartPoleEnvironment(MAX_STEPS, 6, TRIALS, rng);
  const ga = new GenerationalGA(CONFIG, rng);
  let population = env.newPopulation(CONFIG.populationSize);
  const trajectory: number[] = [];
  for (let g = 0; g < generations; g++) {
    population = ga.step(population, (genome) => env.evaluate(genome));
    trajectory.push(computeStats(population).best);
  }
  return trajectory;
}

describe("Cart-pole under evolution", () => {
  it("evolves a controller that balances across varied starts", () => {
    const trajectory = evolveCartPole(7, 60);
    const best = Math.max(...trajectory);
    // A working episodic protocol + correct physics reliably learns to balance
    // most of the varied initial conditions.
    expect(best).toBeGreaterThan(MAX_FITNESS * 0.75);
  });

  it("improves over generations (episodic reward accumulates)", () => {
    const trajectory = evolveCartPole(7, 60);
    const early = trajectory[0] as number;
    const late = trajectory[trajectory.length - 1] as number;
    expect(late).toBeGreaterThan(early);
  });

  it("is reproducible under a fixed seed", () => {
    expect(evolveCartPole(3, 25)).toEqual(evolveCartPole(3, 25));
  });
});
