// The things people leave about: chairs, bottles, gas tanks, brass, poles, ferns. Photo-scanned
// CC0 models from Poly Haven, shrunk by tools/models/fetch.ts into public/models, each drawn
// with its own textures and lit by the lamps and the moon like everything else.
import { gltf, instances, shading, meshPool } from '@typegpu/kit';
import { std } from 'typegpu';
import sizes from 'virtual:temple-prop-sizes';
import type { PropAt } from './geo.ts';

type ModelData = Awaited<ReturnType<typeof gltf.load>>;

/** Fetches every model the placements name, once each. */
export async function loadProps(placed: readonly PropAt[]) {
  const names = [...new Set(placed.map((p) => p.name))];
  const base = import.meta.env.BASE_URL;
  // Shared maps have their content hash in the filename, so later variants can reuse the response.
  const fetchModel = (url: string) => fetch(url, url.includes('/shared/') ? { cache: 'force-cache' } : undefined);
  const models = await Promise.all(names.map(n => gltf.load(`${base}models/${sizes[n]!.file}`, { fetch: fetchModel })));

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

    const placement = { position: p.at, rotation: yawQ(p.yaw), scale: p.scale };
    set.add(m, p.color ? { ...placement, color: p.color } : placement);
  }

  return [...added.values()];
}

/** Reserve one pool for the entire world even when distant models have yet to download. */
export function propBudget(placed: readonly PropAt[]) {
  const used = [...new Set(placed.map(p => p.name))].map(name => sizes[name]!);
  const pool = meshPool.roomFor(used);
  const uvs1 = used.some(size => size.uvs1) ? { uvs1: true as const } : {};

  return { pool: { ...pool, ...uvs1 }, rows: placed.reduce((n, p) => n + sizes[p.name]!.meshes, 0) };
}

export const propNear = (p: PropAt, at: readonly number[]) =>
  Math.hypot(p.at[0] - at[0], p.at[2] - at[1]) <= 180;

/** A model is fetched once, even if several copies straddle the first view's radius. */
export function splitProps(placed: readonly PropAt[], at?: readonly number[]) {
  const visible = new Set<string>();

  for (const p of placed) if (!at || propNear(p, at)) visible.add(p.name);

  return { first: placed.filter(p => visible.has(p.name)), later: placed.filter(p => !visible.has(p.name)) };
}
