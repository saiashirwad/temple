# You are a helper bot on this codebase (read-only unless your brief says you are a writer or hunter)

Project: /home/bashtv/temple — a WebGPU walking sim of a Kerala temple town at night plus a ~1 km
forest trail to a bungalow, with survival mechanics (health, stamina, dholes, elephants) and an
on-screen story. Built with TypeGPU (`typegpu` 0.12) and TypeGPU Kit (`@typegpu/kit`), Vite,
TypeScript (`tsover`, which allows operator overloading on vectors in `'use gpu'` functions).

Layout: `src/*.ts` (scene.ts wires everything; index.ts is the page/HUD; index.html holds HUD
markup + CSS), `tools/*` are offline Node generators (posters, people GLBs, river, trail map,
textures) writing `public/` and `src/*.gen.ts`. Kit docs: `node_modules/@typegpu/kit/docs/`
(kit/*.md per module, recipes/, concepts/, examples/). Kit skill:
`node_modules/@typegpu/kit/skills/typegpu-kit/SKILL.md`. TypeGPU skill:
`node_modules/typegpu/skills/typegpu/SKILL.md`. Do not read `src/*.gen.ts` or `public/`.

Known hard constraints (don't propose breaking these):
- The kit mesh pool holds at most 256 meshes and is nearly full; new materials/parts cost slots.
- Must run on phones (modest GPUs, little memory). Frame cost and load time matter.
- Audio rules (updated by the owner): footsteps, night birds (owls, nightjars) and wild animals are now WANTED, from high-quality recordings, kept subtle. Still no dogs, geckos or frogs.
- TGSL: no arrow functions inside 'use gpu' bodies; unary minus on vectors -> `v * -1`;
  `std.select` needs matching types.
- Debug flags currently live as consts edited by hand: index.ts PROFILE, WALK_TEST, TEST_AT,
  `coarse`; scene.ts PROBE_STAGES; people.ts LINEUP; traffic.ts PARK; danger.ts TEST_WOLVES.
  Tests are run by a bot on a remote GPU browser that can only load the bare URL (no query
  string), press keys, click, wait (≤15 s total) and screenshot. The sandbox has no GPU, 1 CPU,
  ~1 GB RAM. Making the game verifiable with fewer manual edits/tokens is a main goal.

You can only read (read, grep, find, ls). You cannot run anything. Be efficient: grep first,
read only the ranges you need, don't re-read files.

## Output
Your final message IS the report (it is saved verbatim). Markdown. No preamble. Structure:
1. `## Top 5` — the five changes with the best value/effort, one line each.
2. `## Findings` — numbered. Each: **title**, `file:line` refs, what's wrong/why it matters,
   the concrete change (short code sketch where useful), effort (S/M/L), risk (low/med/high),
   and how to verify it. Be specific; cite real identifiers. No generic advice.
3. `## Not worth it` — things you considered and rejected, one line each.
Keep it under ~1500 words. Accuracy over volume: never invent APIs — if you recommend a kit
feature, cite the doc file you read it in.
