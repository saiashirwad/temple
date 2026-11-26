Audit the nature/ground modules for performance and cleanliness: `src/jungle.ts`,
`src/planting.ts`, `src/trees.ts`, `src/foliage.ts`, `src/plants.ts`, `src/meadow.ts`,
`src/ground.ts`, `src/grounds.ts`, `src/terrain.ts`, `src/trail.ts`, `src/river.ts`,
`src/footpath.ts`, `src/pond.ts`, `src/air.ts`, `src/atmosphere.ts`, `src/sky.ts`, `src/tex.ts`.
Look for: instance counts that are too high for phones (and where a quality tier could scale
them), per-frame CPU work, shader cost in fragment code (loops, many noise octaves, branches),
height-function calls repeated in hot loops (heightAt is expensive: is it cached?), duplicated
noise/hash functions across files, and dead exports. Propose a single `quality` setting
(phone/desktop) with the exact knobs and values to scale.
