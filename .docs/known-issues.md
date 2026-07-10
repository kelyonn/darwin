# Known Issues

Open problems and sharp edges. None are currently blocking; all are documented so a
future session does not rediscover them.

## Population-average plateau (fixed — see ADR-008)
- **Symptom:** several GA environments looked "stuck" after early generations — the
  champion (`best`) was fine, but the population as a whole never seemed to visibly
  improve; watching the swarm gave the impression evolution had stopped.
- **Root cause, measured:** with `eliteCount` at ~0.7–1.3% of `populationSize` (2 out
  of 150–300), the population-average fitness hits a hard plateau within ~20
  generations and does not move for hundreds more, on *both* a vector genome
  (Landscape, blend crossover) and a network genome (cart-pole, uniform-mix
  crossover). Mutation-rate annealing and tournament-size changes (5/15/25) made
  <1% difference to the plateau; isolating crossover entirely still plateaued.
  Raising `eliteCount` to ~5–8% of the population raised the average 10× (Landscape)
  and 6× (cart-pole) — see ADR-008 for the full trace.
- **Fix applied:** `eliteCount` raised on Landscape, TSP, cart-pole, track runner,
  and the maze's objective side, in `main.ts`. A mutation-annealing schedule
  (`mutationDecay`/`minMutationRate`) was also built and applied as a secondary,
  complementary refinement — it is real and PRD-aligned (§7) but was *not* the fix
  for this symptom; do not assume mutation tuning alone will unstick a plateaued GA
  environment in this codebase again without measuring first.
- **Not touched:** Weasel (already solves exactly), maze's novelty side and
  predator–prey (elitism there already proportionally reasonable / would fight the
  environment's actual goal), MAP-Elites (no elitism mechanism at all).
- **Open:** TSP's `eliteCount` bump was applied by inference (same breeding
  structure as Landscape/cart-pole) rather than individually re-measured — verify
  headlessly the same way if it still looks flat.

## Behavioural / tuning
- **Predator–prey balance is hand-tuned, not adaptive.** Speeds and turn rates (the
  life–dinner asymmetry) were set empirically to keep capture rate ~25–45%. A different
  seed or population size may drift; there is no automatic rebalancing. If one side
  runs away (capture rate → 0% or → 100%), retune `PREDATOR_SPEED`/`PREY_SPEED`/
  `*_MAX_TURN`/`CAPTURE_RADIUS` in `predatorPrey.ts`.
- **No automatic disengagement detection.** The CIAO plot *shows* cycling but nothing
  reads it back to trigger a stabiliser. Listed in future-work.

## M10 — maze deception is weaker than textbook
- **Measured, not assumed:** headless comparison across 3 seeds (60 generations, pop 150)
  shows objective GA plateaus around proximity-score 0.69 regardless of seed, and Novelty
  Search is statistically comparable (not clearly ahead). A dead-end pocket (`DEAD_END` in
  `maze.ts`) and a tightened step budget were added and re-measured, but the classic
  "objective gets stuck, novelty escapes" separation from Lehman & Stanley (2011) did not
  reproduce strongly at these settings within the time available this session.
- **UI is labelled honestly** to reflect this (`main.ts` maze option summaries describe the
  mechanism, not a guaranteed outcome) rather than overclaiming.
- **Why left as-is:** the environment still correctly demonstrates the *architectural* claim
  (swap `GenerationalGA` for `NoveltySearch` with zero core changes — the actual point of
  the selection-pressure axis). Making the behavioural contrast textbook-strength needs a
  harder maze topology or a stricter time budget than was worth tuning under this session's
  time budget. Revisit before using this as a research or interview talking point about
  novelty search specifically "beating" objective search.

## M10 — gait physics is intentionally minimal
- `gait.ts` uses a single point-mass + one spring leg (stance/flight phases), not a
  rigid-body/collision engine. This was a deliberate scope decision (see ARCHITECTURE.md
  and the CLAUDE.md pitfall list: hand-written 2-D physics is a known time sink). It
  produces varied stride length / duty factor behaviours (58 archive cells filled in a
  short run) but is not a general-purpose physics simulator — do not extend it toward
  multi-limb creatures without reconsidering the approach.

## Rendering / preview
- The headless preview throttles `requestAnimationFrame` between paints, so episodic
  environments (cart-pole, predator–prey) appear to advance slowly there; they run at
  60 FPS in a real browser.
- The predator–prey view is fixed at the 640×360 stage; the CIAO heatmap caps display
  at the most recent 60 generations for legibility (older history is retained in memory
  but not drawn).

## Performance (M8, deferred)
- Buffer pooling and the Web Worker are not yet implemented; on the M5 the frame rate
  hides per-frame allocation until scale. Measure allocations directly, not FPS.
- No measured 60 FPS numbers recorded yet — do not claim any until measured (PRD §8).

## Process
- Memory-doc suite is maintained by hand; `session-log.md` and `CHANGELOG.md` must be
  updated each session or they drift.
