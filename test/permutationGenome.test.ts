import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { PermutationGenome } from "../src/genomes/permutationGenome.js";

/** A valid permutation of length n contains each of 0..n-1 exactly once. */
function isValidPermutation(order: readonly number[], length: number): boolean {
  if (order.length !== length) return false;
  const seen = new Set(order);
  if (seen.size !== length) return false;
  for (let i = 0; i < length; i++) {
    if (!seen.has(i)) return false;
  }
  return true;
}

describe("PermutationGenome", () => {
  it("creates a valid random permutation", () => {
    for (let seed = 0; seed < 20; seed++) {
      const genome = PermutationGenome.random(12, new Rng(seed));
      expect(isValidPermutation(genome.sequence, 12)).toBe(true);
    }
  });

  it("mutation preserves validity", () => {
    const genome = PermutationGenome.random(15, new Rng(1));
    for (let i = 0; i < 100; i++) {
      expect(isValidPermutation(genome.mutate(0.3).sequence, 15)).toBe(true);
    }
  });

  it("order crossover preserves validity for many seeds and slices", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = new Rng(seed);
      const a = PermutationGenome.random(10, rng);
      const b = PermutationGenome.random(10, rng);
      const child = a.crossover(b);
      expect(isValidPermutation(child.sequence, 10)).toBe(true);
    }
  });

  it("clone preserves sequence and fitness without aliasing", () => {
    const genome = PermutationGenome.random(8, new Rng(1));
    genome.fitness = 3;
    const copy = genome.clone();
    expect(copy.sequence).toEqual(genome.sequence);
    expect(copy.fitness).toBe(3);
    genome.fitness = 0;
    expect(copy.fitness).toBe(3);
  });

  it("rejects crossover with a mismatched length", () => {
    const rng = new Rng(1);
    const a = PermutationGenome.random(6, rng);
    const b = PermutationGenome.random(7, rng);
    expect(() => a.crossover(b)).toThrow(RangeError);
  });
});
