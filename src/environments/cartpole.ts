import type { Environment } from "./Environment.js";
import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";

/** Physical constants of the classic cart-pole system (Barto–Sutton). */
const GRAVITY = 9.8;
const CART_MASS = 1.0;
const POLE_MASS = 0.1;
const TOTAL_MASS = CART_MASS + POLE_MASS;
const POLE_HALF_LENGTH = 0.5;
const POLE_MASS_LENGTH = POLE_MASS * POLE_HALF_LENGTH;
const FORCE_MAGNITUDE = 10.0;
const TIME_STEP = 0.02;

/** Failure thresholds (PRD §10): pole beyond 15°, or cart off the track. */
const ANGLE_LIMIT_RADIANS = (15 * Math.PI) / 180;
const TRACK_LIMIT = 2.4;

/** The mutable state of one cart-pole episode. */
interface CartPoleState {
  position: number;
  velocity: number;
  angle: number;
  angularVelocity: number;
}

/** A starting configuration a controller must recover from. */
type InitialCondition = Readonly<CartPoleState>;

/** Read-only view of the cart-pole for rendering. */
export interface CartPoleSnapshot {
  readonly position: number;
  readonly angle: number;
}

/** A cart-pole episode advanced one tick at a time, for live animation. */
export interface LiveCartPoleEpisode {
  readonly snapshot: CartPoleSnapshot;
  /** Advances one tick; returns `false` once the pole has fallen. */
  step(): boolean;
}

/**
 * The cart-pole environment (PRD §10, Tier 1 #5): balance an inverted pendulum
 * by pushing a cart left or right. The first *episodic* environment — the genome
 * is consulted every simulation tick and reward accumulates over time (PRD §5).
 *
 * Inputs are the normalised state `[position, velocity, angle, angularVelocity]`;
 * the single tanh output in (-1, 1) is scaled to a horizontal force. Fitness is
 * the number of frames the pole stays upright — a pure progress term (PRD §6).
 *
 * Evaluation is deterministic (fixed initial state), so a run is reproducible
 * and every genome in a generation faces identical conditions.
 */
export class CartPoleEnvironment implements Environment {
  private readonly networkConfig: NetworkConfig;
  /** Fixed initial conditions, shared by every genome for fair comparison (PRD §5). */
  private readonly conditions: readonly InitialCondition[];

  constructor(
    private readonly maxSteps: number,
    hiddenSize: number,
    trials: number,
    private readonly rng: Rng,
  ) {
    if (maxSteps <= 0) {
      throw new RangeError(`maxSteps must be positive, got ${maxSteps}`);
    }
    if (hiddenSize <= 0) {
      throw new RangeError(`hiddenSize must be positive, got ${hiddenSize}`);
    }
    if (trials <= 0) {
      throw new RangeError(`trials must be positive, got ${trials}`);
    }
    this.networkConfig = {
      layerSizes: [4, hiddenSize, 1],
      initStdDev: 1,
      mutationStdDev: 0.3,
      outputActivation: "tanh",
    };
    // Draw the initial conditions once, deterministically, so evaluation is
    // reproducible and every genome faces the same varied, non-trivial starts.
    this.conditions = Array.from({ length: trials }, () => ({
      position: (rng.next() - 0.5) * 0.2,
      velocity: (rng.next() - 0.5) * 1.0,
      angle: (rng.next() - 0.5) * 0.2,
      angularVelocity: (rng.next() - 0.5) * 1.0,
    }));
  }

  /** The best possible fitness: surviving every trial's full episode. */
  get maxFitness(): number {
    return this.maxSteps * this.conditions.length;
  }

  newPopulation(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  evaluate(genome: Genome): number {
    if (!(genome instanceof Network)) {
      throw new TypeError("CartPoleEnvironment can only evaluate a Network");
    }
    let totalFrames = 0;
    for (const condition of this.conditions) {
      totalFrames += this.runTrial(genome, condition);
    }
    return totalFrames;
  }

  /**
   * Runs one episode from a chosen initial condition, invoking `onStep` with
   * each state so a renderer can draw the live trajectory. Returns frames
   * survived. Physics is identical to {@link evaluate}.
   */
  runEpisode(
    network: Network,
    onStep: (state: Readonly<CartPoleState>) => void,
    conditionIndex = 0,
  ): number {
    const condition = this.conditions[conditionIndex % this.conditions.length] as InitialCondition;
    return this.runTrial(network, condition, onStep);
  }

  /**
   * Creates an episode that a renderer advances one tick per frame, so the best
   * controller can be animated live. The physics matches {@link evaluate}.
   */
  createEpisode(network: Network, conditionIndex = 0): LiveCartPoleEpisode {
    const condition = this.conditions[conditionIndex % this.conditions.length] as InitialCondition;
    const state: CartPoleState = { ...condition };
    let alive = true;
    return {
      snapshot: {
        get position() {
          return state.position;
        },
        get angle() {
          return state.angle;
        },
      },
      step: (): boolean => {
        if (!alive) return false;
        const output = network.feedForward(observe(state))[0] as number;
        advance(state, output * FORCE_MAGNITUDE);
        alive = !hasFailed(state);
        return alive;
      },
    };
  }

  private runTrial(
    network: Network,
    condition: InitialCondition,
    onStep?: (state: Readonly<CartPoleState>) => void,
  ): number {
    const state: CartPoleState = { ...condition };
    let frames = 0;
    for (let step = 0; step < this.maxSteps; step++) {
      const output = network.feedForward(observe(state))[0] as number;
      advance(state, output * FORCE_MAGNITUDE);
      onStep?.(state);
      if (hasFailed(state)) {
        break;
      }
      frames++;
    }
    return frames;
  }
}

/** Track half-width, exposed for rendering. */
export const CART_POLE_TRACK_LIMIT = TRACK_LIMIT;

/** Normalised observation fed to the network. */
function observe(state: CartPoleState): readonly number[] {
  return [
    state.position / TRACK_LIMIT,
    state.velocity / 3,
    state.angle / ANGLE_LIMIT_RADIANS,
    state.angularVelocity / 3,
  ];
}

/** Advances the physics one timestep under the applied horizontal force (Euler). */
function advance(state: CartPoleState, force: number): void {
  const cosAngle = Math.cos(state.angle);
  const sinAngle = Math.sin(state.angle);

  const temp =
    (force + POLE_MASS_LENGTH * state.angularVelocity * state.angularVelocity * sinAngle) / TOTAL_MASS;
  const angularAcceleration =
    (GRAVITY * sinAngle - cosAngle * temp) /
    (POLE_HALF_LENGTH * (4 / 3 - (POLE_MASS * cosAngle * cosAngle) / TOTAL_MASS));
  const acceleration = temp - (POLE_MASS_LENGTH * angularAcceleration * cosAngle) / TOTAL_MASS;

  state.position += TIME_STEP * state.velocity;
  state.velocity += TIME_STEP * acceleration;
  state.angle += TIME_STEP * state.angularVelocity;
  state.angularVelocity += TIME_STEP * angularAcceleration;
}

function hasFailed(state: CartPoleState): boolean {
  return Math.abs(state.position) > TRACK_LIMIT || Math.abs(state.angle) > ANGLE_LIMIT_RADIANS;
}
