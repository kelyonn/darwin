import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";
import type { CompetitionOutcome } from "../search/coevolution.js";

/** Unit-square arena; positions are clamped to `[0, ARENA_SIZE]`. */
const ARENA_SIZE = 1;
const ARENA_DIAGONAL = Math.SQRT2;
/** Per-tick travel distance at full throttle. The predator is slightly faster. */
const PREDATOR_SPEED = 0.025;
const PREY_SPEED = 0.02;
/** Maximum heading change per tick, in radians. */
const MAX_TURN = 0.35;
/** Contact distance at which the predator captures the prey. */
const CAPTURE_RADIUS = 0.05;
/** Contest length in ticks. */
const EPISODE_STEPS = 200;

/** Mutable state of one agent during a contest. */
interface Agent {
  x: number;
  y: number;
  heading: number;
}

/** Read-only view of an agent for rendering. */
export interface AgentSnapshot {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** Read-only view of a contest for rendering. */
export interface PredatorPreySnapshot {
  readonly predator: AgentSnapshot;
  readonly prey: AgentSnapshot;
  readonly captured: boolean;
}

/** A contest advanced one tick at a time, for live animation. */
export interface LivePredatorPreyEpisode {
  readonly snapshot: PredatorPreySnapshot;
  /** Advances one tick; returns `false` once the prey is captured. */
  step(): boolean;
}

/**
 * The predator–prey co-evolution environment (PRD §10 Tier 3): evolve foxes to
 * catch rabbits *and* rabbits to escape, simultaneously. It is not a single
 * {@link Environment} — its fitness is relative to a co-evolving opponent — so it
 * is driven by {@link CoevolutionDriver}, to which it supplies `compete`.
 *
 * Both agents sense the other through the same three inputs — normalised
 * distance and the sine/cosine of the relative bearing — and emit `[turn,
 * throttle]`. Neither network knows which role it plays (PRD §0); the
 * environment assigns meaning by wiring one net to the predator body and one to
 * the prey body and by scoring capture versus escape.
 *
 * A contest is deterministic: fixed starting positions shared by every pairing,
 * so outcomes reflect controller skill and a seeded run reproduces exactly.
 */
export class PredatorPreyEnvironment {
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

  /** Creates a fresh predator population. */
  newPredators(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  /** Creates a fresh prey population. */
  newPrey(size: number): Genome[] {
    return Array.from({ length: size }, () => Network.random(this.networkConfig, this.rng));
  }

  /**
   * Runs one contest and returns the graded outcome. Bound as the `compete`
   * callback for {@link CoevolutionDriver}.
   */
  compete = (predator: Genome, prey: Genome): CompetitionOutcome => {
    if (!(predator instanceof Network) || !(prey instanceof Network)) {
      throw new TypeError("PredatorPreyEnvironment can only pit a Network against a Network");
    }
    return simulate(predator, prey);
  };

  /**
   * Creates a contest a renderer advances one tick per frame, so a champion
   * pairing can be animated live. The physics matches {@link compete}.
   */
  createEpisode(predator: Network, prey: Network): LivePredatorPreyEpisode {
    const predatorAgent = startingPredator();
    const preyAgent = startingPrey();
    let captured = false;
    return {
      snapshot: {
        predator: viewOf(predatorAgent),
        prey: viewOf(preyAgent),
        get captured() {
          return captured;
        },
      },
      step: (): boolean => {
        if (captured) {
          return false;
        }
        act(predator, predatorAgent, preyAgent, PREDATOR_SPEED);
        act(prey, preyAgent, predatorAgent, PREY_SPEED);
        captured = distance(predatorAgent, preyAgent) < CAPTURE_RADIUS;
        return !captured;
      },
    };
  }
}

/** Runs a full contest and grades it. */
function simulate(predator: Network, prey: Network): CompetitionOutcome {
  const predatorAgent = startingPredator();
  const preyAgent = startingPrey();
  let closest = distance(predatorAgent, preyAgent);

  for (let step = 0; step < EPISODE_STEPS; step++) {
    act(predator, predatorAgent, preyAgent, PREDATOR_SPEED);
    act(prey, preyAgent, predatorAgent, PREY_SPEED);
    const separation = distance(predatorAgent, preyAgent);
    closest = Math.min(closest, separation);
    if (separation < CAPTURE_RADIUS) {
      // Earlier capture scores higher; always strictly above 0.5.
      const predatorScore = 0.5 + 0.5 * (1 - step / EPISODE_STEPS);
      return { captured: true, predatorScore, preyScore: 1 - predatorScore };
    }
  }

  // No capture: partial credit for how close the predator got, always below 0.5.
  const predatorScore = 0.5 * (1 - Math.min(closest / ARENA_DIAGONAL, 1));
  return { captured: false, predatorScore, preyScore: 1 - predatorScore };
}

/**
 * Advances one agent: it observes its opponent, the network chooses a turn and
 * throttle, and the body moves within the arena.
 */
function act(network: Network, self: Agent, opponent: Agent, maxSpeed: number): void {
  const output = network.feedForward(observe(self, opponent));
  // Read both outputs immediately: the buffer is reused on the next call.
  const turn = clampUnit(output[0] as number) * MAX_TURN;
  const throttle = 0.5 * (clampUnit(output[1] as number) + 1);

  self.heading = normalizeAngle(self.heading + turn);
  const stepLength = maxSpeed * throttle;
  self.x = clampArena(self.x + Math.cos(self.heading) * stepLength);
  self.y = clampArena(self.y + Math.sin(self.heading) * stepLength);
}

/** The three normalised inputs describing `opponent` relative to `self`. */
function observe(self: Agent, opponent: Agent): readonly number[] {
  const dx = opponent.x - self.x;
  const dy = opponent.y - self.y;
  const separation = Math.hypot(dx, dy);
  const bearing = normalizeAngle(Math.atan2(dy, dx) - self.heading);
  return [Math.min(separation / ARENA_DIAGONAL, 1), Math.sin(bearing), Math.cos(bearing)];
}

function startingPredator(): Agent {
  return { x: 0.25 * ARENA_SIZE, y: 0.5 * ARENA_SIZE, heading: 0 };
}

function startingPrey(): Agent {
  return { x: 0.75 * ARENA_SIZE, y: 0.5 * ARENA_SIZE, heading: 0 };
}

function viewOf(agent: Agent): AgentSnapshot {
  return {
    get x() {
      return agent.x;
    },
    get y() {
      return agent.y;
    },
    get heading() {
      return agent.heading;
    },
  };
}

function distance(a: Agent, b: Agent): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function clampArena(value: number): number {
  return Math.min(ARENA_SIZE, Math.max(0, value));
}

/** Wraps an angle to `(-π, π]`. */
function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Capture distance, exposed for rendering. */
export const PREDATOR_PREY_CAPTURE_RADIUS = CAPTURE_RADIUS;
/** Arena extent, exposed for rendering. */
export const PREDATOR_PREY_ARENA_SIZE = ARENA_SIZE;
