import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { VectorGenome } from "../src/genomes/vectorGenome.js";

const BOUNDS: readonly [number, number] = [-5.12, 5.12];

function withinBounds(values: readonly number[]): boolean {
  return values.every((v) => v >= BOUNDS[0] && v <= BOUNDS[1]);
}

describe("VectorGenome", () => {
  it("creates a genome of the requested length within bounds", () => {
    const genome = VectorGenome.random(4, 0.5, BOUNDS, new Rng(1));
    expect(genome.coordinates).toHaveLength(4);
    expect(withinBounds(genome.coordinates)).toBe(true);
  });

  it("clone preserves coordinates and fitness without aliasing", () => {
    const genome = VectorGenome.random(3, 0.5, BOUNDS, new Rng(1));
    genome.fitness = 7;
    const copy = genome.clone();
    expect(copy.coordinates).toEqual(genome.coordinates);
    expect(copy.fitness).toBe(7);
    genome.fitness = 0;
    expect(copy.fitness).toBe(7);
  });

  it("keeps mutated values within bounds", () => {
    const genome = VectorGenome.random(6, 2.0, BOUNDS, new Rng(2));
    for (let i = 0; i < 50; i++) {
      expect(withinBounds(genome.mutate(1).coordinates)).toBe(true);
    }
  });

  it("crossover blends within bounds and preserves length", () => {
    const rng = new Rng(3);
    const a = VectorGenome.random(5, 0.5, BOUNDS, rng);
    const b = VectorGenome.random(5, 0.5, BOUNDS, rng);
    const child = a.crossover(b);
    expect(child.coordinates).toHaveLength(5);
    expect(withinBounds(child.coordinates)).toBe(true);
  });

  it("rejects crossover with a mismatched length", () => {
    const rng = new Rng(3);
    const a = VectorGenome.random(4, 0.5, BOUNDS, rng);
    const b = VectorGenome.random(5, 0.5, BOUNDS, rng);
    expect(() => a.crossover(b)).toThrow(RangeError);
  });
});
