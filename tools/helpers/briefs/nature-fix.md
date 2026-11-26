Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/ground.ts`, `src/trees.ts`, `src/tex.ts`, `src/atmosphere.ts`, `src/pond.ts`,
`src/meadow.ts`, `src/planting.ts`, `src/sky.ts`, `src/air.ts`, and a new `src/quality.ts`.
Implement from `tools/helpers/out/nature.md`:
- finding 3: create `src/quality.ts` exporting `phone` (boot.has('phone') || (!boot.has('desktop')
  && matchMedia('(pointer: coarse)').matches), guarded so it works in Node where matchMedia is
  undefined) and `Q` with the knobs. Apply the knobs that live in YOUR files (ground N,
  atmosphere STEPS/HALOS, pond MIRROR_SCALE, tex anisotropy, air capacities and rates). List the
  scene.ts knobs as needs wiring (`Q.grassTo` etc. are exported for me to use).
- finding 2 (bark triplanar only for bark pixels, textureSampleGrad; skip unused fetches when useUv),
- finding 4 (atmosphere steps/halos as parameters with Q defaults),
- finding 5 (branch the paddy and forest blocks in the ground fragment; uniform control flow for
  texture samples), finding 6 (dead code: pond `*0`, meadow `void near`/`allMeadow` if unused,
  sky MOON duplicates), finding 8 (cheap-first rejection order, output must stay identical),
- finding 1 (bake the terrain to a texture with the kit baker) ONLY if after reading
  `node_modules/@typegpu/kit/docs/kit/baker.md` you're confident; otherwise list it.
Must not change the forest layout (RNG order) or how anything looks on desktop.
Also export a `townAir`/`riverAir` split from air.ts (finding 12) only if it's contained in air.ts.
