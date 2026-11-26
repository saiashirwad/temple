Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/danger.ts`, `src/story.ts`, new `src/tuning.ts`, new `src/math.ts`, and `tests/*`.
Read tools/helpers/out/gameplay.md (the TUNING table and shared math findings).
1. Move danger.ts's magic numbers (speeds, radii, nerve/alarm rates, lunge timings, herd charge,
   torch/cover effects) into `export const TUNING = {...} as const` in `src/tuning.ts`, grouped
   (dholes, herd, player), each with a short comment. Values must be IDENTICAL.
2. `src/math.ts`: clamp, smooth (smoothstep), lerp, hypot2 etc that danger/story duplicate; use
   them in your files only (other files can adopt later — list where under "needs wiring").
3. Danger/story at high time scale: add `stepFixed(dt, fn, max=1/30)` in math.ts that splits a
   big dt into ≤max substeps, and make danger.update and story.update robust to dt up to 0.5 by
   substepping internally (the scene passes dt*timeScale; at 16× a 60 fps frame is 0.27 s).
   The draw order of `random` per substep must stay deterministic.
4. Add tests: substepping gives the same outcome at dt 0.016×60 vs 0.27×~4 within tolerance for a
   dhole approach; TUNING values snapshot (a test that fails if a value changes by accident).
Keep all existing tests passing.
