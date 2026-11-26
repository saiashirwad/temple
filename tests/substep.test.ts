import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDanger } from '../src/sim/danger.ts';
import { createStory } from '../src/sim/story.ts';
import { GLADE } from '../src/world/trail/jungle.ts';
import { fakeHooks, player, seeded } from './sim.ts';

const P = { x: GLADE.x + 400, z: GLADE.z };

/** A summoned pack closing on you, stepped `n` frames of `dt` each. */
const approach = (dt: number, n: number, seed = 1) => {
  const { hooks, log } = fakeHooks();
  const danger = createDanger(GLADE, hooks, seeded(seed));
  danger.summon();
  const p = player(P);
  for (let i = 0; i < n; i++) danger.update(dt, p);
  const on = danger.wolves.filter((w) => w.on);
  const dists = on.map((w) => Math.hypot(w.x - p.x, w.z - p.z));
  return { debug: danger.debug, dists, marks: log.marks, sounds: log.sounds };
};

test('a dhole approach plays the same at 60 fps and at 16x speed (0.27 s frames)', () => {
  // 1.08 s either way: 64 frames of ~1/60 against 4 frames of 0.27
  const fine = approach(0.27 / 16, 64);
  const coarse = approach(0.27, 4);
  assert.equal(coarse.debug.pack, fine.debug.pack);
  assert.equal(coarse.debug.size, fine.debug.size);
  assert.deepEqual(coarse.marks, fine.marks);
  assert.ok(Math.abs(coarse.debug.nerve - fine.debug.nerve) <= 0.1, `nerve ${coarse.debug.nerve} vs ${fine.debug.nerve}`);
  assert.equal(coarse.dists.length, fine.dists.length);
  coarse.dists.forEach((d, i) => assert.ok(Math.abs(d - fine.dists[i]!) < 0.15, `dog ${i}: ${d.toFixed(2)} vs ${fine.dists[i]!.toFixed(2)}`));
});

test('16x speed over a longer hunt: same pack state, nerve and health close', () => {
  const fine = approach(0.27 / 16, 16 * 12, 3);
  const coarse = approach(0.27, 12, 3);
  assert.equal(coarse.debug.pack, fine.debug.pack);
  assert.ok(Math.abs(coarse.debug.nerve - fine.debug.nerve) <= 0.1, `${coarse.debug.nerve} vs ${fine.debug.nerve}`);
  assert.ok(Math.abs(coarse.debug.health - fine.debug.health) <= 0.15, `${coarse.debug.health} vs ${fine.debug.health}`);
});

test('big steps replay exactly with the same seed', () => {
  assert.deepEqual(approach(0.5, 30, 9), approach(0.5, 30, 9));
});

test('the story keeps its pace at 16x', () => {
  const tell = (dt: number, n: number) => {
    const told: string[] = [];
    const story = createStory({ tell: (t) => void told.push(t), guardGone: () => {}, end: () => {} });
    for (let i = 0; i < n; i++) story.update(dt, { along: 100, moving: true, busy: false });
    return told;
  };
  // 60 s of walking: 3600 frames at 60 fps, or 222 frames of 0.27 s
  assert.deepEqual(tell(0.27, 222), tell(1 / 60, 3600));
});
