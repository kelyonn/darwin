import { Rng } from "./core/rng.js";
import { GenerationalGA } from "./core/ga.js";
import { Network } from "./core/network.js";
import { Runner } from "./app/runner.js";
import { CoevolutionDriver, type CoevolutionState } from "./search/coevolution.js";
import { drawFitnessChart, drawCaptureRateChart, COLORS } from "./render/chart.js";
import {
  type EnvironmentView,
  WeaselView,
  LandscapeView,
  TspView,
  CartPoleView,
  PredatorPreyView,
} from "./render/views.js";
import { WeaselEnvironment } from "./environments/weasel.js";
import { LandscapeEnvironment } from "./environments/landscape.js";
import { TspEnvironment } from "./environments/tsp.js";
import { CartPoleEnvironment } from "./environments/cartpole.js";
import {
  PredatorPreyEnvironment,
  type LivePredatorPreyEpisode,
} from "./environments/predatorPrey.js";
import type { Genome } from "./core/genome.js";

/**
 * Entry point (PRD §3): an environment selector driving one representation-blind
 * engine. Each option wires a different Environment + genome type through the
 * same core, proving the decoupling on screen. Most options use the
 * single-population {@link GenerationalGA}; predator–prey uses the two-population
 * {@link CoevolutionDriver}. Both satisfy the same {@link Simulation} shape so the
 * render loop is oblivious to which is running.
 */

const SEED = 42;
const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 360;
const CHART_HEIGHT = 90;

/**
 * One runnable environment, decoupled from how it evolves. `advance` evolves a
 * generation and refreshes the generation-scale visuals (chart, readout);
 * `frame` draws per-frame animation. `meta` is the live status line.
 */
interface Simulation {
  /** Frames between evolved generations (episodic envs evolve less often). */
  readonly evolveInterval: number;
  readonly meta: string;
  advance(): void;
  frame(): void;
}

/** Adapts a single-population {@link Runner} + {@link EnvironmentView} to {@link Simulation}. */
class GaSimulation implements Simulation {
  meta: string;

  constructor(
    readonly evolveInterval: number,
    private readonly runner: Runner,
    private readonly view: EnvironmentView,
    private readonly chart: CanvasRenderingContext2D,
    private readonly summary: string,
  ) {
    this.meta = `starting ${summary}…`;
  }

  advance(): void {
    const result = this.runner.advance();
    this.view.onGeneration(result);
    drawFitnessChart(this.chart, this.runner.history, STAGE_WIDTH, CHART_HEIGHT);
    this.meta =
      `generation ${result.generation}   best ${result.stats.best.toFixed(2)}   ` +
      `avg ${result.stats.average.toFixed(2)}   diversity ${result.stats.spread.toFixed(2)}\n` +
      this.summary;
  }

  frame(): void {
    this.view.animate?.();
  }
}

/**
 * Adapts the two-population {@link CoevolutionDriver} to {@link Simulation}: it
 * advances the arms race, extracts each generation's champions (from the
 * just-scored incoming state, per ADR-003), accumulates the CIAO matrix and the
 * capture-rate history, and animates the champion fox against the champion rabbit.
 */
class CoevolutionSimulation implements Simulation {
  meta: string;
  private state: CoevolutionState;
  private championPredator: Network | null = null;
  private championPrey: Network | null = null;
  private episode: LivePredatorPreyEpisode | null = null;
  private readonly preyChampions: Network[] = [];
  private readonly ciao: number[][] = [];
  private readonly captureHistory: number[] = [];

  constructor(
    readonly evolveInterval: number,
    private readonly environment: PredatorPreyEnvironment,
    private readonly driver: CoevolutionDriver,
    initialState: CoevolutionState,
    private readonly view: PredatorPreyView,
    private readonly chart: CanvasRenderingContext2D,
    private readonly summary: string,
  ) {
    this.state = initialState;
    this.meta = `starting ${summary}…`;
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
    this.ciao.push(this.preyChampions.map((prey) => this.environment.compete(championPredator, prey).predatorScore));
    this.captureHistory.push(stats.captureRate);

    this.episode = this.environment.createEpisode(championPredator, championPrey);
    this.state = next;

    drawCaptureRateChart(this.chart, this.captureHistory, STAGE_WIDTH, CHART_HEIGHT);
    this.meta =
      `generation ${stats.generation}   capture-rate ${(stats.captureRate * 100).toFixed(0)}%   ` +
      `best fox ${stats.bestPredatorFitness.toFixed(2)}   best rabbit ${stats.bestPreyFitness.toFixed(2)}\n` +
      this.summary;
  }

  frame(): void {
    if (this.championPredator === null || this.championPrey === null) {
      this.view.drawIdle();
      return;
    }
    if (this.episode === null || !this.episode.step()) {
      this.episode = this.environment.createEpisode(this.championPredator, this.championPrey);
      this.episode.step();
    }
    this.view.draw(this.episode.snapshot, this.ciao);
  }
}

interface EnvironmentOption {
  readonly label: string;
  build(stage: CanvasRenderingContext2D, chart: CanvasRenderingContext2D): Simulation;
}

const OPTIONS: Record<string, EnvironmentOption> = {
  predatorPrey: {
    label: "Predator–prey — co-evolution (arms race)",
    build(stage, chart) {
      const rng = new Rng(SEED);
      const env = new PredatorPreyEnvironment(8, rng);
      const populationSize = 40;
      const driver = new CoevolutionDriver(
        env.compete,
        {
          populationSize,
          eliteCount: 2,
          tournamentSize: 4,
          mutationRate: 0.2,
          opponentSampleSize: 4,
          hallOfFameSize: 5,
        },
        rng,
      );
      const state: CoevolutionState = {
        predators: env.newPredators(populationSize),
        prey: env.newPrey(populationSize),
      };
      return new CoevolutionSimulation(
        30,
        env,
        driver,
        state,
        new PredatorPreyView(stage, STAGE_WIDTH, STAGE_HEIGHT),
        chart,
        "foxes evolve to catch, rabbits to escape — CIAO plot detects real progress vs cycling",
      );
    },
  },
  weasel: {
    label: "Weasel — string genome",
    build(stage, chart) {
      const rng = new Rng(SEED);
      const env = new WeaselEnvironment("PROJECT DARWIN", rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 1, tournamentSize: 5, mutationRate: 0.05 },
        rng,
      );
      return new GaSimulation(
        2,
        new Runner(env, ga, 300),
        new WeaselView(stage, STAGE_WIDTH, STAGE_HEIGHT),
        chart,
        `target "PROJECT DARWIN" / max ${env.maxFitness}`,
      );
    },
  },
  landscape: {
    label: "Landscape — vector genome (Rastrigin)",
    build(stage, chart) {
      const rng = new Rng(SEED);
      const env = new LandscapeEnvironment(2, rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 },
        rng,
      );
      return new GaSimulation(
        1,
        new Runner(env, ga, 300),
        new LandscapeView(stage, STAGE_WIDTH, STAGE_HEIGHT),
        chart,
        "minimise Rastrigin (global optimum at the origin)",
      );
    },
  },
  tsp: {
    label: "TSP — permutation genome",
    build(stage, chart) {
      const rng = new Rng(SEED);
      const env = new TspEnvironment(20, rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 },
        rng,
      );
      return new GaSimulation(
        1,
        new Runner(env, ga, 300),
        new TspView(stage, STAGE_WIDTH, STAGE_HEIGHT, env),
        chart,
        "shortest closed route through 20 nodes",
      );
    },
  },
  cartpole: {
    label: "Cart-pole — neural network (episodic)",
    build(stage, chart) {
      const rng = new Rng(SEED);
      const env = new CartPoleEnvironment(600, 6, 3, rng);
      const ga = new GenerationalGA(
        { populationSize: 150, eliteCount: 2, tournamentSize: 5, mutationRate: 0.2 },
        rng,
      );
      return new GaSimulation(
        12,
        new Runner(env, ga, 150),
        new CartPoleView(stage, STAGE_WIDTH, STAGE_HEIGHT, env),
        chart,
        "balance the pole across 3 varied starts",
      );
    },
  },
};

/** The environment shown on load — the arms race is the project's landing view (PRD §10, §14). */
const DEFAULT_ENVIRONMENT = "predatorPrey";

function main(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app === null) throw new Error("missing #app mount point");

  app.innerHTML = `
    <h1>PROJECT DARWIN</h1>
    <select id="env"></select>
    <canvas id="stage" width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}"></canvas>
    <canvas id="chart" width="${STAGE_WIDTH}" height="${CHART_HEIGHT}"></canvas>
    <div class="meta" id="meta"></div>
  `;

  const select = must<HTMLSelectElement>(app, "#env");
  const stageCanvas = must<HTMLCanvasElement>(app, "#stage");
  const chartCanvas = must<HTMLCanvasElement>(app, "#chart");
  const meta = must<HTMLDivElement>(app, "#meta");
  const stage = context2d(stageCanvas);
  const chart = context2d(chartCanvas);

  for (const [key, option] of Object.entries(OPTIONS)) {
    const el = document.createElement("option");
    el.value = key;
    el.textContent = option.label;
    select.append(el);
  }

  let active: Simulation;
  let frame = 0;

  const load = (key: string): void => {
    const option = OPTIONS[key];
    if (option === undefined) throw new Error(`unknown environment ${key}`);
    active = option.build(stage, chart);
    frame = 0;
    stage.fillStyle = COLORS.background;
    stage.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // Clear the previous environment's chart so nothing stale lingers until this
    // environment completes its first generation.
    drawFitnessChart(chart, [], STAGE_WIDTH, CHART_HEIGHT);
    meta.textContent = active.meta;
  };

  select.addEventListener("change", () => load(select.value));
  select.value = DEFAULT_ENVIRONMENT;
  load(DEFAULT_ENVIRONMENT);

  const loop = (): void => {
    frame++;
    if (frame % active.evolveInterval === 0) {
      active.advance();
      meta.textContent = active.meta;
    }
    active.frame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** The fittest genome of a scored generation, as a {@link Network}. */
function fittestNetwork(population: readonly Genome[]): Network {
  let best = population[0];
  if (best === undefined) throw new Error("cannot take a champion of an empty population");
  for (const genome of population) {
    if (genome.fitness > best.fitness) best = genome;
  }
  if (!(best instanceof Network)) throw new TypeError("expected a Network champion");
  return best;
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
