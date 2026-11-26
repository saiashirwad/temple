// Every file the game loads exists, and nothing ships that the game never loads. No GPU needed.
//   npx tsx tools/check/assets.ts        (exit 1 on a missing or unused file)
// Uses production asset catalogs and the prop names emitted by the world builders.
import { z } from 'zod';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { AVATARS, CLIP_NAMES, SOUND_FILES, BEAST_FILES } from '../../src/content/assets.ts';
import { buildStreet } from '../../src/world/town/street.ts';
import { buildGrounds } from '../../src/world/town/grounds.ts';
import { buildVillage } from '../../src/world/town/village.ts';
import { TEX_LAYERS } from '../../src/generated/textures.gen.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const PUB = join(ROOT, 'public');
const want = new Set<string>();
const resources = z.array(z.object({ uri: z.string().optional() })).optional();
const modelFiles = z.object({ buffers: resources, images: resources });

for (const build of [buildStreet, buildGrounds, buildVillage]) {
  for (const prop of build().props) {
    const gltf = `models/${prop.name}.gltf`;

    if (want.has(gltf)) continue;

    if (!existsSync(join(PUB, gltf))) {
      want.add(`models/${prop.name}.glb`);
      continue;
    }

    want.add(gltf);
    const model = modelFiles.parse(JSON.parse(readFileSync(join(PUB, gltf), 'utf8')));

    for (const resource of [...model.buffers ?? [], ...model.images ?? []]) {
      if (resource.uri && !resource.uri.startsWith('data:')) want.add(join(dirname(gltf), resource.uri));
    }
  }
}

// Textures: every layer at both colour sizes, and its 512 data map
for (const name of [...TEX_LAYERS.map((l) => l.name), 'posters', 'signs'])
  for (const f of [`${name}_512_c.webp`, `${name}_1024_c.webp`, `${name}_512_d.jpg`]) want.add(`tex/${f}`);

want.add('tex/trail.png');

// People: avatar files and the clip names for both bodies
for (const { file } of Object.values(AVATARS)) want.add(`people/${file}.glb`);

for (const sex of ['m', 'f']) for (const clip of CLIP_NAMES) want.add(`people/clips/${sex}_${clip}.glb`);

for (const path of Object.values(BEAST_FILES)) want.add(path);

for (const name of SOUND_FILES) want.add(`sound/${name}.mp3`);

const have: string[] = [];

const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);

    if (statSync(p).isDirectory()) walk(p);
    else have.push(relative(PUB, p));
  }
};

walk(PUB);

const isNote = (f: string) => /CREDITS|LICENSE|README/i.test(f);
const missing = [...want].filter((f) => !have.includes(f));
const unused = have.filter((f) => !want.has(f) && !isNote(f));

// Full asset catalog by folder and colour resolution. The first frame uses a subset.
const size = (f: string) => statSync(join(PUB, f)).size;
const mb = (n: number) => (n / 1048576).toFixed(1).padStart(5) + ' MB';
const folders = new Map<string, number>();

for (const f of have) {
  const k = f.split('/').slice(0, f.startsWith('people/clips') ? 2 : 1).join('/');
  folders.set(k, (folders.get(k) ?? 0) + size(f));
}

for (const [k, n] of [...folders].sort((a, b) => b[1] - a[1])) console.log(`${mb(n)}  ${k}`);

const loaded = [...want].filter((f) => have.includes(f));
const total = (skip: string) => loaded.filter((f) => !f.includes(skip)).reduce((n, f) => n + size(f), 0);

console.log(`catalog at one resolution: 1024 colour ${mb(total('_512_c.'))}, 512 colour ${mb(total('_1024_c.'))}, ${loaded.length - TEX_LAYERS.length - 2} files`);

for (const f of missing) console.log(`MISSING ${f}`);

for (const f of unused) console.log(`UNUSED  ${f}`);

if (missing.length || unused.length) process.exit(1);

console.log('assets OK');
