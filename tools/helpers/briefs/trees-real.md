Read tools/helpers/briefs/_writer.md first: you are a writer.
Owner's complaint: "trees and bushes feel too round, there are too many jackfruit trees, there
need to be more types of trees, and more random variations. Every asset as believable and real
as possible." Your files: `src/trees.ts`, `src/foliage.ts`, `src/planting.ts`, `src/jungle.ts`,
`src/plants.ts`, new tree modules under src/ (e.g. src/trees2.ts), new tests. Not scene.ts.
Read them fully first, plus `node_modules/@typegpu/kit/docs/examples/forest/trees.ts`.
Setting: Kerala lowland town + Western Ghats moist deciduous/evergreen forest, at night.
1. Less round: crowns are currently built from spherical clumps (crown() with Clump c,r). Make
   silhouettes irregular: clumps flattened and stretched per species, uneven sizes, gaps and
   holes in the crown, branch tips poking out, asymmetric (lean toward light/open side), layered
   tiers for some species, sparse twiggy outer edge. Shrubs: irregular, leggy, not balls.
2. More species, each with a distinct silhouette (aim for 8+ new or reworked):
   teak (big leaves, open crown), rosewood/irul, Indian laurel (Terminalia, tall straight trunk,
   buttress), wild fig/peepal (spreading, aerial roots), tamarind (feathery dense dome but
   ragged), cashew (low sprawling), Alstonia/ezhilampala (tiered whorls), bamboo (exists:
   improve), silk cotton (tall, horizontal tiers), gulmohar near town, banana clumps, wild
   plantain, screwpine (Pandanus) by water, cane/rattan; shrubs: lantana thickets,
   Chromolaena, ferns, wild ginger/turmeric, shoe-flower (hibiscus) hedges in town.
3. Mix: cut jackfruit to at most ~10% of broadleaf trees. Town yards: coconut, areca, mango,
   jack (a few), banana, hibiscus, drumstick, papaya. Forest: the wild species above.
   Each kind 2-4 variants and per-instance random scale/lean/yaw/tint already exist — extend
   with per-instance hue/value jitter and crown asymmetry.
4. Far cards: FAR_KINDS = palm/broad/areca/rubber and the mesh pool cap is 256 meshes (RangeError
   above). Keep the far card kinds count unchanged OR add at most 2 kinds and report the wiring
   for scene.ts (atlases are made per FAR_KINDS entry there). Keep `merged` builders to stay under
   the mesh cap; print the mesh count your changes add.
5. Budget: planting currently ~2.3 s in Node (tools: write a scratch .mts timing plantAll like
   `buildGrounds(); buildVillage(); plantAll(v.homes, g.gaps, v.tulsi)`) and vertex counts —
   don't make either more than 25% worse. Print before/after counts of trees, vertices, meshes.
Run `npm run check` (must print CHECK OK) before finishing. Report which species are where.
