import type { Genome } from "../core/genome.js";
import type { Rng } from "../core/rng.js";

/** One axis of the behaviour-descriptor grid. */
export interface ArchiveDimension {
  readonly min: number;
  readonly max: number;
  readonly bins: number;
}

/** Tuning parameters for {@link MapElites}. */
export interface MapElitesConfig {
  /** One entry per behaviour-descriptor dimension; genome.behaviour must match this length. */
  readonly dimensions: readonly ArchiveDimension[];
  /** Random genomes seeded before evolution begins. */
  readonly initialPopulation: number;
  /** Random-selection + mutation batches produced per `step` call. */
  readonly batchSize: number;
  /** Per-locus mutation rate. */
  readonly mutationRate: number;
}

/** A filled archive cell. */
export interface ArchiveEntry {
  readonly cell: readonly number[];
  readonly genome: Genome;
}

/**
 * MAP-Elites (Mouret & Clune, 2015): illuminate a search space instead of
 * optimising to a point. The archive is a grid indexed by behaviour descriptor;
 * each cell keeps only the highest-fitness genome ever seen with that behaviour.
 * The result is a *gallery* of diverse high-performers — a fast walker, a slow
 * crawler, a hopper — not one winner.
 *
 * This is not a {@link SearchStrategy}: instead of consuming and returning a
 * fixed-size population, `step` mutates elites already in the archive and offers
 * each child a place, so the archive itself is the artifact. It is
 * representation-blind (only `Genome` + a supplied `spawn`/`evaluate` pair) and
 * genome-blind about behaviour: it trusts `genome.behaviour`.
 */
export class MapElites {
  private readonly cells = new Map<string, ArchiveEntry>();

  constructor(
    private readonly config: MapElitesConfig,
    private readonly rng: Rng,
  ) {
    if (config.dimensions.length === 0) {
      throw new RangeError("MAP-Elites needs at least one behaviour dimension");
    }
    for (const dimension of config.dimensions) {
      if (dimension.bins <= 0) {
        throw new RangeError(`bins must be positive, got ${dimension.bins}`);
      }
      if (dimension.min >= dimension.max) {
        throw new RangeError(`dimension bounds must satisfy min < max, got [${dimension.min}, ${dimension.max}]`);
      }
    }
  }

  /** All filled cells, for rendering the illuminated archive. */
  get entries(): readonly ArchiveEntry[] {
    return [...this.cells.values()];
  }

  /** Number of distinct behaviour cells filled so far. */
  get size(): number {
    return this.cells.size;
  }

  /**
   * Seeds the archive with `initialPopulation` random genomes, then produces
   * `batchSize` children per call by mutating a randomly-chosen existing elite —
   * each child is scored and placed into (or discarded from) the archive.
   *
   * @param spawn    Creates one random genome (used only for initial seeding).
   * @param evaluate Scores a genome and must set its `behaviour` descriptor.
   */
  step(spawn: () => Genome, evaluate: (genome: Genome) => number): void {
    if (this.cells.size === 0) {
      for (let i = 0; i < this.config.initialPopulation; i++) {
        this.tryPlace(spawn(), evaluate);
      }
      return;
    }
    const elites = [...this.cells.values()];
    for (let i = 0; i < this.config.batchSize; i++) {
      const parent = this.rng.pick(elites);
      const child = parent.genome.mutate(this.config.mutationRate);
      this.tryPlace(child, evaluate);
    }
  }

  private tryPlace(genome: Genome, evaluate: (genome: Genome) => number): void {
    genome.fitness = evaluate(genome);
    if (genome.behaviour === undefined) {
      throw new Error("MAP-Elites requires the environment to set genome.behaviour");
    }
    const cell = this.cellOf(genome.behaviour);
    if (cell === null) {
      return; // behaviour fell outside the archive bounds
    }
    const key = cell.join(",");
    const existing = this.cells.get(key);
    if (existing === undefined || genome.fitness > existing.genome.fitness) {
      this.cells.set(key, { cell, genome });
    }
  }

  /** Maps a behaviour descriptor to a discrete cell, or `null` if out of bounds. */
  private cellOf(behaviour: readonly number[]): number[] | null {
    if (behaviour.length !== this.config.dimensions.length) {
      throw new RangeError(
        `behaviour has ${behaviour.length} dimensions, archive expects ${this.config.dimensions.length}`,
      );
    }
    const cell: number[] = [];
    for (let i = 0; i < behaviour.length; i++) {
      const dimension = this.config.dimensions[i] as ArchiveDimension;
      const value = behaviour[i] as number;
      if (value < dimension.min || value > dimension.max) {
        return null;
      }
      const fraction = (value - dimension.min) / (dimension.max - dimension.min);
      cell.push(Math.min(dimension.bins - 1, Math.floor(fraction * dimension.bins)));
    }
    return cell;
  }
}
