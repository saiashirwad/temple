import { RELOAD_PRESETS } from './boot.ts';
import { SPOTS } from '../content/viewpoints.ts';
import { RUNS } from './presets.ts';

export const BUNGALOW_BEATS = ['veranda', 'reading-note', 'seated', 'guard-gone', 'ending'] as const;

export type BungalowBeat = typeof BUNGALOW_BEATS[number];

/** Resolve the first camera, required resources and requested views before allocating the scene. */
export function resolveLaunch(params: URLSearchParams) {
  const name = params.get('encounter');
  const chord = params.get('preset');

  if (name !== null && chord !== null) throw new Error('Choose one encounter or preset');
  const key = name === null ? chord : Object.keys(RUNS).find(k => RUNS[k].id === name);

  if (name !== null && !key) throw new Error('Unknown encounter: ' + name);
  const preset = key && Object.hasOwn(RELOAD_PRESETS, key) ? null : key;
  const scenario = params.get('scenario');
  const bungalow = scenario === 'story.bungalow-ending';
  const tour = scenario === 'world.walk' && params.get('run') === '1';
  const shots = params.getAll('shot');
  const all = Object.values(SPOTS);
  const requested = shots.includes('*') ? all : shots.flatMap(name => all.filter(spot => spot.shot === name));
  let views = preset && SPOTS[preset] ? [SPOTS[preset]] : requested.length ? requested : [SPOTS['1']];
  const start = params.get('from') ?? BUNGALOW_BEATS.find(name => shots.includes(name)) ?? 'veranda';

  if (bungalow && !BUNGALOW_BEATS.some(name => name === start)) throw new Error('Unknown bungalow checkpoint: ' + start);

  if (bungalow && shots.some(name => BUNGALOW_BEATS.some((beat, index) => beat === name && index < BUNGALOW_BEATS.indexOf(start as BungalowBeat))))
    throw new Error('Requested checkpoint precedes the bungalow starting state');
  const encounter = preset && Object.hasOwn(RUNS, preset) ? RUNS[preset] : undefined;
  const first = bungalow ? SPOTS['8'] : preset ? SPOTS[encounter?.spot ?? preset] : tour ? views[0] : undefined;
  let camera = first?.at;
  const at = params.get('at');

  if (at !== null) {
    const coordinates = at.split(',').map(v => v.trim() ? Number(v) : NaN);

    if (![4, 5].includes(coordinates.length) || !coordinates.every(Number.isFinite))
      throw new Error('Expected at=x,z,yaw,pitch[,height]');

    if (preset || bungalow) throw new Error('Use either a free camera or a scenario preset');
    camera = [coordinates[0], coordinates[1], coordinates[2], coordinates[3], coordinates[4] ?? 1.62];
    views = [{ name: 'Custom camera', shot: 'camera', at: camera }];
  }

  return {
    preset, bungalow, tour, views, camera, beat: start as BungalowBeat,
    forest: !!first && first.shot !== 'town' && at === null,
    physics: (bungalow && (start === 'veranda' || start === 'reading-note')) || encounter?.physics === true,
    wildlife: encounter?.wildlife ?? (first?.shot.startsWith('herd-') ? 'herd' as const : null),
    people: bungalow || first?.shot === 'town' || first?.shot === 'veranda' || first?.shot === 'chair',
  };
}

export type Launch = ReturnType<typeof resolveLaunch>;
