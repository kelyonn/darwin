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

  // 60 generations at population 150 is genuinely ~19–20s of synchronous
  // work (measured) — comfortably past vitest's 5000ms default. Under
  // vitest 1 this happened to pass anyway (a synchronous block can't be
  // pre-empted by a setTimeout-based timeout mid-flight); vitest 4 enforces
  // it correctly, surfacing a real, pre-existing test-suite gap rather than
  // a new one. Timeout sized with a comfortable margin above measured cost.
  it("does not reward hugging either wall over a genuine centred lap (regression)", () => {
    // A raw, unweighted angle-tracking checkpoint formula lets a genome earn
    // fitness by circling the smallest (or, if weighted the naive way, the
    // largest) legal radius instead of actually driving the track — measured
    // headlessly during development: the population reliably converged on
    // exactly this exploit. This locks in the fix: over a real training run,
    // the champion's trajectory should hug neither wall but track close to the
    // midline of `[innerRadius, outerRadius]`.
    const rng = new Rng(1);
    const env = new TrackRunnerEnvironment(6, rng);
    const ga = new GenerationalGA(
      { populationSize: 150, eliteCount: 12, tournamentSize: 5, mutationRate: 0.5, mutationDecay: 0.99, minMutationRate: 0.03 },
      rng,
    );
    let population = env.newPopulation(150);
    for (let generation = 0; generation < 60; generation++) {
      population = ga.step(population, (g) => env.evaluate(g));
    }
    const champion = [...population].sort((a, b) => b.fitness - a.fitness)[0] as Network;
    expect(champion.fitness).toBeGreaterThan(0);

    const { center, innerRadius, outerRadius } = env.geometry;
    const midRadius = (innerRadius + outerRadius) / 2;
    const wallMargin = (outerRadius - innerRadius) * 0.15; // stay clear of either wall

    const episode = env.createEpisode(champion);
    const radii: number[] = [];
    let steps = 0;
    while (episode.step() && steps < 500) {
      const { x, y } = episode.snapshot;
      radii.push(Math.hypot(x - center, y - center));
      steps++;
    }
    expect(steps).toBeGreaterThan(50); // the champion should survive a meaningful stretch

    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    expect(avgRadius).toBeGreaterThan(innerRadius + wallMargin);
    expect(avgRadius).toBeLessThan(outerRadius - wallMargin);
    expect(Math.abs(avgRadius - midRadius)).toBeLessThan((outerRadius - innerRadius) / 2);
  }, 30000);
});
