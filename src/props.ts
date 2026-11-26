// The things people leave about: chairs, bottles, gas tanks, brass, poles, ferns. Photo-scanned
// CC0 models from Poly Haven, shrunk by tools/models/fetch.ts into public/models, each drawn
// with its own textures and lit by the lamps and the moon like everything else.
import { gltf, instances, shading, type meshPool } from '@typegpu/kit';
import { std } from 'typegpu';
import type { PropAt } from './geo.ts';

type ModelData = Awaited<ReturnType<typeof gltf.load>>;

/** Fetches every model the placements name, once each. */
export async function loadProps(placed: readonly PropAt[]) {
  const names = [...new Set(placed.map((p) => p.name))];
  const base = import.meta.env.BASE_URL;
  const models = await Promise.all(names.map((n) => gltf.load(`${base}models/${n}.glb`)));
  return new Map<string, ModelData>(names.map((n, i) => [n, models[i]!]));
}

/**
 * A prop's own textures, a little dustier and less shiny than a studio scan: night-time grime
 * that keeps them from looking pasted in.
 */
export const Prop = instances.define('Prop', {
  material: (_pixel, base) => {
    'use gpu';
    const m = shading.Material(base);
    m.roughness = std.min(1, base.roughness * 1.08 + 0.04);
    m.color = base.color * 0.92;
    return m;
  },
});

const yawQ = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

/** Puts every placement into `set`, each model added to the pool once. */
export function placeProps(pool: meshPool.MeshPool, set: ReturnType<typeof instances.create<typeof Prop>>, models: Map<string, ModelData>, placed: readonly PropAt[]) {
  const added = new Map<string, ReturnType<typeof pool.add>>();
  for (const p of placed) {
    let m = added.get(p.name);
    if (!m) {
      m = pool.add(models.get(p.name)!);
      added.set(p.name, m);
    }
    set.add(m, { position: p.at, rotation: yawQ(p.yaw), scale: p.scale, ...(p.color ? { color: p.color } : {}) });
  }
  return [...added.values()];
}

/** How many instance rows the placements take: one per mesh of each model placed. */
export const rowsFor = (models: Map<string, ModelData>, placed: readonly PropAt[]) => placed.reduce((n, p) => n + models.get(p.name)!.meshes.length, 0) + 4;
