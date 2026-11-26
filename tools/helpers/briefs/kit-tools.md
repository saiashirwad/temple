Survey the TypeGPU Kit for features this project is NOT using but should, for performance and
cleaner code. First list kit docs (`node_modules/@typegpu/kit/docs/kit/*.md`, `recipes/*.md`,
`concepts/*.md`) and read the ones relevant to: instances/culling/LOD (instances.md,
impostors.md, mesh-pool.md, meshes.md), lighting.md, shadows.md, particles.md, taa.md/fxaa.md,
finish.md, baker.md, mipmaps.md, live-lists.md, machines.md, coroutines.md, sorter.md,
profiler.md, counters.md, frames.md, events.md, table.md, poses.md. Then grep `src/` for which
kit modules are imported (`from '@typegpu/kit'` and what's destructured/used) and find places
where hand-rolled code duplicates a kit feature (e.g. custom far-light billboards, custom
smoothing/state machines, CPU instance writes each frame, manual LOD, custom particle code,
timers via setTimeout). For each recommendation: the kit doc + API, the project code it
replaces, and the expected perf/code win. Especially look for ways to cut mesh-pool usage
(impostors for distant trees/houses, merging static meshes) and phone GPU cost.
