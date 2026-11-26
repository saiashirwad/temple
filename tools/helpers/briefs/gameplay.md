Audit gameplay/logic modules for bugs, clarity and testability: `src/danger.ts`, `src/story.ts`,
`src/beasts.ts`, `src/eyes.ts`, `src/walk.ts`, `src/physics.ts`, `src/people.ts`,
`src/traffic.ts`, and the danger/story wiring in `src/scene.ts` (grep for `danger.`, `story.`,
`storyMark`, `journey`). Look for: real bugs (state that never resets on respawn, timers via
setTimeout that survive death/respawn, division by zero, NaN paths, race between story queue
and alerts), magic numbers that should be a named tuning table (one `TUNING` object for
HOLD, bite damage, lunge timings, stamina, herd alarm, wind), duplicated vector math helpers,
and functions to make pure for unit tests. Propose the tuning table contents.
