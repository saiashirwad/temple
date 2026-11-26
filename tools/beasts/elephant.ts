// Turns AnimalAnimator's rigged African elephant bull (CC BY 4.0) into the game's Asian elephant:
// smaller ears (an Asian elephant's are about half the area, and don't reach the shoulder), a
// lighter mesh, and textures sized for a night scene. Two files: a tusker, and a cow with no tusks.
//   source: ~/beasts-src/elephant.glb from
//   https://github.com/animalanimator/african-elephant-rig-blender/releases (v3.0)
// Run: nice npx tsx tools/beasts/elephant.ts
import { mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NodeIO, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = join(homedir(), 'beasts-src', 'elephant.glb');
const OUT = join(import.meta.dirname, '../../public/beasts');
/** Share of the triangles kept: about 22k of the body's 78k. */
const KEEP = 0.28;
/** How much of the way to the ear root each ear vertex moves, at full ear weight. */
const EAR_SHRINK = 0.38;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptSimplifier });

type V3 = [number, number, number];

/** Each joint's position in the bind pose, from the inverse of its inverse bind matrix. */
function bindPositions(skin: ReturnType<ReturnType<import('@gltf-transform/core').Document['getRoot']>['listSkins']>[number]) {
  const ibm = skin.getInverseBindMatrices()!;
  return skin.listJoints().map((_, j) => {
    const m = ibm.getElement(j, []) as number[];
    // m = [R|t]^-1 with R orthonormal times scale: position = -R^T t / s^2
    const r = [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!];
    const t = [m[12]!, m[13]!, m[14]!];
    const s2 = r[0]! * r[0]! + r[1]! * r[1]! + r[2]! * r[2]!;
    return [
      -(r[0]! * t[0]! + r[1]! * t[1]! + r[2]! * t[2]!) / s2,
      -(r[3]! * t[0]! + r[4]! * t[1]! + r[5]! * t[2]!) / s2,
      -(r[6]! * t[0]! + r[7]! * t[1]! + r[8]! * t[2]!) / s2,
    ] as V3;
  });
}

/** Pulls each ear's vertices in toward its root, by how much the ear's joints hold them. */
function asianEars(prim: Primitive, names: string[], at: V3[]) {
  const pos = prim.getAttribute('POSITION')!;
  const joints = prim.getAttribute('JOINTS_0')!;
  const weights = prim.getAttribute('WEIGHTS_0')!;
  const roots = { L: at[names.indexOf('DEF-ear_root.L')]!, R: at[names.indexOf('DEF-ear_root.R')]! };
  const side = names.map((n) => (n.startsWith('DEF-ear') ? (n.endsWith('.L') ? 'L' : 'R') : null));
  const p: number[] = [];
  const j: number[] = [];
  const w: number[] = [];
  let moved = 0;
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p);
    joints.getElement(i, j);
    weights.getElement(i, w);
    let ear = 0;
    let s: 'L' | 'R' = 'L';
    for (let k = 0; k < 4; k++) {
      const sd = side[j[k]!];
      if (sd && w[k]! > 0) {
        ear += w[k]!;
        s = sd;
      }
    }
    if (ear <= 0) continue;
    const root = roots[s];
    // Pulled in more toward the bottom and back edges, where an African ear reaches furthest
    const f = 1 - EAR_SHRINK * ear;
    pos.setElement(i, [root[0] + (p[0]! - root[0]) * f, root[1] + (p[1]! - root[1]) * f, root[2] + (p[2]! - root[2]) * f]);
    moved++;
  }
  return moved;
}

/**
 * Asian cows have only tushes, short tusks that barely show past the lip. Each tusk's vertices
 * (pale texels, in front of the head, below the eye) slide back along the tusk to its sheath.
 */
function tushes(prim: Primitive, isIvory: (u: number, v: number) => boolean) {
  const pos = prim.getAttribute('POSITION')!;
  const uv = prim.getAttribute('TEXCOORD_0')!;
  const idx = prim.getIndices()!;
  const n = pos.getCount();
  const p: number[] = [];
  const t: number[] = [];
  const tusk = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    pos.getElement(i, p);
    uv.getElement(i, t);
    if (p[2]! > 2.45 && p[1]! < 2.4 && p[1]! > 0.6 && Math.abs(p[0]!) > 0.08 && isIvory(t[0]!, t[1]!)) tusk[i] = 1;
  }
  // Grow once over triangles, so no pale sliver is left behind on the tusk's edge
  const grow = tusk.slice();
  for (let k = 0; k < idx.getCount(); k += 3) {
    const a = idx.getScalar(k);
    const b = idx.getScalar(k + 1);
    const c = idx.getScalar(k + 2);
    if (tusk[a]! + tusk[b]! + tusk[c]! >= 2) grow[a] = grow[b] = grow[c] = 1;
  }
  // Each side's sheath: the tusk's rearmost point
  const root = { [-1]: [0, 0, 99], [1]: [0, 0, 99] } as Record<number, number[]>;
  for (let i = 0; i < n; i++) {
    if (!grow[i]) continue;
    pos.getElement(i, p);
    const side = p[0]! < 0 ? -1 : 1;
    if (p[2]! < root[side]![2]!) root[side] = p.slice();
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!grow[i]) continue;
    pos.getElement(i, p);
    const r = root[p[0]! < 0 ? -1 : 1]!;
    const f = 0.16;
    pos.setElement(i, [r[0]! + (p[0]! - r[0]!) * f, r[1]! + (p[1]! - r[1]!) * f, r[2]! + (p[2]! - r[2]!) * f]);
    moved++;
  }
  return moved;
}

async function build(tusks: boolean) {
  await MeshoptSimplifier.ready;
  const doc = await io.read(SRC);
  const root = doc.getRoot();
  const skin = root.listSkins()[0]!;
  const names = skin.listJoints().map((n) => n.getName());
  const at = bindPositions(skin);
  const body = root.listMeshes().find((m) => m.getName().startsWith('African'))!;
  const prim = body.listPrimitives()[0]!;
  console.log('ears moved', asianEars(prim, names, at), 'vertices');

  if (!tusks) {
    // Ivory is pale and unsaturated next to the grey skin; find it in a small copy of the texture
    const tex = prim.getMaterial()!.getBaseColorTexture()!;
    const { data, info } = await sharp(Buffer.from(tex.getImage()!)).resize(512, 512).raw().toBuffer({ resolveWithObject: true });
    const isIvory = (u: number, v: number) => {
      const x = Math.min(511, Math.max(0, Math.floor(u * 512)));
      const y = Math.min(511, Math.max(0, Math.floor(v * 512)));
      const o = (y * 512 + x) * info.channels;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      return (r + g + b) / 3 > 140;
    };
    console.log('tusk vertices drawn back', tushes(prim, isIvory));
  }

  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: KEEP, error: 0.002, lockBorder: false }));

  // The roughness map adds little at night; the material keeps a flat roughness instead
  for (const m of root.listMaterials()) {
    m.setMetallicRoughnessTexture(null);
    m.setRoughnessFactor(0.92);
    m.setMetallicFactor(0);
  }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86, resize: [2048, 2048], pattern: /basecolor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90, resize: [1024, 1024], pattern: /normal/ }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86, resize: [256, 256], pattern: /^eye/ }),
  );
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) console.log(' ', m.getName(), (p.getIndices()!.getCount() / 3) | 0, 'tris');
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, tusks ? 'tusker.glb' : 'cow.glb');
  await io.write(file, doc);
  console.log(file, (statSync(file).size / 1e6).toFixed(2), 'MB');
}


await build(false);
