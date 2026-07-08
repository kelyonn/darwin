# Known Issues

Open problems and sharp edges. None are currently blocking; all are documented so a
future session does not rediscover them.

## Behavioural / tuning
- **Predator–prey balance is hand-tuned, not adaptive.** Speeds and turn rates (the
  life–dinner asymmetry) were set empirically to keep capture rate ~25–45%. A different
  seed or population size may drift; there is no automatic rebalancing. If one side
  runs away (capture rate → 0% or → 100%), retune `PREDATOR_SPEED`/`PREY_SPEED`/
  `*_MAX_TURN`/`CAPTURE_RADIUS` in `predatorPrey.ts`.
- **No automatic disengagement detection.** The CIAO plot *shows* cycling but nothing
  reads it back to trigger a stabiliser. Listed in future-work.

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
