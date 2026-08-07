import { describe, it, expect } from "vitest";
import {
  runSweep,
  toCsv,
  parseSeeds,
  mazeDeceptionStudy,
  coevolutionProgressStudy,
  crossRepresentationStudy,
  toStudyCsv,
  type StudyRow,
} from "../src/headless/runExperiment.js";

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

/**
 * Named studies (§0.1, `.docs/remediation-plan.md`) answer a specific
 * comparative question and must be exactly as reproducible as the sweep — a
 * study whose output drifts between runs cannot back an honest claim.
 */
describe("named studies", () => {
  it("maze-deception produces a byte-identical table for the same seeds twice", () => {
    const first = toStudyCsv(mazeDeceptionStudy([0, 1], 10));
    const second = toStudyCsv(mazeDeceptionStudy([0, 1], 10));
    expect(second).toBe(first);
  });

  it("maze-deception reports both strategies with well-formed row shapes", () => {
    const rows = mazeDeceptionStudy([0, 1, 2], 10);
    const conditions = rows.map((r) => `${r.condition}/${r.metric}`);
    expect(conditions).toContain("objective/generations-to-solve");
    expect(conditions).toContain("novelty/generations-to-solve");
    expect(conditions).toContain("random-initial-population/solve-rate-at-generation-1");
    for (const row of rows) {
      expect(row.n).toBeGreaterThanOrEqual(0);
      expect(row.q1).toBeLessThanOrEqual(row.median);
      expect(row.median).toBeLessThanOrEqual(row.q3);
    }
  });

  it("coevolution-progress produces a byte-identical table for the same seeds twice", () => {
    // A small generation count is enough to lock in reproducibility — this is
    // a structural check, not a measurement; `npm run experiment` is where the
    // full 200-generation study actually runs (each contest now runs
    // `TRIALS = 3` conditions per ADR-012, so keeping this small matters for
    // suite runtime). Running the study twice is still ~6.7s of genuine
    // synchronous work (measured), past vitest's 5000ms default — timeout
    // sized with a comfortable margin above that.
    const first = toStudyCsv(coevolutionProgressStudy([0, 1], 6));
    const second = toStudyCsv(coevolutionProgressStudy([0, 1], 6));
    expect(second).toBe(first);
  }, 15000);

  it("coevolution-progress buckets generations and reports rates in [0, 1]", () => {
    const rows = coevolutionProgressStudy([0, 1], 6);
    // 6 generations / 50-gen buckets = 1 bucket, ×2 metrics = 2 rows.
    expect(rows).toHaveLength(2);
    expect(rows[0]?.condition).toBe("gen1-6");
    for (const row of rows) {
      expect(row.median).toBeGreaterThanOrEqual(0);
      expect(row.median).toBeLessThanOrEqual(1);
    }
  });

  it("cross-representation produces a byte-identical table for the same seeds twice", () => {
    const first = toStudyCsv(crossRepresentationStudy([0, 1], 15));
    const second = toStudyCsv(crossRepresentationStudy([0, 1], 15));
    expect(second).toBe(first);
  });

  it("cross-representation reports both encodings for both environments, all fitnesses in [0, 1]", () => {
    const rows = crossRepresentationStudy([0, 1, 2], 15);
    const conditions = rows.map((r) => `${r.condition}/${r.metric}`);
    expect(conditions).toContain("tsp/permutation/final-fitness");
    expect(conditions).toContain("tsp/random-key/final-fitness");
    expect(conditions).toContain("landscape/real-coded/final-fitness");
    expect(conditions).toContain("landscape/binary/final-fitness");
    for (const row of rows) {
      if (row.metric === "final-fitness") {
        expect(row.median).toBeGreaterThanOrEqual(0);
        expect(row.median).toBeLessThanOrEqual(1);
      }
    }
  });

  it("cross-representation's TSP conditions score the identical fixed node layout, not one drawn per seed", () => {
    // The whole point of this study is comparing encodings on the same
    // problem instance. Running it twice with disjoint seed sets should still
    // reach comparable fitness ranges — if node layout varied by seed like
    // the plain `--env tsp` sweep does, results across independent seed sets
    // could differ by more than search-randomness alone explains.
    const firstHalf = crossRepresentationStudy([0, 1, 2], 15);
    const secondHalf = crossRepresentationStudy([10, 11, 12], 15);
    const medianOf = (rows: readonly StudyRow[], condition: string): number =>
      rows.find((r) => r.condition === condition && r.metric === "final-fitness")?.median as number;
    for (const condition of ["tsp/permutation", "tsp/random-key"]) {
      const a = medianOf(firstHalf, condition);
      const b = medianOf(secondHalf, condition);
      expect(Math.abs(a - b)).toBeLessThan(0.15);
    }
  });
});
