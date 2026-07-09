import type { GenerationResult } from "../app/runner.js";
import type { PopulationStats } from "../core/stats.js";
import {
  CREAM,
  INK,
  MOSS,
  AMBER,
  INSET_RECT,
  dot,
  inkAgent,
  annotate,
  drawLens,
  drawInsetPanel,
  drawSparkline,
  heatColor,
  mix,
} from "./palette.js";
import { StringGenome } from "../genomes/stringGenome.js";
import { VectorGenome } from "../genomes/vectorGenome.js";
import { PermutationGenome } from "../genomes/permutationGenome.js";
import { Network } from "../core/network.js";
import { rastrigin } from "../environments/landscape.js";
import { XOR_CASES } from "../environments/xor.js";
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
import type { MazeEnvironment, MazeSnapshot } from "../environments/maze.js";
import type { GaitSnapshot } from "../environments/gait.js";
import type { ArchiveEntry } from "../search/mapElites.js";

/** The plate's default single-lens geometry, shared by most environments. */
const LENS_CX = 590;
const LENS_CY = 380;
const LENS_R = 260;

/**
 * Renders one environment's plate: the circular lens, its radial annotations,
 * and the bottom-right inset (a fitness sparkline, unless the environment
 * overrides it). `onGeneration` runs once per evolved generation; `animate`
 * redraws the whole plate every frame, including advancing any live episode.
 */
export interface EnvironmentView {
  onGeneration(result: GenerationResult): void;
  animate(): void;
}

/** Clears the plate to the paper background. */
function clearPlate(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, width, height);
}

function fitnessInset(ctx: CanvasRenderingContext2D, history: readonly PopulationStats[], caption = "fig. a — fitness"): void {
  drawInsetPanel(ctx, INSET_RECT.x, INSET_RECT.y, INSET_RECT.width, INSET_RECT.height, caption);
  drawSparkline(
    ctx,
    INSET_RECT.x + 8,
    INSET_RECT.y + 8,
    INSET_RECT.width - 16,
    INSET_RECT.height - 16,
    history.map((h) => h.best),
    history.map((h) => h.average),
  );
}

/** Weasel: the candidate string on an alphabet decoder ring. */
export class WeaselView implements EnvironmentView {
  private best: StringGenome | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly target: string,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.best = result.best as StringGenome;
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
    ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillStyle = "rgba(28,27,23,0.3)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < alphabet.length; i++) {
      const angle = (i / alphabet.length) * Math.PI * 2 - Math.PI / 2;
      const glyph = alphabet[i] === " " ? "•" : alphabet[i];
      ctx.fillText(glyph as string, LENS_CX + Math.cos(angle) * (LENS_R - 30), LENS_CY + Math.sin(angle) * (LENS_R - 30));
    }

    const value = this.best?.value ?? "".padEnd(this.target.length, "·");
    ctx.font = "600 30px 'JetBrains Mono', ui-monospace, monospace";
    let x = LENS_CX - (value.length * 18) / 2;
    for (let i = 0; i < value.length; i++) {
      ctx.fillStyle = value[i] === this.target[i] ? MOSS : "rgba(28,27,23,0.35)";
      ctx.fillText(value[i] === " " ? "·" : (value[i] as string), x + 9, LENS_CY);
      x += 18;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "candidate string", MOSS);
    fitnessInset(ctx, this.history);
  }
}

/** Landscape: the cached Rastrigin surface with the population scattered over it. */
export class LandscapeView implements EnvironmentView {
  private readonly surface: HTMLCanvasElement;
  private readonly bounds: readonly [number, number] = [-5.12, 5.12];
  private population: readonly VectorGenome[] = [];
  private best: VectorGenome | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.surface = renderRastriginSurface(this.bounds);
  }

  onGeneration(result: GenerationResult): void {
    this.population = result.evaluated as readonly VectorGenome[];
    this.best = result.best as VectorGenome;
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - 14) * 2;
    const ox = LENS_CX - side / 2;
    const oy = LENS_CY - side / 2;
    ctx.drawImage(this.surface, ox, oy, side, side);

    const [min, max] = this.bounds;
    const toPx = (v: number): number => ox + ((v - min) / (max - min)) * side;
    const toPy = (v: number): number => oy + (1 - (v - min) / (max - min)) * side;
    for (const genome of this.population) {
      const [x, y] = genome.coordinates;
      dot(ctx, toPx(x ?? 0), toPy(y ?? 0), 1.6, "rgba(28,27,23,0.4)");
    }
    if (this.best !== null) {
      const [bx, by] = this.best.coordinates;
      inkAgent(ctx, toPx(bx ?? 0), toPy(by ?? 0), 0, MOSS);
    }
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -0.6, "optimum", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, 0.6, "population", INK);
    fitnessInset(ctx, this.history);
  }
}

/** TSP: node positions and the current best route. */
export class TspView implements EnvironmentView {
  private best: PermutationGenome | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: TspEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.best = result.best as PermutationGenome;
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - 14) * 2 * 0.86;
    const ox = LENS_CX - side / 2;
    const oy = LENS_CY - side / 2;
    const nodes = this.environment.nodePositions;

    if (this.best !== null) {
      const order = this.best.sequence;
      ctx.strokeStyle = MOSS;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      order.forEach((index, i) => {
        const node = nodes[index as number];
        if (node === undefined) return;
        const x = ox + node.x * side;
        const y = oy + node.y * side;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const first = nodes[order[0] as number];
      if (first !== undefined) ctx.lineTo(ox + first.x * side, oy + first.y * side);
      ctx.stroke();
    }
    for (const node of nodes) dot(ctx, ox + node.x * side, oy + node.y * side, 3, INK);
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "route", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, `${nodes.length} nodes`, INK);
    fitnessInset(ctx, this.history);
  }
}

/** Cart-pole: the best controller balancing live, replaying when it falls. */
export class CartPoleView implements EnvironmentView {
  private episode: LiveCartPoleEpisode | null = null;
  private champion: Network | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: CartPoleEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.champion = result.best as Network;
    this.episode = this.environment.createEpisode(this.champion);
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    if (this.champion !== null) {
      if (this.episode === null || !this.episode.step()) {
        this.episode = this.environment.createEpisode(this.champion);
        this.episode.step();
      }
    }
    const { position, angle } = this.episode?.snapshot ?? { position: 0, angle: 0 };

    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const trackY = LENS_CY + 40;
    ctx.strokeStyle = "rgba(28,27,23,0.3)";
    ctx.beginPath();
    ctx.moveTo(LENS_CX - LENS_R, trackY);
    ctx.lineTo(LENS_CX + LENS_R, trackY);
    ctx.stroke();

    const cartX = LENS_CX + (position / CART_POLE_TRACK_LIMIT) * (LENS_R * 0.8);
    const cartW = 56;
    const cartH = 22;
    const poleLength = 110;
    ctx.fillStyle = "rgba(74,124,89,0.22)";
    ctx.fillRect(cartX - cartW / 2, trackY - cartH / 2, cartW, cartH);
    ctx.strokeStyle = "rgba(28,27,23,0.5)";
    ctx.strokeRect(cartX - cartW / 2, trackY - cartH / 2, cartW, cartH);

    const tipX = cartX + Math.sin(angle) * poleLength;
    const tipY = trackY - cartH / 2 - Math.cos(angle) * poleLength;
    ctx.strokeStyle = MOSS;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cartX, trackY - cartH / 2);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    dot(ctx, tipX, tipY, 4, AMBER);
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2 + 0.9, "pole", AMBER);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2 - 0.9, "cart", MOSS);
    fitnessInset(ctx, this.history);
  }
}

/** Track runner: the ring track and the champion's live drive. */
export class TrackRunnerView implements EnvironmentView {
  private episode: LiveTrackEpisode | null = null;
  private champion: Network | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: TrackRunnerEnvironment,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.champion = result.best as Network;
    this.episode = this.environment.createEpisode(this.champion);
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    if (this.champion !== null) {
      if (this.episode === null || !this.episode.step()) {
        this.episode = this.environment.createEpisode(this.champion);
        this.episode.step();
      }
    }

    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - 14) * 2 * 0.94;
    const ox = LENS_CX - side / 2;
    const oy = LENS_CY - side / 2;
    const geo = this.environment.geometry;
    const cx = ox + geo.center * side;
    const cy = oy + geo.center * side;
    ctx.strokeStyle = "rgba(28,27,23,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, geo.innerRadius * side, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, geo.outerRadius * side, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(28,27,23,0.15)";
    const spokes = 16;
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      const r1 = geo.innerRadius * side;
      const r2 = geo.outerRadius * side;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }
    if (this.episode !== null) {
      const snap = this.episode.snapshot;
      inkAgent(ctx, ox + snap.x * side, oy + snap.y * side, snap.heading, MOSS);
    }
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "car", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, "track", INK);
    fitnessInset(ctx, this.history);
  }
}

/** XOR: the evolved network's wiring diagram and live truth table. */
export class XorView implements EnvironmentView {
  private best: Network | null = null;
  private readonly history: PopulationStats[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {}

  onGeneration(result: GenerationResult): void {
    this.best = result.best as Network;
    this.history.push(result.stats);
    if (this.history.length > 400) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    if (this.best !== null) {
      drawXorNetwork(ctx, this.best, LENS_CX - 150, LENS_CY - 150, 300, 210);
    }
    drawXorTruthTable(ctx, this.best, LENS_CX - 70, LENS_CY + 76, 140, 90);
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI + 0.6, "network", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -0.6, "truth table", AMBER);
    fitnessInset(ctx, this.history);
  }
}

function drawXorNetwork(ctx: CanvasRenderingContext2D, network: Network, x: number, y: number, w: number, h: number): void {
  const { layerSizes, layers, weights } = network.inspect();
  const positions = layerSizes.map((size, li) => {
    const colX = x + (w / (layerSizes.length - 1)) * li;
    return Array.from({ length: size }, (_, i) => ({ x: colX, y: y + (h / (size + 1)) * (i + 1) }));
  });
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    if (layer === undefined) continue;
    const from = positions[li];
    const to = positions[li + 1];
    if (from === undefined || to === undefined) continue;
    for (let o = 0; o < layer.outputs; o++) {
      for (let inp = 0; inp < layer.inputs; inp++) {
        const w_ = weights[layer.weightOffset + o * layer.inputs + inp] as number;
        const magnitude = Math.min(1, Math.abs(w_) / 2);
        ctx.strokeStyle = w_ >= 0 ? `rgba(74,124,89,${0.12 + magnitude * 0.6})` : `rgba(201,161,90,${0.12 + magnitude * 0.6})`;
        ctx.lineWidth = 0.6 + magnitude * 1.8;
        const source = from[inp];
        const target = to[o];
        if (source === undefined || target === undefined) continue;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }
  }
  for (const column of positions) {
    for (const point of column) dot(ctx, point.x, point.y, 5, INK);
  }
}

function drawXorTruthTable(ctx: CanvasRenderingContext2D, best: Network | null, x: number, y: number, w: number, h: number): void {
  const cellW = w / 2;
  const cellH = h / 2;
  ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
  XOR_CASES.forEach(({ input, target }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx0 = x + col * cellW;
    const cy0 = y + row * cellH;
    const output = best?.feedForward(input)[0] ?? null;
    const correct = output !== null && Math.round(output) === target;
    ctx.fillStyle = output === null ? "rgba(28,27,23,0.08)" : correct ? "rgba(74,124,89,0.22)" : "rgba(201,161,90,0.22)";
    ctx.fillRect(cx0, cy0, cellW - 3, cellH - 3);
    ctx.strokeStyle = "rgba(28,27,23,0.3)";
    ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cellW - 3, cellH - 3);
    ctx.fillStyle = INK;
    ctx.fillText(`${input[0]},${input[1]} → ${output === null ? "?" : output.toFixed(2)}`, cx0 + 6, cy0 + cellH / 2 + 3);
  });
}

/**
 * Predator–prey: the live arms race in a single lens, and a CIAO plot inset —
 * the current champion predator scored against every ancestral prey champion.
 * A smooth gradient down the plot means genuine progress; banding means the
 * arms race is cycling (RESEARCH.md §4.5). Driven directly by
 * `CoevolutionSimulation`, not through {@link EnvironmentView}, since
 * co-evolution has two populations rather than one.
 */
export class PredatorPreyView {
  private readonly cx = LENS_CX;
  private readonly cy = 400;
  private readonly trail: { px: number; py: number; ex: number; ey: number }[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
  ) {}

  /** Empty arena shown before the first generation has produced a champion. */
  drawIdle(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, this.cx, this.cy, LENS_R);
    annotate(ctx, this.cx, this.cy, LENS_R, -0.55, "predator", MOSS);
    annotate(ctx, this.cx, this.cy, LENS_R, 0.55, "prey", AMBER);
    annotate(ctx, this.cx, this.cy, LENS_R, Math.PI - 0.5, "arena", INK);
  }

  /** Draws one animation frame: the live chase plus the accumulated CIAO plot. */
  draw(snapshot: PredatorPreySnapshot, ciao: readonly (readonly number[])[]): void {
    const { ctx, cx, cy } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, cx, cy, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - 14) * 2 * 0.92;
    const ox = cx - side / 2;
    const oy = cy - side / 2;

    this.trail.push({ px: snapshot.predator.x, py: snapshot.predator.y, ex: snapshot.prey.x, ey: snapshot.prey.y });
    if (this.trail.length > 30) this.trail.shift();
    this.trail.forEach((t, i) => {
      const alpha = (i / this.trail.length) * 0.35;
      dot(ctx, ox + t.px * side, oy + t.py * side, 2.5, `rgba(74,124,89,${alpha})`);
      dot(ctx, ox + t.ex * side, oy + t.ey * side, 2.5, `rgba(201,161,90,${alpha})`);
    });

    const captureRadiusPx = (PREDATOR_PREY_CAPTURE_RADIUS / PREDATOR_PREY_ARENA_SIZE) * side;
    const px = ox + snapshot.predator.x * side;
    const py = oy + snapshot.predator.y * side;
    const exx = ox + snapshot.prey.x * side;
    const eyy = oy + snapshot.prey.y * side;
    ctx.strokeStyle = "rgba(28,27,23,0.35)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(px, py, captureRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    inkAgent(ctx, px, py, snapshot.predator.heading, MOSS);
    inkAgent(ctx, exx, eyy, snapshot.prey.heading, AMBER);
    ctx.restore();

    annotate(ctx, cx, cy, LENS_R, -0.55, "predator", MOSS);
    annotate(ctx, cx, cy, LENS_R, 0.55, "prey", AMBER);
    annotate(ctx, cx, cy, LENS_R, Math.PI - 0.5, "arena", INK);
    this.drawCiao(ciao);
  }

  private drawCiao(ciao: readonly (readonly number[])[]): void {
    const { ctx } = this;
    drawInsetPanel(ctx, INSET_RECT.x, INSET_RECT.y, INSET_RECT.width, INSET_RECT.height, "fig. b — ciao");
    if (ciao.length === 0) return;
    const maxCells = 24;
    const rows = ciao.slice(-maxCells);
    const last = rows[rows.length - 1];
    if (last === undefined) return;
    const columns = Math.min(maxCells, last.length);
    const cellW = INSET_RECT.width / columns;
    const cellH = INSET_RECT.height / rows.length;
    for (let r = 0; r < rows.length; r++) {
      const row = (rows[r] as readonly number[]).slice(-columns);
      for (let c = 0; c < row.length; c++) {
        ctx.fillStyle = heatColor(row[c] as number);
        ctx.fillRect(INSET_RECT.x + c * cellW, INSET_RECT.y + r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }
}

/**
 * Maze: the same deceptive corridor run twice, side by side — objective
 * fitness on the left, Novelty Search on the right (PRD §10 Tier 2 #7). Driven
 * directly by a dedicated maze `Simulation`, since it advances two independent
 * populations rather than one.
 */
export class MazeDuoView {
  private readonly objCenter = { x: 400, y: 400 };
  private readonly novCenter = { x: 780, y: 400 };
  private readonly radius = 165;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: MazeEnvironment,
  ) {}

  draw(
    objSnapshot: MazeSnapshot | null,
    novSnapshot: MazeSnapshot | null,
    novArchive: readonly (readonly number[])[],
    objHistory: readonly PopulationStats[],
  ): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    const { grid, dimensions, goal } = this.environment;

    this.drawMazeLens(this.objCenter, grid, dimensions, goal, objSnapshot, MOSS, null, objSnapshot?.solved ?? false);
    this.drawMazeLens(this.novCenter, grid, dimensions, goal, novSnapshot, AMBER, novArchive, novSnapshot?.solved ?? false);

    ctx.fillStyle = INK;
    ctx.font = "600 11px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("OBJECTIVE", this.objCenter.x, this.objCenter.y - this.radius - 20);
    ctx.fillText("NOVELTY", this.novCenter.x, this.novCenter.y - this.radius - 20);
    ctx.textAlign = "left";

    drawInsetPanel(ctx, INSET_RECT.x, INSET_RECT.y, INSET_RECT.width, INSET_RECT.height, "fig. a — objective fitness");
    drawSparkline(
      ctx,
      INSET_RECT.x + 8,
      INSET_RECT.y + 8,
      INSET_RECT.width - 16,
      INSET_RECT.height - 16,
      objHistory.map((h) => h.best),
      objHistory.map((h) => h.average),
    );
  }

  private drawMazeLens(
    center: { x: number; y: number },
    walls: readonly (readonly boolean[])[],
    dims: { cols: number; rows: number },
    goal: { col: number; row: number },
    snapshot: MazeSnapshot | null,
    agentColor: string,
    scatter: readonly (readonly number[])[] | null,
    solved: boolean,
  ): void {
    const { ctx } = this;
    const { x: cx, y: cy } = center;
    const radius = this.radius;
    drawLens(ctx, cx, cy, radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 14, 0, Math.PI * 2);
    ctx.clip();
    const side = (radius - 14) * 2;
    const ox = cx - side / 2;
    const oy = cy - side / 2;
    const cellW = side / dims.cols;
    const cellH = side / dims.rows;

    ctx.fillStyle = "rgba(28,27,23,0.55)";
    for (let r = 0; r < dims.rows; r++) {
      const row = walls[r];
      if (row === undefined) continue;
      for (let c = 0; c < dims.cols; c++) {
        if (row[c] === true) ctx.fillRect(ox + c * cellW, oy + r * cellH, cellW + 0.6, cellH + 0.6);
      }
    }

    const gx = ox + (goal.col + 0.5) * cellW;
    const gy = oy + (goal.row + 0.5) * cellH;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gx, gy, 6, 0, Math.PI * 2);
    ctx.stroke();

    if (scatter !== null) {
      scatter.forEach((behaviour, i) => {
        const bx = behaviour[0] ?? 0;
        const by = behaviour[1] ?? 0;
        dot(ctx, ox + bx * side, oy + by * side, 2, `rgba(201,161,90,${0.15 + (i / scatter.length) * 0.4})`);
      });
    }
    if (snapshot !== null) {
      const px = ox + (snapshot.x / dims.cols) * side;
      const py = oy + (snapshot.y / dims.rows) * side;
      inkAgent(ctx, px, py, snapshot.heading, agentColor);
    }
    ctx.restore();

    if (solved) {
      ctx.fillStyle = INK;
      ctx.font = "600 11px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("SOLVED", cx, cy + radius - 16);
      ctx.textAlign = "left";
    }
  }
}

/**
 * MAP-Elites archive: the current best hopper animated live, and a heat map
 * over (stride length, duty factor) inset — the illuminated gallery of viable
 * gaits (PRD §10 Tier 2 #8; RESEARCH.md §3). Driven directly by
 * `MapElitesSimulation`.
 */
export class GaitArchiveView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly bins: number,
  ) {}

  draw(snapshot: GaitSnapshot | null, entries: readonly ArchiveEntry[]): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - 14, 0, Math.PI * 2);
    ctx.clip();
    const groundY = LENS_CY + 70;
    const pxPerUnit = 90;
    const snap = snapshot ?? { x: 0, y: 1, stance: false };
    ctx.strokeStyle = "rgba(28,27,23,0.3)";
    ctx.beginPath();
    ctx.moveTo(LENS_CX - LENS_R, groundY);
    ctx.lineTo(LENS_CX + LENS_R, groundY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(28,27,23,0.15)";
    for (let i = Math.floor(snap.x - 3); i <= Math.ceil(snap.x + 3); i++) {
      const tx = LENS_CX + (i - snap.x) * pxPerUnit;
      ctx.beginPath();
      ctx.moveTo(tx, groundY - 4);
      ctx.lineTo(tx, groundY + 4);
      ctx.stroke();
    }
    const bodyY = groundY - snap.y * pxPerUnit;
    if (snap.stance) {
      ctx.strokeStyle = MOSS;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(LENS_CX, bodyY);
      ctx.lineTo(LENS_CX, groundY);
      ctx.stroke();
    }
    dot(ctx, LENS_CX, bodyY, 7, snap.stance ? MOSS : AMBER);
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "hopper", MOSS);

    drawInsetPanel(
      ctx,
      INSET_RECT.x,
      INSET_RECT.y,
      INSET_RECT.width,
      INSET_RECT.height,
      "fig. b — archive (stride × duty)",
    );
    const cellW = INSET_RECT.width / this.bins;
    const cellH = INSET_RECT.height / this.bins;
    let maxFitness = 0;
    for (const entry of entries) maxFitness = Math.max(maxFitness, entry.genome.fitness);
    for (const entry of entries) {
      const t = maxFitness > 0 ? entry.genome.fitness / maxFitness : 0;
      const [r, g, b] = mix([247, 243, 232], [74, 124, 89], t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const strideBin = entry.cell[0] ?? 0;
      const dutyBin = entry.cell[1] ?? 0;
      ctx.fillRect(
        INSET_RECT.x + strideBin * cellW,
        INSET_RECT.y + (this.bins - 1 - dutyBin) * cellH,
        cellW + 0.5,
        cellH + 0.5,
      );
    }
  }
}

/** Precomputes the Rastrigin surface as a heat map into an offscreen canvas. */
function renderRastriginSurface(bounds: readonly [number, number]): HTMLCanvasElement {
  const size = 540;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D context unavailable");

  const image = ctx.createImageData(size, size);
  const [min, max] = bounds;
  // Rastrigin's approximate max over this domain, for normalisation.
  const peak = 80;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = min + (px / size) * (max - min);
      const y = max - (py / size) * (max - min);
      const t = Math.min(1, rastrigin([x, y]) / peak);
      const offset = (py * size + px) * 4;
      const [r, g, b] = mix([247, 243, 232], [201, 161, 90], t * 0.5);
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
