import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDanger } from '../src/danger.ts';
import { GLADE } from '../src/jungle.ts';
import { fakeHooks, player, run, seeded } from './sim.ts';

// Far from the herd, so only the pack matters
const P = { x: GLADE.x + 400, z: GLADE.z };

test('a summoned pack comes for you', () => {
  const { hooks } = fakeHooks();
  const danger = createDanger(GLADE, hooks, seeded(1));
  danger.summon();
  const p = player(P);
  run((dt) => danger.update(dt, p), 3);
  assert.ok(danger.hunting, `pack is ${danger.debug.pack}`);
});

test('the same seed replays the same night', () => {
  const night = () => {
    const { hooks, log } = fakeHooks();
    const danger = createDanger(GLADE, hooks, seeded(7));
    danger.summon();
    const p = player({ ...P, torch: false, fx: 0, fz: -1 });
    run((dt) => danger.update(dt, p), 40);
    return JSON.stringify([danger.debug, log.marks, log.downs]);
  };
  assert.equal(night(), night());
});

test('standing tall, facing them, torch on: they give up', () => {
  const { hooks, log } = fakeHooks({ cover: () => true });
  const danger = createDanger(GLADE, hooks, seeded(3));
  danger.summon();
  const p = player(P);
  // Face whichever dog is nearest, every step
  run((dt) => {
    const live = danger.wolves.filter((w) => w.on);
    if (live.length) {
      const w = live.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
      const d = Math.hypot(w.x - p.x, w.z - p.z) || 1;
      p.fx = (w.x - p.x) / d;
      p.fz = (w.z - p.z) / d;
    }
    danger.update(dt, p);
  }, 60);
  assert.ok(log.marks.includes('stood'), `marks: ${log.marks.join(',')}; ${JSON.stringify(danger.debug)}`);
  assert.equal(log.downs, 0);
});

test('crouched in cover before they find you: you stay hidden', () => {
  const { hooks } = fakeHooks({ cover: () => true });
  const danger = createDanger(GLADE, hooks, seeded(5));
  danger.summon();
  const p = player({ ...P, crouching: true, torch: false });
  let hidden = false;
  run((dt) => (hidden = danger.update(dt, p).hidden), 2);
  assert.ok(hidden);
});

test('going down happens once, and the night is calm after', () => {
  const { hooks, log } = fakeHooks();
  const danger = createDanger(GLADE, hooks, seeded(2));
  const p = player(P);
  danger.hurt(2, p);
  assert.equal(log.downs, 1);
  assert.equal(danger.health, 0.7);
  assert.equal(danger.debug.pack, 'away');
  assert.equal(danger.debug.alarm, 0);
});

test('back to them, no torch, standing in the open: they get you, once per fall', () => {
  const { hooks, log } = fakeHooks();
  const danger = createDanger(GLADE, hooks, seeded(11));
  danger.summon();
  const p = player({ ...P, torch: false });
  let downsAtOnce = 0;
  run((dt) => {
    const before = log.downs;
    // Always facing away from the nearest dog
    const w = danger.wolves.find((x) => x.on);
    if (w) {
      const d = Math.hypot(w.x - p.x, w.z - p.z) || 1;
      p.fx = -(w.x - p.x) / d;
      p.fz = -(w.z - p.z) / d;
    }
    danger.update(dt, p);
    downsAtOnce = Math.max(downsAtOnce, log.downs - before);
  }, 120);
  assert.ok(log.marks.includes('bitten'));
  assert.ok(downsAtOnce <= 1, 'never two falls in one step');
});

test('a startled herd charges; far away it settles', () => {
  const { hooks, log } = fakeHooks();
  const danger = createDanger(GLADE, hooks, seeded(4));
  const p = player({ x: GLADE.x + 30, z: GLADE.z });
  danger.startle(1);
  danger.update(1 / 60, p);
  assert.ok(log.marks.includes('charge'));
  danger.startle(0.5);
  const far = player({ x: GLADE.x + 300, z: GLADE.z });
  run((dt) => danger.update(dt, far), 20);
  assert.ok(!danger.threat, JSON.stringify(danger.debug));
});
