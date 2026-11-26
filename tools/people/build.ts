// Builds the townsfolk from Microsoft's Rocketbox avatar library (MIT licence): downloads each
// chosen avatar's FBX and colour maps, converts it with FBX2glTF, warms the skin to Kerala tones
// dresses each in Kerala clothes (see garments.ts), packs the textures in, and converts the
// animations the town uses into clip files that share the avatars' Bip01 rig.
//
//   npx tsx tools/people/build.ts            build what is missing
//   FBX2GLTF=~/tools/FBX2glTF                where the converter is (default ~/tools/FBX2glTF)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import { ATLAS, attach, blackenHair, buildCarry, buildGarments, L, labelMap, paintAtlas, repaintBody, type Outfit } from './garments.ts';

const REPO = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets';
const CACHE = '/tmp/rbcache';
const OUT = 'public/people';
const FBX2GLTF = process.env.FBX2GLTF ?? `${homedir()}/tools/FBX2glTF`;

const KASAVU = 0xeee3c8;
const GOLD = 0xc9993f;
const WHITE = 0xf0ede4;
/** Each townsperson's look: which scan, how deep the skin, and what they wear. */
export const AVATARS: { name: string; base: string; skin: number; outfit: Outfit }[] = [
  // Devotees: bare-chested in a kasavu mundu, a thorthu over the shoulder, barefoot
  { name: 'dev_m11', base: 'Male_Adult_11', skin: 0.65, outfit: { top: { kind: 'bare', color: 0 }, skirt: { kind: 'mundu', color: KASAVU, border: GOLD }, thorthu: 0xe9e2cf, barefoot: true } },
  { name: 'lamp_m08', base: 'Male_Adult_08', skin: 0.7, outfit: { top: { kind: 'bare', color: 0 }, skirt: { kind: 'mundu', color: WHITE, border: GOLD }, thorthu: 0xd9cfb4, barefoot: true } },
  // The tea shop
  { name: 'tea_m15', base: 'Male_Adult_15', skin: 0.85, outfit: { top: { kind: 'half', color: 0xd8d2c0, check: 0x9a8a6a }, skirt: { kind: 'lungi', color: 0x2a3e6a, check: 0x6a8ab0, folded: true } } },
  { name: 'home_m12', base: 'Male_Adult_12', skin: 0.9, outfit: { top: { kind: 'bare', color: 0 }, skirt: { kind: 'mundu', color: WHITE, border: 0x9a8a5a }, thorthu: 0xe9e2cf, barefoot: true } },
  { name: 'tea_m09', base: 'Male_Adult_12', skin: 0.9, outfit: { top: { kind: 'half', color: 0xa9c4dc }, skirt: { kind: 'mundu', color: WHITE, border: 0x9a8a5a } } },
  { name: 'tea_m01', base: 'Male_Adult_01', skin: 0.65, outfit: { top: { kind: 'half', color: 0xc9a77a, check: 0x7a5a3a }, skirt: { kind: 'lungi', color: 0x2f5a3a, check: 0x88a070 } } },
  { name: 'tea_m17', base: 'Male_Adult_06', skin: 0.85, outfit: { top: { kind: 'shirt', color: 0xeeeeea }, skirt: { kind: 'mundu', color: WHITE, border: GOLD } } },
  // Walking home
  { name: 'lane_m01', base: 'Male_Adult_01', skin: 0.65, outfit: { top: { kind: 'half', color: 0x5a6a4a }, skirt: { kind: 'lungi', color: 0x4a2a3a, check: 0x9a6a5a, folded: true }, carry: { kind: 'torch', side: 'R' } } },
  { name: 'road_m08', base: 'Male_Adult_08', skin: 0.7, outfit: { top: { kind: 'shirt', color: 0x7a3038 }, skirt: { kind: 'mundu', color: WHITE, border: 0x9a8a5a }, carry: { kind: 'bag', side: 'L', color: 0x2a6ab0 } } },
  // At the mosque: white, with a crochet thoppi
  { name: 'mosque_m15', base: 'Male_Adult_15', skin: 0.85, outfit: { top: { kind: 'shirt', color: 0xf2f0ea }, skirt: { kind: 'mundu', color: WHITE }, cap: true } },
  { name: 'mosque_m11', base: 'Male_Adult_11', skin: 0.65, outfit: { top: { kind: 'shirt', color: 0xe6e8ea }, skirt: { kind: 'lungi', color: 0x6a2a2a, check: 0x3a2a4a }, cap: true } },
  // At his gate, in a half-sleeve shirt and lungi
  { name: 'home_m09', base: 'Male_Adult_08', skin: 0.7, outfit: { top: { kind: 'half', color: 0x8aa0b0 }, skirt: { kind: 'lungi', color: 0x3a4a7a, check: 0xa0a8c0 }, carry: { kind: 'umbrella', side: 'R' } } },
  // Women at the temple: the cream and gold set-sari, jasmine in the hair
  { name: 'dev_f15', base: 'Female_Adult_15', skin: 0.65, outfit: { top: { kind: 'blouse', color: 0x2f6a3a }, skirt: { kind: 'sari', color: KASAVU, border: GOLD }, pallu: { color: KASAVU, border: GOLD }, jasmine: true, barefoot: true, carry: { kind: 'basket', side: 'L' } } },
  { name: 'dev_f06', base: 'Female_Adult_04', skin: 0.7, outfit: { top: { kind: 'blouse', color: 0x7a1f2a }, skirt: { kind: 'sari', color: KASAVU, border: GOLD }, pallu: { color: KASAVU, border: GOLD }, jasmine: true, barefoot: true } },
  { name: 'gate_f02', base: 'Female_Adult_02', skin: 0.65, outfit: { top: { kind: 'blouse', color: 0xa02a2a }, skirt: { kind: 'sari', color: KASAVU, border: 0xa02a2a }, pallu: { color: KASAVU, border: 0xa02a2a }, jasmine: true, carry: { kind: 'basket', side: 'L' } } },
  { name: 'road_f11', base: 'Female_Adult_11', skin: 0.78, outfit: { top: { kind: 'blouse', color: 0x2a3f8a }, skirt: { kind: 'sari', color: 0x2a3a7a, border: GOLD }, pallu: { color: 0x2a3a7a, border: GOLD }, carry: { kind: 'tiffin', side: 'L' } } },
  // At home, lighting the tulsi lamp in a nightie, one with her head covered
  { name: 'home_f06', base: 'Female_Adult_06', skin: 0.72, outfit: { top: { kind: 'nightie', color: 0x7a2e4a, floral: 0xd8b060 }, skirt: { kind: 'nightie', color: 0x7a2e4a }, barefoot: true } },
  { name: 'home_f11', base: 'Female_Adult_11', skin: 0.78, outfit: { top: { kind: 'nightie', color: 0x3a5a8a, floral: 0xe8e0c0 }, skirt: { kind: 'nightie', color: 0x3a5a8a }, barefoot: true } },
];
/** Where each top's sleeves end, as |x| in bind space. */
const SLEEVE = { bare: 0, shirt: 9, half: 0.36, banian: 0.2, blouse: 0.27, nightie: 0.33 } as const;
export const CLIPS = ['walk_neutral_01', 'walk_slow_01', 'idle_neutral_01', 'idle_neutral_02', 'gestic_talk_neutral_01', 'sit_chair_idle_neutral_01', 'crouch_idle', 'idle_look_around_01'];

mkdirSync(CACHE, { recursive: true });
mkdirSync(`${OUT}/clips`, { recursive: true });
const tree = JSON.parse(readFileSync('/tmp/rb.json', 'utf8')).tree as { path: string }[];
const find = (test: (p: string) => boolean) => tree.find((t) => test(t.path))?.path;
const fetchTo = (path: string, file: string) => {
  if (existsSync(file)) return;
  const url = `${REPO}/${path.split('Assets/')[1]!.split('/').map(encodeURIComponent).join('/')}`;
  execFileSync('curl', ['-sfL', '--retry', '3', '-o', file, url]);
};

/** Reads a texture as raw RGB(A) at `size`, through ffmpeg. */
const raw = (file: string, size: number, alpha: boolean) =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', alpha ? 'rgba' : 'rgb24', '-'], { maxBuffer: 1 << 26 });
const encode = (px: Buffer, size: number, alpha: boolean, out: string) => {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', alpha ? 'rgba' : 'rgb24', '-s', `${size}x${size}`, '-i', '-', ...(alpha ? [] : ['-q:v', '3']), out], { input: px });
  return readFileSync(out);
};

/** Skin is warm, moderately saturated and fairly light: this finds it and deepens it, and says where it was. */
function recolour(px: Buffer, deepen: number) {
  const mask = new Uint8Array(px.length / 3);
  for (let i = 0; i < px.length; i += 3) {
    const r = px[i]! / 255;
    const g = px[i + 1]! / 255;
    const b = px[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    let hue = 0;
    if (max !== min) {
      if (max === r) hue = ((g - b) / (max - min)) * 60;
      else if (max === g) hue = (2 + (b - r) / (max - min)) * 60;
      else hue = (4 + (r - g) / (max - min)) * 60;
    }
    if (hue < 0) hue += 360;
    const skin = max === r && hue > 4 && hue < 40 && sat > 0.12 && sat < 0.62 && max > 0.3;
    if (skin) {
      // Toward a warm Kerala brown, keeping the texture's light and shade
      mask[i / 3] = 1;
      const k = 1 - deepen * 0.55;
      px[i] = Math.round(255 * Math.min(1, r * k * 0.96));
      px[i + 1] = Math.round(255 * Math.min(1, g * k * 0.8));
      px[i + 2] = Math.round(255 * Math.min(1, b * k * 0.68));
    }
  }
  return mask;
}

const io = new NodeIO();
for (const a of AVATARS) {
  const out = `${OUT}/${a.name}.glb`;
  if (existsSync(out)) continue;
  const dir = `${CACHE}/${a.base}`;
  mkdirSync(dir, { recursive: true });
  const fbx = find((p) => p.startsWith('Assets/Avatars/') && p.endsWith(`/Export/${a.base}.fbx`))!;
  fetchTo(fbx, `${dir}/a.fbx`);
  const tex = (part: string) => find((p) => p.startsWith('Assets/Avatars/') && p.includes(`/${a.base}/Textures/`) && p.endsWith(`_${part}.tga`))!;
  for (const part of ['body_color', 'head_color', 'opacity_color']) if (tex(part)) fetchTo(tex(part), `${dir}/${part}.tga`);
  if (!existsSync(`${dir}/a.glb`)) execFileSync(FBX2GLTF, ['-b', '-o', `${dir}/a`, `${dir}/a.fbx`], { stdio: 'ignore' });
  const doc = await io.read(`${dir}/a.glb`);
  const root = doc.getRoot();
  const image = (bytes: Uint8Array, mime: string, name: string) => doc.createTexture(name).setImage(bytes).setMimeType(mime);
  const mesh = root.listMeshes()[0]!;
  const prims = mesh.listPrimitives();
  const primOf = (end: string) => prims.find((p) => p.getMaterial()!.getName().endsWith(end));
  const bodyP = primOf('_body')!;
  const headP = primOf('_head')!;
  const hairP = primOf('_opacity');
  const arr = (p: typeof bodyP, k: string) => p.getAttribute(k)!.getArray() as Float32Array;
  const skin = root.listSkins()[0]!;
  const joints = skin.listJoints();
  const joint = (n: string): [number, number, number] => {
    const m = joints.find((j) => j.getName() === n)!.getWorldMatrix();
    return [m[12], -m[14], m[13]];
  };
  const jointIndex = (n: string) => joints.findIndex((j) => j.getName() === n);
  const cat = (...xs: Float32Array[]) => {
    const o = new Float32Array(xs.reduce((s, x) => s + x.length, 0));
    let k = 0;
    for (const x of xs) o.set(x, (k += x.length) - x.length);
    return o;
  };
  const headPts = hairP ? cat(arr(headP, 'POSITION'), arr(hairP, 'POSITION')) : arr(headP, 'POSITION');
  const female = a.base.startsWith('Female');
  const o = a.outfit;
  const pelvis = joint('Bip01 Pelvis');
  const headJ = joint('Bip01 Head');

  // The scan's clothes repainted: legs to the skirt's cloth, the top to its colour or to skin
  const SIZE = 1024;
  const bodyPx = raw(`${dir}/body_color.tga`, SIZE, false);
  const mask = recolour(bodyPx, a.skin);
  const sleeve = SLEEVE[o.top.kind];
  const clav = joint('Bip01 L Clavicle')[2];
  const neck = joint('Bip01 Neck');
  /** A sari blouse: a scooped neck front and back, short sleeves, a band of waist bare above the skirt. */
  const blouseBare = (x: number, y: number, z: number) => {
    if (o.top.kind !== 'blouse') return false;
    const front = y < neck[1];
    if (z > clav + 0.015) return true;
    if (front && z > clav - 0.1 + Math.abs(x) * 0.5 && Math.abs(x) < 0.13) return true;
    if (!front && z > clav - 0.05 + Math.abs(x) * 0.3 && Math.abs(x) < 0.12) return true;
    return z > pelvis[2] + 0.08 && z < pelvis[2] + 0.17;
  };
  const labels = labelMap(SIZE, arr(bodyP, 'POSITION'), arr(bodyP, 'TEXCOORD_0'), bodyP.getIndices()!.getArray() as Uint32Array, ([x, y, z]) =>
    z < 0.13 ? L.foot : z < pelvis[2] + (o.skirt.kind === 'nightie' ? 0.15 : 0.06) ? L.leg : Math.abs(x) > sleeve || blouseBare(x, y, z) ? L.arm : L.torso,
  );
  repaintBody(bodyPx, SIZE, labels, { mask, outfit: o });
  const body = image(encode(bodyPx, SIZE, false, `${dir}/body-${a.name}.jpg`), 'image/jpeg', 'body');

  // Hair to near black: the scalp of the head's texture, and all of the hair cards
  const HS = 512;
  const headPx = raw(`${dir}/head_color.tga`, HS, false);
  const headMask = recolour(headPx, a.skin);
  const scalp = labelMap(HS, arr(headP, 'POSITION'), arr(headP, 'TEXCOORD_0'), headP.getIndices()!.getArray() as Uint32Array, ([, y, z]) =>
    z > headJ[2] + 0.1 || (y > headJ[1] + 0.03 && z > headJ[2] - 0.03) ? L.scalp : L.none,
  );
  blackenHair(headPx, 3, (p) => scalp[p] === L.scalp && !headMask[p]);
  const head = image(encode(headPx, HS, false, `${dir}/head-${a.name}.jpg`), 'image/jpeg', 'head');
  const hair = !tex('opacity_color') ? body : image(encode(blackenHair(raw(`${dir}/opacity_color.tga`, HS, true), 4), HS, true, `${dir}/hair-${a.name}.png`), 'image/png', 'hair');

  for (const t of root.listTextures()) if (![body, head, hair].includes(t)) t.dispose();
  for (const m of root.listMaterials()) {
    const n = m.getName();
    const t = n.endsWith('_head') ? head : n.endsWith('_opacity') ? hair : body;
    m.setBaseColorTexture(t).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(n.endsWith('_head') ? 0.6 : 0.85);
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
    if (n.endsWith('_opacity')) m.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
  }

  // The clothes themselves
  const g = buildGarments({ points: cat(arr(bodyP, 'POSITION'), headPts), torso: arr(bodyP, 'POSITION'), head: headPts, joint, jointIndex }, o, female);
  const cloth = image(encode(paintAtlas(o), ATLAS, false, `${dir}/cloth-${a.name}.jpg`), 'image/jpeg', 'cloth');
  const clothMat = doc.createMaterial('garment').setBaseColorTexture(cloth).setMetallicFactor(0).setRoughnessFactor(0.9).setDoubleSided(true);
  mesh.addPrimitive(attach(doc, bodyP, g, clothMat));
  for (const part of buildCarry({ points: cat(arr(bodyP, 'POSITION'), headPts), torso: arr(bodyP, 'POSITION'), head: headPts, joint, jointIndex }, o)) {
    const c = part.color;
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    const mat = doc.createMaterial('carried').setBaseColorFactor([lin((c >> 16) & 255), lin((c >> 8) & 255), lin(c & 255), 1]).setMetallicFactor(part.metal).setRoughnessFactor(part.rough);
    mesh.addPrimitive(attach(doc, bodyP, part.geo, mat));
  }

  await doc.transform(prune(), dedup());
  // Written aside and moved in, so the dev server never serves half a file
  await io.write(`${out}.part.glb`, doc);
  renameSync(`${out}.part.glb`, out);
  console.log(a.name, (readFileSync(out).length / 1e6).toFixed(2), 'MB', g.idx.length / 3, 'cloth triangles');
}

for (const sex of ['m', 'f']) {
  for (const c of CLIPS) {
    const out = `${OUT}/clips/${sex}_${c}.glb`;
    if (existsSync(out)) continue;
    const path = find((p) => p.startsWith('Assets/Animations/') && p.endsWith(`/${sex}_${c}.max.fbx`));
    if (!path) {
      console.warn('no clip', sex, c);
      continue;
    }
    const f = `${CACHE}/${sex}_${c}.fbx`;
    fetchTo(path, f);
    execFileSync(FBX2GLTF, ['-b', '--anim-framerate', 'bake30', '-o', `${CACHE}/${sex}_${c}`, f], { stdio: 'ignore' });
    const doc = await io.read(`${CACHE}/${sex}_${c}.glb`);
    for (const anim of doc.getRoot().listAnimations()) anim.setName(c);
    // The clip needs only its skeleton's nodes and keys
    for (const m of doc.getRoot().listMeshes()) m.dispose();
    await doc.transform(prune());
    await io.write(out, doc);
    console.log(sex, c, (readFileSync(out).length / 1e3).toFixed(0), 'kB');
  }
}
