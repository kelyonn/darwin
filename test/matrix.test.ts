import { describe, it, expect } from "vitest";
import { matVecMul, addInPlace } from "../src/core/matrix.js";

describe("matVecMul", () => {
  it("computes a known 2x3 product", () => {
    // [[1,2,3],[4,5,6]] · [1,0,-1] = [1-3, 4-6] = [-2, -2]
    const matrix = new Float32Array([1, 2, 3, 4, 5, 6]);
    const vector = new Float32Array([1, 0, -1]);
    const out = new Float32Array(2);
    matVecMul(matrix, vector, 2, 3, out);
    expect(Array.from(out)).toEqual([-2, -2]);
  });

  it("acts as identity with the identity matrix", () => {
    const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const vector = new Float32Array([7, -3, 2]);
    const out = new Float32Array(3);
    matVecMul(identity, vector, 3, 3, out);
    expect(Array.from(out)).toEqual([7, -3, 2]);
  });

  it("rejects inconsistent dimensions", () => {
    const out = new Float32Array(2);
    expect(() => matVecMul(new Float32Array(5), new Float32Array(3), 2, 3, out)).toThrow(RangeError);
    expect(() => matVecMul(new Float32Array(6), new Float32Array(2), 2, 3, out)).toThrow(RangeError);
    expect(() => matVecMul(new Float32Array(6), new Float32Array(3), 2, 3, new Float32Array(3))).toThrow(
      RangeError,
    );
  });
});

describe("addInPlace", () => {
  it("adds element-wise", () => {
    const target = new Float32Array([1, 2, 3]);
    addInPlace(target, new Float32Array([10, 20, 30]));
    expect(Array.from(target)).toEqual([11, 22, 33]);
  });

  it("rejects a length mismatch", () => {
    expect(() => addInPlace(new Float32Array(3), new Float32Array(2))).toThrow(RangeError);
  });
});
