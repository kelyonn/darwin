import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { NoveltySearch } from "../src/search/novelty.js";
import { Network, type NetworkConfig } from "../src/core/network.js";

const netConfig: NetworkConfig = { layerSizes: [2, 3, 1], initStdDev: 1, mutationStdDev: 0.3 };

function withBehaviour(rng: Rng, behaviour: readonly number[]): Network {
  const genome = Network.random(netConfig, rng);
  genome.behaviour = behaviour;
  return genome;
}

describe("NoveltySearch", () => {
  it("rejects a non-positive neighbour count", () => {
    expect(
      () =>
        new NoveltySearch(
          { populationSize: 4, eliteCount: 1, tournamentSize: 2, mutationRate: 0.1, neighbours: 0, archiveThreshold: 0.1, archiveLimit: 10 },
          new Rng(1),
        ),
    ).toThrow(RangeError);
  });

  it("scores an outlier as more novel than a clustered point", () => {
    const rng = new Rng(1);
    const novelty = new NoveltySearch(
      { populationSize: 5, eliteCount: 1, tournamentSize: 2, mutationRate: 0.1, neighbours: 2, archiveThreshold: 999, archiveLimit: 10 },
      rng,
    );
    // Four clustered points near the origin, one far outlier.
    const population = [
      withBehaviour(rng, [0, 0]),
      withBehaviour(rng, [0.1, 0]),
      withBehaviour(rng, [0, 0.1]),
      withBehaviour(rng, [0.1, 0.1]),
      withBehaviour(rng, [10, 10]),
    ];
    novelty.step(population, () => 0);
    const outlier = population[4] as Network;
    const clustered = population[0] as Network;
    expect(outlier.fitness).toBeGreaterThan(clustered.fitness);
  });

  it("throws if the environment never sets a behaviour descriptor", () => {
    const rng = new Rng(1);
    const novelty = new NoveltySearch(
      { populationSize: 2, eliteCount: 1, tournamentSize: 2, mutationRate: 0.1, neighbours: 1, archiveThreshold: 0.1, archiveLimit: 10 },
      rng,
    );
    const population = [Network.random(netConfig, rng), Network.random(netConfig, rng)];
    expect(() => novelty.step(population, () => 0)).toThrow(/behaviour/);
  });

  it("grows the archive as novel behaviours are found, bounded by archiveLimit", () => {
    const rng = new Rng(2);
    const novelty = new NoveltySearch(
      { populationSize: 6, eliteCount: 1, tournamentSize: 2, mutationRate: 0.1, neighbours: 2, archiveThreshold: 0.01, archiveLimit: 3 },
      rng,
    );
    let population = [0, 1, 2, 3, 4, 5].map((i) => withBehaviour(rng, [i, i]));
    population = novelty.step(population, () => 0) as Network[];
    expect(novelty.exploredBehaviours.length).toBeLessThanOrEqual(3);
    expect(novelty.exploredBehaviours.length).toBeGreaterThan(0);
  });
});
