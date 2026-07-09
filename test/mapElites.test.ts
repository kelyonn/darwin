import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { MapElites } from "../src/search/mapElites.js";
import { GaitEnvironment } from "../src/environments/gait.js";
import { Network, type NetworkConfig } from "../src/core/network.js";
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
