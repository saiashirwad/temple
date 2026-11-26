// Downloads CC0 models from Poly Haven (polyhaven.com), shrinks them for the scene and packs
// each into one .glb in public/models: textures resized and re-encoded as WebP, meshes
// simplified to a triangle budget, unused data dropped.
//   npx tsx tools/models/fetch.ts [names]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, join, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { MODELS } from './list.ts';

const OUT = new URL('../../public/models/', import.meta.url).pathname;
const CACHE = '/tmp/phm/';
mkdirSync(OUT, { recursive: true });

const get = async (url: string, file: string) => {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
};

const resize = (bytes: Uint8Array, size: number, quality: number) => {
  writeFileSync('/tmp/mt_in', bytes);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', '/tmp/mt_in', '-vf', `scale=${size}:${size}:flags=lanczos`, '-c:v', 'libwebp', '-quality', `${quality}`, '-f', 'webp', '/tmp/mt_out.webp']);
  return new Uint8Array(readFileSync('/tmp/mt_out.webp'));
};

const only = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const m of MODELS) {
  if (only.length && !only.includes(m.name)) continue;
  const t0 = Date.now();
  const files = (await (await fetch(`https://api.polyhaven.com/files/${m.id}`)).json()) as {
    gltf: Record<string, { gltf: { url: string; include: Record<string, { url: string }> } }>;
  };
  const g = files.gltf['1k']!.gltf;
  const dir = `${CACHE}${m.id}/`;
  const main = `${dir}${m.id}.gltf`;
  await get(g.url, main);
  await Promise.all(Object.entries(g.include).map(([rel, f]) => get(f.url, dir + rel)));
  const doc = await io.read(main);
  await doc.transform(flatten());
  const root = doc.getRoot();
  const scene = root.listScenes()[0]!;
  if (m.keep) for (const n of root.listNodes()) if (n.getMesh() && !n.getName().startsWith(m.keep)) n.dispose();
  await doc.transform(prune());
  // Stand the model on the ground at the origin
  const box = getBounds(scene);
  const shift = [-(box.min[0] + box.max[0]) / 2, -box.min[1], -(box.min[2] + box.max[2]) / 2];
  for (const n of scene.listChildren()) {
    const t = n.getTranslation();
    n.setTranslation([t[0] + shift[0]!, t[1] + shift[1]!, t[2] + shift[2]!]);
  }
  const before = tris(doc);
  await doc.transform(dedup(), join(), weld());
  if (before > m.tris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: m.tris / before, error: 0.004, lockBorder: false }));
  doc.createExtension(EXTTextureWebP).setRequired(true);
  for (const t of doc.getRoot().listTextures()) {
    const isColour = doc.getRoot().listMaterials().some((mat) => mat.getBaseColorTexture() === t);
    t.setImage(resize(t.getImage()!, m.size, isColour ? 82 : 88)).setMimeType('image/webp').setURI('');
  }
  await doc.transform(prune());
  const out = `${OUT}${m.name}.glb`;
  await io.write(out, doc);
  const b = getBounds(doc.getRoot().listScenes()[0]!);
  const dims = [0, 1, 2].map((k) => (b.max[k]! - b.min[k]!).toFixed(2)).join('×');
  console.log(`${m.name.padEnd(14)} ${dims} m, ${before} → ${tris(doc)} tris, ${(statSync(out).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function tris(doc: Awaited<ReturnType<NodeIO['read']>>) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
  return n;
}
