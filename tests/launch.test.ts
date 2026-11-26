import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLaunch, SPOTS } from '../src/game/launch.ts';

const open = (query: string) => resolveLaunch(new URLSearchParams(query));

test('a selected world spread starts at its first requested location', () => {
  const launch = open('scenario=world.walk&run=1&shot=bridge&shot=chair');
  assert.deepEqual(launch.views.map(s => s.shot), ['bridge', 'chair']);
  assert.equal(launch.camera, SPOTS['3'].at);
  assert.equal(launch.physics, false);
  assert.equal(launch.wildlife, false);
});

test('story, encounter and free-camera entries resolve before scene creation', () => {
  assert.equal(open('').camera, undefined);
  const ending = open('scenario=story.bungalow-ending&shot=ending');
  assert.equal(ending.beat, 'ending');
  assert.equal(ending.physics, true);
  assert.equal(ending.camera, SPOTS['8'].at);
  assert.equal(open('preset=h').wildlife, true);
  assert.equal(open('preset=h').camera, SPOTS['6'].at);
  assert.deepEqual(open('at=12,22,1,0').camera, [12, 22, 1, 0, 1.62]);
  assert.throws(() => open('at=bad'));
  assert.throws(() => open('scenario=story.bungalow-ending&from=bad'));
});
