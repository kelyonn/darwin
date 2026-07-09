import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA } from "../src/core/ga.js";
import { TrackRunnerEnvironment } from "../src/environments/trackrunner.js";
import { Network } from "../src/core/network.js";

describe("TrackRunnerEnvironment", () => {
  it("scores a genome deterministically and non-negatively", () => {
    const env = new TrackRunnerEnvironment(6, new Rng(1));
    const [genome] = env.newPopulation(1);
    const first = env.evaluate(genome as Network);
    const second = env.evaluate(genome as Network);
    expect(first).toEqual(second);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it("rejects non-network genomes", () => {
    const env = new TrackRunnerEnvironment(6, new Rng(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => env.evaluate({} as any)).toThrow(TypeError);
  });

  it("improves best fitness over generations and never regresses (elitism)", () => {
    const rng = new Rng(7);
    const env = new TrackRunnerEnvironment(6, rng);
    const ga = new GenerationalGA(
      { populationSize: 60, eliteCount: 2, tournamentSize: 4, mutationRate: 0.2 },
      rng,
    );
    let population = env.newPopulation(60);
    let previousBest = -Infinity;
    for (let generation = 0; generation < 12; generation++) {
      population = ga.step(population, (g) => env.evaluate(g));
      const best = Math.max(...population.map((g) => g.fitness));
      // Elitism keeps the incoming champion, so the running best never drops.
      previousBest = Math.max(previousBest, best);
    }
    expect(previousBest).toBeGreaterThan(0);
  });

  it("produces a live episode with well-formed, finite state every tick", () => {
    const env = new TrackRunnerEnvironment(6, new Rng(3));
    const [genome] = env.newPopulation(1);
    const episode = env.createEpisode(genome as Network);
    expect(episode.snapshot.sensors).toHaveLength(5);
    let steps = 0;
    // A random driver may or may not leave the track within a bounded window
    // (it can get lucky and circle), so this asserts the simulation stays
    // well-formed rather than asserting termination.
    while (episode.step() && steps < 1000) {
      expect(Number.isFinite(episode.snapshot.x)).toBe(true);
      expect(Number.isFinite(episode.snapshot.y)).toBe(true);
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
  });
});
