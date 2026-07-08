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
