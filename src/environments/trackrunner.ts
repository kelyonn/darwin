import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";

/** The track is a ring between two radii, centred in the unit square. */
const CENTER = 0.5;
const INNER_RADIUS = 0.2;
const OUTER_RADIUS = 0.42;
/** Sensor ray directions relative to the car's heading. */
const SENSOR_ANGLES = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2] as const;
/** Maximum rangefinder distance (normalised units); rays march in these steps. */
const SENSOR_RANGE = 0.5;
const SENSOR_STEP = 0.006;
/** Per-tick travel at full throttle, and maximum heading change per tick. */
const MAX_SPEED = 0.01;
const MAX_TURN = 0.18;
/** The budget `evaluate` scores an episode against — exported so the render layer's live-replay cap can match it exactly rather than duplicating the number (see `createEpisode`'s doc). */
export const EPISODE_STEPS = 500;
/** Ring divided into this many checkpoints; each is worth `CHECKPOINT_REWARD`. */
export const CHECKPOINTS = 16;
export const CHECKPOINT_REWARD = 5;
const SECTOR_ANGLE = (2 * Math.PI) / CHECKPOINTS;
const MID_RADIUS = (INNER_RADIUS + OUTER_RADIUS) / 2;
const HALF_WIDTH = (OUTER_RADIUS - INNER_RADIUS) / 2;

/** Mutable state of the car during an episode. */
interface CarState {
  x: number;
  y: number;
  heading: number;
  /**
   * Angular travel around the centre, accumulated across ticks and weighted by
   * how far from the inner wall the car was at each tick (see `fitnessOf`).
   * Not a raw angle — the weighting is what makes this fair.
   */
  weightedAngle: number;
  distance: number;
  previousAngle: number;
}

/** Read-only view of the car for rendering. */
export interface CarSnapshot {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly sensors: readonly number[];
  /**
   * Laps completed so far, as a continuous value (not floored) — the same
   * radius-weighted angle `fitnessOf`'s `checkpoints` term scores, expressed
   * as full turns (`weightedAngle / 2π`) instead of discrete checkpoint
   * sectors, so the display and the score agree by construction rather than
   * by a re-derived approximation.
   */
  readonly laps: number;
}

/** An episode advanced one tick at a time, for live animation. */
export interface LiveTrackEpisode {
  readonly snapshot: CarSnapshot;
  /** Advances one tick; returns `false` once the car leaves the track. */
  step(): boolean;
}

/**
 * The track-runner environment (PRD §10 Tier 1 #6): a car perceives the world
 * through five rangefinder sensors and learns to drive a closed loop without
 * hitting a wall. Episodic (PRD §5): the network is consulted every tick.
 *
 * Fitness is progress-led per the shaping rulebook (PRD §6):
 * `checkpoints · K + distance_travelled`, where a large per-checkpoint reward
 * dominates raw distance so the car is driven to make real progress around the
 * ring rather than idle or wall-hug. The car dies on wall contact.
 *
 * Checkpoint progress is *radius-weighted*: naive angle tracking is exploitable
 * — a smaller radius means a smaller circumference, so hugging the inner wall
 * completes more sectors per unit of the fixed distance/time budget than
 * genuinely driving the track (measured: the population reliably converges on
 * exactly this exploit and plateaus at the resulting fitness ceiling). A
 * *monotonic* weight (reward growing with radius) only moves the exploit to the
 * outer wall instead — also measured, not assumed. The weight below peaks at
 * the track's midline and falls off toward both walls, so there is no boundary
 * left to hug and the rewarded strategy is a genuine lap along the centre line.
 */
export class TrackRunnerEnvironment implements Environment {
  private readonly networkConfig: NetworkConfig;

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
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof Network)) {
      throw new TypeError("TrackRunnerEnvironment can only evaluate a Network");
    }
    const state = startingCar();
    for (let step = 0; step < EPISODE_STEPS; step++) {
      if (!advanceCar(genome, state)) {
        break;
      }
    }
    return fitnessOf(state);
  }

  /**
   * Creates an episode a renderer advances one tick per frame. Ends on wall
   * contact; otherwise runs indefinitely (unlike `evaluate`, which stops at
   * `EPISODE_STEPS`) — deliberately, so a caller that wants more runway than
   * the scoring budget (a test checking whether a policy would *eventually*
   * survive longer, say) can just keep calling `step`. Callers that want a
   * live replay bounded to what was actually scored — the render layer, so a
   * flawless champion doesn't lock the view on itself forever — enforce that
   * cap themselves (see `TrackRunnerView` in `render/views.ts`).
   */
  createEpisode(network: Network): LiveTrackEpisode {
    const state = startingCar();
    let alive = true;
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
        get sensors() {
          return senseWalls(state);
        },
        get laps() {
          return Math.abs(state.weightedAngle) / (2 * Math.PI);
        },
      },
      step: (): boolean => {
        if (!alive) return false;
        alive = advanceCar(network, state);
        return alive;
      },
    };
  }

  /** Track geometry, exposed for rendering. */
  get geometry(): { center: number; innerRadius: number; outerRadius: number } {
    return { center: CENTER, innerRadius: INNER_RADIUS, outerRadius: OUTER_RADIUS };
  }
}

function startingCar(): CarState {
  // Start on the ring's centre-line at the rightmost point, heading "up" so the
  // car runs counter-clockwise along the track.
  const radius = (INNER_RADIUS + OUTER_RADIUS) / 2;
  return {
    x: CENTER + radius,
    y: CENTER,
    heading: -Math.PI / 2,
    weightedAngle: 0,
    distance: 0,
    previousAngle: 0,
  };
}

/** Advances the car one tick; returns `false` if it has left the track. */
function advanceCar(network: Network, state: CarState): boolean {
  const output = network.feedForward(senseWalls(state));
  const steer = clampUnit(output[0] as number) * MAX_TURN;
  const throttle = 0.5 * (clampUnit(output[1] as number) + 1);

  state.heading = normalizeAngle(state.heading + steer);
  const speed = MAX_SPEED * throttle;
  state.x += Math.cos(state.heading) * speed;
  state.y += Math.sin(state.heading) * speed;
  state.distance += speed;

  const angle = Math.atan2(state.y - CENTER, state.x - CENTER);
  const radiusNow = Math.hypot(state.x - CENTER, state.y - CENTER);
  // Tent-shaped weight: 1 at the midline, 0 at either wall. A monotonic weight
  // (just distance from one wall) only relocates the exploit to the opposite
  // wall — measured, not assumed (see the class doc above). Peaking at the
  // midline and falling off toward both boundaries leaves no wall worth hugging.
  const radiusFactor = clamp01(1 - Math.abs(radiusNow - MID_RADIUS) / HALF_WIDTH);
  state.weightedAngle += radiusFactor * normalizeAngle(angle - state.previousAngle);
  state.previousAngle = angle;

  return onTrack(state.x, state.y);
}

/** Five rangefinder readings in [0, 1] (1 = nothing within range). */
function senseWalls(state: CarState): number[] {
  return SENSOR_ANGLES.map((offset) => {
    const rayAngle = state.heading + offset;
    const dx = Math.cos(rayAngle) * SENSOR_STEP;
    const dy = Math.sin(rayAngle) * SENSOR_STEP;
    let x = state.x;
    let y = state.y;
    for (let distance = 0; distance < SENSOR_RANGE; distance += SENSOR_STEP) {
      x += dx;
      y += dy;
      if (!onTrack(x, y)) {
        return distance / SENSOR_RANGE;
      }
    }
    return 1;
  });
}

function fitnessOf(state: CarState): number {
  const checkpoints = Math.floor(Math.abs(state.weightedAngle) / SECTOR_ANGLE);
  return checkpoints * CHECKPOINT_REWARD + state.distance;
}

function onTrack(x: number, y: number): boolean {
  const radius = Math.hypot(x - CENTER, y - CENTER);
  return radius > INNER_RADIUS && radius < OUTER_RADIUS;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
