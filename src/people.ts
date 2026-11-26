// The townsfolk: Rocketbox avatars (Microsoft, MIT licence; see public/people/CREDITS.txt), their
// skin warmed to Kerala tones and dressed in mundu, lungi, sari and nightie (tools/people), each living a small piece of an ordinary evening. Devotees walk
// the outer circuit of the temple and come up the gate path to pray at the lamp; men talk and
// sit at the tea shop; people walk home along the road and up the lanes; a woman crouches to
// light the lamp at her tulsi; two men talk at the mosque gate.
//
// Each avatar has its own proportions, so each has its own set of poses. Walk clips have their
// root motion taken out and their own speed measured, so feet keep to the ground they cover.

import { gltf, instances, meshPool, poses, shading, type Frame } from '@typegpu/kit';
import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { heightAt, roadZ } from './terrain.ts';
import { LANES, MOSQUE, PLOTS, plotPoint } from './town.ts';
import { ROAD } from './world.ts';
import type { Seat } from './village.ts';
import { trailAt } from './trail.ts';
import { boot } from './boot.ts';
import type { Solid } from './geo.ts';
import { clear, footprints, pushOut } from './routes.ts';

type XZ = [number, number];
type V3 = [number, number, number];
type Sex = 'm' | 'f';
const CLIP_NAMES = ['walk_neutral_01', 'walk_slow_01', 'idle_neutral_01', 'idle_neutral_02', 'gestic_talk_neutral_01', 'sit_chair_idle_neutral_01', 'crouch_idle', 'idle_look_around_01'] as const;
type ClipName = (typeof CLIP_NAMES)[number];
type ModelData = Awaited<ReturnType<typeof gltf.load>>;

export const AVATARS = {
  dev_m11: { file: 'dev_m11', base: 'Male_Adult_11', sex: 'm' },
  lamp_m08: { file: 'lamp_m08', base: 'Male_Adult_08', sex: 'm' },
  tea_m15: { file: 'tea_m15', base: 'Male_Adult_15', sex: 'm' },
  home_m12: { file: 'home_m12', base: 'Male_Adult_12', sex: 'm' },
  tea_m09: { file: 'tea_m09', base: 'Male_Adult_12', sex: 'm' },
  tea_m01: { file: 'tea_m01', base: 'Male_Adult_01', sex: 'm' },
  tea_m17: { file: 'tea_m17', base: 'Male_Adult_06', sex: 'm' },
  lane_m01: { file: 'lane_m01', base: 'Male_Adult_01', sex: 'm' },
  road_m08: { file: 'road_m08', base: 'Male_Adult_08', sex: 'm' },
  mosque_m15: { file: 'mosque_m15', base: 'Male_Adult_15', sex: 'm' },
  mosque_m11: { file: 'mosque_m11', base: 'Male_Adult_11', sex: 'm' },
  home_m09: { file: 'home_m09', base: 'Male_Adult_08', sex: 'm' },
  dev_f15: { file: 'dev_f15', base: 'Female_Adult_15', sex: 'f' },
  dev_f06: { file: 'dev_f06', base: 'Female_Adult_04', sex: 'f' },
  gate_f02: { file: 'gate_f02', base: 'Female_Adult_02', sex: 'f' },
  road_f11: { file: 'road_f11', base: 'Female_Adult_11', sex: 'f' },
  home_f06: { file: 'home_f06', base: 'Female_Adult_06', sex: 'f' },
  home_f11: { file: 'home_f11', base: 'Female_Adult_11', sex: 'f' },
} as const satisfies Record<string, { file: string; base: string; sex: Sex }>;
type Who = keyof typeof AVATARS;

/** How a person spends the evening. */
type Plan =
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
function plans(tulsi: V3[], seats: Seat[]): Plan[] {
  return rawPlans(tulsi, seats);
}

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

// ---- loading
export interface PeopleFiles {
  bodies: Record<Who, ModelData>;
  clips: Record<Sex, Record<ClipName, poses.ClipData>>;
  /** Each clip's own pace over the ground, metres a second, before its root motion was removed. */
  pace: Record<Sex, Record<ClipName, number>>;
}

/** Takes the clip's travel out of its root, keeping the bob, and says how fast it went. */
function inPlace(clip: poses.ClipData) {
  let pace = 0;
  const channels = clip.channels.map((ch) => {
    if (ch.joint !== 'Bip01' || ch.path !== 'position') return ch;
    const v = Float32Array.from(ch.values);
    const n = v.length / 3;
    const dx = v[3 * (n - 1)]! - v[0]!;
    const dz = v[3 * (n - 1) + 2]! - v[2]!;
    const span = ch.times[n - 1]! - ch.times[0]! || 1;
    pace = Math.hypot(dx, dz) / span;
    for (let i = 0; i < n; i++) {
      const t = (ch.times[i]! - ch.times[0]!) / span;
      v[3 * i] = v[3 * i]! - v[0]! - dx * t;
      v[3 * i + 2] = v[3 * i + 2]! - v[2]! - dz * t;
    }
    return { ...ch, values: v };
  });
  return { clip: { ...clip, channels } as poses.ClipData, pace };
}

export async function loadPeople(base = import.meta.env.BASE_URL): Promise<PeopleFiles> {
  const who = Object.keys(AVATARS) as Who[];
  const [bodies, clipFiles] = await Promise.all([
    Promise.all(who.map((w) => gltf.load(`${base}people/${AVATARS[w].file}.glb`))),
    Promise.all((['m', 'f'] as const).flatMap((s) => CLIP_NAMES.map((c) => gltf.load(`${base}people/clips/${s}_${c}.glb`)))),
  ]);
  const clips = { m: {}, f: {} } as PeopleFiles['clips'];
  const pace = { m: {}, f: {} } as PeopleFiles['pace'];
  (['m', 'f'] as const).forEach((s, si) =>
    CLIP_NAMES.forEach((c, ci) => {
      const got = inPlace(poses.clip(clipFiles[si * CLIP_NAMES.length + ci]!, c));
      clips[s][c] = got.clip;
      pace[s][c] = got.pace;
    }),
  );
  return { bodies: Object.fromEntries(who.map((w, i) => [w, bodies[i]!])) as Record<Who, ModelData>, clips, pace };
}

// ---- the kind: the scans' own textures, a little less clean, as the props are
const Person = instances.define('Person', {
  host: { pose: d.u32 },
  pose: (row) => {
    'use gpu';
    return row.pose;
  },
  material: (_pixel, base) => {
    'use gpu';
    const m = shading.Material(base);
    m.roughness = std.min(1, base.roughness * 1.05 + 0.03);
    m.color = base.color * 0.9;
    return m;
  },
});

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawQ = (y: number): [number, number, number, number] => [0, Math.sin(y / 2), 0, Math.cos(y / 2)];

export function createPeople(root: TgpuRoot, files: PeopleFiles, tulsi: V3[], seats: Seat[] = [], solids: readonly Solid[] = []) {
  const feet = footprints(solids);
  const list = solids.length ? plansClear(tulsi, seats, solids, feet) : plans(tulsi, seats);
  /** Where you are, so people stop for you and step round you instead of through you. */
  const you: [number, number] = [1e9, 1e9];
  const used = [...new Set(list.map((p) => p.who))];
  const pool = meshPool.create(root, { ...meshPool.roomFor(used.map((w) => files.bodies[w])), anisotropy: 4 });
  type Group = {
    figures: poses.Poses<string>;
    set: ReturnType<typeof instances.create<typeof Person>>;
  };
  // Outfits made from one scan share its skeleton, and so one set of poses and one draw
  const groups = new Map<string, Group>();
  const bodies = new Map<Who, ReturnType<typeof pool.add>>();
  for (const w of used) bodies.set(w, pool.add(files.bodies[w]));
  for (const base of new Set(used.map((w) => AVATARS[w].base))) {
    const mine = used.filter((w) => AVATARS[w].base === base);
    const sex = AVATARS[mine[0]!].sex;
    const model = files.bodies[mine[0]!];
    const members = list.filter((p) => AVATARS[p.who].base === base);
    const rows = members.reduce((n, p) => n + files.bodies[p.who].meshes.length, 0);
    // The clips carry their own rig's bone lengths and face; this body keeps its own, taking only
    // their turns (and the root's sway and bob)
    const rest = new Map(model.skin!.joints.map((j) => [j.name, j.position]));
    const fit = (clip: poses.ClipData): poses.ClipData => ({
      ...clip,
      channels: clip.channels.map((ch) => {
        const own = rest.get(ch.joint);
        if (ch.path !== 'position' || ch.joint === 'Bip01' || !own) return ch;
        const v = new Float32Array(ch.values.length);
        for (let i = 0; i < v.length; i += 3) v.set(own, i);
        return { ...ch, values: v };
      }),
    });
    const c = Object.fromEntries(Object.entries(files.clips[sex]).map(([k, v]) => [k, fit(v)])) as Record<ClipName, poses.ClipData>;
    const figures = poses.create(
      root,
      model.skin!,
      {
        moving: [c.idle_neutral_01, c.walk_slow_01, c.walk_neutral_01],
        idle_neutral_01: c.idle_neutral_01,
        idle_neutral_02: c.idle_neutral_02,
        gestic_talk_neutral_01: c.gestic_talk_neutral_01,
        sit_chair_idle_neutral_01: c.sit_chair_idle_neutral_01,
        crouch_idle: c.crouch_idle,
        idle_look_around_01: c.idle_look_around_01,
      },
      { capacity: members.length },
    );
    const set = instances.create(root, pool, { kind: Person, capacity: rows, history: true });
    groups.set(base, { figures, set });
  }

  // Each walker's route measured, so a distance along it gives a place and heading
  const people = list.map((plan, i) => {
    const g = groups.get(AVATARS[plan.who].base)!;
    const body = bodies.get(plan.who)!;
    const sex = AVATARS[plan.who].sex;
    const phase = (i * 0.618) % 1;
    if (plan.kind === 'stay') {
      const pose = g.figures.add(plan.clip, 0, { from: phase * 10 });
      const [x, z] = plan.at;
      const id = g.set.add(body, { pose, position: [x, heightAt(x, z) + (plan.lift ?? 0), z], rotation: yawQ(plan.yaw) });
      return { plan, g, pose, id, sex, metres: 0, dir: 1, speed: 0, yaw: plan.yaw, wait: 0, next: 8 + phase * 10, talking: true, lens: [0], length: 0, dodge: 0 };
    }
    const route = plan.route;
    const pts = plan.loop ? [...route, route[0]!] : route;
    const lens = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
    const length = lens.at(-1)!;
    const pose = g.figures.add('moving', 0, { mix: 2, from: phase });
    const id = g.set.add(body, { pose, position: [0, -50, 0] });
    return { plan, g, pose, id, sex, metres: (plan.from ?? 0) % length, dir: 1, speed: plan.speed, yaw: 0, wait: 0, next: 0, talking: false, lens, length, pts, dodge: 0 };
  });

  const at = (p: (typeof people)[number], m: number) => {
    const pts = (p as { pts: XZ[] }).pts;
    let k = 1;
    while (k < pts.length - 1 && p.lens[k]! < m) k++;
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const t = Math.min(1, Math.max(0, (m - p.lens[k - 1]!) / (p.lens[k]! - p.lens[k - 1]! || 1)));
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };

  /** The man walking the dark lane with a torch: where his torch is and which way it points. */
  const torchBearer = people.find((p) => p.plan.who === 'lane_m01');
  const torch = { on: false, position: [0, -50, 0] as V3, aim: [0, -0.5, 1] as V3 };
  /** The forest guard: where his lantern swings, and where he is and which way he faces. */
  const guardOf = people.find((p) => p.plan.kind === 'walk' && p.plan.who === 'tea_m01' && p.plan.route.length > 40);
  const guard = { lantern: [0, -50, 0] as V3, at: [0, -50, 0] as V3, yaw: 0, stopped: false, gone: false };
  const pushedOut = (x: number, z: number) => {
    const q = pushOut([x, z], feet, 0.28);
    return q[0] !== x || q[1] !== z;
  };
  /** Where everyone is, for their bodies in the solid world. */
  const where: V3[] = people.map(() => [0, -50, 0]);
  const step = (time: number, dt: number) => {
    people.forEach((p, i) => {
      const { figures, set } = p.g;
      if (p.plan.kind === 'stay') {
        // Talkers take turns: one speaks, the other listens, now and then they swap
        const swap = p.plan.swap;
        if (swap && (p.next -= dt) < 0) {
          p.talking = !p.talking;
          figures.play(p.pose, p.talking ? p.plan.clip : swap, time, { fade: 0.8 });
          p.next = 7 + Math.random() * 9;
        }
        return;
      }
      const plan = p.plan;
      // You, in the way: within a stride ahead of them. They slow to a stop, and step to the side
      // away from you (if there's room there) to get round
      const here = at(p, p.metres);
      const hd = here.heading + (p.dir < 0 ? Math.PI : 0);
      const fx = Math.sin(hd);
      const fz = Math.cos(hd);
      const ox = you[0] - here.x;
      const oz = you[1] - here.z;
      const ahead = ox * fx + oz * fz;
      const across = ox * fz - oz * fx;
      const inWay = ahead > -0.2 && ahead < 1.3 && Math.abs(across - p.dodge) < 0.75;
      if (inWay) {
        const want = across > 0 ? -0.8 : 0.8;
        const dx = here.x + fz * want;
        const dz = here.z - fx * want;
        if (!pushedOut(dx, dz)) p.dodge += (want - p.dodge) * Math.min(1, dt * 2.5);
      } else if (Math.hypot(ox, oz) > 2) {
        const back = p.dodge * Math.min(1, dt * 1.2);
        if (!pushedOut(here.x + fz * (p.dodge - back), here.z - fx * (p.dodge - back))) p.dodge -= back;
      }
      const stopped = inWay && ahead < 0.9 && Math.abs(across - p.dodge) < 0.5;
      // A pause at each end of a route that isn't a circuit: look about, then turn back
      if (p.wait > 0) {
        p.wait -= dt;
        p.speed = Math.max(0, p.speed - dt * 1.5);
        if (p.wait <= 0) p.dir = -p.dir;
      } else p.speed += ((stopped ? 0 : plan.speed) - p.speed) * Math.min(1, dt * (stopped ? 5 : 1.2));
      p.metres += p.speed * p.dir * dt;
      if (plan.loop) p.metres = ((p.metres % p.length) + p.length) % p.length;
      else if (p.metres > p.length || p.metres < 0) {
        p.metres = Math.min(Math.max(p.metres, 0), p.length);
        if (p.wait <= 0) p.wait = plan.pause ?? 3;
      }
      const s = at(p, p.metres);
      const heading = s.heading + (p.dir < 0 ? Math.PI : 0);
      p.yaw = wrap(p.yaw + wrap(heading - p.yaw) * Math.min(1, dt * 3));
      // Walking side by side with a companion: step out sideways from the route
      const side = (plan.side ?? 0) + p.dodge;
      const x = s.x + Math.cos(heading) * side;
      const z = s.z - Math.sin(heading) * side;
      if (p === guardOf && guard.gone) {
        // His beat is finished
        set.write(p.id, { position: [0, -50, 0] });
        guard.lantern = [0, -50, 0];
        guard.at = [0, -50, 0];
        where[i] = [0, -50, 0];
        return;
      }
      set.write(p.id, { position: [x, heightAt(x, z) + (plan.lift ?? 0), z], rotation: yawQ(p.yaw) });
      where[i] = [x, heightAt(x, z), z];
      if (p === guardOf) {
        // In his left hand, at the knee, swinging with his stride
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const swing = Math.sin(time * 3.4) * 0.06 * Math.min(1, p.speed);
        guard.lantern = [x + fz * 0.3 + fx * (0.12 + swing), heightAt(x, z) + 0.62, z - fx * 0.3 + fz * (0.12 + swing)];
        guard.at = [x, heightAt(x, z), z];
        guard.yaw = p.yaw;
        guard.stopped = p.wait > 0 || p.speed < 0.2;
      }
      if (p === torchBearer) {
        // Held at the hip on his right, swinging a little with his stride, aimed at the path ahead
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const sway = Math.sin(time * 5.2) * 0.06 * Math.min(1, p.speed);
        torch.on = true;
        torch.position = [x + fx * 0.3 - fz * 0.22, heightAt(x, z) + 0.95, z + fz * 0.3 + fx * 0.22];
        torch.aim = [fx + -fz * sway, -0.2, fz + fx * sway];
      }
      // The line: 0 standing, 1 the slow walk, 2 the walk, each at the pace it was made for
      const pace = files.pace[p.sex];
      const slow = pace.walk_slow_01 || 0.8;
      const walk = pace.walk_neutral_01 || 1.1;
      const mix = p.speed <= slow ? p.speed / slow : 1 + Math.min(1, (p.speed - slow) / Math.max(0.05, walk - slow));
      figures.mix(p.pose, mix, time);
    });
  };

  const all = [...groups.values()];
  return {
    /** Where you are (x, z), once a frame before step. */
    setPlayer(x: number, z: number) {
      you[0] = x;
      you[1] = z;
    },
    where,
    torch,
    guard,
    step,
    renderers: all.map((g) => g.set.renderer().pipe(g.figures.inject())),
    flush: (frame: Frame) => {
      for (const g of all) g.set.flush(frame);
    },
    animate: (pass: Parameters<poses.Poses<string>['animate']>[0], time: number) => {
      for (const g of all) g.figures.animate(pass, time);
    },
    initAsync: () => Promise.all(all.map((g) => g.figures.initAsync())),
    ready: Promise.all([...bodies.values()].map((b) => b.ready)),
    destroy() {
      for (const g of all) {
        g.figures.destroy();
        g.set.destroy();
      }
      pool.destroy();
    },
  };
}

