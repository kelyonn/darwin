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
 * Two traps, at the two points on the true path where the correct move
 * requires turning *away* from the goal's row (Lehman & Stanley, 2011, §2). At
 * each, a proximity-following search is lured downward into row 8 — which
 * keeps reducing distance to the goal for a couple of cells before
 * dead-ending, and (since a wrong move now ends the episode) genuinely costs
 * the episode — instead of turning the correct way. A single trap plus
 * bump-and-continue collision was measured to be *no* obstacle at all: random,
 * untrained genomes solved the maze at generation one regardless of trap count
 * or goal radius, because a blocked step cost nothing and the agent could just
 * keep re-steering indefinitely. Two traps plus ending the episode on wall
 * contact together make gen-1 luck fail on most seeds and give the objective
 * population a real multi-generation learning curve to climb (see the class
 * doc above for what this now demonstrates) — but do not make objective fail
 * outright; a 150-genome population still reliably finds the route within a
 * handful of generations. This is documented as a deliberate, measured
 * trade-off, not a shortfall (`.docs/known-issues.md`).
 *
 * Row 8 cells are only ever opened here, at columns that are not already a
 * `CONNECTORS` cell (2 and 6 are — opening their row-8 neighbour would bridge
 * straight into the live corridor above instead of dead-ending).
 */
const DEAD_END: readonly (readonly [number, number])[] = [
  [3, 8],
  [4, 8],
  [7, 8],
  [8, 8],
];
const START_CELL = { col: 1, row: 1 } as const;
const GOAL_CELL = { col: 9, row: 7 } as const;

const SENSOR_ANGLES = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2] as const;
const SENSOR_RANGE = 4;
const SENSOR_STEP = 0.15;
const MAX_SPEED = 0.15;
const MAX_TURN = 0.3;
/**
 * The true path is ~38 units long at `MAX_SPEED`; this gives a real solve room
 * to complete (~1.7×) rather than being razor-tight, so a champion that has
 * genuinely learned the path can be watched finishing it, not just approaching
 * the wire.
 */
const EPISODE_STEPS = 400;
/** Distance (in cells) from the goal centre that counts as solved. */
const GOAL_RADIUS = 0.2;

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
 * walls through five rangefinders and must reach the goal; hitting a wall ends
 * the episode there, so a wrong turn is a real, fatal mistake, not a bump.
 *
 * Both search paradigms genuinely, constructively solve this maze — that is the
 * verified, honest behaviour, not "objective fails" (measured across seeds; see
 * `.docs/known-issues.md` for the full trace and the two earlier designs that
 * didn't hold up). **Novelty Search** solves immediately: it ignores the goal
 * entirely and is never tempted by the dead ends, so it reaches the goal by
 * exploration alone from generation one. **Objective GA** has to *learn* to
 * avoid two dead-end branches that reduce straight-line distance to the goal
 * faster than the true corridor does — genuinely tempting, not just nearby —
 * and typically climbs from zero to a solved route within a handful of
 * generations of real evolutionary refinement. The contrast on display is
 * *immediate exploration versus a few generations of learning*, not solve
 * versus stall — still a legitimate demonstration of the two paradigms
 * behaving differently on an identical deceptive landscape.
 *
 * The same environment serves both searches. `evaluate` always writes the final
 * position as the genome's `behaviour` (used by Novelty Search) and returns the
 * objective proximity (used by the plain GA). The maze is guaranteed solvable
 * (asserted by test, BFS over the wall grid).
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
      const alive = this.advance(genome, state);
      if (!alive || this.distanceToGoal(state) < GOAL_RADIUS) {
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
    let crashed = false;
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
        if (solved || crashed) return false;
        const alive = this.advance(network, state);
        if (!alive) {
          crashed = true;
          return false;
        }
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

  /**
   * Advances one tick. Returns `false` if the move would enter a wall, in
   * which case the episode ends there — a wrong turn is a real, fatal mistake,
   * not a harmless bump. (An earlier version blocked movement instead of
   * ending the episode; that let even undirected random networks eventually
   * shuffle through the whole corridor within the episode budget, since
   * re-steering after a blocked step cost nothing — measured directly: gen-1
   * random genomes solved the maze regardless of trap count or goal radius.
   * Real consequence for a wrong turn is what actually fixes that.)
   */
  private advance(network: Network, state: AgentState): boolean {
    const output = network.feedForward(this.sense(state));
    const turn = clampUnit(output[0] as number) * MAX_TURN;
    const throttle = 0.5 * (clampUnit(output[1] as number) + 1);

    state.heading = normalizeAngle(state.heading + turn);
    const speed = MAX_SPEED * throttle;
    const nextX = state.x + Math.cos(state.heading) * speed;
    const nextY = state.y + Math.sin(state.heading) * speed;
    if (this.isWall(nextX, nextY)) {
      return false;
    }
    state.x = nextX;
    state.y = nextY;
    return true;
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
  // Facing down column 1 — the true path's first leg.
  return { x: START_CELL.col + 0.5, y: START_CELL.row + 0.5, heading: Math.PI / 2 };
}

/**
 * Builds the serpentine wall grid: odd-column corridors joined by connectors,
 * plus the deceptive dead end (`DEAD_END`) branching off the true path.
 */
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
