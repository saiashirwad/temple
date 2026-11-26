Audit the procedural geometry/building modules: `src/geo.ts` (the Builder), `src/temple.ts`,
`src/village.ts`, `src/street.ts`, `src/town.ts`, `src/church.ts`, `src/mosque.ts`,
`src/bungalow.ts`, `src/machan.ts`, `src/bridge.ts`, `src/props.ts`, `src/surfaces.ts`,
`src/world.ts`. Find duplicated helpers (roofs, walls, posts, steps, railings, lamps repeated
across files), materials that could be shared to free mesh-pool slots (the pool is capped at 256
and nearly full: list every material/colour constant that is near-duplicate, e.g. two browns
within a few % of each other), geometry built but never seen, overly fine tessellation, and
physics solids that duplicate visuals. Propose a small shared kit of building parts and a list
of material merges with estimated slots freed.
