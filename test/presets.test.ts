import { describe, it, expect } from "vitest";
import type { GaConfig } from "../src/core/ga.js";
import {
  MIN_ELITE_FRACTION,
  WEASEL_TARGET,
  WEASEL_PRESET,
  TSP_PRESET,
  TRACKRUNNER_PRESET,
  MAZE_PRESET,
  PREDATOR_PREY_PRESET,
} from "../src/app/presets.js";

/**
 * The demo's hyperparameters (`src/app/presets.ts`) are the most
 * experimentally significant numbers in the project — the ones ADR-008 and
 * ADR-009 were fought over — and until §0.2 of `.docs/remediation-plan.md`
 * they lived untested inside `main.ts`. This locks in the invariants that
 * silently plateau a GA environment when violated, per `.docs/known-issues.md`.
 *
 * Only the five demo plates' presets are covered here (Weasel, TSP, Track
 * Runner, Maze, Predator–Prey) — Landscape/Cart-pole/Gait/XOR were cut from
 * the demo and no longer have a `*_PRESET` export, though their environments,
 * headless studies, and bench rows remain untouched elsewhere. The maze plate
 * is objective-only now (ADR-016) — `NoveltySearch` still runs on the
 * identical maze via `--study maze-deception`, just with its own config
 * there rather than a demo preset here.
 */
describe("demo presets", () => {
  function eliteFraction(config: GaConfig): number {
    return config.eliteCount / config.populationSize;
  }

  // ADR-008: these were the environments the measured plateau fix actually
  // touched — eliteCount raised to clear a real elite-fraction floor.
  const plateauFixedPresets: ReadonlyArray<readonly [string, GaConfig]> = [
    ["tsp", TSP_PRESET.ga],
    ["trackrunner", TRACKRUNNER_PRESET.ga],
    ["maze", MAZE_PRESET.ga],
  ];

  it.each(plateauFixedPresets)("%s clears the ADR-008 elite-fraction floor", (_name, config) => {
    expect(eliteFraction(config)).toBeGreaterThanOrEqual(MIN_ELITE_FRACTION);
  });

  it("predator-prey's coevolution config meets the elite-fraction floor", () => {
    // 2/40 = 5% — right at the boundary, not part of the ADR-008 fix (that fix
    // was single-population GA breeding) but proportionally reasonable per
    // known-issues.md.
    expect(eliteFraction(PREDATOR_PREY_PRESET.coevolution)).toBeGreaterThanOrEqual(MIN_ELITE_FRACTION);
  });

  it("Weasel is a documented, deliberate exception to the floor", () => {
    // known-issues.md, "Not touched": Weasel already solves exactly, so
    // there's no plateau to fix.
    expect(eliteFraction(WEASEL_PRESET.ga)).toBeLessThan(MIN_ELITE_FRACTION);
  });

  // Every preset carrying an annealing schedule (ADR-008's secondary
  // refinement) must keep the schedule well-formed: decay must actually cool
  // (not amplify) mutation, and the floor must not sit above the starting rate.
  const decayedPresets: ReadonlyArray<readonly [string, GaConfig]> = [
    ["trackrunner", TRACKRUNNER_PRESET.ga],
    ["maze", MAZE_PRESET.ga],
    ["predator-prey", PREDATOR_PREY_PRESET.coevolution],
  ];

  it.each(decayedPresets)("%s has a well-formed annealing schedule", (_name, config) => {
    if (config.mutationDecay !== undefined) {
      expect(config.mutationDecay).toBeGreaterThan(0);
      expect(config.mutationDecay).toBeLessThanOrEqual(1);
    }
    if (config.minMutationRate !== undefined) {
      expect(config.minMutationRate).toBeLessThanOrEqual(config.mutationRate);
    }
  });

  it("every GA/coevolution preset has a positive population and tournament size", () => {
    const all: readonly GaConfig[] = [
      WEASEL_PRESET.ga,
      TSP_PRESET.ga,
      TRACKRUNNER_PRESET.ga,
      MAZE_PRESET.ga,
      PREDATOR_PREY_PRESET.coevolution,
    ];
    for (const config of all) {
      expect(config.populationSize).toBeGreaterThan(0);
      expect(config.tournamentSize).toBeGreaterThan(0);
      expect(config.eliteCount).toBeGreaterThanOrEqual(0);
      expect(config.eliteCount).toBeLessThanOrEqual(config.populationSize);
    }
  });

  it("WEASEL_TARGET is non-empty", () => {
    expect(WEASEL_TARGET.length).toBeGreaterThan(0);
  });
});
