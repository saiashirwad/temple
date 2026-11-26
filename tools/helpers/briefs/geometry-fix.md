Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: `src/geo.ts`, `src/surfaces.ts`, `src/bridge.ts`, `src/machan.ts`, `src/church.ts`,
`src/mosque.ts`, `src/bungalow.ts`, `src/village.ts`, `src/temple.ts`, `src/world.ts`.
Implement from `tools/helpers/out/geometry.md`: finding 1 (texture patterns: roughness/metallic out
of the merge key; put the TEXTURED set in surfaces.ts and import it in geo.ts, or the other way
round, so they can't drift), finding 2 part one: add and export `mergeModels(models)` in geo.ts
(group meshes by material, concatenate all attributes incl. extra.pat/extra.col, offset indices;
read geo.ts's Model/mesh types carefully) — DON'T wire it into scene.ts (needs wiring), finding 4
(round untextured roughness to 3 levels inside part(), glass constants to P.GLASS — check the
P.GLASS branch in surfaces.ts gives a similar look first), finding 5 (b.open() around bridge
planks and machan floor/tread visuals, church/bungalow skins: read how b.open and solids work in
geo.ts and confirm the explicit solids still cover the walkable surface before removing any),
finding 6 (smaller flames, drop the wick box), finding 7 (bars via b.bar where it's a straight swap).
Skip finding 3 (emission) and 8 (parts module) — list them as next steps.
Also delete the unused `M.paintBlue`, `M.paintGreen`, `M.shutter`, `M.tube` if grep confirms unused.
