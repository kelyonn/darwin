import type { GenerationResult } from "../app/runner.js";
import { COLORS } from "./chart.js";
import { StringGenome } from "../genomes/stringGenome.js";
import { VectorGenome } from "../genomes/vectorGenome.js";
import { PermutationGenome } from "../genomes/permutationGenome.js";
import { Network } from "../core/network.js";
import { rastrigin } from "../environments/landscape.js";
import {
  CartPoleEnvironment,
  CART_POLE_TRACK_LIMIT,
  type LiveCartPoleEpisode,
} from "../environments/cartpole.js";
import type { TspEnvironment } from "../environments/tsp.js";
import {
  PREDATOR_PREY_ARENA_SIZE,
  PREDATOR_PREY_CAPTURE_RADIUS,
  type PredatorPreySnapshot,
} from "../environments/predatorPrey.js";
import type { TrackRunnerEnvironment, LiveTrackEpisode } from "../environments/trackrunner.js";
import type { MazeEnvironment, LiveMazeEpisode } from "../environments/maze.js";
import type { ArchiveEntry } from "../search/mapElites.js";

/**
 * Renders one environment's best genome to a canvas. `onGeneration` is called
 * once per evolved generation; the optional `animate` runs every frame (used by
 * episodic environments to play the best controller live).
 */
export interface EnvironmentView {
  onGeneration(result: GenerationResult): void;
  animate?(): void;
}

/** Weasel: the current best string, large and centred. */
export class WeaselView implements EnvironmentView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {}

  onGeneration(result: GenerationResult): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 40px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const best = result.best as StringGenome;
    ctx.fillText(best.value, width / 2, height / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

/** Landscape: the Rastrigin surface (cached) with the population scattered over it. */
export class LandscapeView implements EnvironmentView {
  private readonly surface: HTMLCanvasElement;
  private readonly bounds: readonly [number, number] = [-5.12, 5.12];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.surface = renderRastriginSurface(width, height, this.bounds);
  }

  onGeneration(result: GenerationResult): void {
    const { ctx } = this;
    ctx.drawImage(this.surface, 0, 0);
    ctx.fillStyle = COLORS.accent;
    for (const genome of result.evaluated) {
      const [x, y] = (genome as VectorGenome).coordinates;
      ctx.fillRect(this.toPixelX(x ?? 0) - 1, this.toPixelY(y ?? 0) - 1, 2, 2);
    }
    const [bx, by] = (result.best as VectorGenome).coordinates;
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(this.toPixelX(bx ?? 0), this.toPixelY(by ?? 0), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private toPixelX(x: number): number {
    const [min, max] = this.bounds;
    return ((x - min) / (max - min)) * this.width;
  }

  private toPixelY(y: number): number {
    const [min, max] = this.bounds;
    return (1 - (y - min) / (max - min)) * this.height;
  }
}

/** TSP: node positions and the current best route. */
export class TspView implements EnvironmentView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: TspEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    const { ctx, width, height } = this;
    const margin = 30;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    const nodes = this.environment.nodePositions;
    const px = (x: number): number => margin + x * (width - 2 * margin);
    const py = (y: number): number => margin + y * (height - 2 * margin);

    const order = (result.best as PermutationGenome).sequence;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < order.length; i++) {
      const node = nodes[order[i] as number];
      if (node === undefined) continue;
      const x = px(node.x);
      const y = py(node.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const first = nodes[order[0] as number];
    if (first !== undefined) ctx.lineTo(px(first.x), py(first.y));
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(px(node.x), py(node.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Cart-pole: the best controller balancing live, replaying when it falls. */
export class CartPoleView implements EnvironmentView {
  private episode: LiveCartPoleEpisode | null = null;
  private champion: Network | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: CartPoleEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.champion = result.best as Network;
    if (this.episode === null) {
      this.episode = this.environment.createEpisode(this.champion);
    }
  }

  animate(): void {
    // Before the first generation there is no champion yet: draw a static,
    // upright cart so the stage is never blank.
    if (this.champion === null) {
      this.draw(0, 0);
      return;
    }
    if (this.episode === null || !this.episode.step()) {
      this.episode = this.environment.createEpisode(this.champion);
      this.episode.step();
    }
    const { position, angle } = this.episode.snapshot;
    this.draw(position, angle);
  }

  private draw(position: number, angle: number): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    const trackY = height * 0.7;
    const cartX = width / 2 + (position / CART_POLE_TRACK_LIMIT) * (width * 0.4);
    const cartW = 60;
    const cartH = 24;
    const poleLength = 120;

    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, trackY + cartH / 2);
    ctx.lineTo(width, trackY + cartH / 2);
    ctx.stroke();

    ctx.fillStyle = COLORS.accentSoft;
    ctx.fillRect(cartX - cartW / 2, trackY - cartH / 2, cartW, cartH);

    const tipX = cartX + Math.sin(angle) * poleLength;
    const tipY = trackY - cartH / 2 - Math.cos(angle) * poleLength;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cartX, trackY - cartH / 2);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

/**
 * Predator–prey: the live arms race on the left (a fox chasing a rabbit) and a
 * CIAO plot on the right — the current champion predator scored against every
 * ancestral prey champion. A smooth colour gradient down the CIAO plot means
 * genuine progress; horizontal banding means the arms race is cycling
 * (RESEARCH.md §4.5). This view is driven directly, not through `EnvironmentView`,
 * because co-evolution has two populations rather than one.
 */
export class PredatorPreyView {
  private readonly arena: number;
  private readonly arenaX = 12;
  private readonly arenaY = 12;
  private readonly ciaoX: number;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.arena = height - this.arenaY * 2;
    this.ciaoX = this.arenaX + this.arena + 24;
  }

  /** Empty arena shown before the first generation has produced a champion. */
  drawIdle(): void {
    this.clear();
    this.drawArenaFrame();
    this.ctx.fillStyle = COLORS.muted;
    this.ctx.font = "13px ui-monospace, monospace";
    this.ctx.fillText("seeding the arms race…", this.arenaX + 12, this.arenaY + 24);
  }

  /** Draws one animation frame: the live chase plus the accumulated CIAO plot. */
  draw(snapshot: PredatorPreySnapshot, ciao: readonly (readonly number[])[]): void {
    this.clear();
    this.drawArenaFrame();

    const captureRadiusPx = (PREDATOR_PREY_CAPTURE_RADIUS / PREDATOR_PREY_ARENA_SIZE) * this.arena;
    this.drawAgent(snapshot.predator, "#f97316", captureRadiusPx); // fox
    this.drawAgent(snapshot.prey, "#38bdf8", 0); // rabbit

    if (snapshot.captured) {
      this.ctx.fillStyle = "#f97316";
      this.ctx.font = "bold 15px ui-monospace, monospace";
      this.ctx.fillText("caught!", this.arenaX + 12, this.arenaY + this.arena - 14);
    }

    this.drawCiao(ciao);
  }

  private drawAgent(agent: { readonly x: number; readonly y: number; readonly heading: number }, color: string, ringPx: number): void {
    const { ctx } = this;
    const px = this.arenaX + (agent.x / PREDATOR_PREY_ARENA_SIZE) * this.arena;
    const py = this.arenaY + (agent.y / PREDATOR_PREY_ARENA_SIZE) * this.arena;

    if (ringPx > 0) {
      ctx.strokeStyle = "rgba(249, 115, 22, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, ringPx, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    // Heading whisker.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(agent.heading) * 12, py + Math.sin(agent.heading) * 12);
    ctx.stroke();
  }

  /** Renders the CIAO matrix as a heat map, most recent generations at the bottom. */
  private drawCiao(ciao: readonly (readonly number[])[]): void {
    const { ctx } = this;
    const plotWidth = this.width - this.ciaoX - 12;
    const plotHeight = this.arena;

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("CIAO — champion vs ancestors", this.ciaoX, this.arenaY - 2);

    if (ciao.length === 0) {
      return;
    }
    // Show the most recent generations; the newest row spans the most columns.
    const maxCells = 60;
    const rows = ciao.slice(-maxCells);
    const columns = Math.min(maxCells, (rows[rows.length - 1] as readonly number[]).length);
    const cellW = plotWidth / columns;
    const cellH = plotHeight / rows.length;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as readonly number[];
      const shown = row.slice(-columns);
      for (let c = 0; c < shown.length; c++) {
        ctx.fillStyle = heat(shown[c] as number);
        ctx.fillRect(this.ciaoX + c * cellW, this.arenaY + r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.ciaoX, this.arenaY, plotWidth, plotHeight);
  }

  private drawArenaFrame(): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(this.arenaX, this.arenaY, this.arena, this.arena);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.arenaX, this.arenaY, this.arena, this.arena);
  }

  private clear(): void {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}

/** Maps a predator payoff in [0, 1] to a blue→yellow→red heat colour. */
function heat(value: number): string {
  const t = Math.min(1, Math.max(0, value));
  const r = Math.round(255 * Math.min(1, t * 2));
  const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.round(255 * Math.min(1, (1 - t) * 2));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Track runner: the ring track, the champion's live drive, and its sensor rays. */
export class TrackRunnerView implements EnvironmentView {
  private episode: LiveTrackEpisode | null = null;
  private champion: Network | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: TrackRunnerEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.champion = result.best as Network;
    this.episode = this.environment.createEpisode(this.champion);
  }

  animate(): void {
    if (this.champion === null) {
      this.drawTrack();
      return;
    }
    if (this.episode === null || !this.episode.step()) {
      this.episode = this.environment.createEpisode(this.champion);
      this.episode.step();
    }
    this.drawTrack();
    this.drawCar(this.episode.snapshot);
  }

  private drawTrack(): void {
    const { ctx, width, height } = this;
    const { center, innerRadius, outerRadius } = this.environment.geometry;
    const scale = Math.min(width, height);
    const toPx = (x: number): number => x * scale;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = toPx(outerRadius - innerRadius);
    ctx.beginPath();
    ctx.arc(toPx(center), toPx(center), toPx((innerRadius + outerRadius) / 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  private drawCar(snapshot: { x: number; y: number; heading: number; sensors: readonly number[] }): void {
    const { ctx, width, height } = this;
    const scale = Math.min(width, height);
    const toPx = (x: number): number => x * scale;
    const px = toPx(snapshot.x);
    const py = toPx(snapshot.y);

    ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
    for (const [i, reading] of snapshot.sensors.entries()) {
      const angle = snapshot.heading + [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2][i]!;
      const length = toPx(reading * 0.5);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Maze: the wall grid, the goal, and the champion's live run with sensor rays. */
export class MazeView implements EnvironmentView {
  private episode: LiveMazeEpisode | null = null;
  private champion: Network | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: MazeEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.champion = result.best as Network;
    this.episode = this.environment.createEpisode(this.champion);
  }

  animate(): void {
    this.drawGrid();
    if (this.champion === null) {
      return;
    }
    if (this.episode === null || !this.episode.step()) {
      this.episode = this.environment.createEpisode(this.champion);
      this.episode.step();
    }
    this.drawAgent(this.episode.snapshot);
  }

  private cellSize(): number {
    const { cols, rows } = this.environment.dimensions;
    return Math.min(this.width / cols, this.height / rows);
  }

  private drawGrid(): void {
    const { ctx } = this;
    const cell = this.cellSize();
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);
    const grid = this.environment.grid;
    for (let row = 0; row < grid.length; row++) {
      const line = grid[row] as readonly boolean[];
      for (let col = 0; col < line.length; col++) {
        if (line[col]) {
          ctx.fillStyle = COLORS.grid;
          ctx.fillRect(col * cell, row * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    const goal = this.environment.goal;
    ctx.fillStyle = "#f97316";
    ctx.fillRect(goal.col * cell, goal.row * cell, cell, cell);
  }

  private drawAgent(snapshot: { x: number; y: number; heading: number }): void {
    const { ctx } = this;
    const cell = this.cellSize();
    const px = snapshot.x * cell;
    const py = snapshot.y * cell;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(snapshot.heading) * cell * 0.6, py + Math.sin(snapshot.heading) * cell * 0.6);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

/**
 * MAP-Elites archive: a heat map over (stride length, duty factor), each cell
 * coloured by the fittest gait found there — the illuminated gallery of viable
 * walking styles (PRD §10 Tier 2 #8; RESEARCH.md §3).
 */
export class GaitArchiveView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly bounds: { strideLength: { min: number; max: number }; dutyFactor: { min: number; max: number } },
    private readonly bins: number,
  ) {}

  draw(entries: readonly ArchiveEntry[]): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    const cellW = width / this.bins;
    const cellH = height / this.bins;
    let maxFitness = 0;
    for (const entry of entries) maxFitness = Math.max(maxFitness, entry.genome.fitness);

    for (const entry of entries) {
      const [strideBin, dutyBin] = entry.cell;
      const t = maxFitness > 0 ? entry.genome.fitness / maxFitness : 0;
      ctx.fillStyle = `rgba(129, 140, 248, ${0.25 + 0.75 * t})`;
      ctx.fillRect((strideBin ?? 0) * cellW, height - ((dutyBin ?? 0) + 1) * cellH, cellW - 1, cellH - 1);
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(0, 0, width, height);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`stride length ${this.bounds.strideLength.min}–${this.bounds.strideLength.max} →`, 6, height - 4);
    ctx.save();
    ctx.translate(12, height - 8);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`duty factor ↑`, 0, 0);
    ctx.restore();
  }
}

/** Precomputes the Rastrigin surface as a heat map into an offscreen canvas. */
function renderRastriginSurface(
  width: number,
  height: number,
  bounds: readonly [number, number],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D context unavailable");

  const image = ctx.createImageData(width, height);
  const [min, max] = bounds;
  // Rastrigin's max over the domain, for normalisation.
  const peak = 80;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = min + (px / width) * (max - min);
      const y = max - (py / height) * (max - min);
      const value = rastrigin([x, y]);
      const t = Math.min(1, value / peak);
      const offset = (py * width + px) * 4;
      image.data[offset] = Math.round(20 + t * 60);
      image.data[offset + 1] = Math.round(26 + t * 40);
      image.data[offset + 2] = Math.round(51 + (1 - t) * 120);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
