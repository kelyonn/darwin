/**
 * Hand-written matrix math — the hot path (PRD §3, §8).
 *
 * Matrices are stored row-major in `Float32Array` (the biggest single lever for
 * speed and memory, PRD §8) with dimensions passed explicitly rather than
 * boxed into an object, so the inner loops stay allocation-free.
 *
 * Typed-array element reads are asserted as `number`: every index below is
 * provably within bounds by loop construction, but `noUncheckedIndexedAccess`
 * otherwise widens indexed access to `number | undefined`.
 */

/**
 * Computes the matrix–vector product `out = matrix · vector`.
 *
 * @param matrix Row-major, length `rows * cols`.
 * @param vector Length `cols`.
 * @param rows   Number of output rows.
 * @param cols   Number of input columns.
 * @param out    Destination, length `rows`. Overwritten in full.
 * @returns `out`, for chaining.
 * @throws if any length is inconsistent with `rows`/`cols`.
 */
export function matVecMul(
  matrix: Float32Array,
  vector: Float32Array,
  rows: number,
  cols: number,
  out: Float32Array,
): Float32Array {
  if (matrix.length !== rows * cols) {
    throw new RangeError(`matrix length ${matrix.length} !== rows*cols ${rows * cols}`);
  }
  if (vector.length !== cols) {
    throw new RangeError(`vector length ${vector.length} !== cols ${cols}`);
  }
  if (out.length !== rows) {
    throw new RangeError(`out length ${out.length} !== rows ${rows}`);
  }

  for (let r = 0; r < rows; r++) {
    const rowOffset = r * cols;
    let sum = 0;
    for (let c = 0; c < cols; c++) {
      sum += (matrix[rowOffset + c] as number) * (vector[c] as number);
    }
    out[r] = sum;
  }
  return out;
}

/** Adds `bias` into `target` element-wise, in place. Both must share length. */
export function addInPlace(target: Float32Array, bias: Float32Array): Float32Array {
  if (target.length !== bias.length) {
    throw new RangeError(`length mismatch: ${target.length} vs ${bias.length}`);
  }
  for (let i = 0; i < target.length; i++) {
    target[i] = (target[i] as number) + (bias[i] as number);
  }
  return target;
}
