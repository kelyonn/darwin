import type { GaConfig } from "../core/ga.js";
import type { CoevolutionConfig } from "../search/coevolution.js";

/**
 * Demo hyperparameters for the five specimen plates (`main.ts`), extracted out
 * of the UI layer into named, exported, testable constants (§0.2 of
 * `.docs/remediation-plan.md`). Before this file existed, these were the most
 * experimentally significant numbers in the project — the ones ADR-008 and
 * ADR-009 were fought over — sitting inline inside `main.ts`, which has zero
 * test coverage.
 *
 * These are tuned for a live, watchable demo, not for measurement. Do not
 * merge them with `src/headless/runExperiment.ts`'s configs, which are
 * deliberately independent for that reason (see that file's header comment):
 * a viewer needs a plate that visibly evolves within seconds on screen; a
 * study needs a config chosen for experimental clarity and control. The two
 * files happen to agree in several places (e.g. the maze) because the demo
 * configs were the ones actually shipped, and a study should measure what
 * ships — but the agreement is not a rule to enforce.
 */

/** Elite fraction ≥ 5% of the population — the low-`eliteCount` plateau ADR-008 measured and fixed. */
export const MIN_ELITE_FRACTION = 0.05;

export const WEASEL_TARGET = "PROJECT DARWIN";

export const WEASEL_PRESET = {
  populationSize: 300,
  evolveInterval: 2,
  ga: { populationSize: 300, eliteCount: 1, tournamentSize: 5, mutationRate: 0.05 } as GaConfig,
};

/**
 * Same elite-fraction fix as Landscape (ADR-008): the low-`eliteCount` plateau
 * is a property of tournament+elitism breeding generally, not this genome's
 * mutation specifically — order-crossover semantics are unaffected by the
 * annealing mechanism, so this preset carries no decay/floor.
 */
export const TSP_PRESET = {
  nodeCount: 20,
  populationSize: 300,
  evolveInterval: 1,
  ga: { populationSize: 300, eliteCount: 20, tournamentSize: 5, mutationRate: 0.1 } as GaConfig,
};

/**
 * Same elite-fraction fix as Landscape/TSP above (ADR-008); checkpoint reward
 * is radius-weighted, see ADR-009. Round-paced (a generation is one cohort
 * round, not a fixed frame interval — see `TrackRunnerSimulation` in
 * `main.ts`), so there is no `evolveInterval` here; cohort size lives in
 * `main.ts`'s `TRACK_COHORT_SIZE` alongside the render-loop constants it's
 * paired with, not here among the GA hyperparameters.
 */
export const TRACKRUNNER_PRESET = {
  hiddenSize: 6,
  populationSize: 150,
  ga: {
    populationSize: 150,
    eliteCount: 12,
    tournamentSize: 5,
    mutationRate: 0.5,
    mutationDecay: 0.99,
    minMutationRate: 0.03,
  } as GaConfig,
};

/**
 * Cools toward refinement and uses the same raised elite fraction as the
 * other GA environments (ADR-008). Round-paced like Track Runner (see that
 * preset's doc) — no `evolveInterval`; cohort size lives in `main.ts`'s
 * `MAZE_COHORT_SIZE`.
 *
 * `NoveltySearch` also runs on this same maze (`--study maze-deception`,
 * `test/novelty.test.ts`) — a genuine second selection paradigm, proving
 * `SearchStrategy` is swappable with zero engine changes — but is no longer
 * part of the on-screen demo (ADR-016, `.docs/decisions.md`), so it no
 * longer needs a demo preset here; `MAZE_NOVELTY_CONFIG`, independent of this
 * file, covers `--study maze-deception` (`src/headless/runExperiment.ts`).
 */
export const MAZE_PRESET = {
  hiddenSize: 6,
  populationSize: 150,
  ga: {
    populationSize: 150,
    eliteCount: 12,
    tournamentSize: 5,
    mutationRate: 0.5,
    mutationDecay: 0.99,
    minMutationRate: 0.05,
  } as GaConfig,
};

/**
 * rate ~0.45 keeps total mutation energy near the previously-tuned balance now
 * that network magnitude scales with rate; a very gentle decay with a high
 * floor keeps the arms race lively without over-cooling it.
 */
export const PREDATOR_PREY_PRESET = {
  hiddenSize: 8,
  populationSize: 40,
  evolveInterval: 30,
  coevolution: {
    populationSize: 40,
    eliteCount: 2,
    tournamentSize: 4,
    mutationRate: 0.45,
    mutationDecay: 0.999,
    minMutationRate: 0.12,
    opponentSampleSize: 4,
    hallOfFameSize: 5,
  } as CoevolutionConfig,
};
