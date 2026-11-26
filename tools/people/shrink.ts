// Shrinks the townsfolk files in public/people without their sources (FBX2glTF isn't needed):
// avatars get their textures over 512 px scaled down to 512, clips get their keyframes resampled.
// Skeletons, bone names, morph targets, mesh topology and material/texture slots are left as they
// are (src/render/actors/people.ts and the kit read them), and nothing is quantized.
//
//   nice npx tsx tools/people/shrink.ts
//
// Each file is backed up once to ~/people-orig/ (a backup is never overwritten) and always read
// from there, so re-running starts from the originals. Every output is read back and compared
// with its backup; any mismatch throws and leaves the original in place.

import { execFileSync } from 'node:child_process';
import { copyFileSync, constants, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';

const OUT = 'public/people';
const BACKUP = join(homedir(), 'people-orig');
const MAX = 512;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// Keep every node (leaf bones like the nubs too), attribute, index and texture slot
const PRUNE = { keepLeaves: true, keepAttributes: true, keepIndices: true, keepSolidTextures: true, keepExtras: true };

const ff = (args: string[], input: Uint8Array) =>
  new Uint8Array(execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input, maxBuffer: 64 << 20 }));

/** Scales one embedded image so its longer side is MAX, keeping its format (and PNG's alpha). */
function shrinkImage(image: Uint8Array, mime: string, w: number, h: number): Uint8Array | null {
  const s = MAX / Math.max(w, h);
  const W = Math.max(1, Math.round(w * s));
  const H = Math.max(1, Math.round(h * s));
  const scale = ['-vf', `scale=${W}:${H}:flags=lanczos`];
  if (mime === 'image/jpeg') return ff(['-f', 'jpeg_pipe', '-i', 'pipe:0', ...scale, '-q:v', '2', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], image);
  if (mime === 'image/png') return ff(['-f', 'png_pipe', '-i', 'pipe:0', ...scale, '-f', 'image2pipe', '-c:v', 'png', '-pred', 'mixed', 'pipe:1'], image);
  return null;
}

async function shrinkAvatar(doc: Document) {
  for (const t of doc.getRoot().listTextures()) {
    const size = t.getSize();
    const image = t.getImage();
    if (!size || !image || Math.max(size[0], size[1]) <= MAX) continue;
    const out = shrinkImage(image, t.getMimeType(), size[0], size[1]);
    if (!out) {
      console.warn(`  ${t.getName() || t.getURI()}: ${t.getMimeType()} left as is`);
      continue;
    }
    if (out.byteLength < image.byteLength) t.setImage(out);
  }
  await doc.transform(prune(PRUNE), dedup({ keepUniqueNames: true }));
}

async function shrinkClip(doc: Document) {
  // cleanup: false, as its own prune would drop leaf bones
  await doc.transform(resample({ cleanup: false }), prune(PRUNE), dedup({ keepUniqueNames: true }));
}

/** What src/render/actors/people.ts and the kit rely on; must match between backup and output. */
function shape(doc: Document) {
  const r = doc.getRoot();
  return JSON.stringify({
    nodes: r.listNodes().map((n) => n.getName()),
    skins: r.listSkins().map((s) => s.listJoints().map((j) => j.getName())),
    animations: r.listAnimations().map((a) => [a.getName(), a.listChannels().map((c) => `${c.getTargetNode()?.getName()}.${c.getTargetPath()}`)]),
    meshes: r.listMeshes().map((m) =>
      m.listPrimitives().map((p) => ({
        attrs: p.listSemantics(),
        verts: p.getAttribute('POSITION')?.getCount(),
        indices: p.getIndices()?.getCount(),
        targets: p.listTargets().length,
        material: p.getMaterial()?.getName(),
      })),
    ),
    materials: r.listMaterials().map((m) => [
      m.getName(),
      !!m.getBaseColorTexture(),
      !!m.getNormalTexture(),
      !!m.getMetallicRoughnessTexture(),
      !!m.getEmissiveTexture(),
      !!m.getOcclusionTexture(),
      m.getAlphaMode(),
    ]),
    textures: r.listTextures().length,
  });
}

function counts(doc: Document) {
  const r = doc.getRoot();
  return [r.listNodes().length, r.listSkins().length, r.listAnimations().length, r.listMeshes().length];
}

const files = [
  ...readdirSync(OUT).filter((f) => f.endsWith('.glb')).map((f) => ({ rel: f, clip: false })),
  ...readdirSync(join(OUT, 'clips')).filter((f) => f.endsWith('.glb')).map((f) => ({ rel: join('clips', f), clip: true })),
];

let before = 0;
let after = 0;
for (const { rel, clip } of files) {
  const src = join(OUT, rel);
  const orig = join(BACKUP, rel);
  if (!existsSync(orig)) {
    mkdirSync(join(orig, '..'), { recursive: true });
    copyFileSync(src, orig, constants.COPYFILE_EXCL);
  }
  const doc = await io.read(orig);
  await (clip ? shrinkClip(doc) : shrinkAvatar(doc));
  const bytes = await io.writeBinary(doc);

  const ref = await io.read(orig);
  const back = await io.readBinary(bytes);
  const [a, b] = [counts(ref), counts(back)];
  if (a.join() !== b.join()) throw new Error(`${rel}: nodes/skins/animations/meshes ${a} became ${b}`);
  if (shape(ref) !== shape(back)) throw new Error(`${rel}: structure changed`);

  writeFileSync(src, bytes);
  const was = statSync(orig).size;
  before += was;
  after += bytes.byteLength;
  console.log(`${rel.padEnd(40)} ${(was / 1024).toFixed(0).padStart(6)} KB -> ${(bytes.byteLength / 1024).toFixed(0).padStart(6)} KB  (n/s/a/m ${b.join('/')})`);
}
const mb = (n: number) => (n / 1048576).toFixed(2);
console.log(`total ${mb(before)} MB -> ${mb(after)} MB (${((1 - after / before) * 100).toFixed(0)}% smaller)`);
