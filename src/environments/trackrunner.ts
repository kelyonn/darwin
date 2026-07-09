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
const EPISODE_STEPS = 500;
/** Ring divided into this many checkpoints; each is worth `CHECKPOINT_REWARD`. */
const CHECKPOINTS = 16;
const CHECKPOINT_REWARD = 5;
const SECTOR_ANGLE = (2 * Math.PI) / CHECKPOINTS;

/** Mutable state of the car during an episode. */
interface CarState {
  x: number;
  y: number;
  heading: number;
  /** Signed angular travel around the centre, accumulated across ticks. */
  angleAccumulated: number;
  distance: number;
  previousAngle: number;
}

/** Read-only view of the car for rendering. */
export interface CarSnapshot {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly sensors: readonly number[];
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

  /** Creates an episode a renderer advances one tick per frame. */
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
    angleAccumulated: 0,
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
  state.angleAccumulated += normalizeAngle(angle - state.previousAngle);
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
  const checkpoints = Math.floor(Math.abs(state.angleAccumulated) / SECTOR_ANGLE);
  return checkpoints * CHECKPOINT_REWARD + state.distance;
}

function onTrack(x: number, y: number): boolean {
  const radius = Math.hypot(x - CENTER, y - CENTER);
  return radius > INNER_RADIUS && radius < OUTER_RADIUS;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
