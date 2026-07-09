import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";

const COLS = 11;
const ROWS = 9;
/** Odd columns are vertical corridors; these even cells connect them. */
const CONNECTORS: readonly (readonly [number, number])[] = [
  [2, 7],
  [4, 1],
  [6, 7],
  [8, 1],
];
/**
 * A dead-end pocket one row past the first connector: in straight-line distance
 * to the goal it looks *better* than continuing on the true path (it sits closer
 * to the goal's row), but column 3 stays walled off here, so it goes nowhere.
 * This is the deception (Lehman & Stanley, 2011, §2): objective fitness rewards
 * entering it, and there is no way out but backtracking.
 */
const DEAD_END: readonly (readonly [number, number])[] = [
  [1, 8],
  [2, 8],
];
const START_CELL = { col: 1, row: 1 } as const;
const GOAL_CELL = { col: 9, row: 7 } as const;

const SENSOR_ANGLES = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2] as const;
const SENSOR_RANGE = 4;
const SENSOR_STEP = 0.15;
const MAX_SPEED = 0.15;
const MAX_TURN = 0.3;
/** Tight relative to the true path length (~38 units at `MAX_SPEED`). */
const EPISODE_STEPS = 260;
/** Distance (in cells) from the goal centre that counts as solved. */
const GOAL_RADIUS = 0.6;

interface AgentState {
  x: number;
  y: number;
  heading: number;
}

/** Read-only view of a maze run for rendering. */
export interface MazeSnapshot {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly solved: boolean;
}

/** A maze run advanced one tick at a time. */
export interface LiveMazeEpisode {
  readonly snapshot: MazeSnapshot;
  /** Advances one tick; returns `false` once the goal is reached. */
  step(): boolean;
}

/**
 * A deceptive maze (PRD §10 Tier 2 #7; Lehman & Stanley, 2011). The agent senses
 * walls through five rangefinders and must reach the goal. Objective fitness —
 * proximity to the goal — is *deceptive*: the corridor first leads away from the
 * goal, so a greedy objective walks into a wall and stalls. Novelty Search, which
 * ignores the goal and rewards visiting new places, escapes the trap.
 *
 * The same environment serves both searches. `evaluate` always writes the final
 * position as the genome's `behaviour` (used by Novelty Search) and returns the
 * objective proximity (used by the plain GA). The walls form one serpentine
 * corridor, so the maze is guaranteed solvable (asserted by test).
 */
export class MazeEnvironment implements Environment {
  private readonly networkConfig: NetworkConfig;
  private readonly walls: readonly (readonly boolean[])[];

  constructor(hiddenSize: number, private readonly rng: Rng) {
    if (hiddenSize <= 0) {
      throw new RangeError(`hiddenSize must be positive, got ${hiddenSize}`);
    }
    this.networkConfig = {
      layerSizes: [SENSOR_ANGLES.length, hiddenSize, 2],
      initStdDev: 1,
      mutationStdDev: 0.3,
      outputActivation: "tanh",
    };
    this.walls = buildWalls();
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof Network)) {
      throw new TypeError("MazeEnvironment can only evaluate a Network");
    }
    const state = startingAgent();
    for (let step = 0; step < EPISODE_STEPS; step++) {
      this.advance(genome, state);
      if (this.distanceToGoal(state) < GOAL_RADIUS) {
        break;
      }
    }
    // Behaviour = final position (normalised), for Novelty Search.
    genome.behaviour = [state.x / COLS, state.y / ROWS];
    return 1 / (1 + this.distanceToGoal(state));
  }

  /** Creates an episode a renderer advances one tick per frame. */
  createEpisode(network: Network): LiveMazeEpisode {
    const state = startingAgent();
    let solved = false;
    return {
      snapshot: {
        get x() {
          return state.x;
        },
        get y() {
          return state.y;
        },
        get heading() {
          return state.heading;
        },
        get solved() {
          return solved;
        },
      },
      step: (): boolean => {
        if (solved) return false;
        this.advance(network, state);
        solved = this.distanceToGoal(state) < GOAL_RADIUS;
        return !solved;
      },
    };
  }

  /** The wall grid, for rendering (`walls[row][col]`). */
  get grid(): readonly (readonly boolean[])[] {
    return this.walls;
  }

  get dimensions(): { cols: number; rows: number } {
    return { cols: COLS, rows: ROWS };
  }

  get start(): { col: number; row: number } {
    return START_CELL;
  }

  get goal(): { col: number; row: number } {
    return GOAL_CELL;
  }

  private advance(network: Network, state: AgentState): void {
    const output = network.feedForward(this.sense(state));
    const turn = clampUnit(output[0] as number) * MAX_TURN;
    const throttle = 0.5 * (clampUnit(output[1] as number) + 1);

    state.heading = normalizeAngle(state.heading + turn);
    const speed = MAX_SPEED * throttle;
    const nextX = state.x + Math.cos(state.heading) * speed;
    const nextY = state.y + Math.sin(state.heading) * speed;
    // Block movement into walls rather than sliding — simplest stable collision.
    if (!this.isWall(nextX, nextY)) {
      state.x = nextX;
      state.y = nextY;
    }
  }

  private sense(state: AgentState): number[] {
    return SENSOR_ANGLES.map((offset) => {
      const rayAngle = state.heading + offset;
      const dx = Math.cos(rayAngle) * SENSOR_STEP;
      const dy = Math.sin(rayAngle) * SENSOR_STEP;
      let x = state.x;
      let y = state.y;
      for (let distance = 0; distance < SENSOR_RANGE; distance += SENSOR_STEP) {
        x += dx;
        y += dy;
        if (this.isWall(x, y)) {
          return distance / SENSOR_RANGE;
        }
      }
      return 1;
    });
  }

  private distanceToGoal(state: AgentState): number {
    return Math.hypot(state.x - (GOAL_CELL.col + 0.5), state.y - (GOAL_CELL.row + 0.5));
  }

  private isWall(x: number, y: number): boolean {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
      return true;
    }
    return (this.walls[row] as readonly boolean[])[col] as boolean;
  }
}

function startingAgent(): AgentState {
  return { x: START_CELL.col + 0.5, y: START_CELL.row + 0.5, heading: Math.PI / 2 };
}

/** Builds the serpentine wall grid: odd-column corridors joined by connectors. */
function buildWalls(): boolean[][] {
  const walls: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(true));
  const open = (col: number, row: number): void => {
    (walls[row] as boolean[])[col] = false;
  };
  for (let col = 1; col < COLS - 1; col += 2) {
    for (let row = 1; row <= ROWS - 2; row++) {
      open(col, row);
    }
  }
  for (const [col, row] of CONNECTORS) {
    open(col, row);
  }
  for (const [col, row] of DEAD_END) {
    open(col, row);
  }
  return walls;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
