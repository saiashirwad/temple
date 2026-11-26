import { heightAt, roadZ } from '../world/terrain.ts';
import { LANES, MOSQUE, PLOTS, plotPoint } from '../world/town/town.ts';
import { ROAD } from './world.ts';
import type { Seat } from '../world/town/village.ts';
import { trailAt } from '../world/trail/trail.ts';
import { boot } from '../game/boot.ts';
import type { Solid, V3 } from '../render/geo.ts';
import { clear, footprints, pushOut, type XZ } from '../sim/routes.ts';
import type { AVATARS, ClipName } from './assets.ts';

type Who = keyof typeof AVATARS;

/** How a person spends the evening. */
export type Plan =
  | { kind: 'walk'; who: Who; route: XZ[]; loop?: boolean; speed: number; from?: number; pause?: number; side?: number; lift?: number }
  | { kind: 'stay'; who: Who; at: XZ; yaw: number; clip: ClipName; lift?: number; swap?: ClipName };

// ---- where everyone is
const shoulder = (x: number, side: 1 | -1, off = 0.7): XZ => [x, roadZ(x) + side * (ROAD.half + off)];
const roadside = (x0: number, x1: number, side: 1 | -1, off = 0.7) => {
  const pts: XZ[] = [];
  const n = Math.ceil(Math.abs(x1 - x0) / 4);
  for (let i = 0; i <= n; i++) pts.push(shoulder(x0 + ((x1 - x0) * i) / n, side, off));
  return pts;
};
/** The outer circuit of the temple, the shrine kept on the right hand. */
const CIRCUIT: XZ[] = [
  [11.5, -12.5], [11.5, 14.4], [-11.6, 14.4], [-11.6, -12.5],
];
const TEA: XZ = [3.4, roadZ(3.4) + ROAD.half + 1.7];
const mosqueGate = (): XZ => [MOSQUE.x + 0 * Math.cos(MOSQUE.yaw) + MOSQUE.hz * Math.sin(MOSQUE.yaw), MOSQUE.z + MOSQUE.hz * Math.cos(MOSQUE.yaw)];

const LINEUP = boot.has('lineup');

/**
 * Everyone's evening, with every route walked round the walls, houses and trunks in `solids`, and
 * everyone standing moved out of them. Seated people keep their seats (the seat is a solid).
 */
export function plansClear(tulsi: V3[], seats: Seat[], solids: readonly Solid[], feet = footprints(solids)): Plan[] {
  return rawPlans(tulsi, seats).map((p) => {
    if (p.kind === 'walk') {
      // Walking beside a companion: her own line, a step to the side of theirs, kept clear itself
      const line = p.side ? beside(p.route, p.side) : p.route;
      return { ...p, side: 0, route: clear(line, feet, { loop: p.loop, radius: 0.3 }) };
    }
    if (p.clip === 'sit_chair_idle_neutral_01') return p;
    return { ...p, at: pushOut(p.at, feet, 0.25) };
  });
}

/** A route moved `side` metres to the right of the way it goes (as the walker steps out). */
const beside = (route: XZ[], side: number): XZ[] =>
  route.map((p, i) => {
    const a = route[Math.max(0, i - 1)]!;
    const b = route[Math.min(route.length - 1, i + 1)]!;
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return [p[0] + Math.cos(h) * side, p[1] - Math.sin(h) * side];
  });

export function rawPlans(tulsi: V3[], seats: Seat[]): Plan[] {
  const g = mosqueGate();
  const lane = (i: number, n = 4) => LANES[i]!.pts.slice(0, n).map(([x, z]): XZ => [x + 0.5, z]);
  const out: Plan[] = [
    // Devotees on the circuit, at a devotee's unhurried pace
    { kind: 'walk', who: 'dev_f15', route: CIRCUIT, loop: true, speed: 0.8, from: 3 },
    { kind: 'walk', who: 'dev_m11', route: CIRCUIT, loop: true, speed: 0.95, from: 40 },
    { kind: 'walk', who: 'dev_f06', route: CIRCUIT, loop: true, speed: 0.75, from: 70 },
    // Up the gate path to pray before the lamp, and back down to the road
    { kind: 'walk', who: 'gate_f02', route: [[0.9, 27], [0.6, 20], [0.4, 13.4]], speed: 0.9, pause: 9 },
    { kind: 'stay', who: 'lamp_m08', at: [-1.3, 13.2], yaw: Math.PI - 0.15, clip: 'idle_neutral_02' },
    // The tea shop: two on the bench, one at the counter, one listening
    { kind: 'stay', who: 'tea_m15', at: [TEA[0] - 1.3, TEA[1] - 0.8], yaw: Math.PI, clip: 'sit_chair_idle_neutral_01', lift: 0 },
    { kind: 'stay', who: 'tea_m09', at: [TEA[0] + 1.25, TEA[1] - 0.8], yaw: Math.PI, clip: 'sit_chair_idle_neutral_01', lift: 0 },
    { kind: 'stay', who: 'tea_m01', at: [TEA[0] + 0.2, TEA[1] - 1.9], yaw: 0.6, clip: 'gestic_talk_neutral_01', swap: 'idle_neutral_01' },
    { kind: 'stay', who: 'tea_m17', at: [TEA[0] + 1.2, TEA[1] - 1.2], yaw: Math.PI + 0.9, clip: 'idle_neutral_01', swap: 'gestic_talk_neutral_01' },
    // Walking home along the road
    { kind: 'walk', who: 'road_m08', route: roadside(-80, 70, 1), speed: 1.25, from: 60, pause: 4 },
    { kind: 'walk', who: 'road_f11', route: roadside(50, -75, -1), speed: 0.95, from: 20, pause: 6 },
    { kind: 'walk', who: 'gate_f02', route: roadside(50, -75, -1), speed: 0.95, from: 20, pause: 6, side: 0.65 },
    { kind: 'walk', who: 'home_m09', route: roadside(-30, 95, -1, 1.0), speed: 1.3, from: 15, pause: 3 },
    { kind: 'walk', who: 'tea_m17', route: roadside(95, -40, 1, 1.0), speed: 1.2, from: 5, pause: 3 },
    // Up the lanes
    { kind: 'walk', who: 'lane_m01', route: lane(0, 5), speed: 1.15, from: 5, pause: 5 },
    { kind: 'walk', who: 'road_f11', route: lane(1, 5), speed: 0.9, from: 12, pause: 7 },
    { kind: 'walk', who: 'mosque_m11', route: lane(3, 4), speed: 1.1, from: 0, pause: 5 },
    // Two men talking at the mosque gate
    { kind: 'stay', who: 'mosque_m15', at: [g[0] - 0.7, g[1] - 1.6], yaw: 1.2, clip: 'gestic_talk_neutral_01', swap: 'idle_neutral_02' },
    { kind: 'stay', who: 'mosque_m11', at: [g[0] + 0.6, g[1] - 1.2], yaw: 1.2 + Math.PI + 0.25, clip: 'idle_neutral_01', swap: 'gestic_talk_neutral_01' },
  ];
  // The forest guard, walking his beat up the path and back with a hurricane lantern
  const beat: XZ[] = [];
  for (let s = 230; s <= 690; s += 5) {
    const p = trailAt(s);
    beat.push([p.x, p.z]);
  }
  out.push({ kind: 'walk', who: 'tea_m01', route: beat, speed: 0.85, from: 120, pause: 14 });
  if (LINEUP) {
    (['road_m08', 'home_m09', 'road_f11', 'dev_f15', 'gate_f02'] as Who[]).forEach((who, i) =>
      out.push({ kind: 'stay', who, at: [-1.6 + i * 0.8, 24.5], yaw: i % 2 ? 0.4 : -0.4, clip: i === 3 ? 'idle_neutral_02' : 'idle_neutral_01' }),
    );
  }
  // Women crouched to light the lamp at their tulsi
  const lit = tulsi.filter((t) => Math.hypot(t[0], t[2]) < 90).slice(0, 2);
  lit.forEach((t, i) => {
    const toward = Math.atan2(-t[0], -t[2]);
    out.push({ kind: 'stay', who: i ? 'home_f11' : 'home_f06', at: [t[0] + Math.sin(toward) * 0.7, t[2] + Math.cos(toward) * 0.7], yaw: toward + Math.PI, clip: 'crouch_idle' });
  });
  // Sitting out on the veranda in the cool after supper: a grandfather with his thorthu over his
  // shoulder, and in another house a woman in her nightie
  const near = [...seats].filter((s) => Math.hypot(s.at[0], s.at[2]) < 90).sort((a, b) => Math.hypot(a.at[0], a.at[2]) - Math.hypot(b.at[0], b.at[2]));
  near.slice(0, 2).forEach((s, i) => {
    const lift = s.at[1] - heightAt(s.at[0], s.at[2]);
    out.push({ kind: 'stay', who: i ? 'home_f11' : 'home_m12', at: [s.at[0], s.at[2]], yaw: s.yaw, clip: 'sit_chair_idle_neutral_01', lift });
  });
  // A man at his gate, looking out at the road
  const home = PLOTS.find((p) => p.kind === 'old' && Math.abs(p.x) < 60);
  if (home) {
    const [x, z] = plotPoint(home, 0.4, home.d + 5.6);
    out.push({ kind: 'stay', who: 'home_m09', at: [x, z], yaw: home.yaw, clip: 'idle_look_around_01', swap: 'idle_neutral_01' });
  }
  return out;
}

