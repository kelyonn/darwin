import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { Network, type NetworkConfig } from "../src/core/network.js";

const CONFIG: NetworkConfig = {
  layerSizes: [2, 4, 1],
  initStdDev: 1,
  mutationStdDev: 0.5,
  outputActivation: "sigmoid",
};

describe("Network topology", () => {
  it("computes the parameter count for a topology", () => {
    // [2,4,1]: (4*2 + 4) + (1*4 + 1) = 12 + 5 = 17
    expect(Network.parameterCount([2, 4, 1])).toBe(17);
  });

  it("rejects degenerate topologies", () => {
    const rng = new Rng(1);
    expect(() => Network.random({ ...CONFIG, layerSizes: [3] }, rng)).toThrow(RangeError);
    expect(() => Network.random({ ...CONFIG, layerSizes: [2, 0, 1] }, rng)).toThrow(RangeError);
  });
});

describe("Network.feedForward", () => {
  it("produces one output in (0,1) for a sigmoid output layer", () => {
    const net = Network.random(CONFIG, new Rng(1));
    const out = net.feedForward([0.5, -0.5]);
    expect(out).toHaveLength(1);
    expect(out[0] as number).toBeGreaterThan(0);
    expect(out[0] as number).toBeLessThan(1);
  });

  it("produces outputs in (-1,1) for a tanh output layer", () => {
    const net = Network.random({ ...CONFIG, outputActivation: "tanh" }, new Rng(1));
    const value = net.feedForward([1, 1])[0] as number;
    expect(value).toBeGreaterThan(-1);
    expect(value).toBeLessThan(1);
  });

  it("is deterministic: same weights and input give the same output", () => {
    const net = Network.random(CONFIG, new Rng(7));
    const a = Array.from(net.feedForward([0.3, 0.9]));
    const b = Array.from(net.feedForward([0.3, 0.9]));
    expect(a).toEqual(b);
  });

  it("rejects an input of the wrong size", () => {
    const net = Network.random(CONFIG, new Rng(1));
    expect(() => net.feedForward([1])).toThrow(RangeError);
    expect(() => net.feedForward([1, 2, 3])).toThrow(RangeError);
  });
});

describe("Network as a Genome", () => {
  it("clone preserves outputs and fitness without aliasing weights", () => {
    const net = Network.random(CONFIG, new Rng(2));
    net.fitness = 3.5;
    const copy = net.clone();
    expect(copy.fitness).toBe(3.5);
    expect(Array.from(copy.feedForward([0.2, 0.7]))).toEqual(Array.from(net.feedForward([0.2, 0.7])));

    // Mutating the clone must not affect the original.
    const mutatedClone = copy.mutate(1);
    expect(Array.from(net.feedForward([0.2, 0.7]))).toEqual(
      Array.from(net.clone().feedForward([0.2, 0.7])),
    );
    expect(Array.from(mutatedClone.feedForward([0.2, 0.7]))).not.toEqual(
      Array.from(net.feedForward([0.2, 0.7])),
    );
  });

  it("crossover preserves topology (output shape)", () => {
    const rng = new Rng(3);
    const a = Network.random(CONFIG, rng);
    const b = Network.random(CONFIG, rng);
    expect(a.crossover(b).feedForward([0.1, 0.1])).toHaveLength(1);
  });

  it("rejects crossover with a different topology", () => {
    const rng = new Rng(3);
    const a = Network.random(CONFIG, rng);
    const b = Network.random({ ...CONFIG, layerSizes: [2, 5, 1] }, rng);
    expect(() => a.crossover(b)).toThrow(RangeError);
  });
});
