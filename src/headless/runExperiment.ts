import { Rng } from "../core/rng.js";
import { GenerationalGA, type GaConfig } from "../core/ga.js";
import { Runner } from "../app/runner.js";
import type { Environment } from "../environments/Environment.js";
import type { Genome } from "../core/genome.js";
import type { SearchStrategy } from "../core/search.js";
import { WeaselEnvironment } from "../environments/weasel.js";
import {
  LandscapeEnvironment,
  RealCodedEncoding,
  BinaryEncoding,
  type PointEncodingFactory,
} from "../environments/landscape.js";
import {
  TspEnvironment,
  PermutationEncoding,
  RandomKeyEncoding,
  type Node,
  type TourEncodingFactory,
} from "../environments/tsp.js";
import { CartPoleEnvironment } from "../environments/cartpole.js";
import { TrackRunnerEnvironment } from "../environments/trackrunner.js";
import { MazeEnvironment } from "../environments/maze.js";
import { XorEnvironment } from "../environments/xor.js";
import { NoveltySearch, type NoveltyConfig } from "../search/novelty.js";
import {
  CoevolutionDriver,
  dominanceCount,
  type CoevolutionConfig,
  type CoevolutionState,
} from "../search/coevolution.js";
import { PredatorPreyEnvironment } from "../environments/predatorPrey.js";
import { Network } from "../core/network.js";

/**
 * Headless batch runner (M11; ARCHITECTURE.md §2, RESEARCH.md §7).
 *
 * Drives the *same* representation-blind `core/` + `search/` code the browser
 * demo uses — with no DOM and no canvas — across many seeds, emitting tidy
 * long-format CSV/JSON (one row per generation per seed). This is the substrate
 * the cross-representation study needs: reproducible, scriptable, comparable on
 * identical seed sequences.
 *
 * Runs under Node's native TypeScript execution (`--experimental-transform-types`,
 * which handles this codebase's parameter properties) plus a zero-dependency
 * import hook (`scripts/ts-import-hook.mjs`) that maps the source tree's `.js`
 * specifiers onto the `.ts` files on disk — no build step, no new runtime deps,
 * in keeping with the project's hard rule (PRD §1). Invoke via `npm run experiment`.
 *
 * The configs here are chosen for experimental *clarity and control*, and are
 * deliberately independent of the demo's display tuning in `main.ts` (which is
 * tuned for watchability, not measurement). Only single-population, GA-driven
 * environments are covered by the basic sweep (`--env`); named comparisons —
 * including the two-population coevolution driver, which the sweep's
 * single-population `SweepRow` shape cannot express — live under `--study`
 * (see the "Named studies" section below).
 */

/** One generation's fitness statistics for one seed, the unit of output. */
interface SweepRow {
  readonly env: string;
  readonly seed: number;
  readonly generation: number;
  readonly best: number;
  readonly average: number;
  readonly spread: number;
}

/** A runnable GA environment: how to build it, how big, and a sensible budget. */
interface ExperimentSpec {
  readonly populationSize: number;
  readonly defaultGenerations: number;
  build(rng: Rng): { environment: Environment; strategy: SearchStrategy };
}

/** Standard tournament + elitism config, parameterised by the two knobs that vary. */
function gaConfig(populationSize: number, eliteCount: number, mutationRate: number): GaConfig {
  return { populationSize, eliteCount, tournamentSize: 5, mutationRate };
}

/**
 * The GA-driven environments the sweep can run. Elite fraction (~8%) follows the
 * measured plateau fix (ADR-008); mutation rates are per-genome-type sensible
 * defaults. Kept explicit and readable rather than imported from the demo so a
 * reader can trust exactly what was run.
 */
const EXPERIMENTS: Record<string, ExperimentSpec> = {
  weasel: {
    populationSize: 300,
    defaultGenerations: 100,
    build: (rng) => ({
      environment: new WeaselEnvironment("PROJECT DARWIN", rng),
      strategy: new GenerationalGA(gaConfig(300, 1, 0.05), rng),
    }),
  },
  landscape: {
    populationSize: 300,
    defaultGenerations: 200,
    build: (rng) => ({
      environment: new LandscapeEnvironment(2, rng),
      strategy: new GenerationalGA(gaConfig(300, 20, 0.3), rng),
    }),
  },
  tsp: {
    populationSize: 300,
    defaultGenerations: 200,
    build: (rng) => ({
      environment: new TspEnvironment(20, rng),
      strategy: new GenerationalGA(gaConfig(300, 20, 0.1), rng),
    }),
  },
  cartpole: {
    populationSize: 150,
    defaultGenerations: 40,
    build: (rng) => ({
      environment: new CartPoleEnvironment(600, 6, 3, rng),
      strategy: new GenerationalGA(gaConfig(150, 12, 0.5), rng),
    }),
  },
  trackrunner: {
    populationSize: 150,
    defaultGenerations: 60,
    build: (rng) => ({
      environment: new TrackRunnerEnvironment(6, rng),
      strategy: new GenerationalGA(gaConfig(150, 12, 0.5), rng),
    }),
  },
  maze: {
    populationSize: 150,
    defaultGenerations: 40,
    build: (rng) => ({
      environment: new MazeEnvironment(6, rng),
      strategy: new GenerationalGA(gaConfig(150, 12, 0.5), rng),
    }),
  },
  xor: {
    populationSize: 100,
    defaultGenerations: 150,
    build: (rng) => ({
      environment: new XorEnvironment(4, rng),
      strategy: new GenerationalGA(gaConfig(100, 8, 0.4), rng),
    }),
  },
};

/** Runs one environment on one seed for `generations`, returning a row per generation. */
function runOne(env: string, seed: number, generations: number): SweepRow[] {
  const spec = EXPERIMENTS[env];
  if (spec === undefined) throw new Error(`unknown environment "${env}"`);
  const rng = new Rng(seed);
  const { environment, strategy } = spec.build(rng);
  const runner = new Runner(environment, strategy, spec.populationSize);
  const rows: SweepRow[] = [];
  for (let g = 0; g < generations; g++) {
    const result = runner.advance();
    rows.push({
      env,
      seed,
      generation: result.generation,
      best: result.stats.best,
      average: result.stats.average,
      spread: result.stats.spread,
    });
  }
  return rows;
}

/** Runs the full sweep of `envs × seeds`, flattened into one row list. */
export function runSweep(envs: readonly string[], seeds: readonly number[], generations?: number): SweepRow[] {
  const rows: SweepRow[] = [];
  for (const env of envs) {
    const spec = EXPERIMENTS[env];
    if (spec === undefined) throw new Error(`unknown environment "${env}"`);
    const budget = generations ?? spec.defaultGenerations;
    for (const seed of seeds) rows.push(...runOne(env, seed, budget));
  }
  return rows;
}

/** Serialises rows to CSV (long format: one line per generation per seed). */
export function toCsv(rows: readonly SweepRow[]): string {
  const header = "env,seed,generation,best,average,spread";
  const body = rows.map((r) => `${r.env},${r.seed},${r.generation},${r.best},${r.average},${r.spread}`);
  return [header, ...body].join("\n");
}

/**
 * Named studies (§0.1 of `.docs/remediation-plan.md`).
 *
 * Unlike the sweep above, a study answers a specific comparative question — "did
 * A beat B" — rather than dumping a raw per-generation trace. Each study emits
 * one row per (condition, metric) pair, summarised across seeds as
 * median/Q1/Q3. For point statistics (a solve rate, not a distribution) `q1`
 * and `q3` collapse to the same value as `median` by convention — still one
 * consistent row shape.
 */
export interface StudyRow {
  readonly study: string;
  readonly condition: string;
  readonly metric: string;
  /** Number of seeds this row was computed over (0 if nothing to report). */
  readonly n: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
}

/** Linear-interpolated quantile of an already-sorted array. `NaN` if empty. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] as number;
  const fraction = position - lower;
  return (sorted[lower] as number) * (1 - fraction) + (sorted[upper] as number) * fraction;
}

/** Summarises one (condition, metric) pair's values across seeds into a {@link StudyRow}. */
function summarize(study: string, condition: string, metric: string, values: readonly number[]): StudyRow {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    study,
    condition,
    metric,
    n: sorted.length,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** The fittest genome of a scored generation, as a {@link Network}. Mirrors `main.ts`'s helper. */
function fittestNetwork(population: readonly Genome[]): Network {
  let best = population[0];
  if (best === undefined) throw new Error("cannot take a champion of an empty population");
  for (const genome of population) {
    if (genome.fitness > best.fitness) best = genome;
  }
  if (!(best instanceof Network)) throw new TypeError("expected a Network champion");
  return best;
}

/** The demo's exact maze configs (`main.ts`, Plate VII), duplicated here so the study measures what ships. */
const MAZE_OBJECTIVE_CONFIG: GaConfig = {
  populationSize: 150,
  eliteCount: 12,
  tournamentSize: 5,
  mutationRate: 0.5,
  mutationDecay: 0.99,
  minMutationRate: 0.05,
};
const MAZE_NOVELTY_CONFIG: NoveltyConfig = {
  populationSize: 150,
  eliteCount: 2,
  tournamentSize: 5,
  mutationRate: 0.4,
  neighbours: 8,
  archiveThreshold: 0.03,
  archiveLimit: 400,
};

/**
 * Compares objective GA against Novelty Search on the identical deceptive maze
 * (ADR-010): generations-to-solve per seed for each strategy, plus how often
 * the random initial population already solves it before any evolution. This
 * is the number the maze plate's footnote must cite (`.docs/decisions.md`,
 * ADR-010) rather than asserting a contrast without one.
 */
export function mazeDeceptionStudy(seeds: readonly number[], generations = 40): StudyRow[] {
  const objectiveGenerations: number[] = [];
  const noveltyGenerations: number[] = [];
  let solvedAtGenerationOne = 0;

  for (const seed of seeds) {
    const objectiveRng = new Rng(seed);
    const noveltyRng = new Rng(seed);
    const objectiveEnv = new MazeEnvironment(6, objectiveRng);
    const noveltyEnv = new MazeEnvironment(6, noveltyRng);
    const ga = new GenerationalGA(MAZE_OBJECTIVE_CONFIG, objectiveRng);
    const novelty = new NoveltySearch(MAZE_NOVELTY_CONFIG, noveltyRng);
    const runner = new Runner(objectiveEnv, ga, MAZE_OBJECTIVE_CONFIG.populationSize);
    let noveltyPopulation = noveltyEnv.newPopulation(MAZE_NOVELTY_CONFIG.populationSize);

    let objectiveSolvedAt: number | null = null;
    let noveltySolvedAt: number | null = null;
    for (let g = 0; g < generations && (objectiveSolvedAt === null || noveltySolvedAt === null); g++) {
      const result = runner.advance();
      if (objectiveSolvedAt === null && MazeEnvironment.isSolved(result.stats.best)) {
        objectiveSolvedAt = g + 1;
      }

      const evaluated = noveltyPopulation;
      let solvedThisGeneration = false;
      noveltyPopulation = novelty.step(evaluated, (genome) => {
        const score = noveltyEnv.evaluate(genome);
        if (MazeEnvironment.isSolved(score)) solvedThisGeneration = true;
        return score;
      });
      if (noveltySolvedAt === null && solvedThisGeneration) {
        noveltySolvedAt = g + 1;
      }
    }

    if (objectiveSolvedAt !== null) {
      objectiveGenerations.push(objectiveSolvedAt);
      if (objectiveSolvedAt === 1) solvedAtGenerationOne++;
    }
    if (noveltySolvedAt !== null) {
      noveltyGenerations.push(noveltySolvedAt);
    }
  }

  return [
    summarize("maze-deception", "objective", "generations-to-solve", objectiveGenerations),
    summarize("maze-deception", "novelty", "generations-to-solve", noveltyGenerations),
    summarize("maze-deception", "objective", "solve-rate-within-budget", [objectiveGenerations.length / seeds.length]),
    summarize("maze-deception", "novelty", "solve-rate-within-budget", [noveltyGenerations.length / seeds.length]),
    summarize("maze-deception", "random-initial-population", "solve-rate-at-generation-1", [
      solvedAtGenerationOne / seeds.length,
    ]),
  ];
}

/** The demo's exact predator–prey config (`main.ts`, Plate I). */
const COEVOLUTION_CONFIG: CoevolutionConfig = {
  populationSize: 40,
  eliteCount: 2,
  tournamentSize: 4,
  mutationRate: 0.45,
  mutationDecay: 0.999,
  minMutationRate: 0.12,
  opponentSampleSize: 4,
  hallOfFameSize: 5,
};
const COEVOLUTION_BUCKET_SIZE = 50;

/**
 * Tracks the predator–prey arms race's capture rate and dominance *fraction*
 * (dominated ancestors ÷ total ancestors — see ADR-012 and §1.2 of the
 * remediation plan) across generation buckets. Unlike the raw dominance
 * *count*, which rises mechanically as the ancestor archive grows regardless
 * of real progress, the fraction can fall — and this study is what makes that
 * visible instead of assumed.
 */
export function coevolutionProgressStudy(seeds: readonly number[], generations = 200): StudyRow[] {
  const bucketCount = Math.ceil(generations / COEVOLUTION_BUCKET_SIZE);
  const captureRateBySeed: number[][] = Array.from({ length: bucketCount }, () => []);
  const dominanceFractionBySeed: number[][] = Array.from({ length: bucketCount }, () => []);

  for (const seed of seeds) {
    const rng = new Rng(seed);
    const env = new PredatorPreyEnvironment(8, rng);
    const populationSize = COEVOLUTION_CONFIG.populationSize;
    const driver = new CoevolutionDriver(env.compete, COEVOLUTION_CONFIG, rng);
    let state: CoevolutionState = {
      predators: env.newPredators(populationSize),
      prey: env.newPrey(populationSize),
    };
    const preyChampions: Network[] = [];
    const seedCaptureRate: number[][] = Array.from({ length: bucketCount }, () => []);
    const seedDominanceFraction: number[][] = Array.from({ length: bucketCount }, () => []);

    for (let g = 0; g < generations; g++) {
      const { next, stats } = driver.step(state);
      const championPredator = fittestNetwork(state.predators);
      const championPrey = fittestNetwork(state.prey);
      preyChampions.push(championPrey.clone());
      const ciaoRow = preyChampions.map((prey) => env.compete(championPredator, prey).predatorScore);
      const dominanceFraction = ciaoRow.length > 0 ? dominanceCount(ciaoRow) / ciaoRow.length : 0;

      const bucket = Math.min(bucketCount - 1, Math.floor(g / COEVOLUTION_BUCKET_SIZE));
      seedCaptureRate[bucket]?.push(stats.captureRate);
      seedDominanceFraction[bucket]?.push(dominanceFraction);

      state = next;
    }

    for (let b = 0; b < bucketCount; b++) {
      const captures = seedCaptureRate[b] as number[];
      const dominances = seedDominanceFraction[b] as number[];
      if (captures.length > 0) captureRateBySeed[b]?.push(mean(captures));
      if (dominances.length > 0) dominanceFractionBySeed[b]?.push(mean(dominances));
    }
  }

  const rows: StudyRow[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const lo = b * COEVOLUTION_BUCKET_SIZE + 1;
    const hi = Math.min(generations, (b + 1) * COEVOLUTION_BUCKET_SIZE);
    const condition = `gen${lo}-${hi}`;
    rows.push(summarize("coevolution-progress", condition, "capture-rate", captureRateBySeed[b] ?? []));
    rows.push(summarize("coevolution-progress", condition, "dominance-fraction", dominanceFractionBySeed[b] ?? []));
  }
  return rows;
}

/**
 * A fixed TSP instance: 20 nodes generated once from a dedicated seed
 * independent of the study's own trial seeds. The cross-representation study
 * (below) compares *encodings*, not problem instances — every trial seed must
 * see the identical node layout so a difference in outcome is attributable to
 * the encoding, not to which seed happened to draw an easier map.
 */
const CROSS_REPRESENTATION_TSP_NODE_SEED = 12345;
const CROSS_REPRESENTATION_TSP_NODE_COUNT = 20;

function crossRepresentationTspNodes(): readonly Node[] {
  const rng = new Rng(CROSS_REPRESENTATION_TSP_NODE_SEED);
  return Array.from({ length: CROSS_REPRESENTATION_TSP_NODE_COUNT }, () => ({ x: rng.next(), y: rng.next() }));
}

/** Rastrigin has no problem-instance seed to hold fixed — the function itself is deterministic; only the population's evolutionary randomness varies by trial seed. */
const LANDSCAPE_DIMENSIONS = 2;
/** Fitness above which Landscape counts as "reached the optimum" — `1/(1+value)` at `value` just under 0.11, deep in the basin around the global minimum. */
const LANDSCAPE_SOLVED_THRESHOLD = 0.9;

/** One genetic representation under comparison: its config and how to build its encoding. */
interface EncodingCondition<Factory> {
  readonly gaConfig: GaConfig;
  readonly factory: Factory;
}

/**
 * Compares alternative genetic representations of the *same* problem (ADR-013):
 * TSP under `PermutationEncoding` (Order Crossover on the permutation
 * directly) vs. `RandomKeyEncoding` (Bean, 1994 — a real-valued vector whose
 * sort order is the tour), and Landscape under `RealCodedEncoding` (the
 * original `VectorGenome`) vs. `BinaryEncoding` (a fixed-width bit-string
 * `StringGenome`, the classic binary-coded GA representation). This is the
 * experiment that makes "representation-blind" a measured result rather than
 * an architectural claim: the identical, unmodified `GenerationalGA` drives
 * every condition below.
 */
export function crossRepresentationStudy(seeds: readonly number[], generations?: number): StudyRow[] {
  const rows: StudyRow[] = [];
  const tspGenerations = generations ?? 150;
  const landscapeGenerations = generations ?? 200;

  const tspNodes = crossRepresentationTspNodes();
  const tspConditions: Record<string, EncodingCondition<TourEncodingFactory>> = {
    permutation: {
      gaConfig: { populationSize: 200, eliteCount: 16, tournamentSize: 5, mutationRate: 0.1 },
      factory: (nodeCount, rng) => new PermutationEncoding(nodeCount, rng),
    },
    "random-key": {
      gaConfig: { populationSize: 200, eliteCount: 16, tournamentSize: 5, mutationRate: 0.3 },
      factory: (nodeCount, rng) => new RandomKeyEncoding(nodeCount, rng),
    },
  };
  for (const [label, { gaConfig, factory }] of Object.entries(tspConditions)) {
    const finals: number[] = [];
    for (const seed of seeds) {
      const rng = new Rng(seed);
      const environment = new TspEnvironment(tspNodes, rng, factory);
      const ga = new GenerationalGA(gaConfig, rng);
      const runner = new Runner(environment, ga, gaConfig.populationSize);
      let best = 0;
      for (let g = 0; g < tspGenerations; g++) best = runner.advance().stats.best;
      finals.push(best);
    }
    rows.push(summarize("cross-representation", `tsp/${label}`, "final-fitness", finals));
  }

  const landscapeConditions: Record<string, EncodingCondition<PointEncodingFactory>> = {
    "real-coded": {
      gaConfig: {
        populationSize: 200,
        eliteCount: 16,
        tournamentSize: 5,
        mutationRate: 1.0,
        mutationDecay: 0.985,
        minMutationRate: 0.02,
      },
      factory: (dimensions, rng) => new RealCodedEncoding(dimensions, rng),
    },
    binary: {
      gaConfig: { populationSize: 200, eliteCount: 16, tournamentSize: 5, mutationRate: 0.02 },
      factory: (dimensions, rng) => new BinaryEncoding(dimensions, rng),
    },
  };
  for (const [label, { gaConfig, factory }] of Object.entries(landscapeConditions)) {
    const finals: number[] = [];
    const generationsToSolve: number[] = [];
    for (const seed of seeds) {
      const rng = new Rng(seed);
      const environment = new LandscapeEnvironment(LANDSCAPE_DIMENSIONS, rng, factory);
      const ga = new GenerationalGA(gaConfig, rng);
      const runner = new Runner(environment, ga, gaConfig.populationSize);
      let best = 0;
      let solvedAt: number | null = null;
      for (let g = 0; g < landscapeGenerations; g++) {
        best = runner.advance().stats.best;
        if (solvedAt === null && best > LANDSCAPE_SOLVED_THRESHOLD) solvedAt = g + 1;
      }
      finals.push(best);
      if (solvedAt !== null) generationsToSolve.push(solvedAt);
    }
    rows.push(summarize("cross-representation", `landscape/${label}`, "final-fitness", finals));
    rows.push(summarize("cross-representation", `landscape/${label}`, "generations-to-0.9-fitness", generationsToSolve));
  }

  return rows;
}

const STUDIES: Record<string, (seeds: readonly number[], generations?: number) => StudyRow[]> = {
  "maze-deception": mazeDeceptionStudy,
  "coevolution-progress": coevolutionProgressStudy,
  "cross-representation": crossRepresentationStudy,
};

/** Serialises study rows to CSV. */
export function toStudyCsv(rows: readonly StudyRow[]): string {
  const header = "study,condition,metric,n,median,q1,q3";
  const body = rows.map((r) => `${r.study},${r.condition},${r.metric},${r.n},${r.median},${r.q1},${r.q3}`);
  return [header, ...body].join("\n");
}

/** Parses a seed spec: `0-4` (inclusive range) or `0,1,2` (explicit list). */
export function parseSeeds(spec: string): number[] {
  if (spec.includes("-")) {
    const [lo, hi] = spec.split("-").map((s) => Number.parseInt(s, 10));
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || (lo as number) > (hi as number)) {
      throw new Error(`invalid seed range "${spec}"`);
    }
    const seeds: number[] = [];
    for (let s = lo as number; s <= (hi as number); s++) seeds.push(s);
    return seeds;
  }
  return spec.split(",").map((s) => {
    const n = Number.parseInt(s, 10);
    if (!Number.isInteger(n)) throw new Error(`invalid seed "${s}"`);
    return n;
  });
}

/** Minimal `--flag value` parser; returns a map of flag → value. */
function parseArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token !== undefined && token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.set(key, next);
        i++;
      } else {
        args.set(key, "true");
      }
    }
  }
  return args;
}

const USAGE = `Project Darwin — headless experiment runner

Usage (per-generation sweep):
  npm run experiment -- --env <name|all> [--seeds 0-4] [--generations N] [--format csv|json]

Usage (named comparative study):
  npm run experiment -- --study <name> [--seeds 0-4] [--generations N] [--format csv|json]

Environments: ${Object.keys(EXPERIMENTS).join(", ")}, all
Studies: ${Object.keys(STUDIES).join(", ")}

Examples:
  npm run experiment -- --env weasel --seeds 0-2
  npm run experiment -- --env all --seeds 0-9 --format json
  npm run experiment -- --study maze-deception --seeds 0-19
  npm run experiment -- --study coevolution-progress --seeds 0-9
  npm run experiment -- --study cross-representation --seeds 0-19`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.has("help") || args.size === 0) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  const seeds = parseSeeds(args.get("seeds") ?? "0-4");
  const generations = args.has("generations") ? Number.parseInt(args.get("generations") as string, 10) : undefined;
  const format = args.get("format") ?? "csv";

  if (args.has("study")) {
    const name = args.get("study") as string;
    const study = STUDIES[name];
    if (study === undefined) {
      throw new Error(`unknown study "${name}" (available: ${Object.keys(STUDIES).join(", ")})`);
    }
    const rows = study(seeds, generations);
    const output = format === "json" ? JSON.stringify(rows, null, 2) : toStudyCsv(rows);
    process.stdout.write(output + "\n");
    return;
  }

  const envArg = args.get("env") ?? "all";
  const envs = envArg === "all" ? Object.keys(EXPERIMENTS) : envArg.split(",");
  const rows = runSweep(envs, seeds, generations);
  const output = format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
  process.stdout.write(output + "\n");
}

// Only run the CLI when executed directly (not when imported by a test).
if (process.argv[1]?.endsWith("runExperiment.ts")) {
  main();
}
