Read tools/helpers/briefs/_writer.md first: you are a writer.
Owner's complaint: "people can't walk through walls" and "make sure NPCs follow physics too".
Your files: `src/people.ts`, `src/physics.ts`, new `src/routes.ts`, new `tests/routes.test.ts`.
Read src/people.ts, src/physics.ts, src/geo.ts (Solid), and how scene.ts builds `solidShape`
(temple.solids, grounds.solids, street.solids, village.solids, props, trees) — read only.
1. Every townsperson walks a fixed route of waypoints (CIRCUIT, roadside(), lane(), the guard's
   beat...). Write `src/routes.ts` with a pure `blocked(route, solids, radius=0.3)` that tests each
   route segment (swept circle) against the solid boxes (yawed boxes: transform into box space)
   and the trunks of trees/props that are solid, and returns the offending segments. Then a
   `clear(route, solids)` that fixes a route by nudging or inserting waypoints around boxes
   (go round the nearer corner with 0.35 m clearance), keeping the route's ends.
2. In people.ts, run every walk route through `clear(...)` at build time (people.ts gets the
   solids passed in: add a parameter; report the scene.ts wiring). Seated/standing people must not
   sit inside a wall either: check and push them out.
3. Tests in tests/routes.test.ts: build the real solids in Node (temple.ts, grounds.ts, street.ts,
   village.ts build functions are pure — check) and assert NO route of any person crosses a
   solid after clear(), and that clear() leaves an already-clear route unchanged. Print how many
   segments were blocked before fixing.
4. Physics: people should also be solid to the player. In physics.ts add kinematic capsules
   (radius 0.28, height 1.7) for townspeople, with `setPeople(positions: Float32Array)` to move
   them each frame (b3Body_SetTransform or SetTargetTransform; check box3d API in node_modules),
   only those within 25 m of the walker so it stays cheap. When the walker blocks a person's
   route (within 0.6 m ahead of them), that person should pause and step aside, not walk through
   you: expose from people.ts a `setPlayer(x, z)` hook used in its animate step.
Needs wiring (report exactly): the people.ts parameter, setPeople call per frame, setPlayer call.
Run `npm run check` (must print CHECK OK) before finishing.
