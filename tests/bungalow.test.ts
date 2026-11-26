import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rehearseBungalow, replayBungalow } from '../src/workbench/bungalow.ts';

test('the note must be read and put down before the chair can start the ending', () => {
  const run = rehearseBungalow();
  assert.equal(run.interaction, 'bungalow.note');
  assert.equal(run.examine('bungalow.chair'), false);
  assert.equal(run.examine('bungalow.note'), true);
  run.step(2, true);
  assert.equal(run.interaction, 'bungalow.note');
  run.step(0.1, false);
  assert.equal(run.interaction, 'bungalow.chair');
  assert.equal(run.examine('bungalow.chair'), true);
  assert.equal(run.examine('bungalow.chair'), false);
  assert.equal(run.sitting, true);
});

test('replay produces the production finale, guard departure and end in order', () => {
  const trace = replayBungalow();
  assert.deepEqual(trace, replayBungalow());
  assert.equal(trace.slice(trace.findIndex((e) => e.event === 'sit') + 1).filter((e) => e.event === 'line').length, 4);
  assert.ok(trace.findIndex((e) => e.event === 'guard gone') > trace.findIndex((e) => e.event === 'sit'));
  assert.ok(trace.findIndex((e) => e.event === 'end') > trace.findIndex((e) => e.event === 'guard gone'));
});
