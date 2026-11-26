import { isReloadPreset } from './boot.ts';
import { SPOTS, spotAt } from '../content/viewpoints.ts';
import { encounterFor, encounterKeyFor } from './presets.ts';

export const BUNGALOW_BEATS = ['veranda', 'reading-note', 'seated', 'guard-gone', 'ending'] as const;

export type BungalowBeat = typeof BUNGALOW_BEATS[number];

/** Resolve the first camera, required resources and requested views before allocating the scene. */
export function resolveLaunch(params: URLSearchParams) {
  const name = params.get('encounter');
  const chord = params.get('preset');

  if (name !== null && chord !== null) throw new Error('Choose one encounter or preset');
  const key = name === null ? chord : encounterKeyFor(name);

  if (name !== null && !key) throw new Error('Unknown encounter: ' + name);
  const preset = key && isReloadPreset(key) ? null : key;
  const scenario = params.get('scenario');
  const bungalow = scenario === 'story.bungalow-ending';
  const tour = scenario === 'world.walk' && params.get('run') === '1';
  const shots = params.getAll('shot');
  const all = Object.values(SPOTS);
  const requested = shots.includes('*') ? all : shots.flatMap(name => all.filter(spot => spot.shot === name));
  const selected = preset ? spotAt(preset) : undefined;
  let views = selected ? [selected] : requested.length ? requested : [SPOTS['1']];
  const requestedBeat = params.get('from');
  const matched = BUNGALOW_BEATS.find(beat => beat === requestedBeat);
  const start = matched ?? BUNGALOW_BEATS.find(beat => shots.includes(beat)) ?? 'veranda';

  if (bungalow && requestedBeat !== null && !matched) throw new Error('Unknown bungalow checkpoint: ' + requestedBeat);

  if (bungalow && shots.some(name => BUNGALOW_BEATS.some((beat, index) => beat === name && index < BUNGALOW_BEATS.indexOf(start))))
    throw new Error('Requested checkpoint precedes the bungalow starting state');
  const encounter = preset ? encounterFor(preset) : undefined;
  const first = bungalow ? SPOTS['8'] : preset ? spotAt(encounter?.spot ?? preset) : tour ? views[0] : undefined;
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
    preset, bungalow, tour, views, camera, beat: start,
    forest: !!first && first.shot !== 'town' && at === null,
    physics: (bungalow && (start === 'veranda' || start === 'reading-note')) || encounter?.physics === true,
    wildlife: encounter?.wildlife ?? (first?.shot.startsWith('herd-') ? 'herd' as const : null),
    people: bungalow || first?.shot === 'town' || first?.shot === 'veranda' || first?.shot === 'chair',
  };
}

export type Launch = ReturnType<typeof resolveLaunch>;
