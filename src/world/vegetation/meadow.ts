import { inPlantingDensity } from './planting.ts';
import VEGETATION from '../../content/vegetation.json';
// Grass, everywhere grass would grow in Kerala: over every verge and bank and under the palms,
// thick and soft, the red earth showing only on paths, in the swept yards and the temple sand.
// Patches of a metre and a half, each a few dozen curved blades, set out over the whole
// walkable land: short and dense where feet go, longer and seeding in the unkempt corners, with
// the odd tuft of touch-me-not (thottavadi) flowering pink. Wind rolls across in long, slow waves, bending
// each blade from its root, as a field moves.

import { instances, shading, type meshPool } from '@typegpu/kit';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Builder, hex, P, type Mat, type V3 } from '../../render/geo.ts';
import { heightAt, onRoad, pondQ } from '../terrain.ts';
import { trailDistance } from '../trail/trail.ts';
import { plantFree } from '../trail/jungle.ts';
import { CHURCH, LAND, LAND_N, MOSQUE } from '../town/town.ts';
import { BANYAN, COMPOUND, ROAD } from '../../content/world.ts';
import { now } from '../../render/surfaces.ts';

const mat = (h: number): Mat => ({ color: hex(h), roughness: 0.75, pattern: P.GRASS, doubleSided: true });
// Fresh green, a yellower green, a blue-green, and the straw of dry tips and seed heads
const GREENS = [0x4a7e20, 0x5a8826, 0x68902e, 0x3c6e28, 0x548e32].map(mat);
const STRAW = mat(0x8a8248);
const PINK: Mat = { color: hex(0xd070a8), roughness: 0.7, pattern: P.FLOWER, doubleSided: true };

const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

/** One blade, three tapering segments that arc over toward its tip. */
function blade(b: Builder, r: () => number, at: V3, height: number, colour: Mat, curl = 1) {
  const a = r() * Math.PI * 2;
  const lean = (0.15 + r() * 0.45) * curl;
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  const w0 = 0.011 + r() * 0.01;
  // Facing across its lean, so the face catches the light as it bends
  const wx = Math.cos(a) * w0;
  const wz = -Math.sin(a) * w0;
  const pts: V3[] = [];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3;
    const bend = lean * t * t * height * 1.2;
    pts.push([at[0] + dx * bend, at[1] + height * t * (1 - lean * t * 0.25), at[2] + dz * bend]);
  }
  const n: V3 = [dx * 0.3, 1, dz * 0.3];
  const widths = [1, 0.8, 0.5];
  for (let k = 0; k < 2; k++) {
    const p = pts[k]!;
    const q = pts[k + 1]!;
    const u = widths[k]!;
    const v = widths[k + 1]!;
    b.card(colour, [p[0] - wx * u, p[1], p[2] - wz * u], [p[0] + wx * u, p[1], p[2] + wz * u], [q[0] + wx * v, q[1], q[2] + wz * v], [q[0] - wx * v, q[1], q[2] - wz * v], n, [0, k / 3, 1, (k + 1) / 3]);
  }
  const p = pts[2]!;
  const q = pts[3]!;
  b.card(colour, [p[0] - wx * 0.5, p[1], p[2] - wz * 0.5], [p[0] + wx * 0.5, p[1], p[2] + wz * 0.5], q, q, n, [0, 2 / 3, 1, 1]);
}

/**
 * A patch `size` wide: `count` blades about `height` tall, clumped the way grass tillers, with
 * `seeds` seeding stalks and `flowers` puffs of touch-me-not.
 */
function patch(b: Builder, r: () => number, size: number, count: number, height: number, seeds: number, flowers: number) {
  const clumps = 5 + Math.floor(r() * 4);
  const centres = Array.from({ length: clumps }, () => [(r() - 0.5) * size, (r() - 0.5) * size] as const);
  for (let i = 0; i < count; i++) {
    // Most blades in clumps, the rest scattered between
    const c = centres[i % clumps]!;
    const loose = r() < 0.8;
    const spread = loose ? size * 0.5 : 0.16;
    const x = loose ? (r() - 0.5) * size : c[0] + (r() - 0.5) * spread;
    const z = loose ? (r() - 0.5) * size : c[1] + (r() - 0.5) * spread;
    const h = height * (0.45 + r() * 0.8);
    const tone = r() < 0.08 ? STRAW : GREENS[Math.floor(r() * GREENS.length)]!;
    blade(b, r, [x, -0.03, z], h, tone);
  }
  // Seed stalks: stiff, straight and pale, a narrow head at the top
  for (let i = 0; i < seeds; i++) {
    const c = centres[i % clumps]!;
    blade(b, r, [c[0], -0.03, c[1]], height * (1.5 + r() * 0.6), STRAW, 0.25);
  }
  // Touch-me-not: a sprawl of tiny leaves near the ground and round pink puffs
  for (let i = 0; i < flowers; i++) {
    const x = (r() - 0.5) * size * 0.8;
    const z = (r() - 0.5) * size * 0.8;
    b.blob(PINK, [x, 0.12 + r() * 0.06, z], [0.022, 0.022, 0.022], 6, 4, 0.3);
    for (let k = 0; k < 4; k++) blade(b, r, [x + (r() - 0.5) * 0.15, -0.02, z + (r() - 0.5) * 0.15], 0.1, GREENS[1]!, 2.5);
  }
}

export const PATCH = 1.5;

/** The meadow's models, short, mid and long. */
export function meadowModels() {
  const r = seeded(91);
  const make = (fn: (b: Builder) => void) => {
    const b = new Builder(true);
    fn(b);
    return b.model();
  };
  return {
    // Kept short, along the walks and round the temple
    short: [0, 1].map(() => make((b) => patch(b, r, PATCH, 85, 0.22, 0, 2))),
    // Ankle to knee high, everywhere else
    mid: [0, 1, 2].map((i) => make((b) => patch(b, r, PATCH, 85, 0.34, i === 2 ? 5 : 2, i === 1 ? 2 : 0))),
    // Long and seeding, in the corners nobody cuts
    tall: [0, 1].map(() => make((b) => patch(b, r, PATCH, 70, 0.6, 8, 0))),
  };
}

/** Where grass grows, and how long it is let grow: 0 kept short, 1 long. */
export function meadowPlaces(land: Uint8Array, walked: (x: number, z: number) => number, options: { seed?: number; density?: number } = {}) {
  const out: { at: V3; yaw: number; scale: number; length: 'short' | 'mid' | 'tall' }[] = [];
  const r = seeded(options.seed ?? 17);
  const m = LAND_N / (2 * LAND);
  const at = (x: number, z: number, ch: number) => {
    const i = Math.floor((x + LAND) * m);
    const j = Math.floor((z + LAND) * m);
    if (i < 0 || j < 0 || i >= LAND_N || j >= LAND_N) return 0;
    return land[(j * LAND_N + i) * 4 + ch]! / 255;
  };
  const R = 165;
  // Slow waves of long and short over the land, as grazing and cutting leave it
  const unkempt = (x: number, z: number) => Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.09 + x * 0.03) + Math.sin(x * 0.31 + z * 0.27) * 0.3;
  for (let gz = -R; gz < R; gz += PATCH) {
    for (let gx = -R; gx < R; gx += PATCH) {
      const x = gx + (r() - 0.5) * PATCH * 0.8;
      const z = gz + (r() - 0.5) * PATCH * 0.8;
      if (x * x + z * z > R * R) continue;
      if (onRoad(x, z, 0.4)) continue;
      // The sand in the temple, the path to its gate, the shops' forecourts
      if (x > -COMPOUND.x - 0.4 && x < COMPOUND.x + 0.4 && z > COMPOUND.z0 - 0.4 && z < COMPOUND.z1 + 0.4) continue;
      if (Math.abs(x) < 2.2 && z > COMPOUND.z1 && z < ROAD.z) continue;
      if (x > -22 && x < 14 && z > ROAD.z + ROAD.half - 0.5 && z < ROAD.z + ROAD.half + 12) continue;
      if (Math.abs(x - CHURCH.x) < CHURCH.hx && Math.abs(z - CHURCH.z) < CHURCH.hz) continue;
      if (Math.abs(x - MOSQUE.x) < MOSQUE.hx && Math.abs(z - MOSQUE.z) < MOSQUE.hz) continue;
      if (Math.hypot(x - BANYAN[0], z - BANYAN[2]) < 4.4) continue;
      if (pondQ(x, z) < 1.06) continue;
      // Cheap tests first; none of these draws from `r`, so the order doesn't change the layout
      // Swept yards, lanes and paddy
      if (at(x, z, 0) > 0.35 || at(x, z, 1) > 0.3 || at(x, z, 3) > 0.3) continue;
      // Cut laterite banks stay bare
      const h = heightAt(x, z);
      const slope = Math.hypot(heightAt(x + 0.5, z) - h, heightAt(x, z + 0.5) - h) / 0.5;
      if (slope > 0.75) continue;
      // Not on the forest footpath
      if (trailDistance(x, z, 4) < 1.7) continue;
      if (!plantFree(x, z, 0.6)) continue;
      // Thinner under the plantations' litter
      if (at(x, z, 2) > 0.5 && r() < 0.6) continue;
      const worn = walked(x, z) < 1.4 || onRoad(x, z, 1.4);
      const u = unkempt(x, z) + (r() - 0.5) * 0.4;
      const length = worn ? 'short' : u > 0.5 ? 'tall' : u < -0.85 ? 'short' : 'mid';
      out.push({ at: [x, h - 0.01, z], yaw: r() * Math.PI * 2, scale: 0.85 + r() * 0.35, length });
    }
  }
  const density = options.density ?? VEGETATION.density;
  return density < 1 ? out.filter(p => inPlantingDensity(p.at, density)) : out;
}

/** The grass's own kind: tinted per vertex, bent from the root by rolling waves of wind. */
export function defineGrass(pool: meshPool.MeshPool<{ pat: d.F32; col: d.Vec4f }>) {
  return instances.define('Grass', {
    carry: (vertexIndex) => {
      'use gpu';
      return d.vec4f(pool.extra.pat(vertexIndex), pool.extra.col(vertexIndex).xyz);
    },
    deform: (vertex, patch) => {
      'use gpu';
      const t = now.$;
      const p = vertex.position;
      const w = patch.position.xz + p.xz;
      const h = std.max(p.y, 0);
      // Long waves of wind rolling over the land, and the shiver of each blade
      const wave = std.sin(w.x * 0.21 + w.y * 0.13 - t * 1.4) * 0.5 + 0.5;
      const gust = wave * wave * (std.sin(t * 0.23 + w.x * 0.02) * 0.4 + 0.75);
      const shiver = std.sin(t * 5.3 + w.x * 3.1 + w.y * 2.3) * 0.12;
      const push = (gust + shiver + 0.15) * h * h * 1.6;
      return p + d.vec3f(push * 0.85, -push * h * 0.6, push * 0.5);
    },
    deformShadow: false,
    bounds: (_patch, base) => {
      'use gpu';
      return instances.Sphere({ center: base.center, radius: base.radius + 0.3 });
    },
    surface: (pixel, base) => {
      'use gpu';
      const m = shading.Material(base);
      const tint = base.color * pixel.carried.yzw;
      const uv = pixel.point.uv;
      const p = pixel.point.position;
      // Dark at the root, where the blades shade each other; brighter and yellower at the tips;
      // great slow patches of greener and paler across the field
      const patchy = std.sin(p.x * 0.23 + std.sin(p.z * 0.17) * 1.7) * std.sin(p.z * 0.19 + p.x * 0.05) * 0.5 + 0.5;
      const root = 0.5 + uv.y * 0.75;
      const tip = std.mix(d.vec3f(1), d.vec3f(1.2, 1.15, 0.7), uv.y * uv.y * 0.6);
      m.color = tint * root * tip * (0.78 + patchy * 0.4);
      m.roughness = 0.7;
      // The leaf back-light, as for leaves
      m.metallic = -0.3;
      m.occlusion = 0.55 + uv.y * 0.45;
      // Lit as if facing up, the way a field of blades scatters light: no dark backs
      const lit = shading.Point(pixel.point);
      lit.normal = std.normalize(std.mix(pixel.point.normal * std.sign(std.dot(pixel.point.normal, pixel.point.view) + 0.0001), d.vec3f(0, 1, 0), 0.6));
      return instances.Shaded({ point: lit, material: m });
    },
  });
}

export type MeadowModels = ReturnType<typeof meadowModels>;
