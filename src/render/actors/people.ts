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
import { heightAt } from '../../world/terrain.ts';
import type { Plan, Who } from '../../content/npc-plans.ts';
import { type Foot, pushOut } from '../../sim/routes.ts';
import { AVATARS, type ClipName } from '../../content/assets.ts';
import { makeWalker, stepWalker } from '../../sim/walker.ts';

type V3 = [number, number, number];

type ModelData = Awaited<ReturnType<typeof gltf.load>>;

// ---- loading
const WALK_CLIPS = ['idle_neutral_01', 'walk_slow_01', 'walk_neutral_01'] as const;

const clipsFor = (plan: Plan): readonly ClipName[] =>
  plan.kind === 'walk' ? WALK_CLIPS : plan.swap ? [plan.clip, plan.swap] : [plan.clip];

type Animation = ReturnType<typeof inPlace>;

type PeopleFiles = { bodies: Map<Who, ModelData>; animations: Map<string, Animation> };

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

/** Share the watcher's body and clips when the village joins a forest-first scene. */
export function peopleLoader(base = import.meta.env.BASE_URL) {
  const bodies = new Map<Who, Promise<ModelData>>();
  const animations = new Map<string, Promise<Animation>>();

  return async (plans: readonly Plan[]): Promise<PeopleFiles> => {
    const who = [...new Set(plans.map(p => p.who))];
    const needed = new Set<string>();

    for (const plan of plans) {
      for (const name of clipsFor(plan)) {
        const key = `${AVATARS[plan.who].sex}_${name}`;
        needed.add(key);

        if (!animations.has(key)) {
          animations.set(key, gltf.load(`${base}people/clips/${key}.glb`).then(model => inPlace(poses.clip(model, name))));
        }
      }
    }

    for (const w of who) if (!bodies.has(w)) bodies.set(w, gltf.load(`${base}people/${AVATARS[w].file}.glb`));

    const [models, clips] = await Promise.all([
      Promise.all(who.map(async w => [w, await bodies.get(w)!] as const)),
      Promise.all([...needed].map(async key => [key, await animations.get(key)!] as const)),
    ]);

    return { bodies: new Map(models), animations: new Map(clips) };
  };
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

export function createPeople(root: TgpuRoot, files: PeopleFiles, list: Plan[], feet: readonly Foot[], random = Math.random) {
  /** Where you are, so people stop for you and step round you instead of through you. */
  const you: [number, number] = [1e9, 1e9];
  const used = [...new Set(list.map((p) => p.who))];
  const pool = meshPool.create(root, { ...meshPool.roomFor(used.map((w) => files.bodies.get(w)!)), anisotropy: 4 });

  type Group = {
    figures: poses.Poses<string>;
    set: ReturnType<typeof instances.create<typeof Person>>;
  };

  // Outfits made from one scan share its skeleton, and so one set of poses and one draw
  const groups = new Map<string, Group>();
  const bodies = new Map<Who, ReturnType<typeof pool.add>>();

  for (const w of used) bodies.set(w, pool.add(files.bodies.get(w)!));

  for (const base of new Set(used.map((w) => AVATARS[w].base))) {
    const mine = used.filter((w) => AVATARS[w].base === base);
    const sex = AVATARS[mine[0]!].sex;
    const model = files.bodies.get(mine[0]!)!;
    const members = list.filter((p) => AVATARS[p.who].base === base);
    const rows = members.reduce((n, p) => n + files.bodies.get(p.who)!.meshes.length, 0);
    // The clips carry their own rig's bone lengths and face; this body keeps its own, taking only
    // their turns (and the root's sway and bob)
    const clips: Record<string, poses.ClipData | poses.ClipData[]> = {};

    const fit = (name: ClipName): poses.ClipData => {
      const { clip } = files.animations.get(`${sex}_${name}`)!;

      // Absent translation channels use this body's joint rest positions.
      return { ...clip, channels: clip.channels.filter(ch => ch.path !== 'position' || ch.joint === 'Bip01') };
    };

    for (const plan of members) {
      if (plan.kind === 'walk') clips.moving ??= WALK_CLIPS.map(fit);
      else for (const name of clipsFor(plan)) clips[name] ??= fit(name);
    }

    const figures = poses.create(root, model.skin!, clips, { capacity: members.length });
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

      return { plan, g, pose, id, slow: 0, walk: 0, metres: 0, dir: 1, speed: 0, yaw: plan.yaw, wait: 0, next: 8 + phase * 10, talking: true, lens: [0], length: 0, dodge: 0 };
    }

    const walker = makeWalker(plan);
    const pose = g.figures.add('moving', 0, { mix: 2, from: phase });
    const slow = files.animations.get(`${sex}_walk_slow_01`)!.pace || 0.8;
    const walk = files.animations.get(`${sex}_walk_neutral_01`)!.pace || 1.1;
    const id = g.set.add(body, { pose, position: [0, -50, 0] });

    return { plan, g, pose, id, slow, walk, ...walker, next: 0, talking: false };
  });

  /** The man walking the dark lane with a torch: where his torch is and which way it points. */
  const torchBearer = people.find((p) => p.plan.who === 'lane_m01');
  const torch = { on: false, position: [0, -50, 0] as V3, aim: [0, -0.5, 1] as V3 };
  /** The forest guard: where his lantern swings, and where he is and which way he faces. */
  const guardOf = people.find((p) => p.plan.kind === 'walk' && p.plan.watcher);
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
          p.next = 7 + random() * 9;
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
      const { slow, walk } = p;
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

