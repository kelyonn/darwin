import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import {
  CoevolutionDriver,
  competitiveFitnessSharing,
  dominanceCount,
  type CoevolutionConfig,
  type CoevolutionState,
} from "../src/search/coevolution.js";
import { PredatorPreyEnvironment } from "../src/environments/predatorPrey.js";
import { Network } from "../src/core/network.js";

const config: CoevolutionConfig = {
  populationSize: 12,
  eliteCount: 2,
  tournamentSize: 3,
  mutationRate: 0.2,
  opponentSampleSize: 4,
  hallOfFameSize: 3,
};

function freshState(env: PredatorPreyEnvironment, size: number): CoevolutionState {
  return { predators: env.newPredators(size), prey: env.newPrey(size) };
}

describe("dominanceCount", () => {
  it("counts only ancestral opponents strictly beaten (payoff > 0.5)", () => {
    // 0.6 and 0.51 are captures; 0.5 is a boundary escape; 0.2 is a loss.
    expect(dominanceCount([0.6, 0.51, 0.5, 0.2])).toBe(2);
  });

  it("is zero for an empty history and for a champion that beats no one", () => {
    expect(dominanceCount([])).toBe(0);
    expect(dominanceCount([0.4, 0.3, 0.5])).toBe(0);
  });

  it("never exceeds the number of ancestral opponents", () => {
    const row = [0.9, 0.8, 0.7];
    expect(dominanceCount(row)).toBeLessThanOrEqual(row.length);
    expect(dominanceCount(row)).toBe(3);
  });

  it("is non-decreasing as a predator lineage strictly improves against a fixed archive", () => {
    // Three CIAO rows for successively stronger predator champions against the
    // same growing prey archive: each strictly dominates more ancestors.
    const gen1 = [0.55]; // beats the one ancestor so far
    const gen2 = [0.6, 0.4]; // still beats the first, not yet the new one
    const gen3 = [0.7, 0.58]; // now beats both
    const counts = [gen1, gen2, gen3].map(dominanceCount);
    expect(counts).toEqual([1, 1, 2]);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i] as number).toBeGreaterThanOrEqual(counts[i - 1] as number);
    }
  });
});

describe("competitiveFitnessSharing", () => {
  it("weights a win by how few others share it", () => {
    // Opponent 0 is beaten by both contestants; opponent 1 only by contestant 1.
    const scores = competitiveFitnessSharing([
      [true, false],
      [true, true],
    ]);
    expect(scores[0]).toBeCloseTo(0.5); // 1/2 for the shared win
    expect(scores[1]).toBeCloseTo(1.5); // 1/2 for the shared win + 1/1 for the rare win
  });

  it("rewards beating a rarely-beaten opponent more than a common one", () => {
    // Contestant 2 uniquely beats the hard opponent 1; everyone beats opponent 0.
    const scores = competitiveFitnessSharing([
      [true, false],
      [true, false],
      [true, true],
    ]);
    expect(scores[2] as number).toBeGreaterThan(scores[0] as number);
    expect(scores[0]).toBeCloseTo(1 / 3);
  });

  it("returns an empty result for no contestants", () => {
    expect(competitiveFitnessSharing([])).toEqual([]);
  });

  it("rejects a ragged matrix", () => {
    expect(() => competitiveFitnessSharing([[true, false], [true]])).toThrow(RangeError);
  });
});

describe("CoevolutionDriver", () => {
  it("validates its configuration", () => {
    const env = new PredatorPreyEnvironment(4, new Rng(1));
    expect(() => new CoevolutionDriver(env.compete, { ...config, opponentSampleSize: 0 }, new Rng(1))).toThrow(
      RangeError,
    );
    expect(() => new CoevolutionDriver(env.compete, { ...config, hallOfFameSize: -1 }, new Rng(1))).toThrow(
      RangeError,
    );
  });

  it("preserves population sizes across generations", () => {
    const env = new PredatorPreyEnvironment(6, new Rng(7));
    const driver = new CoevolutionDriver(env.compete, config, new Rng(7));
    let state = freshState(env, config.populationSize);
    for (let generation = 0; generation < 3; generation++) {
      const result = driver.step(state);
      expect(result.next.predators).toHaveLength(config.populationSize);
      expect(result.next.prey).toHaveLength(config.populationSize);
      state = result.next;
    }
  });

  it("is fully reproducible under a fixed seed", () => {
    const runOnce = (): number[] => {
      const env = new PredatorPreyEnvironment(6, new Rng(42));
      const driver = new CoevolutionDriver(env.compete, config, new Rng(99));
      let state = freshState(env, config.populationSize);
      const trace: number[] = [];
      for (let generation = 0; generation < 4; generation++) {
        const result = driver.step(state);
        trace.push(result.stats.bestPredatorFitness, result.stats.bestPreyFitness, result.stats.captureRate);
        state = result.next;
      }
      return trace;
    };
    expect(runOnce()).toEqual(runOnce());
  });

  it("reports a capture rate within [0, 1] and grows the Hall of Fame", () => {
    const env = new PredatorPreyEnvironment(6, new Rng(3));
    const driver = new CoevolutionDriver(env.compete, config, new Rng(3));
    let state = freshState(env, config.populationSize);
    for (let generation = 0; generation < 5; generation++) {
      const result = driver.step(state);
      expect(result.stats.captureRate).toBeGreaterThanOrEqual(0);
      expect(result.stats.captureRate).toBeLessThanOrEqual(1);
      expect(Number.isFinite(result.stats.bestPredatorFitness)).toBe(true);
      // Archive fills to its bound and then stays there.
      expect(result.stats.hallOfFameSize).toBe(Math.min(generation + 1, config.hallOfFameSize));
      state = result.next;
    }
  });

  it("still advances with the Hall of Fame disabled", () => {
    const env = new PredatorPreyEnvironment(5, new Rng(11));
    const driver = new CoevolutionDriver(env.compete, { ...config, hallOfFameSize: 0 }, new Rng(11));
    const result = driver.step(freshState(env, config.populationSize));
    expect(result.stats.hallOfFameSize).toBe(0);
    expect(result.next.predators).toHaveLength(config.populationSize);
  });
});

describe("PredatorPreyEnvironment", () => {
  it("produces deterministic, complementary, well-formed outcomes", () => {
    const env = new PredatorPreyEnvironment(6, new Rng(5));
    const rng = new Rng(123);
    const predator = Network.random(
      { layerSizes: [3, 6, 2], initStdDev: 1, mutationStdDev: 0.3, outputActivation: "tanh" },
      rng,
    );
    const prey = Network.random(
      { layerSizes: [3, 6, 2], initStdDev: 1, mutationStdDev: 0.3, outputActivation: "tanh" },
      rng,
    );

    const first = env.compete(predator, prey);
    const second = env.compete(predator, prey);
    expect(first).toEqual(second); // fixed start → deterministic contest

    expect(first.predatorScore).toBeGreaterThanOrEqual(0);
    expect(first.predatorScore).toBeLessThanOrEqual(1);
    expect(first.preyScore).toBeCloseTo(1 - first.predatorScore);
    // Capture and score agree: a win is strictly above 0.5, an escape below it.
    expect(first.predatorScore > 0.5).toBe(first.captured);
  });

  it("rejects non-network genomes", () => {
    const env = new PredatorPreyEnvironment(4, new Rng(1));
    const network = Network.random(
      { layerSizes: [3, 4, 2], initStdDev: 1, mutationStdDev: 0.3 },
      new Rng(1),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => env.compete({} as any, network)).toThrow(TypeError);
  });
});
