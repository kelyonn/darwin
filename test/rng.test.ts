import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";

describe("Rng", () => {
  it("produces an identical stream for identical seeds", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const streamA = Array.from({ length: 100 }, () => a.next());
    const streamB = Array.from({ length: 100 }, () => b.next());
    expect(streamA).toEqual(streamB);
  });

  it("produces different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("returns floats within [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns integers within [0, maxExclusive)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it("rejects invalid int bounds", () => {
    const rng = new Rng(7);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });

  it("rejects picking from an empty list", () => {
    const rng = new Rng(7);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
