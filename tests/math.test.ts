import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp, facingCos, lerp, smooth, stepFixed, toward, wrap } from '../src/math/math.ts';

test('stepFixed splits a big dt into equal substeps no longer than max', () => {
  const hs: number[] = [];
  assert.equal(stepFixed(0.27, (h) => void hs.push(h), 1 / 30), 9);
  assert.ok(hs.every((h) => h <= 1 / 30 + 1e-12));
  assert.ok(Math.abs(hs.reduce((a, b) => a + b, 0) - 0.27) < 1e-12);
});

test('stepFixed: a small dt is one call with that exact dt; 0 is one call with 0', () => {
  const hs: number[] = [];
  stepFixed(1 / 60, (h) => void hs.push(h));
  stepFixed(1 / 30, (h) => void hs.push(h));
  stepFixed(0, (h) => void hs.push(h));
  assert.deepEqual(hs, [1 / 60, 1 / 30, 0]);
});

test('stepFixed stops when fn returns false', () => {
  let n = 0;
  assert.equal(stepFixed(0.5, () => ++n < 3), 3);
  assert.equal(n, 3);
});

test('the small helpers', () => {
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(lerp(2, 4, 0.5), 3);
  assert.equal(smooth(0, 1, 0.5), 0.5);
  assert.equal(smooth(0, 1, 2), 1);
  assert.ok(Math.abs(wrap(3 * Math.PI) - Math.PI) < 1e-9);
  assert.deepEqual(toward(0, 0, 3, 4), [0.6, 0.8, 5]);
  assert.deepEqual(toward(1, 1, 1, 1), [0, 0, 1]);
  assert.equal(facingCos(0, 5, 0, 1), 1);
});
