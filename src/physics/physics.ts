// The solid world, in Box3D: the land as one triangle mesh, and every wall, plinth, step, post,
// pillar, tree trunk and heavy prop as a static shape, recorded while the scene was built. The
// walker is Box3D's character mover, a capsule riding a little above the ground on a spring, so
// it climbs steps and plinths, slides along walls, falls off ledges and can jump. People and
// vehicles are kinematic shapes moved each frame, so the mover is pushed out of their way.
//
// No GPU here; the scene hands in what it built and reads back where the feet are.

import type { b3BodyId, b3Capsule, b3Vec3, Box3DModule, PlaneResultBuffer } from 'box3d.js';
import type { PropAt, Solid } from '../render/geo.ts';

type V3 = [number, number, number];

/** The capsule: 0.28 m round, from 0.4 m above the feet to 1.75 m. */
const RADIUS = 0.28;
const HOVER = 0.4;
const HALF = (1.75 - HOVER) / 2 - RADIUS;
/** From the capsule's centre down to the feet. */
const CENTRE = HOVER + RADIUS + HALF;
const CAPSULE: b3Capsule = { center1: [0, -HALF, 0], center2: [0, HALF, 0], radius: RADIUS };
/** The spring's rest length, from the lower sphere's centre to the ground. */
const REST = HOVER + RADIUS;
const GRAVITY = 18;
const JUMP = 4.6;

/** Heavy props a walker bumps into: radius, or half sizes for a box, and height. */
const PROPS: Record<string, { r?: number; h: V3 | number }> = {
  monobloc: { r: 0.3, h: 0.85 },
  bench: { h: [0.85, 0.25, 0.22] },
  crate: { h: [0.25, 0.15, 0.2] },
  planter: { r: 0.25, h: 0.5 },
  pole1: { r: 0.16, h: 8 },
  pole2: { r: 0.16, h: 8 },
  pole3: { r: 0.16, h: 8 },
  lpg: { r: 0.17, h: 0.6 },
  tyre: { r: 0.35, h: 0.3 },
  gallon: { r: 0.15, h: 0.45 },
};

export interface Tree {
  at: V3;
  scale: number;
  /** Trunk radius at the base, before scaling. */
  trunk: number;
}

export interface WorldShape {
  solids: Solid[];
  props: PropAt[];
  trees: Tree[];
  heightAt: (x: number, z: number) => number;
  /** Half size of the land mesh, and its spacing. */
  extent: number;
  spacing: number;
  /** More land beyond it: squares of [x0, z0, size], overlapping a little. */
  patches?: [number, number, number][];
}

export type Physics = Awaited<ReturnType<typeof createPhysics>>;

/** Starts fetching and compiling the engine, to hand to `createPhysics` later. */
export const loadPhysics = async () => (await import('box3d.js')).default();

export async function createPhysics(shape: WorldShape, engine?: Box3DModule) {
  const b3 = engine ?? (await loadPhysics());
  const def = b3.b3DefaultWorldDef();
  def.gravity = [0, -GRAVITY, 0];
  const world = b3.b3CreateWorld(def);
  const filter = b3.b3DefaultQueryFilter();
  const { heightAt } = shape;

  // ---- the land: one static triangle mesh round the town, and square patches of it out along
  // the forest path
  const landMesh = (x0: number, z0: number, size: number) => {
    const n = Math.floor(size / shape.spacing) + 1;
    const positions = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x0 + i * shape.spacing;
        const z = z0 + j * shape.spacing;
        const k = (j * n + i) * 3;
        positions[k] = x;
        positions[k + 1] = heightAt(x, z);
        positions[k + 2] = z;
      }
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    let t = 0;
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices[t++] = a;
        indices[t++] = c;
        indices[t++] = b;
        indices[t++] = b;
        indices[t++] = c;
        indices[t++] = d;
      }
    const mesh = b3.b3CreateMesh(positions, indices);
    const body = b3.b3CreateBody(world, b3.b3DefaultBodyDef());
    b3.b3CreateMeshShape(body, b3.b3DefaultShapeDef(), mesh, [1, 1, 1]);
  };
  landMesh(-shape.extent, -shape.extent, shape.extent * 2);
  for (const [x0, z0, size] of shape.patches ?? []) landMesh(x0, z0, size);

  // ---- what stands on it
  const shapeDef = b3.b3DefaultShapeDef();
  const yawQ = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const staticBox = (c: V3, h: V3, yaw: number) => {
    const d = b3.b3DefaultBodyDef();
    d.position = c;
    d.rotation = yawQ(yaw) as never;
    b3.b3CreateBoxShape(b3.b3CreateBody(world, d), shapeDef, h[0], h[1], h[2]);
  };
  const staticCylinder = (base: V3, r: number, h: number) => {
    const d = b3.b3DefaultBodyDef();
    d.position = [base[0], base[1] + h / 2, base[2]];
    const body = b3.b3CreateBody(world, d);
    if (h > r * 3) {
      // Tall and thin: a capsule is cheaper than a hull and as good to bump into
      const s = h / 2 - r;
      b3.b3CreateCapsuleShape(body, shapeDef, { center1: [0, -s, 0], center2: [0, s, 0], radius: r });
    } else b3.b3CreateHullShape(body, shapeDef, b3.b3CreateCylinder(h, r, 0, 8));
  };
  let count = 0;
  for (const s of shape.solids) {
    const g = heightAt(s.c[0], s.c[2]);
    const lo = s.kind === 'box' ? s.c[1] - s.h[1] : s.c[1];
    const hi = s.kind === 'box' ? s.c[1] + s.h[1] : s.c[1] + s.h;
    // Only what stands between the ground and head height, and isn't buried
    if (!(s.kind === 'box' && s.high) && (lo > g + 2.0 || hi < g + 0.1)) continue;
    if (s.kind === 'box') staticBox(s.c, s.h, s.yaw);
    else staticCylinder(s.c, s.r, s.h);
    count++;
  }
  for (const p of shape.props) {
    const k = PROPS[p.name];
    if (!k) continue;
    const sc = p.scale[0];
    if (k.r) staticCylinder(p.at, k.r * sc, (k.h as number) * sc);
    else {
      const h = k.h as V3;
      staticBox([p.at[0], p.at[1] + h[1] * sc, p.at[2]], [h[0] * sc, h[1] * sc, h[2] * sc], p.yaw);
    }
    count++;
  }
  for (const t of shape.trees) {
    staticCylinder([t.at[0], t.at[1] - 0.3, t.at[2]], t.trunk * t.scale, 3.2);
    count++;
  }

  // ---- things that move: people and vehicles, pushed to where they are each frame
  const movers: b3BodyId[] = [];
  const kinematic = () => {
    const d = b3.b3DefaultBodyDef();
    d.type = b3.b3BodyType.b3_kinematicBody;
    d.position = [0, -100, 0];
    return b3.b3CreateBody(world, d);
  };
  /** A person, as a capsule 0.25 m round from the ground to 1.7 m. */
  const person = () => {
    const body = kinematic();
    b3.b3CreateCapsuleShape(body, shapeDef, { center1: [0, 0.25, 0], center2: [0, 1.45, 0], radius: 0.25 });
    movers.push(body);
    return movers.length - 1;
  };
  /** A vehicle, as a box from its half sizes, standing on the ground at its position. */
  const lift: number[] = [];
  const vehicle = (h: V3) => {
    const body = kinematic();
    b3.b3CreateBoxShape(body, shapeDef, h[0], h[1], h[2]);
    movers.push(body);
    lift[movers.length - 1] = h[1];
    return movers.length - 1;
  };
  const place = (id: number, at: V3, yaw: number) => b3.b3Body_SetTransform(movers[id]!, [at[0], at[1] + (lift[id] ?? 0), at[2]], yawQ(yaw) as never);

  // ---- the walker
  let position: b3Vec3 = [0, 0, 0];
  let velocity: b3Vec3 = [0, 0, 0];
  let spring = 0;
  let onGround = false;
  const planeResult = b3.createPlaneResult();
  type Plane = { plane: { normal: b3Vec3; offset: number }; pushLimit: number; push: number; clipVelocity: boolean };
  let planes: Plane[] = [];
  const collect = (_s: unknown, buf: PlaneResultBuffer) => {
    for (let i = 0, n = b3.getNumPlaneResults(buf); i < n; i++) {
      b3.getPlaneResultAt(planeResult, buf, i);
      const nrm = planeResult.plane.normal;
      planes.push({ plane: { normal: [nrm[0], nrm[1], nrm[2]], offset: planeResult.plane.offset }, pushLimit: 3.4e38, push: 0, clipVelocity: true });
    }
    return true;
  };
  const always = () => true;

  /** The ground under x, z, looking down from `from` for `depth` metres. */
  const groundAt = (x: number, z: number, from: number, depth = 3) => {
    const ray = b3.b3World_CastRayClosest(world, [x, from, z], [0, -depth, 0], filter);
    return ray.hit ? from - ray.fraction * depth : heightAt(x, z);
  };

  return {
    count,
    groundAt,
    person,
    vehicle,
    place,
    get onGround() {
      return onGround;
    },
    /** Where the feet are. */
    get feet(): V3 {
      return [position[0], position[1] - CENTRE, position[2]];
    },
    /** Puts the walker down at x, z, on whatever is there. */
    teleport(x: number, z: number, y?: number) {
      const g = y ?? groundAt(x, z, heightAt(x, z) + 2.2, 4);
      position = [x, g + CENTRE, z];
      velocity = [0, 0, 0];
      spring = 0;
    },
    jump() {
      if (!onGround) return;
      velocity[1] = JUMP;
      onGround = false;
    },
    /** Moves the walker for `dt` toward a horizontal velocity `vx, vz`; then steps the world. */
    step(dt: number, vx: number, vz: number) {
      dt = Math.min(dt, 1 / 20);
      // Nothing here is driven by the solver (the walker is a mover, beasts and vehicles are
      // placed), so one substep only keeps the broadphase current
      b3.b3World_Step(world, dt, 1);
      // On the ground, take the wished velocity at once, as people do walking; in the air,
      // keep what there was and only steer a little
      if (onGround) {
        velocity[0] = vx;
        velocity[2] = vz;
        velocity[1] = Math.min(velocity[1], 0);
      } else {
        velocity[0] += (vx - velocity[0]) * Math.min(1, dt * 2);
        velocity[2] += (vz - velocity[2]) * Math.min(1, dt * 2);
      }
      velocity[1] -= GRAVITY * dt;
      // The spring under the capsule, holding it above the ground, over steps and kerbs
      const reach = REST + RADIUS + 0.15;
      const from: b3Vec3 = [position[0], position[1] - HALF, position[2]];
      const ray = b3.b3World_CastRayClosest(world, from, [0, -reach, 0], filter);
      if (ray.hit && velocity[1] <= 0.5) {
        onGround = true;
        const length = ray.fraction * reach;
        const zeta = 0.9;
        const omega = 2 * Math.PI * 7;
        const w = omega * dt;
        spring = (spring - omega * w * (length - REST)) / (1 + 2 * zeta * w + w * w);
        // Stepping up: when the ground comes up under you (a stair, a kerb), rise to it briskly
        // rather than waiting on the spring, so you don't catch your shins on the next step
        if (length < REST - 0.02) spring = Math.max(spring, (REST - length) * 16);
        velocity[1] = 0;
      } else {
        onGround = false;
        spring = 0;
      }
      const target: b3Vec3 = [position[0] + dt * velocity[0], position[1] + dt * (velocity[1] + spring), position[2] + dt * velocity[2]];
      for (let iter = 0; iter < 5; iter++) {
        planes = [];
        b3.b3World_CollideMover(world, position, CAPSULE, filter, collect);
        const solved = b3.b3SolvePlanes([target[0] - position[0], target[1] - position[1], target[2] - position[2]], planes);
        const delta = solved.delta;
        const f = b3.b3World_CastMover(world, position, CAPSULE, delta, filter, always);
        position = [position[0] + delta[0] * f, position[1] + delta[1] * f, position[2] + delta[2] * f];
        if (delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2] < 1e-4) break;
      }
      velocity = b3.b3ClipVector(velocity, planes) as b3Vec3;
      // Never under the land, whatever happens
      const floor = heightAt(position[0], position[2]);
      if (position[1] - CENTRE < floor - 0.3) {
        position[1] = floor + CENTRE;
        velocity[1] = 0;
      }
      return this.feet;
    },
  };
}
