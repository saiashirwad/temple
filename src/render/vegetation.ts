import { impostors, instances, meshPool } from '@typegpu/kit';
import { d, type TgpuRoot } from 'typegpu';
import { yawQ } from '../math/quat.ts';
import { FAR_KINDS, type FarKind, type FarTree, type Planted, type plantAll } from '../world/vegetation/planting.ts';
import { farSpecimens, type Specimen } from '../world/vegetation/specimens.ts';
import { crownOf, defineTree } from '../world/vegetation/trees.ts';
import { defineGrass, meadowModels, type meadowPlaces } from '../world/vegetation/meadow.ts';
import { Q } from './quality.ts';
import type { Tex } from './tex.ts';

type Model = ReturnType<Specimen['build']>;
type Planting = ReturnType<typeof plantAll>;
const farSpecimen = (tree: FarTree) => tree.specimen ?? farSpecimens[tree.kind];

/** Build shared meshes once. Physics uses the same geometry to size each trunk collider. */
export function prepareVegetation(planted: Planting) {
  const used = new Set([...planted.trees.map(t => t.specimen), ...planted.plants.map(t => t.specimen),
    ...planted.far.map(farSpecimen), ...Object.values(farSpecimens)]);
  const geometry = new Map([...used].map(specimen => [specimen, specimen.build()]));
  const trunks = new Map<Model, number>();
  const trunkOf = (m: Model) => {
    let r = trunks.get(m);
    if (r !== undefined) return r;
    // The trunk's radius from the model itself: how far out its points reach near the base
    const d: number[] = [];
    for (const mesh of m.meshes) {
      const p = mesh.positions as Float32Array;
      for (let i = 0; i < p.length; i += 3) if (p[i + 1]! > 0.4 && p[i + 1]! < 1.3) d.push(Math.hypot(p[i]!, p[i + 2]!));
    }
    d.sort((a, b) => a - b);
    const near = d.filter((v) => v < 0.9);
    r = near.length > 8 ? near[Math.floor(near.length * 0.9)]! : 0;
    trunks.set(m, r);
    return r;
  };
  const trees = [...planted.trees.map((t) => ({ at: t.at, scale: t.scale, trunk: trunkOf(geometry.get(t.specimen)!) })), ...planted.far.map((f) => ({ at: f.at, scale: f.scale, trunk: f.specimen ? trunkOf(geometry.get(f.specimen)!) : 0.2 }))].filter((t) => t.trunk > 0.08);
  return { geometry, trees };
}

/** Upload the visible instances and photograph the four distant canopy models. */
export function createVegetation(
  root: TgpuRoot, tex: Tex, planted: Planting, geometry: Map<Specimen, Model>, grassAt: ReturnType<typeof meadowPlaces>,
) {
  const grassModels = meadowModels();
  const treePool = meshPool.create(root, {
    ...meshPool.roomFor([...geometry.values(), ...grassModels.short, ...grassModels.mid, ...grassModels.tall, impostors.CARD]),
    extra: { pat: d.f32, col: d.vec4f },
  });
  const added = new Map<Model, ReturnType<typeof treePool.add>>();
  const modelOf = (m: Model) => {
    let got = added.get(m);
    if (!got) {
      got = treePool.add(m);
      added.set(m, got);
    }
    return got;
  };
  const Tree = defineTree(treePool, tex);
  const rowsOf = (list: Planted[]) => list.reduce((n, t) => n + geometry.get(t.specimen)!.meshes.length, 0) + 8;
  const crowns = new Map<Model, ReturnType<typeof crownOf>>();
  const crownFor = (m: Model) => {
    let c = crowns.get(m);
    if (!c) crowns.set(m, (c = crownOf(m)));
    return c;
  };
  const placeAll = (set: ReturnType<typeof instances.create<typeof Tree>>, list: Planted[]) => {
    for (const t of list) {
      const model = geometry.get(t.specimen)!;
      const place = { position: t.at, rotation: yawQ(t.yaw), scale: t.scale, stiff: t.stiff, ...crownFor(model) };
      const k = t.tint;
      // Each tree a shade of its own: some yellower, some darker, as no two trees of a kind match
      if (k) set.add(modelOf(model), (mesh) => ({ ...place, color: [mesh.material.color[0]! * k[0], mesh.material.color[1]! * k[1], mesh.material.color[2]! * k[2]] }));
      else set.add(modelOf(model), place);
    }
  };
  // The meadow: a sparse layer out to the fade, a dense fill near the eye
  const Grass = defineGrass(treePool);
  const grassModel = (g: typeof grassAt[number], i: number) => {
    const variants = grassModels[g.length];
    return variants[i % variants.length]!;
  };
  const meadow = instances.create(root, treePool, { kind: Grass, capacity: grassAt.reduce((n, g, i) => n + grassModel(g, i).meshes.length, 0) + 8 });
  grassAt.forEach((g, i) => {
    const place = { position: g.at, rotation: yawQ(g.yaw), scale: g.scale };
    meadow.add(modelOf(grassModel(g, i)), place);
  });
  const near = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(planted.trees) });
  placeAll(near, planted.trees);
  const undergrowth = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(planted.plants) });
  placeAll(undergrowth, planted.plants);

  // The far woods: meshes close to the eye, cards beyond
  const STIFF: Record<FarKind, number> = { palm: 1, broad: 3, areca: 0.8, rubber: 2 };
  const farTrees: Planted[] = planted.far.map((f) => ({ specimen: farSpecimen(f), at: f.at, yaw: f.yaw, scale: f.scale, stiff: STIFF[f.kind], tint: f.tint }));
  const far = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(farTrees) });
  placeAll(far, farTrees);
  const card = treePool.add(impostors.CARD).meshes[0]!;
  // Each kind of far tree is a card cut from its own atlas
  const atlases = FAR_KINDS.map((k) => impostors.create(root, treePool, modelOf(geometry.get(farSpecimens[k])!), { card, views: 8, size: 128 }));
  const capturing = root.createCommandEncoder();
  for (const a of atlases) a.record(capturing);
  capturing.submit();
  const cardSets = FAR_KINDS.map((k) => instances.create(root, treePool, { kind: impostors.Impostor, capacity: planted.far.filter((f) => f.kind === k).length + 1 }));
  for (const f of planted.far) {
    // On phones, a hashed share of the far cards well out of town (the layout itself is unchanged)
    if (Q.farCards < 1 && Math.hypot(f.at[0], f.at[2]) > 200 && (((Math.sin(f.at[0] * 12.9898 + f.at[2] * 78.233) * 43758.5453) % 1) + 1) % 1 >= Q.farCards) continue;
    const shade = 0.85 + ((f.at[0] * 7.31 + f.at[2] * 3.17) % 1 + 1) % 1 * 0.3;
    cardSets[FAR_KINDS.indexOf(f.kind)]!.add(card, { position: f.at, rotation: yawQ(f.yaw), scale: f.scale, color: f.tint ? [f.tint[0] * shade, f.tint[1] * shade, f.tint[2] * shade] : [shade, shade, shade], roughness: 0.8 });
  }

  return {
    treePool, near, far, undergrowth, meadow, atlases, cardSets,
    destroy() {
      for (const resource of [near, far, undergrowth, meadow, ...cardSets, ...atlases, treePool]) resource.destroy();
    },
  };
}
