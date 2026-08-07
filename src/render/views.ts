import type { GenerationResult } from "../app/runner.js";
import type { PopulationStats } from "../core/stats.js";
import {
  CREAM,
  INK,
  MOSS,
  AMBER,
  INSET_RECT,
  LENS_CLIP_INSET,
  dot,
  inkAgent,
  annotate,
  drawLens,
  drawInsetPanel,
  drawSparkline,
  heatColor,
} from "./palette.js";
import {
  LENS_CX,
  LENS_CY,
  LENS_R,
  MAX_FITNESS_HISTORY,
  CRASH_MARKER_ROUNDS,
  CRASH_MARKER_RADIUS,
} from "./layout.js";
import { StringGenome } from "../genomes/stringGenome.js";
import { PermutationGenome } from "../genomes/permutationGenome.js";
import type { TspEnvironment } from "../environments/tsp.js";
import {
  PREDATOR_PREY_ARENA_SIZE,
  PREDATOR_PREY_CAPTURE_RADIUS,
  type PredatorPreySnapshot,
} from "../environments/predatorPrey.js";
import type { TrackRunnerEnvironment } from "../environments/trackrunner.js";
import type { MazeEnvironment } from "../environments/maze.js";

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

/**
 * `showWorst` adds a third rust-toned line tracking the population's worst
 * fitness each generation (Track Runner, Maze) — the other views' one-shot
 * fitness doesn't have an animated "worst" role to pair it with, so they
 * leave it off rather than plot a number nothing on screen corresponds to.
 */
function fitnessInset(
  ctx: CanvasRenderingContext2D,
  history: readonly PopulationStats[],
  caption = "fig. a — fitness",
  showWorst = false,
): void {
  drawInsetPanel(ctx, INSET_RECT.x, INSET_RECT.y, INSET_RECT.width, INSET_RECT.height, caption);
  drawSparkline(
    ctx,
    INSET_RECT.x + 8,
    INSET_RECT.y + 8,
    INSET_RECT.width - 16,
    INSET_RECT.height - 16,
    history.map((h) => h.best),
    history.map((h) => h.average),
    showWorst ? history.map((h) => h.worst) : undefined,
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
    if (this.history.length > MAX_FITNESS_HISTORY) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
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
    if (this.history.length > MAX_FITNESS_HISTORY) this.history.shift();
  }

  animate(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - LENS_CLIP_INSET) * 2 * 0.86;
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

/**
 * The three population members Track Runner and Maze animate together each
 * generation: the fittest, a middle-ranked member, and the least fit. Shown
 * together (not the champion alone) so the population's *spread* narrowing
 * over generations is visible, not just one lineage's score climbing
 * (ADR-018, `.docs/decisions.md`).
 */
export type Role = "champion" | "median" | "worst";

/** Each role's fixed colour, consistent across both round-paced plates. */
function roleColor(role: Role): string {
  if (role === "champion") return MOSS;
  if (role === "median") return AMBER;
  return "rgb(178,58,42)"; // "worst" — the same rust used for crash markers, since it's the most likely to end up there
}

/** The `rgba(...)` triple form of {@link roleColor}, for trails that need to fade with age. */
function roleTrailRgb(role: Role): string {
  if (role === "champion") return "74,124,89";
  if (role === "median") return "201,161,90";
  return "178,58,42";
}

/** One role's position/state for a single rendered frame. */
export interface TrackRunnerMemberFrame {
  readonly role: Role;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly trail: readonly { readonly x: number; readonly y: number }[];
}

/** Where a role's round ended, aged in rounds so the view can fade it out. */
export interface TrackRunnerCrashMarker {
  readonly x: number;
  readonly y: number;
  readonly roundsAgo: number;
}

/** Everything `TrackRunnerView.draw` needs for one frame — assembled by `TrackRunnerSimulation`. */
export interface TrackRunnerFrame {
  readonly members: readonly TrackRunnerMemberFrame[];
  readonly crashMarkers: readonly TrackRunnerCrashMarker[];
  readonly status: string;
  readonly history: readonly PopulationStats[];
}

/**
 * Track runner: the ring track and the current generation's three roles (see
 * {@link Role}), each driving one attempt per generation. A pure renderer: it
 * owns no episode or trail state itself — `TrackRunnerSimulation` advances
 * the roles and hands this class a finished {@link TrackRunnerFrame} to draw.
 * Past crashes persist as fading markers (see `draw`), so "what it got
 * wrong" stays visible while watching the population improve.
 */
export class TrackRunnerView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: TrackRunnerEnvironment,
  ) {}

  /** The empty track, shown before the first generation has run. */
  drawIdle(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - LENS_CLIP_INSET) * 2 * 0.94;
    this.drawTrack(LENS_CX - side / 2, LENS_CY - side / 2, side);
    ctx.restore();
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "champion · median · worst", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, "track", INK);
  }

  draw(frame: TrackRunnerFrame): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - LENS_CLIP_INSET) * 2 * 0.94;
    const ox = LENS_CX - side / 2;
    const oy = LENS_CY - side / 2;
    this.drawTrack(ox, oy, side);

    // Oldest crash markers first, so this round's fresh ones paint on top of
    // fading older ones rather than under them.
    [...frame.crashMarkers]
      .sort((a, b) => b.roundsAgo - a.roundsAgo)
      .forEach((marker) => {
        const alpha = 0.55 * (1 - marker.roundsAgo / (CRASH_MARKER_ROUNDS + 1));
        dot(ctx, ox + marker.x * side, oy + marker.y * side, CRASH_MARKER_RADIUS, `rgba(178,58,42,${alpha})`);
      });

    // Worst, then median, then champion — so the champion always paints on
    // top of the other two rather than being occluded by them.
    const drawOrder: readonly Role[] = ["worst", "median", "champion"];
    for (const role of drawOrder) {
      const member = frame.members.find((m) => m.role === role);
      if (member !== undefined) this.drawMember(ox, oy, side, member);
    }
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "champion · median · worst", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, frame.status, INK);
    fitnessInset(ctx, frame.history, "fig. a — fitness", true);
  }

  /** The ring itself: inner/outer walls and radial spokes, shared by idle and live frames. */
  private drawTrack(ox: number, oy: number, side: number): void {
    const { ctx } = this;
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
  }

  /** One role: a fading trail plus the car, coloured by {@link roleColor}. */
  private drawMember(ox: number, oy: number, side: number, member: TrackRunnerMemberFrame): void {
    const { ctx } = this;
    const trailRgb = roleTrailRgb(member.role);
    const trailAlpha = member.role === "champion" ? 0.4 : 0.25;
    member.trail.forEach((t, i) => {
      const alpha = (i / member.trail.length) * trailAlpha;
      dot(ctx, ox + t.x * side, oy + t.y * side, 1.8, `rgba(${trailRgb},${alpha})`);
    });
    inkAgent(ctx, ox + member.x * side, oy + member.y * side, member.heading, roleColor(member.role));
  }
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
  /** Deliberately not `LENS_CY` (380): this plate's lens sits lower, leaving room for the CIAO inset caption above the trail. */
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
    ctx.arc(cx, cy, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - LENS_CLIP_INSET) * 2 * 0.92;
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

/** One role's position/state for a single rendered frame. */
export interface MazeMemberFrame {
  readonly role: Role;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly trail: readonly { readonly x: number; readonly y: number }[];
}

/** Where a role crashed into a wall, aged in rounds so the view can fade it out. */
export interface MazeCrashMarker {
  readonly x: number;
  readonly y: number;
  readonly roundsAgo: number;
}

/** Everything `MazeView.draw` needs for one frame — assembled by `MazeSimulation`. */
export interface MazeFrame {
  readonly members: readonly MazeMemberFrame[];
  readonly crashMarkers: readonly MazeCrashMarker[];
  readonly status: string;
  readonly history: readonly PopulationStats[];
}

/**
 * Maze: the deceptive corridor (PRD §10 Tier 2 #7), run under an ordinary
 * objective GA. Watches the current generation's three roles (see
 * {@link Role}) each run the maze once per generation — a pure renderer,
 * driven directly by `MazeSimulation`. Past crashes persist as fading
 * markers (see `draw`), so "what it got wrong" stays visible while watching
 * the population improve.
 *
 * `NoveltySearch` also runs on this identical maze as a genuine second
 * selection paradigm (`--study maze-deception`), but is not part of the
 * on-screen demo (ADR-016, `.docs/decisions.md`).
 */
export class MazeView {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly width: number,
    private readonly height: number,
    private readonly environment: MazeEnvironment,
  ) {}

  /** The empty maze, shown before the first generation has run. */
  drawIdle(): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    const side = (LENS_R - LENS_CLIP_INSET) * 2;
    this.drawMaze(LENS_CX - side / 2, LENS_CY - side / 2, side, [], []);
    ctx.restore();
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "champion · median · worst", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, "maze", INK);
  }

  draw(frame: MazeFrame): void {
    const { ctx } = this;
    clearPlate(ctx, this.width, this.height);
    drawLens(ctx, LENS_CX, LENS_CY, LENS_R);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R - LENS_CLIP_INSET, 0, Math.PI * 2);
    ctx.clip();
    const side = (LENS_R - LENS_CLIP_INSET) * 2;
    this.drawMaze(LENS_CX - side / 2, LENS_CY - side / 2, side, frame.members, frame.crashMarkers);
    ctx.restore();

    annotate(ctx, LENS_CX, LENS_CY, LENS_R, Math.PI / 2, "champion · median · worst", MOSS);
    annotate(ctx, LENS_CX, LENS_CY, LENS_R, -Math.PI / 2, frame.status, INK);
    fitnessInset(ctx, frame.history, "fig. a — objective fitness", true);
  }

  private drawMaze(
    ox: number,
    oy: number,
    side: number,
    members: readonly MazeMemberFrame[],
    crashMarkers: readonly MazeCrashMarker[],
  ): void {
    const { ctx } = this;
    const { grid: walls, dimensions: dims, goal } = this.environment;
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

    // Oldest crash markers first, so this round's fresh ones paint on top.
    [...crashMarkers]
      .sort((a, b) => b.roundsAgo - a.roundsAgo)
      .forEach((marker) => {
        const alpha = 0.55 * (1 - marker.roundsAgo / (CRASH_MARKER_ROUNDS + 1));
        dot(ctx, ox + (marker.x / dims.cols) * side, oy + (marker.y / dims.rows) * side, CRASH_MARKER_RADIUS, `rgba(178,58,42,${alpha})`);
      });

    // Worst, then median, then champion — so the champion always paints on
    // top of the other two rather than being occluded by them.
    const drawOrder: readonly Role[] = ["worst", "median", "champion"];
    for (const role of drawOrder) {
      const member = members.find((m) => m.role === role);
      if (member === undefined) continue;
      member.trail.forEach((t, i) => {
        const alpha = (i / member.trail.length) * (member.role === "champion" ? 0.45 : 0.28);
        dot(ctx, ox + (t.x / dims.cols) * side, oy + (t.y / dims.rows) * side, 1.8, `rgba(${roleTrailRgb(member.role)},${alpha})`);
      });
      const px = ox + (member.x / dims.cols) * side;
      const py = oy + (member.y / dims.rows) * side;
      inkAgent(ctx, px, py, member.heading, roleColor(member.role));
    }
  }
}
