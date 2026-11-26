import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStory } from '../src/sim/story.ts';
import { run } from './sim.ts';

const make = () => {
  const told: string[] = [];
  const flags = { gone: false, ended: false };
  const story = createStory({ tell: (t) => void told.push(t), guardGone: () => void (flags.gone = true), end: () => void (flags.ended = true) });
  return { story, told, flags };
};

test('the town lines come first, then path lines in order, one at a time', () => {
  const { story, told } = make();
  run((dt) => story.update(dt, { along: 100, moving: true, busy: false }), 120);
  assert.match(told[0]!, /^Twenty-two years/);
  assert.match(told[1]!, /forty-first night/);
  assert.ok(told.some((t) => t.includes('You were seven')));
  assert.equal(new Set(told).size, told.length, 'no line told twice');
});

test('busy holds every line back', () => {
  const { story, told } = make();
  run((dt) => story.update(dt, { along: 100, moving: true, busy: true }), 60);
  assert.equal(told.length, 0);
});

test('lines far behind you are dropped, not queued', () => {
  const { story, told } = make();
  run((dt) => story.update(dt, { along: 900, moving: true, busy: false }), 30);
  assert.ok(!told.some((t) => t.includes('You were seven')), 'a line from 95 m is not told at 900 m');
});

test('the ending: the guard goes at the third line, then the end card, on the story clock', () => {
  const { story, told, flags } = make();
  story.sit();
  run((dt) => story.update(dt, { along: 960, moving: false, busy: false }), 23);
  assert.ok(flags.gone, 'guard gone by 23 s');
  assert.ok(!flags.ended);
  run((dt) => story.update(dt, { along: 960, moving: false, busy: false }), 20);
  assert.ok(flags.ended, 'end card by 43 s');
  assert.equal(story.debug.finale, 4);
  assert.match(told[0]!, /^You sit/);
});

test('tellNow shows at once and holds the queue', () => {
  const { story, told } = make();
  story.tellNow('You wake.', 8);
  run((dt) => story.update(dt, { along: 100, moving: true, busy: false }), 7);
  assert.deepEqual(told, ['You wake.']);
});
