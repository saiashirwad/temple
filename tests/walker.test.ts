import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWalker, stepWalker } from '../src/sim/walker.ts';

test('walker slows for an obstacle and returns to its route once clear', () => {
  const plan = { route: [[0, 0], [0, 20]] as [number, number][], speed: 1 };
  const p = makeWalker(plan);

  for (let i = 0; i < 10; i++) stepWalker(p, plan, 0.05, [0, 0.5], () => false);
  assert.ok(p.speed < 1);
  assert.ok(Math.abs(p.dodge) > 0);

  for (let i = 0; i < 100; i++) stepWalker(p, plan, 0.05, [100, 100], () => false);
  assert.ok(Math.abs(p.dodge) < 0.01);
  assert.ok(p.speed > 0.99);
});

test('walker waits and reverses at the end of a non-loop route', () => {
  const plan = { route: [[0, 0], [0, 1]] as [number, number][], speed: 1, pause: 0.2 };
  const p = makeWalker(plan);

  for (let i = 0; i < 30; i++) stepWalker(p, plan, 0.05, [100, 100], () => false);
  assert.equal(p.dir, -1);
  assert.ok(p.metres < 1);
});
