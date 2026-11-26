// Replaces baked layers with CC0 photo-scanned materials from Poly Haven (polyhaven.com):
// colour × ambient occlusion in sRGB (alpha: metalness for metal layers, else 1 = takes the
// mesh tint), and the DirectX normal's x, y with roughness, in the same files bake.ts writes.
//   npx tsx tools/tex/photo.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const PHOTO: Record<string, { id: string; metres: number }> = {
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
const OUT = new URL('../../public/tex/', import.meta.url).pathname;
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

const means: Record<string, number[]> = {};

for (const [name, { id }] of Object.entries(PHOTO)) {
  const files = (await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()) as Record<string, Record<string, Record<string, { url: string }>>>;
  const pick = (map: string) => files[map]!['1k']!['jpg']?.url ?? files[map]!['1k']!['png']!.url;
  const diff = `${CACHE}${id}_diff.jpg`;
  const nor = `${CACHE}${id}_nor.jpg`;
  const arm = `${CACHE}${id}_arm.jpg`;
  await get(pick('Diffuse'), diff);
  await get(pick('nor_dx'), nor);
  await get(pick('arm'), arm);
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

  means[name] = mean.map((m) => +(m / (S * S)).toFixed(4));
  writeFileSync('/tmp/pa.raw', albedo);
  writeFileSync('/tmp/pd.raw', data);

  for (const size of [1024, 512]) {
    const scale = size === S ? [] : ['-vf', `scale=${size}:${size}:flags=lanczos`];
    ff(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', '/tmp/pa.raw', ...scale, '-c:v', 'libwebp', '-quality', '86', `${OUT}${name}_${size}_c.webp`]);

    if (size === 512) ff(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${S}x${S}`, '-i', '/tmp/pd.raw', ...scale, '-pix_fmt', 'yuvj444p', '-q:v', '4', `${OUT}${name}_${size}_d.jpg`]); // only the 512 data map is ever loaded (src/render/tex.ts)
  }

  console.log(name, id, means[name]);
}

// Record each photo's size and mean colour in the generated index
const gen = new URL('../../src/generated/textures.gen.ts', import.meta.url).pathname;
const src = readFileSync(gen, 'utf8');
const m = src.match(/export const TEX_LAYERS = (.*) as const;/)!;
const layers = JSON.parse(m[1]!) as { name: string; metres: number; metal: boolean; mean: number[]; photo?: string }[];

for (const l of layers) {
  const p = PHOTO[l.name];

  if (!p) continue;
  l.metres = p.metres;
  l.mean = means[l.name]!;
  l.photo = p.id;
}

writeFileSync(gen, src.replace(m[0], `export const TEX_LAYERS = ${JSON.stringify(layers)} as const;`));
