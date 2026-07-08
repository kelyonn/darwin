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
