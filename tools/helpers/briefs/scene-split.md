Audit `src/scene.ts` (≈1280 lines, the god-file that wires everything). Find how to split it into
cohesive modules (e.g. journey/story wiring, herd animation `poseHead`/`herdIds`, lamp/light
setup, sound wiring, the frame update), dead code, duplicated state (the `journey` object has
grown many fields), magic numbers that should be named, and functions doing too much. Propose
a concrete target file layout with what moves where and the interfaces between them. Also note
anything in scene.ts that is per-frame wasteful on the CPU (allocations in the frame loop,
repeated searches over arrays, Math.hypot over every item each frame, etc.).
