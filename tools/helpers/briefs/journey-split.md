Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/scene.ts`, and new files `src/journey.ts`, `src/cover.ts`, `src/unease.ts`. Nothing else.
Read tools/helpers/out/scene-split.md findings 6, 7, 11, 12, 14 (line numbers are stale; search).
Move the journey logic out of scene.ts without changing behaviour (same timings, same random
draw ORDER, same story/HUD calls, same `test` object and `state` getter shape used by
src/scenarios.ts — read scenarios.ts and index.ts so nothing they use breaks):
1. `src/cover.ts`: the cover cells / `inCover` grid and its build. Pure, takes the planted data.
2. `src/unease.ts`: the crickets-go-quiet / unease timer logic, if it is self-contained.
3. `src/journey.ts`: `journeyStep` and the `journey` state object (progress along the trail,
   arrivals, the guard and note logic, howl/creak timers), as `createJourney(deps)` returning
   `{ state, step(tick) }`. Build one per-frame `Tick` `{ seconds, dt, eye, fwd, x, z }` in
   scene.ts after the view updates and pass it in (finding 7), instead of recomputing forward/eye.
Keep `later()`/`pending` sim-clock timers working (pass `later` in). Don't touch beastrig.ts,
quat.ts, ground.ts, HUD or story text. Fix the CPU profile marks (finding 9) while you're there.
Report scene.ts line count before/after. Leave tsc clean and the 12 tests passing.
