import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { PLATE } from "../src/render/palette.js";
import {
  WeaselView,
  TspView,
  TrackRunnerView,
  type TrackRunnerFrame,
  PredatorPreyView,
  MazeView,
  type MazeFrame,
} from "../src/render/views.js";
import { StringGenome } from "../src/genomes/stringGenome.js";
import { PermutationGenome } from "../src/genomes/permutationGenome.js";
import type { Genome } from "../src/core/genome.js";
import type { GenerationResult } from "../src/app/runner.js";
import type { PopulationStats } from "../src/core/stats.js";
import { TspEnvironment } from "../src/environments/tsp.js";
import { TrackRunnerEnvironment } from "../src/environments/trackrunner.js";
import { MazeEnvironment } from "../src/environments/maze.js";
import { createRecordingContext, type RecordedCall } from "./support/recordingContext.js";

/**
 * The render layer (`views.ts`, `main.ts` — 24% of the source tree per the
 * 2026-08-06 project review) had zero test coverage before this file. This is
 * not about coverage percentage: `drawIdle()` and every `episode === null` /
 * `champion === null` first-frame path are the ones that throw a blank plate
 * at a visitor on load, before a single generation has evolved, and nothing
 * previously caught them.
 *
 * Covers the five demo plates (Weasel, TSP, Track Runner, Maze, Predator–Prey)
 * — Landscape/Cart-pole/Gait/XOR were cut from the demo and no longer have a
 * view class here, though their environments and headless coverage remain.
 */

function fakeStats(best: number): PopulationStats {
  return { best, worst: 0, average: best / 2, spread: 0.1 };
}

function fakeResult(genome: Genome, generation: number): GenerationResult {
  genome.fitness = generation;
  return { generation, evaluated: [genome], best: genome, stats: fakeStats(generation) };
}

/** Every recorded (x, y) pair a call plausibly places on the plate, by method. */
function coordinatesOf(call: RecordedCall): ReadonlyArray<readonly [number, number]> {
  const [a, b, c, d] = call.args as number[];
  switch (call.method) {
    case "arc":
      return [[a as number, b as number]];
    case "moveTo":
    case "lineTo":
      return [[a as number, b as number]];
    case "fillText":
      return [[b as number, c as number]];
    case "fillRect":
    case "strokeRect":
      return [
        [a as number, b as number],
        [(a as number) + (c as number), (b as number) + (d as number)],
      ];
    default:
      return [];
  }
}

/** A generous margin beyond the exact stage rectangle: line widths, text metrics, and circle strokes all extend a few px past their anchor point without indicating a real layout break. */
const BOUNDS_MARGIN = 40;

function assertWithinStageBounds(calls: readonly RecordedCall[]): void {
  for (const call of calls) {
    for (const [x, y] of coordinatesOf(call)) {
      expect(x, `${call.method} x=${x} out of bounds`).toBeGreaterThanOrEqual(-BOUNDS_MARGIN);
      expect(x, `${call.method} x=${x} out of bounds`).toBeLessThanOrEqual(PLATE.width + BOUNDS_MARGIN);
      expect(y, `${call.method} y=${y} out of bounds`).toBeGreaterThanOrEqual(-BOUNDS_MARGIN);
      expect(y, `${call.method} y=${y} out of bounds`).toBeLessThanOrEqual(PLATE.height + BOUNDS_MARGIN);
    }
  }
}

describe("WeaselView", () => {
  it("draws on a fresh, empty state without throwing (no generation evolved yet)", () => {
    const { ctx, calls } = createRecordingContext();
    const view = new WeaselView(ctx, PLATE.width, PLATE.height, "TEST");
    expect(() => view.animate()).not.toThrow();
    assertWithinStageBounds(calls);
  });

  it("onGeneration then animate is idempotent", () => {
    const { ctx } = createRecordingContext();
    const view = new WeaselView(ctx, PLATE.width, PLATE.height, "TEST");
    const genome = StringGenome.random(4, "TEST", new Rng(1));
    view.onGeneration(fakeResult(genome, 1));
    expect(() => view.animate()).not.toThrow();
    expect(() => view.animate()).not.toThrow();
  });
});

describe("TspView", () => {
  it("draws on a fresh, empty state without throwing (no route yet)", () => {
    const { ctx, calls } = createRecordingContext();
    const env = new TspEnvironment(5, new Rng(1));
    const view = new TspView(ctx, PLATE.width, PLATE.height, env);
    expect(() => view.animate()).not.toThrow();
    assertWithinStageBounds(calls);
  });

  it("onGeneration then animate is idempotent", () => {
    const { ctx } = createRecordingContext();
    const rng = new Rng(1);
    const env = new TspEnvironment(5, rng);
    const view = new TspView(ctx, PLATE.width, PLATE.height, env);
    const genome = PermutationGenome.random(5, rng);
    view.onGeneration(fakeResult(genome, 1));
    expect(() => view.animate()).not.toThrow();
    expect(() => view.animate()).not.toThrow();
  });
});

/** A minimal three-role frame. */
function fakeTrackFrame(overrides: Partial<TrackRunnerFrame> = {}): TrackRunnerFrame {
  return {
    members: [
      { role: "champion", x: 0.7, y: 0.5, heading: 0, trail: [{ x: 0.65, y: 0.5 }, { x: 0.7, y: 0.5 }] },
      { role: "median", x: 0.5, y: 0.45, heading: 0.8, trail: [{ x: 0.5, y: 0.45 }] },
      { role: "worst", x: 0.3, y: 0.4, heading: 1.2, trail: [] },
    ],
    crashMarkers: [{ x: 0.3, y: 0.4, roundsAgo: 0 }, { x: 0.35, y: 0.45, roundsAgo: 2 }],
    status: "champion driving",
    history: [fakeStats(1)],
    ...overrides,
  };
}

describe("TrackRunnerView", () => {
  it("draws idle (no roles yet) without throwing", () => {
    const { ctx, calls } = createRecordingContext();
    const env = new TrackRunnerEnvironment(3, new Rng(1));
    const view = new TrackRunnerView(ctx, PLATE.width, PLATE.height, env);
    expect(() => view.drawIdle()).not.toThrow();
    assertWithinStageBounds(calls);
  });

  it("draws a three-role frame — trails, crash markers — without throwing", () => {
    const { ctx, calls } = createRecordingContext();
    const env = new TrackRunnerEnvironment(3, new Rng(1));
    const view = new TrackRunnerView(ctx, PLATE.width, PLATE.height, env);
    expect(() => view.draw(fakeTrackFrame())).not.toThrow();
    assertWithinStageBounds(calls);
    // A member with no trail history yet (round just started) must not throw
    // on the trail alpha calculation (division by an empty array's length).
    expect(() =>
      view.draw(fakeTrackFrame({ members: [{ role: "champion", x: 0.7, y: 0.5, heading: 0, trail: [] }] })),
    ).not.toThrow();
  });

  it("draw is idempotent across repeated calls with a growing history", () => {
    const { ctx } = createRecordingContext();
    const env = new TrackRunnerEnvironment(3, new Rng(1));
    const view = new TrackRunnerView(ctx, PLATE.width, PLATE.height, env);
    const history: PopulationStats[] = [];
    for (let i = 0; i < 5; i++) {
      history.push(fakeStats(i));
      expect(() => view.draw(fakeTrackFrame({ history: [...history] }))).not.toThrow();
    }
  });
});

describe("PredatorPreyView", () => {
  it("drawIdle (before any champion pairing exists) does not throw", () => {
    const { ctx, calls } = createRecordingContext();
    const view = new PredatorPreyView(ctx, PLATE.width, PLATE.height);
    expect(() => view.drawIdle()).not.toThrow();
    assertWithinStageBounds(calls);
  });

  it("draw is idempotent across repeated calls, including a growing CIAO plot", () => {
    const { ctx } = createRecordingContext();
    const view = new PredatorPreyView(ctx, PLATE.width, PLATE.height);
    const snapshot = {
      predator: { x: 0.25, y: 0.5, heading: 0 },
      prey: { x: 0.75, y: 0.5, heading: 0 },
      captured: false,
    };
    const ciao: number[][] = [];
    for (let i = 0; i < 5; i++) {
      ciao.push([0.4, 0.5, 0.6].slice(0, i + 1));
      expect(() => view.draw(snapshot, ciao)).not.toThrow();
    }
  });
});

/** A minimal three-role frame. */
function fakeMazeFrame(overrides: Partial<MazeFrame> = {}): MazeFrame {
  return {
    members: [
      { role: "champion", x: 1.5, y: 1.5, heading: 0, trail: [{ x: 1.2, y: 1.5 }, { x: 1.5, y: 1.5 }] },
      { role: "median", x: 2.0, y: 1.5, heading: 0.2, trail: [{ x: 2.0, y: 1.5 }] },
      { role: "worst", x: 2.5, y: 1.5, heading: 0.4, trail: [] },
    ],
    crashMarkers: [{ x: 2.5, y: 1.5, roundsAgo: 0 }, { x: 2.7, y: 1.6, roundsAgo: 2 }],
    status: "champion exploring",
    history: [fakeStats(0.5)],
    ...overrides,
  };
}

describe("MazeView", () => {
  it("draws idle (no roles yet) without throwing", () => {
    const { ctx, calls } = createRecordingContext();
    const env = new MazeEnvironment(3, new Rng(1));
    const view = new MazeView(ctx, PLATE.width, PLATE.height, env);
    expect(() => view.drawIdle()).not.toThrow();
    assertWithinStageBounds(calls);
  });

  it("draws a three-role frame — trails, crash markers — without throwing", () => {
    const { ctx, calls } = createRecordingContext();
    const env = new MazeEnvironment(3, new Rng(1));
    const view = new MazeView(ctx, PLATE.width, PLATE.height, env);
    expect(() => view.draw(fakeMazeFrame({ status: "champion reached goal" }))).not.toThrow();
    assertWithinStageBounds(calls);
    // A member with no trail history yet (round just started) must not throw
    // on the trail alpha calculation (division by an empty array's length).
    expect(() =>
      view.draw(fakeMazeFrame({ members: [{ role: "champion", x: 1.5, y: 1.5, heading: 0, trail: [] }] })),
    ).not.toThrow();
  });

  it("draw is idempotent across repeated calls with a growing history", () => {
    const { ctx } = createRecordingContext();
    const env = new MazeEnvironment(3, new Rng(1));
    const view = new MazeView(ctx, PLATE.width, PLATE.height, env);
    const history: PopulationStats[] = [];
    for (let i = 0; i < 5; i++) {
      history.push(fakeStats(i));
      expect(() => view.draw(fakeMazeFrame({ history: [...history] }))).not.toThrow();
    }
  });
});
