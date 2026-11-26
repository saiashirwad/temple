Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/scene.ts`, new `src/beastrig.ts`, `src/eyes.ts`. Nothing else.
Read tools/helpers/out/scene-split.md findings 2, 3, 5 and 8 (line numbers there are stale; search).
Do exactly this, keeping behaviour identical (same poses, same timing, same random draws order):
1. Move the beast rig out of scene.ts into `src/beastrig.ts`: wolfIds/herdIds creation, poseBeast,
   poseHead, herdHeads, and the wolf-eye code inside `beasts(...)`. Export one factory, e.g.
   `createBeastRig({ pool, moving, eyes, heightAt, hidden, herdSizes, ... })` returning
   `{ pose(danger, seconds, fx, fy, fz), ids }` or similar; scene.ts calls it where `beasts()` ran.
   Keep the `parked` Set behaviour (hidden parts written once, not every frame).
   Move yawQ/qmul/qrot/xQ/zQ to a new export in beastrig.ts ONLY if scene.ts can import them back
   from there; better: put them in a new `src/quat.ts` (that file is yours too) and import in both.
2. Precompute per-size joints/hips once (`elephantJoints(size)`, `elephantHips(size)`), hoist the
   gait arrays to module constants, and drop the per-call `[...ids.ears, ...ids.trunk]` spread.
3. `eyes.ts`: write into the Float32 data directly, keep a dirty flag, and make write() a no-op
   when nothing changed (finding 8).
Elephants already share one mesh set scaled per instance (`scale: size` on add) — keep that.
Don't touch journey/story/HUD code. Report line count of scene.ts before/after.
