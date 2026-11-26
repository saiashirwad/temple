import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWorldLayout } from '../tools/build/world-layout.ts';
import { decodeWorldLayout, type WorldLayout } from '../src/world/layout.ts';
import { specimens } from '../src/world/vegetation/specimens.ts';
import { tourDistance } from '../src/world/vegetation/planting.ts';

test('a baked layout restores the authored ground, routes, specimen identities and placement order', () => {
  const tree = { at: [1, 2, 3] as [number, number, number], yaw: -1, scale: 0.75, stiff: 2, tint: [1, 0.75, 1.25] as [number, number, number], specimen: specimens.palms[2] };

  const world: WorldLayout = {
    planted: { trees: [tree], plants: [{ ...tree, specimen: specimens.ferns[1] }],
      far: [{ at: tree.at, yaw: 3, scale: 1, tint: tree.tint, kind: 'rubber' }], walked: tourDistance },
    grassAt: [{ at: [4, 5, 6], scale: 1, yaw: 1, length: 'tall' }],
    land: { width: 2, height: 1, pixels: Uint8Array.of(255, 42, 8, 4, 0, 2, 15, 0) },
    plans: [{ kind: 'walk', who: 'dev_m11', route: [[2.125, 4], [8, 6]], speed: 1 }],
  };

  const packed = encodeWorldLayout(world);
  const loaded = decodeWorldLayout(packed);
  assert.deepEqual(loaded.planted.trees, world.planted.trees);
  assert.deepEqual(loaded.planted.plants, world.planted.plants);
  assert.strictEqual(loaded.planted.trees[0].specimen, tree.specimen);
  assert.deepEqual(loaded.planted.far[0], { ...world.planted.far[0], specimen: undefined });
  assert.deepEqual(loaded.plans, world.plans);
  assert.deepEqual(loaded.land, world.land);
  assert.deepEqual(loaded.grassAt, world.grassAt);
  assert.throws(() => decodeWorldLayout(packed.slice(0, -1)), /Invalid baked world layout/);
});
