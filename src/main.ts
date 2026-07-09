import { Rng } from "./core/rng.js";
import { GenerationalGA } from "./core/ga.js";
import { Network } from "./core/network.js";
import { Runner } from "./app/runner.js";
import { CoevolutionDriver, type CoevolutionState } from "./search/coevolution.js";
import { NoveltySearch } from "./search/novelty.js";
import { MapElites } from "./search/mapElites.js";
import { CREAM } from "./render/palette.js";
import {
  type EnvironmentView,
  WeaselView,
  LandscapeView,
  TspView,
  CartPoleView,
  TrackRunnerView,
  XorView,
  PredatorPreyView,
  MazeDuoView,
  GaitArchiveView,
} from "./render/views.js";
import { WeaselEnvironment } from "./environments/weasel.js";
import { LandscapeEnvironment } from "./environments/landscape.js";
import { TspEnvironment } from "./environments/tsp.js";
import { CartPoleEnvironment } from "./environments/cartpole.js";
import { TrackRunnerEnvironment } from "./environments/trackrunner.js";
import { MazeEnvironment, type LiveMazeEpisode, type MazeSnapshot } from "./environments/maze.js";
import { GaitEnvironment, type LiveGaitEpisode } from "./environments/gait.js";
import { XorEnvironment } from "./environments/xor.js";
import {
  PredatorPreyEnvironment,
  type LivePredatorPreyEpisode,
} from "./environments/predatorPrey.js";
import type { Genome } from "./core/genome.js";

/**
 * Entry point (PRD §3): a specimen-plate environment selector driving one
 * representation-blind engine. Each tab wires a different Environment +
 * genome type through the same core, proving the decoupling on screen. Most
 * tabs use the single-population {@link GenerationalGA}; predator–prey uses
 * the two-population {@link CoevolutionDriver}; gait uses {@link MapElites};
 * maze runs both a {@link GenerationalGA} and a {@link NoveltySearch} side by
 * side. All satisfy the same {@link Simulation} shape so the render loop is
 * oblivious to which is running.
 */

const SEED = 42;
const STAGE_WIDTH = 1180;
const STAGE_HEIGHT = 740;

/** The plate's top-right generation/metric readout. */
interface Readout {
  readonly generation: number;
  readonly metricLabel: string;
  readonly metricValue: string;
  readonly secondary?: { readonly label: string; readonly value: string };
}

/**
 * One runnable environment, decoupled from how it evolves. `advance` evolves a
 * generation and refreshes `readout`; `frame` draws per-frame animation onto
 * the shared 1180×740 stage.
 */
interface Simulation {
  /** Frames between evolved generations (episodic envs evolve less often). */
  readonly evolveInterval: number;
  readonly readout: Readout;
  advance(): void;
  frame(): void;
}

/** Adapts a single-population {@link Runner} + {@link EnvironmentView} to {@link Simulation}. */
class GaSimulation implements Simulation {
  readout: Readout = { generation: 0, metricLabel: "fitness", metricValue: "0" };

  constructor(
    readonly evolveInterval: number,
    private readonly runner: Runner,
    private readonly view: EnvironmentView,
    private readonly metricLabel: string,
    private readonly formatMetric: (best: number) => string,
  ) {}

  advance(): void {
    const result = this.runner.advance();
    this.view.onGeneration(result);
    this.readout = {
      generation: result.generation,
      metricLabel: this.metricLabel,
      metricValue: this.formatMetric(result.stats.best),
    };
  }

  frame(): void {
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
    readonly evolveInterval: number,
    private readonly environment: PredatorPreyEnvironment,
    private readonly driver: CoevolutionDriver,
    initialState: CoevolutionState,
    private readonly view: PredatorPreyView,
  ) {
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
    this.ciao.push(this.preyChampions.map((prey) => this.environment.compete(championPredator, prey).predatorScore));

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
    };
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

/**
 * Adapts {@link MapElites} to {@link Simulation}. Unlike a generational
 * population, the archive only grows and improves — there is no "generation" of
 * evaluated genomes to read stats from, so the readout reports archive
 * coverage and the best distance found instead, and the champion is animated
 * live in the lens.
 */
class MapElitesSimulation implements Simulation {
  readout: Readout;
  private best: Network | null = null;
  private episode: LiveGaitEpisode | null = null;
  private generation = 0;

  constructor(
    readonly evolveInterval: number,
    private readonly elites: MapElites,
    private readonly environment: GaitEnvironment,
    private readonly view: GaitArchiveView,
    private readonly bins: number,
  ) {
    this.readout = { generation: 0, metricLabel: "archive cells", metricValue: `0 / ${bins * bins}`, secondary: { label: "best distance", value: "0.00" } };
  }

  advance(): void {
    this.elites.step(this.environment.spawn, this.environment.evaluate);
    this.generation++;
    let best = null;
    for (const entry of this.elites.entries) {
      if (best === null || entry.genome.fitness > best.genome.fitness) best = entry;
    }
    if (best !== null) {
      this.best = best.genome as Network;
      this.episode = this.environment.createEpisode(this.best);
    }
    this.readout = {
      generation: this.generation,
      metricLabel: "archive cells",
      metricValue: `${this.elites.size} / ${this.bins * this.bins}`,
      secondary: { label: "best distance", value: (best?.genome.fitness ?? 0).toFixed(2) },
    };
  }

  frame(): void {
    if (this.best !== null) {
      if (this.episode === null || !this.episode.step()) {
        this.episode = this.environment.createEpisode(this.best);
        this.episode.step();
      }
    }
    this.view.draw(this.episode?.snapshot ?? null, this.elites.entries);
  }
}

/**
 * Runs the deceptive maze (PRD §10 Tier 2 #7) under two search paradigms at
 * once, on the identical topology: an ordinary {@link GenerationalGA} (gets
 * stuck on the dead-end pocket) and {@link NoveltySearch} (ignores the goal and
 * explores instead). Both populations advance together each generation.
 */
class MazeSimulation implements Simulation {
  readout: Readout = {
    generation: 0,
    metricLabel: "objective fitness",
    metricValue: "0.000",
    secondary: { label: "novelty archive", value: "0 cells" },
  };
  private objBest: Network | null = null;
  private novBest: Network | null = null;
  private objEpisode: LiveMazeEpisode | null = null;
  private novEpisode: LiveMazeEpisode | null = null;

  constructor(
    readonly evolveInterval: number,
    private readonly objEnv: MazeEnvironment,
    private readonly novEnv: MazeEnvironment,
    private readonly objRunner: Runner,
    private readonly novelty: NoveltySearch,
    private novPopulation: Genome[],
    private readonly view: MazeDuoView,
  ) {}

  advance(): void {
    const objResult = this.objRunner.advance();
    this.objBest = objResult.best as Network;
    this.objEpisode = this.objEnv.createEpisode(this.objBest);

    const evaluated = this.novPopulation;
    this.novPopulation = this.novelty.step(evaluated, (g) => this.novEnv.evaluate(g));
    this.novBest = fittest(evaluated) as Network;
    this.novEpisode = this.novEnv.createEpisode(this.novBest);

    this.readout = {
      generation: objResult.generation,
      metricLabel: "objective fitness",
      metricValue: objResult.stats.best.toFixed(3),
      secondary: { label: "novelty archive", value: `${this.novelty.exploredBehaviours.length} cells` },
    };
  }

  frame(): void {
    let objSnapshot: MazeSnapshot | null = null;
    let novSnapshot: MazeSnapshot | null = null;
    if (this.objBest !== null) {
      if (this.objEpisode === null || !this.objEpisode.step()) {
        this.objEpisode = this.objEnv.createEpisode(this.objBest);
        this.objEpisode.step();
      }
      objSnapshot = this.objEpisode.snapshot;
    }
    if (this.novBest !== null) {
      if (this.novEpisode === null || !this.novEpisode.step()) {
        this.novEpisode = this.novEnv.createEpisode(this.novBest);
        this.novEpisode.step();
      }
      novSnapshot = this.novEpisode.snapshot;
    }
    this.view.draw(objSnapshot, novSnapshot, this.novelty.exploredBehaviours, this.objRunner.history);
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

const WEASEL_TARGET = "PROJECT DARWIN";

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
      const env = new PredatorPreyEnvironment(8, rng);
      const populationSize = 40;
      const driver = new CoevolutionDriver(
        env.compete,
        { populationSize, eliteCount: 2, tournamentSize: 4, mutationRate: 0.2, opponentSampleSize: 4, hallOfFameSize: 5 },
        rng,
      );
      const state: CoevolutionState = { predators: env.newPredators(populationSize), prey: env.newPrey(populationSize) };
      return new CoevolutionSimulation(30, env, driver, state, new PredatorPreyView(stage, STAGE_WIDTH, STAGE_HEIGHT));
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
      const ga = new GenerationalGA({ populationSize: 300, eliteCount: 1, tournamentSize: 5, mutationRate: 0.05 }, rng);
      const view = new WeaselView(stage, STAGE_WIDTH, STAGE_HEIGHT, WEASEL_TARGET);
      return new GaSimulation(2, new Runner(env, ga, 300), view, "fitness", (best) => `${best.toFixed(0)} / ${env.maxFitness}`);
    },
  },
  {
    numeral: "III",
    label: "Landscape",
    plateLabel: "Plate III — Landscape",
    summary: "Vector genome on the Rastrigin surface",
    footnote:
      "The genome is the coordinate. Rastrigin's lattice of local optima is the real test of the search — escaping deception, not climbing an easy hill.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new LandscapeEnvironment(2, rng);
      const ga = new GenerationalGA({ populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 }, rng);
      const view = new LandscapeView(stage, STAGE_WIDTH, STAGE_HEIGHT);
      return new GaSimulation(1, new Runner(env, ga, 300), view, "fitness", (best) => best.toFixed(3));
    },
  },
  {
    numeral: "IV",
    label: "TSP",
    plateLabel: "Plate IV — Travelling Salesman",
    summary: "Permutation genome, order crossover",
    footnote:
      "A route must stay a valid permutation through every crossover — order crossover (OX) guarantees it. The same core that evolved a string now evolves a tour.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new TspEnvironment(20, rng);
      const ga = new GenerationalGA({ populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 }, rng);
      const view = new TspView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new GaSimulation(1, new Runner(env, ga, 300), view, "route distance", (best) => (1 / best - 1).toFixed(3));
    },
  },
  {
    numeral: "V",
    label: "Cart-pole",
    plateLabel: "Plate V — Cart-pole",
    summary: "Neural network, episodic control",
    footnote:
      "The first episodic environment: a network is consulted every tick and reward accumulates over an entire balancing act — frames upright, before the pole or the cart runs out of track.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new CartPoleEnvironment(600, 6, 3, rng);
      const ga = new GenerationalGA({ populationSize: 150, eliteCount: 2, tournamentSize: 5, mutationRate: 0.2 }, rng);
      const view = new CartPoleView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new GaSimulation(12, new Runner(env, ga, 150), view, "frames upright", (best) => `${best.toFixed(0)} / ${env.maxFitness}`);
    },
  },
  {
    numeral: "VI",
    label: "Track Runner",
    plateLabel: "Plate VI — Track Runner",
    summary: "Five rangefinders, a closed loop",
    footnote:
      "Progress-led shaping: checkpoints dominate raw distance so the car is driven to make real laps rather than idle or wall-hug — the same episodic network as cart-pole, now steering by sensor alone.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new TrackRunnerEnvironment(6, rng);
      const ga = new GenerationalGA({ populationSize: 150, eliteCount: 2, tournamentSize: 5, mutationRate: 0.2 }, rng);
      const view = new TrackRunnerView(stage, STAGE_WIDTH, STAGE_HEIGHT, env);
      return new GaSimulation(10, new Runner(env, ga, 150), view, "fitness", (best) => best.toFixed(2));
    },
  },
  {
    numeral: "VII",
    label: "Maze",
    plateLabel: "Plate VII — Maze",
    summary: "One corridor, two selections",
    footnote:
      "The identical deceptive maze, run twice: objective fitness (left) rewards a near-goal dead end and stalls there; Novelty Search (right) ignores the goal entirely and threads the corridor by rewarding unvisited ground (Lehman & Stanley, 2011).",
    build(stage) {
      const rngA = new Rng(SEED);
      const rngB = new Rng(SEED);
      const objEnv = new MazeEnvironment(6, rngA);
      const novEnv = new MazeEnvironment(6, rngB);
      const baseConfig = { populationSize: 150, eliteCount: 2, tournamentSize: 5, mutationRate: 0.2 };
      const ga = new GenerationalGA(baseConfig, rngA);
      const novelty = new NoveltySearch({ ...baseConfig, neighbours: 8, archiveThreshold: 0.03, archiveLimit: 400 }, rngB);
      const view = new MazeDuoView(stage, STAGE_WIDTH, STAGE_HEIGHT, objEnv);
      return new MazeSimulation(10, objEnv, novEnv, new Runner(objEnv, ga, 150), novelty, novEnv.newPopulation(150), view);
    },
  },
  {
    numeral: "VIII",
    label: "Gait",
    plateLabel: "Plate VIII — Gait",
    summary: "No objective — an illuminated archive",
    footnote:
      "MAP-Elites keeps only the fittest hopper found at each (stride length, duty factor) cell, building a gallery of viable gaits — a fast bounder, a shuffling crawler — rather than converging on one champion (Mouret & Clune, 2015).",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new GaitEnvironment(6, rng);
      const bins = 20;
      const elites = new MapElites(
        {
          dimensions: [
            { min: GaitEnvironment.BEHAVIOUR_BOUNDS.strideLength.min, max: GaitEnvironment.BEHAVIOUR_BOUNDS.strideLength.max, bins },
            { min: GaitEnvironment.BEHAVIOUR_BOUNDS.dutyFactor.min, max: GaitEnvironment.BEHAVIOUR_BOUNDS.dutyFactor.max, bins },
          ],
          initialPopulation: 200,
          batchSize: 40,
          mutationRate: 0.3,
        },
        rng,
      );
      const view = new GaitArchiveView(stage, STAGE_WIDTH, STAGE_HEIGHT, bins);
      return new MapElitesSimulation(3, elites, env, view, bins);
    },
  },
  {
    numeral: "IX",
    label: "XOR",
    plateLabel: "Plate IX — XOR",
    summary: "String genome's neighbor, minus the network",
    footnote:
      "The smallest honest test of the hidden layer: fitness is 4 minus squared error across all four non-linearly-separable cases — the sanity check underneath every network environment on this bench.",
    build(stage) {
      const rng = new Rng(SEED);
      const env = new XorEnvironment(4, rng);
      const ga = new GenerationalGA({ populationSize: 100, eliteCount: 2, tournamentSize: 5, mutationRate: 0.15 }, rng);
      const view = new XorView(stage, STAGE_WIDTH, STAGE_HEIGHT);
      return new GaSimulation(2, new Runner(env, ga, 100), view, "fitness", (best) => `${best.toFixed(3)} / 4`);
    },
  },
];

/** The environment shown on load — the arms race is the project's landing view (PRD §10, §14). */
const DEFAULT_INDEX = 0;

function main(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app === null) throw new Error("missing #app mount point");

  app.innerHTML = `
    <div class="scale-root" id="scaleRoot">
      <div class="page">
        <div class="header-row">
          <div>
            <div class="lab title">Project Darwin</div>
            <div class="lab subtitle">A Representation-Blind Evolutionary Engine</div>
          </div>
          <div class="tabs" id="tabs"></div>
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
  `;

  const scaleRoot = must<HTMLDivElement>(app, "#scaleRoot");
  const tabs = must<HTMLDivElement>(app, "#tabs");
  const stageCanvas = must<HTMLCanvasElement>(app, "#stage");
  const plateLabel = must<HTMLDivElement>(app, "#plateLabel");
  const plateSummary = must<HTMLDivElement>(app, "#plateSummary");
  const readoutEl = must<HTMLDivElement>(app, "#readout");
  const footnote = must<HTMLParagraphElement>(app, "#footnote");
  const stage = context2d(stageCanvas);

  let activeIndex = DEFAULT_INDEX;
  let active: Simulation;
  let frame = 0;

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
    const { generation, metricLabel, metricValue, secondary } = active.readout;
    readoutEl.innerHTML =
      `<div>generation ${generation}</div>` +
      `<div style="margin-top:4px;">${metricLabel} ${metricValue}</div>` +
      (secondary !== undefined ? `<div style="margin-top:4px;">${secondary.label} ${secondary.value}</div>` : "");
  };

  const load = (index: number): void => {
    activeIndex = index;
    const option = OPTIONS[index];
    if (option === undefined) throw new Error(`unknown environment index ${index}`);
    active = option.build(stage);
    frame = 0;
    stage.fillStyle = CREAM;
    stage.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    plateLabel.textContent = option.plateLabel;
    plateSummary.textContent = option.summary;
    footnote.textContent = option.footnote;
    renderTabs();
    renderReadout();
  };

  load(DEFAULT_INDEX);

  fitToViewport(scaleRoot);
  window.addEventListener("resize", () => fitToViewport(scaleRoot));

  const loop = (): void => {
    frame++;
    if (frame % active.evolveInterval === 0) {
      active.advance();
      renderReadout();
    }
    active.frame();
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
