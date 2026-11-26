Audit `src/sound.ts` (≈890 lines of Web Audio synthesis) and where it's called from (grep
`sound.` in src/). Find: node leaks (oscillators/buffers created per call and never
disconnected/stopped), repeated buffer generation that could be cached, too many simultaneous
nodes for phones, duplicated envelope/filter code that could be one helper, volume consistency,
anything that would play when the tab is hidden, and violations of the audio rules (no
footsteps; no owls, dogs, geckos, frogs). Propose a compact structure (e.g. a `voice()` helper)
with code sketch.
