// Every file the game loads exists, and nothing ships that the game never loads. No GPU needed.
//   npx tsx tools/check/assets.ts        (exit 1 on a missing or unused file)
// It reads the names straight out of src/ with patterns, so it doesn't run any browser code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEX_LAYERS } from '../../src/textures.gen.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const PUB = join(ROOT, 'public');
const src = (f: string) => readFileSync(join(ROOT, 'src', f), 'utf8');
const all = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.ts')).map(src).join('\n');

const want = new Set<string>();
// Props: b.prop('name', ...) anywhere in src
for (const m of all.matchAll(/prop\('([a-z0-9_]+)'/g)) want.add(`models/${m[1]}.glb`);
// Textures: every layer at both colour sizes, and its 512 data map
for (const name of [...TEX_LAYERS.map((l) => l.name), 'posters', 'signs'])
  for (const f of [`${name}_512_c.webp`, `${name}_1024_c.webp`, `${name}_512_d.jpg`]) want.add(`tex/${f}`);
want.add('tex/trail.png');
// People: avatar files and the clip names for both bodies
const people = src('people.ts');
for (const m of people.matchAll(/file: '([a-z0-9_]+)'/g)) want.add(`people/${m[1]}.glb`);
const clips = /CLIP_NAMES = \[([^\]]+)\]/.exec(people)![1]!.match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
for (const s of ['m', 'f']) for (const c of clips) want.add(`people/clips/${s}_${c}.glb`);
for (const m of (src('herd.ts') + src('pack.ts')).matchAll(/beasts\/([a-z0-9_]+\.glb)/g)) want.add(`beasts/${m[1]}`);
// Sound files
const files = /const FILES = \[([^\]]*)\]/.exec(src('sound.ts'))![1]!.match(/'([^']+)'/g) ?? [];
for (const f of files) want.add(`sound/${f.slice(1, -1)}.mp3`);

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

// Bytes per folder, and what a desktop (1024 colour) and a phone (512 colour) first load fetch
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
console.log(`first load: desktop ${mb(total('_512_c.'))}, phone ${mb(total('_1024_c.'))}, ${loaded.length - TEX_LAYERS.length - 2} requests`);

for (const f of missing) console.log(`MISSING ${f}`);
for (const f of unused) console.log(`UNUSED  ${f}`);
if (missing.length || unused.length) process.exit(1);
console.log('assets OK');
