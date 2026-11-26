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
import { defineBuilt, defineFlame, now } from '../render/surfaces.ts';
import { lampAt, type Lamp } from '../render/flicker.ts';
import { loadTextures } from '../render/tex.ts';
import { CLOISTER, COMPOUND, GROUND } from '../content/world.ts';
import { TUNING } from '../content/tuning.ts';
import { RIDERS, rideAt, wheelModel } from '../world/town/traffic.ts';
import { createGround } from '../render/ground.ts';
import { sky, MOON_ARRAY } from '../render/sky.ts';
import { grade } from '../render/look.ts';
import { createVegetation, prepareVegetation, type loadSpecimenGeometry } from '../render/vegetation.ts';
import { createPond } from '../render/pond.ts';
import { createAir } from '../render/air.ts';
import { loadWorldLayout } from '../world/layout.ts';
import { LAND, townSummary } from '../world/town/town.ts';
import type { TownData } from '../world/town/load.ts';
import { createPeople, peopleLoader } from '../render/actors/people.ts';
import { createHerd, loadHerd } from '../render/actors/herd.ts';
import { createPack, loadPack } from '../render/actors/pack.ts';
import { createAtmosphere, HALOS } from '../render/atmosphere.ts';
import { createSound, type Rider as Heard } from '../audio/sound.ts';
import { FAR_KINDS } from '../world/vegetation/planting.ts';
import { heightAt } from '../world/terrain.ts';
import { createWalker } from '../sim/walk.ts';
import { createPhysics, loadPhysics, type Physics } from '../physics/physics.ts';
import { TRAIL_MAP, trailPatches } from '../world/trail/trail.ts';
import { FAR_LAMPS, GLADE } from '../world/trail/jungle.ts';
import { createJourney, farLanternAt, type Tick } from '../sim/journey.ts';
import { createCover } from '../sim/cover.ts';
import { lantern } from '../world/trail/lantern.ts';
import { updateDholeEyes } from '../render/dhole-eyes.ts';
import { createEyes } from '../render/eyes.ts';
import { qmul, qrot, yawQ } from '../math/quat.ts';
import { createFarLights } from '../render/farlights.ts';
import { loadProps, placeProps, Prop, propBudget, propNear, splitProps } from '../render/props.ts';
import type { Launch } from './launch.ts';
import { boot } from './boot.ts';
import { plansClear } from '../content/npc-plans.ts';
import { randomStreams } from '../math/random.ts';
import { Q } from '../render/quality.ts';

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

type SceneInputs = { launch: Launch; specimensReady: ReturnType<typeof loadSpecimenGeometry>; town: Promise<TownData> };

export async function createScene(root: TgpuRoot, surface: Surface, { launch, specimensReady, town }: SceneInputs) {
  const bakedLayout = loadWorldLayout(document.querySelector<HTMLLinkElement>('#world-layout')!.href);
  const random = randomStreams(boot.get('seed'));
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

  if (launch.camera) {
    walker.hold(...launch.camera);
    view.jump();
  }

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
  /** When each startup stage finished, in milliseconds since the page began loading (for the readout). */
  performance.mark('game:scene', { startTime: t0 });
  const stages = [{ name: 'scene', ms: Math.round(t0) }];

  const stage = (name: string) => {
    const n = document.querySelector('#note');

    if (n && PROBE_STAGES) n.textContent = (n.textContent ?? '') + ` ${name}:${((performance.now() - t0) / 1000).toFixed(1)}`;

    if (PROBE_STAGES) {
      const tag = document.querySelector('#stages') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'stages' }));
      (tag as HTMLElement).style.cssText = 'position:fixed;left:8px;top:8px;color:#fc6;font:14px monospace;z-index:9;text-shadow:0 0 3px #000';
      tag.textContent += ` ${name}:${((performance.now() - t0) / 1000).toFixed(2)}`;
    }

    console.log('stage', name, ((performance.now() - t0) / 1000).toFixed(2));
    const mark = performance.mark('game:' + name);
    stages.push({ name, ms: Math.round(mark.startTime) });
  };

  // Downloads first, so the files arrive while the town is being built
  const loadPeople = peopleLoader();
  const textures = loadTextures(root, Math.min(surface.width, surface.height) > 700);

  // The forest path's map, baked by tools/trail/map.ts
  const trailPicture = fetch(`${import.meta.env.BASE_URL}tex/trail.png`)
    .then((r) => r.arrayBuffer())
    .then((b) => images.decode({ bytes: new Uint8Array(b), mimeType: 'image/png' }));

  const engine = launch.physics ? loadPhysics() : undefined;

  const aa = taa.create(root, {
    source: () => screen.textures.hdr,
    region: screen.regions.hdr,
    size: surface,
    motion: () => screen.textures.motion,
    depth: () => screen.textures.depth,
    camera: view,
  });

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

  // These passes depend only on the surface and camera. Compile while workers and downloads run.
  const screenPasses = { occlusion, aa, glow, eye, final };
  const screenReady = PROBE_STAGES ? undefined : pipelines.compile(Object.values(screenPasses));
  const { buildings, flames: flameModel, village, placed, solids, feet, lamps: all, streetLights } = await town;
  stage('built');
  const propGroups = splitProps(placed, launch.forest || !launch.people ? launch.camera : undefined);
  const propFiles = loadProps(propGroups.first);
  const { plans: bakedPlans, planted, land, grassAt } = await bakedLayout;
  stage('layout');
  const plans = boot.has('lineup') ? plansClear(village.tulsi, village.seats, solids, feet) : bakedPlans;
  const isWatcher = (p: typeof plans[number]) => p.kind === 'walk' && p.watcher;
  // A town capture includes all residents. Other views can stream them after the first frame.
  const customCamera = launch.camera && !launch.forest && !launch.people;

  const cameraNearResidents = customCamera && plans.some(p => {
    if (isWatcher(p)) return false;
    const points = p.kind === 'walk' ? p.route : [p.at];

    return points.some(([x, z]) => Math.hypot(x - launch.camera![0], z - launch.camera![1]) <= 180);
  });

  const streamResidents = !cameraNearResidents && (launch.forest || !launch.people) && !boot.has('lineup');
  const initialPlans = streamResidents ? plans.filter(isWatcher) : plans;
  const peopleFiles = loadPeople(initialPlans);
  const riders = RIDERS();
  const lanternModel = lantern();
  // One model per size of wheel, shared by every wheel of that size
  const wheelModels = new Map<string, ReturnType<typeof wheelModel>>();
  const wheelKey = (w: { rad: number; wid: number }) => `${w.rad}/${w.wid}`;

  for (const r of riders) for (const w of r.wheels) if (!wheelModels.has(wheelKey(w))) wheelModels.set(wheelKey(w), wheelModel(w.rad, w.wid));
  // The solid world: walls, plinths, steps, posts and trunks, set up while the files download
  const [propModels, folk, models] = await Promise.all([propFiles, peopleFiles, specimensReady]);
  const { geometry, trees } = prepareVegetation(planted, models);
  // The solid world is set up just after the first picture, so it never holds up the load;
  // until it's ready the walker follows the land
  let physics: Physics | null = null;
  const solidShape = { solids, props: placed, trees, heightAt, extent: 165, spacing: 1.5, patches: trailPatches(165) };
  let framesShown = 0;
  let drewFullMaterials = false;
  let streamingWorld = false;
  const scenarioEntry = launch.tour || launch.bungalow || !!launch.preset;
  let userPlaying = false;
  const input = new AbortController();

  const beginPlay = (event: Event) => {
    if (!event.isTrusted) return;
    userPlaying = true;
    input.abort();
  };

  for (const type of ['keydown', 'pointerdown', 'wheel'])
    window.addEventListener(type, beginPlay, { capture: true, passive: true, signal: input.signal });

  /** Adds the townspeople to the picture, its reflection and the moon's shadow once they compile. */
  const addPeople = async (group: ReturnType<typeof createPeople>) => {
    const walking = boot.has('nopeople') ? [] : group.renderers;
    const inScene = walking.map((w) => scene.add(w));
    const inPond = walking.map((w) => pond.reflection.add(w));
    const inShadow = walking.map((w) => light.shadow.add(w));
    const drawings = [...inScene, ...inPond, ...inShadow];

    try {
      await pipelines.compile(pond.prepareActors ? drawings : [...inScene, ...inShadow]);

      if (disposed) {
        for (const drawing of drawings) drawing.destroy();

        return;
      }

      // Solid things first, before the water, flames and air drawn over them
      drawn.splice(3, 0, ...inScene);
      drawnNames.splice(3, 0, ...inScene.map((_, i) => 'actor:' + i));
      mirrored.splice(1, 0, ...inPond);
      moonCast.push(...inShadow);
      stage('people shown');
    } catch (error) {
      for (const drawing of drawings) drawing.destroy();
      throw error;
    }
  };

  let physicsLoading: Promise<void> | undefined;

  const requirePhysics = () =>
    physicsLoading ??= (engine ?? loadPhysics()).then((b3) => createPhysics(solidShape, b3)).then((p) => {
      stage('physics');
      physics = p;
      walker.physics = p;
      vehicleBodies = riders.map((r) => p.vehicle(VEHICLE[r.kind] ?? [0.5, 0.7, 1]));
      herdBodies = TUNING.herd.sizes.map((sz) => p.vehicle([0.85 * sz, 1.4 * sz, 1.9 * sz]));
      console.log('physics', p.count, 'shapes');

      if (PROBE_STAGES) {
        const tag = document.createElement('div');
        tag.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#fc6;font:13px monospace;z-index:9;pointer-events:none';
        document.body.append(tag);
        setInterval(() => (tag.textContent = `${walker.mode} eye ${view.pose.target.map((v) => v.toFixed(1)).join(',')} yaw ${view.pose.yaw.toFixed(2)}`), 200);
      }
    });

  const VEHICLE: Record<string, V3> = { scooter: [0.36, 0.6, 0.95], auto: [0.72, 0.85, 1.4], bus: [1.25, 1.5, 5.3] };
  let vehicleBodies: number[] = [];
  let herdBodies: number[] = [];
  const physicsSetup = launch.physics ? requirePhysics() : undefined;
  stage('props');

  const pool = meshPool.create(root, {
    ...meshPool.roomFor([buildings, flameModel, ...riders.map((r) => r.model), ...wheelModels.values(), lanternModel]),
    extra: { pat: d.f32, col: d.vec4f },
  });

  const tex = await textures;
  tex.refine();
  stage('tex');
  const Built = defineBuilt(pool, tex);
  const built = instances.create(root, pool, { kind: Built, capacity: buildings.meshes.length });
  built.add(pool.add(buildings));
  // The scanned props have a pool of their own: the scene's meshes nearly fill one
  const budget = propBudget(placed);
  const propPool = meshPool.create(root, { ...budget.pool, anisotropy: 8 });
  const props = instances.create(root, propPool, { kind: Prop, capacity: budget.rows });
  const propMeshes = placeProps(propPool, props, propModels, propGroups.first);
  const Flame = defineFlame();
  const flames = instances.create(root, pool, { kind: Flame, capacity: flameModel.meshes.length + 1 });
  flames.add(pool.add(flameModel));
  const wheelRows = riders.reduce((n, r) => n + r.wheels.reduce((k, w) => k + wheelModels.get(wheelKey(w))!.meshes.length, 0), 0);
  const moving = instances.create(root, pool, { kind: Built, capacity: riders.reduce((n, r) => n + r.model.meshes.length, 0) + wheelRows + lanternModel.meshes.length, history: true });
  const rideIds = riders.map((r) => moving.add(pool.add(r.model), { position: [0, -50, 0] }));
  const wheelOf = new Map([...wheelModels].map(([k, m]) => [k, pool.add(m)]));
  const wheelIds = riders.map((r) => r.wheels.map((w) => moving.add(wheelOf.get(wheelKey(w))!, { position: [0, -50, 0] })));
  const hidden: V3 = [0, -50, 0];
  const lanternId = moving.add(pool.add(lanternModel), { position: hidden });

  const vegetation = createVegetation(root, tex, planted, geometry, grassAt, view.pose);
  const { treePool, near, far, undergrowth, meadow, atlases, cardSets } = vegetation;

  // ---- lights: every lit wick and bulb that throws light, the moon, and a few lamp shadows
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
  const farMeshes = far.renderer({ cull: true, to: Q.lod, fade: Q.lodFade, eye: view }).pipe(withTime);
  const cardsAt = { cull: true, from: Q.lod, fade: Q.lodFade, eye: view, prepass: true } as const;
  const farCards = cardSets.map((set, i) => set.renderer(cardsAt).pipe(atlases[i]!.inject()));
  const plants = undergrowth.renderer({ cull: true, to: Q.underTo, fade: Q.underFade, eye: view }).pipe(withTime);
  const grass = meadow.renderer({ cull: true, to: Q.grassTo, fade: Q.grassFade, eye: view }).pipe(withTime);
  const things = props.renderer({ cull: true });
  const culled = [nearTrees, farMeshes, ...farCards, plants, grass, things];
  const people = createPeople(root, folk, initialPlans, feet, random.people);
  const population = [people];
  let residents: typeof people | undefined;

  async function loadResidents() {
    const town = plans.filter(p => !isWatcher(p));
    const files = await loadPeople(town);

    if (disposed) return;
    const group = createPeople(root, files, town, feet, random.people);

    try {
      await Promise.all([group.ready, group.initAsync()]);

      if (!disposed) await addPeople(group);

      if (disposed) group.destroy();
      else { residents = group; population.push(group); }
    } catch (error) {
      group.destroy();
      throw error;
    }
  }

  let loadingResidents: Promise<void> | undefined;
  const residentsReady = () => loadingResidents ??= streamResidents ? loadResidents() : Promise.resolve();
  const laterProps = Map.groupBy(propGroups.later, p => p.name);
  const loadingProps = new Map<string, Promise<void>>();

  async function propsReady(at?: readonly number[]) {
    const near: Promise<void>[] = [];

    for (const [name, placements] of laterProps) {
      if (at && !placements.some(p => propNear(p, at))) continue;
      let ready = loadingProps.get(name);

      if (!ready) {
        ready = loadProps(placements).then(async files => {
          if (disposed) return;
          await Promise.all(placeProps(propPool, props, files, placements).map(mesh => mesh.ready));
        });
        loadingProps.set(name, ready);
      }

      near.push(ready);
    }

    await Promise.all(near);
  }

  async function prepareView(spot: { shot: string; at: readonly number[] }) {
    const [x, z, yaw, pitch, height] = spot.at;
    await Promise.all([
      pond.inView(x, heightAt(x, z) + height, z, yaw, pitch) && pond.prepare(),
      propsReady(spot.shot === 'town' ? undefined : spot.at),
      spot.shot === 'town' && residentsReady(),
      (spot.shot.startsWith('herd-') || (spot.shot === 'camera' && facesHerd(spot.at))) && requireWildlife('herd'),
    ]);
  }

  // The townspeople have a pipeline each, three times over; they compile after the first picture
  let herd: ReturnType<typeof createHerd> | null = null;
  let dholes: ReturnType<typeof createPack> | null = null;
  let disposed = false;
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
  const air = createAir(root, view, sim.step, streetLights, wicksOf(all), village.chimneys);
  const thingsDrawn = scene.add(things);
  const drawnNames = ['land', 'river', 'built', 'moving', 'nearTrees', 'farTrees', ...FAR_KINDS.map((k) => 'cards:' + k), 'plants', 'grass', 'props', 'pond', 'farLights', 'eyes', 'flames', 'sky', 'mist', 'riverAir', 'smoke', 'kitchen', 'flies', 'moths'];
  /** The groups the bench times: the big ones, so a run fits in one short check. */
  const BENCHED = ['land', 'built', 'nearTrees', 'farTrees', ...FAR_KINDS.map((k) => 'cards:' + k), 'plants', 'grass', 'props', 'sky', 'mist'];

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

  // Start after the first submitted picture. Each species can succeed independently; no late
  // completion may register drawings or retain resources after the scene has been destroyed.
  const prepareWildlife = async <T extends ReturnType<typeof createHerd> | ReturnType<typeof createPack>>(
    name: string, load: typeof loadHerd, make: (model: Awaited<ReturnType<typeof loadHerd>>) => T, accept: (made: T) => void,
  ) => {
    let made: T | undefined;
    const added: { destroy(): void }[] = [];

    try {
      const model = await load();

      if (disposed) return;
      made = make(model);
      await Promise.all([made.ready, made.initAsync()]);

      if (disposed) { made.destroy();

 return; }

      const inScene = scene.add(made.renderer); added.push(inScene);
      const inPond = pond.reflection.add(made.renderer); added.push(inPond);
      const inShadow = light.shadow.add(made.renderer); added.push(inShadow);
      await pipelines.compile(pond.prepareActors ? [inScene, inPond, inShadow] : [inScene, inShadow]);

      if (disposed) { for (const drawing of added) drawing.destroy(); made.destroy();

 return; }

      drawn.splice(3, 0, inScene);
      drawnNames.splice(3, 0, name);
      mirrored.splice(1, 0, inPond);
      moonCast.push(inShadow);
      accept(made);
      stage(`${name} shown`);
    } catch (error) {
      for (const drawing of added) drawing.destroy();
      made?.destroy();
      throw error;
    }
  };

  const wildlife: Partial<Record<'herd' | 'dholes', Promise<void>>> = {};

  // A free camera may point at the elephants from outside their simulation range.
  // Include the glade and the ground a charging cow can cover in the camera frustum.
  function facesHerd([x, z, yaw, pitch, eyeHeight]: readonly number[]) {
    const dx = GLADE.x - x, dz = GLADE.z - z;
    const dy = heightAt(GLADE.x, GLADE.z) + 2 - heightAt(x, z) - eyeHeight;
    const along = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
    const forward = along * Math.cos(pitch) - dy * Math.sin(pitch);
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const up = along * Math.sin(pitch) + dy * Math.cos(pitch);
    const vertical = Math.tan(view.pose.fov / 2);
    const horizontal = vertical * surface.width / Math.max(1, surface.height);
    const radius = GLADE.r + TUNING.herd.charge.maxRun;

    return forward >= -radius && Math.abs(right) <= forward * horizontal + radius * Math.hypot(1, horizontal)
      && Math.abs(up) <= forward * vertical + radius * Math.hypot(1, vertical);
  }

  function requireWildlife(species: 'herd' | 'dholes') {
    return wildlife[species] ??= species === 'herd'
      ? prepareWildlife('herd', loadHerd, model => createHerd(root, model, TUNING.herd.sizes.length), made => { herd = made; })
      : prepareWildlife('dholes', loadPack, model => createPack(root, model, TUNING.dholes.size[1]), made => { dholes = made; });
  }

  /** While comparing, `p` leaves the props out of every pass: each list starts with them. */
  const keep = <T,>(list: T[], first = 0) => (look.props ? list : list.filter((_, i) => i !== first));

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
  const firstWildlife = launch.wildlife ?? (launch.camera && boot.has('at') && facesHerd(launch.camera) ? 'herd' : undefined);
  const wildlifeSetup = firstWildlife && requireWildlife(firstWildlife);
  const actorSetup = addPeople(people);
  // People's skinning and every other pipeline compile side by side
  const peopleReady = people.initAsync().then(() => stage('people'));
  const compileList = { pool, treePool, propPool, prepass, light, cells, scene, pond, air, mist };

  if (PROBE_STAGES) {
    // One at a time, to see which take longest
    for (const [name, item] of Object.entries({ ...screenPasses, ...compileList })) {
      await pipelines.compile([item]);
      stage(name);
    }
  } else await pipelines.compile(Object.values(compileList));
  await Promise.all([screenReady, peopleReady, physicsSetup, actorSetup, wildlifeSetup]);

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

  const profile = boot.has('profile');


  stage('compiled');
  await people.ready.catch((e) => console.warn('people textures', e));
  await Promise.all(propMeshes.map((m) => m.ready)).catch((e) => console.warn('prop textures', e));
  console.log(`${townSummary()}, meshes ${pool.meshes.length}+${treePool.meshes.length}+${propPool.meshes.length}, props ${placed.length}, lights ${all.length}, trees ${planted.trees.length}, far ${planted.far.length}, plants ${planted.plants.length}`);

  // ---- what the night sounds like
  const walls: V3[] = [];

  for (let z = COMPOUND.z0; z <= COMPOUND.z1; z += 5) for (const x of [-COMPOUND.x, COMPOUND.x, -CLOISTER.x, CLOISTER.x]) walls.push([x, GROUND, z]);

  for (let x = -COMPOUND.x; x <= COMPOUND.x; x += 5) for (const z of [COMPOUND.z0, COMPOUND.z1]) walls.push([x, GROUND, z]);
  const sound = createSound({ homes: village.homes, walls, fires: wicksOf(all).map((w) => [w[0], w[1], w[2]] as V3) }, random.audio);
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
    random,
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
      updateDholeEyes(eyes, danger.wolves, eyeAt, t.fwd, walk.torch);
      herd?.update(danger.herd, t.seconds);
      dholes?.update(danger.wolves, danger.pack, t.seconds);
      danger.herd.forEach((e, i) => {
        if (physics && herdBodies[i] !== undefined) physics.place(herdBodies[i]!, [e.x, heightAt(e.x, e.z), e.z], e.yaw);
      });
    },
  });

  const { danger, story } = journey;
  const walk = journey.state;
  const staticSets = [built, flames, near, far, undergrowth, meadow, ...cardSets, props];

  /** For scenarios and the state readout (scenarios.ts); nothing here runs unless called. */
  const test = {
    /** How fast the night's clock runs: story, danger, wind, lamps. Walking stays real time. */
    timeScale: 1,
    /** Initialize interactions at the launch pose before the first rendered frame. */
    stepJourney(dt: number) {
      seconds += dt;
      fillTick(dt);
      journey.step(tick);
    },
    /** Which drawing group the scene pass leaves out (`x chord), -1 for none. */
    skip: -1,
    /** Times the scene pass without each drawing group in turn, at full resolution (`b chord). */
    bench() {
      Object.assign(bench, { on: true, step: 0, at: -1, since: performance.now() + 600, table: 'benching…' });
      bench.sums.clear();
      test.skip = -1;
    },
    requirePhysics, requireWildlife, prepareView,
    get guardGone() {
      return people.guard.gone;
    },
  };

  return {
    view, walker, journey, test,
    get fullMaterialFrame() { return drewFullMaterials; },
    inspect() {
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
        interactionId: walk.near?.id ?? null,
        reading: walk.reading,
        arrived: walk.arrived,
        ended: walk.ended,
        downs: walk.downs,
        guardGone: people.guard.gone,
        danger: danger.debug,
        story: story.debug,
        fps: +fpsNow.toFixed(0),
        boot: stages.slice(),
        bench: bench.table,
        hiding: test.skip >= 0 ? (drawnNames[test.skip] ?? test.skip) : 'none',
        // Per-frame CPU ms by step, the GPU frame and the resolution scale, for perf at a glance
        cpu: Object.fromEntries([...cpu].map(([name, ms]) => [name, +(ms / Math.max(1, cpuFrames)).toFixed(2)])),
        gpuMs: gpu.frame.ms ?? null,
        gpu: Object.fromEntries(gpu.timers.map(t => [t.name, t.ms ?? null])),
        scale: +detail.scale.toFixed(2),
        sound: sound.stats,
        meshes: { built: pool.meshes.length, vegetation: treePool.meshes.length, props: propPool.meshes.length },
      };
    },
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
      pond.updateVisibility(framesShown > 0);

      // A camera turn can reach the pond while an explicit viewpoint jump is still warming it.
      // Present the last finished picture until those pipelines can draw the complete reflection.
      if (framesShown && pond.waitingForPicture) {
        final.record(frame, surface.view(frame));

        return;
      }

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
      framesShown++;
      // A scripted walk or seated replay prepares its own resources. A real gesture resumes free play.
      const exploring = walker.mode !== 'held' && (!scenarioEntry || userPlaying);

      if (exploring && (userPlaying || framesShown >= (PROBE_STAGES ? 2 : 30)) && !physicsLoading)
        void requirePhysics().catch(e => console.error('physics', e));

      // Give the idle camera its full detail before fetching the rest of the village.
      // A player's first gesture starts the residents and props immediately.
      if (exploring && framesShown >= 2 && !streamingWorld && (userPlaying || tex.detail !== 'preview')) {
        streamingWorld = true;
        void Promise.all([residentsReady(), propsReady()]).catch(e => console.error('village assets', e));
      }

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

      if (exploring && !wildlife.herd && Math.hypot(tick.x - GLADE.x, tick.z - GLADE.z) < TUNING.herd.range)
        void requireWildlife('herd').catch(error => console.warn('herd', error));

      if (exploring && !wildlife.dholes && journey.onHuntingGround)
        void requireWildlife('dholes').catch(error => console.warn('dholes', error));
      mark('journey');
      sound.update(frame.dt, eyeAt, view.pose.yaw, heard);
      mark('sound');
      // The lights' grid goes where you go, so the forest's lamps are found out there too
      cellsLow.x = eyeAt[0] - 150;
      cellsLow.z = eyeAt[2] - 130;
      cells.move(cellsLow);
      const ph = physics;
      let body = 0;

      for (const group of population) {
        group.setPlayer(walker.at[0], walker.at[1]);
        group.step(seconds, frame.dt);

        if (ph) for (const position of group.where) {
          ph.place(personBodies[body] ?? (personBodies[body] = ph.person()), position, 0);
          body++;
        }
      }

      const lp = people.guard.lantern;
      moving.write(lanternId, { position: lp, rotation: yawQ(people.guard.yaw) });
      lamps.fields.position.set(guardLamp, lp[0], lp[1] + 0.05, lp[2]);
      lamps.fields.intensity.set(guardLamp, lp[1] > -40 && !people.guard.gone ? 2.2 * (0.92 + Math.sin(seconds * 13) * 0.03 + Math.sin(seconds * 7.3) * 0.05) : 0);
      const tp = (residents ?? people).torch;
      lamps.fields.position.set(torchLamp, tp.position[0], tp.position[1], tp.position[2]);
      lamps.fields.aim.set(torchLamp, tp.aim[0], tp.aim[1], tp.aim[2]);
      lamps.fields.intensity.set(torchLamp, tp.on ? 16 : 0);
      mark('people');
      // Every write above lands now: lamps, the guard's lantern and the torches this frame, not the next
      vegetation.populateAround(eyeAt[0], eyeAt[2]);
      lamps.flush();

      for (const set of staticSets) set.flush();
      moving.flush(frame);

      for (const group of population) group.flush(frame);
      herd?.flush(frame);
      dholes?.flush(frame);
      mark('flush');

      if (bench.on && performance.now() - bench.since > 190) {
        if (bench.step + 1 < BENCHED.length * 2) {
          bench.step++;
          bench.since = performance.now();
          test.skip = bench.step % 2 ? drawnNames.indexOf(BENCHED[(bench.step - 1) / 2]!) : -1;
        } else {
          bench.on = false;
          test.skip = -1;

          const avg = (k: number) => { const g = bench.sums.get(k);

 return g && g[1] ? g[0] / g[1] : NaN; };

          const wholes = BENCHED.map((_, k) => avg(2 * k)).filter((v) => v === v);
          const whole = wholes.reduce((a, b) => a + b, 0) / Math.max(1, wholes.length);
          bench.table = `all ${whole.toFixed(2)} | ` + BENCHED.map((n, k) => [n, avg(2 * k) - avg(2 * k + 1)] as const).sort((a, b) => b[1] - a[1]).map(([n, d]) => `${n} ${d.toFixed(2)}`).join(', ');
          console.log('bench', bench.table);
        }
      }

      const steps = sim.update(frame.dt);

      if (bench.on || profile) detail.scale = 1;
      else detail.update(frame);
      const compute = frame.encoder.beginComputePass({ timestampWrites: opening.writes() });
      cells.sort(compute);
      // Shadows: the lamps' never change; the moon's near cascade draws every frame (people walk,
      // leaves sway), the far one every third frame from a held place, so culling skips the rest
      shadowFrame++;
      light.shadow.prepare({ redraw: (cascade) => cascade === 0 || shadowFrame % 3 === 0 });
      light.pointShadow.prepare({ redraw: () => false });

      for (const c of culled) c.cull(compute);

      for (const group of population) group.animate(compute, seconds);
      herd?.animate(compute, seconds);
      dholes?.animate(compute, seconds);
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
      pond.record(frame, keep(mirrored));
      scene.record(frame, test.skip >= 0 ? drawn.filter((_, i) => i !== test.skip) : look.props ? drawn : drawn.filter((x) => x !== thingsDrawn), { timestampWrites: sceneTime.writes() });
      mark('r.scene');
      chooseHalos();
      mist.record(frame, screen.views.hdr, screen.textures.depth, screen.regions.hdr);
      aa.record(frame, { timestampWrites: aaTime.writes() });
      eye.record(frame);
      glow.record(frame, { timestampWrites: glowTime.writes() });
      final.record(frame, surface.view(frame), { timestampWrites: closing.writes() });
      drewFullMaterials = tex.detail === 'full';
      gpu.capture(frame);
      mark('r.post');
      cpuFrames++;
    },
    destroy() {
      input.abort();
      disposed = true;
      herd?.destroy();
      dholes?.destroy();

      for (const made of [tex, gpu, screen, early, occlusion, lamps, cells, light, aa, built, props, flames, moving, vegetation, landTex, trailTex, ...population, pool, propPool, pond, air, glow, mist, eye]) made.destroy();
    },
  };
}
