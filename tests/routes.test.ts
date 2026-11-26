// No townsperson walks through a wall: every route, against the real town's solids
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGrounds } from '../src/grounds.ts';
import { plansClear, rawPlans } from '../src/content/npc-plans.ts';
import { blocked, clear, footprints, type XZ } from '../src/routes.ts';
import { buildStreet } from '../src/street.ts';
import { buildTemple } from '../src/temple.ts';
import { buildVillage } from '../src/village.ts';
import { heightAt } from '../src/terrain.ts';

const village = buildVillage();
const solids = [...buildTemple().solids, ...buildGrounds().solids, ...buildStreet().solids, ...village.solids];
const feet = footprints(solids);

test('no route passes through a solid once cleared', () => {
  const before = rawPlans(village.tulsi, village.seats).flatMap((p) => (p.kind === 'walk' ? blocked(p.route, feet, 0.3 + Math.abs(p.side ?? 0), p.loop) : []));
  console.log('legs through walls before:', before.length);
  const after = plansClear(village.tulsi, village.seats, solids);
  const bad = after.flatMap((p) => (p.kind === 'walk' ? blocked(p.route, feet, 0.29, p.loop).map((b) => `${p.who} leg ${b.leg}`) : []));
  assert.deepEqual(bad, []);
});

test('a clear route comes back unchanged', () => {
  const r: XZ[] = [[500, 500], [510, 500], [510, 510]];
  assert.equal(clear(r, feet), r);
});

test('a route through a box goes round it', () => {
  const box = footprints([{ kind: 'box', c: [1000, heightAt(1000, 0) + 1, 0], h: [1, 1, 3], yaw: 0.3 }]);
  const r = clear([[995, 0], [1005, 0]], box);
  assert.ok(r.length > 2);
  assert.deepEqual(blocked(r, box, 0.29), []);
  assert.deepEqual(r[0], [995, 0]);
  assert.deepEqual(r.at(-1), [1005, 0]);
});
