// Replaces baked layers with CC0 photo-scanned materials from Poly Haven (polyhaven.com):
// colour × ambient occlusion in sRGB (alpha: metalness for metal layers, else 1 = takes the
// mesh tint), and the DirectX normal's x, y with roughness, in the same files bake.ts writes.
//   npx tsx tools/tex/photo.ts
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { TEX_LAYERS } from '../../src/generated/textures.gen.ts';
import { writeMaterialMaps } from './write-maps.ts';
import { writeTextureIndex, type TextureLayer } from './metadata.ts';

export const PHOTO = {
  laterite: { id: 'red_sandstone_wall', metres: 2 },
  plaster: { id: 'painted_plaster_wall', metres: 2 },
  paint: { id: 'peeling_painted_wall', metres: 1.8 },
  concrete: { id: 'concrete_wall_008', metres: 2.71 },
  granite: { id: 'granite_wall', metres: 1.9 },
  ctile: { id: 'roof_tiles_14', metres: 1.5 },
  mtile: { id: 'clay_roof_tiles_02', metres: 2.5 },
  tin: { id: 'corrugated_iron', metres: 1.12 },
  teak: { id: 'fine_grained_wood', metres: 0.6 },
  sand: { id: 'red_dirt_mud_01', metres: 1.5 },
  earth: { id: 'red_mud_stones', metres: 1.5 },
  grass: { id: 'sparse_grass', metres: 2 },
  asphalt: { id: 'asphalt_02', metres: 3 },
  gravel: { id: 'red_laterite_soil_stones', metres: 2 },
  bark: { id: 'bark_brown_02', metres: 1 },
  palmbark: { id: 'palm_tree_bark', metres: 1.3 },
};

const METAL = new Set(['tin']);
const S = 1024;
const CACHE = '/tmp/phcache/';

mkdirSync(CACHE, { recursive: true });

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
const raw = (file: string, fmt: 'rgb24') => ff(['-i', file, '-vf', `scale=${S}:${S}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', fmt, '-']);

const get = async (url: string, file: string) => {
  if (existsSync(file)) return;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
};

const updates = new Map<string, Pick<TextureLayer, 'photo' | 'metres' | 'mean'>>();

const download = z.object({ url: z.httpUrl() });

const image = z.union([
  z.object({ jpg: download }).transform(format => format.jpg.url),
  z.object({ png: download }).transform(format => format.png.url),
]);

const sourceMap = z.object({ '1k': image });
const materialFiles = z.object({ Diffuse: sourceMap, nor_dx: sourceMap, arm: sourceMap });

for (const [name, { id, metres }] of Object.entries(PHOTO)) {
  const response = await fetch(`https://api.polyhaven.com/files/${id}`);

  if (!response.ok) throw new Error(`${id}: Poly Haven returned ${response.status}`);
  const files = materialFiles.parse(await response.json());
  const diff = `${CACHE}${id}_diff.jpg`;
  const nor = `${CACHE}${id}_nor.jpg`;
  const arm = `${CACHE}${id}_arm.jpg`;
  await get(files.Diffuse['1k'], diff);
  await get(files.nor_dx['1k'], nor);
  await get(files.arm['1k'], arm);
  const c = raw(diff, 'rgb24');
  const n = raw(nor, 'rgb24');
  const a = raw(arm, 'rgb24');

  const lin = (v: number) => {
    const s = v / 255;

    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const srgb = (x: number) => Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  const albedo = new Uint8Array(S * S * 4);
  const data = new Uint8Array(S * S * 3);
  const mean = [0, 0, 0];

  for (let i = 0; i < S * S; i++) {
    const ao = 0.35 + 0.65 * (a[i * 3]! / 255);

    for (let k = 0; k < 3; k++) {
      const v = Math.min(1, lin(c[i * 3 + k]!) * ao);
      mean[k] += v;
      albedo[i * 4 + k] = srgb(v);
    }

    albedo[i * 4 + 3] = METAL.has(name) ? Math.max(1, a[i * 3 + 2]!) : 255;
    data[i * 3] = n[i * 3]!;
    data[i * 3 + 1] = n[i * 3 + 1]!;
    data[i * 3 + 2] = a[i * 3 + 1]!;
  }

  const average = mean.map((m) => +(m / (S * S)).toFixed(4));
  updates.set(name, { metres, mean: average, photo: id });
  await writeMaterialMaps(name, S, albedo, data);
  console.log(name, id, average);
}

// Record each photo's size and mean colour in the generated index
writeTextureIndex(TEX_LAYERS.map(layer => ({ ...layer, ...updates.get(layer.name) })));
