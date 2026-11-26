// Helpers for the logic tests: a seeded random source, fake hooks that record what happened,
// and a player you can stand where you like.
import type { Hooks, Player } from '../src/sim/danger.ts';

/** A small seeded generator (mulberry32), so a night replays exactly. */
export function seeded(seed = 1) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DangerEvents {
  said: string[];
  marks: Parameters<Hooks['mark']>[0][];
  downs: number;
  sounds: (keyof Hooks['sound'])[];
}

export function fakeHooks(over: Partial<Hooks> = {}) {
  const log: DangerEvents = { said: [], marks: [], downs: 0, sounds: [] };

  const record = (name: keyof Hooks['sound']) => () => { log.sounds.push(name); };

  const sound: Hooks['sound'] = {
    whistle: record('whistle'), yap: record('yap'), howl: record('howl'), growl: record('growl'),
    bite: record('bite'), trumpet: record('trumpet'), rumble: record('rumble'), thud: record('thud'), alarm: record('alarm'),
  };

  const hooks: Hooks = {
    cover: () => false,
    safe: () => false,
    wild: () => true,
    say: (t) => void log.said.push(t),
    mark: (e) => void log.marks.push(e),
    sound,
    shove: () => {},
    down: () => void log.downs++,
    ...over,
  };

  return { hooks, log };
}

export const player = (over: Partial<Player> = {}): Player => ({
  x: 0, z: 0, crouching: false, running: false, pace: 0, torch: true, aloft: false, fx: 0, fz: 1, wx: 1, wz: 0, ...over,
});

/** Steps `update` for `seconds` at 60 Hz; `each` may change the player between steps. */
export function run(update: (dt: number) => void, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
}
