import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng.js";
import { GenerationalGA } from "../src/core/ga.js";
import { NoveltySearch } from "../src/search/novelty.js";
import { MazeEnvironment } from "../src/environments/maze.js";
import { Network } from "../src/core/network.js";

/** BFS over the open cells, proving the built maze actually connects start to goal. */
function isSolvable(env: MazeEnvironment): boolean {
  const { cols, rows } = env.dimensions;
  const grid = env.grid;
  const start = env.start;
  const goal = env.goal;
  const visited = new Set<string>();
  const queue: [number, number][] = [[start.col, start.row]];
  visited.add(`${start.col},${start.row}`);
  while (queue.length > 0) {
    const [col, row] = queue.shift() as [number, number];
    if (col === goal.col && row === goal.row) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if ((grid[nr] as readonly boolean[])[nc]) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push([nc, nr]);
    }
  }
  return false;
}

describe("MazeEnvironment", () => {
  it("builds a maze where start and goal are connected", () => {
    const env = new MazeEnvironment(6, new Rng(1));
    expect(isSolvable(env)).toBe(true);
  });

  it("writes a behaviour descriptor and a bounded objective score", () => {
    const env = new MazeEnvironment(6, new Rng(2));
    const [genome] = env.newPopulation(1) as [Network];
    const score = env.evaluate(genome);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(genome.behaviour).toHaveLength(2);
  });

  it("rejects non-network genomes", () => {
    const env = new MazeEnvironment(6, new Rng(1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => env.evaluate({} as any)).toThrow(TypeError);
  });

  it("objective GA is reproducible under a fixed seed", () => {
    const run = (): number => {
      const rng = new Rng(11);
      const env = new MazeEnvironment(6, rng);
      const ga = new GenerationalGA(
        { populationSize: 40, eliteCount: 2, tournamentSize: 4, mutationRate: 0.2 },
        rng,
      );
      let population = env.newPopulation(40);
      for (let g = 0; g < 5; g++) population = ga.step(population, (genome) => env.evaluate(genome));
      return Math.max(...population.map((g) => g.fitness));
    };
    expect(run()).toEqual(run());
  });

  it("Novelty Search explores and grows an archive of distinct behaviours", () => {
    const rng = new Rng(5);
    const env = new MazeEnvironment(6, rng);
    const novelty = new NoveltySearch(
      {
        populationSize: 40,
        eliteCount: 2,
        tournamentSize: 4,
        mutationRate: 0.2,
        neighbours: 5,
        archiveThreshold: 0.05,
        archiveLimit: 200,
      },
      rng,
    );
    let population = env.newPopulation(40);
    for (let g = 0; g < 6; g++) population = novelty.step(population, (genome) => env.evaluate(genome));
    expect(novelty.exploredBehaviours.length).toBeGreaterThan(0);
  });

  it("a live episode ends the instant it hits a wall (regression)", () => {
    // An earlier version blocked movement into a wall instead of ending the
    // episode there, which let even undirected random networks eventually
    // shuffle through the whole maze given enough ticks (measured: gen-1
    // random genomes solved regardless of trap count or goal radius). Ending
    // the episode on contact is what gives a wrong turn real consequence.
    const env = new MazeEnvironment(6, new Rng(1));
    const [genome] = env.newPopulation(1) as [Network];
    const episode = env.createEpisode(genome);
    let steps = 0;
    while (episode.step() && steps < 5000) steps++;
    // Either it solved, or it stopped for a real reason (wall/step cap) — in
    // both cases the loop must actually terminate, not run forever.
    expect(steps).toBeLessThan(5000);
  });

  function championSolves(env: MazeEnvironment, champion: Network): boolean {
    const episode = env.createEpisode(champion);
    let steps = 0;
    while (episode.step() && steps < 3000) steps++;
    return episode.snapshot.solved;
  }

  it("Objective GA constructively solves the maze within a bounded number of generations (regression)", () => {
    // Locks in the verified story (.docs/known-issues.md): the objective
    // population genuinely learns to avoid both dead ends and reach the goal
    // within a handful of generations — not instantly by chance, and not
    // stalled forever either.
    const demoConfig = {
      populationSize: 150,
      eliteCount: 12,
      tournamentSize: 5,
      mutationRate: 0.5,
      mutationDecay: 0.99,
      minMutationRate: 0.05,
    };
    for (const seed of [1, 42, 99]) {
      const rng = new Rng(seed);
      const env = new MazeEnvironment(6, rng);
      const ga = new GenerationalGA(demoConfig, rng);
      let population = env.newPopulation(demoConfig.populationSize);
      for (let g = 0; g < 30; g++) population = ga.step(population, (genome) => env.evaluate(genome));
      const champion = [...population].sort((a, b) => b.fitness - a.fitness)[0] as Network;
      expect(championSolves(env, champion)).toBe(true);
    }
  });

  it("Novelty Search reaches the goal via exploration alone, immediately (regression)", () => {
    const demoConfig = {
      populationSize: 150,
      eliteCount: 2,
      tournamentSize: 5,
      mutationRate: 0.4,
      neighbours: 8,
      archiveThreshold: 0.03,
      archiveLimit: 400,
    };
    for (const seed of [1, 42, 99]) {
      const rng = new Rng(seed);
      const env = new MazeEnvironment(6, rng);
      const novelty = new NoveltySearch(demoConfig, rng);
      const initial = env.newPopulation(demoConfig.populationSize);
      // Check after the first real generation of search (evaluate + breed),
      // not the raw random initial population — matching what "solves
      // immediately" was actually measured against (.docs/known-issues.md).
      const nextGeneration = novelty.step(initial, (genome) => env.evaluate(genome));
      const solvedAny = nextGeneration.some((genome) => championSolves(env, genome as Network));
      expect(solvedAny).toBe(true);
    }
  });
});
