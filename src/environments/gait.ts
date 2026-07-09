import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";

/**
 * Deliberately minimal hand-written physics (PRD §1: no physics library) — a
 * single point-mass body on one spring leg, not a rigid-body/collision engine.
 * This is scoped tightly on purpose: a full 2-D hinge-and-collision simulator is
 * a well-known time sink for a project whose thesis is about the *search*, not
 * the physics (see .docs/known-issues.md).
 */
const GRAVITY = -9.8;
const REST_LEG_LENGTH = 1.0;
const LEG_STIFFNESS = 900;
const TIME_STEP = 0.01;
const EPISODE_STEPS = 400;
/** Ground contact is lost once the leg stretches beyond this multiple of rest length. */
const MAX_LEG_STRETCH = 1.05;
/** The body has fallen if it drops below this height. */
const FALL_HEIGHT = 0.3;

interface CreatureState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** True while the leg is in ground contact (stance phase). */
  stance: boolean;
  /** Ticks spent in stance during the current cycle, for the duty-factor descriptor. */
  stanceTicks: number;
  totalTicks: number;
  lastTouchdownX: number;
  strides: number[];
}

/** Read-only view of the creature for rendering. */
export interface GaitSnapshot {
  readonly x: number;
  readonly y: number;
  readonly stance: boolean;
}

/** A gait run advanced one tick at a time. */
export interface LiveGaitEpisode {
  readonly snapshot: GaitSnapshot;
  /** Advances one tick; returns `false` once the creature has fallen. */
  step(): boolean;
}

/**
 * The gait environment (PRD §10 Tier 2 #8; Mouret & Clune, 2015). A one-legged
 * hopper is controlled by a network that, every tick, chooses a leg push
 * (thrust while in stance) and a touchdown angle (horizontal aim for the next
 * landing). There is no fixed objective search here — see `mapElites.ts` — this
 * environment only defines the body and the behaviour descriptors it exposes:
 * *stride length* and *duty factor* (fraction of time in stance), the two axes
 * MAP-Elites indexes to illuminate the space of viable gaits.
 *
 * Fitness (used only to rank *within* a cell) is horizontal distance travelled
 * before falling — progress-led, guarded per PRD §6.
 */
export class GaitEnvironment {
  private readonly networkConfig: NetworkConfig;

  constructor(hiddenSize: number, private readonly rng: Rng) {
    if (hiddenSize <= 0) {
      throw new RangeError(`hiddenSize must be positive, got ${hiddenSize}`);
    }
    this.networkConfig = {
      layerSizes: [3, hiddenSize, 2],
      initStdDev: 1,
      mutationStdDev: 0.3,
      outputActivation: "tanh",
    };
  }

  spawn = (): Genome => Network.random(this.networkConfig, this.rng);

  /**
   * Runs a full episode, writes `[strideLength, dutyFactor]` as the genome's
   * behaviour, and returns distance travelled as the fitness.
   */
  evaluate = (genome: Genome): number => {
    if (!(genome instanceof Network)) {
      throw new TypeError("GaitEnvironment can only evaluate a Network");
    }
    const state = startingCreature();
    for (let step = 0; step < EPISODE_STEPS; step++) {
      if (!advance(genome, state)) {
        break;
      }
    }
    genome.behaviour = [meanStride(state), dutyFactor(state)];
    return Math.max(0, state.x);
  };

  /** Creates an episode a renderer advances one tick per frame. */
  createEpisode(network: Network): LiveGaitEpisode {
    const state = startingCreature();
    let alive = true;
    return {
      snapshot: {
        get x() {
          return state.x;
        },
        get y() {
          return state.y;
        },
        get stance() {
          return state.stance;
        },
      },
      step: (): boolean => {
        if (!alive) return false;
        alive = advance(network, state);
        return alive;
      },
    };
  }

  /** Behaviour-space bounds, for wiring a {@link MapElites} archive. */
  static readonly BEHAVIOUR_BOUNDS = {
    strideLength: { min: 0, max: 2.5 },
    dutyFactor: { min: 0, max: 1 },
  } as const;
}

function startingCreature(): CreatureState {
  return {
    x: 0,
    y: REST_LEG_LENGTH,
    vx: 0,
    vy: 0,
    stance: false,
    stanceTicks: 0,
    totalTicks: 0,
    lastTouchdownX: 0,
    strides: [],
  };
}

/** Advances the hopper one tick; returns `false` if it has fallen. */
function advance(network: Network, state: CreatureState): boolean {
  const output = network.feedForward([state.y, state.vx, state.stance ? 1 : 0]);
  const push = 0.5 * (clampUnit(output[0] as number) + 1); // thrust in [0, 1]
  const touchdownAim = clampUnit(output[1] as number) * 0.5; // forward lean in [-0.5, 0.5]

  state.totalTicks++;
  if (state.stance) {
    state.stanceTicks++;
    const legLength = Math.hypot(state.x - state.lastTouchdownX, state.y);
    const compression = REST_LEG_LENGTH - legLength;
    const springForce = LEG_STIFFNESS * Math.max(0, compression) * (1 + push);
    const legDX = state.x - state.lastTouchdownX;
    const direction = legLength > 1e-6 ? legDX / legLength : 0;
    state.vx += TIME_STEP * (-direction * springForce * 0.02 + touchdownAim);
    state.vy += TIME_STEP * (springForce * 0.05 + GRAVITY);
    if (legLength > REST_LEG_LENGTH * MAX_LEG_STRETCH) {
      state.stance = false;
    }
  } else {
    state.vy += TIME_STEP * GRAVITY;
    if (state.y <= REST_LEG_LENGTH) {
      state.stance = true;
      state.strides.push(state.x - state.lastTouchdownX);
      state.lastTouchdownX = state.x + touchdownAim;
    }
  }

  state.x += TIME_STEP * state.vx;
  state.y += TIME_STEP * state.vy;
  if (!state.stance) {
    state.y = Math.max(state.y, 0);
  }

  return state.y > FALL_HEIGHT || state.stance;
}

function meanStride(state: CreatureState): number {
  if (state.strides.length === 0) {
    return 0;
  }
  const sum = state.strides.reduce((total, stride) => total + Math.abs(stride), 0);
  return sum / state.strides.length;
}

function dutyFactor(state: CreatureState): number {
  return state.totalTicks > 0 ? state.stanceTicks / state.totalTicks : 0;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
