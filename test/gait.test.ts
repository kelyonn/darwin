import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GaitEnvironment } from "../src/environments/gait.js";
import { Network } from "../src/core/network.js";

describe("GaitEnvironment", () => {
  it("scores a genome deterministically with a non-negative distance", () => {
    const env = new GaitEnvironment(4, new Rng(1));
    const [genome] = [env.spawn()] as [Network];
    const first = env.evaluate(genome);
    const second = env.evaluate(genome);
    expect(first).toEqual(second);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it("writes a two-dimensional behaviour descriptor within bounds", () => {
    const env = new GaitEnvironment(4, new Rng(2));
    const genome = env.spawn() as Network;
    env.evaluate(genome);
    expect(genome.behaviour).toHaveLength(2);
    const [stride, duty] = genome.behaviour as readonly [number, number];
    expect(stride).toBeGreaterThanOrEqual(0);
    expect(duty).toBeGreaterThanOrEqual(0);
    expect(duty).toBeLessThanOrEqual(1);
  });

  it("rejects non-network genomes", () => {
    const env = new GaitEnvironment(4, new Rng(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => env.evaluate({} as any)).toThrow(TypeError);
  });

  it("produces a live episode with well-formed, finite state every tick", () => {
    const env = new GaitEnvironment(4, new Rng(3));
    const genome = env.spawn() as Network;
    const episode = env.createEpisode(genome);
    let steps = 0;
    // A random controller's fall time varies with the seed, so this asserts the
    // simulation stays well-formed rather than asserting termination.
    while (episode.step() && steps < 2000) {
      expect(Number.isFinite(episode.snapshot.x)).toBe(true);
      expect(Number.isFinite(episode.snapshot.y)).toBe(true);
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
  });
});
