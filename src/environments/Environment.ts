import type { Genome } from "../core/genome.js";

/**
 * A self-contained problem definition — Layer B (PRD §2, §5).
 *
 * The Environment instantiates the right genome type, decides how a genome is
 * scored (one-shot or episodic, invisible to the GA), interprets float outputs,
 * and optionally renders. It is the *only* place that knows what the problem is;
 * the core engine never does.
 */
export interface Environment {
  /** Creates a fresh population of the appropriate genome type. */
  newPopulation(size: number): Genome[];

  /**
   * Scores a single genome. The GA calls this and never knows what happens
   * inside — a single pass (one-shot) or a full simulation (episodic).
   * Higher is better (PRD §6).
   */
  evaluate(genome: Genome): number;

  /** Optional: draw the current best genome. Called by the render loop, never by core. */
  render?(best: Genome): void;
}
