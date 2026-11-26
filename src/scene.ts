import {
  ao,
  bindings,
  bloom,
  cameras,
  clock,
  dynamicResolution,
  profiler,
  exposure,
  finish,
  grid,
  impostors,
  instances,
  lighting,
  images,
  meshPool,
  passes,
  pipelines,
  pointShadow,
  table,
  taa,
  targets,
  tone,
  shading,
  type Frame,
  type Surface,
} from '@typegpu/kit';
import { d, std, type TgpuRoot } from 'typegpu';
import { buildTemple } from './temple.ts';
import { defineBuilt, defineFlame, now } from './surfaces.ts';
import { lampAt, type Lamp } from './flicker.ts';
import { mergeModels, P } from './geo.ts';
import { loadTextures } from './tex.ts';
import { CLOISTER, COMPOUND, GROUND, POND } from './world.ts';
import { RIDERS, rideAt, wheelModel } from './traffic.ts';
import { createGround } from './ground.ts';
import { sky, MOON_ARRAY } from './sky.ts';
import { grade } from './look.ts';
import { crownOf, defineTree } from './trees.ts';
import { buildPond, createPond } from './pond.ts';
import { buildStreet } from './street.ts';
import { createAir } from './air.ts';
import { buildGrounds } from './grounds.ts';
import { buildVillage } from './village.ts';
import { LAND, landMap, townSummary } from './town.ts';
import { createPeople, loadPeople } from './people.ts';
import { createHerd, loadHerd } from './herd.ts';
import { createPack, loadPack } from './pack.ts';
import { defineGrass, meadowModels, meadowPlaces } from './meadow.ts';
import { createAtmosphere, HALOS } from './atmosphere.ts';
import { createSound, type Rider as Heard } from './sound.ts';
import { FAR_KINDS, plantAll, type FarKind, type Planted } from './planting.ts';
import { heightAt } from './terrain.ts';
import { createWalker } from './walk.ts';
import { createPhysics, loadPhysics, type Physics } from './physics.ts';
import { TRAIL_MAP, trailPatches } from './trail.ts';
import { FAR_LAMPS } from './jungle.ts';
import { createJourney, farLanternAt, type Tick } from './journey.ts';
import { createCover } from './cover.ts';
import { elephantBody, elephantEar, elephantLeg, elephantTrunk, lantern, wolfBody, wolfLeg } from './beasts.ts';
import { createBeastRig } from './beastrig.ts';
import { createEyes } from './eyes.ts';
import { qmul, qrot, yawQ } from './quat.ts';
import { createFarLights } from './farlights.ts';
import { loadProps, placeProps, Prop, rowsFor } from './props.ts';
import { boot } from './boot.ts';
import { Q } from './quality.ts';

type V3 = [number, number, number];

const MOON = {
  sunDirection: MOON_ARRAY,
  sunColor: [0.55, 0.68, 1] as V3,
  sunIntensity: 0.22,
  skyTop: [0.02, 0.035, 0.09] as V3,
  skyBottom: [0.02, 0.014, 0.01] as V3,
  skyIntensity: 0.9,
  skyReflection: 1,
  fogColor: [0.022, 0.034, 0.07] as V3,
  fogDensity: 0.016,
  fogFalloff: 0.06,
};

/** Trees nearer the eye than this are meshes, farther ones cards. */
const LOD = Q.lod;
const FADE = 8;

/**
 * Moonlit sky dimmed where nearby surfaces hide it, and a little of the lamplight too: an
 * artist's contact shadow, so chairs, pots and posts sit on the floor rather than float.
 */
const occludedSky = (material: shading.Material, point: shading.Point) => {
  'use gpu';
  const m = shading.Material(material);
  m.metallic = std.max(material.metallic, 0);
  return shading.hemisphere(m, point) * ao.at(point.position);
};
/**
 * Leaves let light through: a material with negative metallic is foliage, transmitting that
 * share of each lamp that shines on its back, brightest looking toward the light, so palm
 * fronds and banana leaves glow green-gold against a lamp the way they do at dusk.
 */
const leafLit = (material: shading.Material, point: shading.Point, direction: d.v3f, radiance: d.v3f) => {
  'use gpu';
  const through = std.max(-material.metallic, 0);
  const m = shading.Material(material);
  m.metallic = std.max(material.metallic, 0);
  let lit = shading.pbr(m, point, direction, radiance);
  if (through > 0) {
    const back = std.saturate(-std.dot(point.normal, direction));
    const toward = std.saturate(-std.dot(direction, point.view));
    const t2 = toward * toward;
    lit += material.color * d.vec3f(1.1, 1.25, 0.55) * radiance * (through * (back * 0.35 + t2 * t2 * 0.9));
  }
  return lit;
};
const LAMP_AO = 0.7;
const occludedLamp = (point: shading.Point, toLight: d.v3f, distance: number, range: number, slot: number) => {
  'use gpu';
  const open = std.mix(1, ao.at(point.position), LAMP_AO);
  return shading.reaching(point, toLight, distance, range, slot) * open;
};

const PROBE_STAGES = boot.has('probe');

export async function createScene(root: TgpuRoot, surface: Surface) {
  // GPU time decides how many pixels to draw: below the budget, full size; over it, fewer,
  // which TAA builds back up to the canvas
  // The bench (`b chord): leaves out each drawing group in turn and keeps its scene-pass samples
  const bench = { on: false, step: 0, at: -1, since: 0, sums: new Map<number, [number, number]>(), table: '' };
  const gpu = profiler.create(root, {
    skip: 10,
    onSample: (timing, ms) => {
      if (!bench.on || timing !== sceneTime || performance.now() - bench.since < 70) return;
      // Even steps time the whole scene just before odd steps time it without one group
      const key = bench.step;
      const got = bench.sums.get(key) ?? [0, 0];
      bench.sums.set(key, [got[0] + ms, got[1] + 1]);
    },
  });
  const opening = gpu.timer('opening');
  const closing = gpu.timer('closing');
  const sceneTime = gpu.timer('scene');
  const aoTime = gpu.timer('ao');
  const aaTime = gpu.timer('aa');
  const glowTime = gpu.timer('glow');
  const moonTime = gpu.timer('moon');
  const lampTime = gpu.timer('lampsh');
  const preTime = gpu.timer('pre');
  const detail = dynamicResolution.create(gpu.frame, { budget: (interval) => 0.8 * interval, range: [0.55, 1] });
  const screen = targets.create(
    root,
    surface,
    {
      hdr: { format: 'rgba16float', sampled: true },
      motion: { format: 'rg16float', sampled: true },
      depth: { format: 'depth24plus', sampled: true },
    },
    { resolution: () => detail.scale },
  );
  /** Stages that can be switched off while comparing: `o` toggles the occlusion. */
  const look = { occlusion: !boot.has('noao'), props: true };
  addEventListener('keydown', (e) => {
    if (e.key === 'o') look.occlusion = !look.occlusion;
    if (e.key === 'p') look.props = !look.props;
  });
  // Half-size depth of everything solid, drawn first, for the occlusion to read
  const early = targets.create(
    root,
    surface,
    { depth: { format: 'depth32float', scale: 0.5, sampled: true } },
    { resolution: () => detail.scale },
  );
  const view = cameras.orbit(root, {
    size: surface,
    target: [-12, heightAt(-12, 27.6) + 1.62, 27.6],
    distance: 0.06,
    yaw: -2.2,
    pitch: -0.05,
    pitchRange: [-1.1, 1.3],
    distanceRange: [0.05, 90],
    floor: (x, z) => heightAt(x, z) + 0.4,
    damping: 6,
    near: 0.08,
    far: 900,
    fov: 0.95,
  });
  const walker = createWalker(view);
  const occlusion = ao.create(root, view, {
    depth: () => early.textures.depth,
    region: early.regions.depth,
    temporal: true,
    slices: 2,
    enabled: () => look.occlusion,
    settings: { radius: 0.7, power: 3 },
  });
  const prepass = passes.create(root, early, { depth: passes.depth }, { label: 'prepass' }).pipe(view.inject());

  // ---- what is built, and what grows
  const t0 = performance.now();
  /** When each startup stage finished, in seconds since the page began loading (for the readout). */
  const stages: string[] = [`scene:${(t0 / 1000).toFixed(1)}`];
  const stage = (name: string) => {
    const n = document.querySelector('#note');
    if (n && PROBE_STAGES) n.textContent = (n.textContent ?? '') + ` ${name}:${((performance.now() - t0) / 1000).toFixed(1)}`;
    if (PROBE_STAGES) {
      const tag = document.querySelector('#stages') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'stages' }));
      (tag as HTMLElement).style.cssText = 'position:fixed;left:8px;top:8px;color:#fc6;font:14px monospace;z-index:9;text-shadow:0 0 3px #000';
      tag.textContent += ` ${name}:${((performance.now() - t0) / 1000).toFixed(2)}`;
    }
    console.log('stage', name, ((performance.now() - t0) / 1000).toFixed(2));
    stages.push(`${name.split(' ')[0]}:${(performance.now() / 1000).toFixed(1)}`);
  };
  // Downloads first, so the files arrive while the town is being built
  const peopleFiles = loadPeople();
  const herdFile = loadHerd();
  const packFile = loadPack();
  const textures = loadTextures(root, Math.min(surface.width, surface.height) > 700);
  // The forest path's map, baked by tools/trail/map.ts
  const trailPicture = fetch(`${import.meta.env.BASE_URL}tex/trail.png`)
    .then((r) => r.arrayBuffer())
    .then((b) => images.decode({ bytes: new Uint8Array(b), mimeType: 'image/png' }));
  const engine = loadPhysics();
  const temple = buildTemple();
  const grounds = buildGrounds();
  const street = buildStreet();
  const village = buildVillage();
  const pondModel = buildPond();
  stage('built');
  const planted = plantAll(village.homes, grounds.gaps, village.tulsi);
  stage('planted');
  const farModelOf = (f: (typeof planted.far)[number]) => f.model ?? planted.farModels[f.kind];
  const treeModels = [...new Set([...planted.trees.map((t) => t.model), ...planted.far.map(farModelOf), ...Object.values(planted.farModels)])];
  const plantModels = [...new Set(planted.plants.map((t) => t.model))];
  // Flames go to their own set, which stretches and bends them in the breeze
  type Model = typeof temple.model;
  const isFlame = (mesh: Model['meshes'][number]) => Math.floor((mesh.extra?.pat?.[0] ?? 0) + 0.5) === P.FLAME;
  const solidOf = (m: Model): Model => ({ ...m, meshes: m.meshes.filter((x) => !isFlame(x)) });
  const allBuilt = [temple.model, grounds.model, street.model, village.model, pondModel];
  // Each material once across the whole town: one mesh (and one pool slot) per material, not per builder
  const flameModel: Model = mergeModels([{ meshes: allBuilt.flatMap((m) => m.meshes.filter(isFlame)), images: [] }]);
  const builtModels = [mergeModels(allBuilt.map(solidOf))];
  const riders = RIDERS();
  // The animals that move: a wolf's body and leg, and each elephant's body and legs
  const HERD_SIZES = [1.05, 0.95, 0.55];
  const beastModels = { wolf: wolfBody(), wolfLeg: wolfLeg(), elephant: { body: elephantBody(1, false), leg: elephantLeg(1), ear: elephantEar(1), trunk: elephantTrunk(1) } };
  const lanternModel = lantern();
  const beastList = [lanternModel, beastModels.wolf, beastModels.wolfLeg, ...((e) => [e.body, e.leg, e.ear, e.trunk.upper, e.trunk.lower])(beastModels.elephant)];
  // One model per size of wheel, shared by every wheel of that size
  const wheelModels = new Map<string, ReturnType<typeof wheelModel>>();
  const wheelKey = (w: { rad: number; wid: number }) => `${w.rad}/${w.wid}`;
  for (const r of riders) for (const w of r.wheels) if (!wheelModels.has(wheelKey(w))) wheelModels.set(wheelKey(w), wheelModel(w.rad, w.wid));
  const placed = [...street.props, ...grounds.props, ...village.props];
  // The solid world: walls, plinths, steps, posts and trunks, set up while the files download
  const trunks = new Map<object, number>();
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
  const trees = [...planted.trees.map((t) => ({ at: t.at, scale: t.scale, trunk: trunkOf(t.model) })), ...planted.far.map((f) => ({ at: f.at, scale: f.scale, trunk: f.model ? trunkOf(f.model) : 0.2 }))].filter((t) => t.trunk > 0.08);
  const [propModels, folk, herdModel, packModel] = await Promise.all([loadProps(placed), peopleFiles, herdFile, packFile]);
  // The solid world is set up just after the first picture, so it never holds up the load;
  // until it's ready the walker follows the land
  let physics: Physics | null = null;
  const solidShape = { solids: [...temple.solids, ...grounds.solids, ...street.solids, ...village.solids], props: placed, trees, heightAt, extent: 165, spacing: 1.5, patches: trailPatches(165) };
  let framesShown = 0;
  /** Adds the townspeople to the picture, its reflection and the moon's shadow once they compile. */
  const addPeople = () => {
    const inScene = walking.map((w) => scene.add(w));
    const inPond = walking.map((w) => pond.reflection.add(w));
    const inShadow = walking.map((w) => light.shadow.add(w));
    void pipelines.compile([...inScene, ...inPond, ...inShadow]).then(() => {
      // Solid things first, before the water, flames and air drawn over them
      drawn.splice(3, 0, ...inScene);
      mirrored.splice(1, 0, ...inPond);
      moonCast.push(...inShadow);
      stage('people shown');
    }, (e) => console.error('people', e));
  };
  const startPhysics = () => {
    const t0 = performance.now();
    void engine.then((b3) => createPhysics(solidShape, b3)).then((p) => {
      stage(`physics ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      physics = p;
      walker.physics = p;
      vehicleBodies = riders.map((r) => p.vehicle(VEHICLE[r.kind] ?? [0.5, 0.7, 1]));
      herdBodies = HERD_SIZES.map((sz) => p.vehicle([0.85 * sz, 1.4 * sz, 1.9 * sz]));
      console.log('physics', p.count, 'shapes');
      if (PROBE_STAGES) {
        const tag = document.createElement('div');
        tag.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#fc6;font:13px monospace;z-index:9;pointer-events:none';
        document.body.append(tag);
        setInterval(() => (tag.textContent = `${walker.mode} eye ${view.pose.target.map((v) => v.toFixed(1)).join(',')} yaw ${view.pose.yaw.toFixed(2)}`), 200);
      }
    }, (e) => console.error("physics failed", e));
  };
  const VEHICLE: Record<string, V3> = { scooter: [0.36, 0.6, 0.95], auto: [0.72, 0.85, 1.4], bus: [1.25, 1.5, 5.3] };
  let vehicleBodies: number[] = [];
  let herdBodies: number[] = [];
  stage('props');

  const pool = meshPool.create(root, {
    ...meshPool.roomFor([...builtModels, flameModel, ...riders.map((r) => r.model), ...wheelModels.values(), ...beastList]),
    extra: { pat: d.f32, col: d.vec4f },
  });
  // Everything that grows has a pool of its own: one pool holds at most 256 meshes
  const grassModels = meadowModels();
  const land = landMap();
  const grassAt = meadowPlaces(land.pixels, planted.walked);
  stage('meadow');
  const treePool = meshPool.create(root, {
    ...meshPool.roomFor([...treeModels, ...plantModels, ...grassModels.short, ...grassModels.mid, ...grassModels.tall, impostors.CARD]),
    extra: { pat: d.f32, col: d.vec4f },
  });
  const tex = await textures;
  stage('tex');
  const Built = defineBuilt(pool, tex);
  const built = instances.create(root, pool, { kind: Built, capacity: builtModels.reduce((n, m) => n + m.meshes.length, 0) });
  for (const m of builtModels) built.add(pool.add(m));
  // The scanned props have a pool of their own: the scene's meshes nearly fill one
  const propPool = meshPool.create(root, { ...meshPool.roomFor([...propModels.values()]), anisotropy: 8 });
  const props = instances.create(root, propPool, { kind: Prop, capacity: rowsFor(propModels, placed) });
  const propMeshes = placeProps(propPool, props, propModels, placed);
  const Flame = defineFlame();
  const flames = instances.create(root, pool, { kind: Flame, capacity: flameModel.meshes.length + 1 });
  flames.add(pool.add(flameModel));
  const wheelRows = riders.reduce((n, r) => n + r.wheels.reduce((k, w) => k + wheelModels.get(wheelKey(w))!.meshes.length, 0), 0);
  const beastRows = lanternModel.meshes.length + 4 * 5 * Math.max(beastModels.wolf.meshes.length, beastModels.wolfLeg.meshes.length) + HERD_SIZES.length * ((e) => e.body.meshes.length + 4 * e.leg.meshes.length + e.ear.meshes.length * 2 + e.trunk.upper.meshes.length + e.trunk.lower.meshes.length)(beastModels.elephant);
  const moving = instances.create(root, pool, { kind: Built, capacity: riders.reduce((n, r) => n + r.model.meshes.length, 0) + wheelRows + beastRows, history: true });
  const rideIds = riders.map((r) => moving.add(pool.add(r.model), { position: [0, -50, 0] }));
  const wheelOf = new Map([...wheelModels].map(([k, m]) => [k, pool.add(m)]));
  const wheelIds = riders.map((r) => r.wheels.map((w) => moving.add(wheelOf.get(wheelKey(w))!, { position: [0, -50, 0] })));
  const hidden: V3 = [0, -50, 0];
  const lanternId = moving.add(pool.add(lanternModel), { position: hidden });
  const beastRig = createBeastRig({ pool, moving, models: beastModels, herdSizes: [], wolves: 0, hidden });

  const added = new Map<object, ReturnType<typeof treePool.add>>();
  const modelOf = (m: Planted['model']) => {
    let got = added.get(m);
    if (!got) {
      got = treePool.add(m);
      added.set(m, got);
    }
    return got;
  };
  const Tree = defineTree(treePool, tex);
  const rowsOf = (list: Planted[]) => list.reduce((n, t) => n + modelOf(t.model).meshes.length, 0) + 8;
  const crowns = new Map<object, ReturnType<typeof crownOf>>();
  const crownFor = (m: Planted['model']) => {
    let c = crowns.get(m);
    if (!c) crowns.set(m, (c = crownOf(m)));
    return c;
  };
  const placeAll = (set: ReturnType<typeof instances.create<typeof Tree>>, list: Planted[]) => {
    for (const t of list) {
      const place = { position: t.at, rotation: yawQ(t.yaw), scale: t.scale, stiff: t.stiff, ...crownFor(t.model) };
      const k = t.tint;
      // Each tree a shade of its own: some yellower, some darker, as no two trees of a kind match
      if (k) set.add(modelOf(t.model), (mesh) => ({ ...place, color: [mesh.material.color[0]! * k[0], mesh.material.color[1]! * k[1], mesh.material.color[2]! * k[2]] }));
      else set.add(modelOf(t.model), place);
    }
  };
  // The meadow: a sparse layer out to the fade, a dense fill near the eye
  const Grass = defineGrass(treePool);
  const pickOf = <T,>(list: T[], i: number) => list[i % list.length]!;
  const sparseOf = { short: grassModels.short, mid: grassModels.mid, tall: grassModels.tall };
  const chosen = grassAt.map((g, i) => [pickOf(sparseOf[g.length], i)] as const);
  const meadow = instances.create(root, treePool, { kind: Grass, capacity: chosen.reduce((n, c) => n + c[0].meshes.length, 0) + 8 });
  grassAt.forEach((g, i) => {
    const place = { position: g.at, rotation: yawQ(g.yaw), scale: g.scale };
    meadow.add(modelOf(chosen[i]![0]), place);
  });
  const near = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(planted.trees) });
  placeAll(near, planted.trees);
  const undergrowth = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(planted.plants) });
  placeAll(undergrowth, planted.plants);

  // The far woods: meshes close to the eye, cards beyond
  const STIFF: Record<FarKind, number> = { palm: 1, broad: 3, areca: 0.8, rubber: 2 };
  const farTrees: Planted[] = planted.far.map((f) => ({ model: farModelOf(f), at: f.at, yaw: f.yaw, scale: f.scale, stiff: STIFF[f.kind], tint: f.tint }));
  const far = instances.create(root, treePool, { kind: Tree, capacity: rowsOf(farTrees) });
  placeAll(far, farTrees);
  const card = treePool.add(impostors.CARD).meshes[0]!;
  // Each kind of far tree is a card cut from its own atlas
  const atlases = FAR_KINDS.map((k) => impostors.create(root, treePool, modelOf(planted.farModels[k]), { card, views: 8, size: 128 }));
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

  // ---- lights: every lit wick and bulb that throws light, the moon, and a few lamp shadows
  const all: Lamp[] = [...temple.lamps, ...grounds.lamps, ...street.lamps, ...village.lamps];
  /** Where wick smoke rises: the open oil lights, thinned so no two plumes start too close. */
  const wicksOf = (list: Lamp[]) => {
    const out: [number, number, number][] = [];
    for (const l of list) {
      if (l.kind !== 'oil' || out.length >= 48) continue;
      const p = l.position as [number, number, number];
      if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 0.6)) out.push(p);
    }
    return out;
  };
  const lamps = table.create(root, lighting.SpotLight, { capacity: all.length + 16, defaults: { ...lighting.WHITE_SPOT } });
  const ids = all.map((l) =>
    lamps.add({
      position: l.position,
      color: l.color,
      intensity: l.intensity,
      range: l.range,
      ...(l.spot ? { aim: [0, -1, 0.05] as V3, cone: lighting.cone(l.spot[0], l.spot[1]) } : {}),
    }),
  );
  const heads = riders.map(() => lamps.add({ position: [0, -50, 0], color: [1, 0.9, 0.75], intensity: 0, range: 26, aim: [0, -0.15, 1], cone: lighting.cone(0.22, 0.5) }));
  const tails = riders.map(() => lamps.add({ position: [0, -50, 0], color: [1, 0.08, 0.03], intensity: 0, range: 3 }));
  // A hand torch: a cool LED beam, tight, reaching a good way down the lane
  const torchLamp = lamps.add({ position: [0, -50, 0], color: [0.92, 0.95, 1], intensity: 0, range: 20, aim: [0, -0.2, 1], cone: lighting.cone(0.14, 0.3) });
  // Your own torch, switched on as the trees close in: warm white, wide and soft
  const ownTorch = lamps.add({ position: [0, -50, 0], color: [1, 0.92, 0.8], intensity: 0, range: 22, aim: [0, -0.3, -1], cone: lighting.cone(0.2, 0.62) });
  const guardLamp = lamps.add({ position: [0, -50, 0], color: [1, 0.6, 0.28], intensity: 0, range: 10 });
  const glows = riders.map((r) => (r.glow ? lamps.add({ position: [0, -50, 0], color: r.glow.color, intensity: 0, range: r.glow.range }) : null));
  const cells = grid.create(root, {
    ...lamps.live(),
    low: d.vec3f(-150, -5, -110),
    size: d.vec3f(300, 50, 260),
    sight: 15,
    position: lamps.gpu.position,
  });
  /** The far moon cascade, widened and snapped to a coarse grid so it holds still while you walk
   *  inside it; it then only needs redrawing for what moves within it. */
  const heldFar: lighting.CascadeFit = (input, places) => {
    if (!lighting.fitSlices(input, places)) return false;
    const place = places[1];
    if (place) {
      place.radius *= 1.3;
      const step = ((place.radius * 2) / input.size) * Math.floor(input.size / 10);
      place.x = Math.round(place.x / step) * step;
      place.y = Math.round(place.y / step) * step;
      place.z = Math.round(place.z / step) * step;
    }
    return true;
  };
  let shadowFrame = 0;
  const light = lighting.create(root, {
    settings: MOON,
    shading: { ambient: occludedSky, attenuation: occludedLamp, reflect: leafLit },
    points: { table: lamps, candidates: cells.candidates() },
    shadow: { eye: view, cascades: 2, far: Q.shadowFar, size: 1024, fit: heldFar },
    pointShadow: pointShadow.define({ count: 3, filter: 9 }),
  });
  light.pointShadow.cast(ids.filter((_, i) => all[i]!.shadow));

  const aa = taa.create(root, {
    source: () => screen.textures.hdr,
    region: screen.regions.hdr,
    size: surface,
    motion: () => screen.textures.motion,
    depth: () => screen.textures.depth,
    camera: view,
  });
  const shared = bindings.share(root, { shadow: light.shadow.part, pointShadow: light.pointShadow.part, ao: occlusion.part });
  const scene = passes
    .create(root, screen, { hdr: passes.color, motion: taa.motion, depth: passes.depth }, { jitter: aa.jitter, shared })
    .pipe(view.inject())
    .beneath(light.inject());

  const time = root.createUniform(d.f32);
  /** The lantern far down the hill at the end, xyz and brightness. */
  const farLantern = root.createUniform(d.vec4f);
  const withTime = (cfg: Parameters<Parameters<typeof scene.pipe>[0]>[0]) => cfg.with(now, time);
  const solid = built.renderer().pipe(withTime);
  const flaming = flames.renderer({ blend: 'translucent' }).pipe(withTime);
  const passing = moving.renderer().pipe(withTime);
  const nearTrees = near.renderer({ cull: true }).pipe(withTime);
  const farMeshes = far.renderer({ cull: true, to: LOD, fade: FADE, eye: view }).pipe(withTime);
  const cardsAt = { cull: true, from: LOD, fade: FADE, eye: view, prepass: true } as const;
  const farCards = cardSets.map((set, i) => set.renderer(cardsAt).pipe(atlases[i]!.inject()));
  const plants = undergrowth.renderer({ cull: true, to: Q.underTo, fade: Q.underFade, eye: view }).pipe(withTime);
  const grass = meadow.renderer({ cull: true, to: Q.grassTo, fade: Q.grassFade, eye: view }).pipe(withTime);
  const things = props.renderer({ cull: true });
  const culled = [nearTrees, farMeshes, ...farCards, plants, grass, things];
  const people = createPeople(root, folk, village.tulsi, village.seats, solidShape.solids);
  // The townspeople have a pipeline each, three times over; they compile after the first picture
  const herd = createHerd(root, herdModel, HERD_SIZES.length);
  const dholes = createPack(root, packModel, 4);
  const walking = boot.has('nopeople') ? [herd.renderer, dholes.renderer] : [...people.renderers, herd.renderer, dholes.renderer];

  // The town's land map: yards, lanes, litter and paddy, sampled by the ground
  const landTex = images.create(root, land, { color: 'linear' });
  const landView = landTex.createView(d.texture2d(d.f32));
  const landSmp = images.sampler(root, { wrap: 'clamp-to-edge' });
  const trailTex = images.create(root, await trailPicture, { color: 'linear' });
  const trailView = trailTex.createView(d.texture2d(d.f32));
  const ground = createGround(root, tex, {
    at: (p: d.v2f) => {
      'use gpu';
      return std.textureSample(landView.$, landSmp.$, (p + d.vec2f(LAND)) / (2 * LAND));
    },
    trail: (p: d.v2f) => {
      'use gpu';
      return std.textureSample(trailView.$, landSmp.$, (p - d.vec2f(TRAIL_MAP.lo[0], TRAIL_MAP.lo[1])) / d.vec2f(TRAIL_MAP.size[0], TRAIL_MAP.size[1]));
    },
  });
  const pond = createPond(root, { view, light, size: surface, time, shared });
  const eyes = createEyes(root);
  // The town's lamps and the far hamlet, as points of light seen from the hills
  const farLights = createFarLights(
    [
      ...all
        .filter((l) => Math.hypot(l.position[0], l.position[2]) < 200)
        .map((l) => ({ at: l.position, color: l.color, strength: Math.min(14, Math.max(4, l.intensity * 3)) })),
      ...FAR_LAMPS,
    ],
    time,
    farLantern,
  );
  const sim = clock.fixedStep({ step: 1 / 60 });
  const air = createAir(root, view, sim.step, street.lamps.filter((l) => l.spot).map((l) => l.position), wicksOf(all), village.chimneys);
  const thingsDrawn = scene.add(things);
  const drawnNames = ['land', 'river', 'built', 'moving', 'nearTrees', 'farTrees', ...FAR_KINDS.map((k) => 'cards:' + k), 'plants', 'grass', 'props', 'pond', 'farLights', 'eyes', 'flames', 'sky', 'mist', 'riverAir', 'smoke', 'kitchen', 'flies', 'moths'];
  /** The groups the bench times: the big ones, so a run fits in one short check. */
  const BENCHED = ['land', 'built', 'nearTrees', 'farTrees', ...FAR_KINDS.map((k) => 'cards:' + k), 'plants', 'grass', 'props', 'sky', 'mist'].map((n) => drawnNames.indexOf(n));
  const drawn = [
    scene.add(ground.land),
    scene.add(ground.river),
    scene.add(solid),
    scene.add(passing),
    ...culled.filter((c) => c !== things).map((c) => scene.add(c)),
    thingsDrawn,
    scene.add(pond.water),
    scene.add(farLights),
    scene.add(eyes.drawing),
    scene.add(flaming),
    scene.add(sky),
    ...air.drawings.map((a) => scene.add(a)),
  ];
  const mirrored = [
    pond.reflection.add(things),
    pond.reflection.add(ground.land),
    pond.reflection.add(sky),
    ...[solid, passing, nearTrees, farMeshes, ...farCards, flaming].map((c) => pond.reflection.add(c)),
  ];
  // What occludes: everything solid near enough for its creases to show
  const early_ = [prepass.add(things), prepass.add(ground.land), prepass.add(ground.river), ...[solid, nearTrees, farMeshes, plants].map((c) => prepass.add(c))];
  const moonCast = [light.shadow.add(things), ...[solid, nearTrees, farMeshes, plants].map((c) => light.shadow.add(c))];
  const lampCast = [light.pointShadow.add(things), light.pointShadow.add(solid)];
  /** While comparing, `p` leaves the props out of every pass: each list starts with them. */
  const keep = <T,>(list: T[], first = 0) => (look.props ? list : list.filter((_, i) => i !== first));

  const glow = bloom.create(root, { source: () => aa.output, settings: { threshold: 1.1, knee: 0.5 } });
  // The eye adapts: opening a little in a dark lane, closing before a blaze of lamps, held to a
  // narrow range so the night always stays night
  const eye = exposure.create(root, { source: aa, settings: { key: 0.035, lowest: 1.0, highest: 2.3, rise: 0.45, fall: 1.4 } });
  const final = finish.create(root, {
    format: surface.format,
    source: () => aa.output,
    tone: tone.aces,
    glow,
    grade,
    exposure: eye,
    settings: { exposure: 1.0, glowIntensity: 0.24, vignette: 0.4 },
  });
  const mist = createAtmosphere(root, view, light, 'rgba16float', shared as never);
  /** Each lamp's light this frame, for choosing the halos nearest the eye. */
  const lampNow = new Float32Array(all.length);
  const chooseHalos = () => {
    const eyeHere = tick.eye;
    const near: { i: number; d: number }[] = [];
    for (let i = 0; i < all.length; i++) {
      const l = all[i]!;
      const p = l.position;
      const dd = Math.hypot(p[0] - eyeHere[0], p[1] - eyeHere[1], p[2] - eyeHere[2]);
      if (dd < 45 && lampNow[i]! > 0.01) near.push({ i, d: dd / Math.sqrt(Math.max(l.intensity, 0.2)) });
    }
    near.sort((a, b) => a.d - b.d);
    const v = mist.values;
    v.count = Math.min(HALOS, near.length);
    for (let k = 0; k < v.count; k++) {
      const l = all[near[k]!.i]!;
      const I = lampNow[near[k]!.i]!;
      v.at[k] = d.vec4f(l.position[0], l.position[1], l.position[2], Math.min(l.range, 14));
      v.glow[k] = d.vec4f(l.color[0] * I, l.color[1] * I, l.color[2] * I, 0);
    }
  };

  stage('setup');
  // People's skinning and every other pipeline compile side by side
  const peopleReady = Promise.all([people.initAsync(), herd.initAsync(), dholes.initAsync()]).then(() => stage('people'));
  const compileList = { pool, treePool, propPool, prepass, occlusion, light, cells, aa, scene, pond, air, glow, final, mist, eye };
  if (PROBE_STAGES) {
    // One at a time, to see which take longest
    for (const [name, item] of Object.entries(compileList)) {
      await pipelines.compile([item]);
      stage(name);
    }
  } else await pipelines.compile(Object.values(compileList));
  await peopleReady;

  let seconds = 0;
  let frames = 0;
  let spent = 0;
  let fpsNow = 0;
  const RED: V3 = [1, 0.12, 0.08];
  /** Riders already put away out of sight. */
  const parked = new Set<number>();
  const personBodies: number[] = [];
  const ride = (t: number) => {
    riders.forEach((r, i) => {
      const at = rideAt(r, t);
      const id = rideIds[i]!;
      const head = heads[i]!;
      const tail = tails[i]!;
      if (physics && vehicleBodies[i] !== undefined) physics.place(vehicleBodies[i]!, at.on ? at.position : [0, -100, 0], at.yaw);
      if (!at.on) {
        if (parked.has(id)) return;
        parked.add(id);
        moving.write(id, { position: [0, -50, 0] });
        for (const w of wheelIds[i]!) moving.write(w, { position: [0, -50, 0] });
        lamps.fields.intensity.set(head, 0);
        lamps.fields.intensity.set(tail, 0);
        if (glows[i] !== null) lamps.fields.intensity.set(glows[i]!, 0);
        return;
      }
      parked.delete(id);
      const q = qmul(yawQ(at.yaw), [Math.sin(-at.pitch / 2), 0, 0, Math.cos(-at.pitch / 2)]);
      moving.write(id, { position: at.position, rotation: q });
      // Each wheel at its hub, turned by the ground it has rolled over
      r.wheels.forEach((w, k) => {
        const o = qrot(q, w.at);
        const spin = at.travelled / w.rad;
        moving.write(wheelIds[i]![k]!, {
          position: [at.position[0] + o[0], at.position[1] + o[1], at.position[2] + o[2]],
          rotation: qmul(q, [Math.sin(spin / 2), 0, 0, Math.cos(spin / 2)]),
        });
      });
      const fx = Math.sin(at.yaw);
      const fz = Math.cos(at.yaw);
      const [x, y, z] = at.position;
      lamps.fields.position.set(head, x + fx * r.lamp.forward, y + r.lamp.up, z + fz * r.lamp.forward);
      lamps.fields.aim.set(head, fx, -0.14 + Math.sin(at.pitch), fz);
      lamps.fields.intensity.set(head, 34);
      lamps.fields.position.set(tail, x - fx * r.lamp.back, y + 0.7, z - fz * r.lamp.back);
      lamps.fields.intensity.set(tail, 0.35);
      const glow = glows[i];
      if (glow !== null && r.glow) {
        lamps.fields.position.set(glow, x, y + r.glow.up, z);
        lamps.fields.intensity.set(glow, r.glow.intensity);
      }
    });
  };
  // CPU time per step of the frame, for the profile readout
  const cpu = new Map<string, number>();
  let cpuLast = 0;
  let cpuFrames = 0;
  const mark = (name: string) => {
    const t = performance.now();
    cpu.set(name, (cpu.get(name) ?? 0) + t - cpuLast);
    cpuLast = t;
  };
  (window as { cpuReport?: () => string }).cpuReport = () =>
    [...cpu].map(([k, v]) => `cpu ${(v / Math.max(1, cpuFrames)).toFixed(2)}ms ${k}`).join('\n') + `\nscale ${detail.scale.toFixed(2)}, gpu frame ${gpu.frame.ms?.toFixed(2) ?? '?'}ms`;

  // The mirror is drawn only when the pond might be on screen
  const POND_AT: V3 = [POND.x, 0, POND.z];
  const POND_REACH = POND.r * 1.5;
  const pondInView = (t: Tick) => {
    const [fx, fy, fz] = t.fwd;
    const [ex, ey, ez] = t.eye;
    const fov = view.pose.fov;
    const vx = POND_AT[0] - ex;
    const vy = POND_AT[1] - ey;
    const vz = POND_AT[2] - ez;
    const len = Math.hypot(vx, vy, vz);
    if (len < POND_REACH) return true;
    const aspect = surface.width / Math.max(1, surface.height);
    const half = Math.atan(Math.tan(fov / 2) * Math.hypot(1, aspect));
    const angle = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vy * fy + vz * fz) / len)));
    return angle < half + Math.asin(Math.min(1, POND_REACH / len)) + 0.05;
  };

  stage('compiled');
  await Promise.all([people.ready, herd.ready, dholes.ready]).catch((e) => console.warn('people textures', e));
  await Promise.all(propMeshes.map((m) => m.ready)).catch((e) => console.warn('prop textures', e));
  console.log(`${townSummary()}, meshes ${pool.meshes.length}+${treePool.meshes.length}+${propPool.meshes.length}, props ${placed.length}, lights ${all.length}, trees ${planted.trees.length}, far ${planted.far.length}, plants ${planted.plants.length}`);

  // ---- what the night sounds like
  const walls: V3[] = [];
  for (let z = COMPOUND.z0; z <= COMPOUND.z1; z += 5) for (const x of [-COMPOUND.x, COMPOUND.x, -CLOISTER.x, CLOISTER.x]) walls.push([x, GROUND, z]);
  for (let x = -COMPOUND.x; x <= COMPOUND.x; x += 5) for (const z of [COMPOUND.z0, COMPOUND.z1]) walls.push([x, GROUND, z]);
  const sound = createSound({ homes: village.homes, walls, fires: wicksOf(all).map((w) => [w[0], w[1], w[2]] as V3) });
  // Your sandals, on whatever is underfoot (only on foot, not while held or flying)
  walker.onStep = (x, z, pace, foot) => walker.mode === 'walk' && sound.step(x, z, pace, foot, walker.sneaking || walker.crouching);
  // No footstep sounds: the night is crickets and the odd vehicle
  const heard: Heard[] = riders.map((_, i) => ({ position: [0, -50, 0], velocity: [0, 0, 0], kind: riders[i]!.kind, on: false }));
  /** This frame, as every system sees it: one object, filled in place by `fillTick` once the view has moved. */
  const tick: Tick = { seconds: 0, dt: 0, eye: [0, 0, 0], fwd: [0, 0, -1], yaw: 0, x: 0, z: 0 };
  const eyeAt = tick.eye;
  const fillTick = (dt: number) => {
    const { yaw, pitch } = view.pose;
    tick.seconds = seconds;
    tick.dt = dt;
    cameras.eyeOf(view.pose, tick.eye);
    tick.fwd[0] = -Math.sin(yaw) * Math.cos(pitch);
    tick.fwd[1] = -Math.sin(pitch);
    tick.fwd[2] = -Math.cos(yaw) * Math.cos(pitch);
    tick.yaw = yaw;
    tick.x = walker.at[0];
    tick.z = walker.at[1];
  };

  // ---- the walk up to the forest bungalow: how far you've come, the wolves, your torch, arriving (journey.ts)
  const cellsLow = d.vec3f(-150, -5, -110);
  /** Things to happen a little later, on the night's clock (so they speed up in tests, and stop with the scene). */
  const pending: { in: number; run: () => void }[] = [];
  const later = (seconds: number, run: () => void) => void pending.push({ in: seconds, run });
  /** Runs what's due; whether anything ran. */
  const runLater = (dt: number) => {
    let ran = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]!;
      if ((p.in -= dt) > 0) continue;
      pending.splice(i, 1);
      p.run();
      ran = true;
    }
    return ran;
  };
  const journey = createJourney({
    walker,
    people,
    sound,
    eyes,
    cover: createCover(trees, planted.plants),
    view,
    later,
    fog: { base: MOON.fogDensity, set: (fogDensity) => light.settings.patch({ fogDensity }) },
    torchLamp: (px, py, pz, ax, ay, az, intensity) => {
      lamps.fields.position.set(ownTorch, px, py, pz);
      lamps.fields.aim.set(ownTorch, ax, ay, az);
      lamps.fields.intensity.set(ownTorch, intensity);
    },
    beasts: (t) => {
      poseBeasts(t.seconds, t.fwd[0], t.fwd[1], t.fwd[2]);
      herd.update(danger.herd, t.seconds);
      dholes.update(danger.wolves, danger.pack, t.seconds);
      danger.herd.forEach((e, i) => {
        if (physics && herdBodies[i] !== undefined) physics.place(herdBodies[i]!, [e.x, heightAt(e.x, e.z), e.z], e.yaw);
      });
    },
  });
  const { danger, story } = journey;
  const walk = journey.state;
  const poseBeasts = beastRig.animate({ danger, eyes, eyeAt, torch: () => walk.torch });
  const staticSets = [built, flames, near, far, undergrowth, meadow, ...cardSets, props];

  /** For scenarios and the state readout (scenarios.ts); nothing here runs unless called. */
  const test = {
    /** How fast the night's clock runs: story, danger, wind, lamps. Walking stays real time. */
    timeScale: 1,
    /** Which drawing group the scene pass leaves out (`x chord), -1 for none. */
    skip: -1,
    /** Times the scene pass without each drawing group in turn, at full resolution (`b chord). */
    bench() {
      Object.assign(bench, { on: true, step: 0, at: -1, since: performance.now() + 600, table: 'benching…' });
      bench.sums.clear();
      test.skip = -1;
    },
    danger,
    story,
    get guardGone() {
      return people.guard.gone;
    },
    /** As if the cook's note had been read. */
    readNote() {
      walk.noteRead = true;
    },
    get state() {
      const [x, z] = walker.at;
      return {
        t: +seconds.toFixed(1),
        mode: walker.mode,
        solid: walker.solid,
        at: [+x.toFixed(1), +z.toFixed(1)],
        yaw: +view.pose.yaw.toFixed(2),
        along: Math.round(walk.furthest),
        deep: +walk.deep.toFixed(2),
        stamina: +walker.stamina.toFixed(2),
        torch: !walk.torchOff,
        hidden: walk.hidden,
        near: walk.near?.label ?? (walk.near ? 'Look closer' : null),
        arrived: walk.arrived,
        ended: walk.ended,
        downs: walk.downs,
        guardGone: people.guard.gone,
        danger: danger.debug,
        story: story.debug,
        fps: +fpsNow.toFixed(0),
        boot: stages.join(' '),
        bench: bench.table,
        hiding: test.skip >= 0 ? (drawnNames[test.skip] ?? test.skip) : 'none',
        // Per-frame CPU ms by step, the GPU frame and the resolution scale, for perf at a glance
        cpu: [...cpu].map(([k, v]) => `${k}:${(v / Math.max(1, cpuFrames)).toFixed(1)}`).join(' '),
        gpuMs: +(gpu.frame.ms ?? -1).toFixed(1),
        gpu: gpu.timers.map((t) => `${t.name}:${t.ms?.toFixed(1) ?? '?'}`).join(' '),
        scale: +detail.scale.toFixed(2),
        sound: sound.stats,
        meshes: `${pool.meshes.length}+${treePool.meshes.length}+${propPool.meshes.length}`,
      };
    },
  };

  return {
    view,
    walker,
    /** The walk to the forest bungalow: how far along, and a call for arriving. */
    journey: journey.api,
    touched() {
      walker.touched();
    },
    test,
    frame(frame: Frame) {
      const dt = frame.dt * test.timeScale;
      seconds += dt;
      frames++;
      spent += frame.dt;
      if (spent > 1) {
        fpsNow = frames / spent;
        frames = 0;
        spent = 0;
      }
      cpuLast = performance.now();
      walker.update(frame.dt);
      mark('walker');
      // On foot the view keeps right up with the head, only smoothing out the jitter of the
      // mouse; in the air above it glides
      view.update(walker.mode === 'walk' ? Math.min(frame.dt * 4, 0.2) : frame.dt);
      mark('camera');
      time.write(seconds);
      farLantern.write(d.vec4f(...farLanternAt(story.sitting)));
      for (let i = 0; i < all.length; i++) {
        const l = all[i]!;
        const now = lampAt(l, seconds);
        lamps.fields.intensity.set(ids[i]!, l.intensity * now.level);
        lampNow[i] = l.intensity * now.level;
        if (l.kind === 'sodiumBad') {
          const w = now.warm;
          lamps.fields.color.set(ids[i]!, RED[0] + (l.color[0] - RED[0]) * w, RED[1] + (l.color[1] - RED[1]) * w, RED[2] + (l.color[2] - RED[2]) * w);
        }
      }
      mark('lamps');
      // Half a second of pictures first, then the solid world
      if (++framesShown === (PROBE_STAGES ? 2 : 30)) startPhysics();
      if (framesShown === 2) addPeople();
      ride(seconds);
      riders.forEach((r, i) => {
        const at = rideAt(r, seconds);
        const h = heard[i]!;
        h.on = at.on;
        h.position = at.position;
        h.velocity = [Math.sin(at.yaw) * r.speed, 0, Math.cos(at.yaw) * r.speed];
      });
      mark('traffic');
      fillTick(dt);
      // Timers first; if one moved you (waking up after going down), the frame starts from there
      if (runLater(dt)) fillTick(dt);
      journey.step(tick);
      mark('journey');
      sound.update(frame.dt, eyeAt, view.pose.yaw, heard);
      mark('sound');
      // The lights' grid goes where you go, so the forest's lamps are found out there too
      cellsLow.x = eyeAt[0] - 150;
      cellsLow.z = eyeAt[2] - 130;
      cells.move(cellsLow);
      people.setPlayer(walker.at[0], walker.at[1]);
      people.step(seconds, frame.dt);
      const ph = physics;
      if (ph) people.where.forEach((w, i) => ph.place(personBodies[i] ?? (personBodies[i] = ph.person()), w, 0));
      const lp = people.guard.lantern;
      moving.write(lanternId, { position: lp, rotation: yawQ(people.guard.yaw) });
      lamps.fields.position.set(guardLamp, lp[0], lp[1] + 0.05, lp[2]);
      lamps.fields.intensity.set(guardLamp, lp[1] > -40 && !people.guard.gone ? 2.2 * (0.92 + Math.sin(seconds * 13) * 0.03 + Math.sin(seconds * 7.3) * 0.05) : 0);
      const tp = people.torch;
      lamps.fields.position.set(torchLamp, tp.position[0], tp.position[1], tp.position[2]);
      lamps.fields.aim.set(torchLamp, tp.aim[0], tp.aim[1], tp.aim[2]);
      lamps.fields.intensity.set(torchLamp, tp.on ? 16 : 0);
      mark('people');
      // Every write above lands now: lamps, the guard's lantern and the torches this frame, not the next
      lamps.flush();
      for (const set of staticSets) set.flush();
      moving.flush(frame);
      people.flush(frame);
      herd.flush(frame);
      dholes.flush(frame);
      mark('flush');

      if (bench.on && performance.now() - bench.since > 190) {
        if (bench.step + 1 < BENCHED.length * 2) {
          bench.step++;
          bench.since = performance.now();
          test.skip = bench.step % 2 ? BENCHED[(bench.step - 1) / 2]! : -1;
        } else {
          bench.on = false;
          test.skip = -1;
          delete (window as { pinScale?: number }).pinScale;
          const avg = (k: number) => { const g = bench.sums.get(k); return g && g[1] ? g[0] / g[1] : NaN; };
          const wholes = BENCHED.map((_, k) => avg(2 * k)).filter((v) => v === v);
          const whole = wholes.reduce((a, b) => a + b, 0) / Math.max(1, wholes.length);
          bench.table = `all ${whole.toFixed(2)} | ` + BENCHED.map((i) => drawnNames[i]!).map((n, k) => [n, avg(2 * k) - avg(2 * k + 1)] as const).sort((a, b) => b[1] - a[1]).map(([n, d]) => `${n} ${d.toFixed(2)}`).join(', ');
          console.log('bench', bench.table);
        }
      }
      if (bench.on) (window as { pinScale?: number }).pinScale = 1;
      const steps = sim.update(frame.dt);
      if (!(window as { pinScale?: number }).pinScale) detail.update(frame);
      else detail.scale = (window as { pinScale?: number }).pinScale!;
      const compute = frame.encoder.beginComputePass({ timestampWrites: opening.writes() });
      cells.sort(compute);
      // Shadows: the lamps' never change; the moon's near cascade draws every frame (people walk,
      // leaves sway), the far one every third frame from a held place, so culling skips the rest
      shadowFrame++;
      light.shadow.prepare({ redraw: (cascade) => cascade === 0 || shadowFrame % 3 === 0 });
      light.pointShadow.prepare({ redraw: () => false });
      for (const c of culled) c.cull(compute);
      people.animate(compute, seconds);
      herd.animate(compute, seconds);
      dholes.animate(compute, seconds);
      air.spawn(compute);
      for (let i = 0; i < steps; i++) air.step(compute);
      air.compact(compute, sim.ahead);
      compute.end();
      mark('compute');

      screen.fit();
      early.fit();
      if (look.occlusion) prepass.record(frame, keep(early_), { timestampWrites: preTime.writes() });
      occlusion.record(frame, { timestampWrites: aoTime.writes() });
      mark('r.ao');
      light.shadow.record(frame, keep(moonCast), { timestampWrites: moonTime.writes() });
      mark('r.moon');
      light.pointShadow.record(frame, keep(lampCast), { timestampWrites: lampTime.writes() });
      mark('r.lamps');
      if (pondInView(tick)) pond.record(frame, keep(mirrored));
      scene.record(frame, test.skip >= 0 ? drawn.filter((_, i) => i !== test.skip) : look.props ? drawn : drawn.filter((x) => x !== thingsDrawn), { timestampWrites: sceneTime.writes() });
      mark('r.scene');
      chooseHalos();
      mist.record(frame, screen.views.hdr, screen.textures.depth, screen.regions.hdr);
      aa.record(frame, { timestampWrites: aaTime.writes() });
      eye.record(frame);
      glow.record(frame, { timestampWrites: glowTime.writes() });
      final.record(frame, surface.view(frame), { timestampWrites: closing.writes() });
      gpu.capture(frame);
      mark('r.post');
      cpuFrames++;
    },
    destroy() {
      for (const made of [tex, gpu, screen, early, occlusion, lamps, cells, light, aa, built, props, flames, moving, near, far, undergrowth, meadow, landTex, people, ...cardSets, ...atlases, pool, treePool, propPool, pond, air, glow, mist, eye]) made.destroy();
    },
  };
}
