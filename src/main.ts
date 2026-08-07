import { Rng } from "./core/rng.js";
import { GenerationalGA } from "./core/ga.js";
import { Network } from "./core/network.js";
import { Runner } from "./app/runner.js";
import { CoevolutionDriver, dominanceCount, type CoevolutionState } from "./search/coevolution.js";
import { CREAM } from "./render/palette.js";
import {
  type EnvironmentView,
  WeaselView,
  TspView,
  TrackRunnerView,
  type TrackRunnerCrashMarker,
  PredatorPreyView,
  MazeView,
  type MazeCrashMarker,
  type Role,
} from "./render/views.js";
import { WeaselEnvironment } from "./environments/weasel.js";
import { TspEnvironment } from "./environments/tsp.js";
import {
  TrackRunnerEnvironment,
  EPISODE_STEPS as TRACK_EPISODE_STEPS,
  type LiveTrackEpisode,
} from "./environments/trackrunner.js";
import {
  MazeEnvironment,
  EPISODE_STEPS as MAZE_EPISODE_STEPS,
  type LiveMazeEpisode,
} from "./environments/maze.js";
import {
  PredatorPreyEnvironment,
  type LivePredatorPreyEpisode,
} from "./environments/predatorPrey.js";
import {
  WEASEL_TARGET,
  WEASEL_PRESET,
  TSP_PRESET,
  TRACKRUNNER_PRESET,
  MAZE_PRESET,
  PREDATOR_PREY_PRESET,
} from "./app/presets.js";
import type { Genome } from "./core/genome.js";
import type { PopulationStats } from "./core/stats.js";
import { MAX_FITNESS_HISTORY, CRASH_MARKER_ROUNDS } from "./render/layout.js";

/**
 * Entry point (PRD §3): a specimen-plate environment selector driving one
 * representation-blind engine. Each tab wires a different Environment +
 * genome type through the same core, proving the decoupling on screen. Most
 * tabs use the single-population {@link GenerationalGA}; predator–prey uses
 * the two-population {@link CoevolutionDriver}. All satisfy the same
 * {@link Simulation} shape so the render loop is oblivious to which is
 * running.
 *
 * Five plates ship in this demo (Predator–Prey, Weasel, TSP, Track Runner,
 * Maze) — down from an earlier nine. Landscape, Cart-pole, Gait, and XOR were
 * cut from the *demo* only: their environments, presets, headless studies,
 * bench rows, and tests all remain (see `.docs/decisions.md`) — Landscape is
 * one of two legs of the cross-representation study (ADR-013), Gait is the
 * MAP-Elites proof, and XOR/Cart-pole back `runBench`'s allocation-vs-
 * evaluation comparison. Only their on-screen plates and the third
 * `Simulation` adapter kind (`MapElitesSimulation`, Gait's only user) were
 * removed from `main.ts`.
 */

/**
 * Mutable, not `const`: every plate's `build(stage)` reads `SEED` at call
 * time (a closure over this binding, not its value), so re-seeding just means
 * assigning here and calling `load(activeIndex)` again — no plate needs to
 * know re-seeding exists (§4.4, `.docs/remediation-plan.md`).
 */
let SEED = 42;
const DEFAULT_SEED = SEED;
const STAGE_WIDTH = 1180;
const STAGE_HEIGHT = 740;
/**
 * Rendered frames to hold the final state of a completed round before the
 * next generation's round begins (round-paced plates only). Early rounds can
 * end within ~20 ticks — most of a fresh, unevolved cohort crashing almost
 * immediately — so without a deliberate pause the outcome would flicker past
 * unreadably. Holding it briefly is what makes each generation's result
 * legible, especially the crash positions and the outcome counter.
 */
const ROUND_HOLD_FRAMES = 30;

/** The plate's top-right generation/metric readout. */
interface Readout {
  readonly generation: number;
  readonly metricLabel: string;
  readonly metricValue: string;
  readonly secondary?: { readonly label: string; readonly value: string };
  /** A third readout line, used by predator–prey for the dominance-tournament count. */
  readonly tertiary?: { readonly label: string; readonly value: string };
}

/**
 * How a plate's `advance()` is triggered, relative to the render loop.
 *
 * `"frames"` (most plates): a generation evolves every `evolveInterval`
 * rendered frames, independent of anything the live animation is doing —
 * fine for plates whose live episode is illustrative, not the point.
 *
 * `"round"` (Track Runner, Maze): a generation evolves once every cohort
 * member currently animating has ended (or the tick cap was reached) — see
 * `roundComplete()` on {@link Simulation}. This keeps the generation counter
 * and what's on screen in lock-step, which matters when the animation *is*
 * the evidence a population is learning (§B2, `.docs/remediation-plan.md`).
 */
type Pacing = { readonly kind: "frames"; readonly evolveInterval: number } | { readonly kind: "round" };

/**
 * One runnable environment, decoupled from how it evolves and how it's
 * watched. `advance` evolves a generation and refreshes `readout` (for
 * round-paced plates, it also starts the next round). `tick` advances the
 * live simulation by one step with no drawing; `draw` renders current state
 * with no stepping — split so the render loop can run several ticks per
 * redraw at higher speeds without repainting several times.
 */
interface Simulation {
  readonly pacing: Pacing;
  readonly readout: Readout;
  advance(): void;
  tick(): void;
  draw(): void;
  /** Round-paced plates only: true once the current round has ended. */
  roundComplete?(): boolean;
}

/**
 * Adapts a single-population {@link Runner} + {@link EnvironmentView} to
 * {@link Simulation}. Always frame-paced: the views it wires (Weasel, TSP)
 * have no live episode to step between generations, so `tick` is a no-op and
 * `draw` is where all the drawing already lived.
 */
class GaSimulation implements Simulation {
  readonly pacing: Pacing;
  readout: Readout = { generation: 0, metricLabel: "fitness", metricValue: "0" };

  constructor(
    evolveInterval: number,
    private readonly runner: Runner,
    private readonly view: EnvironmentView,
    private readonly metricLabel: string,
    private readonly formatMetric: (best: number) => string,
    /**
     * Optional second readout line computed from the champion genome itself
     * (not just its scalar fitness) — e.g. XOR's "cases solved n/4", which is a
     * clearer progress signal than a sigmoid-asymptoting fitness value.
     */
    private readonly secondaryMetric?: (champion: Genome) => { label: string; value: string },
  ) {
    this.pacing = { kind: "frames", evolveInterval };
  }

  advance(): void {
    const result = this.runner.advance();
    this.view.onGeneration(result);
    const secondary = this.secondaryMetric?.(result.best);
    this.readout = {
      generation: result.generation,
      metricLabel: this.metricLabel,
      metricValue: this.formatMetric(result.stats.best),
      ...(secondary !== undefined ? { secondary } : {}),
    };
  }

  tick(): void {
    // Nothing to step between generations — the wired views (Weasel, TSP)
    // draw directly from the last evolved generation's state.
  }

  draw(): void {
    this.view.animate();
  }
}

/**
 * Adapts the two-population {@link CoevolutionDriver} to {@link Simulation}: it
 * advances the arms race, extracts each generation's champions (from the
 * just-scored incoming state, per ADR-003), accumulates the CIAO matrix, and
 * animates the champion fox against the champion rabbit.
 */
class CoevolutionSimulation implements Simulation {
  readonly pacing: Pacing;
  readout: Readout = {
    generation: 0,
    metricLabel: "capture rate",
    metricValue: "0%",
    secondary: { label: "predator / prey", value: "0.00 / 0.00" },
  };
  private state: CoevolutionState;
  private championPredator: Network | null = null;
  private championPrey: Network | null = null;
  private episode: LivePredatorPreyEpisode | null = null;
  private readonly preyChampions: Network[] = [];
  private readonly ciao: number[][] = [];

  constructor(
    evolveInterval: number,
    private readonly environment: PredatorPreyEnvironment,
    private readonly driver: CoevolutionDriver,
    initialState: CoevolutionState,
    private readonly view: PredatorPreyView,
  ) {
    this.pacing = { kind: "frames", evolveInterval };
    this.state = initialState;
  }

  advance(): void {
    const { next, stats } = this.driver.step(this.state);

    // Champions are read from the incoming, now-scored generation (ADR-003),
    // never from the returned children.
    const championPredator = fittestNetwork(this.state.predators);
    const championPrey = fittestNetwork(this.state.prey);
    this.championPredator = championPredator;
    this.championPrey = championPrey;
    this.preyChampions.push(championPrey.clone());

    // CIAO row: this generation's champion predator versus every ancestral prey
    // champion. Rising scores down a column mean the predator lineage is truly
    // improving; flat bands mean it is only cycling.
    const ciaoRow = this.preyChampions.map((prey) => this.environment.compete(championPredator, prey).predatorScore);
    this.ciao.push(ciaoRow);

    // Dominance tournament: what fraction of ancestral prey champions this
    // predator would catch. Because coevolutionary fitness is relative and
    // unreadable across generations (RESEARCH.md §4.5), this is one of the few
    // absolute progress signals available — but the *raw count* is not it: it
    // rises mechanically every generation just because the archive it's
    // measured against keeps growing, even while the arms race is purely
    // cycling. Measured (ADR-012, coevolution-progress study): the raw count
    // climbed from 19 to 67 across 200 generations on one seed while the
    // *fraction* fell from 76% to 34% over the same run. The fraction is the
    // number that can actually report bad news; lead with it.
    const dominated = dominanceCount(ciaoRow);
    const dominanceFraction = ciaoRow.length > 0 ? dominated / ciaoRow.length : 0;

    this.episode = this.environment.createEpisode(championPredator, championPrey);
    this.state = next;

    this.readout = {
      generation: stats.generation,
      metricLabel: "capture rate",
      metricValue: `${Math.round(stats.captureRate * 100)}%`,
      secondary: {
        label: "predator / prey",
        value: `${stats.bestPredatorFitness.toFixed(2)} / ${stats.bestPreyFitness.toFixed(2)}`,
      },
      tertiary: {
        label: "dominates",
        value: `${Math.round(dominanceFraction * 100)}% (${dominated}/${this.preyChampions.length} ancestors)`,
      },
    };
  }

  tick(): void {
    if (this.championPredator === null || this.championPrey === null) return;
    if (this.episode === null || !this.episode.step()) {
      this.episode = this.environment.createEpisode(this.championPredator, this.championPrey);
      this.episode.step();
    }
  }

  draw(): void {
    if (this.episode === null) {
      this.view.drawIdle();
      return;
    }
    this.view.draw(this.episode.snapshot, this.ciao);
  }
}

/**
 * Track Runner and Maze each animate all three {@link Role}s from the
 * current generation simultaneously, not just the champion — a lone champion
 * is already good within a few generations, so watching it alone shows *one*
 * lineage improving but not the population's actual spread narrowing.
 * Champion, median, and worst together make that spread visible: early on
 * all three struggle close together; later the champion pulls ahead while
 * median and worst still fail; eventually even the weak end of the
 * distribution starts succeeding (ADR-018, `.docs/decisions.md`).
 */
const ROLES: readonly Role[] = ["champion", "median", "worst"];

/** Picks the fittest, a middle-ranked, and the least-fit member of a scored population — the three {@link Role}s. */
function pickRoles<T>(population: readonly T[], scoreOf: (item: T) => number): ReadonlyMap<Role, T> {
  const ranked = [...population].sort((a, b) => scoreOf(b) - scoreOf(a));
  const champion = ranked[0];
  const worst = ranked[ranked.length - 1];
  const median = ranked[Math.floor((ranked.length - 1) / 2)];
  if (champion === undefined || worst === undefined || median === undefined) {
    throw new Error("cannot pick roles from an empty population");
  }
  return new Map<Role, T>([
    ["champion", champion],
    ["median", median],
    ["worst", worst],
  ]);
}

/** One role's live state within the current round. */
interface MazeRoleState {
  readonly role: Role;
  readonly episode: LiveMazeEpisode;
  readonly trail: { x: number; y: number }[];
  ticks: number;
  outcome: "running" | "crashed" | "solved" | "timedOut";
}

/**
 * Runs the deceptive maze (PRD §10 Tier 2 #7) under an ordinary
 * {@link GenerationalGA}, which has to learn to avoid the two dead-end
 * pockets. Round-paced: a generation's three roles (see {@link Role}) run to
 * completion — crash, solve, or the tick cap — before the next generation
 * starts, so the generation counter and what's on screen always describe the
 * exact same attempt (the fix that motivated round-pacing to begin with; see
 * the class doc history in `.docs/decisions.md`, ADR-015). Crash positions
 * from recent generations persist as fading markers, so "what it got wrong
 * last time" stays visible while watching the route improve; a "vs.
 * generation 1" multiplier makes the improvement a plain number, not
 * something you have to eyeball off the sparkline (ADR-018).
 *
 * `NoveltySearch` also runs on this maze — it's a genuine second selection
 * paradigm proving `SearchStrategy` is swappable with zero engine changes —
 * but is no longer part of the on-screen demo. It remains fully exercised by
 * `test/novelty.test.ts` and `--study maze-deception`.
 */
class MazeSimulation implements Simulation {
  readonly pacing: Pacing = { kind: "round" };
  readout: Readout = {
    generation: 0,
    metricLabel: "objective fitness",
    metricValue: "0.000",
    secondary: { label: "status", value: "—" },
  };
  private roles: MazeRoleState[] = [];
  private crashMarkers: MazeCrashMarker[] = [];
  private readonly history: PopulationStats[] = [];
  private baselineFitness: number | null = null;

  constructor(
    private readonly env: MazeEnvironment,
    private readonly runner: Runner,
    private readonly view: MazeView,
  ) {}

  advance(): void {
    const result = this.runner.advance();
    if (this.baselineFitness === null) this.baselineFitness = result.stats.best;

    this.crashMarkers = this.crashMarkers
      .map((marker) => ({ ...marker, roundsAgo: marker.roundsAgo + 1 }))
      .filter((marker) => marker.roundsAgo <= CRASH_MARKER_ROUNDS);

    const picked = pickRoles(result.evaluated, (g) => g.fitness);
    this.roles = ROLES.map((role) => ({
      role,
      episode: this.env.createEpisode(picked.get(role) as Network),
      trail: [],
      ticks: 0,
      outcome: "running" as const,
    }));

    this.history.push(result.stats);
    if (this.history.length > MAX_FITNESS_HISTORY) this.history.shift();

    this.readout = {
      generation: result.generation,
      metricLabel: "objective fitness",
      metricValue: result.stats.best.toFixed(3),
      secondary: { label: "status", value: this.statusText() },
      tertiary: { label: "vs. generation 1", value: improvementText(this.baselineFitness, result.stats.best) },
    };
  }

  tick(): void {
    for (const r of this.roles) {
      if (r.outcome !== "running") continue;
      const alive = r.episode.step();
      r.ticks++;
      const snap = r.episode.snapshot;
      r.trail.push({ x: snap.x, y: snap.y });
      if (snap.solved) {
        r.outcome = "solved";
      } else if (!alive) {
        r.outcome = "crashed";
        this.crashMarkers.push({ x: snap.x, y: snap.y, roundsAgo: 0 });
      } else if (r.ticks >= MAZE_EPISODE_STEPS) {
        r.outcome = "timedOut";
      }
    }
    // Updated every tick, not just at round end — see the analogous comment
    // on TrackRunnerSimulation.tick().
    this.readout = { ...this.readout, secondary: { label: "status", value: this.statusText() } };
  }

  draw(): void {
    if (this.roles.length === 0) {
      this.view.drawIdle();
      return;
    }
    this.view.draw({
      members: this.roles.map((r) => ({
        role: r.role,
        x: r.episode.snapshot.x,
        y: r.episode.snapshot.y,
        heading: r.episode.snapshot.heading,
        trail: r.trail,
      })),
      crashMarkers: this.crashMarkers,
      status: this.statusText(),
      history: this.history,
    });
  }

  roundComplete(): boolean {
    return this.roles.every((r) => r.outcome !== "running");
  }

  private statusText(): string {
    const champion = this.roles.find((r) => r.role === "champion");
    if (champion === undefined) return "—";
    if (champion.outcome === "solved") return "champion reached goal";
    if (champion.outcome === "crashed") return "champion crashed";
    if (champion.outcome === "timedOut") return "champion timed out";
    return "champion exploring";
  }
}

/** "1.0×" once a baseline exists, guarding the (near-impossible but not-provably-impossible) zero-baseline case. */
function improvementText(baseline: number | null, current: number): string {
  if (baseline === null || baseline <= 0) return "—";
  return `${(current / baseline).toFixed(1)}×`;
}

/** One role's live state within the current round. */
interface TrackRoleState {
  readonly role: Role;
  readonly episode: LiveTrackEpisode;
  readonly trail: { x: number; y: number }[];
  ticks: number;
  outcome: "running" | "crashed" | "finished";
}

/**
 * Adapts {@link TrackRunnerEnvironment} to {@link Simulation}, round-paced: a
 * generation's three roles (see {@link Role}) each run to completion — crash
 * or survive to `EPISODE_STEPS`, the same budget `evaluate` scores against —
 * before the next generation starts, so what's on screen always corresponds
 * exactly to one real generation, never a stale mid-flight snapshot from
 * generations ago (measured, before this fix: the live episode was rebuilt
 * every `evolveInterval` frames regardless of outcome, showing at most ~10
 * ticks — a few percent of a lap — per attempt, forever). Crash positions
 * from recent generations persist as fading markers, so "what it got wrong
 * last time" stays visible while watching the population improve; a "vs.
 * generation 1" multiplier makes the improvement a plain number, not
 * something you have to eyeball off the sparkline (ADR-018,
 * `.docs/decisions.md`).
 */
class TrackRunnerSimulation implements Simulation {
  readonly pacing: Pacing = { kind: "round" };
  readout: Readout = {
    generation: 0,
    metricLabel: "fitness",
    metricValue: "0.00",
    secondary: { label: "status", value: "—" },
  };
  private roles: TrackRoleState[] = [];
  private crashMarkers: TrackRunnerCrashMarker[] = [];
  private readonly history: PopulationStats[] = [];
  private baselineFitness: number | null = null;

  constructor(
    private readonly runner: Runner,
    private readonly environment: TrackRunnerEnvironment,
    private readonly view: TrackRunnerView,
  ) {}

  advance(): void {
    const result = this.runner.advance();
    if (this.baselineFitness === null) this.baselineFitness = result.stats.best;

    this.crashMarkers = this.crashMarkers
      .map((marker) => ({ ...marker, roundsAgo: marker.roundsAgo + 1 }))
      .filter((marker) => marker.roundsAgo <= CRASH_MARKER_ROUNDS);

    const picked = pickRoles(result.evaluated, (g) => g.fitness);
    this.roles = ROLES.map((role) => ({
      role,
      episode: this.environment.createEpisode(picked.get(role) as Network),
      trail: [],
      ticks: 0,
      outcome: "running" as const,
    }));

    this.history.push(result.stats);
    if (this.history.length > MAX_FITNESS_HISTORY) this.history.shift();

    this.readout = {
      generation: result.generation,
      metricLabel: "fitness",
      metricValue: result.stats.best.toFixed(2),
      secondary: { label: "status", value: this.statusText() },
      tertiary: { label: "vs. generation 1", value: improvementText(this.baselineFitness, result.stats.best) },
    };
  }

  tick(): void {
    for (const r of this.roles) {
      if (r.outcome !== "running") continue;
      const alive = r.episode.step();
      r.ticks++;
      const snap = r.episode.snapshot;
      r.trail.push({ x: snap.x, y: snap.y });
      if (!alive) {
        r.outcome = "crashed";
        this.crashMarkers.push({ x: snap.x, y: snap.y, roundsAgo: 0 });
      } else if (r.ticks >= TRACK_EPISODE_STEPS) {
        r.outcome = "finished";
      }
    }
    // Updated every tick, not just at round end, so "completed a lap" is
    // visible the instant it happens mid-round, not only once per generation.
    this.readout = { ...this.readout, secondary: { label: "status", value: this.statusText() } };
  }

  draw(): void {
    if (this.roles.length === 0) {
      this.view.drawIdle();
      return;
    }
    this.view.draw({
      members: this.roles.map((r) => ({
        role: r.role,
        x: r.episode.snapshot.x,
        y: r.episode.snapshot.y,
        heading: r.episode.snapshot.heading,
        trail: r.trail,
      })),
      crashMarkers: this.crashMarkers,
      status: this.statusText(),
      history: this.history,
    });
  }

  /**
   * True once every role has ended — vacuously true on a fresh load (no
   * roles yet), which matters: the render loop treats `roundComplete()` as
   * the signal to call `advance()`, so a fresh plate needs this to be true
   * immediately to ever kick off its first round.
   */
  roundComplete(): boolean {
    return this.roles.every((r) => r.outcome !== "running");
  }

  private statusText(): string {
    const champion = this.roles.find((r) => r.role === "champion");
    if (champion === undefined) return "—";
    if (champion.episode.snapshot.laps >= 1) return "champion completed a lap";
    if (champion.outcome === "crashed") return "champion crashed";
    return "champion driving";
  }
}

/** The fittest genome of a scored generation, as a {@link Network}. */
function fittest(population: readonly Genome[]): Genome {
  let best = population[0];
  if (best === undefined) throw new Error("cannot take a champion of an empty population");
  for (const genome of population) {
    if (genome.fitness > best.fitness) best = genome;
  }
  return best;
}

/** The fittest genome of a scored generation, as a {@link Network}. */
function fittestNetwork(population: readonly Genome[]): Network {
  const best = fittest(population);
  if (!(best instanceof Network)) throw new TypeError("expected a Network champion");
  return best;
}

interface EnvironmentOption {
  readonly numeral: string;
  readonly label: string;
  readonly plateLabel: string;
  readonly summary: string;
  readonly footnote: string;
  build(stage: CanvasRenderingContext2D): Simulation;
}

const OPTIONS: readonly EnvironmentOption[] = [
  {
    numeral: "I",
    label: "Predator–Prey",
    plateLabel: "Plate I — Predator / Prey",
    summary: "Two populations, one arms race",
    footnote:
      "Co-evolution: foxes evolve to catch, rabbits to escape. Fitness is relative and non-stationary — the CIAO plate (inset) reads a champion predator against every ancestral prey champion; a smooth gradient means real progress, banding means the race is only cycling.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new PredatorPreyEnvironment(PREDATOR_PREY_PRESET.hiddenSize, rng);
      const populationSize = PREDATOR_PREY_PRESET.populationSize;
      const driver = new CoevolutionDriver(env.compete, PREDATOR_PREY_PRESET.coevolution, rng);
      const state: CoevolutionState = { predators: env.newPredators(populationSize), prey: env.newPrey(populationSize) };
      return new CoevolutionSimulation(
        PREDATOR_PREY_PRESET.evolveInterval,
        env,
        driver,
        state,
        new PredatorPreyView(stage, STAGE_WIDTH, STAGE_HEIGHT),
      );
    },
  },
  {
    numeral: "II",
    label: "Weasel",
    plateLabel: "Plate II — Weasel",
    summary: "String genome, no network at all",
    footnote:
      "The engine's sanity anchor: a random string evolves letter by letter toward a fixed target under nothing but selection and mutation — proof that a generic genome plugs into the one unchanged core.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new WeaselEnvironment(WEASEL_TARGET, rng);
      const ga = new GenerationalGA(WEASEL_PRESET.ga, rng);
      const view = new WeaselView(stage, STAGE_WIDTH, STAGE_HEIGHT, WEASEL_TARGET);
      return new GaSimulation(
        WEASEL_PRESET.evolveInterval,
        new Runner(env, ga, WEASEL_PRESET.populationSize),
        view,
        "fitness",
        (best) => `${best.toFixed(0)} / ${env.maxFitness}`,
      );
    },
  },
  {
    numeral: "III",
    label: "TSP",
    plateLabel: "Plate III — Travelling Salesman",
    summary: "Permutation genome, order crossover",
    footnote:
      "A route must stay a valid permutation through every crossover — order crossover (OX) guarantees it. The same core that evolved a string now evolves a tour.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new TspEnvironment(TSP_PRESET.nodeCount, rng);
      const ga = new GenerationalGA(TSP_PRESET.ga, rng);
      const view = new TspView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new GaSimulation(
        TSP_PRESET.evolveInterval,
        new Runner(env, ga, TSP_PRESET.populationSize),
        view,
        "route distance",
        (best) => (1 / best - 1).toFixed(3),
      );
    },
  },
  {
    numeral: "IV",
    label: "Track Runner",
    plateLabel: "Plate IV — Track Runner",
    summary: "Five rangefinders, a closed loop",
    footnote:
      "Progress-led shaping: checkpoints dominate raw distance so the car is driven to make real laps rather than idle or wall-hug — an episodic network, consulted every tick, steering by five rangefinders alone. Watches three cars from the current generation each drive one attempt to completion — the champion (moss), a middle-of-the-pack car (amber), and the current worst (rust) — so the whole population's spread is visible, not just one already-good lineage. Each crash stays marked on the track, fading over a few generations, and the \"vs. generation 1\" figure turns the improvement into a plain number.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new TrackRunnerEnvironment(TRACKRUNNER_PRESET.hiddenSize, rng);
      const ga = new GenerationalGA(TRACKRUNNER_PRESET.ga, rng);
      const view = new TrackRunnerView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new TrackRunnerSimulation(new Runner(env, ga, TRACKRUNNER_PRESET.populationSize), env, view);
    },
  },
  {
    numeral: "V",
    label: "Maze",
    plateLabel: "Plate V — Maze",
    summary: "One corridor, one population learning it",
    footnote:
      "A deceptive maze: partway along the true path, a fork looks like it's getting closer to the goal but is actually a dead end. Watches three agents from the current generation each run the maze once — the champion (moss), a middle-of-the-pack agent (amber), and the current worst (rust) — so the whole population's spread is visible, not just one already-good lineage. Each crash stays marked in the maze, fading over a few generations, and the \"vs. generation 1\" figure turns the improvement into a plain number. `NoveltySearch` — a second selection pressure that ignores the goal entirely and still solves this maze — also runs on the identical environment (`npm run experiment -- --study maze-deception`) but is not part of the on-screen demo.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new MazeEnvironment(MAZE_PRESET.hiddenSize, rng);
      const ga = new GenerationalGA(MAZE_PRESET.ga, rng);
      const view = new MazeView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new MazeSimulation(env, new Runner(env, ga, MAZE_PRESET.populationSize), view);
    },
  },
];

/** The environment shown on load — the arms race is the project's landing view (PRD §10, §14). */
const DEFAULT_INDEX = 0;

/**
 * The fixed half of the info card (`#infoBtn`) — same on every plate. The
 * other half is each plate's own `footnote`, already written as a "how to
 * read this" explanation; reusing it here avoids maintaining the same
 * per-plate content in two places that could quietly drift apart.
 */
const NEUROEVOLUTION_PRIMER =
  "Project Darwin evolves solutions instead of programming them. Every candidate answer here — a genome — starts as random noise: a string of letters, a list of numbers, an ordering of cities, or the weights inside a small neural network. A population of hundreds of these genomes is scored by a fitness function specific to whatever's being solved (how far did the car get before crashing? how close to the goal?). The fittest genomes are the most likely to breed: two parents' genomes get mixed together (crossover), small random changes get introduced (mutation), and the result becomes the next generation. Repeat that cycle — score, select, breed — enough times, and the population's solutions measurably improve, with no hand-written rules about the task itself. That loop is the entire engine, and the code that runs it is identical no matter which plate below you're watching. Only the genome type and the fitness function change per environment; the evolutionary logic never does. That's what \"representation-blind\" means, and it's the thesis this whole project sets out to prove.";

function main(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app === null) throw new Error("missing #app mount point");

  app.innerHTML = `
    <div class="scale-root" id="scaleRoot">
      <div class="page">
        <div class="header-row">
          <div>
            <div class="lab title">
              Project Darwin
              <button class="info-btn" id="infoBtn" type="button" aria-label="About this demo">i</button>
            </div>
            <div class="lab subtitle">A Representation-Blind Evolutionary Engine</div>
          </div>
          <div class="tabs" id="tabs"></div>
        </div>
        <div class="controls-row" id="controls">
          <div class="control-group">
            <label class="lab control-label" for="seedInput">seed</label>
            <input class="control-input" id="seedInput" type="number" value="${DEFAULT_SEED}" step="1" />
            <button class="control-btn" id="seedApplyBtn" type="button">apply</button>
          </div>
          <div class="control-group">
            <button class="control-btn" id="pauseBtn" type="button">pause</button>
            <button class="control-btn" id="stepBtn" type="button" disabled>step</button>
            <button class="control-btn" id="resetBtn" type="button">reset</button>
          </div>
          <div class="control-group">
            <label class="lab control-label" for="speedSelect">speed</label>
            <select class="control-input" id="speedSelect">
              <option value="0.25">0.25×</option>
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="8">8×</option>
            </select>
          </div>
        </div>
        <div class="plate-frame">
          <div class="plate">
            <canvas id="stage" width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}"></canvas>
            <div class="plate-label">
              <div class="lab" id="plateLabel"></div>
              <div class="plate-summary" id="plateSummary"></div>
            </div>
            <div class="plate-readout" id="readout"></div>
          </div>
        </div>
        <p class="footnote" id="footnote"></p>
      </div>
    </div>
    <div class="info-overlay" id="infoOverlay" hidden>
      <div class="info-card" role="dialog" aria-modal="true" aria-labelledby="infoPrimerTitle">
        <button class="info-close" id="infoCloseBtn" type="button" aria-label="Close">×</button>
        <h2 id="infoPrimerTitle">What is a neuroevolution engine?</h2>
        <p>${NEUROEVOLUTION_PRIMER}</p>
        <hr class="info-divider" />
        <h2 id="infoPlateTitle"></h2>
        <p id="infoPlateBody"></p>
      </div>
    </div>
  `;

  const scaleRoot = must<HTMLDivElement>(app, "#scaleRoot");
  const tabs = must<HTMLDivElement>(app, "#tabs");
  const stageCanvas = must<HTMLCanvasElement>(app, "#stage");
  const plateLabel = must<HTMLDivElement>(app, "#plateLabel");
  const plateSummary = must<HTMLDivElement>(app, "#plateSummary");
  const readoutEl = must<HTMLDivElement>(app, "#readout");
  const footnote = must<HTMLParagraphElement>(app, "#footnote");
  const seedInput = must<HTMLInputElement>(app, "#seedInput");
  const seedApplyBtn = must<HTMLButtonElement>(app, "#seedApplyBtn");
  const pauseBtn = must<HTMLButtonElement>(app, "#pauseBtn");
  const stepBtn = must<HTMLButtonElement>(app, "#stepBtn");
  const resetBtn = must<HTMLButtonElement>(app, "#resetBtn");
  const speedSelect = must<HTMLSelectElement>(app, "#speedSelect");
  const infoBtn = must<HTMLButtonElement>(app, "#infoBtn");
  const infoOverlay = must<HTMLDivElement>(app, "#infoOverlay");
  const infoCloseBtn = must<HTMLButtonElement>(app, "#infoCloseBtn");
  const infoPlateTitle = must<HTMLHeadingElement>(app, "#infoPlateTitle");
  const infoPlateBody = must<HTMLParagraphElement>(app, "#infoPlateBody");
  const stage = context2d(stageCanvas);

  let activeIndex = DEFAULT_INDEX;
  let active: Simulation;
  let frame = 0;
  let paused = false;
  let speedMultiplier = 1;
  /** Fractional sim-ticks-per-frame accumulator for round-paced plates, so 0.25×–8× all work through one path without an integer-only frame-skip scheme. */
  let tickBudget = 0;
  /** Rendered frames remaining to hold a just-completed round's final state (see {@link ROUND_HOLD_FRAMES}). */
  let holdFrames = 0;

  const renderTabs = (): void => {
    tabs.innerHTML = "";
    OPTIONS.forEach((option, index) => {
      const el = document.createElement("div");
      el.className = "tab" + (index === activeIndex ? " tab-active" : "");
      if (index > 0) el.classList.add("tab-bordered");
      el.innerHTML = `<span class="tab-numeral">${option.numeral}</span>${option.label}`;
      el.addEventListener("click", () => load(index));
      tabs.append(el);
    });
  };

  const renderReadout = (): void => {
    const { generation, metricLabel, metricValue, secondary, tertiary } = active.readout;
    const line = (label: string, value: string): string => `<div style="margin-top:4px;">${label} ${value}</div>`;
    // `tertiary` is reserved for the plate's single most important extra
    // stat (predator–prey's dominance fraction, Track Runner/Maze's "vs.
    // generation 1" multiplier) — rendered bold and moss-coloured so it
    // reads as a headline result, not another line of plain metadata.
    const highlightLine = (label: string, value: string): string =>
      `<div class="readout-highlight" style="margin-top:6px;">${value} <span style="font-weight:400;font-size:11px;color:rgba(28,27,23,0.6);">${label}</span></div>`;
    readoutEl.innerHTML =
      `<div>generation ${generation}</div>` +
      line(metricLabel, metricValue) +
      (secondary !== undefined ? line(secondary.label, secondary.value) : "") +
      (tertiary !== undefined ? highlightLine(tertiary.label, tertiary.value) : "");
  };

  const load = (index: number): void => {
    activeIndex = index;
    const option = OPTIONS[index];
    if (option === undefined) throw new Error(`unknown environment index ${index}`);
    active = option.build(stage);
    frame = 0;
    tickBudget = 0;
    holdFrames = 0;
    stage.fillStyle = CREAM;
    stage.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    plateLabel.textContent = option.plateLabel;
    plateSummary.textContent = option.summary;
    footnote.textContent = option.footnote;
    infoPlateTitle.textContent = option.plateLabel;
    infoPlateBody.textContent = option.footnote;
    renderTabs();
    renderReadout();
    // Draw one frame immediately regardless of `paused` — otherwise a fresh
    // load (from a re-seed or reset) while paused would leave the canvas
    // showing only the cleared background until the next step or unpause.
    active.draw();
  };

  const renderPauseState = (): void => {
    pauseBtn.textContent = paused ? "play" : "pause";
    pauseBtn.classList.toggle("control-btn-active", paused);
    stepBtn.disabled = !paused;
  };

  const applySeed = (): void => {
    const parsed = Number(seedInput.value);
    if (!Number.isFinite(parsed)) {
      seedInput.value = String(SEED); // reject and restore rather than silently reseed with NaN/garbage
      return;
    }
    SEED = Math.trunc(parsed);
    load(activeIndex);
  };

  seedApplyBtn.addEventListener("click", applySeed);
  seedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applySeed();
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    renderPauseState();
  });

  stepBtn.addEventListener("click", () => {
    if (!paused) return;
    if (active.pacing.kind === "round") {
      // "Step" means one generation for every plate, not one tick — for a
      // round-paced plate that means: evolve/spawn a round if the previous
      // one already finished (or none has run yet — a fresh load's cohort is
      // empty, so `roundComplete()` is vacuously true), then run that round
      // to completion (bounded: every round-paced plate guarantees
      // `roundComplete()` eventually turns true, either every cohort member
      // ending or its own tick cap). Evolving *before* ticking, not after, is
      // what leaves the just-run round's actual finish — crash positions,
      // the outcome tally — on screen for this click, instead of already
      // being replaced by the next round's untouched starting state.
      if (active.roundComplete?.() === true) active.advance();
      while (active.roundComplete?.() !== true) active.tick();
      tickBudget = 0;
      holdFrames = 0;
    } else {
      active.advance();
    }
    active.draw();
    renderReadout();
  });

  resetBtn.addEventListener("click", () => load(activeIndex));

  const openInfo = (): void => {
    infoOverlay.hidden = false;
  };
  const closeInfo = (): void => {
    infoOverlay.hidden = true;
  };
  infoBtn.addEventListener("click", openInfo);
  infoCloseBtn.addEventListener("click", closeInfo);
  // Backdrop click closes; a click on the card itself must not bubble here
  // (the card sits inside the overlay, and a plain listener on the overlay
  // would otherwise close it the instant anyone clicks the text inside).
  infoOverlay.addEventListener("click", (event) => {
    if (event.target === infoOverlay) closeInfo();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !infoOverlay.hidden) closeInfo();
  });

  speedSelect.addEventListener("change", () => {
    const parsed = Number(speedSelect.value);
    speedMultiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    frame = 0; // avoid a stale modulo phase producing an odd double-advance right after a speed change
    tickBudget = 0; // avoid a stale fractional accumulator carrying over at the new speed
  });

  renderPauseState();

  load(DEFAULT_INDEX);

  fitToViewport(scaleRoot);
  window.addEventListener("resize", () => fitToViewport(scaleRoot));

  const loop = (): void => {
    if (!paused) {
      if (holdFrames > 0) {
        // Freeze on a just-completed round's final state — see ROUND_HOLD_FRAMES.
        holdFrames--;
      } else if (active.pacing.kind === "round") {
        // A completed round is only evolved away right here, at the top of
        // the frame ticking resumes for it — never the instant it finishes.
        // (`roundComplete()` is also vacuously true on a fresh load's empty
        // cohort, so this doubles as the kickoff for the very first round.)
        // Evolving eagerly, the moment `roundComplete()` first turns true,
        // would replace the finished cohort with a freshly spawned one
        // *before* `holdFrames` ever gets to hold on it — so every hold, and
        // every one of that round's own final numbers (crash positions, the
        // outcome tally), would be the *next* round's untouched start state,
        // never the one that just actually ran.
        if (active.roundComplete?.() === true) active.advance();

        // `speedMultiplier` scales simulation ticks per rendered frame — at
        // 0.25× a 500-tick round takes ~33s (deliberately slow enough to
        // study); at 8× it runs in a couple of seconds. The fractional
        // accumulator means every speed, including <1×, works through the
        // same path rather than a separate integer frame-skip scheme.
        tickBudget += speedMultiplier;
        while (tickBudget >= 1) {
          tickBudget -= 1;
          active.tick();
          if (active.roundComplete?.() === true) {
            holdFrames = ROUND_HOLD_FRAMES;
            tickBudget = 0;
            break;
          }
        }
        // Round-paced plates update `readout` on every tick (e.g. Track
        // Runner's "completed a lap" counter climbing mid-round, not just at
        // round end) — refresh the DOM every frame so that's actually visible,
        // not just on the generation boundary.
        renderReadout();
      } else {
        frame++;
        // `speedMultiplier` scales how often a generation evolves relative to
        // each plate's own tuned `evolveInterval` — shrinking the effective
        // interval speeds evolution up, growing it slows evolution down,
        // without any plate needing to know a speed control exists.
        const effectiveInterval = Math.max(1, Math.round(active.pacing.evolveInterval / speedMultiplier));
        if (frame % effectiveInterval === 0) {
          active.advance();
          renderReadout();
        }
        active.tick();
      }
      active.draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/**
 * Scales and centres the fixed 1180px-wide layout to fit whatever viewport is
 * available, so the page never needs to scroll (`html`/`body`/`#app` clip
 * overflow in `index.html`; this is what makes the fit exact rather than a
 * clip). Re-run on every resize.
 */
function fitToViewport(root: HTMLElement): void {
  root.style.transform = "none";
  const { width, height } = root.getBoundingClientRect();
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
  const left = (window.innerWidth - width * scale) / 2;
  const top = (window.innerHeight - height * scale) / 2;
  root.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`missing element ${selector}`);
  return el;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");
  return ctx;
}

main();
