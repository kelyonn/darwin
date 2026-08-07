import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";
import { Network, type NetworkConfig } from "../core/network.js";
import type { CompetitionOutcome } from "../search/coevolution.js";

/** Unit-square arena; positions are clamped to `[0, ARENA_SIZE]`. */
const ARENA_SIZE = 1;
const ARENA_DIAGONAL = Math.SQRT2;
/**
 * Per-tick travel distance at full throttle. The prey is slightly faster — the
 * life–dinner principle (Dawkins & Krebs, 1979): the rabbit runs for its life,
 * the fox only for its dinner. This keeps the arms race engaged instead of
 * letting a faster pursuer trivially dominate (which collapses the prey gradient).
 */
const PREDATOR_SPEED = 0.022;
const PREY_SPEED = 0.024;
/** Maximum heading change per tick, in radians. The prey is more manoeuvrable. */
const PREDATOR_MAX_TURN = 0.3;
const PREY_MAX_TURN = 0.4;
/** Contact distance at which the predator captures the prey. */
const CAPTURE_RADIUS = 0.04;
/** Contest length in ticks, per trial. */
const EPISODE_STEPS = 200;
/**
 * Number of starting configurations averaged per contest (ADR-012). A single
 * fixed start (both agents on the x-axis, both heading 0 — i.e. the prey
 * starting turned directly *away* from the predator) let controllers learn an
 * open-loop trajectory valid only for that one geometry; nothing could tell
 * whether they had. Every contest now runs all `TRIALS` conditions and
 * averages the payoff, so `compete` stays deterministic (fixed conditions,
 * fixed order) while no longer testing exactly one geometry.
 */
const TRIALS = 3;
/**
 * Half the separation between predator and prey at the start of a trial — kept
 * identical across all `TRIALS` conditions (only the bearing between them and
 * both headings vary) so trial difficulty doesn't swing with distance, per the
 * remediation plan's guidance. Matches the original fixed start's separation
 * of `2 × CONTEST_RADIUS = 0.5`.
 */
const CONTEST_RADIUS = 0.25;

/** Mutable state of one agent during a contest. */
interface Agent {
  x: number;
  y: number;
  heading: number;
}

/** One trial's starting configuration for both agents. */
interface ContestStart {
  readonly predator: Readonly<Agent>;
  readonly prey: Readonly<Agent>;
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
 * A contest is deterministic: `TRIALS` starting configurations are drawn once
 * at construction (ADR-012) and shared by every pairing this instance ever
 * runs, so outcomes reflect controller skill generalising across varied starts
 * — not a single memorised geometry — and a seeded run still reproduces
 * exactly.
 */
export class PredatorPreyEnvironment {
  private readonly networkConfig: NetworkConfig;
  private readonly starts: readonly ContestStart[];

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
    this.starts = Array.from({ length: TRIALS }, () => randomStart(rng));
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
   * Runs a contest across every trial starting configuration and returns the
   * averaged, graded outcome. Bound as the `compete` callback for
   * {@link CoevolutionDriver}.
   */
  compete = (predator: Genome, prey: Genome): CompetitionOutcome => {
    if (!(predator instanceof Network) || !(prey instanceof Network)) {
      throw new TypeError("PredatorPreyEnvironment can only pit a Network against a Network");
    }
    return simulate(predator, prey, this.starts);
  };

  /**
   * Creates a contest a renderer advances one tick per frame, so a champion
   * pairing can be animated live. Uses one of the `TRIALS` conditions
   * `compete` itself averages over (trial 0 by default); the physics of that
   * single trial matches {@link compete} exactly.
   */
  createEpisode(predator: Network, prey: Network, trial = 0): LivePredatorPreyEpisode {
    const start = this.starts[trial % this.starts.length] as ContestStart;
    const predatorAgent: Agent = { ...start.predator };
    const preyAgent: Agent = { ...start.prey };
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
        act(predator, predatorAgent, preyAgent, PREDATOR_SPEED, PREDATOR_MAX_TURN);
        act(prey, preyAgent, predatorAgent, PREY_SPEED, PREY_MAX_TURN);
        captured = distance(predatorAgent, preyAgent) < CAPTURE_RADIUS;
        return !captured;
      },
    };
  }
}

/** Runs a single trial from `start` and grades it. */
function simulateTrial(predator: Network, prey: Network, start: ContestStart): CompetitionOutcome {
  const predatorAgent: Agent = { ...start.predator };
  const preyAgent: Agent = { ...start.prey };
  let closest = distance(predatorAgent, preyAgent);

  for (let step = 0; step < EPISODE_STEPS; step++) {
    act(predator, predatorAgent, preyAgent, PREDATOR_SPEED, PREDATOR_MAX_TURN);
    act(prey, preyAgent, predatorAgent, PREY_SPEED, PREY_MAX_TURN);
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
 * Runs every trial in `starts` and averages the graded predator payoff
 * (ADR-012). `captured`/`preyScore` are derived from that average, which keeps
 * the documented invariant on {@link CompetitionOutcome} — `predatorScore`
 * strictly above 0.5 iff `captured` — true by construction, not by convention.
 */
function simulate(predator: Network, prey: Network, starts: readonly ContestStart[]): CompetitionOutcome {
  let predatorScoreSum = 0;
  for (const start of starts) {
    predatorScoreSum += simulateTrial(predator, prey, start).predatorScore;
  }
  const predatorScore = predatorScoreSum / starts.length;
  return { captured: predatorScore > 0.5, predatorScore, preyScore: 1 - predatorScore };
}

/**
 * Advances one agent: it observes its opponent, the network chooses a turn and
 * throttle, and the body moves within the arena.
 */
function act(network: Network, self: Agent, opponent: Agent, maxSpeed: number, maxTurn: number): void {
  const output = network.feedForward(observe(self, opponent));
  // Read both outputs immediately: the buffer is reused on the next call.
  const turn = clampUnit(output[0] as number) * maxTurn;
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

/**
 * Draws one trial's starting configuration: predator and prey placed
 * `2 × CONTEST_RADIUS` apart at a random bearing around the arena centre, each
 * with an independently random heading (so neither agent starts assuming a
 * fixed geometry, unlike the single hand-picked start this replaces).
 */
function randomStart(rng: Rng): ContestStart {
  const center = ARENA_SIZE / 2;
  const bearing = rng.next() * 2 * Math.PI;
  const dx = Math.cos(bearing) * CONTEST_RADIUS;
  const dy = Math.sin(bearing) * CONTEST_RADIUS;
  return {
    predator: { x: center - dx, y: center - dy, heading: rng.next() * 2 * Math.PI },
    prey: { x: center + dx, y: center + dy, heading: rng.next() * 2 * Math.PI },
  };
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
