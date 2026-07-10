# Known Issues

Open problems and sharp edges. None are currently blocking; all are documented so a
future session does not rediscover them.

## Track runner reward-hacking exploit (fixed — see ADR-009)
- **Symptom:** fitness plateaued hard at exactly 315.00 within ~20 generations and
  never moved again, even with the eliteCount fix already applied. Unlike the
  population-average plateau below, this was the *champion itself* capped, not
  just the average.
- **Root cause, measured:** 315 is precisely the theoretical maximum achievable by
  hugging the track's *inner* wall at full throttle for the whole episode (verified
  by replaying the champion and recording its radius: avg 0.2047, essentially
  touching `innerRadius = 0.2`). The bug: fitness counted raw angular sectors
  crossed, and a smaller radius means a smaller circumference, so hugging the
  inner wall completes more sectors per unit of the fixed distance/time budget
  than genuinely driving the track — classic reward hacking (PRD §6).
- **First attempted fix (measured, and wrong):** weighting angular progress
  *monotonically* by distance from the inner wall just relocated the exploit to
  the *outer* wall (verified: champion radius shifted to avg 0.4035, against
  `outerRadius = 0.42`, fitness capped at a new ceiling of 150). Any monotonic
  radius weight pushes the optimum to one boundary or the other — proven
  algebraically (the reward-rate function `(r−inner)/r` is monotonic in `r`) and
  confirmed empirically before being discarded.
- **Actual fix:** a *tent*-shaped weight peaking at the track's midline and
  falling to zero at both walls (`clamp01(1 − |r − midRadius| / halfWidth)`).
  Verified: champion radius locks to avg 0.3101 against a true midline of 0.31
  (min/max 0.3099/0.3101 — essentially exact), fitness settles at 210, which
  matches the computed theoretical maximum for a perfect centred lap exactly.
- **Regression test:** `trackrunner.test.ts` asserts the champion's average
  radius after a real training run stays within 15% of the track width from
  either wall. This is the test that would have caught the original bug.

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

## "Environments aren't finishing their tasks" — verification pass
After the two fixes above, all remaining GA/search environments were checked
individually (not assumed fine because tests pass) in response to a report that
several plates looked stuck:
- **Landscape, cart-pole:** confirmed fixed by the eliteCount change above.
- **Track runner:** the reward-hacking exploit above, now fixed.
- **Maze:** originally looked "solved" by objective (fitness ~0.69) but this
  turned out to be a much deeper issue than a weak dead end — see the maze
  section below for the full story and the actual fix (episode-ending
  collision).
- **Gait / MAP-Elites:** confirmed genuine locomotion, not degenerate flopping.
  The archive fills with real fitness variation (0 to ~9.2 within the 400-tick
  evaluation window); replaying the best genome for longer than its evaluation
  window shows it travels 27+ units with a consistent stance/flight rhythm
  (~46% duty factor over 1000 ticks) — a real hopping gait.

## Behavioural / tuning
- **Predator–prey balance is hand-tuned, not adaptive.** Speeds and turn rates (the
  life–dinner asymmetry) were set empirically to keep capture rate ~25–45%. A different
  seed or population size may drift; there is no automatic rebalancing. If one side
  runs away (capture rate → 0% or → 100%), retune `PREDATOR_SPEED`/`PREY_SPEED`/
  `*_MAX_TURN`/`CAPTURE_RADIUS` in `predatorPrey.ts`.
- **No automatic disengagement detection.** The CIAO plot *shows* cycling but nothing
  reads it back to trigger a stabiliser. Listed in future-work.

## M10 — maze: the real fix was episode-ending collision, not trap geometry (resolved — see ADR-010)
- **Original symptom:** objective GA reached a proximity score of ~0.69 within a
  handful of generations regardless of seed, and Novelty Search wasn't measurably
  ahead of it — the intended "objective gets deceived, novelty escapes" contrast
  (Lehman & Stanley, 2011) wasn't showing up.
- **Three rounds of trap-geometry tuning did not fix it (all measured, all
  discarded in turn):**
  1. A single dead-end pocket far from the true path — too weak, easily avoided.
  2. A repositioned single trap at the exact point the true path must turn away
     from the goal, plus a longer episode budget — objective still solved
     *at generation 1*, from pure random initialization, across all 3 seeds.
  3. Two traps at both such turn points, plus a much tighter goal radius
     (0.6 → 0.2) — objective *still* solved at generation 1 on 1 of 3 seeds, and
     the underlying reason became clear from the numbers: colliding with a wall
     only blocked that tick's movement (the episode kept going, heading kept
     changing), so an undirected random network could just keep re-steering
     until it eventually shuffled all the way through — trap count and goal
     radius were never the actual bottleneck.
- **The actual fix:** make hitting a wall end the episode immediately (matching
  cart-pole and track runner, which already treat a crash as fatal). A wrong
  turn into a dead end is now a real, fatal mistake, not a harmless bump.
  Measured effect: gen-1 random luck now fails on 2 of 3 seeds (previously 3 of
  3 always succeeded), and the objective population shows a genuine, watchable
  multi-generation learning curve — fitness climbing from 0 to a solved route
  over roughly 1–5 generations, verified across seeds and visible live in the
  browser (fitness sparkline visibly rising, not flat).
- **What this does *not* achieve, honestly:** objective reliably solving within
  a handful of generations, not failing outright. With a 150-genome population
  and real elitism, evolutionary search is simply very effective at small mazes
  — once even one lucky lineage partially escapes a trap, strong selection
  pressure propagates it fast. Pushing objective toward reliable multi-generation
  *failure* would need a substantially larger/more complex maze; this was
  explicitly decided against (see ADR-010) since the user's actual goal —
  watching both sides constructively, verifiably learn — was already met.
- **The honest, shipped story:** Novelty Search solves immediately by
  exploration alone (never tempted by either trap); Objective GA has to
  genuinely learn to avoid two dead ends and typically does so within a
  handful of generations. The contrast on display is *immediate exploration
  vs. a few generations of real learning*, not solve vs. stall — still a
  legitimate, verified demonstration of the two paradigms behaving differently
  on an identical deceptive landscape.

## M10 — gait physics is intentionally minimal
- `gait.ts` uses a single point-mass + one spring leg (stance/flight phases), not a
  rigid-body/collision engine. This was a deliberate scope decision (see ARCHITECTURE.md
  and the CLAUDE.md pitfall list: hand-written 2-D physics is a known time sink). It
  produces varied stride length / duty factor behaviours (58 archive cells filled in a
  short run) but is not a general-purpose physics simulator — do not extend it toward
  multi-limb creatures without reconsidering the approach.

## XOR readout was misleading, not the network (fixed)
- **Symptom:** a genuinely fully-correct network (all four cases on the right side of
  0.5) could still read "fitness 3.8 / 4" and look permanently unfinished, because the
  sigmoid output never reaches exactly 0 or 1 — the last stretch toward fitness 4.0 is
  an asymptotic crawl that never visually resolves.
- **Fix:** added a `cases solved: n/4` indicator (readout secondary line + a prominent
  on-canvas badge in `XorView`) that counts cases on the correct side of the 0.5
  threshold — it reads `4/4` the instant the network is actually correct, independent
  of the raw fitness decimal. Verified reliable across 10 seeds (10/10 reached 4/4
  under the demo's exact config) — `test/xor.test.ts` locks this in as a regression.

## Rendering / preview
- The headless preview throttles `requestAnimationFrame` between paints, so episodic
  environments (cart-pole, predator–prey) appear to advance slowly there; they run at
  60 FPS in a real browser.
- Observed this session: with the preview tab in a backgrounded/hidden state
  (`document.hidden === true`), `requestAnimationFrame` did not fire *at all* (verified
  directly — zero callbacks after 500ms), not just throttled. Taking a screenshot
  reliably forces one frame to render regardless, so verification is still possible —
  just one frame per screenshot call rather than continuous playback.
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
