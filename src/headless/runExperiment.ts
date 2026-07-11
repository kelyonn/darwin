import { Rng } from "../core/rng.js";
import { GenerationalGA, type GaConfig } from "../core/ga.js";
import { Runner } from "../app/runner.js";
import type { Environment } from "../environments/Environment.js";
import type { SearchStrategy } from "../core/search.js";
import { WeaselEnvironment } from "../environments/weasel.js";
import { LandscapeEnvironment } from "../environments/landscape.js";
import { TspEnvironment } from "../environments/tsp.js";
import { CartPoleEnvironment } from "../environments/cartpole.js";
import { TrackRunnerEnvironment } from "../environments/trackrunner.js";
import { MazeEnvironment } from "../environments/maze.js";
import { XorEnvironment } from "../environments/xor.js";

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
 * environments are covered by the basic sweep; the two-population coevolution
 * and archive-growing MAP-Elites drivers are a future `--study` mode.
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

Usage:
  npm run experiment -- --env <name|all> [--seeds 0-4] [--generations N] [--format csv|json]

Environments: ${Object.keys(EXPERIMENTS).join(", ")}, all

Examples:
  npm run experiment -- --env weasel --seeds 0-2
  npm run experiment -- --env all --seeds 0-9 --format json`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.has("help") || args.size === 0) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  const envArg = args.get("env") ?? "all";
  const envs = envArg === "all" ? Object.keys(EXPERIMENTS) : envArg.split(",");
  const seeds = parseSeeds(args.get("seeds") ?? "0-4");
  const generations = args.has("generations") ? Number.parseInt(args.get("generations") as string, 10) : undefined;
  const format = args.get("format") ?? "csv";

  const rows = runSweep(envs, seeds, generations);
  const output = format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
  process.stdout.write(output + "\n");
}

// Only run the CLI when executed directly (not when imported by a test).
if (process.argv[1]?.endsWith("runExperiment.ts")) {
  main();
}
