import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTURE_SCRIPT, departureTick, initialDeparture, replayDeparture } from '../src/sim/departure.ts';

test('replay is deterministic and acquiring an item twice is idempotent', () => {
  const trace = replayDeparture(DEPARTURE_SCRIPT);
  assert.deepEqual(trace, replayDeparture(DEPARTURE_SCRIPT));
  assert.deepEqual(trace[3]!.facts, []);
  assert.deepEqual(trace.at(-1)!.state.inventory, ['note', 'torch']);
  assert.equal(trace.at(-1)!.state.quest, 'departed');
});

test('equipment and departure require their prerequisites', () => {
  const first = departureTick(initialDeparture(), { kind: 'equip', item: 'torch' });
  assert.equal(first.state.equipped, null);
  assert.equal(first.facts[0]?.kind, 'denied');
  const second = departureTick(first.state, { kind: 'leave' });
  assert.equal(second.state.quest, 'unoffered');
  assert.equal(second.facts[0]?.kind, 'denied');
  assert.equal(first.state.tick, 1);
  assert.equal(second.state.tick, 2);
});

test('facts arrive in order and retries become possible after prerequisites', () => {
  const trace = replayDeparture([
    { kind: 'equip', item: 'torch' }, { kind: 'leave' },
    { kind: 'acquire', item: 'torch' }, { kind: 'equip', item: 'torch' },
    { kind: 'acquire', item: 'note' }, { kind: 'ask', topic: 'journey' },
    { kind: 'equip', item: 'torch' }, { kind: 'leave' }, { kind: 'leave' },
  ]);

  assert.deepEqual(trace[5]!.facts, [{ kind: 'quest', state: 'offered' }, { kind: 'quest', state: 'ready' }]);
  assert.deepEqual(trace[6]!.facts, []);
  assert.equal(trace[7]!.state.quest, 'departed');
  assert.deepEqual(trace[8]!.facts, []);
});
