// The forest river the path crosses about half way up: a stream in a ravine cut through the
// hills, falling in pools and runs from the north-west. Its course is a straight axis with a
// meander laid over it, its water level a table along that axis (tools/river/make.ts) that only
// ever falls downstream. The land is carved to it on the CPU and on the GPU alike.

import { d, std, tgpu } from 'typegpu';
import { RIVER, RIVER_LEVEL } from '../../generated/river.gen.ts';

export { RIVER };

/** Half the water's width, how much the bed dips, and how steep the ravine's walls rise. */
export const WATER_HALF = 3.2;
const BED = 0.8;
const BANK = 1.3;

/** The finer strip of ground drawn along it, either side of the water and up and down. */
export const PATCH = { length: 150, half: 25, step: 1 };

const [CX, CZ] = RIVER.c;
const [UX, UZ] = RIVER.u;
const L = RIVER.length;
const N = RIVER_LEVEL.length;

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

/** The course's sideways wander off the axis at `s` metres downstream, straight at the bridge. */
export const meander = (s: number) => (5 * Math.sin(s / 41 + 0.4) + 2.5 * Math.sin(s / 17 + 1.9)) * ss(12, 50, Math.abs(s));

/** Downstream along the axis and across from the river's centre, in metres. */
export function riverLocal(x: number, z: number) {
  const dx = x - CX;
  const dz = z - CZ;
  const s = dx * UX + dz * UZ;
  const v = -dx * UZ + dz * UX - meander(s);

  return { s, v };
}

/** The point `v` across from the centre of the river, `s` downstream. */
export function riverPoint(s: number, v = 0): [number, number] {
  const o = meander(s) + v;

  return [CX + UX * s - UZ * o, CZ + UZ * s + UX * o];
}

/** The water's surface height at `s`. */
export function riverLevel(s: number) {
  const f = Math.min(Math.max((s + L) / RIVER.step, 0), N - 1.001);
  const i = Math.floor(f);

  return RIVER_LEVEL[i]! + (RIVER_LEVEL[i + 1]! - RIVER_LEVEL[i]!) * (f - i);
}

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;

  return Math.min(a, b) - h * h * k * 0.25;
};

/** The land at height `h` with the ravine cut into it. */
export function carve(h: number, x: number, z: number) {
  const { s, v } = riverLocal(x, z);

  if (Math.abs(s) > L) return h;
  const a = Math.abs(v);
  const level = riverLevel(s);
  const t = Math.min(a / WATER_HALF, 1);
  const profile = level - 0.15 - BED * (1 - t * t) + Math.max(a - WATER_HALF - 0.8, 0) * BANK + Math.max(a - WATER_HALF, 0) * 0.15;
  const cut = smin(h, profile, 0.8);

  return h + (cut - h) * (1 - ss(L - 30, L, Math.abs(s)));
}

/** Whether x, z is in the water, with a margin. */
export function inRiver(x: number, z: number, margin = 0) {
  const { s, v } = riverLocal(x, z);

  return Math.abs(s) < L && Math.abs(v) < WATER_HALF + margin;
}

// ---------------------------------------------------------------- GPU

const levels = tgpu.const(d.arrayOf(d.f32, N), [...RIVER_LEVEL]);

export const meanderGpu = (s: number) => {
  'use gpu';

  return (5 * std.sin(s / 41 + 0.4) + 2.5 * std.sin(s / 17 + 1.9)) * std.smoothstep(12, 50, std.abs(s));
};

/** Downstream and across, as x and y. */
export const riverLocalGpu = (p: d.v2f) => {
  'use gpu';
  const o = p - d.vec2f(CX, CZ);
  const s = o.x * UX + o.y * UZ;

  return d.vec2f(s, -o.x * UZ + o.y * UX - meanderGpu(s));
};

export const riverLevelGpu = (s: number) => {
  'use gpu';
  const f = std.clamp((s + L) / RIVER.step, 0, N - 1.001);
  const i = d.u32(std.floor(f));

  return std.mix(levels.$[i], levels.$[i + 1], f - std.floor(f));
};

export const carveGpu = (h: number, p: d.v2f) => {
  'use gpu';
  const q = riverLocalGpu(p);
  const a = std.abs(q.y);
  const level = riverLevelGpu(q.x);
  const t = std.min(a / WATER_HALF, 1);
  const profile = level - 0.15 - BED * (1 - t * t) + std.max(a - WATER_HALF - 0.8, 0) * BANK + std.max(a - WATER_HALF, 0) * 0.15;
  const k = d.f32(0.8);
  const w = std.max(k - std.abs(h - profile), 0) / k;
  const cut = std.min(h, profile) - w * w * k * 0.25;

  return h + (cut - h) * (1 - std.smoothstep(L - 30, L, std.abs(q.x)));
};
