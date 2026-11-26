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
import { heightAt } from './terrain.ts';
import { plansClear, rawPlans } from './content/npc-plans.ts';
import type { Seat } from './village.ts';
import type { Solid } from './geo.ts';
import { footprints, pushOut } from './routes.ts';
import { AVATARS, CLIP_NAMES, type ClipName, type Sex } from './content/assets.ts';
export { AVATARS } from './content/assets.ts';
import { makeWalker, stepWalker } from './sim/walker.ts';

type XZ = [number, number];
type V3 = [number, number, number];
type ModelData = Awaited<ReturnType<typeof gltf.load>>;

type Who = keyof typeof AVATARS;

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

const yawQ = (y: number): [number, number, number, number] => [0, Math.sin(y / 2), 0, Math.cos(y / 2)];

export function createPeople(root: TgpuRoot, files: PeopleFiles, tulsi: V3[], seats: Seat[] = [], solids: readonly Solid[] = []) {
  const feet = footprints(solids);
  const list = solids.length ? plansClear(tulsi, seats, solids, feet) : rawPlans(tulsi, seats);
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
    const walker = makeWalker(plan);
    const pose = g.figures.add('moving', 0, { mix: 2, from: phase });
    const id = g.set.add(body, { pose, position: [0, -50, 0] });
    return { plan, g, pose, id, sex, ...walker, next: 0, talking: false };
  });

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
      const { x, z } = stepWalker(p as Parameters<typeof stepWalker>[0], plan, dt, you, pushedOut);
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

