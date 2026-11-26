// The land: raked sand inside the compound, grass and red earth outside, laterite showing where
// slopes are cut, a laterite path to the gate, the winding tarred road and the pond's muddy
// banks. One grid, fine near the temple and coarse on the far hills, shaped by the terrain.

import { cameras, materials, passes, shading } from '@typegpu/kit';
import { perlin2d } from '@typegpu/noise';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { COMPOUND, PADDY, ROAD } from './world.ts';
import { hex } from './geo.ts';
import { acrossRoad, heightGpu } from './terrain.ts';
import { mirrored } from './surfaces.ts';
import { meanderGpu, PATCH, RIVER, riverLevelGpu, riverLocalGpu, WATER_HALF } from './river.ts';
import type { Tex } from './tex.ts';
import { TEX } from './textures.gen.ts';
import { Q } from './quality.ts';

const N = Q.groundN;
const HALF = 480;
const Corner = d.struct({ position: d.vec4f, world: d.vec3f, normal: d.vec3f });
const Seen = d.struct({ color: d.vec4f });

const corners = tgpu.const(
  d.arrayOf(d.vec2f, 6),
  [
    [0, 0],
    [1, 1],
    [1, 0],
    [0, 0],
    [0, 1],
    [1, 1],
  ].map(([x, z]) => d.vec2f(x!, z!)),
);

const v = (h: number) => {
  const c = hex(h);
  return d.vec3f(c[0], c[1], c[2]);
};
const MUD = v(0x2a1e16);

const inside = (p: d.v2f, lo: d.v2f, hi: d.v2f) => {
  'use gpu';
  const a = std.smoothstep(lo - 0.05, lo + 0.05, p);
  const b = 1 - std.smoothstep(hi - 0.05, hi + 0.05, p);
  return a.x * a.y * b.x * b.y;
};

/** Denser grid near the middle: the map from 0..1 across the grid to metres. */
const warp = (g: number) => {
  'use gpu';
  const s = g * 2 - 1;
  const a = std.abs(s);
  return std.sign(s) * (0.22 * a + 0.78 * a * a * a) * HALF;
};

/** The land's shape where it's sampled: its normal in xyz, its height in w. */
const shapeAt = (p: d.v2f) => {
  'use gpu';
  const e = 0.35;
  const hx = heightGpu(p + d.vec2f(e, 0)) - heightGpu(p - d.vec2f(e, 0));
  const hz = heightGpu(p + d.vec2f(0, e)) - heightGpu(p - d.vec2f(0, e));
  const normal = std.normalize(d.vec3f(-hx, 2 * e, -hz));
  return d.vec4f(normal, heightGpu(p));
};

export function createGround(root: TgpuRoot, tex: Tex, land: { at: (p: d.v2f) => d.v4f; trail: (p: d.v2f) => d.v4f }) {
  // The terrain never changes, so its height and normal at every grid corner are worked out once,
  // here, instead of five noisy height lookups per vertex in every pass of every frame.
  const V = N + 1;
  const cols = (PATCH.length * 2) / PATCH.step;
  const rows = (PATCH.half * 2) / PATCH.step;
  const RV = cols + 1;
  const landShape = root.createBuffer(d.arrayOf(d.vec4f, V * V)).$usage('storage');
  const riverShape = root.createBuffer(d.arrayOf(d.vec4f, RV * (rows + 1))).$usage('storage');
  const landOut = landShape.as('mutable');
  const riverOut = riverShape.as('mutable');
  const landIn = landShape.as('readonly');
  const riverIn = riverShape.as('readonly');
  /** Where the land grid's corner (ix, iz) sits, in metres. */
  const landPoint = (ix: number, iz: number) => {
    'use gpu';
    return d.vec2f(warp(ix / N), warp(iz / N));
  };
  /** Where the river strip's corner (column, row) sits, following the bends. */
  const riverPoint = (c: number, r: number) => {
    'use gpu';
    const s = -PATCH.length + c * PATCH.step;
    const o = meanderGpu(s) - PATCH.half + r * PATCH.step;
    return d.vec2f(RIVER.c[0] + RIVER.u[0] * s - RIVER.u[1] * o, RIVER.c[1] + RIVER.u[1] * s + RIVER.u[0] * o);
  };
  const bakeLand = tgpu.computeFn({ workgroupSize: [64], in: { gid: d.builtin.globalInvocationId } })(({ gid }) => {
    'use gpu';
    if (gid.x >= d.u32(V * V)) {
      return;
    }
    const f = d.f32(gid.x);
    const iz = std.floor(f / V);
    const p = landPoint(f - iz * V, iz);
    const shape = shapeAt(p);
    // Along the river the finer strip draws the land: this coarse grid sinks under it
    const rq = riverLocalGpu(p);
    if (std.abs(rq.x) < PATCH.length - 3 && std.abs(rq.y) < PATCH.half - 5) {
      shape.w = shape.w - 40;
    }
    landOut.$[gid.x] = d.vec4f(shape);
  });
  const bakeRiver = tgpu.computeFn({ workgroupSize: [64], in: { gid: d.builtin.globalInvocationId } })(({ gid }) => {
    'use gpu';
    if (gid.x >= d.u32(RV * (rows + 1))) {
      return;
    }
    const f = d.f32(gid.x);
    const r = std.floor(f / RV);
    riverOut.$[gid.x] = shapeAt(riverPoint(f - r * RV, r));
  });
  root.createComputePipeline({ compute: bakeLand }).dispatchWorkgroups(Math.ceil((V * V) / 64));
  root.createComputePipeline({ compute: bakeRiver }).dispatchWorkgroups(Math.ceil((RV * (rows + 1)) / 64));

  const drawing: passes.Drawing<typeof Corner, d.Infer<typeof Seen>> = {
    label: 'ground',
    Vertex: Corner,
    at: (vertexIndex: number, _instanceIndex: number) => {
      'use gpu';
      // Whole-number cell and corner, worked in floats (exact at these counts)
      const f = d.f32(vertexIndex);
      const cell = std.floor(f / 6);
      const corner = corners.$[d.u32(f - cell * 6)];
      const row = std.floor(cell / N);
      const ix = cell - row * N + corner.x;
      const iz = row + corner.y;
      const p = landPoint(ix, iz);
      const shape = landIn.$[d.u32(iz * V + ix)];
      const world = d.vec3f(p.x, shape.w, p.y);
      return Corner({ position: cameras.toClip(world), world, normal: shape.xyz });
    },
    pixelOf: (corner) => {
      'use gpu';
      const p = corner.world.xz;
      if (mirrored.$ && corner.world.y < -0.01) {
        std.discard();
      }
      const big = perlin2d.sample(p * 0.08);
      const mid = perlin2d.sample(p * 0.6);
      const slope = 1 - corner.normal.y;
      // Every ground tile, sampled once, at an angle so the repeat doesn't line up
      const q = d.vec2f(p.x * 0.96 + p.y * 0.28, p.y * 0.96 - p.x * 0.28);
      const gSand = tex.ground(TEX.sand, p);
      const gEarth = tex.ground(TEX.earth, q);
      const gGrass = tex.ground(TEX.grass, p);
      const gTar = tex.ground(TEX.asphalt, p);
      const gPath = tex.ground(TEX.gravel, q);
      const vary = 0.82 + big * 0.2 + mid * 0.12;

      // Grass over the red laterite earth, bare where the slope is cut
      // Kerala: green nearly everywhere, the red earth only where a bank is cut or a rare bare patch
      const grassy = std.smoothstep(-0.85, -0.55, big + mid * 0.4) * (1 - std.smoothstep(0.5, 0.75, slope + mid * 0.05));
      const lawn = gGrass.color.xyz * std.mix(d.vec3f(1), d.vec3f(1.25, 1.1, 0.7), std.saturate(mid * 0.6 + 0.2));
      let color = std.mix(gEarth.color.xyz, lawn, grassy) * vary;
      let rough = std.mix(gEarth.rough, gGrass.rough, grassy);
      let slopeXZ = std.mix(gEarth.slope, gGrass.slope, grassy);

      // Wet mud down the pond's banks
      const wet = 1 - std.smoothstep(0.1, 0.7, corner.world.y);
      color = std.mix(color, gEarth.color.xyz * MUD * 6.0, wet);
      rough = std.mix(rough, 0.3, wet);

      // Inside the compound: swept red earth, darker where feet have packed it
      const court = inside(p, d.vec2f(-COMPOUND.x, COMPOUND.z0), d.vec2f(COMPOUND.x, COMPOUND.z1));
      color = std.mix(color, gSand.color.xyz * (0.85 + mid * 0.15 + big * 0.1), court);
      rough = std.mix(rough, gSand.rough, court);
      slopeXZ = std.mix(slopeXZ, gSand.slope, court);

      // Dry leaves fallen from the mango and jack trees, thicker outside the swept compound
      const drift = perlin2d.sample(p * 2.3 + d.vec2f(big * 3)) + mid * 0.3 - court * 0.25;
      const leaves = std.smoothstep(0.32, 0.5, drift) * (1 - std.smoothstep(0.15, 0.3, slope));
      const leafTone = std.mix(d.vec3f(0.16, 0.07, 0.025), d.vec3f(0.3, 0.17, 0.05), std.saturate(perlin2d.sample(p * 11) + 0.5));
      color = std.mix(color, leafTone, leaves * 0.75);
      rough = std.mix(rough, 0.75, leaves);

      // The town: swept red yards, murram lanes, leaf litter under the estates, the paddy
      const lu = land.at(p);
      // Yards swept every morning: smooth sand with the broom's arcs still in it
      const sweepArc = std.sin(std.length(p - std.floor(p / 3.0) * 3.0 - d.vec2f(1.5)) * 9.0 + mid * 4.0) * 0.05;
      const yardC = gSand.color.xyz * (0.92 + mid * 0.1 + sweepArc);
      color = std.mix(color, yardC, lu.x);
      rough = std.mix(rough, gSand.rough, lu.x);
      slopeXZ = std.mix(slopeXZ, gSand.slope * 0.5, lu.x);
      // Lanes of packed laterite gravel
      color = std.mix(color, gPath.color.xyz * (0.85 + mid * 0.1), lu.y);
      slopeXZ = std.mix(slopeXZ, gPath.slope, lu.y);
      // Under the rubber and areca, a deep carpet of fallen leaves, reddish and brown
      const litter = lu.z * std.saturate(0.75 + perlin2d.sample(p * 1.7) * 0.5);
      const litterTone = std.mix(d.vec3f(0.11, 0.045, 0.02), d.vec3f(0.24, 0.12, 0.045), std.saturate(perlin2d.sample(p * 7.0) + 0.5));
      color = std.mix(color, litterTone, litter);
      rough = std.mix(rough, 0.8, litter);
      // Paddy: young rice in rows, water glinting between, earthen bunds round each field
      // (only where there is paddy: no texture reads inside, so the branch is allowed)
      const pw = lu.w;
      const tr = land.trail(p);
      if (pw > 0) {
        const field = p - d.vec2f(PADDY.x, PADDY.z);
        const fu = field.x * 0.94 + field.y * 0.34 + perlin2d.sample(field * 0.05) * 3.0;
        const fv = field.y * 0.94 - field.x * 0.34 + perlin2d.sample(field * 0.05 + d.vec2f(7)) * 3.0;
        const cellU = std.abs(std.fract(fu / 14.0) - 0.5) * 14.0;
        const cellV = std.abs(std.fract(fv / 11.0) - 0.5) * 11.0;
        const bund = 1 - std.smoothstep(6.3, 6.6, std.max(cellU, cellV * 14.0 / 11.0));
        const rows = std.smoothstep(0.2, 0.8, std.abs(std.sin(fu * 18.0)));
        const ripe = std.saturate(perlin2d.sample(field * 0.02 + d.vec2f(3)) * 0.8 + 0.5);
        const rice = std.mix(d.vec3f(0.05, 0.1, 0.018), d.vec3f(0.11, 0.13, 0.03), ripe) * (0.8 + mid * 0.3);
        const water = (1 - rows) * (1 - ripe * 0.7);
        const paddyC = std.mix(std.mix(rice, d.vec3f(0.012, 0.016, 0.02), water * 0.7), lawn * 0.8, 1 - bund);
        color = std.mix(color, paddyC, pw);
        rough = std.mix(rough, std.mix(std.mix(0.7, 0.06, water), 0.85, 1 - bund), pw);
        slopeXZ = slopeXZ * (1 - pw * bund);
      }

      // The forest: a deep floor of fallen leaves under the trees, dark and damp, and the path
      // worn through it to red earth, roots and stones showing, mossy at its edges
      const rq = riverLocalGpu(p);
      if (tr.x + tr.y > 0) {
        // ...but not down the ravine under the bridge, where nobody walks
        const pathW = tr.x * (1 - (1 - std.smoothstep(8, 14, std.abs(rq.x))) * (1 - std.smoothstep(7.5, 9.5, std.abs(rq.y))));
        const floorTone = std.mix(d.vec3f(0.06, 0.035, 0.018), d.vec3f(0.17, 0.09, 0.035), std.saturate(perlin2d.sample(p * 3.1) * 0.8 + 0.5));
        const moss = std.smoothstep(0.2, 0.6, perlin2d.sample(p * 0.45 + d.vec2f(9)));
        const forestFloor = std.mix(floorTone, d.vec3f(0.04, 0.06, 0.02), moss * 0.5) * (0.8 + mid * 0.25);
        color = std.mix(color, forestFloor, tr.y);
        rough = std.mix(rough, 0.82, tr.y);
        slopeXZ = std.mix(slopeXZ, gEarth.slope * 1.3, tr.y);
        // The footpath: packed murram, the pale red-gold gravel of the temple path, with a worn
        // darker track down the middle and leaves blown onto it here and there
        const murram = gPath.color.xyz * d.vec3f(1.25, 1.12, 0.95) * (0.9 + mid * 0.15);
        const track = (1 - std.smoothstep(0.2, 0.6, std.abs(perlin2d.sample(p * 0.3)))) * 0.12;
        const blown = std.smoothstep(0.35, 0.6, perlin2d.sample(p * 2.3 + d.vec2f(7, 3))) * tr.y;
        const pathC = std.mix(murram * (1 - track), floorTone, blown * 0.6);
        color = std.mix(color, pathC, pathW);
        rough = std.mix(rough, 0.8, pathW);
        slopeXZ = std.mix(slopeXZ, gPath.slope, pathW);
      }
      // Bare wet earth: the brooks' muddy banks and the trampled elephant crossing
      const bare = tr.z;
      const mud = std.mix(d.vec3f(0.05, 0.03, 0.018), d.vec3f(0.09, 0.055, 0.03), std.saturate(mid + 0.5));
      color = std.mix(color, mud, bare);
      rough = std.mix(rough, 0.35, bare);
      slopeXZ = std.mix(slopeXZ, gEarth.slope * 0.6, bare);

      // The murram path from the road to the gate
      const path = std.saturate(inside(p, d.vec2f(-1.6, COMPOUND.z1), d.vec2f(1.6, ROAD.z - ROAD.half)));
      color = std.mix(color, gPath.color.xyz, path);
      slopeXZ = std.mix(slopeXZ, gPath.slope, path);

      // The road: chip-sealed tar with ragged murram shoulders and a faded centre line
      const across = acrossRoad(p);
      const road = 1 - std.smoothstep(ROAD.half - 0.3, ROAD.half + 0.2 + mid * 0.5, across);
      const shoulder = (1 - std.smoothstep(ROAD.half, ROAD.half + 1.4 + mid, across)) * (1 - road);
      color = std.mix(color, gPath.color.xyz * 0.8, shoulder * 0.85);
      slopeXZ = std.mix(slopeXZ, gPath.slope, shoulder * 0.85);
      const line = (1 - std.smoothstep(0.06, 0.09, across)) * std.step(0.0, std.sin(p.x * 1.4)) * 0.5;
      const tar = gTar.color.xyz * (0.9 + big * 0.2) + d.vec3f(0.35) * line * std.saturate(0.4 + mid);
      // Patches where the PWD filled potholes: squarish, blacker and smoother than the old tar
      const cell = std.floor(d.vec2f(p.x / 2.6, across / 1.3));
      const pick = std.fract(std.sin(std.dot(cell, d.vec2f(12.9898, 78.233))) * 43758.5453);
      const inCell = std.abs(d.vec2f(std.fract(p.x / 2.6), std.fract(across / 1.3)) - 0.5) * 2;
      const patch = std.step(0.86, pick) * (1 - std.smoothstep(0.55, 0.75, std.max(inCell.x, inCell.y) + mid * 0.15));
      const patched = std.mix(tar, gTar.color.xyz * 0.55, patch);
      color = std.mix(color, patched, road);
      rough = std.mix(rough, std.mix(gTar.rough, 0.45, patch), road);
      slopeXZ = std.mix(slopeXZ, gTar.slope * (1 - patch * 0.6), road);
      // An evening shower's leavings: shallow puddles where the tar dips toward its edges and
      // in the worn wheel tracks, black and mirror-still, catching the street lamps
      const dip = perlin2d.sample(p * 0.35 + d.vec2f(4.1, 0)) * 0.7 + mid * 0.3;
      const edge = std.smoothstep(ROAD.half - 1.6, ROAD.half - 0.2, across) + (1 - std.smoothstep(0.0, 0.5, std.abs(across - 1.6))) * 0.45;
      const puddle = road * std.smoothstep(0.06, 0.13, dip + edge * 0.4 - 0.25);
      const damp = road * std.smoothstep(-0.15, 0.08, dip + edge * 0.4 - 0.25) * (1 - puddle);
      color = color * (1 - damp * 0.35 - puddle * 0.85);
      rough = std.mix(rough, 0.28, damp);
      rough = std.mix(rough, 0.02, puddle);
      slopeXZ = slopeXZ * (1 - puddle);

      // Dry earth is matte: only the wet banks and the tar may shine with the sky
      rough = std.max(rough, std.mix(std.mix(0.88, 0.3, std.max(wet, road * 0.4)), 0.04, std.max(lu.w, puddle)) * (1 - puddle * 0.5));
      // Laterite stays red at night: a touch more of its own colour than the photo kept
      const lum = std.dot(color, d.vec3f(0.2126, 0.7152, 0.0722));
      color = std.mix(color, std.mix(d.vec3f(lum), color, 1.25), 1 - road);

      // The river's edges: wet stones and gravel at the waterline, dark with damp a little up
      // the banks, green with moss in between
      const edgeK = (1 - std.smoothstep(RIVER.length - 30, RIVER.length, std.abs(rq.x))) * (1 - std.smoothstep(WATER_HALF + 0.6, WATER_HALF + 2.4, std.abs(rq.y)));
      if (edgeK > 0) {
        const above = corner.world.y - riverLevelGpu(rq.x);
        const pebble = std.smoothstep(-0.1, 0.4, perlin2d.sample(p * 5.3)) * 0.6 + std.smoothstep(0.0, 0.5, perlin2d.sample(p * 1.7 + d.vec2f(5))) * 0.4;
        const stones = std.mix(d.vec3f(0.05, 0.05, 0.045), d.vec3f(0.16, 0.15, 0.13), pebble);
        const mossy = std.smoothstep(0.1, 0.6, perlin2d.sample(p * 0.9 + d.vec2f(2, 7))) * std.smoothstep(0.1, 0.5, above);
        const bank = std.mix(stones, d.vec3f(0.03, 0.05, 0.02), mossy * 0.7) * std.mix(0.55, 1.0, std.smoothstep(0.0, 0.6, above));
        color = std.mix(color, bank, edgeK);
        rough = std.mix(rough, std.mix(0.2, 0.65, std.smoothstep(0.0, 0.5, above)), edgeK);
        slopeXZ = slopeXZ * (1 - edgeK * 0.5);
      }

      // Relief fades into the distance, where the tiles are too fine to see
      const far = std.saturate(std.length(p) / 160);
      slopeXZ = slopeXZ * (1 - far);
      const normal = std.normalize(corner.normal + d.vec3f(slopeXZ.x, 0, slopeXZ.y));

      const lit = shading.shade(materials.glossy(color, rough), shading.pointAt(corner.world, normal));
      return Seen({ color: d.vec4f(lit, 1) });
    },
    color: passes.shaded,
    draw: (pass) => pass.draw(N * N * 6),
  };
  // The strip along the river, a metre a cell, following its bends
  const river: passes.Drawing<typeof Corner, d.Infer<typeof Seen>> = {
    ...drawing,
    label: 'river ground',
    at: (vertexIndex: number, _instanceIndex: number) => {
      'use gpu';
      const f = d.f32(vertexIndex);
      const cell = std.floor(f / 6);
      const corner = corners.$[d.u32(f - cell * 6)];
      const row = std.floor(cell / cols);
      const c = cell - row * cols + corner.x;
      const r = row + corner.y;
      const p = riverPoint(c, r);
      const shape = riverIn.$[d.u32(r * RV + c)];
      const world = d.vec3f(p.x, shape.w, p.y);
      return Corner({ position: cameras.toClip(world), world, normal: shape.xyz });
    },
    draw: (pass) => pass.draw(cols * rows * 6),
  };
  return { land: drawing, river };
}
