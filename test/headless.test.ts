import { describe, it, expect } from "vitest";
import { runSweep, toCsv, parseSeeds } from "../src/headless/runExperiment.js";

/**
 * The headless batch runner (M11) is the research substrate, so its two
 * load-bearing guarantees are tested here: byte-identical reproducibility on a
 * fixed seed (the precondition for any honest cross-seed comparison —
 * RESEARCH.md §7), and a well-formed long-format table.
 */
describe("headless experiment runner", () => {
  it("produces a byte-identical CSV for the same seeds twice", () => {
    const first = toCsv(runSweep(["xor"], [0, 1], 20));
    const second = toCsv(runSweep(["xor"], [0, 1], 20));
    expect(second).toBe(first);
  });

  it("emits one row per generation per seed, in order", () => {
    const seeds = [0, 1, 2];
    const generations = 10;
    const rows = runSweep(["weasel"], seeds, generations);
    expect(rows).toHaveLength(seeds.length * generations);
    // Generations count from 1..N for each seed.
    expect(rows[0]?.generation).toBe(1);
    expect(rows[generations - 1]?.generation).toBe(generations);
    expect(rows[generations]?.seed).toBe(1);
  });

  it("keeps different seeds actually distinct (not a constant stream)", () => {
    const rows = runSweep(["landscape"], [0, 1], 15);
    const seed0Final = rows.find((r) => r.seed === 0 && r.generation === 15)?.best;
    const seed1Final = rows.find((r) => r.seed === 1 && r.generation === 15)?.best;
    expect(seed0Final).toBeDefined();
    expect(seed1Final).toBeDefined();
    expect(seed0Final).not.toBe(seed1Final);
  });

  it("parses seed ranges and explicit lists", () => {
    expect(parseSeeds("0-4")).toEqual([0, 1, 2, 3, 4]);
    expect(parseSeeds("0,2,7")).toEqual([0, 2, 7]);
    expect(parseSeeds("3-3")).toEqual([3]);
  });

  it("rejects an unknown environment", () => {
    expect(() => runSweep(["nope"], [0], 1)).toThrow(/unknown environment/);
  });
});
