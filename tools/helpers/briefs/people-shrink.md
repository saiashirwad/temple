Read tools/helpers/briefs/_writer.md first: you are a writer.
Your files: a new `tools/people/shrink.ts`, and the files under `public/people/` (GLBs you rewrite).
Don't edit anything in src/.
Goal: cut the download of public/people (≈29 MB: 18 avatar GLBs + clips/) by post-processing the
existing GLBs with @gltf-transform (core/extensions/functions are installed), without the
original sources (FBX2glTF is not available). Write `tools/people/shrink.ts` that:
- backs up each file once to `/home/bashtv/people-orig/` (never overwrite a backup) and always
  reads from the backup, so it's safe to re-run;
- avatars: resize every embedded image larger than 512 px to 512 (decode/encode with ffmpeg via
  execFileSync, like tools/tex/bake.ts does; keep JPEG as JPEG; keep PNG-with-alpha as PNG, or
  WebP with EXT_texture_webp only if you check node_modules/@typegpu/kit/docs/kit/gltf.md says
  the kit reads it); then `prune()`, `dedup()`;
- clips (public/people/clips/*.glb): `resample()` then `prune()`;
- do NOT quantize skinned meshes, do NOT change skeletons, bone names, morph targets or mesh
  topology, and keep material/texture slot structure identical (src/people.ts reads them — read
  it to see what it relies on).
- prints bytes before/after per file and totals.
Run it with `npx tsx tools/people/shrink.ts` (1 CPU, ~1 GB RAM: process one file at a time, and
use `nice`). Then verify each output loads with @gltf-transform's NodeIO and has the same node,
skin, animation and mesh counts as its backup (write that check into the script too).
Report the before/after totals.
