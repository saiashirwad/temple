// What grows where: the mix of species, jack kept rare, the tree pool's mesh budget, and the
// path kept clear. Builds the whole planting once (a few seconds on one CPU).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGrounds } from '../src/world/town/grounds.ts';
import { buildVillage } from '../src/world/town/village.ts';
import { plantAll } from '../src/world/vegetation/planting.ts';
import { farSpecimens, specimens, type Specimen } from '../src/world/vegetation/specimens.ts';
import { trailNear } from '../src/world/trail/trail.ts';

const g = buildGrounds();
const v = buildVillage();
const p = plantAll(v.homes, g.gaps, v.tulsi);

const count = (list: { specimen?: Specimen }[]) => {
  const out: Record<string, number> = {};

  for (const t of list) {
    const name = t.specimen?.species ?? 'card';
    out[name] = (out[name] ?? 0) + 1;
  }

  return out;
};

const NOT_BROAD = new Set(['coconut', 'areca', 'rubber', 'bamboo', 'papaya', 'banyan', 'card']);
const meshTrees = [...p.trees, ...p.far.filter((f) => f.specimen)];

test('jackfruit is at most a tenth of the broadleaf trees', () => {
  const c = count(meshTrees);
  const broad = Object.entries(c).filter(([k]) => !NOT_BROAD.has(k)).reduce((n, [, k]) => n + k, 0);
  console.log('trees by species', JSON.stringify(c));
  assert.ok((c.jack ?? 0) <= broad * 0.1, `jack ${c.jack} of ${broad}`);
});

test('a real mix: many tree species, the wild ones in the forest, shrubs and water plants', () => {
  const c = count(meshTrees);
  const kinds = Object.keys(c).filter((k) => !NOT_BROAD.has(k));
  assert.ok(kinds.length >= 12, `broadleaf species: ${kinds.join(', ')}`);

  for (const k of ['teak', 'laurel', 'irul', 'fig', 'silk-cotton', 'alstonia']) assert.ok((c[k] ?? 0) > 10, `${k} in the forest`);
  const pl = count(p.plants);
  console.log('plants by species', JSON.stringify(pl));

  for (const k of ['lantana', 'chromolaena', 'ginger', 'rattan', 'screwpine', 'papaya', 'hibiscus']) assert.ok((pl[k] ?? 0) > 3, `${k} planted`);
});

test('every model named, and the tree pool stays well under its 256 meshes', () => {
  const used = new Set([...p.trees.map(t => t.specimen), ...p.far.map(t => t.specimen ?? farSpecimens[t.kind]), ...Object.values(farSpecimens), ...p.plants.map(t => t.specimen)]);
  const catalog = Object.values(specimens).flat();
  assert.equal(new Set(catalog.map(s => s.id)).size, catalog.length);

  for (const specimen of used) assert.ok(catalog.includes(specimen), specimen.id);
  const models = [...used].map(s => s.build());
  const meshes = models.reduce((n, m) => n + m.meshes.length, 0);
  const verts = models.reduce((n, m) => n + m.meshes.reduce((k, x) => k + x.positions.length / 3, 0), 0);
  console.log('tree pool: models', models.length, 'meshes', meshes, 'vertices', verts);
  // The meadow's grass and the impostor card share the pool too
  assert.ok(meshes <= 225, `${meshes} meshes`);
});

test('no tree on the path, and every one a shade of its own near white', () => {
  for (const t of meshTrees) assert.ok(trailNear(t.at[0], t.at[2], 4).distance > 2.5, `tree on the path at ${t.at.map((x) => x.toFixed(1))}`);

  for (const t of [...p.trees, ...p.far, ...p.plants]) {
    assert.ok(t.tint, 'tinted');

    for (const c of t.tint!) assert.ok(c > 0.7 && c < 1.3);
  }
});

test('specimens are reused, default placement repeats, and a new seed changes the forest', () => {
  const repeat = plantAll(v.homes, g.gaps, v.tulsi);
  assert.deepEqual(repeat.far.map(t => t.at), p.far.map(t => t.at));
  assert.equal(repeat.trees[0]!.specimen, p.trees[0]!.specimen);
  const changed = plantAll(v.homes, g.gaps, v.tulsi, { seed: 6 });
  const forest = (a: typeof p.far) => a.filter(t => Math.hypot(t.at[0], t.at[2]) > 170 && t.specimen).map(t => t.at);
  assert.notDeepEqual(forest(changed.far), forest(p.far));
  assert.equal(changed.trees[0]!.specimen, p.trees[0]!.specimen);
});
