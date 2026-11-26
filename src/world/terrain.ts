// The shape of the land: flat where the temple, the road and the pond were laid out, gently
// rolling between them and rising into wooded hills all round so the horizon is land, not sea.
// The same formulas run on the CPU, to place things, and on the GPU, to draw the ground.

import { d, std } from 'typegpu';
import { BANYAN, COMPOUND, GROUND, PADDY, POND, ROAD } from '../content/world.ts';
import { carve, carveGpu, RIVER } from './trail/river.ts';

const PONDS = [2, 0.7, 0.16, 3, 2.1, 0.09, 5, 0.4, 0.05] as const;

/** The temple's bathing ghat: a flight of steps down the pond's west bank. */
export const GHAT = { x0: 23.6, step: 0.55, rise: 0.4, count: 6, half: 3.6 };

/** The water's floor, below the surface at y = 0. */
export const POND_FLOOR = -1.6;

// ---------------------------------------------------------------- CPU

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

/** How far the road bends away from the straight run in front of the gate. */
export const roadZ = (x: number) => ROAD.z + ss(18, 55, Math.abs(x)) * (7 * Math.sin(x / 38) + 3 * Math.sin(x / 15 + 1));
const roadY = (x: number) => GROUND + ss(40, 110, Math.abs(x)) * (2.5 + 2.5 * Math.sin(x / 45 + 0.6));

/** The bank's distance from the pond centre at an angle. */
export const pondR = (a: number) =>
  POND.r * (1 + PONDS[2] * Math.sin(PONDS[0] * a + PONDS[1]) + PONDS[5] * Math.sin(PONDS[3] * a + PONDS[4]) + PONDS[8] * Math.sin(PONDS[6] * a + PONDS[7]));

/** 0 at the pond's centre, 1 on its bank. */
export const pondQ = (x: number, z: number) => Math.hypot(x - POND.x, z - POND.z) / pondR(Math.atan2(z - POND.z, x - POND.x));

const hills = (x: number, z: number) =>
  0.5 +
  0.5 *
    (0.5 * Math.sin(x * 0.031 + z * 0.017) +
      0.35 * Math.sin(x * 0.013 - z * 0.029 + 1.3) +
      0.25 * Math.sin(x * 0.071 + 0.5) * Math.sin(z * 0.063) +
      0.15 * Math.sin((x + z) * 0.11));

const boxDistance = (x: number, z: number) => {
  const dx = Math.max(-COMPOUND.x - 4 - x, x - COMPOUND.x - 4, 0);
  const dz = Math.max(COMPOUND.z0 - 4 - z, z - COMPOUND.z1 - 6, 0);

  return Math.hypot(dx, dz);
};

/** The height of the land at x, z, with the river's ravine cut through it. */
export function heightAt(x: number, z: number) {
  return carve(landAt(x, z), x, z);
}

/** How deep the river's ravine cuts the land at x, z. */
export const riverCut = (x: number, z: number) => {
  const h = landAt(x, z);

  return h - carve(h, x, z);
};

/** The height of the land at x, z, before the river cut it. */
export function landAt(x: number, z: number) {
  const across = Math.abs(z - roadZ(x));
  const q = pondQ(x, z);

  const flat = Math.max(
    1 - ss(0, 14, boxDistance(x, z)),
    1 - ss(1.0, 1.6, q),
    1 - ss(ROAD.half + 6, ROAD.half + 18, across),
    1 - ss(5, 12, Math.hypot(x - BANYAN[0], z - BANYAN[2])),
  );

  const r = Math.hypot(x, z * 1.1);
  const amp = 1.2 + ss(30, 120, r) * 7 + ss(110, 330, r) * 28;
  const base = GROUND + (roadY(x) - GROUND) * (1 - ss(ROAD.half + 1, ROAD.half + 25, across));
  const hilly = base + (1 - flat) * amp * hills(x, z);
  // The paddy lies level in its valley, the road crossing it on a bank
  const pq = Math.hypot((x - PADDY.x) / PADDY.rx, (z - PADDY.z) / PADDY.rz);
  const paddy = (1 - ss(0.86, 1.08, pq)) * ss(ROAD.half + 0.8, ROAD.half + 4, across);
  const h = hilly + (PADDY.y - hilly) * paddy;
  const pondBed = POND_FLOOR + (h - POND_FLOOR) * ss(0.72, 1.06, q);

  // The ghat is cut into the bank
  if (x > GHAT.x0 - 0.5 && x < GHAT.x0 + GHAT.step * GHAT.count + 1 && Math.abs(z - POND.z) < GHAT.half + 0.6) {
    return Math.min(pondBed, GROUND - Math.max(x - GHAT.x0, 0) * 0.75 - 0.08);
  }

  return pondBed;
}

/** Whether a point is on the road, with a margin either side. */
export const onRoad = (x: number, z: number, margin = 0) => Math.abs(z - roadZ(x)) < ROAD.half + margin;

// ---------------------------------------------------------------- GPU (the same formulas)

const roadZGpu = (x: number) => {
  'use gpu';

  return ROAD.z + std.smoothstep(18, 55, std.abs(x)) * (7 * std.sin(x / 38) + 3 * std.sin(x / 15 + 1));
};

const roadYGpu = (x: number) => {
  'use gpu';

  return GROUND + std.smoothstep(40, 110, std.abs(x)) * (2.5 + 2.5 * std.sin(x / 45 + 0.6));
};

export const pondQGpu = (p: d.v2f) => {
  'use gpu';
  const o = p - d.vec2f(POND.x, POND.z);
  const a = std.atan2(o.y, o.x);

  const r =
    POND.r *
    (1 + PONDS[2] * std.sin(PONDS[0] * a + PONDS[1]) + PONDS[5] * std.sin(PONDS[3] * a + PONDS[4]) + PONDS[8] * std.sin(PONDS[6] * a + PONDS[7]));

  return std.length(o) / r;
};

const hillsGpu = (x: number, z: number) => {
  'use gpu';

  return (
    0.5 +
    0.5 *
      (0.5 * std.sin(x * 0.031 + z * 0.017) +
        0.35 * std.sin(x * 0.013 - z * 0.029 + 1.3) +
        0.25 * std.sin(x * 0.071 + 0.5) * std.sin(z * 0.063) +
        0.15 * std.sin((x + z) * 0.11))
  );
};

/** How far the road's centre line is, across it. */
export const acrossRoad = (p: d.v2f) => {
  'use gpu';

  return std.abs(p.y - roadZGpu(p.x));
};

export const heightGpu = (p: d.v2f) => {
  'use gpu';
  const x = p.x;
  const z = p.y;
  const across = acrossRoad(p);
  const q = pondQGpu(p);
  const dx = std.max(std.max(-COMPOUND.x - 4 - x, x - COMPOUND.x - 4), 0);
  const dz = std.max(std.max(COMPOUND.z0 - 4 - z, z - COMPOUND.z1 - 6), 0);

  const flat = std.max(
    std.max(1 - std.smoothstep(0, 14, std.length(d.vec2f(dx, dz))), 1 - std.smoothstep(1.0, 1.6, q)),
    std.max(1 - std.smoothstep(ROAD.half + 6, ROAD.half + 18, across), 1 - std.smoothstep(5, 12, std.length(p - d.vec2f(BANYAN[0], BANYAN[2])))),
  );

  const r = std.length(d.vec2f(x, z * 1.1));
  const amp = 1.2 + std.smoothstep(30, 120, r) * 7 + std.smoothstep(110, 330, r) * 28;
  const base = GROUND + (roadYGpu(x) - GROUND) * (1 - std.smoothstep(ROAD.half + 1, ROAD.half + 25, across));
  const hilly = base + (1 - flat) * amp * hillsGpu(x, z);
  const pq = std.length(d.vec2f((x - PADDY.x) / PADDY.rx, (z - PADDY.z) / PADDY.rz));
  const paddy = (1 - std.smoothstep(0.86, 1.08, pq)) * std.smoothstep(ROAD.half + 0.8, ROAD.half + 4, across);
  const h = hilly + (PADDY.y - hilly) * paddy;
  const pondBed = POND_FLOOR + (h - POND_FLOOR) * std.smoothstep(0.72, 1.06, q);
  const ghat = x > GHAT.x0 - 0.5 && x < GHAT.x0 + GHAT.step * GHAT.count + 1 && std.abs(z - POND.z) < GHAT.half + 0.6;
  const land = std.select(pondBed, std.min(pondBed, GROUND - std.max(x - GHAT.x0, 0) * 0.75 - 0.08), ghat);
  // The river's ravine, only out where it runs
  let cut = d.f32(land);

  if (std.length(p - d.vec2f(RIVER.c[0], RIVER.c[1])) < RIVER.length + 40) {
    cut = carveGpu(land, p);
  }

  return cut;
};
