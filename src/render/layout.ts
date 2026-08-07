/**
 * Named plate geometry (§3.2 of `.docs/remediation-plan.md`): the positional
 * constants that were previously duplicated as bare numeric literals across
 * `views.ts` and would silently drift apart if edited in only one call site.
 * Sits beside `palette.ts`'s `PLATE`/`INSET_RECT` — both hold shared layout,
 * split here only because `palette.ts` is the colour/drawing-primitive module
 * and this is geometry specific to the render layer's view classes.
 *
 * Not everything numeric in `views.ts` belongs here — a `0.5` inside a
 * midpoint calculation, or a per-view fill fraction chosen once for that
 * view's own visual padding, stays local. This file holds only the values
 * that are either repeated verbatim across multiple views, or that must stay
 * consistent with a constant defined elsewhere (`LENS_CLIP_INSET` in
 * `palette.ts`, which `drawLens` itself uses).
 */

/** The plate's default single-lens geometry, shared by most environments. */
export const LENS_CX = 590;
export const LENS_CY = 380;
export const LENS_R = 260;

/**
 * Fitness-history buffer cap shared by every sparkline-driven view: bounds
 * memory and keeps the sparkline showing a recent window rather than growing
 * unbounded over a long-running demo. Previously duplicated as a bare `400`
 * in six view classes.
 */
export const MAX_FITNESS_HISTORY = 400;

/**
 * How many past rounds a crash/failure marker stays visible for, fading with
 * age, on a round-paced plate (Track Runner, Maze). Shared between the
 * `Simulation` that ages and prunes markers (`main.ts`) and the `View` that
 * fades them by the same count when drawing — kept here, not duplicated in
 * both, so the two can't silently drift apart.
 */
export const CRASH_MARKER_ROUNDS = 3;

/** Crash/failure marker radius on a round-paced plate. */
export const CRASH_MARKER_RADIUS = 4;
