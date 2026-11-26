import { RELOAD_PRESETS } from './boot.ts';
import { NOTE_AT } from '../world/trail/bungalow.ts';

/** x, z, yaw, pitch, eye height above the ground. Yaw π faces +z, 0 faces -z. */
export type Spot = readonly [number, number, number, number, number];

export const SPOTS: Record<string, { name: string; shot: string; at: Spot }> = {
  '1': { shot: 'town', name: 'town view', at: [122.8, -128.1, 2.41, 0.06, 1.62] },
  '2': { shot: 'bridge-path', name: 'path before the bridge', at: [-160.5, -113.5, 1.55, 0.18, 1.62] },
  '3': { shot: 'bridge', name: 'bridge', at: [-169.73, -108.86, 0.981, 0.22, 1.62] },
  '4': { shot: 'dung', name: 'dung by the path', at: [-69.66, -139.88, 2.458, 0.45, 1.62] },
  '5': { shot: 'machan', name: 'machan stair', at: [-17.44, -159.78, 0.421, 0.1, 3.8] },
  '6': { shot: 'herd-glade', name: 'herd glade', at: [-114.55, -258.42, -2.05, 0.08, 1.62] },
  '7': { shot: 'herd-close', name: 'herd glade, close', at: [-110.2, -256.1, -2.05, 0.12, 1.62] },
  '8': { shot: 'veranda', name: 'veranda, the note', at: [NOTE_AT.x, NOTE_AT.z + 1.2, 0.186, 0.75, 3.5] },
  '9': { shot: 'chair', name: 'his chair, looking out', at: [20.61, -396.33, 2.792, 0.07, 2.63] },
};

export const BUNGALOW_BEATS = ['veranda', 'reading-note', 'seated', 'guard-gone', 'ending'] as const;
export type BungalowBeat = typeof BUNGALOW_BEATS[number];

const entrySpots: Record<string, string> = { w: '2', W: '2', D: '2', h: '6', n: '8', f: '8' };

/** Resolve the first camera, required resources and requested views before allocating the scene. */
export function resolveLaunch(params: URLSearchParams) {
  const key = params.get('preset');
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
  const first = bungalow ? SPOTS['8'] : preset ? SPOTS[entrySpots[preset] ?? preset] : tour ? views[0] : undefined;
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
    physics: bungalow || ['w', 'W', 'h', 'n', 'f', 'd', 'g'].includes(preset ?? ''),
    wildlife: ['w', 'W', 'D', 'h'].includes(preset ?? '') || first?.shot.startsWith('herd-') === true,
    people: bungalow || first?.shot === 'town' || first?.shot === 'veranda' || first?.shot === 'chair',
  };
}
export type Launch = ReturnType<typeof resolveLaunch>;
