import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { StringGenome } from "../src/genomes/stringGenome.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";

describe("StringGenome", () => {
  it("creates a genome of the requested length over the alphabet", () => {
    const genome = StringGenome.random(10, ALPHABET, new Rng(1));
    expect(genome.value).toHaveLength(10);
    for (const char of genome.value) {
      expect(ALPHABET).toContain(char);
    }
  });

  it("clone preserves value and fitness without aliasing", () => {
    const genome = StringGenome.random(8, ALPHABET, new Rng(1));
    genome.fitness = 5;
    const copy = genome.clone();
    expect(copy.value).toBe(genome.value);
    expect(copy.fitness).toBe(5);

    // Mutating the original's fitness must not touch the clone.
    genome.fitness = 99;
    expect(copy.fitness).toBe(5);
  });

  it("mutate returns a new genome of the same length over the alphabet", () => {
    const genome = StringGenome.random(12, ALPHABET, new Rng(1));
    const mutated = genome.mutate(0.5);
    expect(mutated).not.toBe(genome);
    expect(mutated.value).toHaveLength(12);
    for (const char of mutated.value) {
      expect(ALPHABET).toContain(char);
    }
  });

  it("mutate at rate 0 leaves the genome unchanged in value", () => {
    const genome = StringGenome.random(20, ALPHABET, new Rng(3));
    expect(genome.mutate(0).value).toBe(genome.value);
  });

  it("crossover yields a child whose characters come from a parent at each position", () => {
    const rng = new Rng(9);
    const a = StringGenome.random(15, ALPHABET, rng);
    const b = StringGenome.random(15, ALPHABET, rng);
    const child = a.crossover(b).value;
    for (let i = 0; i < child.length; i++) {
      expect([a.value[i], b.value[i]]).toContain(child[i]);
    }
  });

  it("rejects crossover with a mismatched length", () => {
    const rng = new Rng(9);
    const a = StringGenome.random(5, ALPHABET, rng);
    const b = StringGenome.random(6, ALPHABET, rng);
    expect(() => a.crossover(b)).toThrow(RangeError);
  });
});
