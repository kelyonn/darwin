import { Rng } from "./core/rng.js";
import { GenerationalGA } from "./core/ga.js";
import { Runner } from "./app/runner.js";
import { drawFitnessChart, COLORS } from "./render/chart.js";
import {
  type EnvironmentView,
  WeaselView,
  LandscapeView,
  TspView,
  CartPoleView,
} from "./render/views.js";
import { WeaselEnvironment } from "./environments/weasel.js";
import { LandscapeEnvironment } from "./environments/landscape.js";
import { TspEnvironment } from "./environments/tsp.js";
import { CartPoleEnvironment } from "./environments/cartpole.js";

/**
 * Entry point (PRD §3): an environment selector driving one representation-blind
 * engine. Each option wires a different Environment + genome type through the
 * same {@link GenerationalGA} and {@link Runner}, proving the decoupling on screen.
 */

const SEED = 42;
const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 360;
const CHART_HEIGHT = 90;

interface EnvironmentOption {
  readonly label: string;
  /** Frames between evolved generations (episodic envs evolve less often). */
  readonly evolveInterval: number;
  build(stage: CanvasRenderingContext2D): { runner: Runner; view: EnvironmentView; summary: string };
}

const OPTIONS: Record<string, EnvironmentOption> = {
  weasel: {
    label: "Weasel — string genome",
    evolveInterval: 2,
    build(stage) {
      const rng = new Rng(SEED);
      const env = new WeaselEnvironment("PROJECT DARWIN", rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 1, tournamentSize: 5, mutationRate: 0.05 },
        rng,
      );
      return {
        runner: new Runner(env, ga, 300),
        view: new WeaselView(stage, STAGE_WIDTH, STAGE_HEIGHT),
        summary: `target "PROJECT DARWIN" / max ${env.maxFitness}`,
      };
    },
  },
  landscape: {
    label: "Landscape — vector genome (Rastrigin)",
    evolveInterval: 1,
    build(stage) {
      const rng = new Rng(SEED);
      const env = new LandscapeEnvironment(2, rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 },
        rng,
      );
      return {
        runner: new Runner(env, ga, 300),
        view: new LandscapeView(stage, STAGE_WIDTH, STAGE_HEIGHT),
        summary: "minimise Rastrigin (global optimum at the origin)",
      };
    },
  },
  tsp: {
    label: "TSP — permutation genome",
    evolveInterval: 1,
    build(stage) {
      const rng = new Rng(SEED);
      const env = new TspEnvironment(20, rng);
      const ga = new GenerationalGA(
        { populationSize: 300, eliteCount: 2, tournamentSize: 5, mutationRate: 0.1 },
        rng,
      );
      return {
        runner: new Runner(env, ga, 300),
        view: new TspView(stage, STAGE_WIDTH, STAGE_HEIGHT, env),
        summary: "shortest closed route through 20 nodes",
      };
    },
  },
  cartpole: {
    label: "Cart-pole — neural network (episodic)",
    evolveInterval: 12,
    build(stage) {
      const rng = new Rng(SEED);
      const env = new CartPoleEnvironment(600, 6, 3, rng);
      const ga = new GenerationalGA(
        { populationSize: 150, eliteCount: 2, tournamentSize: 5, mutationRate: 0.2 },
        rng,
      );
      return {
        runner: new Runner(env, ga, 150),
        view: new CartPoleView(stage, STAGE_WIDTH, STAGE_HEIGHT, env),
        summary: "balance the pole across 3 varied starts",
      };
    },
  },
};

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

  let active: { option: EnvironmentOption; runner: Runner; view: EnvironmentView; summary: string };
  let frame = 0;

  const load = (key: string): void => {
    const option = OPTIONS[key];
    if (option === undefined) throw new Error(`unknown environment ${key}`);
    const built = option.build(stage);
    active = { option, ...built };
    frame = 0;
    stage.fillStyle = COLORS.background;
    stage.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // Clear the previous environment's chart and readout so nothing stale lingers
    // until this environment completes its first generation.
    drawFitnessChart(chart, [], STAGE_WIDTH, CHART_HEIGHT);
    meta.textContent = `starting ${active.summary}…`;
  };

  select.addEventListener("change", () => load(select.value));
  load("weasel");

  const loop = (): void => {
    frame++;
    if (frame % active.option.evolveInterval === 0) {
      const result = active.runner.advance();
      active.view.onGeneration(result);
      drawFitnessChart(chart, active.runner.history, STAGE_WIDTH, CHART_HEIGHT);
      meta.textContent =
        `generation ${result.generation}   best ${result.stats.best.toFixed(2)}   ` +
        `avg ${result.stats.average.toFixed(2)}   diversity ${result.stats.spread.toFixed(2)}\n` +
        active.summary;
    }
    active.view.animate?.();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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
