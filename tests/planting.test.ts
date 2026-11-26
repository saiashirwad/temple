// What grows where: the mix of species, jack kept rare, the tree pool's mesh budget, and the
// path kept clear. Builds the whole planting once (a few seconds on one CPU).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGrounds } from '../src/grounds.ts';
import { buildVillage } from '../src/village.ts';
import { plantAll } from '../src/planting.ts';
import { trailNear } from '../src/trail.ts';

const g = buildGrounds();
const v = buildVillage();
const p = plantAll(v.homes, g.gaps, v.tulsi);
type Model = (typeof p.trees)[number]['model'];
const name = (m: Model | undefined) => (m ? p.species.get(m) ?? '?' : 'card');
const count = (list: { model?: Model }[]) => {
  const out: Record<string, number> = {};
  for (const t of list) out[name(t.model)] = (out[name(t.model)] ?? 0) + 1;
  return out;
};
const NOT_BROAD = new Set(['palm', 'areca', 'rubber', 'bamboo', 'papaya', 'banyan', 'card']);
const meshTrees = [...p.trees, ...p.far.filter((f) => f.model)];

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
  for (const k of ['teak', 'laurel', 'irul', 'fig', 'silkCotton', 'alstonia']) assert.ok((c[k] ?? 0) > 10, `${k} in the forest`);
  const pl = count(p.plants);
  console.log('plants by species', JSON.stringify(pl));
  for (const k of ['lantana', 'chromolaena', 'ginger', 'rattan', 'screwpine', 'papaya', 'hibiscus']) assert.ok((pl[k] ?? 0) > 3, `${k} planted`);
  assert.ok(p.species.size === new Set([...p.species.keys()]).size);
});

test('every model named, and the tree pool stays well under its 256 meshes', () => {
  const models = new Set<Model>([...p.trees.map((t) => t.model), ...p.far.flatMap((f) => (f.model ? [f.model] : [])), ...Object.values(p.farModels), ...p.plants.map((t) => t.model)]);
  for (const m of models) if (!Object.values(p.farModels).includes(m)) assert.ok(p.species.has(m), 'a model with no species');
  const meshes = [...models].reduce((n, m) => n + m.meshes.length, 0);
  const verts = [...models].reduce((n, m) => n + m.meshes.reduce((k, x) => k + x.positions.length / 3, 0), 0);
  console.log('tree pool: models', models.size, 'meshes', meshes, 'vertices', verts);
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
  assert.equal(repeat.trees[0]!.model, p.trees[0]!.model);
  const changed = plantAll(v.homes, g.gaps, v.tulsi, { seed: 6 });
  const forest = (a: typeof p.far) => a.filter(t => Math.hypot(t.at[0], t.at[2]) > 170 && t.model).map(t => t.at);
  assert.notDeepEqual(forest(changed.far), forest(p.far));
  assert.equal(changed.trees[0]!.model, p.trees[0]!.model);
});
