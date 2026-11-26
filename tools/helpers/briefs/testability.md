Goal: make this game verifiable and testable with far less manual work. Today a bot edits
consts (TEST_AT, WALK_TEST, TEST_WOLVES, PROBE_STAGES, LINEUP, PARK, temporary `// TEMP_` hacks
like forcing story.sit()) then runs a remote GPU browser that can only open the bare URL, press
keys, click, wait ≤15 s, screenshot. Then reverts by sed. Read `src/index.ts`, the top of
`src/scene.ts` (flags, the api object it returns), `src/danger.ts`, `src/story.ts`,
`src/walk.ts`, `src/physics.ts`, and the kit docs `docs/kit/testing.md`, `docs/kit/readback.md`,
`docs/kit/gpu-debug.md`, `docs/kit/profiler.md`, `docs/kit/counters.md`, `docs/kit/web.md`,
`docs/kit/clock.md`.
Design: (a) one test-scenario mechanism that needs no code edits — e.g. scenarios selected by
`location.hash`/localStorage OR by a key sequence pressed in the remote browser, a
`window.__game` API (teleport, set time, start finale, spawn pack, read state as JSON) and an
on-screen JSON state readout that screenshots can capture; (b) which logic is pure and could be
unit-tested in Node with `npx tsx` without a GPU (story, danger, walk/physics?), with example
test files; (c) a single `npm run check` that runs tsc + node tests + a "flags are off" lint;
(d) using kit testing/readback for GPU-side asserts if the docs support it. Be concrete with
code sketches and name the exact places to hook in.
