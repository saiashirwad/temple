// The dholes, drawn from one skinned body (tools/beasts/dhole.ts) playing their gaits and moods:
// standing and listening, trotting, galloping, stalking low while they search for you, and
// crouched with lips back when they have you and you face them down.
import { BEAST_FILES } from './content/assets.ts';
import { gltf, instances, meshPool, poses, shading, type Frame } from '@typegpu/kit';
import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { heightAt } from './terrain.ts';

type V3 = [number, number, number];
type ModelData = Awaited<ReturnType<typeof gltf.load>>;
export type PackMood = 'away' | 'coming' | 'searching' | 'attack' | 'leaving';
export interface Dog {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  on: boolean;
}

/** Speeds (m/s) at which the trot and the gallop look planted. */
const TROT_PACE = 2.2;
const GALLOP_PACE = 7;

export const loadPack = (base = import.meta.env.BASE_URL) => gltf.load(`${base}${BEAST_FILES.pack}`);

export function createPack(root: TgpuRoot, model: ModelData, count: number) {
  const pool = meshPool.create(root, { ...meshPool.roomFor([model]), extra: { color: d.vec4f } });
  const body = pool.add(model);
  // Its coat is painted per vertex; the moon and torch find a little sheen in the fur
  const Dhole = instances.define('Dhole', {
    host: { pose: d.u32 },
    pose: (row) => {
      'use gpu';
      return row.pose;
    },
    carry: (vertexIndex) => {
      'use gpu';
      return pool.extra.color(vertexIndex);
    },
    material: (pixel, base) => {
      'use gpu';
      const m = shading.Material(base);
      m.color = base.color * pixel.carried.xyz;
      m.roughness = std.mix(0.98, 0.8, std.clamp(pixel.carried.x * 3, 0, 1));
      return m;
    },
  });
  const c = (name: string) => poses.clip(model, name);
  const figures = poses.create(
    root,
    model.skin!,
    { moving: [c('idle'), c('trot'), c('gallop')], stalk: c('stalk'), snarl: c('snarl') },
    { capacity: count },
  );
  const set = instances.create(root, pool, { kind: Dhole, capacity: count * model.meshes.length, history: true });
  const hidden: V3 = [0, -60, 0];
  const dogs = Array.from({ length: count }, (_, i) => {
    const pose = figures.add('moving', 0, { from: i * 0.37 });
    return { pose, id: set.add(body, { position: hidden, pose }), doing: 'moving' as 'moving' | 'stalk' | 'snarl', shown: false, scale: 0.94 + ((i * 0.37) % 1) * 0.14 };
  });
  return {
    renderer: set.renderer().pipe(figures.inject()),
    update(list: readonly Dog[], mood: PackMood, seconds: number) {
      list.forEach((w, i) => {
        const h = dogs[i];
        if (!h) return;
        if (!w.on) {
          if (h.shown) set.write(h.id, { position: hidden });
          h.shown = false;
          return;
        }
        h.shown = true;
        set.write(h.id, { position: [w.x, heightAt(w.x, w.z) - 0.02, w.z], rotation: [0, Math.sin(w.yaw / 2), 0, Math.cos(w.yaw / 2)], scale: h.scale });
        const want = mood === 'attack' && w.speed < 1.5 ? 'snarl' : mood === 'searching' && w.speed < 2.8 && w.speed > 0.2 ? 'stalk' : 'moving';
        if (want !== h.doing) {
          figures.play(h.pose, want, seconds, { fade: 0.3 });
          h.doing = want;
        }
        if (want === 'moving') {
          const s = w.speed / h.scale;
          const mix = s <= TROT_PACE ? s / TROT_PACE : 1 + Math.min(1, (s - TROT_PACE) / (GALLOP_PACE - TROT_PACE));
          figures.mix(h.pose, Math.round(mix * 40) / 40, seconds);
        }
      });
    },
    flush: (frame: Frame) => set.flush(frame),
    animate: (pass: Parameters<poses.Poses<string>['animate']>[0], time: number) => figures.animate(pass, time),
    initAsync: () => figures.initAsync(),
    ready: body.ready,
    destroy() {
      figures.destroy();
      set.destroy();
      pool.destroy();
    },
  };
}
